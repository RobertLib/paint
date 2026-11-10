/* ==========================================================================
   Undo / redo.

   Every entry is a command with undo()/redo() closures, so cheap pixel edits
   and structural edits share one stack. Memory is what limits history on big
   photos, so entries are frugal:

   - pixel edits keep only the rectangle that changed, when the caller knows
     it (strokes, selections), otherwise the whole target;
   - whole bitmaps are kept in a shared, reference-counted store keyed by
     (layer id, content version): ten structural steps over the same layers
     hold each layer once, not twenty times;
   - selections are immutable, so entries keep references to them.

   The oldest entries are dropped once the stack outgrows the budget.

   Live sessions (an adjustment preview, a free transform, an open text box)
   register here. Before any edit is recorded they are settled — their result
   kept — so an edit can never be recorded on top of a half-finished preview
   and later rolled back underneath newer work.
   ========================================================================== */

import {
  Layer,
  cloneText,
  copyCanvas,
  ctx2d,
  makeCanvas,
  nextVersion,
  releaseCanvas,
} from "./doc.js";
import { t } from "./i18n.js";
import { emit, markDirty, state } from "./state.js";

const MB = 1024 * 1024;
const MAX_STEPS = 80;
/** Phones get a smaller budget: their tabs are killed long before desktops'. */
const MAX_BYTES = (() => {
  const mem = navigator.deviceMemory;
  if (mem) return Math.max(128, Math.min(480, mem * 56)) * MB;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  return (coarse ? 160 : 320) * MB;
})();

/* ------------------------------ bitmap store ------------------------------ */

/** key → { canvas, refs, bytes, owned } */
const store = new Map();
let storeBytes = 0;

/**
 * Take a reference to the bitmap stored under `key`, creating it with
 * `make()` the first time. `owned` canvases are freed when the last
 * reference goes; borrowed ones (selections) are only accounted for.
 */
function retain(key, make, owned = true) {
  let e = store.get(key);
  if (!e) {
    const canvas = make();
    e = { canvas, refs: 0, bytes: canvas.width * canvas.height * 4, owned };
    store.set(key, e);
    storeBytes += e.bytes;
  }
  e.refs++;
  return e.canvas;
}

function release(key) {
  if (!key) return;
  const e = store.get(key);
  if (!e) return;
  if (--e.refs > 0) return;
  store.delete(key);
  storeBytes -= e.bytes;
  if (e.owned) releaseCanvas(e.canvas);
}

const stored = (key) => store.get(key)?.canvas || null;

const pixelKey = (id, v) => `p${id}@${v}`;
const maskKey = (id, v) => `m${id}@${v}`;

/* ------------------------------ live sessions ----------------------------- */

const sessions = new Set();
let settling = false;

/**
 * A live session: { settle(): keep its result, cancel(): undo it and return
 * true if that changed what the user sees, drop(): forget it (the document
 * was replaced), busy(): true while it holds uncommitted pixels }.
 */
export function registerSession(session) {
  sessions.add(session);
  return () => sessions.delete(session);
}

/** Commit every live session — called before anything is recorded. */
export function settleSessions() {
  if (settling) return;
  settling = true;
  try {
    for (const s of sessions) s.settle?.();
  } finally {
    settling = false;
  }
}

/** Undo every live session. True when something visible was cancelled. */
export function cancelSessions() {
  let any = false;
  for (const s of sessions) if (s.cancel?.()) any = true;
  return any;
}

/** The document is being replaced: forget sessions without touching pixels. */
export function dropSessions() {
  for (const s of sessions) s.drop?.();
}

/** True while a session holds uncommitted pixels (autosave waits). */
export const sessionsBusy = () => [...sessions].some((s) => s.busy?.());

