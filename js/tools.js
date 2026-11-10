/* ==========================================================================
   Tools — painting, retouching, shapes, text, selections and navigation.

   Every tool is a plain object with an option schema (rendered by the options
   bar) and pointer callbacks. Strokes are drawn into a document-sized floating
   buffer that is composited above the active layer, then flattened into the
   layer on pointer-up. That keeps semi-transparent strokes from darkening
   where they overlap, makes previews free, and gives one undo step per stroke.
   ========================================================================== */

import { clamp, colorDelta, cssColor } from "./color.js";
import {
  LINE_HEIGHT,
  Selection,
  alphaBounds,
  copyCanvas,
  ctx2d,
  fontString,
  makeCanvas,
  paintMasked,
  textBounds,
  transformMask,
} from "./doc.js";
import { gaussData, unsharp } from "./filters.js";
import { addTextLayer, paintText, setActiveLayer, updateTextLayer } from "./actions.js";
import { t } from "./i18n.js";
import {
  beginEdit,
  beginPixelEdit,
  editPixels,
  editSelection,
} from "./history.js";
import { overlay, requestRender } from "./render.js";
import { emit, on, opt, recordRecent, setColor, setOpt, state } from "./state.js";
import { view } from "./viewport.js";

const TAU = Math.PI * 2;

/** Shared scratch context for text measurement. */
let _measure = null;
function measureCtx() {
  if (!_measure) _measure = makeCanvas(8, 8).getContext("2d");
  return _measure;
}

/* ========================================================================== */
/*  Shared painting helpers                                                   */
/* ========================================================================== */

const stroke = {
  active: false,
  buf: null,
  bctx: null,
  last: null,
  residual: 0,
  smoothed: null,
};

function beginFloating({ mode = "normal", opacity = 1, blend = "source-over" } = {}) {
  const doc = state.doc;
  const buf = makeCanvas(doc.width, doc.height);
  stroke.buf = buf;
  stroke.bctx = ctx2d(buf);
  stroke.residual = 0;
  stroke.active = true;
  doc.setFloating(buf, { mode, opacity, blend });
  return stroke.bctx;
}

function endFloating(label, { erase = false, opacity = 1, blend = "source-over" } = {}) {
  const doc = state.doc;
  const buf = stroke.buf;
  stroke.active = false;
  stroke.buf = null;
  stroke.bctx = null;
  stroke.last = null;
  stroke.smoothed = null;
  doc.clearFloating();
  if (!buf) return;
  const layer = doc.target;
  if (!layer || layer.locked) {
    requestRender();
    return;
  }
  editPixels(
    label,
    () => paintMasked(layer, buf, doc.selection, { opacity, blend, erase }),
    layer
  );
  emit("layers", doc);
  requestRender();
}

function abortFloating() {
  stroke.active = false;
  stroke.buf = null;
  stroke.bctx = null;
  stroke.last = null;
  stroke.smoothed = null;
  state.doc?.clearFloating();
  requestRender();
}

/* -------------------------------- brush tip ------------------------------- */

const tipCache = new Map();

function brushTip(size, hardness, color) {
  const s = Math.max(1, Math.ceil(size));
  const key = `${s}|${hardness.toFixed(2)}|${color.r},${color.g},${color.b}`;
  const hit = tipCache.get(key);
  if (hit) return hit;

  const pad = 2;
  const dim = s + pad * 2;
  const c = makeCanvas(dim, dim);
  const cc = ctx2d(c);
  const cx = dim / 2;
  const r = s / 2;
  const solid = `rgb(${color.r},${color.g},${color.b})`;

  if (hardness >= 0.995) {
    cc.fillStyle = solid;
    cc.beginPath();
    cc.arc(cx, cx, r, 0, TAU);
    cc.fill();
  } else {
    const g = cc.createRadialGradient(cx, cx, 0, cx, cx, r);
    const core = Math.max(0, Math.min(0.95, hardness));
    // a few stops give a smoother falloff than a plain two-stop gradient
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const pos = core + (1 - core) * t;
      const a = Math.pow(1 - t, 1.7);
      g.addColorStop(Math.min(1, pos), `rgba(${color.r},${color.g},${color.b},${a})`);
    }
    cc.fillStyle = g;
    cc.beginPath();
    cc.arc(cx, cx, r, 0, TAU);
    cc.fill();
  }

  if (tipCache.size > 60) tipCache.clear();
  tipCache.set(key, c);
  return c;
}

function stamp(ctx, x, y, size, hardness, color) {
  const tip = brushTip(size, hardness, color);
  ctx.drawImage(tip, x - tip.width / 2, y - tip.height / 2);
}

/** Walk a segment laying down stamps at a fixed spacing. */
function stampSegment(ctx, from, to, size, hardness, color, spacingFactor) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  const spacing = Math.max(0.6, size * spacingFactor);
  let t = stroke.residual;
  if (dist === 0) {
    if (stroke.residual === 0) {
      stamp(ctx, to.x, to.y, size, hardness, color);
      stroke.residual = spacing;
    }
    return;
  }
  while (t <= dist) {
    const k = t / dist;
    stamp(ctx, from.x + dx * k, from.y + dy * k, size, hardness, color);
    t += spacing;
  }
  stroke.residual = t - dist;
}

/** Pointer pressure, but only from real pens — mice report a constant 0.5. */
function pressureOf(ev) {
  if (ev.e?.pointerType === "pen" && ev.e.pressure > 0) return ev.e.pressure;
  return 1;
}

function sizeFor(ev, base) {
  if (!opt("pressure")) return base;
  const p = pressureOf(ev);
  return Math.max(0.6, base * (0.25 + 0.75 * p));
}

/** Light exponential smoothing removes hand jitter without adding lag. */
function smoothPoint(p, amount) {
  if (!stroke.smoothed || amount <= 0) {
    stroke.smoothed = { x: p.x, y: p.y };
    return stroke.smoothed;
  }
  const k = 1 - amount;
  stroke.smoothed = {
    x: stroke.smoothed.x + (p.x - stroke.smoothed.x) * k,
    y: stroke.smoothed.y + (p.y - stroke.smoothed.y) * k,
  };
  return stroke.smoothed;
}

/** Document-space box a stamped segment can touch (for partial updates). */
function segRect(a, b, size) {
  const r = size / 2 + 3;
  const x = Math.min(a.x, b.x) - r;
  const y = Math.min(a.y, b.y) - r;
  return { x, y, w: Math.abs(a.x - b.x) + r * 2, h: Math.abs(a.y - b.y) + r * 2 };
}

/* ----------------------------- region retouch ---------------------------- */

const maskCache = new Map();

function softMask(size, hardness) {
  const s = Math.max(1, Math.ceil(size));
  const key = `${s}|${hardness.toFixed(2)}`;
  const hit = maskCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(s, s);
  const cc = ctx2d(c);
  const r = s / 2;
  const g = cc.createRadialGradient(r, r, r * Math.min(0.9, hardness), r, r, r);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  cc.fillStyle = g;
  cc.beginPath();
  cc.arc(r, r, r, 0, TAU);
  cc.fill();
  if (maskCache.size > 40) maskCache.clear();
  maskCache.set(key, c);
  return c;
}

/**
 * Grab the square patch under the brush, let `produce` transform it, then
 * composite it back through a soft round mask (and the selection, if any).
 */
function retouchPatch(layer, cx, cy, radius, hardness, alpha, produce, source = layer.canvas) {
  const size = Math.max(2, Math.ceil(radius * 2));
  const x0 = Math.round(cx - size / 2);
  const y0 = Math.round(cy - size / 2);
  if (x0 + size < 0 || y0 + size < 0 || x0 > layer.width || y0 > layer.height) return;

  const patch = makeCanvas(size, size);
  const pc = ctx2d(patch);
  pc.drawImage(source, -x0, -y0);

  const produced = produce(patch, pc, { x0, y0, size }) || patch;

  const masked = makeCanvas(size, size);
  const mc = ctx2d(masked);
  mc.drawImage(produced, 0, 0);
  mc.globalCompositeOperation = "destination-in";
  mc.drawImage(softMask(size, hardness), 0, 0);

  const sel = state.doc.selection;
  if (sel) {
    mc.globalCompositeOperation = "destination-in";
    mc.drawImage(sel.canvas, -x0, -y0);
  }

  const c = layer.ctx;
  c.save();
  c.globalAlpha = clamp(alpha, 0, 1);
  c.drawImage(masked, x0, y0);
  c.restore();
  layer.touch();
}

function boxBlurCanvas(canvas, radius) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rr = 0,
        gg = 0,
        bb = 0,
        aa = 0,
        n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const sy = y + dy;
        if (sy < 0 || sy >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const sx = x + dx;
          if (sx < 0 || sx >= w) continue;
          const i = (sy * w + sx) * 4;
          rr += src[i];
          gg += src[i + 1];
          bb += src[i + 2];
          aa += src[i + 3];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = rr / n;
      out[o + 1] = gg / n;
      out[o + 2] = bb / n;
      out[o + 3] = aa / n;
    }
  }
  img.data.set(out);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* ------------------------------- flood fill ------------------------------- */

/**
 * Scanline flood fill. Returns a Uint8Array coverage mask (0 or 255) the size
 * of the image, or null when the click lands outside.
 */
function floodMask(img, sx, sy, tolerance, contiguous) {
  const { width: w, height: h, data } = img;
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return null;
  const mask = new Uint8Array(w * h);
  const si = (sy * w + sx) * 4;
  const tr = data[si],
    tg = data[si + 1],
    tb = data[si + 2],
    ta = data[si + 3];
  const tol = tolerance / 100;

  const matches = (i) =>
    colorDelta(data[i], data[i + 1], data[i + 2], data[i + 3], tr, tg, tb, ta) <=
    tol;

  if (!contiguous) {
    for (let p = 0; p < w * h; p++) if (matches(p * 4)) mask[p] = 255;
    return mask;
  }

  const stack = [sx, sy];
  while (stack.length) {
    const y = stack.pop();
    let x = stack.pop();
    let p = y * w + x;
    if (mask[p]) continue;
    // walk left
    while (x > 0 && !mask[p - 1] && matches((p - 1) * 4)) {
      x--;
      p--;
    }
    let spanUp = false;
    let spanDown = false;
    let cx = x;
    let cp = p;
    while (cx < w && !mask[cp] && matches(cp * 4)) {
      mask[cp] = 255;
      if (y > 0) {
        const up = cp - w;
        const isUp = !mask[up] && matches(up * 4);
        if (isUp && !spanUp) {
          stack.push(cx, y - 1);
          spanUp = true;
        } else if (!isUp) spanUp = false;
      }
      if (y < h - 1) {
        const dn = cp + w;
        const isDn = !mask[dn] && matches(dn * 4);
        if (isDn && !spanDown) {
          stack.push(cx, y + 1);
          spanDown = true;
        } else if (!isDn) spanDown = false;
      }
      cx++;
      cp++;
    }
  }
  return mask;
}

function maskToCanvas(mask, w, h) {
  const c = makeCanvas(w, h);
  const cc = ctx2d(c);
  const img = cc.createImageData(w, h);
  const d = img.data;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = mask[p];
  }
  cc.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------ shape helpers ----------------------------- */

