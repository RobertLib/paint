/* ==========================================================================
   Document model: layers, compositing, selections and geometry operations.

   A Doc owns N Layers (index 0 = bottom). Each layer is its own canvas at
   document resolution. Rendering composites the stack into a single canvas,
   reusing a cache of "everything below the active layer" so painting stays
   cheap on tall stacks.
   ========================================================================== */

import { cssColor } from "./color.js";

export const BLEND_MODES = [
  ["source-over", "Normal"],
  ["multiply", "Multiply"],
  ["screen", "Screen"],
  ["overlay", "Overlay"],
  ["darken", "Darken"],
  ["lighten", "Lighten"],
  ["color-dodge", "Color dodge"],
  ["color-burn", "Color burn"],
  ["hard-light", "Hard light"],
  ["soft-light", "Soft light"],
  ["difference", "Difference"],
  ["exclusion", "Exclusion"],
  ["hue", "Hue"],
  ["saturation", "Saturation"],
  ["color", "Color"],
  ["luminosity", "Luminosity"],
];

let uid = 0;
const nextId = () => `l${++uid}-${(Math.random() * 1e6) | 0}`;

/* ------------------------------ canvas utils ----------------------------- */

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(canvas, opts) {
  const ctx = canvas.getContext("2d", opts);
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

export function copyCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

/* --------------------------------- Layer --------------------------------- */

export class Layer {
  constructor(w, h, { name = "Layer", fill = null, image = null } = {}) {
    this.id = nextId();
    this.name = name;
    this.canvas = makeCanvas(w, h);
    this.ctx = ctx2d(this.canvas);
    this.visible = true;
    this.opacity = 1;
    this.blend = "source-over";
    this.locked = false;
    /** bumped on every pixel change — drives cache invalidation + thumbnails */
    this.version = 0;

    if (fill) {
      this.ctx.fillStyle = typeof fill === "string" ? fill : cssColor(fill);
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
    if (image) {
      this.ctx.drawImage(image, 0, 0);
    }
  }

  get width() {
    return this.canvas.width;
  }

  get height() {
    return this.canvas.height;
  }

  touch() {
    this.version++;
  }

  clone(name = `${this.name} copy`) {
    const l = new Layer(this.width, this.height, { name });
    l.ctx.drawImage(this.canvas, 0, 0);
    l.visible = this.visible;
    l.opacity = this.opacity;
    l.blend = this.blend;
    l.locked = this.locked;
    return l;
  }

  /** Replace pixel content with another canvas of any size (no scaling). */
  adopt(canvas) {
    this.canvas = canvas;
    this.ctx = ctx2d(canvas);
    this.touch();
  }

  isEmpty() {
    const { data } = this.ctx.getImageData(0, 0, this.width, this.height);
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
    return true;
  }
}

/* ------------------------------- Selection ------------------------------- */

/**
 * A selection is an 8-bit alpha mask at document size. Geometric selections
 * also remember their shape so marching ants can be drawn as crisp vectors.
 */
export class Selection {
  constructor(w, h) {
    this.canvas = makeCanvas(w, h);
    this.ctx = ctx2d(this.canvas);
    this.shape = null; // {type:'rect'|'ellipse', x,y,w,h}
    this._bounds = null;
    this._boundsReady = false;
    this._segments = null;
  }

  static fromRect(w, h, r) {
    const s = new Selection(w, h);
    s.ctx.fillStyle = "#fff";
    s.ctx.fillRect(r.x, r.y, r.w, r.h);
    s.shape = { type: "rect", ...r };
    return s;
  }

  static fromEllipse(w, h, r) {
    const s = new Selection(w, h);
    s.ctx.fillStyle = "#fff";
    s.ctx.beginPath();
    s.ctx.ellipse(
      r.x + r.w / 2,
      r.y + r.h / 2,
      Math.abs(r.w / 2),
      Math.abs(r.h / 2),
      0,
      0,
      Math.PI * 2
    );
    s.ctx.fill();
    s.shape = { type: "ellipse", ...r };
    return s;
  }

  static fromPath(w, h, points) {
    const s = new Selection(w, h);
    if (points.length < 3) return s;
    s.ctx.fillStyle = "#fff";
    s.ctx.beginPath();
    s.ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) s.ctx.lineTo(points[i].x, points[i].y);
    s.ctx.closePath();
    s.ctx.fill();
    return s;
  }

  static fromMask(w, h, maskCanvas) {
    const s = new Selection(w, h);
    s.ctx.drawImage(maskCanvas, 0, 0);
    return s;
  }

  clone() {
    const s = new Selection(this.canvas.width, this.canvas.height);
    s.ctx.drawImage(this.canvas, 0, 0);
    s.shape = this.shape ? { ...this.shape } : null;
    return s;
  }

  /** Combine with another selection. mode: add | subtract | intersect */
  combine(other, mode) {
    const out = this.clone();
    out.shape = null;
    out.invalidate();
    const c = out.ctx;
    c.save();
    if (mode === "subtract") c.globalCompositeOperation = "destination-out";
    else if (mode === "intersect") c.globalCompositeOperation = "source-in";
    else c.globalCompositeOperation = "source-over";
    c.drawImage(other.canvas, 0, 0);
    c.restore();
    return out;
  }

  invert() {
    const out = new Selection(this.canvas.width, this.canvas.height);
    out.ctx.fillStyle = "#fff";
    out.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    out.ctx.globalCompositeOperation = "destination-out";
    out.ctx.drawImage(this.canvas, 0, 0);
    return out;
  }

  feather(radius) {
    if (radius <= 0) return this;
    const out = new Selection(this.canvas.width, this.canvas.height);
    out.ctx.filter = `blur(${radius}px)`;
    out.ctx.drawImage(this.canvas, 0, 0);
    out.ctx.filter = "none";
    return out;
  }

  invalidate() {
    this._bounds = null;
    this._boundsReady = false;
    this._segments = null;
    this._path2d = null;
  }

  /** Tight integer bounds of non-zero alpha, or null when empty. */
  get bounds() {
    if (this._boundsReady) return this._bounds;
    const { width: w, height: h } = this.canvas;
    const { data } = this.ctx.getImageData(0, 0, w, h);
    let minX = w,
      minY = h,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (data[row + x * 4 + 3] > 3) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    this._bounds =
      maxX < 0
        ? null
        : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    this._boundsReady = true;
    return this._bounds;
  }

  get isEmpty() {
    return this.bounds === null;
  }

  /**
   * Boundary segments in document space for marching ants, computed once and
   * cached. Only used for non-geometric (lasso / wand) selections.
   */
  get segments() {
    if (this._segments) return this._segments;
    const b = this.bounds;
    const segs = [];
    if (!b) return (this._segments = segs);

    const { data } = this.ctx.getImageData(b.x, b.y, b.w, b.h);
    const at = (x, y) =>
      x < 0 || y < 0 || x >= b.w || y >= b.h
        ? 0
        : data[(y * b.w + x) * 4 + 3] > 127
        ? 1
        : 0;

    for (let y = 0; y < b.h; y++) {
      for (let x = 0; x < b.w; x++) {
        if (!at(x, y)) continue;
        const px = b.x + x;
        const py = b.y + y;
        if (!at(x, y - 1)) segs.push(px, py, px + 1, py);
        if (!at(x, y + 1)) segs.push(px, py + 1, px + 1, py + 1);
        if (!at(x - 1, y)) segs.push(px, py, px, py + 1);
        if (!at(x + 1, y)) segs.push(px + 1, py, px + 1, py + 1);
      }
    }
    return (this._segments = segs);
  }
}

/* ---------------------------------- Doc ---------------------------------- */

export class Doc {
  constructor(width, height) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.layers = [];
    this.activeIndex = 0;
    this.selection = null;
    /** transient paint buffer shown above the active layer while a tool drags */
    this.floating = null;
    this.name = "Untitled";

    this._belowKey = null;
    this._compositeKey = null;
    this._floatVersion = 0;
    this._allocBuffers();
  }

  /** (Re)create the document-sized scratch buffers used while compositing. */
  _allocBuffers() {
    this._composite = makeCanvas(this.width, this.height);
    this._compositeCtx = ctx2d(this._composite);
    this._tmp = makeCanvas(this.width, this.height);
    this._tmpCtx = ctx2d(this._tmp);
    this._below = makeCanvas(this.width, this.height);
    this._belowCtx = ctx2d(this._below);
    this.invalidate();
  }

  static blank(w, h, fill = "#ffffff") {
    const doc = new Doc(w, h);
    const transparent = !fill || fill === "transparent";
    doc.layers.push(
      new Layer(doc.width, doc.height, {
        name: transparent ? "Layer 1" : "Background",
        fill: transparent ? null : fill,
      })
    );
    return doc;
  }

  static fromImage(image, name = "Image") {
    const w = image.naturalWidth || image.width;
    const h = image.naturalHeight || image.height;
    const doc = new Doc(w, h);
    doc.layers.push(new Layer(w, h, { name, image }));
    return doc;
  }

  /* ------------------------------- layers -------------------------------- */

  get active() {
    return this.layers[this.activeIndex] || null;
  }

  setActive(i) {
    this.activeIndex = Math.max(0, Math.min(this.layers.length - 1, i));
  }

  indexOfLayer(id) {
    return this.layers.findIndex((l) => l.id === id);
  }

  addLayer({ name, index = this.activeIndex + 1, fill = null, image = null } = {}) {
    const layer = new Layer(this.width, this.height, {
      name: name || `Layer ${this.layers.length + 1}`,
      fill,
      image,
    });
    this.layers.splice(Math.max(0, Math.min(this.layers.length, index)), 0, layer);
    this.activeIndex = this.layers.indexOf(layer);
    return layer;
  }

  insertLayer(layer, index = this.layers.length) {
    this.layers.splice(Math.max(0, Math.min(this.layers.length, index)), 0, layer);
    this.activeIndex = this.layers.indexOf(layer);
    return layer;
  }

  removeLayer(i) {
    if (this.layers.length <= 1) return null;
    const [gone] = this.layers.splice(i, 1);
    this.activeIndex = Math.max(0, Math.min(this.layers.length - 1, i - 1));
    return gone;
  }

  duplicateLayer(i = this.activeIndex) {
    const copy = this.layers[i].clone();
    this.layers.splice(i + 1, 0, copy);
    this.activeIndex = i + 1;
    return copy;
  }

  moveLayer(from, to) {
    if (from === to || from < 0 || from >= this.layers.length) return;
    const [layer] = this.layers.splice(from, 1);
    this.layers.splice(Math.max(0, Math.min(this.layers.length, to)), 0, layer);
    this.activeIndex = this.layers.indexOf(layer);
  }

  /** Merge layer i into i-1. Returns false when there is nothing below. */
  mergeDown(i = this.activeIndex) {
    if (i <= 0) return false;
    const top = this.layers[i];
    const bottom = this.layers[i - 1];
    const c = bottom.ctx;
    c.save();
    c.globalAlpha = top.visible ? top.opacity : 0;
    c.globalCompositeOperation = top.blend;
    c.drawImage(top.canvas, 0, 0);
    c.restore();
    bottom.touch();
    this.layers.splice(i, 1);
    this.activeIndex = i - 1;
    return true;
  }

  flatten(name = "Flattened") {
    const flat = this.renderFlat();
    const layer = new Layer(this.width, this.height, { name, image: flat });
    this.layers = [layer];
    this.activeIndex = 0;
    return layer;
  }

  /* ----------------------------- compositing ----------------------------- */

  setFloating(canvas, { mode = "normal", opacity = 1, blend = "source-over" } = {}) {
    this.floating = { canvas, mode, opacity, blend };
    this._floatVersion++;
  }

  floatingChanged() {
    this._floatVersion++;
  }

  clearFloating() {
    if (!this.floating) return;
    this.floating = null;
    this._floatVersion++;
  }

  _key() {
    let k = `${this.activeIndex}#${this._floatVersion}`;
    if (this.floating) {
      k += `#${this.floating.mode}#${this.floating.opacity}#${this.floating.blend}`;
    }
    for (const l of this.layers) {
      k += `|${l.id}.${l.version}.${l.visible ? 1 : 0}.${l.opacity}.${l.blend}`;
    }
    return k;
  }

  _drawLayer(ctx, layer, source = layer.canvas) {
    if (!layer.visible || layer.opacity === 0) return;
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blend;
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }

  /** The active layer combined with the live floating buffer. */
  _activeSource() {
    const layer = this.active;
    if (!this.floating || !layer) return layer?.canvas;
    const { canvas: fc, mode, opacity, blend } = this.floating;
    const c = this._tmpCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.clearRect(0, 0, this.width, this.height);
    c.drawImage(layer.canvas, 0, 0);
    c.globalAlpha = opacity;
    c.globalCompositeOperation = mode === "erase" ? "destination-out" : blend;
    c.drawImage(fc, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    return this._tmp;
  }

  /** Composited document, cached until something actually changes. */
  composite() {
    const key = this._key();
    if (key === this._compositeKey) return this._composite;

    const ctx = this._compositeCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.width, this.height);

    const ai = this.activeIndex;
    let belowKey = `${ai}`;
    for (let i = 0; i < ai; i++) {
      const l = this.layers[i];
      belowKey += `|${l.id}.${l.version}.${l.visible ? 1 : 0}.${l.opacity}.${l.blend}`;
    }
    if (belowKey !== this._belowKey) {
      const bc = this._belowCtx;
      bc.setTransform(1, 0, 0, 1, 0, 0);
      bc.globalCompositeOperation = "source-over";
      bc.globalAlpha = 1;
      bc.clearRect(0, 0, this.width, this.height);
      for (let i = 0; i < ai; i++) this._drawLayer(bc, this.layers[i]);
      this._belowKey = belowKey;
    }
    if (ai > 0) ctx.drawImage(this._below, 0, 0);

    const activeLayer = this.active;
    if (activeLayer) this._drawLayer(ctx, activeLayer, this._activeSource());
    for (let i = ai + 1; i < this.layers.length; i++) {
      this._drawLayer(ctx, this.layers[i]);
    }

    this._compositeKey = key;
    return this._composite;
  }

  /** A standalone flattened copy (export, flatten, filter previews). */
  renderFlat({ background = null } = {}) {
    const out = makeCanvas(this.width, this.height);
    const c = ctx2d(out);
    if (background) {
      c.fillStyle =
        typeof background === "string" ? background : cssColor(background);
      c.fillRect(0, 0, this.width, this.height);
    }
    c.drawImage(this.composite(), 0, 0);
    return out;
  }

  invalidate() {
    this._compositeKey = null;
    this._belowKey = null;
  }

  /* ------------------------------ selection ------------------------------ */

  setSelection(sel) {
    if (sel && sel.isEmpty) sel = null;
    this.selection = sel;
  }

  selectAll() {
    this.setSelection(
      Selection.fromRect(this.width, this.height, {
        x: 0,
        y: 0,
        w: this.width,
        h: this.height,
      })
    );
  }

  /** Bounds of the selection, or the whole document when nothing is selected. */
  workBounds() {
    const b = this.selection?.bounds;
    return b ? b : { x: 0, y: 0, w: this.width, h: this.height };
  }

  /* ------------------------------ geometry ------------------------------- */

  _resizeAll(w, h, drawFn) {
    for (const layer of this.layers) {
      const next = makeCanvas(w, h);
      const c = ctx2d(next);
      drawFn(c, layer.canvas);
      layer.adopt(next);
    }
    this.width = Math.max(1, Math.round(w));
    this.height = Math.max(1, Math.round(h));
    this.setSelection(null);
    this.clearFloating();
    this._allocBuffers();
  }

  /** Resample the artwork to a new pixel size. */
  scaleImage(w, h, smooth = true) {
    this._resizeAll(w, h, (c, src) => {
      c.imageSmoothingEnabled = smooth;
      c.imageSmoothingQuality = "high";
      c.drawImage(src, 0, 0, w, h);
    });
  }

  /** Change the canvas bounds without scaling; anchor is like "top-left". */
  resizeCanvas(w, h, anchor = "center") {
    const [vy, vx] = anchorParts(anchor);
    const dx = Math.round((w - this.width) * vx);
    const dy = Math.round((h - this.height) * vy);
    this._resizeAll(w, h, (c, src) => c.drawImage(src, dx, dy));
  }

  crop(rect) {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    this._resizeAll(w, h, (c, src) => c.drawImage(src, -x, -y));
  }

  rotate90(dir = 1) {
    const w = this.height;
    const h = this.width;
    this._resizeAll(w, h, (c, src) => {
      c.save();
      if (dir > 0) {
        c.translate(w, 0);
        c.rotate(Math.PI / 2);
      } else {
        c.translate(0, h);
        c.rotate(-Math.PI / 2);
      }
      c.drawImage(src, 0, 0);
      c.restore();
    });
  }

  rotate180() {
    this._resizeAll(this.width, this.height, (c, src) => {
      c.save();
      c.translate(this.width, this.height);
      c.rotate(Math.PI);
      c.drawImage(src, 0, 0);
      c.restore();
    });
  }

  flip(axis = "h") {
    this._resizeAll(this.width, this.height, (c, src) => {
      c.save();
      if (axis === "h") {
        c.translate(this.width, 0);
        c.scale(-1, 1);
      } else {
        c.translate(0, this.height);
        c.scale(1, -1);
      }
      c.drawImage(src, 0, 0);
      c.restore();
    });
  }

  /* ------------------------------ snapshots ------------------------------ */

  /** Deep copy of everything undo needs to bring the document back. */
  snapshot() {
    return {
      width: this.width,
      height: this.height,
      name: this.name,
      activeIndex: this.activeIndex,
      selection: this.selection ? this.selection.clone() : null,
      layers: this.layers.map((l) => ({
        id: l.id,
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        blend: l.blend,
        locked: l.locked,
        canvas: copyCanvas(l.canvas),
      })),
      bytes: this.layers.length * this.width * this.height * 4,
    };
  }

  restoreSnapshot(snap) {
    const resized = snap.width !== this.width || snap.height !== this.height;
    this.width = snap.width;
    this.height = snap.height;
    this.name = snap.name;
    this.layers = snap.layers.map((s) => {
      const layer = new Layer(1, 1, { name: s.name });
      layer.id = s.id;
      layer.adopt(copyCanvas(s.canvas));
      layer.visible = s.visible;
      layer.opacity = s.opacity;
      layer.blend = s.blend;
      layer.locked = s.locked;
      return layer;
    });
    this.activeIndex = Math.min(snap.activeIndex, this.layers.length - 1);
    this.selection = snap.selection ? snap.selection.clone() : null;
    this.clearFloating();
    if (resized) this._allocBuffers();
    else this.invalidate();
  }

  /* ---------------------------- serialization ---------------------------- */

  toJSON() {
    return {
      format: "paint-studio",
      version: 2,
      name: this.name,
      width: this.width,
      height: this.height,
      activeIndex: this.activeIndex,
      layers: this.layers.map((l) => ({
        name: l.name,
        visible: l.visible,
        opacity: l.opacity,
        blend: l.blend,
        locked: l.locked,
        data: l.canvas.toDataURL("image/png"),
      })),
    };
  }

  static async fromJSON(json) {
    if (!json || json.format !== "paint-studio") {
      throw new Error("Not a Paint Studio project file");
    }
    const doc = new Doc(json.width, json.height);
    doc.name = json.name || "Untitled";
    for (const spec of json.layers || []) {
      const image = await loadImage(spec.data);
      const layer = new Layer(doc.width, doc.height, { name: spec.name, image });
      layer.visible = spec.visible !== false;
      layer.opacity = spec.opacity ?? 1;
      layer.blend = spec.blend || "source-over";
      layer.locked = !!spec.locked;
      doc.layers.push(layer);
    }
    if (!doc.layers.length) doc.layers.push(new Layer(doc.width, doc.height));
    doc.setActive(json.activeIndex ?? doc.layers.length - 1);
    return doc;
  }
}

