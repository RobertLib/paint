/* ==========================================================================
   Undo / redo.

   Every entry is a command with undo()/redo() closures, so cheap pixel edits
   and structural edits share one stack. Memory is what limits history on big
   photos, so entries are frugal:

   - pixel edits keep only the rectangle that changed, when the caller knows
     it (strokes, selections), otherwise the whole target — and an edit that
     changed no pixel at all is not recorded;
   - structural edits (layers, masks, geometry) keep bitmaps only of the
     layers they change. A layer they leave alone is recorded by its content
     version: history is linear, so whenever such a step is undone or redone
     that layer is back at exactly that version and needs no copy;
   - whole bitmaps are kept in a shared, reference-counted store keyed by
     (layer id, content version), so a bitmap is held once however many
     entries need it;
   - selections are kept compactly: the selected area's alpha at one byte a
     pixel (a plain rectangle as just its bounds), rebuilt when restored.

   This relies on every content version being exact: an entry that puts
   pixels back also puts back the versions they had.

   The oldest entries are dropped once the stack outgrows the budget.

   Live sessions (an adjustment preview, a free transform, an open text box)
   register here. Before any edit is recorded they are settled — their result
   kept — so an edit can never be recorded on top of a half-finished preview
   and later rolled back underneath newer work.
   ========================================================================== */