function normalizedRect(a, b, { square = false, fromCenter = false } = {}) {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx) * m || m;
    dy = Math.sign(dy) * m || m;
  }
  if (fromCenter) {
    return { x: a.x - dx, y: a.y - dy, w: dx * 2, h: dy * 2 };
  }
  return { x: dx < 0 ? a.x + dx : a.x, y: dy < 0 ? a.y + dy : a.y, w: Math.abs(dx), h: Math.abs(dy) };
}

function snapRect(r) {
  const x = Math.round(r.x);
  const y = Math.round(r.y);
  return { x, y, w: Math.round(r.x + r.w) - x, h: Math.round(r.y + r.h) - y };
}

function roundRectPath(ctx, r, radius) {
  const rad = Math.min(radius, Math.abs(r.w) / 2, Math.abs(r.h) / 2);
  ctx.beginPath();
  if (rad > 0 && ctx.roundRect) ctx.roundRect(r.x, r.y, r.w, r.h, rad);
  else ctx.rect(r.x, r.y, r.w, r.h);
}

function polygonPath(ctx, r, sides, star) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = Math.abs(r.w / 2);
  const ry = Math.abs(r.h / 2);
  const n = star ? sides * 2 : sides;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / n) * TAU;
    const k = star && i % 2 ? 0.44 : 1;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function paintShape(ctx, drawPath, o) {
  const strokeCol = cssColor(state.primary);
  const fillCol = cssColor(state.secondary);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  drawPath(ctx);
  if (o.fillMode === "fill" || o.fillMode === "both") {
    ctx.fillStyle = o.fillMode === "fill" ? strokeCol : fillCol;
    ctx.fill();
  }
  if (o.fillMode !== "fill") {
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = o.width;
    ctx.stroke();
  }
  ctx.restore();
}

/* ========================================================================== */
/*  Tool definitions                                                          */
/* ========================================================================== */

const RANGE = (key, label, min, max, def, extra = {}) => ({
  key,
  type: "range",
  label,
  min,
  max,
  def,
  step: 1,
  ...extra,
});

const sizeOpt = (def = 24, max = 400) => RANGE("size", t("Size"), 1, max, def, { unit: "px" });
const opacityOpt = (def = 100) => RANGE("opacity", t("Opacity"), 1, 100, def, { unit: "%" });
const hardnessOpt = (def = 80) => RANGE("hardness", t("Hardness"), 0, 100, def, { unit: "%" });
const smoothOpt = (def = 35) => RANGE("smooth", t("Smoothing"), 0, 90, def, { unit: "%" });
const pressureOpt = { key: "pressure", type: "toggle", label: t("Pen pressure"), def: true };

const fillModeOpt = {
  key: "fillMode",
  type: "seg",
  label: t("Style"),
  def: "stroke",
  options: [
    ["stroke", t("Outline")],
    ["fill", t("Solid")],
    ["both", t("Both")],
  ],
};

const selectModeOpt = {
  key: "mode",
  type: "seg",
  label: t("Mode"),
  def: "replace",
  options: [
    ["replace", t("New")],
    ["add", t("Add")],
    ["subtract", t("Subtract")],
    ["intersect", t("Intersect")],
  ],
};

const featherOpt = RANGE("feather", t("Feather"), 0, 40, 0, { unit: "px" });

/* ------------------------------- paint tools ------------------------------ */

function paintTool({ id, label, icon, shortcut, group, erase = false, defaults = {} }) {
  return {
    id,
    label,
    icon,
    shortcut,
    group,
    cursor: "none",
    brushCursor: true,
    needsLayer: true,
    opts: [
      sizeOpt(defaults.size ?? 24),
      opacityOpt(defaults.opacity ?? 100),
      hardnessOpt(defaults.hardness ?? 80),
      smoothOpt(defaults.smooth ?? 35),
      pressureOpt,
    ],
    down(ev) {
      const o = {
        size: opt("size"),
        opacity: opt("opacity") / 100,
        hardness: opt("hardness") / 100,
        smooth: opt("smooth") / 100,
      };
      const ctx = beginFloating({
        mode: erase ? "erase" : "normal",
        opacity: o.opacity,
      });
      stroke.smoothed = null;
      const p = smoothPoint(ev.p, 0);
      stamp(ctx, p.x, p.y, sizeFor(ev, o.size), o.hardness, state.primary);
      stroke.residual = Math.max(0.6, o.size * 0.14);
      stroke.last = p;
      state.doc.floatingChanged(segRect(p, p, o.size));
      requestRender();
    },
    move(ev) {
      if (!stroke.active) return;
      const o = {
        size: opt("size"),
        hardness: opt("hardness") / 100,
        smooth: opt("smooth") / 100,
      };
      const p = smoothPoint(ev.p, o.smooth * 0.8);
      stampSegment(
        stroke.bctx,
        stroke.last,
        p,
        sizeFor(ev, o.size),
        o.hardness,
        state.primary,
        0.14
      );
      state.doc.floatingChanged(segRect(stroke.last, p, o.size));
      stroke.last = p;
      requestRender();
    },
    up() {
      endFloating(label, { erase, opacity: opt("opacity") / 100 });
    },
    cancel: abortFloating,
  };
}

const brush = paintTool({
  id: "brush",
  label: t("Brush"),
  icon: "i-brush",
  shortcut: "b",
  group: "Paint",
});

const pencil = {
  ...paintTool({
    id: "pencil",
    label: t("Pencil"),
    icon: "i-pencil",
    shortcut: "n",
    group: "Paint",
    defaults: { size: 3, hardness: 100, smooth: 10 },
  }),
  opts: [sizeOpt(3, 64), opacityOpt(100), smoothOpt(10), pressureOpt],
};
// the pencil always paints hard-edged
pencil.down = function down(ev) {
  const size = opt("size");
  const ctx = beginFloating({ opacity: opt("opacity") / 100 });
  stroke.smoothed = null;
  const p = smoothPoint(ev.p, 0);
  stamp(ctx, p.x, p.y, sizeFor(ev, size), 1, state.primary);
  stroke.residual = Math.max(0.5, size * 0.1);
  stroke.last = p;
  state.doc.floatingChanged(segRect(p, p, size));
  requestRender();
};
pencil.move = function move(ev) {
  if (!stroke.active) return;
  const p = smoothPoint(ev.p, (opt("smooth") / 100) * 0.8);
  stampSegment(stroke.bctx, stroke.last, p, sizeFor(ev, opt("size")), 1, state.primary, 0.1);
  state.doc.floatingChanged(segRect(stroke.last, p, opt("size")));
  stroke.last = p;
  requestRender();
};

const eraser = paintTool({
  id: "eraser",
  label: t("Eraser"),
  icon: "i-eraser",
  shortcut: "e",
  group: "Paint",
  erase: true,
  defaults: { size: 40, hardness: 60 },
});

const airbrush = {
  id: "airbrush",
  label: t("Airbrush"),
  icon: "i-spray",
  shortcut: "a",
  group: "Paint",
  cursor: "none",
  brushCursor: true,
  needsLayer: true,
  opts: [sizeOpt(60), opacityOpt(65), RANGE("flow", t("Flow"), 1, 100, 35, { unit: "%" })],
  _timer: 0,
  _pos: null,
  down(ev) {
    beginFloating({ opacity: opt("opacity") / 100 });
    this._pos = ev.p;
    const spray = () => {
      if (!stroke.active || !this._pos) return;
      const size = opt("size");
      const flow = opt("flow") / 100;
      const ctx = stroke.bctx;
      const r = size / 2;
      const dots = Math.max(1, Math.round(flow * size * 0.4));
      ctx.fillStyle = cssColor({ ...state.primary, a: 0.16 + flow * 0.2 });
      for (let i = 0; i < dots; i++) {
        const a = Math.random() * TAU;
        const d = Math.sqrt(Math.random()) * r;
        const x = this._pos.x + Math.cos(a) * d;
        const y = this._pos.y + Math.sin(a) * d;
        const dotR = Math.max(0.5, size * 0.02);
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, TAU);
        ctx.fill();
      }
      state.doc.floatingChanged(segRect(this._pos, this._pos, size));
      requestRender();
    };
    spray();
    this._timer = setInterval(spray, 45);
  },
  move(ev) {
    this._pos = ev.p;
  },
  up() {
    clearInterval(this._timer);
    this._timer = 0;
    this._pos = null;
    endFloating(t("Airbrush"), { opacity: opt("opacity") / 100 });
  },
  cancel() {
    clearInterval(this._timer);
    this._timer = 0;
    abortFloating();
  },
};

/* -------------------------------- fill tools ------------------------------ */

const bucket = {
  id: "bucket",
  label: t("Fill"),
  icon: "i-bucket",
  shortcut: "g",
  group: "Fill",
  cursor: "crosshair",
  needsLayer: true,
  opts: [
    RANGE("tolerance", t("Tolerance"), 0, 100, 18, { unit: "%" }),
    opacityOpt(100),
    RANGE("grow", t("Expand"), 0, 3, 1, { unit: "px" }),
    { key: "contiguous", type: "toggle", label: t("Contiguous"), def: true },
    { key: "sampleAll", type: "toggle", label: t("Sample all layers"), def: false },
  ],
  down(ev) {
    const doc = state.doc;
    const layer = doc.target;
    if (!layer || layer.locked) return;
    const x = Math.floor(ev.p.x);
    const y = Math.floor(ev.p.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;

    const source = opt("sampleAll") ? doc.composite() : layer.canvas;
    const img = source
      .getContext("2d")
      .getImageData(0, 0, doc.width, doc.height);
    const mask = floodMask(img, x, y, opt("tolerance"), !!opt("contiguous"));
    if (!mask) return;

    let maskCanvas = maskToCanvas(mask, doc.width, doc.height);
    const grow = opt("grow");
    if (grow > 0) {
      // dilate slightly so fills tuck under anti-aliased outlines
      const grown = makeCanvas(doc.width, doc.height);
      const gc = ctx2d(grown);
      for (let dy = -grow; dy <= grow; dy++) {
        for (let dx = -grow; dx <= grow; dx++) {
          if (dx * dx + dy * dy > grow * grow) continue;
          gc.drawImage(maskCanvas, dx, dy);
        }
      }
      maskCanvas = grown;
    }

    const paint = makeCanvas(doc.width, doc.height);
    const pc = ctx2d(paint);
    pc.fillStyle = cssColor(state.primary);
    pc.fillRect(0, 0, doc.width, doc.height);
    pc.globalCompositeOperation = "destination-in";
    pc.drawImage(maskCanvas, 0, 0);

    editPixels(
      t("Fill"),
      () =>
        paintMasked(layer, paint, doc.selection, {
          opacity: opt("opacity") / 100,
        }),
      layer
    );
    emit("layers", doc);
    requestRender();
  },
};

const gradient = {
  id: "gradient",
  label: t("Gradient"),
  icon: "i-gradient",
  shortcut: "d",
  group: "Fill",
  cursor: "crosshair",
  needsLayer: true,
  opts: [
    {
      key: "type",
      type: "seg",
      label: t("Type"),
      def: "linear",
      options: [
        ["linear", t("Linear")],
        ["radial", t("Radial")],
      ],
    },
    {
      key: "colors",
      type: "select",
      label: t("Colors"),
      def: "duo",
      options: [
        ["duo", t("Primary → Secondary")],
        ["fade", t("Primary → Transparent")],
        ["fadeIn", t("Transparent → Primary")],
      ],
    },
    opacityOpt(100),
  ],
  _start: null,
  down(ev) {
    if (!state.doc.target || state.doc.target.locked) return;
    this._start = ev.p;
    beginFloating({ opacity: opt("opacity") / 100 });
    this.move(ev);
  },
  move(ev) {
    if (!stroke.active || !this._start) return;
    const doc = state.doc;
    const ctx = stroke.bctx;
    ctx.clearRect(0, 0, doc.width, doc.height);
    const a = this._start;
    let b = ev.p;
    if (ev.shift) {
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      b = dx > dy ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
    }

    const kind = opt("colors");
    const c1 = kind === "fadeIn" ? { ...state.primary, a: 0 } : state.primary;
    const c2 =
      kind === "duo"
        ? state.secondary
        : kind === "fade"
        ? { ...state.primary, a: 0 }
        : state.primary;

    let g;
    if (opt("type") === "radial") {
      const r = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
      g = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r);
    } else {
      g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
    }
    g.addColorStop(0, cssColor(c1));
    g.addColorStop(1, cssColor(c2));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, doc.width, doc.height);
    doc.floatingChanged();
    requestRender();
  },
  up() {
    this._start = null;
    endFloating(t("Gradient"), { opacity: opt("opacity") / 100 });
  },
  cancel() {
    this._start = null;
    abortFloating();
  },
};