function anchorParts(anchor) {
  const v = anchor.includes("top") ? 0 : anchor.includes("bottom") ? 1 : 0.5;
  const h = anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5;
  return [v, h];
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not decode image"));
    img.src = src;
  });
}

/* --------------------------- masked compositing --------------------------- */

/**
 * Draw `src` (a document-sized canvas) onto a layer, honouring the current
 * selection. `replace` first erases the masked region so filter output can
 * fully replace the pixels underneath.
 */
export function paintMasked(
  layer,
  src,
  selection,
  { replace = false, opacity = 1, blend = "source-over", erase = false } = {}
) {
  const c = layer.ctx;
  let source = src;

  if (selection) {
    const masked = makeCanvas(layer.width, layer.height);
    const mc = ctx2d(masked);
    mc.drawImage(src, 0, 0);
    mc.globalCompositeOperation = "destination-in";
    mc.drawImage(selection.canvas, 0, 0);
    source = masked;
  }

  c.save();
  if (replace && selection) {
    c.globalCompositeOperation = "destination-out";
    c.drawImage(selection.canvas, 0, 0);
  } else if (replace) {
    c.clearRect(0, 0, layer.width, layer.height);
  }
  c.globalAlpha = opacity;
  c.globalCompositeOperation = erase ? "destination-out" : blend;
  c.drawImage(source, 0, 0);
  c.restore();
  layer.touch();
}