import {
  Layer,
  Selection,
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

/* --------------------------------- store ---------------------------------- */

/** key → { value, refs, bytes, free } */
const store = new Map();
let storeBytes = 0;

/**
 * Take a reference to the value stored under `key`, creating it with
 * `make()` — which returns { value, bytes, free? } — the first time.
 */
function retainEntry(key, make) {
  let e = store.get(key);
  if (!e) {
    e = { refs: 0, free: null, ...make() };
    store.set(key, e);
    storeBytes += e.bytes;
  }
  e.refs++;
  return e.value;
}

/**
 * A bitmap in the store. `owned` canvases are freed when the last reference
 * goes; borrowed ones (canvases a layer no longer uses) are only accounted
 * for and left to the garbage collector.
 */
function retainCanvas(key, make, owned = true) {
  return retainEntry(key, () => {
    const canvas = make();
    return {
      value: canvas,
      bytes: canvas.width * canvas.height * 4,
      free: owned ? () => releaseCanvas(canvas) : null,
    };
  });
}

function release(key) {
  if (!key) return;
  const e = store.get(key);
  if (!e) return;
  if (--e.refs > 0) return;
  store.delete(key);
  storeBytes -= e.bytes;
  e.free?.();
}

const stored = (key) => store.get(key)?.value || null;

/**
 * Give up one reference to a stored bitmap in exchange for a canvas with its
 * content that the caller may keep: the stored canvas itself when this was
 * the last reference (no copy — a rollback may run short of memory), a copy
 * otherwise.
 */
function takeCanvas(key) {
  const e = store.get(key);
  if (!e) return null;
  if (e.refs === 1) {
    store.delete(key);
    storeBytes -= e.bytes;
    return e.value;
  }
  e.refs--;
  return copyCanvas(e.value);
}

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

/**
 * Mark the target's content as the known version `v` (it was restored).
 * A pixel edit also bumps the mask's version (Layer.touch) without changing
 * the mask, so `mv`, when given, puts that one back too.
 */
function setVersion(target, v, mv) {
  const host = hostOf(target);
  host.version = nextVersion();
  if (target.isMask) host.maskVersion = v;
  else {
    host.pixelVersion = v;
    if (mv !== undefined) host.maskVersion = mv;
  }
}

function afterRestore(doc) {
  doc.invalidate();
  emit("layers", doc);
}

/** Put back a whole stored bitmap. */
function restoreFull(doc, id, isMask, key, version, text, mv) {
  const target = resolveTarget(doc, id, isMask);
  const src = stored(key);
  if (!target || !src) return;
  if (src.width !== target.width || src.height !== target.height) {
    const copy = copyCanvas(src);
    if (isMask) target.layer.restoreMask(copy, version);
    else {
      target.restorePixels(copy, version);
      if (mv !== undefined) target.maskVersion = mv;
    }
  } else {
    const c = target.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "copy";
    c.drawImage(src, 0, 0);
    c.restore();
    setVersion(target, version, mv);
  }
  if (!isMask) target.text = cloneText(text);
  afterRestore(doc);
}

/** Put back one rectangle. */
function restorePatch(doc, id, isMask, patch, r, version, text, mv) {
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
  setVersion(target, version, mv);
  if (!isMask) target.text = cloneText(text);
  afterRestore(doc);
}

function cropCanvas(src, r) {
  const out = makeCanvas(r.w, r.h);
  ctx2d(out).drawImage(src, -r.x, -r.y);
  return out;
}

/** The integer part of `rect` inside a w × h target ({0,0,0,0} when none). */
function clipRect(rect, w, h) {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const rw = Math.min(w, Math.ceil(rect.x + rect.w)) - x;
  const rh = Math.min(h, Math.ceil(rect.y + rect.h)) - y;
  if (rw <= 0 || rh <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  return { x, y, w: rw, h: rh };
}

/** Integer rectangle inside the target, or null when it covers (almost) all. */
function patchRect(rect, w, h) {
  if (!rect) return null;
  const r = clipRect(rect, w, h);
  // two patches cost more than one shared full copy past this point
  if (r.w * r.h > w * h * 0.45) return null;
  return r;
}

/**
 * True when the w × h area of canvas `a` at (ax, ay) holds the same pixels
 * as the area of `b` at (bx, by). Read in strips, stopping at the first
 * difference.
 */
function samePixels(a, ax, ay, b, bx, by, w, h) {
  if (w <= 0 || h <= 0) return true;
  const ca = a.getContext("2d");
  const cb = b.getContext("2d");
  const rows = Math.max(1, Math.floor((256 * 1024) / w));
  for (let y = 0; y < h; y += rows) {
    const n = Math.min(rows, h - y);
    const da = new Uint32Array(ca.getImageData(ax, ay + y, w, n).data.buffer);
    const db = new Uint32Array(cb.getImageData(bx, by + y, w, n).data.buffer);
    for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return false;
  }
  return true;
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
 *
 * commit() compares the pixels inside that area (or the whole target) with
 * what was there before: when nothing changed it records nothing, keeps an
 * editable text layer editable and leaves the content version as it was.
 */
export function beginPixelEdit(target = state.doc?.target, { rect = null } = {}) {
  settleSessions();
  const doc = state.doc;
  const id = target.id;
  const isMask = !!target.isMask;
  const v0 = versionOf(target);
  const m0 = isMask ? undefined : target.maskVersion;
  const fixed = rect ? patchRect(rect, target.width, target.height) : null;
  const key0 = fixed ? null : (isMask ? maskKey : pixelKey)(id, v0);
  const before = key0 ? retainCanvas(key0, () => copyCanvas(target.canvas)) : null;
  const beforePatch = fixed && fixed.w > 0 ? cropCanvas(target.canvas, fixed) : null;
  const text = takeText(target);
  let done = false;

  const cleanup = () => {
    release(key0);
    if (beforePatch) releaseCanvas(beforePatch);
  };

  /** Nothing visible changed: keep the text, the version, and record nothing. */
  const unchanged = (now) => {
    if (text) now.text = text;
    if (versionOf(now) !== v0) {
      setVersion(now, v0, m0);
      doc.invalidate();
    }
    cleanup();
    return false;
  };

  const pushPatch = (label, r, bp, ap, v1, m1) => {
    history.push({
      label,
      bytes: r.w * r.h * 8,
      undo: () => restorePatch(doc, id, isMask, bp, r, v0, text, m0),
      redo: () => restorePatch(doc, id, isMask, ap, r, v1, null, m1),
      dispose: () => {
        releaseCanvas(bp);
        releaseCanvas(ap);
      },
    });
  };

  /** commit() without the bookkeeping; may throw (out of memory). */
  const record = (label, area) => {
    const now = resolveTarget(doc, id, isMask) || target;
    const v1 = versionOf(now);
    const m1 = isMask ? undefined : now.maskVersion;
    if (v1 === v0 || (fixed && fixed.w === 0)) return unchanged(now);
    const converted = () => {
      if (text) emit("toast", { msg: t("Text layer converted to pixels"), kind: "info" });
    };
    if (fixed) {
      if (samePixels(beforePatch, 0, 0, now.canvas, fixed.x, fixed.y, fixed.w, fixed.h)) {
        return unchanged(now);
      }
      const ap = cropCanvas(now.canvas, fixed);
      converted();
      pushPatch(label, fixed, beforePatch, ap, v1, m1);
      return true;
    }
    const sameSize = before.width === now.width && before.height === now.height;
    if (sameSize) {
      const clip = area ? clipRect(area, now.width, now.height) : null;
      const cmp = clip && clip.w > 0 ? clip : { x: 0, y: 0, w: now.width, h: now.height };
      if (samePixels(before, cmp.x, cmp.y, now.canvas, cmp.x, cmp.y, cmp.w, cmp.h)) {
        return unchanged(now);
      }
    }
    const r = patchRect(area, now.width, now.height);
    if (r && r.w > 0 && sameSize) {
      const bp = cropCanvas(before, r);
      let ap;
      try {
        ap = cropCanvas(now.canvas, r);
      } catch (err) {
        releaseCanvas(bp);
        throw err;
      }
      release(key0);
      converted();
      pushPatch(label, r, bp, ap, v1, m1);
      return true;
    }
    const key1 = (isMask ? maskKey : pixelKey)(id, v1);
    retainCanvas(key1, () => copyCanvas(now.canvas));
    converted();
    history.push({
      label,
      bytes: 0,
      undo: () => restoreFull(doc, id, isMask, key0, v0, text, m0),
      redo: () => restoreFull(doc, id, isMask, key1, v1, null, m1),
      dispose: () => {
        release(key0);
        release(key1);
      },
    });
    return true;
  };

  const edit = {
    before,
    /**
     * Record the edit (true), or nothing when no pixel changed (false). If
     * recording fails — out of memory — the pixels are put back as they
     * were and the error is passed on.
     */
    commit(label, area = null) {
      if (done) return false;
      try {
        const recorded = record(label, area);
        done = true;
        return recorded;
      } catch (err) {
        edit.rollback();
        throw err;
      }
    },
    /** Put the pixels back as they were and record nothing. */
    rollback() {
      if (done) return;
      done = true;
      if (fixed) {
        if (beforePatch) restorePatch(doc, id, isMask, beforePatch, fixed, v0, text, m0);
        else {
          const now = resolveTarget(doc, id, isMask) || target;
          if (text) now.text = text;
          if (versionOf(now) !== v0) setVersion(now, v0, m0);
          afterRestore(doc);
        }
      } else {
        restoreFull(doc, id, isMask, key0, v0, text, m0);
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
  return edit;
}

/**
 * Run `fn` and record the pixel change of a single paint target. `rect`, when
 * given, bounds everything `fn` may change (only that area is copied).
 * Returns whatever `fn` returned. When `fn` throws, the target is put back as
 * it was, nothing is recorded and the error is passed on.
 */
export function editPixels(label, fn, target = state.doc?.target, rect = null) {
  settleSessions();
  const doc = state.doc;
  if (!doc || !target) return undefined;
  const edit = beginPixelEdit(target, { rect });
  let result;
  try {
    result = fn(target);
  } catch (err) {
    edit.rollback();
    throw err;
  }
  // (a commit that fails puts the pixels back itself)
  edit.commit(label);
  return result;
}

/* ------------------------------ layer records ----------------------------- */

/**
 * Everything about one layer except its bitmaps. `pk` / `mk` name the
 * stored pixels and mask once something keeps them; a record without them
 * means "the layer holds exactly this version" (see the top of the file).
 */
function describeLayer(l) {
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
    w: l.width,
    h: l.height,
    pv: l.pixelVersion,
    // a fresh empty layer needs no copy to be put back
    blank: l.blankVersion === l.pixelVersion,
    pk: null,
    hasMask: !!l.mask,
    mv: l.maskVersion,
    mk: null,
  };
}

/** Copy the layer's current pixels and/or mask into the store for `rec`. */
function keepCopies(rec, l, { pixels = true, mask = true } = {}) {
  // (a key is only noted once its reference is held: copying may fail)
  if (pixels && !rec.blank && !rec.pk) {
    const key = pixelKey(rec.id, rec.pv);
    retainCanvas(key, () => copyCanvas(l.canvas));
    rec.pk = key;
  }
  if (mask && rec.hasMask && !rec.mk) {
    const key = maskKey(rec.id, rec.mv);
    retainCanvas(key, () => copyCanvas(l.mask));
    rec.mk = key;
  }
}

function releaseLayer(rec) {
  release(rec.pk);
  release(rec.mk);
  rec.pk = rec.mk = null;
}

/** Forget the live objects a "before" record pointed at while it was open. */
function unlink(rec) {
  delete rec._canvas;
  delete rec._mask;
  delete rec._copied;
}

/**
 * Make `layer` match a record, copying bitmaps only where they differ. With
 * `take` (a rollback: the record is discarded afterwards) the record's own
 * bitmaps are handed to the layer instead of copied.
 */
function applyLayer(layer, rec, take = false) {
  const sizeOk = layer.canvas.width === rec.w && layer.canvas.height === rec.h;
  if (layer.pixelVersion !== rec.pv || !sizeOk) {
    let canvas = null;
    if (rec.blank) canvas = makeCanvas(rec.w, rec.h);
    else if (take && rec._canvas && !rec._copied) canvas = rec._canvas;
    else if (rec.pk && take) {
      canvas = takeCanvas(rec.pk);
      rec.pk = null;
    } else if (rec.pk && stored(rec.pk)) canvas = copyCanvas(stored(rec.pk));
    if (!canvas) {
      console.error("[paint] history: the pixels of a layer are missing");
      if (!sizeOk) canvas = makeCanvas(rec.w, rec.h);
    }
    if (canvas) layer.restorePixels(canvas, rec.pv);
  }
  if (rec.blank) layer.blankVersion = rec.pv;
  if (rec.hasMask) {
    const m = layer.mask;
    if (!m || layer.maskVersion !== rec.mv || m.width !== rec.w || m.height !== rec.h) {
      let canvas = null;
      if (take && rec._mask && !rec._copied) canvas = rec._mask;
      else if (rec.mk && take) {
        canvas = takeCanvas(rec.mk);
        rec.mk = null;
      } else if (rec.mk && stored(rec.mk)) canvas = copyCanvas(stored(rec.mk));
      if (canvas) layer.restoreMask(canvas, rec.mv);
      else console.error("[paint] history: the mask of a layer is missing");
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
  layer.editMask = !!(rec.editMask && rec.hasMask);
  layer.text = cloneText(rec.text);
  layer.version = nextVersion();
}

/* ------------------------------- selections ------------------------------- */

const weakRef = (o) => (typeof WeakRef === "function" ? new WeakRef(o) : null);

/**
 * A selection as history keeps it: the alpha of its covered area, one byte a
 * pixel — or only that area when it is a plain, fully selected rectangle.
 * The live object is remembered weakly and reused while it exists.
 */
function packSelection(sel) {
  const w = sel.canvas.width;
  const h = sel.canvas.height;
  const shape = sel.shape ? { ...sel.shape } : null;
  let b = null;
  let alpha = null;
  const r = shape?.type === "rect" ? shape : null;
  if (r && [r.x, r.y, r.w, r.h].every(Number.isInteger) && r.w > 0 && r.h > 0) {
    // drawn by fillRect on whole pixels: solid, no need to read it back
    b = { x: r.x, y: r.y, w: r.w, h: r.h };
  } else {
    b = sel.coverBounds;
    if (b) {
      const d = sel.ctx.getImageData(b.x, b.y, b.w, b.h).data;
      alpha = new Uint8Array(b.w * b.h);
      let solid = true;
      for (let i = 0; i < alpha.length; i++) {
        const a = d[i * 4 + 3];
        alpha[i] = a;
        if (a !== 255) solid = false;
      }
      if (solid) alpha = null;
    }
  }
  return {
    value: { w, h, b, alpha, shape, ref: weakRef(sel) },
    bytes: (alpha ? alpha.length : 0) + 64,
  };
}

function unpackSelection(data) {
  const live = data.ref?.deref();
  if (live) return live;
  const s = new Selection(data.w, data.h);
  const b = data.b;
  if (b && !data.alpha) {
    s.ctx.fillStyle = "#fff";
    s.ctx.fillRect(b.x, b.y, b.w, b.h);
  } else if (b) {
    const img = s.ctx.createImageData(b.w, b.h);
    const d = img.data;
    const a = data.alpha;
    for (let i = 0; i < a.length; i++) {
      const j = i * 4;
      d[j] = d[j + 1] = d[j + 2] = 255;
      d[j + 3] = a[i];
    }
    s.ctx.putImageData(img, b.x, b.y);
  }
  s.shape = data.shape ? { ...data.shape } : null;
  data.ref = weakRef(s);
  return s;
}

function captureSelection(sel) {
  if (!sel) return null;
  const key = `s${sel.uid}`;
  return { key, data: retainEntry(key, () => packSelection(sel)) };
}

const releaseSelection = (s) => s && release(s.key);
const selectionOf = (s) => (s ? unpackSelection(s.data) : null);

/* ---------------------------- structural edits ---------------------------- */

/**
 * The document before a structural edit. Layers in `changes` (every layer
 * when it is null) are copied at once: the edit may draw into them. The
 * others are only described, with a pointer to their current canvases —
 * finishBefore() decides once the edit is done what it needs of them.
 */
function captureBefore(doc, changes) {
  const changing = changes ? new Set(changes) : null;
  const snap = { width: doc.width, height: doc.height, activeIndex: doc.activeIndex, sel: null, layers: [] };
  try {
    for (const l of doc.layers) {
      const rec = describeLayer(l);
      rec._canvas = l.canvas;
      rec._mask = l.mask;
      snap.layers.push(rec);
      if (!changing || changing.has(l)) {
        rec._copied = true;
        keepCopies(rec, l);
      }
    }
    snap.sel = captureSelection(doc.selection);
  } catch (err) {
    releaseDoc(snap);
    throw err;
  }
  return snap;
}

/**
 * After the edit: keep for the "before" side only what changed. A layer that
 * still has the same pixel (mask) version needs no bitmap. One whose pixels
 * did change was either copied up front or still sits, untouched, in the
 * canvas it had: the edit replaced that canvas or removed the layer.
 */
function finishBefore(doc, snap) {
  const live = new Map(doc.layers.map((l) => [l.id, l]));
  for (const rec of snap.layers) {
    const l = live.get(rec.id);
    if (l && l.pixelVersion === rec.pv) {
      release(rec.pk);
      rec.pk = null;
    } else if (!rec.blank && !rec.pk) {
      if (l && l.canvas === rec._canvas) {
        console.error("[paint] history: a layer was drawn into without being declared");
      }
      rec.pk = pixelKey(rec.id, rec.pv);
      retainCanvas(rec.pk, () => rec._canvas, false);
    }
    if (rec.hasMask) {
      if (l && l.mask && l.maskVersion === rec.mv) {
        release(rec.mk);
        rec.mk = null;
      } else if (!rec.mk) {
        if (l && l.mask === rec._mask) {
          console.error("[paint] history: a mask was drawn into without being declared");
        }
        rec.mk = maskKey(rec.id, rec.mv);
        retainCanvas(rec.mk, () => rec._mask, false);
      }
    }
    unlink(rec);
  }
}

/** The document after a structural edit: copies of what it changed or added. */
function captureAfter(doc, before) {
  const prev = new Map(before.layers.map((r) => [r.id, r]));
  const snap = { width: doc.width, height: doc.height, activeIndex: doc.activeIndex, sel: null, layers: [] };
  try {
    for (const l of doc.layers) {
      const rec = describeLayer(l);
      snap.layers.push(rec);
      const b = prev.get(l.id);
      const samePx = !!b && b.pv === rec.pv;
      const sameMask = !rec.hasMask || (!!b && b.hasMask && b.mv === rec.mv);
      keepCopies(rec, l, { pixels: !samePx, mask: !sameMask });
    }
    snap.sel = captureSelection(doc.selection);
  } catch (err) {
    releaseDoc(snap);
    throw err;
  }
  return snap;
}

function releaseDoc(snap) {
  for (const rec of snap.layers) {
    releaseLayer(rec);
    unlink(rec);
  }
  releaseSelection(snap.sel);
}

/**
 * Bring the document back to a snapshot. Layer objects that still exist are
 * updated in place (and keep their bitmaps when the content is unchanged), so
 * references held by the UI stay valid and undoing "New layer" copies nothing.
 * The document's name is not part of it: renaming is no step of its own.
 */
function restoreDoc(doc, snap, take = false) {
  doc.setSize(snap.width, snap.height);
  const byId = new Map(doc.layers.map((l) => [l.id, l]));
  doc.layers = snap.layers.map((rec) => {
    let layer = byId.get(rec.id);
    if (!layer) {
      layer = new Layer(1, 1, { name: rec.name });
      layer.id = rec.id;
      layer.pixelVersion = -1;
      layer.maskVersion = -1;
    }
    applyLayer(layer, rec, take);
    return layer;
  });
  doc.activeIndex = Math.max(0, Math.min(snap.activeIndex, doc.layers.length - 1));
  doc.selection = selectionOf(snap.sel);
  doc.clearFloating();
  doc.invalidate();
  emit("layers", doc);
  emit("selection", doc);
  emit("doc", { reason: "restore" });
}

/**
 * Snapshot the document now and decide later what to do with it — used by
 * commands that change structure (see editDoc for `changes`).
 */
export function beginEdit({ changes = null } = {}) {
  settleSessions();
  const doc = state.doc;
  const before = captureBefore(doc, changes);
  let done = false;
  const edit = {
    /**
     * Record the edit. If that fails (out of memory) the document is put
     * back as it was and the error is passed on.
     */
    commit(label) {
      if (done) return;
      let after;
      try {
        finishBefore(doc, before);
        after = captureAfter(doc, before);
      } catch (err) {
        edit.rollback();
        throw err;
      }
      done = true;
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
      try {
        restoreDoc(doc, before, true);
      } finally {
        releaseDoc(before);
      }
    },
    dispose() {
      if (done) return;
      done = true;
      releaseDoc(before);
    },
  };
  return edit;
}

/**
 * Run `fn` and record a document snapshot on both sides. Used for layer
 * management, canvas geometry and anything that changes more than one layer.
 *
 * `changes` lists the layers whose existing canvases `fn` draws into (their
 * pixels or mask); every other layer may be reordered, removed, given new
 * canvases (adopt, setMask) or left alone, and is never copied unless it
 * changed. Without `changes` every layer counts as drawn into — always
 * correct, but it copies every layer the store does not hold yet.
 *
 * When `fn` throws, the document is put back as it was, nothing is recorded
 * and the error is passed on.
 */
export function editDoc(label, fn, { changes = null } = {}) {
  settleSessions();
  const doc = state.doc;
  if (!doc) return undefined;
  const edit = beginEdit({ changes });
  let result;
  try {
    result = fn(doc);
  } catch (err) {
    edit.rollback();
    throw err;
  }
  // (a commit that fails puts the document back itself)
  edit.commit(label);
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
  const before = describeLayer(layer);
  keepCopies(before, layer);
  let selBefore;
  try {
    selBefore = captureSelection(doc.selection);
  } catch (err) {
    releaseLayer(before);
    throw err;
  }
  let done = false;

  const apply = (rec, sel, take = false) => {
    const l = doc.layers.find((x) => x.id === id);
    if (l) applyLayer(l, rec, take);
    doc.selection = selectionOf(sel);
    doc.clearFloating();
    doc.invalidate();
    emit("layers", doc);
    emit("selection", doc);
  };

  const edit = {
    /** Record the gesture; if that fails, put everything back and throw. */
    commit(label) {
      if (done) return;
      const l = doc.layers.find((x) => x.id === id) || layer;
      const after = describeLayer(l);
      // what the gesture did not change needs a bitmap on neither side
      const samePx = after.pv === before.pv;
      const sameMask =
        after.hasMask === before.hasMask && (!after.hasMask || after.mv === before.mv);
      let selAfter;
      try {
        keepCopies(after, l, { pixels: !samePx, mask: !sameMask });
        selAfter = captureSelection(doc.selection);
      } catch (err) {
        releaseLayer(after);
        edit.rollback();
        throw err;
      }
      if (samePx) {
        release(before.pk);
        before.pk = null;
      }
      if (sameMask) {
        release(before.mk);
        before.mk = null;
      }
      done = true;
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
      try {
        apply(before, selBefore, true);
      } finally {
        releaseLayer(before);
        releaseSelection(selBefore);
      }
    },
    dispose() {
      if (done) return;
      done = true;
      releaseLayer(before);
      releaseSelection(selBefore);
    },
  };
  return edit;
}

/**
 * Record a selection-only change (no pixels touched) — cheap: selections are
 * immutable and kept compactly. Nothing is recorded when `fn` leaves the
 * selection as it was.
 */
export function editSelection(label, fn) {
  settleSessions();
  const doc = state.doc;
  if (!doc) return;
  const before = doc.selection;
  fn(doc);
  const after = doc.selection;
  if (before === after) return;

  let b = null;
  let a = null;
  try {
    b = captureSelection(before);
    a = captureSelection(after);
  } catch (err) {
    // out of memory: leave the selection as it was rather than unrecorded
    releaseSelection(b);
    doc.selection = before;
    emit("selection", doc);
    throw err;
  }
  const apply = (s) => {
    doc.selection = selectionOf(s);
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