/* ------------------------------ retouch tools ----------------------------- */

function retouchTool({ id, label, icon, shortcut, defaults = {}, produce, useSnapshot = false }) {
  return {
    id,
    label,
    icon,
    shortcut,
    group: "Retouch",
    cursor: "none",
    brushCursor: true,
    needsLayer: true,
    opts: [
      sizeOpt(defaults.size ?? 60),
      RANGE("strength", t("Strength"), 1, 100, defaults.strength ?? 50, { unit: "%" }),
      hardnessOpt(defaults.hardness ?? 50),
    ],
    _edit: null,
    _last: null,
    _snap: null,
    _stamped: false,
    down(ev) {
      const layer = state.doc.target;
      if (!layer || layer.locked) return;
      this._edit = beginPixelEdit(layer);
      this._snap = useSnapshot ? copyCanvas(layer.canvas) : null;
      this._last = ev.p;
      this._stamped = false;
      this.move(ev);
    },
    move(ev) {
      if (!this._edit) return;
      const layer = state.doc.target;
      const size = opt("size");
      const strength = opt("strength") / 100;
      const hardness = opt("hardness") / 100;
      const spacing = Math.max(1.5, size * 0.2);
      const from = this._last || ev.p;
      const dist = Math.hypot(ev.p.x - from.x, ev.p.y - from.y);
      if (this._stamped && dist < spacing) return;
      const steps = Math.max(1, Math.round(dist / spacing));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        produce({
          layer,
          x: from.x + (ev.p.x - from.x) * k,
          y: from.y + (ev.p.y - from.y) * k,
          radius: size / 2,
          hardness,
          strength,
          prev: from,
          snapshot: this._snap,
          tool: this,
        });
      }
      this._last = ev.p;
      this._stamped = true;
      requestRender();
    },
    up() {
      if (!this._edit) return;
      this._edit.commit(label);
      this._edit = null;
      this._last = null;
      this._snap = null;
      emit("layers", state.doc);
    },
    cancel() {
      if (this._edit) this._edit.rollback();
      this._edit = null;
      this._last = null;
      this._snap = null;
    },
  };
}

const blurTool = retouchTool({
  id: "blurBrush",
  label: t("Blur"),
  icon: "i-blur",
  shortcut: "u",
  produce: ({ layer, x, y, radius, hardness, strength }) => {
    retouchPatch(layer, x, y, radius, hardness, Math.min(1, strength * 0.9), (patch) =>
      boxBlurCanvas(patch, 1 + strength * 3)
    );
  },
});

const sharpenTool = retouchTool({
  id: "sharpenBrush",
  label: t("Sharpen"),
  icon: "i-sharpen",
  shortcut: "k",
  defaults: { strength: 40 },
  produce: ({ layer, x, y, radius, hardness, strength }) => {
    retouchPatch(layer, x, y, radius, hardness, Math.min(1, strength * 0.7), (patch) =>
      unsharp(patch, strength * 1.1, 1)
    );
  },
});

const smudgeTool = retouchTool({
  id: "smudge",
  label: t("Smudge"),
  icon: "i-smudge",
  shortcut: "s",
  defaults: { strength: 60, hardness: 40 },
  produce: ({ layer, x, y, radius, hardness, strength, prev }) => {
    const dx = x - prev.x;
    const dy = y - prev.y;
    if (!dx && !dy) return;
    // drag the pixels from the previous position into the current one
    retouchPatch(
      layer,
      x,
      y,
      radius,
      hardness,
      Math.min(0.85, strength),
      (patch, pc, { x0, y0, size }) => {
        pc.clearRect(0, 0, size, size);
        pc.drawImage(layer.canvas, -x0 + -dx * 0.9, -y0 + -dy * 0.9);
        return patch;
      }
    );
  },
});

/* ------------------------------ healing tools ----------------------------- */

/**
 * Healing: keep the texture (high frequencies) of the source but the colour
 * and light (low frequencies) of the destination, so the repair blends in.
 */
function healPatch(src, dst, size, sigma) {
  const lowS = gaussData(src, size, size, sigma);
  const lowD = gaussData(dst, size, size, sigma);
  const out = new Uint8ClampedArray(dst.length);
  for (let i = 0; i < dst.length; i += 4) {
    out[i] = src[i] - lowS[i] + lowD[i];
    out[i + 1] = src[i + 1] - lowS[i + 1] + lowD[i + 1];
    out[i + 2] = src[i + 2] - lowS[i + 2] + lowD[i + 2];
    out[i + 3] = dst[i + 3];
  }
  return out;
}

/** Alt-click sets a source; the offset sticks between strokes when aligned. */
function withSource(tool, setMsg, missingMsg) {
  const baseDown = tool.down;
  const baseUp = tool.up;
  tool._offset = null;
  tool._source = null;
  tool.down = function down(ev) {
    if (ev.alt) {
      this._source = { x: ev.p.x, y: ev.p.y };
      this._offset = null;
      overlay.cloneSrc = this._source;
      emit("toast", { msg: setMsg, kind: "ok" });
      requestRender();
      return;
    }
    if (!this._source) {
      emit("toast", { msg: missingMsg, kind: "err" });
      return;
    }
    if (!this._offset || !opt("aligned")) {
      this._offset = { dx: this._source.x - ev.p.x, dy: this._source.y - ev.p.y };
    }
    baseDown.call(this, ev);
  };
  tool.up = function up(ev) {
    baseUp.call(this, ev);
  };
  tool.activate = function activate() {
    if (this._source) overlay.cloneSrc = this._source;
  };
  tool.deactivate = function deactivate() {
    overlay.cloneSrc = null;
  };
  return tool;
}

const healTool = withSource(
  retouchTool({
    id: "heal",
    label: t("Healing brush"),
    icon: "i-heal",
    defaults: { strength: 100, hardness: 50, size: 50 },
    useSnapshot: true,
    produce: ({ layer, x, y, radius, hardness, strength, tool, snapshot }) => {
      if (!tool._offset) return;
      const { dx, dy } = tool._offset;
      retouchPatch(layer, x, y, radius, hardness, strength, (patch, pc, { x0, y0, size }) => {
        const dst = pc.getImageData(0, 0, size, size);
        const srcCanvas = makeCanvas(size, size);
        const sc = ctx2d(srcCanvas);
        sc.drawImage(snapshot || layer.canvas, -x0 + dx, -y0 + dy);
        const src = sc.getImageData(0, 0, size, size);
        dst.data.set(healPatch(src.data, dst.data, size, Math.max(2, size / 7)));
        pc.putImageData(dst, 0, 0);
        return patch;
      });
    },
  }),
  t("Healing source set"),
  t("Alt-click to set the healing source first")
);
healTool.opts = [
  sizeOpt(50),
  RANGE("strength", t("Strength"), 1, 100, 100, { unit: "%" }),
  hardnessOpt(50),
  { key: "aligned", type: "toggle", label: t("Aligned"), def: true },
];

/* ----------------------------- spot healing ------------------------------ */

/**
 * Fill holes smoothly from their surroundings ("pull-push"): average known
 * pixels down a pyramid until everything is covered, then blend back up.
 * Returns straight RGBA floats for the whole region.
 */
function pullPush(data, hole, w, h) {
  const levels = [];
  let c = new Float32Array(w * h * 4);
  let wt = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (hole[i]) continue;
    wt[i] = 1;
    c[i * 4] = data[i * 4];
    c[i * 4 + 1] = data[i * 4 + 1];
    c[i * 4 + 2] = data[i * 4 + 2];
    c[i * 4 + 3] = data[i * 4 + 3];
  }
  levels.push({ w, h, c, wt });
  let lw = w;
  let lh = h;
  while (lw > 1 || lh > 1) {
    const nw = Math.max(1, Math.ceil(lw / 2));
    const nh = Math.max(1, Math.ceil(lh / 2));
    const nc = new Float32Array(nw * nh * 4);
    const nwt = new Float32Array(nw * nh);
    const prev = levels[levels.length - 1];
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let sw = 0;
        let r = 0,
          g = 0,
          b = 0,
          a = 0;
        for (let dy = 0; dy < 2; dy++) {
          const sy = Math.min(lh - 1, y * 2 + dy);
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(lw - 1, x * 2 + dx);
            const si = sy * lw + sx;
            const k = prev.wt[si];
            if (!k) continue;
            sw += k;
            r += prev.c[si * 4] * k;
            g += prev.c[si * 4 + 1] * k;
            b += prev.c[si * 4 + 2] * k;
            a += prev.c[si * 4 + 3] * k;
          }
        }
        const ni = y * nw + x;
        if (sw > 0) {
          nc[ni * 4] = r / sw;
          nc[ni * 4 + 1] = g / sw;
          nc[ni * 4 + 2] = b / sw;
          nc[ni * 4 + 3] = a / sw;
          nwt[ni] = Math.min(1, sw);
        }
      }
    }
    levels.push({ w: nw, h: nh, c: nc, wt: nwt });
    lw = nw;
    lh = nh;
  }
  for (let L = levels.length - 2; L >= 0; L--) {
    const fine = levels[L];
    const coarse = levels[L + 1];
    for (let y = 0; y < fine.h; y++) {
      for (let x = 0; x < fine.w; x++) {
        const i = y * fine.w + x;
        const k = fine.wt[i];
        if (k >= 1) continue;
        // bilinear sample of the coarser level
        const fx = Math.min(coarse.w - 1, Math.max(0, (x + 0.5) / 2 - 0.5));
        const fy = Math.min(coarse.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const x1 = Math.min(coarse.w - 1, x0 + 1);
        const y1 = Math.min(coarse.h - 1, y0 + 1);
        const tx = fx - x0;
        const ty = fy - y0;
        for (let ch = 0; ch < 4; ch++) {
          const v =
            (coarse.c[(y0 * coarse.w + x0) * 4 + ch] * (1 - tx) +
              coarse.c[(y0 * coarse.w + x1) * 4 + ch] * tx) *
              (1 - ty) +
            (coarse.c[(y1 * coarse.w + x0) * 4 + ch] * (1 - tx) +
              coarse.c[(y1 * coarse.w + x1) * 4 + ch] * tx) *
              ty;
          fine.c[i * 4 + ch] = fine.c[i * 4 + ch] * k + v * (1 - k);
        }
        fine.wt[i] = 1;
      }
    }
  }
  return levels[0].c;
}

