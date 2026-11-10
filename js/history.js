/* ==========================================================================
   Undo / redo.

   Every entry is a command with undo()/redo() closures, so both cheap pixel
   edits (one layer, before/after bitmap) and structural edits (full document
   snapshot) share one stack. Memory is capped: the oldest entries are dropped
   once the stack outgrows the budget, which keeps large documents usable.
   ========================================================================== */

import { copyCanvas } from "./doc.js";
import { t } from "./i18n.js";
import { emit, markDirty, state } from "./state.js";

const MAX_STEPS = 60;
const MAX_BYTES = 300 * 1024 * 1024;

class History {
  constructor() {
    this.stack = [];
    this.index = -1;
    this.bytes = 0;
  }

  get canUndo() {
    return this.index >= 0;
  }

  get canRedo() {
    return this.index < this.stack.length - 1;
  }

  get undoLabel() {
    return this.canUndo ? this.stack[this.index].label : null;
  }

  get redoLabel() {
    return this.canRedo ? this.stack[this.index + 1].label : null;
  }

  reset() {
    this.stack = [];
    this.index = -1;
    this.bytes = 0;
    emit("history", this);
  }

  push(entry) {
    // drop anything the user had redone past this point
    for (let i = this.stack.length - 1; i > this.index; i--) {
      this.bytes -= this.stack[i].bytes || 0;
      this.stack.pop();
    }
    this.stack.push(entry);
    this.bytes += entry.bytes || 0;
    this.index = this.stack.length - 1;

    while (
      this.stack.length > MAX_STEPS ||
      (this.bytes > MAX_BYTES && this.stack.length > 1)
    ) {
      const dropped = this.stack.shift();
      this.bytes -= dropped.bytes || 0;
      this.index--;
    }

    markDirty(true);
    emit("history", this);
  }

  undo() {
    if (!this.canUndo) return false;
    const entry = this.stack[this.index--];
    entry.undo();
    markDirty(true);
    emit("history", this);
    emit("doc", { reason: "undo", label: entry.label });
    return true;
  }

  redo() {
    if (!this.canRedo) return false;
    const entry = this.stack[++this.index];
    entry.redo();
    markDirty(true);
    emit("history", this);
    emit("doc", { reason: "redo", label: entry.label });
    return true;
  }
}

export const history = new History();

/* ------------------------------ pixel edits ------------------------------ */

/**
 * Find a paint target again by id — layers are replaced wholesale by snapshot
 * undo, so closures must never hold on to a Layer object.
 */
function resolveTarget(doc, id, isMask) {
  const layer = doc.layers.find((l) => l.id === id);
  if (!layer) return null;
  return isMask ? layer.maskTarget : layer;
}

/**
 * A pixel edit turns an editable text layer into plain pixels. The text
 * parameters travel with the undo entry so undo makes it editable again.
 */
function rasterizeText(target) {
  if (target.isMask || !target.text) return null;
  const text = target.text;
  target.text = null;
  emit("toast", { msg: t("Text layer converted to pixels"), kind: "info" });
  return text;
}

function restorer(doc, id, isMask) {
  return (source, text) => {
    const target = resolveTarget(doc, id, isMask);
    if (!target) return;
    const c = target.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "copy";
    c.drawImage(source, 0, 0);
    c.restore();
    if (!isMask) target.text = text ? { ...text, color: { ...text.color } } : null;
    target.touch();
    doc.invalidate();
    emit("layers", doc);
  };
}

/**
 * Run `fn` and record the pixel difference of a single paint target (a layer
 * or a layer mask). Returns whatever `fn` returned.
 */
export function editPixels(label, fn, layer = state.doc?.target) {
  const doc = state.doc;
  if (!doc || !layer) return undefined;

  const before = copyCanvas(layer.canvas);
  const text = rasterizeText(layer);
  const result = fn(layer);
  const after = copyCanvas(layer.canvas);
  const bytes = (before.width * before.height * 4) * 2;
  const restore = restorer(doc, layer.id, !!layer.isMask);

  history.push({
    label,
    bytes,
    undo: () => restore(before, text),
    redo: () => restore(after, null),
  });
  return result;
}

/**
 * For edits that mutate a target progressively (drag operations): capture
 * the "before" bitmap up front, then commit once the gesture ends.
 */
export function beginPixelEdit(layer = state.doc?.target) {
  const doc = state.doc;
  const before = copyCanvas(layer.canvas);
  const text = rasterizeText(layer);
  const restore = restorer(doc, layer.id, !!layer.isMask);

  return {
    before,
    commit(label) {
      const after = copyCanvas(layer.canvas);
      history.push({
        label,
        bytes: before.width * before.height * 8,
        undo: () => restore(before, text),
        redo: () => restore(after, null),
      });
    },
    rollback() {
      restore(before, text);
    },
  };
}

/* ---------------------------- structural edits ---------------------------- */

function restoreSnapshot(doc, snap) {
  doc.restoreSnapshot(snap);
  emit("layers", doc);
  emit("selection", doc);
  emit("doc", { reason: "restore" });
}

/**
 * Snapshot the whole document now and decide later what to do with it — used
 * by gestures (move, crop) that change pixels and structure together.
 */
export function beginEdit() {
  const doc = state.doc;
  const before = doc.snapshot();
  return {
    commit(label) {
      const after = doc.snapshot();
      history.push({
        label,
        bytes: before.bytes + after.bytes,
        undo: () => restoreSnapshot(doc, before),
        redo: () => restoreSnapshot(doc, after),
      });
    },
    rollback() {
      restoreSnapshot(doc, before);
    },
  };
}

/**
 * Run `fn` and record a full document snapshot on both sides. Used for layer
 * management, canvas geometry and anything that changes more than one layer.
 */
export function editDoc(label, fn) {
  const doc = state.doc;
  if (!doc) return undefined;
  const edit = beginEdit();
  const result = fn(doc);
  edit.commit(label);
  return result;
}

/**
 * Record a selection-only change (no pixels touched) — cheap, so selections
 * stay undoable without snapshotting bitmaps.
 */
export function editSelection(label, fn) {
  const doc = state.doc;
  if (!doc) return;
  const before = doc.selection ? doc.selection.clone() : null;
  fn(doc);
  const after = doc.selection ? doc.selection.clone() : null;

  const apply = (sel) => {
    doc.selection = sel ? sel.clone() : null;
    emit("selection", doc);
  };

  history.push({
    label,
    bytes: (before ? before.canvas.width * before.canvas.height : 0) +
      (after ? after.canvas.width * after.canvas.height : 0),
    undo: () => apply(before),
    redo: () => apply(after),
  });
  emit("selection", doc);
}
