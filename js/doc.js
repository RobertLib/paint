/* ==========================================================================
   Document model: layers, masks, text layers, compositing, selections and
   geometry operations.

   A Doc owns N Layers (index 0 = bottom). Each layer is its own canvas at
   document resolution and may carry a mask (white pixels whose alpha is the
   visibility) and text parameters that keep it editable. Rendering composites
   the stack into a single canvas, reusing a cache of "everything below the
   active layer" so painting stays cheap on tall stacks.
   ========================================================================== */

import { cssColor } from "./color.js";
import { t } from "./i18n.js";

export const BLEND_MODES = [
  ["source-over", t("Normal")],
  ["multiply", t("Multiply")],
  ["screen", t("Screen")],
  ["overlay", t("Overlay")],
  ["darken", t("Darken")],
  ["lighten", t("Lighten")],
  ["color-dodge", t("Color dodge")],
  ["color-burn", t("Color burn")],
  ["hard-light", t("Hard light")],
  ["soft-light", t("Soft light")],
  ["difference", t("Difference")],
  ["exclusion", t("Exclusion")],
  ["hue", t("Hue")],
  ["saturation", t("Saturation")],
  ["color", t("Color")],
  ["luminosity", t("Luminosity")],
  ["lighter", t("Linear dodge (add)")],
];

let uid = 0;
const nextId = () => `l${++uid}-${(Math.random() * 1e6) | 0}`;

/**
 * One clock for every pixel version in the app. A (layer id, version) pair
 * therefore names exactly one bitmap content, which lets the undo history
 * share frozen copies instead of duplicating them.
 */
let clock = 0;
export const nextVersion = () => ++clock;

/** Largest edge any document may have. */
export const MAX_DIM = 8000;

/* ------------------------------ canvas utils ----------------------------- */

export class CanvasTooLargeError extends Error {
  constructor() {
    super("The image is too large for this device");
    this.name = "CanvasTooLargeError";
  }
}

export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctx2d(canvas, opts) {
  const ctx = canvas.getContext("2d", opts);
  // browsers hand out no context (or a dead one) past their canvas limits
  if (!ctx) throw new CanvasTooLargeError();
  ctx.imageSmoothingQuality = "high";
  return ctx;
}

let _maxPixels = 0;

/**
 * The largest canvas area this device can really draw into. Desktop browsers
 * cope with 8000 × 8000; iOS Safari stops at about 16.7 megapixels and fails
 * silently beyond that, so the limit is probed once by drawing a pixel into
 * the far corner and reading it back.
 */
export function maxCanvasPixels() {
  if (_maxPixels) return _maxPixels;
  const candidates = [MAX_DIM * MAX_DIM, 5793 * 5793, 4096 * 4096, 2896 * 2896];
  for (const area of candidates) {
    const side = Math.floor(Math.sqrt(area));
    const c = document.createElement("canvas");
    try {
      c.width = side;
      c.height = side;
      const ctx = c.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#ff0000";
      ctx.fillRect(side - 1, side - 1, 1, 1);
      if (ctx.getImageData(side - 1, side - 1, 1, 1).data[0] === 255) {
        _maxPixels = side * side;
        break;
      }
    } catch {
      /* too large — try the next size */
    } finally {
      c.width = c.height = 0;
    }
  }
  if (!_maxPixels) _maxPixels = 2896 * 2896;
  return _maxPixels;
}

/**
 * Scale factor (≤ 1) that brings a w × h image within the edge and area
 * limits of this device.
 */
export function fitScale(w, h) {
  const edge = MAX_DIM / Math.max(w, h, 1);
  // every browser handles 16.7 MP, so only bigger images need the probe
  const pixels = Math.max(1, w * h);
  const area = pixels <= 4096 * 4096 ? 1 : Math.sqrt(maxCanvasPixels() / pixels);
  return Math.min(1, edge, area);
}

/** Free a canvas's backing store now rather than whenever GC gets to it. */
export function releaseCanvas(c) {
  if (c && typeof c.width === "number") {
    c.width = 0;
    c.height = 0;
  }
}

export function copyCanvas(src) {
  const c = makeCanvas(src.width, src.height);
  ctx2d(c).drawImage(src, 0, 0);
  return c;
}