/** Repair the painted area of `target`: smooth fill plus borrowed texture. */
function spotHealRegion(target, strokeBuf, bounds, selection, size) {
  const W = target.width;
  const H = target.height;
  const pad = Math.ceil(size * 0.8) + 6;
  const x = Math.max(0, bounds.x - pad);
  const y = Math.max(0, bounds.y - pad);
  const w = Math.min(W, bounds.x + bounds.w + pad) - x;
  const h = Math.min(H, bounds.y + bounds.h + pad) - y;
  if (w < 3 || h < 3) return;

  const ctx = target.ctx;
  const img = ctx.getImageData(x, y, w, h);
  const D = img.data;
  const strokeA = strokeBuf.getContext("2d").getImageData(x, y, w, h).data;
  const selA = selection ? selection.ctx.getImageData(x, y, w, h).data : null;

  // hole = painted pixels (slightly grown), limited to the selection
  const raw = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    raw[i] = strokeA[i * 4 + 3] > 24 && (!selA || selA[i * 4 + 3] > 127) ? 1 : 0;
  }
  const hole = new Uint8Array(w * h);
  const grow = 2;
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      let on = 0;
      for (let dy = -grow; dy <= grow && !on; dy++) {
        const sy = yy + dy;
        if (sy < 0 || sy >= h) continue;
        for (let dx = -grow; dx <= grow; dx++) {
          const sx = xx + dx;
          if (sx >= 0 && sx < w && raw[sy * w + sx]) {
            on = 1;
            break;
          }
        }
      }
      hole[yy * w + xx] = on;
    }
  }

  const fill = pullPush(D, hole, w, h);

  // borrow texture from the neighbouring patch that best matches the border
  const hb = { x: bounds.x - x, y: bounds.y - y, w: bounds.w, h: bounds.h };
  let best = null;
  const span = Math.max(hb.w, hb.h);
  for (const dist of [1.1, 1.6, 2.3]) {
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU;
      const ox = Math.round(Math.cos(ang) * span * dist);
      const oy = Math.round(Math.sin(ang) * span * dist);
      if (x + ox < 0 || y + oy < 0 || x + ox + w > W || y + oy + h > H) continue;
      const src = ctx.getImageData(x + ox, y + oy, w, h).data;
      let score = 0;
      let n = 0;
      for (let i = 0; i < w * h; i += 3) {
        if (hole[i]) continue;
        const p = i * 4;
        score += Math.abs(D[p] - src[p]) + Math.abs(D[p + 1] - src[p + 1]) + Math.abs(D[p + 2] - src[p + 2]);
        n++;
      }
      // a source full of holes itself would copy the defect
      const overlap =
        Math.abs(ox) < hb.w && Math.abs(oy) < hb.h ? 1e9 : 0;
      const s = (n ? score / n : 1e9) + overlap;
      if (!best || s < best.score) best = { score: s, src };
    }
  }

  // feathered blend factor so the repair has no hard seam
  const soft = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) soft[i * 4 + 3] = hole[i] * 255;
  const feather = gaussData(soft, w, h, 1.6);

  let tex = null;
  if (best) {
    const low = gaussData(best.src, w, h, Math.max(2, size / 6));
    tex = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      tex[i * 3] = best.src[i * 4] - low[i * 4];
      tex[i * 3 + 1] = best.src[i * 4 + 1] - low[i * 4 + 1];
      tex[i * 3 + 2] = best.src[i * 4 + 2] - low[i * 4 + 2];
    }
  }

  for (let i = 0; i < w * h; i++) {
    const f = Math.max(hole[i], feather[i * 4 + 3] / 255);
    if (f <= 0) continue;
    const p = i * 4;
    for (let ch = 0; ch < 3; ch++) {
      const v = fill[p + ch] + (tex ? tex[i * 3 + ch] * 0.9 : 0);
      D[p + ch] = D[p + ch] * (1 - f) + v * f;
    }
    D[p + 3] = D[p + 3] * (1 - f) + fill[p + 3] * f;
  }
  ctx.putImageData(img, x, y);
  target.touch();
}

const spotHeal = {
  id: "spotHeal",
  label: t("Spot healing"),
  icon: "i-spot",
  group: "Retouch",
  cursor: "none",
  brushCursor: true,
  needsLayer: true,
  opts: [sizeOpt(30, 300)],
  _color: { r: 255, g: 64, b: 96 },
  down(ev) {
    const target = state.doc.target;
    if (!target || target.locked) return;
    if (target.isMask) {
      emit("toast", { msg: t("Spot healing works on layer pixels — click the layer thumbnail first"), kind: "info" });
      return;
    }
    const ctx = beginFloating({ opacity: 0.5 });
    const size = opt("size");
    stroke.smoothed = null;
    stamp(ctx, ev.p.x, ev.p.y, size, 0.85, this._color);
    stroke.residual = Math.max(0.6, size * 0.12);
    stroke.last = ev.p;
    state.doc.floatingChanged(segRect(ev.p, ev.p, size));
    requestRender();
  },
  move(ev) {
    if (!stroke.active) return;
    const size = opt("size");
    stampSegment(stroke.bctx, stroke.last, ev.p, size, 0.85, this._color, 0.12);
    state.doc.floatingChanged(segRect(stroke.last, ev.p, size));
    stroke.last = ev.p;
    requestRender();
  },
  up() {
    const doc = state.doc;
    const buf = stroke.buf;
    stroke.active = false;
    stroke.buf = null;
    stroke.bctx = null;
    stroke.last = null;
    doc.clearFloating();
    const target = doc.target;
    if (!buf || !target || target.locked || target.isMask) {
      requestRender();
      return;
    }
    const b = alphaBounds(buf, 24);
    if (!b) {
      requestRender();
      return;
    }
    const size = opt("size");
    editPixels(t("Spot healing"), () => spotHealRegion(target, buf, b, doc.selection, size), target);
    emit("layers", doc);
    requestRender();
  },
  cancel: abortFloating,
};

/* ------------------------------ dodge / burn ----------------------------- */

const dodgeTool = retouchTool({
  id: "dodge",
  label: t("Dodge / Burn"),
  icon: "i-dodge",
  defaults: { strength: 30, hardness: 30, size: 80 },
  produce: ({ layer, x, y, radius, hardness, strength, tool }) => {
    const burn = (opt("mode", "dodge") === "burn") !== !!tool._alt;
    const range = opt("range", "dodge");
    retouchPatch(layer, x, y, radius, hardness, 1, (patch, pc, { size }) => {
      const img = pc.getImageData(0, 0, size, size);
      const d = img.data;
      const k = strength * 0.22;
      for (let i = 0; i < d.length; i += 4) {
        if (!d[i + 3]) continue;
        const l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
        const wgt =
          range === "shadows" ? (1 - l) * (1 - l) : range === "highlights" ? l * l : 1 - (2 * l - 1) ** 2;
        const f = k * wgt;
        for (let ch = 0; ch < 3; ch++) {
          d[i + ch] = burn ? d[i + ch] - d[i + ch] * f : d[i + ch] + (255 - d[i + ch]) * f;
        }
      }
      pc.putImageData(img, 0, 0);
      return patch;
    });
  },
});
dodgeTool.opts = [
  sizeOpt(80),
  RANGE("strength", t("Exposure"), 1, 100, 30, { unit: "%" }),
  hardnessOpt(30),
  {
    key: "mode",
    type: "seg",
    label: t("Mode"),
    def: "dodge",
    options: [
      ["dodge", t("Lighten")],
      ["burn", t("Darken")],
    ],
  },
  {
    key: "range",
    type: "select",
    label: t("Range"),
    def: "midtones",
    options: [
      ["shadows", t("Shadows")],
      ["midtones", t("Midtones")],
      ["highlights", t("Highlights")],
    ],
  },
];
{
  const baseDown = dodgeTool.down;
  // holding Alt flips between lightening and darkening, as in other editors
  dodgeTool.down = function down(ev) {
    this._alt = ev.alt;
    baseDown.call(this, ev);
  };
}

const cloneTool = withSource(
  retouchTool({
    id: "clone",
    label: t("Clone stamp"),
    icon: "i-clone",
    shortcut: "j",
    defaults: { strength: 100, hardness: 70 },
    useSnapshot: true,
    produce: ({ layer, x, y, radius, hardness, strength, tool, snapshot }) => {
      if (!tool._offset) return;
      const { dx, dy } = tool._offset;
      retouchPatch(layer, x, y, radius, hardness, strength, (patch, pc, { x0, y0, size }) => {
        pc.clearRect(0, 0, size, size);
        pc.drawImage(snapshot || layer.canvas, -x0 + dx, -y0 + dy);
        return patch;
      });
    },
  }),
  t("Clone source set"),
  t("Alt-click to set the clone source first")
);
cloneTool.opts = [
  sizeOpt(70),
  RANGE("strength", t("Strength"), 1, 100, 100, { unit: "%" }),
  hardnessOpt(70),
  { key: "aligned", type: "toggle", label: t("Aligned"), def: true },
];

/* ------------------------------- shape tools ------------------------------ */

function shapeTool({ id, label, icon, shortcut, extraOpts = [], draw }) {
  return {
    id,
    label,
    icon,
    shortcut,
    group: "Shape",
    cursor: "crosshair",
    needsLayer: true,
    opts: [
      fillModeOpt,
      RANGE("width", t("Stroke"), 1, 120, 4, { unit: "px" }),
      opacityOpt(100),
      ...extraOpts,
    ],
    _start: null,
    down(ev) {
      if (!state.doc.target || state.doc.target.locked) return;
      this._start = ev.p;
      beginFloating({ opacity: opt("opacity") / 100 });
      this.move(ev);
    },
    move(ev) {
      if (!stroke.active || !this._start) return;
      const doc = state.doc;
      const ctx = stroke.bctx;
      ctx.clearRect(0, 0, doc.width, doc.height);
      const rect = normalizedRect(this._start, ev.p, {
        square: ev.shift,
        fromCenter: ev.alt,
      });
      draw(ctx, {
        a: this._start,
        b: ev.p,
        rect,
        o: {
          fillMode: opt("fillMode"),
          width: opt("width"),
          radius: opt("radius") ?? 0,
          sides: opt("sides") ?? 5,
        },
        ev,
      });
      doc.floatingChanged();
      requestRender();
    },
    up() {
      this._start = null;
      endFloating(label, { opacity: opt("opacity") / 100 });
    },
    cancel() {
      this._start = null;
      abortFloating();
    },
  };
}