/* --------------------------------- stack ---------------------------------- */

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

  /** Total memory held by history, shared bitmaps included. */
  get memory() {
    return this.bytes + storeBytes;
  }

  _drop(entry) {
    this.bytes -= entry.bytes || 0;
    entry.dispose?.();
  }

  reset() {
    for (const entry of this.stack) this._drop(entry);
    this.stack = [];
    this.index = -1;
    this.bytes = 0;
    emit("history", this);
  }

  push(entry) {
    // drop anything the user had undone past this point
    while (this.stack.length - 1 > this.index) this._drop(this.stack.pop());
    this.stack.push(entry);
    this.bytes += entry.bytes || 0;
    this.index = this.stack.length - 1;

    while (
      this.stack.length > MAX_STEPS ||
      (this.memory > MAX_BYTES && this.stack.length > 1)
    ) {
      this._drop(this.stack.shift());
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
 * Find a paint target again by id — layers can be replaced by structural
 * undo, so closures never hold on to a Layer object.
 */
function resolveTarget(doc, id, isMask) {
  const layer = doc.layers.find((l) => l.id === id);
  if (!layer) return null;
  return isMask ? layer.maskTarget : layer;
}

const hostOf = (target) => (target.isMask ? target.layer : target);
const versionOf = (target) =>
  target.isMask ? target.layer.maskVersion : target.pixelVersion;

/** Mark the target's content as the known version `v` (it was restored). */
function setVersion(target, v) {
  const host = hostOf(target);
  host.version = nextVersion();
  if (target.isMask) host.maskVersion = v;
  else host.pixelVersion = v;
}

function afterRestore(doc) {
  doc.invalidate();
  emit("layers", doc);
}

/** Put back a whole stored bitmap. */
function restoreFull(doc, id, isMask, key, version, text) {
  const target = resolveTarget(doc, id, isMask);
  const src = stored(key);
  if (!target || !src) return;
  if (src.width !== target.width || src.height !== target.height) {
    const copy = copyCanvas(src);
    if (isMask) target.layer.restoreMask(copy, version);
    else target.restorePixels(copy, version);
  } else {
    const c = target.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "copy";
    c.drawImage(src, 0, 0);
    c.restore();
    setVersion(target, version);
  }
  if (!isMask) target.text = cloneText(text);
  afterRestore(doc);
}

/** Put back one rectangle. */
function restorePatch(doc, id, isMask, patch, r, version, text) {
  const target = resolveTarget(doc, id, isMask);
  if (!target) return;
  const c = target.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = "source-over";
  c.clearRect(r.x, r.y, r.w, r.h);
  c.drawImage(patch, r.x, r.y);
  c.restore();
  setVersion(target, version);
  if (!isMask) target.text = cloneText(text);
  afterRestore(doc);
}

function cropCanvas(src, r) {
  const out = makeCanvas(r.w, r.h);
  ctx2d(out).drawImage(src, -r.x, -r.y);
  return out;
}

/** Integer rectangle inside the target, or null when it covers (almost) all. */
function patchRect(rect, w, h) {
  if (!rect) return null;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const rw = Math.min(w, Math.ceil(rect.x + rect.w)) - x;
  const rh = Math.min(h, Math.ceil(rect.y + rect.h)) - y;
  if (rw <= 0 || rh <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  // two patches cost more than one shared full copy past this point
  if (rw * rh > w * h * 0.45) return null;
  return { x, y, w: rw, h: rh };
}

/**
 * A pixel edit turns an editable text layer into plain pixels. The text
 * parameters travel with the undo entry so undo makes it editable again.
 */
function takeText(target) {
  if (target.isMask || !target.text) return null;
  const text = target.text;
  target.text = null;
  return text;
}

/**
 * Begin an edit of one paint target (a layer or a layer mask). Exactly one of
 * commit(), rollback() or dispose() should follow.
 *
 * Without `rect`, `before` is a read-only copy of the whole target as it was,
 * and commit(label, rect) may still narrow what is kept. With `rect` (the
 * document-space area the edit can touch) only that area is copied at all.
 */
export function beginPixelEdit(target = state.doc?.target, { rect = null } = {}) {
  settleSessions();
  const doc = state.doc;
  const id = target.id;
  const isMask = !!target.isMask;
  const v0 = versionOf(target);
  const fixed = rect ? patchRect(rect, target.width, target.height) : null;
  const key0 = fixed ? null : (isMask ? maskKey : pixelKey)(id, v0);
  const before = key0 ? retain(key0, () => copyCanvas(target.canvas)) : null;
  const beforePatch = fixed && fixed.w > 0 ? cropCanvas(target.canvas, fixed) : null;
  const text = takeText(target);
  let done = false;

  const cleanup = () => {
    release(key0);
    if (beforePatch) releaseCanvas(beforePatch);
  };

  const pushPatch = (label, r, bp, now, v1) => {
    const ap = cropCanvas(now.canvas, r);
    history.push({
      label,
      bytes: r.w * r.h * 8,
      undo: () => restorePatch(doc, id, isMask, bp, r, v0, text),
      redo: () => restorePatch(doc, id, isMask, ap, r, v1, null),
      dispose: () => {
        releaseCanvas(bp);
        releaseCanvas(ap);
      },
    });
  };

  return {
    before,
    commit(label, area = null) {
      if (done) return false;
      done = true;
      const now = resolveTarget(doc, id, isMask) || target;
      const v1 = versionOf(now);
      const nothing = v1 === v0 || (fixed && fixed.w === 0);
      if (nothing) {
        // nothing was drawn: keep the text editable and record nothing
        if (text) now.text = text;
        cleanup();
        return false;
      }
      if (text) emit("toast", { msg: t("Text layer converted to pixels"), kind: "info" });
      if (fixed) {
        pushPatch(label, fixed, beforePatch, now, v1);
        return true;
      }
      const r = patchRect(area, now.width, now.height);
      if (r && r.w > 0 && before.width === now.width && before.height === now.height) {
        const bp = cropCanvas(before, r);
        release(key0);
        pushPatch(label, r, bp, now, v1);
        return true;
      }
      const key1 = (isMask ? maskKey : pixelKey)(id, v1);
      retain(key1, () => copyCanvas(now.canvas));
      history.push({
        label,
        bytes: 0,
        undo: () => restoreFull(doc, id, isMask, key0, v0, text),
        redo: () => restoreFull(doc, id, isMask, key1, v1, null),
        dispose: () => {
          release(key0);
          release(key1);
        },
      });
      return true;
    },
    /** Put the pixels back as they were and record nothing. */
    rollback() {
      if (done) return;
      done = true;
      if (fixed) {
        if (beforePatch) restorePatch(doc, id, isMask, beforePatch, fixed, v0, text);
        else if (text) target.text = text;
      } else {
        restoreFull(doc, id, isMask, key0, v0, text);
      }
      cleanup();
    },
    /** Keep the pixels as they are, record nothing. */
    dispose() {
      if (done) return;
      done = true;
      cleanup();
    },
  };
}

/**
 * Run `fn` and record the pixel change of a single paint target. `rect`, when
 * given, bounds everything `fn` may change (only that area is copied).
 * Returns whatever `fn` returned.
 */
export function editPixels(label, fn, target = state.doc?.target, rect = null) {
  settleSessions();
  const doc = state.doc;
  if (!doc || !target) return undefined;
  const edit = beginPixelEdit(target, { rect });
  let result;
  try {
    result = fn(target);
  } finally {
    edit.commit(label);
  }
  return result;
}

/* ------------------------------ layer records ----------------------------- */

/** Everything about one layer, with its bitmaps taken from the shared store. */
function captureLayer(l) {
  const pk = pixelKey(l.id, l.pixelVersion);
  retain(pk, () => copyCanvas(l.canvas));
  let mk = null;
  if (l.mask) {
    mk = maskKey(l.id, l.maskVersion);
    retain(mk, () => copyCanvas(l.mask));
  }
  return {
    id: l.id,
    name: l.name,
    visible: l.visible,
    opacity: l.opacity,
    blend: l.blend,
    locked: l.locked,
    maskEnabled: l.maskEnabled,
    editMask: l.editMask,
    text: cloneText(l.text),
    pk,
    pv: l.pixelVersion,
    mk,
    mv: l.maskVersion,
  };
}

function releaseLayer(rec) {
  release(rec.pk);
  release(rec.mk);
}

/** Make `layer` match a record, copying bitmaps only where they differ. */
function applyLayer(layer, rec) {
  const pixels = stored(rec.pk);
  if (pixels && (layer.pixelVersion !== rec.pv || layer.canvas.width !== pixels.width || layer.canvas.height !== pixels.height)) {
    layer.restorePixels(copyCanvas(pixels), rec.pv);
  }
  if (rec.mk) {
    const mask = stored(rec.mk);
    if (mask && (!layer.mask || layer.maskVersion !== rec.mv || layer.mask.width !== mask.width || layer.mask.height !== mask.height)) {
      layer.restoreMask(copyCanvas(mask), rec.mv);
    }
  } else if (layer.mask) {
    layer.restoreMask(null, nextVersion());
  }
  layer.name = rec.name;
  layer.visible = rec.visible;
  layer.opacity = rec.opacity;
  layer.blend = rec.blend;
  layer.locked = rec.locked;
  layer.maskEnabled = rec.maskEnabled;
  layer.editMask = !!(rec.editMask && rec.mk);
  layer.text = cloneText(rec.text);
  layer.version = nextVersion();
}

function captureSelection(sel) {
  if (!sel) return null;
  const key = `s${sel.uid}`;
  retain(key, () => sel.canvas, false);
  return { key, sel };
}

const releaseSelection = (s) => s && release(s.key);

/* ---------------------------- structural edits ---------------------------- */

function captureDoc(doc) {
  return {
    width: doc.width,
    height: doc.height,
    name: doc.name,
    activeIndex: doc.activeIndex,
    sel: captureSelection(doc.selection),
    layers: doc.layers.map(captureLayer),
  };
}

function releaseDoc(snap) {
  for (const rec of snap.layers) releaseLayer(rec);
  releaseSelection(snap.sel);
}

/**
 * Bring the document back to a snapshot. Layer objects that still exist are
 * updated in place (and keep their bitmaps when the content is unchanged), so
 * references held by the UI stay valid and undoing "New layer" copies nothing.
 */
function restoreDoc(doc, snap) {
  doc.setSize(snap.width, snap.height);
  doc.name = snap.name;
  const byId = new Map(doc.layers.map((l) => [l.id, l]));
  doc.layers = snap.layers.map((rec) => {
    let layer = byId.get(rec.id);
    if (!layer) {
      layer = new Layer(1, 1, { name: rec.name });
      layer.id = rec.id;
      layer.pixelVersion = -1;
    }
    applyLayer(layer, rec);
    return layer;
  });
  doc.activeIndex = Math.max(0, Math.min(snap.activeIndex, doc.layers.length - 1));
  doc.selection = snap.sel ? snap.sel.sel : null;
  doc.clearFloating();
  doc.invalidate();
  emit("layers", doc);
  emit("selection", doc);
  emit("doc", { reason: "restore" });
}

/**
 * Snapshot the whole document now and decide later what to do with it — used
 * by gestures (crop) and commands that change structure.
 */
export function beginEdit() {
  settleSessions();
  const doc = state.doc;
  const before = captureDoc(doc);
  let done = false;
  return {
    commit(label) {
      if (done) return;
      done = true;
      const after = captureDoc(doc);
      history.push({
        label,
        bytes: 0,
        undo: () => restoreDoc(doc, before),
        redo: () => restoreDoc(doc, after),
        dispose: () => {
          releaseDoc(before);
          releaseDoc(after);
        },
      });
    },
    rollback() {
      if (done) return;
      done = true;
      restoreDoc(doc, before);
      releaseDoc(before);
    },
    dispose() {
      if (done) return;
      done = true;
      releaseDoc(before);
    },
  };
}

/**
 * Run `fn` and record a document snapshot on both sides. Used for layer
 * management, canvas geometry and anything that changes more than one layer.
 */
export function editDoc(label, fn) {
  settleSessions();
  const doc = state.doc;
  if (!doc) return undefined;
  const edit = beginEdit();
  let result;
  try {
    result = fn(doc);
  } finally {
    edit.commit(label);
  }
  return result;
}

/**
 * One layer's pixels, mask, text and the selection — for gestures that move
 * or transform a layer (and carry the selection with it). Much cheaper than
 * a document snapshot on tall stacks.
 */
export function beginLayerEdit(layer = state.doc?.active) {
  settleSessions();
  const doc = state.doc;
  const id = layer.id;
  const before = captureLayer(layer);
  const selBefore = captureSelection(doc.selection);
  let done = false;

  const apply = (rec, sel) => {
    const l = doc.layers.find((x) => x.id === id);
    if (l) applyLayer(l, rec);
    doc.selection = sel ? sel.sel : null;
    doc.clearFloating();
    doc.invalidate();
    emit("layers", doc);
    emit("selection", doc);
  };

  return {
    commit(label) {
      if (done) return;
      done = true;
      const l = doc.layers.find((x) => x.id === id) || layer;
      const after = captureLayer(l);
      const selAfter = captureSelection(doc.selection);
      history.push({
        label,
        bytes: 0,
        undo: () => apply(before, selBefore),
        redo: () => apply(after, selAfter),
        dispose: () => {
          releaseLayer(before);
          releaseLayer(after);
          releaseSelection(selBefore);
          releaseSelection(selAfter);
        },
      });
    },
    rollback() {
      if (done) return;
      done = true;
      apply(before, selBefore);
      releaseLayer(before);
      releaseSelection(selBefore);
    },
    dispose() {
      if (done) return;
      done = true;
      releaseLayer(before);
      releaseSelection(selBefore);
    },
  };
}

/**
 * Record a selection-only change (no pixels touched) — cheap, selections are
 * immutable so both sides are references. Nothing is recorded when `fn`
 * leaves the selection as it was.
 */
export function editSelection(label, fn) {
  settleSessions();
  const doc = state.doc;
  if (!doc) return;
  const before = doc.selection;
  fn(doc);
  const after = doc.selection;
  if (before === after) return;

  const b = captureSelection(before);
  const a = captureSelection(after);
  const apply = (s) => {
    doc.selection = s ? s.sel : null;
    emit("selection", doc);
  };

  history.push({
    label,
    bytes: 0,
    undo: () => apply(b),
    redo: () => apply(a),
    dispose: () => {
      releaseSelection(b);
      releaseSelection(a);
    },
  });
  emit("selection", doc);
}

/** Record a change of layer properties only (no bitmaps). */
export function pushCommand(entry) {
  settleSessions();
  history.push(entry);
}