/** Tight bounds of non-transparent pixels, or null for an empty canvas. */
export function alphaBounds(canvas, threshold = 0) {
  const w = canvas.width;
  const h = canvas.height;
  const { data } = canvas.getContext("2d").getImageData(0, 0, w, h);
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      if (data[row + x * 4 + 3] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

let _supportsFilter = null;
const supportsCanvasFilter = () =>
  (_supportsFilter ??= typeof makeCanvas(1, 1).getContext("2d").filter === "string");

/**
 * Gaussian blur of a white-with-alpha canvas (selections, masks) where the
 * pixels beyond the canvas edge repeat the edge, so nothing fades out at the
 * document border. Uses the canvas filter when available, otherwise three
 * box-blur passes on the alpha channel.
 */
export function blurAlpha(src, radius) {
  const w = src.width;
  const h = src.height;
  const out = makeCanvas(w, h);
  const oc = ctx2d(out);
  if (supportsCanvasFilter()) {
    const p = Math.ceil(radius * 3);
    const padded = makeCanvas(w + p * 2, h + p * 2);
    const pc = ctx2d(padded);
    pc.imageSmoothingEnabled = false;
    pc.drawImage(src, p, p);
    // stretch the outermost rows/columns (and corners) into the padding
    pc.drawImage(src, 0, 0, w, 1, p, 0, w, p);
    pc.drawImage(src, 0, h - 1, w, 1, p, p + h, w, p);
    pc.drawImage(src, 0, 0, 1, h, 0, p, p, h);
    pc.drawImage(src, w - 1, 0, 1, h, p + w, p, p, h);
    pc.drawImage(src, 0, 0, 1, 1, 0, 0, p, p);
    pc.drawImage(src, w - 1, 0, 1, 1, p + w, 0, p, p);
    pc.drawImage(src, 0, h - 1, 1, 1, 0, p + h, p, p);
    pc.drawImage(src, w - 1, h - 1, 1, 1, p + w, p + h, p, p);
    oc.filter = `blur(${radius}px)`;
    oc.drawImage(padded, -p, -p);
    oc.filter = "none";
    return out;
  }
  const img = src.getContext("2d").getImageData(0, 0, w, h);
  const d = img.data;
  let a = new Float32Array(w * h);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  // three box passes of radius r have σ² = r(r + 1): pick r for σ = radius
  const r = Math.max(1, Math.round((Math.sqrt(1 + 4 * radius * radius) - 1) / 2));
  const tmp = new Float32Array(w * h);
  const pass = (from, to, len, count, stride, step) => {
    for (let line = 0; line < count; line++) {
      const base = line * stride;
      let sum = 0;
      const at = (k) => from[base + Math.min(len - 1, Math.max(0, k)) * step];
      for (let k = -r; k <= r; k++) sum += at(k);
      for (let k = 0; k < len; k++) {
        to[base + k * step] = sum / (r * 2 + 1);
        sum += at(k + r + 1) - at(k - r);
      }
    }
  };
  for (let i = 0; i < 3; i++) {
    pass(a, tmp, w, h, w, 1);
    pass(tmp, a, h, w, 1, w);
  }
  for (let i = 0; i < a.length; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
    d[i * 4 + 3] = a[i];
  }
  oc.putImageData(img, 0, 0);
  return out;
}

/* ---------------------------------- masks --------------------------------- */

/** A document-sized mask: white everywhere, alpha 255 (reveal) or 0 (hide). */
export function makeMask(w, h, reveal = true) {
  const m = makeCanvas(w, h);
  if (reveal) {
    const c = ctx2d(m);
    c.fillStyle = "#fff";
    c.fillRect(0, 0, w, h);
  }
  return m;
}

/** Mask alpha → opaque grayscale, so filters see the mask as a picture. */
export function maskToGray(mask) {
  const out = makeCanvas(mask.width, mask.height);
  const c = ctx2d(out);
  const img = mask.getContext("2d").getImageData(0, 0, mask.width, mask.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    d[i] = d[i + 1] = d[i + 2] = a;
    d[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return out;
}

/** Grayscale picture → mask (luminance becomes alpha). */
export function grayToMask(gray) {
  const out = makeCanvas(gray.width, gray.height);
  const c = ctx2d(out);
  const img = gray.getContext("2d").getImageData(0, 0, gray.width, gray.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i + 3] = (v * d[i + 3]) / 255;
    d[i] = d[i + 1] = d[i + 2] = 255;
  }
  c.putImageData(img, 0, 0);
  return out;
}

/**
 * Paint `src` (ordinary colours, alpha = coverage) onto a mask inside `rect`.
 * Brightness of the paint is the new mask value — black hides, white reveals —
 * blended by coverage, so soft brushes and gradients behave as expected.
 * `base` is read, `dst` written: they may be the same canvas.
 */
export function paintMaskRegion(dst, base, src, rect, { opacity = 1, erase = false, selection = null } = {}) {
  const W = dst.width;
  const H = dst.height;
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const w = Math.min(W, Math.ceil(rect.x + rect.w)) - x;
  const h = Math.min(H, Math.ceil(rect.y + rect.h)) - y;
  if (w <= 0 || h <= 0) return;
  const bImg = base.getContext("2d").getImageData(x, y, w, h);
  const sImg = src.getContext("2d").getImageData(x, y, w, h);
  const selData = selection ? selection.ctx.getImageData(x, y, w, h).data : null;
  const b = bImg.data;
  const s = sImg.data;
  for (let i = 0; i < b.length; i += 4) {
    let cov = (s[i + 3] / 255) * opacity;
    if (selData) cov *= selData[i + 3] / 255;
    b[i] = b[i + 1] = b[i + 2] = 255;
    if (cov <= 0) continue;
    const keep = b[i + 3] * (1 - cov);
    if (erase) {
      b[i + 3] = keep;
    } else {
      const v = 0.299 * s[i] + 0.587 * s[i + 1] + 0.114 * s[i + 2];
      b[i + 3] = keep + v * cov;
    }
  }
  dst.getContext("2d").putImageData(bImg, x, y);
}

/**
 * Apply a geometry transform to a mask. Areas the old mask does not cover in
 * the new frame (a grown canvas) become revealed rather than hidden.
 */
export function transformMask(mask, w, h, drawFn) {
  const moved = makeCanvas(w, h);
  drawFn(ctx2d(moved), mask);
  const cover = makeCanvas(w, h);
  drawFn(ctx2d(cover), makeMask(mask.width, mask.height, true));
  const rest = makeMask(w, h, true);
  const rc = ctx2d(rest);
  rc.globalCompositeOperation = "destination-out";
  rc.drawImage(cover, 0, 0);
  const mc = ctx2d(moved);
  mc.globalCompositeOperation = "lighter";
  mc.drawImage(rest, 0, 0);
  return moved;
}

/* ---------------------------------- text ---------------------------------- */

export const LINE_HEIGHT = 1.25;

export function fontString(style) {
  return `${style.italic ? "italic " : ""}${style.bold ? "700" : "400"} ${style.size}px ${style.font}`;
}

let _measure = null;
function measureCtx() {
  if (!_measure) _measure = makeCanvas(8, 8).getContext("2d");
  return _measure;
}

/** Document-space box a text block occupies (for hit tests and transforms). */
export function textBounds(text) {
  const m = measureCtx();
  m.font = fontString(text);
  const lines = text.value.split("\n");
  let widest = 0;
  for (const line of lines) widest = Math.max(widest, m.measureText(line || " ").width);
  const pad = 3;
  const w = widest + pad * 2;
  const h = lines.length * text.size * LINE_HEIGHT + 2;
  const x =
    text.align === "center" ? text.x - w / 2 : text.align === "right" ? text.x - w : text.x;
  return { x, y: text.y, w, h };
}

/** Draw a text block exactly as the on-canvas editor showed it. */
export function drawText(ctx, text) {
  const lines = text.value.split("\n");
  const lineHeight = text.size * LINE_HEIGHT;
  ctx.save();
  ctx.font = fontString(text);
  ctx.textAlign = text.align;
  ctx.textBaseline = "top";
  ctx.fillStyle = cssColor({ ...text.color, a: 1 });
  ctx.globalAlpha = text.opacity ?? 1;
  // match the editor box: 1px border + half-leading of line-height 1.25
  const dx = text.align === "left" ? 3 : text.align === "right" ? -3 : 0;
  const dy = 1 + text.size * ((LINE_HEIGHT - 1) / 2);
  lines.forEach((line, i) => ctx.fillText(line, text.x + dx, text.y + dy + i * lineHeight));
  ctx.restore();
}

export const cloneText = (text) => (text ? { ...text, color: { ...text.color } } : null);

/* --------------------------------- Layer --------------------------------- */

/**
 * Paint target that redirects pixel edits into a layer's mask. Tools, filters
 * and history treat it like a layer: it has an id, a canvas, a ctx, touch().
 */
class MaskTarget {
  constructor(layer) {
    this.layer = layer;
    this.isMask = true;
  }
  get id() {
    return this.layer.id;
  }
  get canvas() {
    return this.layer.mask;
  }
  get ctx() {
    return this.layer.maskCtx;
  }
  get width() {
    return this.layer.mask.width;
  }
  get height() {
    return this.layer.mask.height;
  }
  get locked() {
    return this.layer.locked;
  }
  get name() {
    return this.layer.name;
  }
  get text() {
    return null;
  }
  set text(_) {
    /* masks never carry text */
  }
  touch() {
    this.layer.touchMask();
  }
  adopt(canvas) {
    this.layer.setMask(canvas);
  }
}

export class Layer {
  constructor(w, h, { name = t("Layer"), fill = null, image = null } = {}) {
    this.id = nextId();
    this.name = name;
    this.canvas = makeCanvas(w, h);
    this.ctx = ctx2d(this.canvas);
    this.visible = true;
    this.opacity = 1;
    this.blend = "source-over";
    this.locked = false;
    /** visibility mask (white, alpha = visibility) or null */
    this.mask = null;
    this.maskCtx = null;
    this.maskEnabled = true;
    /** when true, painting goes into the mask instead of the pixels */
    this.editMask = false;
    /** text parameters while the layer is still editable text, else null */
    this.text = null;
    /** bumped on every change — drives cache invalidation + thumbnails */
    this.version = nextVersion();
    /** identity of the current pixel / mask content (see nextVersion) */
    this.pixelVersion = this.version;
    this.maskVersion = this.version;
    this._maskTarget = null;

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

  get maskTarget() {
    if (!this.mask) return null;
    return (this._maskTarget ||= new MaskTarget(this));
  }

  setMask(canvas) {
    this.mask = canvas || null;
    this.maskCtx = canvas ? ctx2d(canvas) : null;
    if (!canvas) this.editMask = false;
    this.touchMask();
  }

  /**
   * Something on this layer changed. Pixels and mask both count as new: code
   * that edits the mask through the layer calls this too, and an extra copy
   * in the history is cheaper than a stale one.
   */
  touch() {
    this.version = nextVersion();
    this.pixelVersion = this.version;
    this.maskVersion = this.version;
  }

  /** Only the mask changed (edits through the mask paint target). */
  touchMask() {
    this.version = nextVersion();
    this.maskVersion = this.version;
  }

  /** Swap in pixels whose content version is already known (undo/redo). */
  restorePixels(canvas, pixelVersion) {
    this.canvas = canvas;
    this.ctx = ctx2d(canvas);
    this.version = nextVersion();
    this.pixelVersion = pixelVersion;
  }

  /** Swap in a mask whose content version is already known (undo/redo). */
  restoreMask(canvas, maskVersion) {
    this.mask = canvas || null;
    this.maskCtx = canvas ? ctx2d(canvas) : null;
    if (!canvas) this.editMask = false;
    this.version = nextVersion();
    this.maskVersion = maskVersion;
  }

  /** Re-render the pixels from the text parameters. */
  renderText() {
    if (!this.text) return;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.restore();
    drawText(this.ctx, this.text);
    this.touch();
  }

  /** Pixels as they appear in the stack: the mask applied, ignoring opacity. */
  maskedPixels() {
    if (!this.mask || !this.maskEnabled) return this.canvas;
    const out = copyCanvas(this.canvas);
    const c = ctx2d(out);
    c.globalCompositeOperation = "destination-in";
    c.drawImage(this.mask, 0, 0);
    return out;
  }

  clone(name = t("{name} copy", { name: this.name })) {
    const l = new Layer(this.width, this.height, { name });
    l.ctx.drawImage(this.canvas, 0, 0);
    l.visible = this.visible;
    l.opacity = this.opacity;
    l.blend = this.blend;
    l.locked = this.locked;
    if (this.mask) l.setMask(copyCanvas(this.mask));
    l.maskEnabled = this.maskEnabled;
    l.editMask = this.editMask;
    l.text = cloneText(this.text);
    l.touch();
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

let selUid = 0;

/**
 * A selection is an 8-bit alpha mask at document size. Geometric selections
 * also remember their shape so marching ants can be drawn as crisp vectors.
 *
 * Once a selection has been handed to the document it is never drawn into
 * again — every operation returns a new one — so the undo history can keep
 * references instead of copies.
 */
export class Selection {
  constructor(w, h) {
    this.uid = ++selUid;
    this.canvas = makeCanvas(w, h);
    this.ctx = ctx2d(this.canvas, { willReadFrequently: true });
    this.shape = null; // {type:'rect'|'ellipse', x,y,w,h}
    this._bounds = null;
    this._boundsReady = false;
    this._segments = null;
  }

  static fromRect(w, h, r) {
    const s = new Selection(w, h);
    s.ctx.fillStyle = "#fff";
    s.ctx.fillRect(r.x, r.y, r.w, r.h);
    // ants follow the shape, so keep it inside the canvas like the pixels
    const x = Math.max(0, r.x);
    const y = Math.max(0, r.y);
    s.shape = {
      type: "rect",
      x,
      y,
      w: Math.max(0, Math.min(w, r.x + r.w) - x),
      h: Math.max(0, Math.min(h, r.y + r.h) - y),
    };
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
    // the copy has the same pixels, so the (immutable) caches still hold
    s._bounds = this._bounds;
    s._boundsReady = this._boundsReady;
    s._segments = this._segments;
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
    // the document edge is not a selection edge: a select-all stays solid
    out.ctx.drawImage(blurAlpha(this.canvas, radius), 0, 0);
    return out;
  }

  invalidate() {
    this._bounds = null;
    this._boundsReady = false;
    this._cover = null;
    this._coverReady = false;
    this._segments = null;
    this._path2d = null;
  }

  /** Tight integer bounds of non-zero alpha, or null when empty. */
  get bounds() {
    if (this._boundsReady) return this._bounds;
    this._bounds = alphaBounds(this.canvas, 3);
    this._boundsReady = true;
    return this._bounds;
  }

  get isEmpty() {
    return this.bounds === null;
  }

  /**
   * Bounds of every pixel the selection touches at all (alpha > 0) — what an
   * edit through it can change, faint feathered tails included.
   */
  get coverBounds() {
    if (this._coverReady) return this._cover;
    this._cover = alphaBounds(this.canvas, 0);
    this._coverReady = true;
    return this._cover;
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
    // the outline sits where a pixel is at least half selected — but a
    // faint (heavily feathered) selection must still show where it is
    let peak = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > peak) peak = data[i];
    const threshold = Math.min(127, Math.max(3, peak >> 1));
    const W = b.w;
    const H = b.h;
    const inside = new Uint8Array(W * H);
    for (let i = 0; i < inside.length; i++) inside[i] = data[i * 4 + 3] > threshold ? 1 : 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : inside[y * W + x]);

    // collect edges as long runs: every run is one sub-path, so fewer and
    // longer runs make the dashes march instead of blinking
    for (let y = 0; y <= H; y++) {
      let runStart = -1;
      let runKind = 0;
      for (let x = 0; x <= W; x++) {
        const up = at(x, y - 1);
        const down = at(x, y);
        const kind = x < W && up !== down ? (down ? 1 : 2) : 0;
        if (kind !== runKind) {
          if (runKind) segs.push(b.x + runStart, b.y + y, b.x + x, b.y + y);
          runStart = x;
          runKind = kind;
        }
      }
    }
    for (let x = 0; x <= W; x++) {
      let runStart = -1;
      let runKind = 0;
      for (let y = 0; y <= H; y++) {
        const left = at(x - 1, y);
        const right = at(x, y);
        const kind = y < H && left !== right ? (right ? 1 : 2) : 0;
        if (kind !== runKind) {
          if (runKind) segs.push(b.x + x, b.y + runStart, b.x + x, b.y + y);
          runStart = y;
          runKind = kind;
        }
      }
    }
    return (this._segments = segs);
  }
}

/* ---------------------------------- Doc ---------------------------------- */

const layerKey = (l) =>
  `|${l.id}.${l.version}.${l.visible ? 1 : 0}.${l.opacity}.${l.blend}.${
    l.mask && l.maskEnabled ? "m" : ""
  }`;

export class Doc {
  constructor(width, height) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.layers = [];
    this.activeIndex = 0;
    this.selection = null;
    /** transient paint buffer shown above the active layer while a tool drags */
    this.floating = null;
    this.name = t("Untitled");
    /**
     * A layer the text tool is editing: its pixels are hidden while the live
     * editor shows the same text. Purely a view state — never saved.
     */
    this.hiddenLayerId = null;

    this._belowKey = null;
    this._compositeKey = null;
    this._floatVersion = 0;
    /** bumped whenever composite() renders anew — for caches of the picture */
    this.compositeVersion = 0;
    this._allocBuffers();
  }

  /** (Re)create the document-sized scratch buffers used while compositing. */
  _allocBuffers() {
    for (const name of ["_composite", "_tmp", "_below", "_maskTmp", "_maskPrev", "_selTmp"]) {
      if (this[name]) releaseCanvas(this[name]);
      this[name] = null;
    }
    this._composite = makeCanvas(this.width, this.height);
    this._compositeCtx = ctx2d(this._composite);
    this.invalidate();
  }

  /** A document-sized scratch canvas, created the first time it is needed. */
  _scratch(name) {
    if (!this[name]) this[name] = makeCanvas(this.width, this.height);
    return this[name];
  }

  /** The 2D context of a scratch canvas (CanvasTooLargeError when refused). */
  _scratchCtx(name) {
    return ctx2d(this._scratch(name));
  }

  static blank(w, h, fill = "#ffffff") {
    const doc = new Doc(w, h);
    const transparent = !fill || fill === "transparent";
    doc.layers.push(
      new Layer(doc.width, doc.height, {
        name: transparent ? t("Layer {n}", { n: 1 }) : t("Background"),
        fill: transparent ? null : fill,
      })
    );
    return doc;
  }

  static fromImage(image, name = t("Image")) {
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

  /** Where pixel edits land: the active layer, or its mask while editing it. */
  get target() {
    const l = this.active;
    if (!l) return null;
    return l.editMask && l.mask ? l.maskTarget : l;
  }

  setActive(i) {
    this.activeIndex = Math.max(0, Math.min(this.layers.length - 1, i));
  }

  indexOfLayer(id) {
    return this.layers.findIndex((l) => l.id === id);
  }

  addLayer({ name, index = this.activeIndex + 1, fill = null, image = null } = {}) {
    const layer = new Layer(this.width, this.height, {
      name: name || t("Layer {n}", { n: this.layers.length + 1 }),
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
    if (!Number.isInteger(i) || i < 0 || i >= this.layers.length) return null;
    const active = this.active;
    const [gone] = this.layers.splice(i, 1);
    // deleting another layer keeps the one being worked on active
    const keep = gone === active ? -1 : this.layers.indexOf(active);
    this.activeIndex =
      keep >= 0 ? keep : Math.max(0, Math.min(this.layers.length - 1, i - 1));
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

  /** Bake a layer's mask into its pixels and drop the mask. */
  applyMask(layer) {
    if (!layer.mask) return;
    if (layer.maskEnabled) {
      const c = layer.ctx;
      c.save();
      c.globalCompositeOperation = "destination-in";
      c.drawImage(layer.mask, 0, 0);
      c.restore();
      layer.text = null;
      layer.touch();
    }
    // a disabled mask hides nothing: the pixels (and editable text) stay
    layer.setMask(null);
  }

  /** Merge layer i into i-1. Returns false when there is nothing below. */
  mergeDown(i = this.activeIndex) {
    if (i <= 0) return false;
    const top = this.layers[i];
    const bottom = this.layers[i - 1];
    this.applyMask(bottom);
    bottom.text = null;
    const c = bottom.ctx;
    if (bottom.opacity < 1) {
      // bake the lower layer's opacity in first, so the upper layer is not
      // faded by it afterwards and the merge looks like it did before
      c.save();
      c.globalCompositeOperation = "destination-in";
      c.fillStyle = `rgba(0,0,0,${bottom.opacity})`;
      c.fillRect(0, 0, bottom.width, bottom.height);
      c.restore();
      bottom.opacity = 1;
    }
    c.save();
    c.globalAlpha = top.visible ? top.opacity : 0;
    c.globalCompositeOperation = top.blend;
    c.drawImage(top.maskedPixels(), 0, 0);
    c.restore();
    bottom.touch();
    this.layers.splice(i, 1);
    this.activeIndex = i - 1;
    return true;
  }

  flatten(name = t("Flattened")) {
    const flat = this.renderFlat();
    const layer = new Layer(this.width, this.height, { name, image: flat });
    this.layers = [layer];
    this.activeIndex = 0;
    return layer;
  }

  /* ----------------------------- compositing ----------------------------- */

  setFloating(canvas, { mode = "normal", opacity = 1, blend = "source-over" } = {}) {
    this.floating = { canvas, mode, opacity, blend, dirty: null, fresh: true };
    this._floatVersion++;
  }

  /** The floating buffer changed; `rect` (document space) narrows the area. */
  floatingChanged(rect = null) {
    const f = this.floating;
    if (f) {
      const r = rect || { x: 0, y: 0, w: this.width, h: this.height };
      f.dirty = f.dirty ? unionRect(f.dirty, r) : r;
    }
    this._floatVersion++;
  }

  clearFloating() {
    if (!this.floating) return;
    this.floating = null;
    this._floatVersion++;
  }

  _key() {
    let k = `${this.activeIndex}#${this._floatVersion}#${this.hiddenLayerId}`;
    if (this.floating) {
      k += `#${this.floating.mode}#${this.floating.opacity}#${this.floating.blend}`;
      // the stroke preview is clipped to the selection
      if (this.selection) k += `#s${this.selection.uid}`;
    }
    for (const l of this.layers) k += layerKey(l);
    return k;
  }

  _drawLayer(ctx, layer, source = layer.canvas, mask = null) {
    if (!layer.visible || layer.opacity === 0 || layer.id === this.hiddenLayerId) return;
    let src = source;
    const m = mask || (layer.mask && layer.maskEnabled ? layer.mask : null);
    if (m) {
      const tmp = this._scratch("_maskTmp");
      const mc = this._scratchCtx("_maskTmp");
      mc.setTransform(1, 0, 0, 1, 0, 0);
      mc.globalAlpha = 1;
      mc.globalCompositeOperation = "copy";
      mc.drawImage(src, 0, 0);
      mc.globalCompositeOperation = "destination-in";
      mc.drawImage(m, 0, 0);
      mc.globalCompositeOperation = "source-over";
      src = tmp;
    }
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    ctx.globalCompositeOperation = layer.blend;
    ctx.drawImage(src, 0, 0);
    ctx.restore();
  }

  /** The active layer combined with the live floating buffer. */
  _activeSource() {
    const layer = this.active;
    if (!this.floating || !layer || this.target?.isMask) return layer?.canvas;
    let { canvas: fc } = this.floating;
    const { mode, opacity, blend } = this.floating;
    if (this.selection) {
      // preview what pointer-up will commit: paint only inside the selection
      const sc = this._scratchCtx("_selTmp");
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalAlpha = 1;
      sc.globalCompositeOperation = "copy";
      sc.drawImage(fc, 0, 0);
      sc.globalCompositeOperation = "destination-in";
      sc.drawImage(this.selection.canvas, 0, 0);
      sc.globalCompositeOperation = "source-over";
      fc = this._selTmp;
    }
    const tmp = this._scratch("_tmp");
    const c = this._scratchCtx("_tmp");
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = "copy";
    c.drawImage(layer.canvas, 0, 0);
    c.globalAlpha = opacity;
    c.globalCompositeOperation = mode === "erase" ? "destination-out" : blend;
    c.drawImage(fc, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    return tmp;
  }

  /**
   * While a stroke paints into a mask, the preview mask is the stored mask
   * with the floating buffer applied. Only the area the stroke touched since
   * the last frame is recomputed.
   */
  _activeMask() {
    const layer = this.active;
    const f = this.floating;
    if (!f || !this.target?.isMask || !layer.maskEnabled) return null;
    const prev = this._scratch("_maskPrev");
    const pc = this._scratchCtx("_maskPrev");
    if (f.fresh) {
      pc.globalCompositeOperation = "copy";
      pc.drawImage(layer.mask, 0, 0);
      pc.globalCompositeOperation = "source-over";
      f.fresh = false;
    }
    if (f.dirty) {
      const r = f.dirty;
      f.dirty = null;
      paintMaskRegion(prev, layer.mask, f.canvas, padRect(r, 2), {
        opacity: f.opacity,
        erase: f.mode === "erase",
        selection: this.selection,
      });
    }
    return prev;
  }

  /** Composited document, cached until something actually changes. */
  composite() {
    const key = this._key();
    if (key === this._compositeKey) return this._composite;
    this.compositeVersion++;

    const ctx = this._compositeCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.width, this.height);

    const ai = this.activeIndex;
    let belowKey = `${ai}`;
    for (let i = 0; i < ai; i++) belowKey += layerKey(this.layers[i]);
    if (ai > 0 && belowKey !== this._belowKey) {
      const bc = this._scratchCtx("_below");
      bc.setTransform(1, 0, 0, 1, 0, 0);
      bc.globalCompositeOperation = "source-over";
      bc.globalAlpha = 1;
      bc.clearRect(0, 0, this.width, this.height);
      for (let i = 0; i < ai; i++) this._drawLayer(bc, this.layers[i]);
      this._belowKey = belowKey;
    }
    if (ai > 0) ctx.drawImage(this._below, 0, 0);

    const activeLayer = this.active;
    if (activeLayer) {
      this._drawLayer(ctx, activeLayer, this._activeSource(), this._activeMask());
    }
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

  /**
   * Redraw every layer (and mask) into a new frame. `textFn` maps text
   * parameters into the new frame; without it text layers become pixels.
   */
  _resizeAll(w, h, drawFn, textFn = null, { keepSelection = true } = {}) {
    for (const layer of this.layers) {
      const next = makeCanvas(w, h);
      const c = ctx2d(next);
      drawFn(c, layer.canvas);
      layer.adopt(next);
      if (layer.mask) layer.setMask(transformMask(layer.mask, w, h, drawFn));
      if (layer.text) {
        layer.text = textFn ? textFn(cloneText(layer.text)) : null;
      }
    }
    // the selection follows the pixels it selects
    let sel = null;
    if (keepSelection && this.selection) {
      sel = new Selection(w, h);
      drawFn(sel.ctx, this.selection.canvas);
    }
    this.width = Math.max(1, Math.round(w));
    this.height = Math.max(1, Math.round(h));
    this.setSelection(sel);
    this.clearFloating();
    this._allocBuffers();
    // keep text crisp instead of resampled
    for (const layer of this.layers) if (layer.text) layer.renderText();
  }

  /** Resample the artwork to a new pixel size. */
  scaleImage(w, h, smooth = true) {
    const sx = w / this.width;
    const sy = h / this.height;
    this._resizeAll(
      w,
      h,
      (c, src) => {
        c.imageSmoothingEnabled = smooth;
        c.imageSmoothingQuality = "high";
        c.drawImage(src, 0, 0, w, h);
      },
      Math.abs(sx - sy) < 0.01
        ? (tx) => ({ ...tx, x: tx.x * sx, y: tx.y * sy, size: tx.size * sx })
        : null
    );
  }

  /** Change the canvas bounds without scaling; anchor is like "top-left". */
  resizeCanvas(w, h, anchor = "center") {
    const [vy, vx] = anchorParts(anchor);
    const dx = Math.round((w - this.width) * vx);
    const dy = Math.round((h - this.height) * vy);
    this._resizeAll(
      w,
      h,
      (c, src) => c.drawImage(src, dx, dy),
      (tx) => ({ ...tx, x: tx.x + dx, y: tx.y + dy })
    );
  }

  crop(rect) {
    const x = Math.round(rect.x);
    const y = Math.round(rect.y);
    const w = Math.max(1, Math.round(rect.w));
    const h = Math.max(1, Math.round(rect.h));
    this._resizeAll(
      w,
      h,
      (c, src) => c.drawImage(src, -x, -y),
      (tx) => ({ ...tx, x: tx.x - x, y: tx.y - y }),
      { keepSelection: false }
    );
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

  /** The document changed size (undo of a crop, resize…): new scratch buffers. */
  setSize(w, h) {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this._allocBuffers();
  }

  /* ---------------------------- serialization ---------------------------- */

  /** Everything except bitmaps, shared by .paint files and the autosave. */
  _meta() {
    return {
      format: "paint-studio",
      version: 3,
      name: this.name,
      width: this.width,
      height: this.height,
      activeIndex: this.activeIndex,
    };
  }

  _layerMeta(l) {
    return {
      name: l.name,
      visible: l.visible,
      opacity: l.opacity,
      blend: l.blend,
      locked: l.locked,
      maskEnabled: l.maskEnabled,
      text: cloneText(l.text),
    };
  }

  toJSON() {
    return {
      ...this._meta(),
      layers: this.layers.map((l) => ({
        ...this._layerMeta(l),
        data: l.canvas.toDataURL("image/png"),
        mask: l.mask ? l.mask.toDataURL("image/png") : null,
      })),
    };
  }

  /**
   * Same content as toJSON with PNG Blobs instead of data URLs (IndexedDB).
   * Everything is captured in one go — toBlob() copies the bitmap the moment
   * it is called — so edits made while the PNGs encode can't mix two states.
   */
  toStorable() {
    // PNG encoding is the slow part: reuse the encoding of unchanged bitmaps
    const cache = (this._pngCache ||= new Map());
    const used = new Set();
    const blob = (key, c) => {
      used.add(key);
      let p = cache.get(key);
      if (!p) {
        p = new Promise((r) => c.toBlob(r, "image/png"));
        cache.set(key, p);
        // a failed encoding is not remembered: the next save tries again
        const forget = () => cache.get(key) === p && cache.delete(key);
        p.then((b) => b || forget(), forget);
      }
      return p;
    };
    const meta = this._meta();
    const pending = this.layers.map((l) => ({
      meta: this._layerMeta(l),
      data: blob(`p${l.id}@${l.pixelVersion}`, l.canvas),
      mask: l.mask ? blob(`m${l.id}@${l.maskVersion}`, l.mask) : null,
    }));
    for (const key of cache.keys()) if (!used.has(key)) cache.delete(key);
    return (async () => {
      const layers = [];
      for (const p of pending) {
        const data = await p.data;
        const mask = p.mask ? await p.mask : null;
        // a lost mask would show hidden pixels after a restore: fail instead
        if (!data || (p.mask && !mask)) throw new Error("Could not encode a layer");
        layers.push({ ...p.meta, data, mask });
      }
      return { ...meta, layers };
    })();
  }

  static async fromJSON(json) {
    if (!json || json.format !== "paint-studio") {
      throw new Error("Not a Paint Studio project file");
    }
    const width = Number(json.width);
    const height = Number(json.height);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
      throw new Error("Not a Paint Studio project file");
    }
    // only embedded images: a project must never make the browser fetch URLs
    const load = async (src) => {
      if (!src) return null;
      if (src instanceof Blob) {
        const url = URL.createObjectURL(src);
        try {
          return await loadImage(url);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      if (typeof src !== "string" || !/^data:image\/[\w.+-]+;base64,/i.test(src)) return null;
      return loadImage(src);
    };
    const k = fitScale(width, height);
    const doc = new Doc(Math.round(width * k), Math.round(height * k));
    const draw = (layerCanvas, image) => {
      const c = ctx2d(layerCanvas);
      c.drawImage(image, 0, 0, image.naturalWidth * k, image.naturalHeight * k);
    };
    doc.name = typeof json.name === "string" && json.name ? json.name : t("Untitled");
    // big project files hand the layers over one at a time (async iterable)
    const specs = json.layers;
    const list = Array.isArray(specs) || specs?.[Symbol.asyncIterator] ? specs : [];
    for await (const spec of list) {
      if (!spec || typeof spec !== "object") continue;
      const image = await load(spec.data);
      const layer = new Layer(doc.width, doc.height, {
        name: typeof spec.name === "string" ? spec.name : t("Layer"),
      });
      if (image) draw(layer.canvas, image);
      layer.visible = spec.visible !== false;
      const opacity = Number(spec.opacity);
      layer.opacity = Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : 1;
      layer.blend = BLEND_MODES.some(([v]) => v === spec.blend) ? spec.blend : "source-over";
      layer.locked = !!spec.locked;
      const mask = await load(spec.mask);
      if (mask) {
        const m = makeCanvas(doc.width, doc.height);
        draw(m, mask);
        layer.setMask(m);
      }
      layer.maskEnabled = spec.maskEnabled !== false;
      const tx = spec.text;
      layer.text =
        k === 1 && tx && typeof tx.value === "string" && tx.color && Number.isFinite(tx.size)
          ? cloneText(tx)
          : null;
      layer.touch();
      doc.layers.push(layer);
    }
    if (!doc.layers.length) doc.layers.push(new Layer(doc.width, doc.height));
    const active = Number(json.activeIndex);
    doc.setActive(Number.isInteger(active) ? active : doc.layers.length - 1);
    if (k < 1) doc.scaledFrom = { width, height };
    return doc;
  }
}

function anchorParts(anchor) {
  const v = anchor.includes("top") ? 0 : anchor.includes("bottom") ? 1 : 0.5;
  const h = anchor.includes("left") ? 0 : anchor.includes("right") ? 1 : 0.5;
  return [v, h];
}

export function unionRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

const padRect = (r, p) => ({ x: r.x - p, y: r.y - p, w: r.w + p * 2, h: r.h + p * 2 });

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
 * Draw `src` (a document-sized canvas) onto a paint target, honouring the
 * current selection. `replace` first erases the masked region so filter
 * output can fully replace the pixels underneath.
 *
 * On a mask target ordinary paint is translated: its brightness becomes mask
 * value (black hides, white reveals). With `replace` the source is taken to be
 * mask data already (filters convert to and from grayscale themselves).
 */
export function paintMasked(
  layer,
  src,
  selection,
  { replace = false, opacity = 1, blend = "source-over", erase = false, rect = null } = {}
) {
  if (layer.isMask && !replace) {
    paintMaskRegion(layer.canvas, layer.canvas, src, rect || { x: 0, y: 0, w: layer.width, h: layer.height }, {
      opacity,
      erase,
      selection,
    });
    layer.touch();
    return;
  }

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
  c.setTransform(1, 0, 0, 1, 0, 0);
  if (replace && selection) {
    // out = old·(1−s) + new·s: erase by the selection, then *add* the masked
    // result. A plain source-over would leave soft selection edges partly
    // transparent (s + (1−s)² < 1).
    c.globalCompositeOperation = "destination-out";
    c.drawImage(selection.canvas, 0, 0);
    c.globalAlpha = opacity;
    c.globalCompositeOperation = "lighter";
    c.drawImage(source, 0, 0);
  } else {
    if (replace) c.clearRect(0, 0, layer.width, layer.height);
    c.globalAlpha = opacity;
    c.globalCompositeOperation = erase ? "destination-out" : blend;
    c.drawImage(source, 0, 0);
  }
  c.restore();
  layer.touch();
}