const lineShape = shapeTool({
  id: "line",
  label: t("Line"),
  icon: "i-line",
  shortcut: "l",
  draw(ctx, { a, b, o, ev }) {
    let end = b;
    if (ev.shift) {
      // snap to 45° increments
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      end = { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
    }
    ctx.save();
    ctx.strokeStyle = cssColor(state.primary);
    ctx.lineWidth = o.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  },
});
lineShape.opts = [RANGE("width", t("Stroke"), 1, 120, 4, { unit: "px" }), opacityOpt(100)];

const arrowShape = shapeTool({
  id: "arrow",
  label: t("Arrow"),
  icon: "i-arrow",
  draw(ctx, { a, b, o }) {
    const head = Math.max(8, o.width * 3.4);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const tipBack = { x: b.x - Math.cos(ang) * head * 0.9, y: b.y - Math.sin(ang) * head * 0.9 };
    ctx.save();
    ctx.strokeStyle = cssColor(state.primary);
    ctx.fillStyle = cssColor(state.primary);
    ctx.lineWidth = o.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(tipBack.x, tipBack.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(
      b.x - Math.cos(ang - 0.42) * head,
      b.y - Math.sin(ang - 0.42) * head
    );
    ctx.lineTo(
      b.x - Math.cos(ang + 0.42) * head,
      b.y - Math.sin(ang + 0.42) * head
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  },
});
arrowShape.opts = [RANGE("width", t("Stroke"), 1, 80, 5, { unit: "px" }), opacityOpt(100)];

const rectShape = shapeTool({
  id: "rect",
  label: t("Rectangle"),
  icon: "i-rect",
  shortcut: "r",
  extraOpts: [RANGE("radius", t("Corner"), 0, 200, 0, { unit: "px" })],
  draw(ctx, { rect, o }) {
    paintShape(ctx, (c) => roundRectPath(c, rect, o.radius), o);
  },
});

const ellipseShape = shapeTool({
  id: "ellipse",
  label: t("Ellipse"),
  icon: "i-ellipse",
  shortcut: "o",
  draw(ctx, { rect, o }) {
    paintShape(
      ctx,
      (c) => {
        c.beginPath();
        c.ellipse(
          rect.x + rect.w / 2,
          rect.y + rect.h / 2,
          Math.abs(rect.w / 2),
          Math.abs(rect.h / 2),
          0,
          0,
          TAU
        );
      },
      o
    );
  },
});

const polygonShape = shapeTool({
  id: "polygon",
  label: t("Polygon"),
  icon: "i-polygon",
  shortcut: "p",
  extraOpts: [RANGE("sides", t("Sides"), 3, 16, 6)],
  draw(ctx, { rect, o }) {
    paintShape(ctx, (c) => polygonPath(c, rect, o.sides, false), o);
  },
});

const starShape = shapeTool({
  id: "star",
  label: t("Star"),
  icon: "i-star",
  extraOpts: [RANGE("sides", t("Points"), 3, 16, 5)],
  draw(ctx, { rect, o }) {
    paintShape(ctx, (c) => polygonPath(c, rect, o.sides, true), o);
  },
});

/* -------------------------------- text tool ------------------------------- */

const FONTS = [
  ["system-ui, -apple-system, 'Segoe UI', sans-serif", t("System sans")],
  ["Georgia, 'Times New Roman', serif", t("Serif")],
  ["'Courier New', ui-monospace, monospace", t("Monospace")],
  ["Impact, 'Arial Black', sans-serif", "Impact"],
  ["'Comic Sans MS', 'Chalkboard SE', cursive", t("Handwritten")],
  ["'Trebuchet MS', Verdana, sans-serif", "Trebuchet"],
];

/**
 * Text is typed into a DOM textarea laid over the canvas in the final font,
 * then becomes its own text layer. Clicking an existing text layer with this
 * tool opens it again — it stays editable until something paints on it.
 */
const text = {
  id: "text",
  label: t("Text"),
  icon: "i-text",
  shortcut: "t",
  group: "Type",
  cursor: "text",
  needsLayer: true,
  opts: [
    { key: "font", type: "select", label: t("Font"), def: FONTS[0][0], options: FONTS },
    RANGE("size", t("Size"), 6, 400, 48, { unit: "px" }),
    {
      key: "align",
      type: "seg",
      label: t("Align"),
      def: "left",
      options: [
        ["left", t("Left")],
        ["center", t("Center")],
        ["right", t("Right")],
      ],
    },
    { key: "bold", type: "toggle", label: t("Bold"), def: false },
    { key: "italic", type: "toggle", label: t("Italic"), def: false },
    opacityOpt(100),
  ],
  _editor: null,
  _anchor: null,
  _style: null,
  _color: null,
  /** id of the text layer being edited, or null for new text */
  _editing: null,
  _hiddenLayer: null,
  hover(ev) {
    return this._hitText(ev.p) ? "pointer" : null;
  },
  down(ev) {
    // stop the browser from moving focus away from the editor we open
    ev.e?.preventDefault?.();
    if (this._editor) {
      this.commit();
      return;
    }
    const doc = state.doc;
    const hit = doc.target?.isMask ? null : this._hitText(ev.p);
    if (hit) {
      this._edit(hit);
      return;
    }
    const target = doc.target;
    if (!target || target.locked) {
      emit("toast", { msg: t("This layer is locked"), kind: "err" });
      return;
    }
    this._open({ x: ev.p.x, y: ev.p.y }, "");
  },
  move() {},
  up() {},
  /** Topmost visible text layer under a point — the active one wins ties. */
  _hitText(p) {
    const doc = state.doc;
    if (!doc) return null;
    const inside = (l) => {
      if (!l?.text || !l.visible) return false;
      const b = textBounds(l.text);
      return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
    };
    if (inside(doc.active)) return doc.active;
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      if (inside(doc.layers[i])) return doc.layers[i];
    }
    return null;
  },
  _edit(layer) {
    const doc = state.doc;
    if (layer.locked) {
      emit("toast", { msg: t("This layer is locked"), kind: "err" });
      return;
    }
    setActiveLayer(doc.layers.indexOf(layer), { mask: false });
    const tx = layer.text;
    // the options bar and colour chip show the text being edited
    for (const key of ["font", "size", "align", "bold", "italic"]) setOpt(key, tx[key], "text");
    setOpt("opacity", Math.round((tx.opacity ?? 1) * 100), "text");
    setColor(tx.color, "primary");
    emit("tool", { tool: "text" });
    this._editing = layer.id;
    // hide the rendered pixels while the live editor shows the same text
    layer.visible = false;
    this._hiddenLayer = layer;
    doc.invalidate();
    this._open({ x: tx.x, y: tx.y }, tx.value);
  },
  _open(anchor, value) {
    this._anchor = anchor;
    const host = document.getElementById("stageLayer");
    const el = document.createElement("textarea");
    el.className = "text-editor";
    el.rows = 1;
    el.spellcheck = false;
    el.value = value;
    el.setAttribute("aria-label", t("Text"));
    host.appendChild(el);
    this._editor = el;
    this._sync();
    // the pointer gesture that opened the editor would move focus back to the
    // page once it finishes, so take it again after the click has settled
    const grab = () => {
      if (this._editor !== el) return;
      el.focus();
      if (value) el.select();
    };
    grab();
    setTimeout(grab, 0);
    window.addEventListener("pointerup", () => setTimeout(grab, 0), { once: true });

    el.addEventListener("input", () => this._sync());
    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.discard();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.commit();
      }
      e.stopPropagation();
    });
    requestRender();
  },
  _fontString(style = this._style) {
    return fontString(style);
  },
  /** Mirror tool options + viewport transform onto the DOM editor. */
  _sync() {
    const el = this._editor;
    if (!el || !this._anchor) return;
    // snapshot the options: commit() may run after the user switched tools
    this._style = {
      font: opt("font", "text"),
      size: opt("size", "text"),
      align: opt("align", "text"),
      bold: !!opt("bold", "text"),
      italic: !!opt("italic", "text"),
      opacity: opt("opacity", "text") / 100,
    };
    const size = this._style.size;
    const p = view.toScreen(this._anchor.x, this._anchor.y);
    const font = this._fontString();
    this._color = { ...state.primary };
    el.style.font = font;
    el.style.lineHeight = String(LINE_HEIGHT);
    el.style.color = cssColor(state.primary);
    el.style.opacity = String(this._style.opacity);
    el.style.textAlign = this._style.align;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;

    const align = this._style.align;
    const shift =
      align === "center" ? " translateX(-50%)" : align === "right" ? " translateX(-100%)" : "";
    el.style.transformOrigin = align === "center" ? "50% 0" : align === "right" ? "100% 0" : "0 0";
    el.style.transform = `scale(${view.zoom})${shift}`;

    // size the editor from measured text rather than scrollWidth guesses
    const lines = el.value.split("\n");
    const m = measureCtx();
    m.font = font;
    let widest = 0;
    for (const line of lines) widest = Math.max(widest, m.measureText(line || " ").width);
    el.style.width = `${Math.ceil(widest + size * 0.35 + 6)}px`;
    el.style.height = `${Math.ceil(lines.length * size * LINE_HEIGHT + 4)}px`;
  },
  commit() {
    const el = this._editor;
    if (!el) return;
    const value = el.value;
    const anchor = this._anchor;
    const style = this._style;
    const color = this._color || state.primary;
    const editing = this._editing;
    this.discard();
    if (!anchor || !style) return;
    const params = { value, x: anchor.x, y: anchor.y, ...style, color: { r: color.r, g: color.g, b: color.b } };
    if (editing) {
      updateTextLayer(editing, params);
      return;
    }
    if (!value.trim()) return;
    if (state.doc.target?.isMask) paintText(params);
    else addTextLayer(params);
  },
  discard() {
    this._editor?.remove();
    this._editor = null;
    this._anchor = null;
    this._style = null;
    this._editing = null;
    if (this._hiddenLayer) {
      this._hiddenLayer.visible = true;
      this._hiddenLayer = null;
      state.doc?.invalidate();
    }
    requestRender();
  },
  cancel() {
    if (this._editor) this.commit();
  },
  onViewChange() {
    this._sync();
  },
  onOptsChange() {
    this._sync();
  },
};

/* ----------------------------- selection tools ---------------------------- */

function selectionModeFrom(ev) {
  if (ev.shift) return "add";
  if (ev.alt) return "subtract";
  return opt("mode") || "replace";
}

function applySelection(next, mode, label) {
  const doc = state.doc;
  const feather = opt("feather") || 0;
  editSelection(label, () => {
    let sel = next;
    if (feather > 0) sel = sel.feather(feather);
    if (mode !== "replace" && doc.selection) {
      sel = doc.selection.combine(sel, mode);
    }
    doc.setSelection(sel.isEmpty ? null : sel);
  });
  requestRender();
}

function marqueeTool({ id, label, icon, shortcut, kind }) {
  return {
    id,
    label,
    icon,
    shortcut,
    group: "Select",
    cursor: "crosshair",
    opts: [selectModeOpt, featherOpt],
    _start: null,
    down(ev) {
      this._start = ev.p;
      overlay.marquee = { kind, rect: { x: ev.p.x, y: ev.p.y, w: 0, h: 0 } };
      requestRender();
    },
    move(ev) {
      if (!this._start) return;
      // snap to whole pixels so selection edges stay crisp
      overlay.marquee.rect = snapRect(normalizedRect(this._start, ev.p));
      requestRender();
    },
    up(ev) {
      const rect = overlay.marquee?.rect;
      const mode = selectionModeFrom(ev);
      overlay.marquee = null;
      this._start = null;
      const doc = state.doc;
      if (!rect || rect.w < 1 || rect.h < 1) {
        // a plain click clears the selection
        if (doc.selection && mode === "replace") {
          editSelection(t("Deselect"), () => doc.setSelection(null));
        }
        requestRender();
        return;
      }
      const next =
        kind === "ellipse"
          ? Selection.fromEllipse(doc.width, doc.height, rect)
          : Selection.fromRect(doc.width, doc.height, rect);
      applySelection(next, mode, label);
    },
    cancel() {
      overlay.marquee = null;
      this._start = null;
      requestRender();
    },
  };
}

const selectRect = marqueeTool({
  id: "selectRect",
  label: t("Rectangle select"),
  icon: "i-select-rect",
  shortcut: "m",
  kind: "rect",
});

const selectEllipse = marqueeTool({
  id: "selectEllipse",
  label: t("Ellipse select"),
  icon: "i-select-ellipse",
  shortcut: "q",
  kind: "ellipse",
});

const lasso = {
  id: "lasso",
  label: t("Lasso"),
  icon: "i-lasso",
  shortcut: "f",
  group: "Select",
  cursor: "crosshair",
  opts: [selectModeOpt, featherOpt],
  _points: null,
  down(ev) {
    this._points = [ev.p];
    overlay.marquee = { kind: "lasso", points: this._points, close: true };
    requestRender();
  },
  move(ev) {
    if (!this._points) return;
    const last = this._points[this._points.length - 1];
    if (Math.hypot(ev.p.x - last.x, ev.p.y - last.y) < 1.5) return;
    this._points.push(ev.p);
    requestRender();
  },
  up(ev) {
    const points = this._points;
    this._points = null;
    overlay.marquee = null;
    const doc = state.doc;
    if (!points || points.length < 3) {
      if (doc.selection) editSelection(t("Deselect"), () => doc.setSelection(null));
      requestRender();
      return;
    }
    applySelection(
      Selection.fromPath(doc.width, doc.height, points),
      selectionModeFrom(ev),
      t("Lasso select")
    );
  },
  cancel() {
    this._points = null;
    overlay.marquee = null;
    requestRender();
  },
};

const wand = {
  id: "wand",
  label: t("Magic wand"),
  icon: "i-wand",
  shortcut: "w",
  group: "Select",
  cursor: "crosshair",
  opts: [
    selectModeOpt,
    RANGE("tolerance", t("Tolerance"), 0, 100, 22, { unit: "%" }),
    featherOpt,
    { key: "contiguous", type: "toggle", label: t("Contiguous"), def: true },
    { key: "sampleAll", type: "toggle", label: t("Sample all layers"), def: true },
  ],
  down(ev) {
    const doc = state.doc;
    const x = Math.floor(ev.p.x);
    const y = Math.floor(ev.p.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;
    const source = opt("sampleAll") ? doc.composite() : doc.active.canvas;
    const img = source.getContext("2d").getImageData(0, 0, doc.width, doc.height);
    const mask = floodMask(img, x, y, opt("tolerance"), !!opt("contiguous"));
    if (!mask) return;
    const sel = Selection.fromMask(
      doc.width,
      doc.height,
      maskToCanvas(mask, doc.width, doc.height)
    );
    applySelection(sel, selectionModeFrom(ev), t("Magic wand"));
  },
  move() {},
  up() {},
};

/* ------------------------------- move / crop ------------------------------ */

/** A mask moved by (dx, dy); the strip it uncovers is revealed. */
function shiftedMask(orig, dx, dy) {
  return transformMask(orig, orig.width, orig.height, (c, src) => c.drawImage(src, dx, dy));
}

const move = {
  id: "move",
  label: t("Move"),
  icon: "i-move",
  shortcut: "v",
  group: "Edit",
  cursor: "move",
  needsLayer: true,
  opts: [
    {
      key: "target",
      type: "seg",
      label: t("Move"),
      def: "auto",
      options: [
        ["auto", t("Selection")],
        ["layer", t("Whole layer")],
      ],
    },
  ],
  _edit: null,
  _base: null,
  _cut: null,
  _start: null,
  _delta: null,
  down(ev) {
    const doc = state.doc;
    const layer = doc.active;
    const target = doc.target;
    if (!target || target.locked) {
      emit("toast", { msg: t("This layer is locked"), kind: "err" });
      return;
    }
    this._edit = beginEdit();
    this._start = ev.p;
    this._delta = { x: 0, y: 0 };

    const sel = opt("target") === "layer" ? null : doc.selection;
    // moving the whole layer keeps text editable and carries the mask along
    this._text = !sel && !target.isMask && layer.text ? layer : null;
    this._mask = !sel && !target.isMask && layer.mask ? copyCanvas(layer.mask) : null;
    if (sel && !target.isMask && layer.text) {
      layer.text = null;
      emit("toast", { msg: t("Text layer converted to pixels"), kind: "info" });
    }
    this._target = target;

    const orig = copyCanvas(target.canvas);
    if (sel) {
      const cut = makeCanvas(doc.width, doc.height);
      const cc = ctx2d(cut);
      cc.drawImage(orig, 0, 0);
      cc.globalCompositeOperation = "destination-in";
      cc.drawImage(sel.canvas, 0, 0);
      this._cut = cut;
      const base = makeCanvas(doc.width, doc.height);
      const bc = ctx2d(base);
      bc.drawImage(orig, 0, 0);
      bc.globalCompositeOperation = "destination-out";
      bc.drawImage(sel.canvas, 0, 0);
      this._base = base;
    } else {
      this._cut = orig;
      this._base = null;
    }
    this._sel = sel;
  },
  move(ev) {
    if (!this._edit) return;
    const doc = state.doc;
    const target = this._target;
    let dx = ev.p.x - this._start.x;
    let dy = ev.p.y - this._start.y;
    if (ev.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    dx = Math.round(dx);
    dy = Math.round(dy);
    if (dx === this._delta.x && dy === this._delta.y) return;
    this._delta = { x: dx, y: dy };

    const c = target.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this._base) {
      c.globalCompositeOperation = "copy";
      c.drawImage(this._base, 0, 0);
      c.globalCompositeOperation = "source-over";
      c.drawImage(this._cut, dx, dy);
    } else if (target.isMask) {
      // an empty strip of a mask means "revealed", not "hidden"
      c.globalCompositeOperation = "copy";
      c.drawImage(shiftedMask(this._cut, dx, dy), 0, 0);
    } else {
      c.globalCompositeOperation = "copy";
      c.drawImage(this._cut, dx, dy);
    }
    c.restore();
    if (this._mask) {
      const layer = doc.active;
      const mc = layer.maskCtx;
      mc.save();
      mc.globalCompositeOperation = "copy";
      mc.drawImage(shiftedMask(this._mask, dx, dy), 0, 0);
      mc.restore();
    }
    target.touch();

    if (this._sel) {
      overlay.floatFrame = null;
      const b = this._sel.bounds;
      if (b) overlay.floatFrame = { x: b.x + dx, y: b.y + dy, w: b.w, h: b.h };
    }
    requestRender();
  },
  up() {
    if (!this._edit) return;
    const doc = state.doc;
    const { x: dx, y: dy } = this._delta || { x: 0, y: 0 };
    if (this._sel && (dx || dy)) {
      // carry the selection along with the pixels it holds
      const moved = new Selection(doc.width, doc.height);
      moved.ctx.drawImage(this._sel.canvas, dx, dy);
      doc.setSelection(moved);
      emit("selection", doc);
    }
    if (this._text && (dx || dy)) {
      this._text.text.x += dx;
      this._text.text.y += dy;
    }
    overlay.floatFrame = null;
    if (dx || dy) this._edit.commit(t("Move"));
    this._edit = null;
    this._cut = this._base = this._sel = this._mask = this._text = this._target = null;
    emit("layers", doc);
    requestRender();
  },
  cancel() {
    if (this._edit) this._edit.rollback();
    this._edit = null;
    this._cut = this._base = this._sel = this._mask = this._text = this._target = null;
    overlay.floatFrame = null;
    requestRender();
  },
};

/* -------------------------------- transform ------------------------------- */

const HANDLES = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

/**
 * Free transform: scale, rotate and move the selected pixels (or the whole
 * layer) with handles. The layer shows the live result; Enter applies, Esc
 * restores. Corners keep the aspect ratio unless Shift is held; Alt scales
 * from the centre; dragging outside the box rotates (Shift snaps to 15°).
 */
const transform = {
  id: "transform",
  label: t("Transform"),
  icon: "i-transform",
  group: "Edit",
  cursor: "default",
  needsLayer: true,
  opts: [
    { type: "button", label: t("Apply"), icon: "i-check", primary: true, onClick: () => transform.apply() },
    { type: "button", label: t("Cancel"), icon: "i-close", onClick: () => transform.cancel() },
    { type: "button", label: t("Flip horizontal"), icon: "i-flip-h", onClick: () => transform.flip("h") },
    { type: "button", label: t("Flip vertical"), icon: "i-flip-v", onClick: () => transform.flip("v") },
  ],
  _s: null,
  _drag: null,
  applyOnLeave: true,
  activate() {
    this._begin();
  },
  /** A gesture was interrupted (pinch, window blur): keep the session. */
  abortGesture() {
    this._drag = null;
  },
  deactivate() {
    this.apply();
  },
  get active() {
    return !!this._s;
  },
  _begin() {
    const doc = state.doc;
    if (!doc || this._s) return;
    const target = doc.target;
    const layer = doc.active;
    if (!target || target.locked) return;
    const sel = doc.selection;
    // a mask's "content" is all of it — its hidden parts matter as much
    let b = sel
      ? sel.bounds
      : target.isMask
      ? { x: 0, y: 0, w: target.width, h: target.height }
      : alphaBounds(target.canvas, 0);
    if (sel && b) {
      // shrink to the pixels actually inside the selection
      const probe = makeCanvas(b.w, b.h);
      const pc = ctx2d(probe);
      pc.drawImage(target.canvas, -b.x, -b.y);
      pc.globalCompositeOperation = "destination-in";
      pc.drawImage(sel.canvas, -b.x, -b.y);
      const inner = alphaBounds(probe, 0);
      b = inner ? { x: b.x + inner.x, y: b.y + inner.y, w: inner.w, h: inner.h } : null;
    }
    if (!b) {
      emit("toast", { msg: t("Nothing to transform on this layer"), kind: "info" });
      return;
    }
    const edit = beginEdit();
    if (!target.isMask && layer.text) {
      layer.text = null;
      emit("toast", { msg: t("Text layer converted to pixels"), kind: "info" });
    }
    const patch = makeCanvas(b.w, b.h);
    const pc = ctx2d(patch);
    pc.drawImage(target.canvas, -b.x, -b.y);
    if (sel) {
      pc.globalCompositeOperation = "destination-in";
      pc.drawImage(sel.canvas, -b.x, -b.y);
    }
    let base = null;
    if (sel) {
      base = copyCanvas(target.canvas);
      const bc = ctx2d(base);
      bc.globalCompositeOperation = "destination-out";
      bc.drawImage(sel.canvas, 0, 0);
    }
    let selPatch = null;
    if (sel) {
      selPatch = makeCanvas(b.w, b.h);
      ctx2d(selPatch).drawImage(sel.canvas, -b.x, -b.y);
    }
    this._s = {
      edit,
      target,
      layerId: layer.id,
      patch,
      base,
      selPatch,
      mask: !sel && !target.isMask && layer.mask ? copyCanvas(layer.mask) : null,
      origin: { x: b.x, y: b.y },
      w: b.w,
      h: b.h,
      cx: b.x + b.w / 2,
      cy: b.y + b.h / 2,
      sx: 1,
      sy: 1,
      angle: 0,
    };
    this._render();
  },
  /** Patch space → document space. */
  _matrix(s = this._s) {
    return new DOMMatrix()
      .translateSelf(s.cx, s.cy)
      .rotateSelf((s.angle * 180) / Math.PI)
      .scaleSelf(s.sx, s.sy)
      .translateSelf(-s.w / 2, -s.h / 2);
  },
  _corners(s = this._s) {
    const m = this._matrix(s);
    return [
      [0, 0],
      [s.w, 0],
      [s.w, s.h],
      [0, s.h],
    ].map(([x, y]) => {
      const p = m.transformPoint({ x, y });
      return { x: p.x, y: p.y };
    });
  },
  _render() {
    const s = this._s;
    if (!s) return;
    const m = this._matrix();
    const c = s.target.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (s.target.isMask && !s.base) {
      // the area a transformed mask no longer covers is revealed
      const moved = transformMask(s.patch, s.target.width, s.target.height, (cc, src) => {
        cc.setTransform(m);
        cc.drawImage(src, 0, 0);
      });
      c.globalCompositeOperation = "copy";
      c.drawImage(moved, 0, 0);
    } else {
      c.globalCompositeOperation = "copy";
      if (s.base) c.drawImage(s.base, 0, 0);
      else c.clearRect(0, 0, s.target.width, s.target.height);
      c.globalCompositeOperation = "source-over";
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = "high";
      c.setTransform(m);
      c.drawImage(s.patch, 0, 0);
    }
    c.restore();
    if (s.mask) {
      const layer = state.doc.layers.find((l) => l.id === s.layerId);
      if (layer?.maskCtx) {
        // the mask lives in document space: map it with the same transform
        const mm = m.multiply(new DOMMatrix().translateSelf(-s.origin.x, -s.origin.y));
        const moved = transformMask(s.mask, s.mask.width, s.mask.height, (cc, src) => {
          cc.setTransform(mm);
          cc.drawImage(src, 0, 0);
        });
        layer.maskCtx.save();
        layer.maskCtx.globalCompositeOperation = "copy";
        layer.maskCtx.drawImage(moved, 0, 0);
        layer.maskCtx.restore();
      }
    }
    s.target.touch();
    overlay.transform = { corners: this._corners(), center: { x: s.cx, y: s.cy } };
    requestRender();
  },
  _hit(ev) {
    const s = this._s;
    if (!s) return null;
    const corners = this._corners().map((p) => view.toScreen(p.x, p.y));
    const tol = ev.e?.pointerType === "touch" ? 18 : 9;
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const pts = {
      "-1,-1": corners[0],
      "1,-1": corners[1],
      "1,1": corners[2],
      "-1,1": corners[3],
      "0,-1": mid(corners[0], corners[1]),
      "1,0": mid(corners[1], corners[2]),
      "0,1": mid(corners[2], corners[3]),
      "-1,0": mid(corners[3], corners[0]),
    };
    for (const [hx, hy] of HANDLES) {
      const p = pts[`${hx},${hy}`];
      if (Math.hypot(ev.screen.x - p.x, ev.screen.y - p.y) <= tol) return { kind: "scale", hx, hy };
    }
    // inside the (possibly rotated) box → move, anywhere else → rotate
    const inv = this._matrix().inverse();
    const local = inv.transformPoint({ x: ev.p.x, y: ev.p.y });
    if (local.x >= 0 && local.x <= s.w && local.y >= 0 && local.y <= s.h) return { kind: "move" };
    return { kind: "rotate" };
  },
  hover(ev) {
    const hit = this._hit(ev);
    if (!hit) return null;
    if (hit.kind === "move") return "move";
    if (hit.kind === "rotate") return "alias";
    const a = (Math.atan2(hit.hy, hit.hx) + this._s.angle) * (180 / Math.PI);
    const n = ((Math.round(a / 45) % 4) + 4) % 4;
    return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][n];
  },
  down(ev) {
    if (!this._s) this._begin();
    if (!this._s) return;
    const hit = this._hit(ev);
    this._drag = { hit, start: ev.p, s0: { ...this._s } };
  },
  move(ev) {
    const d = this._drag;
    const s = this._s;
    if (!d || !s) return;
    const s0 = d.s0;
    if (d.hit.kind === "move") {
      let dx = ev.p.x - d.start.x;
      let dy = ev.p.y - d.start.y;
      if (ev.shift) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      s.cx = s0.cx + dx;
      s.cy = s0.cy + dy;
    } else if (d.hit.kind === "rotate") {
      const a0 = Math.atan2(d.start.y - s0.cy, d.start.x - s0.cx);
      const a1 = Math.atan2(ev.p.y - s0.cy, ev.p.x - s0.cx);
      let angle = s0.angle + (a1 - a0);
      if (ev.shift) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
      s.angle = angle;
    } else {
      const { hx, hy } = d.hit;
      const W = s0.w * s0.sx;
      const H = s0.h * s0.sy;
      const cos = Math.cos(s0.angle);
      const sin = Math.sin(s0.angle);
      const toDoc = (u, v) => ({ x: s0.cx + u * cos - v * sin, y: s0.cy + u * sin + v * cos });
      const fromCenter = ev.alt;
      const anchor = fromCenter ? { x: s0.cx, y: s0.cy } : toDoc((-hx * W) / 2, (-hy * H) / 2);
      // pointer relative to the anchor, in the box's rotated frame
      const rx = ev.p.x - anchor.x;
      const ry = ev.p.y - anchor.y;
      const u = rx * cos + ry * sin;
      const v = -rx * sin + ry * cos;
      const k = fromCenter ? 2 : 1;
      let nW = hx ? (u * k) / hx : W;
      let nH = hy ? (v * k) / hy : H;
      const corner = hx !== 0 && hy !== 0;
      if (corner && !ev.shift) {
        // keep the proportions: project onto the diagonal
        const ratio = ((nW * W + nH * H) / (W * W + H * H)) || 0;
        nW = W * ratio;
        nH = H * ratio;
      }
      if (Math.abs(nW) < 1) nW = nW < 0 ? -1 : 1;
      if (Math.abs(nH) < 1) nH = nH < 0 ? -1 : 1;
      s.sx = nW / s0.w;
      s.sy = nH / s0.h;
      if (fromCenter) {
        s.cx = s0.cx;
        s.cy = s0.cy;
      } else {
        const c = { u: (hx * nW) / 2, v: (hy * nH) / 2 };
        s.cx = anchor.x + c.u * cos - c.v * sin;
        s.cy = anchor.y + c.u * sin + c.v * cos;
      }
    }
    this._render();
  },
  up() {
    this._drag = null;
  },
  flip(axis) {
    if (!this._s) this._begin();
    if (!this._s) return;
    if (axis === "h") this._s.sx *= -1;
    else this._s.sy *= -1;
    this._render();
  },
  _identity(s) {
    return (
      Math.abs(s.sx - 1) < 1e-6 &&
      Math.abs(s.sy - 1) < 1e-6 &&
      Math.abs(s.angle) < 1e-6 &&
      Math.abs(s.cx - (s.origin.x + s.w / 2)) < 1e-6 &&
      Math.abs(s.cy - (s.origin.y + s.h / 2)) < 1e-6
    );
  },
  apply() {
    const s = this._s;
    if (!s) return;
    const doc = state.doc;
    this._s = null;
    this._drag = null;
    overlay.transform = null;
    if (this._identity(s)) {
      s.edit.rollback();
      requestRender();
      return;
    }
    if (s.selPatch) {
      const moved = new Selection(doc.width, doc.height);
      moved.ctx.setTransform(this._matrix(s));
      moved.ctx.drawImage(s.selPatch, 0, 0);
      moved.ctx.setTransform(1, 0, 0, 1, 0, 0);
      doc.setSelection(moved);
      emit("selection", doc);
    }
    s.edit.commit(t("Transform"));
    emit("layers", doc);
    requestRender();
  },
  cancel() {
    const s = this._s;
    if (!s) return;
    this._s = null;
    this._drag = null;
    overlay.transform = null;
    s.edit.rollback();
    requestRender();
  },
  /** The document was replaced: forget the session without touching pixels. */
  drop() {
    this._s = null;
    this._drag = null;
    overlay.transform = null;
  },
};

const crop = {
  id: "crop",
  label: t("Crop"),
  icon: "i-crop",
  shortcut: "c",
  group: "Edit",
  cursor: "crosshair",
  opts: [
    {
      key: "ratio",
      type: "select",
      label: t("Ratio"),
      def: "free",
      options: [
        ["free", t("Freeform")],
        ["1", t("Square 1:1")],
        ["1.3333", t("4:3")],
        ["0.75", t("3:4")],
        ["1.7778", t("16:9")],
        ["0.5625", t("9:16")],
        ["1.5", t("3:2")],
      ],
    },
    {
      type: "button",
      label: t("Apply"),
      icon: "i-check",
      primary: true,
      onClick: () => crop.apply(),
    },
    {
      type: "button",
      label: t("Reset"),
      icon: "i-reset",
      onClick: () => {
        overlay.crop = null;
        requestRender();
      },
    },
  ],
  _drag: null,
  activate() {
    const doc = state.doc;
    if (!doc) return;
    const b = doc.selection?.bounds;
    overlay.crop = b
      ? { ...b }
      : {
          x: Math.round(doc.width * 0.08),
          y: Math.round(doc.height * 0.08),
          w: Math.round(doc.width * 0.84),
          h: Math.round(doc.height * 0.84),
        };
    requestRender();
  },
  deactivate() {
    overlay.crop = null;
    requestRender();
  },
  /** Which handle (if any) is under the pointer. */
  _hit(p) {
    const c = overlay.crop;
    if (!c) return null;
    const t = 10 / view.zoom;
    const nearL = Math.abs(p.x - c.x) < t;
    const nearR = Math.abs(p.x - (c.x + c.w)) < t;
    const nearT = Math.abs(p.y - c.y) < t;
    const nearB = Math.abs(p.y - (c.y + c.h)) < t;
    if (nearL && nearT) return "nw";
    if (nearR && nearT) return "ne";
    if (nearL && nearB) return "sw";
    if (nearR && nearB) return "se";
    if (nearL) return "w";
    if (nearR) return "e";
    if (nearT) return "n";
    if (nearB) return "s";
    if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h) return "move";
    return null;
  },
  down(ev) {
    const handle = this._hit(ev.p);
    if (!overlay.crop || !handle) {
      overlay.crop = { x: ev.p.x, y: ev.p.y, w: 0, h: 0 };
      this._drag = { mode: "se", start: ev.p, orig: { ...overlay.crop } };
    } else {
      this._drag = { mode: handle, start: ev.p, orig: { ...overlay.crop } };
    }
    requestRender();
  },
  move(ev) {
    if (!this._drag) return;
    const doc = state.doc;
    const { mode, start, orig } = this._drag;
    const dx = ev.p.x - start.x;
    const dy = ev.p.y - start.y;
    let r = { ...orig };

    if (mode === "move") {
      r.x = clamp(orig.x + dx, 0, doc.width - orig.w);
      r.y = clamp(orig.y + dy, 0, doc.height - orig.h);
    } else {
      if (mode.includes("w")) {
        r.x = orig.x + dx;
        r.w = orig.w - dx;
      }
      if (mode.includes("e")) r.w = orig.w + dx;
      if (mode.includes("n")) {
        r.y = orig.y + dy;
        r.h = orig.h - dy;
      }
      if (mode.includes("s")) r.h = orig.h + dy;
      if (r.w < 0) {
        r.x += r.w;
        r.w = -r.w;
      }
      if (r.h < 0) {
        r.y += r.h;
        r.h = -r.h;
      }
      const ratio = Number(opt("ratio"));
      if (ratio) {
        if (mode === "n" || mode === "s") r.w = r.h * ratio;
        else r.h = r.w / ratio;
      }
      r.x = clamp(r.x, 0, doc.width);
      r.y = clamp(r.y, 0, doc.height);
      r.w = clamp(r.w, 1, doc.width - r.x);
      r.h = clamp(r.h, 1, doc.height - r.y);
    }
    overlay.crop = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.w),
      h: Math.round(r.h),
    };
    requestRender();
  },
  up() {
    this._drag = null;
  },
  apply() {
    const r = overlay.crop;
    const doc = state.doc;
    if (!doc || !r || r.w < 1 || r.h < 1) return;
    const rect = {
      x: clamp(Math.round(r.x), 0, doc.width - 1),
      y: clamp(Math.round(r.y), 0, doc.height - 1),
      w: Math.max(1, Math.round(r.w)),
      h: Math.max(1, Math.round(r.h)),
    };
    overlay.crop = null;
    emit("crop-apply", rect);
  },
  cancel() {
    this._drag = null;
    overlay.crop = null;
    requestRender();
  },
};

/* ------------------------------ view / picker ----------------------------- */

const eyedropper = {
  id: "eyedropper",
  label: t("Eyedropper"),
  icon: "i-eyedropper",
  shortcut: "i",
  group: "View",
  cursor: "crosshair",
  opts: [
    {
      key: "source",
      type: "seg",
      label: t("Sample"),
      def: "composite",
      options: [
        ["composite", t("All layers")],
        ["layer", t("Active layer")],
      ],
    },
  ],
  _which: null,
  down(ev) {
    this._which = ev.alt
      ? state.activeChip === "primary"
        ? "secondary"
        : "primary"
      : state.activeChip;
    sampleColor(ev.p, this._which, opt("source") === "layer");
  },
  move(ev) {
    if (ev.buttons) this.down(ev);
  },
  up() {
    // dragging the dropper walks over many pixels; keep only where it stopped
    if (this._which) recordRecent(this._which);
    this._which = null;
  },
  cancel() {
    this._which = null;
  },
};

/**
 * Read a pixel into the primary/secondary colour. `record` should only be true
 * for one-shot samples (an alt-click), never while a drag is in progress.
 */
export function sampleColor(p, which = "primary", layerOnly = false, record = false) {
  const doc = state.doc;
  if (!doc) return null;
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return null;
  const source = layerOnly ? doc.active?.canvas : doc.composite();
  if (!source) return null;
  const d = source.getContext("2d").getImageData(x, y, 1, 1).data;
  if (d[3] === 0) return null;
  const color = { r: d[0], g: d[1], b: d[2], a: 1 };
  setColor(color, which, { record });
  return color;
}

const hand = {
  id: "hand",
  label: t("Pan"),
  icon: "i-hand",
  shortcut: "h",
  group: "View",
  cursor: "grab",
  _last: null,
  down(ev) {
    this._last = ev.screen;
  },
  move(ev) {
    if (!this._last) return;
    view.pan(ev.screen.x - this._last.x, ev.screen.y - this._last.y);
    this._last = ev.screen;
  },
  up() {
    this._last = null;
  },
  cancel() {
    this._last = null;
  },
};

const zoomTool = {
  id: "zoom",
  label: t("Zoom"),
  icon: "i-zoom",
  shortcut: "z",
  group: "View",
  cursor: "zoom-in",
  down(ev) {
    view.zoomStep(ev.alt ? -1 : 1, ev.screen);
  },
  move() {},
  up() {},
};

/* ========================================================================== */
/*  Registry                                                                  */
/* ========================================================================== */

export const TOOL_LIST = [
  brush,
  pencil,
  airbrush,
  eraser,
  bucket,
  gradient,
  blurTool,
  sharpenTool,
  smudgeTool,
  cloneTool,
  healTool,
  spotHeal,
  dodgeTool,
  lineShape,
  arrowShape,
  rectShape,
  ellipseShape,
  polygonShape,
  starShape,
  text,
  selectRect,
  selectEllipse,
  lasso,
  wand,
  move,
  transform,
  crop,
  eyedropper,
  hand,
  zoomTool,
];

export const TOOLS = Object.fromEntries(TOOL_LIST.map((t) => [t.id, t]));

export const TOOL_GROUPS = TOOL_LIST.reduce((groups, tool) => {
  const g = groups.find((x) => x.name === tool.group);
  if (g) g.tools.push(tool);
  else groups.push({ name: tool.group, tools: [tool] });
  return groups;
}, []);

export const TOOL_DEFAULTS = Object.fromEntries(
  TOOL_LIST.map((t) => [
    t.id,
    Object.fromEntries(
      (t.opts || []).filter((o) => o.key !== undefined).map((o) => [o.key, o.def])
    ),
  ])
);

export const activeTool = () => TOOLS[state.tool] || brush;

export const PAINT_TOOLS = new Set([
  "brush",
  "pencil",
  "airbrush",
  "eraser",
  "bucket",
  "gradient",
  "blurBrush",
  "sharpenBrush",
  "smudge",
  "clone",
  "spotHeal",
  "line",
  "arrow",
  "rect",
  "ellipse",
  "polygon",
  "star",
]);

/* ========================================================================== */
/*  Pointer + wheel input                                                     */
/* ========================================================================== */

export function initInput(canvas) {
  const pointers = new Map();
  let drag = null;
  let spaceHeld = false;
  let pinch = null;

  const ctxFor = (e) => {
    const screen = view.eventPos(e);
    const p = view.toDoc(screen.x, screen.y);
    return {
      e,
      screen,
      p,
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
      buttons: e.buttons,
      doc: state.doc,
    };
  };

  const updateCursorOverlay = (ev) => {
    const tool = activeTool();
    state.cursor = ev ? ev.p : null;
    if (ev && tool.brushCursor && !spaceHeld) {
      const size = opt("size", tool.id) || 20;
      overlay.cursor = { x: ev.p.x, y: ev.p.y, r: size / 2 };
    } else {
      overlay.cursor = null;
    }
    emit("cursor", state.cursor);
    requestRender();
  };

  const startPan = (ev) => {
    drag = { kind: "pan", last: ev.screen };
    canvas.style.cursor = "grabbing";
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (!state.doc) return;
    canvas.setPointerCapture?.(e.pointerId);
    pointers.set(e.pointerId, e);

    if (pointers.size === 2) {
      // two fingers: pinch-zoom instead of drawing
      const [a, b] = [...pointers.values()];
      const tool = activeTool();
      (tool.abortGesture || tool.cancel)?.call(tool);
      drag = null;
      pinch = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: view.zoom,
        mid: view.eventPos({
          clientX: (a.clientX + b.clientX) / 2,
          clientY: (a.clientY + b.clientY) / 2,
        }),
      };
      return;
    }
    if (pointers.size > 2) return;

    const ev = ctxFor(e);
    const tool = activeTool();

    if (e.button === 1 || spaceHeld || tool.id === "hand") {
      startPan(ev);
      return;
    }
    if (e.button === 2) return;

    // Alt with a paint tool is a temporary eyedropper — a familiar shortcut
    if (ev.alt && PAINT_TOOLS.has(tool.id) && tool.id !== "clone") {
      sampleColor(ev.p, state.activeChip, false, true);
      return;
    }
    if (tool.needsLayer && (!state.doc.target || state.doc.target.locked)) {
      emit("toast", { msg: t("This layer is locked"), kind: "err" });
      return;
    }

    drag = { kind: "tool", tool };
    tool.down?.(ev);
    updateCursorOverlay(ev);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!state.doc) return;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, e);

    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      if (pinch.dist > 0) view.setZoom((dist / pinch.dist) * pinch.zoom, pinch.mid);
      return;
    }

    const ev = ctxFor(e);
    if (drag?.kind === "pan") {
      view.pan(ev.screen.x - drag.last.x, ev.screen.y - drag.last.y);
      drag.last = ev.screen;
      return;
    }
    if (drag?.kind === "tool") drag.tool.move?.(ev);
    else if (!spaceHeld) {
      // tools with on-canvas handles describe the cursor under the pointer
      const tool = activeTool();
      if (tool.hover) canvas.style.cursor = tool.hover(ev) || tool.cursor || "default";
    }
    updateCursorOverlay(ev);
  });

  const finish = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!drag) return;
    const ev = ctxFor(e);
    if (drag.kind === "tool") drag.tool.up?.(ev);
    drag = null;
    canvas.style.cursor = "";
    applyCursor();
  };

  canvas.addEventListener("pointerup", finish);
  canvas.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
    pinch = null;
    if (drag?.kind === "tool") (drag.tool.abortGesture || drag.tool.cancel)?.call(drag.tool);
    drag = null;
    applyCursor();
  });

  canvas.addEventListener("pointerleave", () => {
    if (!drag) updateCursorOverlay(null);
  });

  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener(
    "wheel",
    (e) => {
      if (!state.doc) return;
      e.preventDefault();
      const at = view.eventPos(e);
      if (e.ctrlKey || e.metaKey || !e.shiftKey) {
        const factor = Math.exp(-e.deltaY * 0.0022);
        view.zoomBy(clamp(factor, 0.5, 2), at);
      } else {
        view.pan(-e.deltaX, -e.deltaY);
      }
    },
    { passive: false }
  );

  /* space = temporary pan, mirroring every other editor */
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !spaceHeld && !isTypingTarget(e.target)) {
      spaceHeld = true;
      canvas.style.cursor = "grab";
      overlay.cursor = null;
      requestRender();
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceHeld = false;
      canvas.style.cursor = "";
      applyCursor();
    }
  });

  window.addEventListener("blur", () => {
    spaceHeld = false;
    pointers.clear();
    pinch = null;
    if (drag?.kind === "tool") (drag.tool.abortGesture || drag.tool.cancel)?.call(drag.tool);
    drag = null;
  });

  function applyCursor() {
    canvas.style.cursor = activeTool().cursor || "default";
  }

  applyCursor();
  return { applyCursor };
}

export function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

/** Called by main.js when the tool changes so tools can set up/tear down. */
export function switchTool(next, prev) {
  const from = TOOLS[prev];
  const to = TOOLS[next];
  // leaving the transform tool keeps the result, like every other editor
  if (from?.applyOnLeave) from.apply();
  from?.cancel?.();
  from?.deactivate?.();
  to?.activate?.();
  overlay.cursor = null;
  requestRender();
}

/* a transform in progress holds bitmaps of the current state — keep it honest */
on("before-history", () => transform.cancel());
on("before-target-change", () => transform.apply());
on("doc", ({ reason }) => {
  if (reason === "open") transform.drop();
});
