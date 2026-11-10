/* ==========================================================================
   Photo adjustments and creative filters.

   Adjustments run as one ordered pipeline over an ImageData so sliders stay
   interactive; effects are one-shot canvas transforms. Everything preserves
   the alpha channel, and every blur or convolution weights neighbours by
   their alpha, so filters are safe on transparent layers (no dark or light
   fringes along cut-outs). Blurs treat the pixels beyond the canvas edge as
   repeats of the edge, so nothing fades out at the document border.
   ========================================================================== */

import { clamp255, parseColor } from "./color.js";
import { ctx2d, makeCanvas } from "./doc.js";
import { t } from "./i18n.js";

/* ------------------------------ adjustments ------------------------------ */

export const ADJUST_GROUPS = [
  {
    group: t("Light"),
    items: [
      { id: "exposure", label: t("Exposure"), min: -100, max: 100 },
      { id: "brightness", label: t("Brightness"), min: -100, max: 100 },
      { id: "contrast", label: t("Contrast"), min: -100, max: 100 },
      { id: "highlights", label: t("Highlights"), min: -100, max: 100 },
      { id: "shadows", label: t("Shadows"), min: -100, max: 100 },
      { id: "gamma", label: t("Gamma"), min: -100, max: 100 },
    ],
  },
  {
    group: t("Color"),
    items: [
      { id: "saturation", label: t("Saturation"), min: -100, max: 100 },
      { id: "vibrance", label: t("Vibrance"), min: -100, max: 100 },
      { id: "temperature", label: t("Temperature"), min: -100, max: 100 },
      { id: "tint", label: t("Tint"), min: -100, max: 100 },
      { id: "hue", label: t("Hue shift"), min: -180, max: 180, unit: "°" },
    ],
  },
  {
    group: t("Detail"),
    items: [
      { id: "clarity", label: t("Clarity"), min: 0, max: 100 },
      { id: "softness", label: t("Softness"), min: 0, max: 100 },
      { id: "grain", label: t("Grain"), min: 0, max: 100 },
      { id: "vignette", label: t("Vignette"), min: -100, max: 100 },
    ],
  },
];

export const ADJUST_ITEMS = ADJUST_GROUPS.flatMap((g) => g.items);

export const ADJUST_DEFAULTS = Object.fromEntries(
  ADJUST_ITEMS.map((i) => [i.id, 0])
);

export const hasAdjustments = (values) =>
  ADJUST_ITEMS.some((i) => (values[i.id] || 0) !== 0);

let _supportsFilter = null;
/** Canvas `filter` support (missing in older Safari) — probed on first use. */
const supportsFilter = () =>
  (_supportsFilter ??= typeof makeCanvas(1, 1).getContext("2d").filter === "string");

/** `region` clipped to a w × h canvas with integer edges, or null when empty. */
function clipRect(region, w, h) {
  if (!region) return { x: 0, y: 0, w, h };
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(w, Math.ceil(region.x + region.w));
  const y1 = Math.min(h, Math.ceil(region.y + region.h));
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}

/** `r` grown by `m` on every side, kept inside a w × h canvas. */
function growRect(r, m, w, h) {
  const x0 = Math.max(0, r.x - m);
  const y0 = Math.max(0, r.y - m);
  const x1 = Math.min(w, r.x + r.w + m);
  const y1 = Math.min(h, r.y + r.h + m);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Distance beyond which a gaussian of `sigma` no longer matters. */
const blurMargin = (sigma) => Math.ceil(sigma * 3) + 2;

/**
 * Apply the adjustment pipeline to a canvas, returning a new canvas.
 * Pass `region` to limit the work to the selection bounds (pixels outside it
 * are returned unprocessed).
 */
export function applyAdjustments(src, values, region = null) {
  const W = src.width;
  const H = src.height;
  const out = makeCanvas(W, H);
  const ctx = ctx2d(out);
  ctx.drawImage(src, 0, 0);
  const r = clipRect(region, W, H);
  if (!r) return out;

  const soft = values.softness || 0;
  if (soft > 0) {
    const sigma = (soft / 100) * 8;
    // blur the region plus enough margin that its pixels see real neighbours
    const a = growRect(r, blurMargin(sigma), W, H);
    const whole = a.w === W && a.h === H;
    let part = src;
    if (!whole) {
      part = makeCanvas(a.w, a.h);
      ctx2d(part).drawImage(src, -a.x, -a.y);
    }
    const blurred = blurCanvas(part, sigma);
    ctx.clearRect(a.x, a.y, a.w, a.h);
    ctx.drawImage(blurred, a.x, a.y);
  }

  const clarity = values.clarity || 0;
  if (clarity > 0) unsharp(out, clarity / 100, 1.4, r);

  const img = ctx.getImageData(r.x, r.y, r.w, r.h);
  pixelPass(img, values, W, H, r);
  ctx.putImageData(img, r.x, r.y);
  return out;
}

function pixelPass(img, v, docW, docH, region) {
  const d = img.data;
  const w = img.width;
  const h = img.height;

  const expMul = Math.pow(2, (v.exposure || 0) / 100);
  const brightAdd = (v.brightness || 0) * 1.6;
  const contrast = (v.contrast || 0) / 100;
  const cMul = contrast >= 0 ? 1 + contrast * 1.4 : 1 + contrast;
  const gammaExp = Math.pow(2, -(v.gamma || 0) / 100);
  const sat = 1 + (v.saturation || 0) / 100;
  const vib = (v.vibrance || 0) / 100;
  const temp = (v.temperature || 0) / 100;
  const tint = (v.tint || 0) / 100;
  const hueShift = v.hue || 0;
  const high = (v.highlights || 0) / 100;
  const shad = (v.shadows || 0) / 100;
  const grain = (v.grain || 0) / 100;
  const vig = (v.vignette || 0) / 100;

  const doGamma = (v.gamma || 0) !== 0;
  const doHue = hueShift !== 0;
  const doVib = vib !== 0;
  const doTone = high !== 0 || shad !== 0;
  const doColor = sat !== 1 || doVib || doHue;

  // exposure → brightness → contrast → gamma act on each channel alone, so
  // they collapse into one exact lookup table (no Math.pow per pixel)
  let curve = null;
  if (expMul !== 1 || brightAdd !== 0 || cMul !== 1 || doGamma) {
    curve = new Float64Array(256);
    for (let c = 0; c < 256; c++) {
      let x = c;
      if (expMul !== 1) x *= expMul;
      if (brightAdd !== 0) x += brightAdd;
      if (cMul !== 1) x = (x - 128) * cMul + 128;
      if (doGamma) x = 255 * Math.pow(Math.max(x, 0) / 255, gammaExp);
      curve[c] = x;
    }
  }

  // vignette geometry in document space
  const cx = docW / 2;
  const cy = docH / 2;
  const maxDist = Math.hypot(cx, cy) || 1;

  // deterministic grain so previews do not shimmer between renders
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967295 - 0.5) * 2;
  };

  for (let y = 0; y < h; y++) {
    const dy = region.y + y - cy;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;

      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      if (curve) {
        r = curve[r];
        g = curve[g];
        b = curve[b];
      }
      if (doTone) {
        const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        // smooth masks: shadows weight low tones, highlights weight high tones
        const sw = Math.max(0, 1 - l * 1.8);
        const hw = Math.max(0, (l - 0.45) * 1.8);
        const add = shad * sw * 90 + high * hw * 90;
        r += add;
        g += add;
        b += add;
      }
      if (temp !== 0) {
        r += temp * 42;
        b -= temp * 42;
      }
      if (tint !== 0) {
        g -= tint * 32;
        r += tint * 14;
        b += tint * 14;
      }

      if (doColor) {
        // the colour stage works on displayable values: out-of-range
        // intermediates would otherwise invert hues (vibrance on (−100, 2, 2))
        r = r < 0 ? 0 : r > 255 ? 255 : r;
        g = g < 0 ? 0 : g > 255 ? 255 : g;
        b = b < 0 ? 0 : b > 255 ? 255 : b;
        if (doHue) {
          // HSV round trip, inlined so no objects are allocated per pixel
          const rr = clamp255(r) / 255;
          const gg = clamp255(g) / 255;
          const bb = clamp255(b) / 255;
          const max = Math.max(rr, gg, bb);
          const min = Math.min(rr, gg, bb);
          const dd = max - min;
          let hh = 0;
          if (dd !== 0) {
            if (max === rr) hh = ((gg - bb) / dd) % 6;
            else if (max === gg) hh = (bb - rr) / dd + 2;
            else hh = (rr - gg) / dd + 4;
            hh *= 60;
            if (hh < 0) hh += 360;
          }
          const sv = max === 0 ? 0 : dd / max;
          const hs = (((hh + hueShift) % 360) + 360) % 360;
          const c = max * sv;
          const xx = c * (1 - Math.abs(((hs / 60) % 2) - 1));
          const m = max - c;
          let r1 = 0;
          let g1 = 0;
          let b1 = 0;
          if (hs < 60) (r1 = c), (g1 = xx);
          else if (hs < 120) (r1 = xx), (g1 = c);
          else if (hs < 180) (g1 = c), (b1 = xx);
          else if (hs < 240) (g1 = xx), (b1 = c);
          else if (hs < 300) (r1 = xx), (b1 = c);
          else (r1 = c), (b1 = xx);
          r = Math.round((r1 + m) * 255);
          g = Math.round((g1 + m) * 255);
          b = Math.round((b1 + m) * 255);
        }
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        let s = sat;
        if (doVib) {
          const mx = Math.max(r, g, b);
          const mn = Math.min(r, g, b);
          const cur = mx === 0 ? 0 : (mx - mn) / mx;
          s += vib * (1 - cur) * 1.2;
        }
        if (s !== 1) {
          r = l + (r - l) * s;
          g = l + (g - l) * s;
          b = l + (b - l) * s;
        }
      }

      if (vig !== 0) {
        const dx = region.x + x - cx;
        const dist = Math.sqrt(dx * dx + dy * dy) / maxDist;
        if (dist > 0.28) {
          const f = 1 - vig * Math.pow((dist - 0.28) / 0.72, 1.7);
          r *= f;
          g *= f;
          b *= f;
        }
      }

      if (grain !== 0) {
        const n = rand() * grain * 46;
        r += n;
        g += n;
        b += n;
      }

      d[i] = clamp255(r);
      d[i + 1] = clamp255(g);
      d[i + 2] = clamp255(b);
    }
  }
}

/* ------------------------------ convolution ------------------------------ */

/**
 * One sliding-window box pass over every row (or column) of an interleaved
 * RGBA float buffer — cost is independent of the radius. Pixels beyond the
 * border repeat the edge pixel.
 */
function boxPass(src, dst, w, h, r, horizontal) {
  const span = r * 2 + 1;
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4;
  const lineStep = horizontal ? w * 4 : 4;
  const last = len - 1;
  for (let line = 0; line < lines; line++) {
    const base = line * lineStep;
    for (let ch = 0; ch < 4; ch++) {
      const o = base + ch;
      let acc = 0;
      for (let k = -r; k <= r; k++) acc += src[o + (k < 0 ? 0 : k > last ? last : k) * step];
      for (let i = 0; i < len; i++) {
        dst[o + i * step] = acc / span;
        const add = i + r + 1;
        const sub = i - r;
        acc += src[o + (add > last ? last : add) * step] - src[o + (sub < 0 ? 0 : sub) * step];
      }
    }
  }
}

/**
 * RGBA bytes → floats with the colour multiplied by alpha, surrounded by a
 * `pad`-pixel border that repeats the edge (`extend`) or is transparent.
 */
function premultiply(src, w, h, pad = 0, extend = true) {
  const pw = w + pad * 2;
  const ph = h + pad * 2;
  const f = new Float32Array(pw * ph * 4);
  for (let y = 0; y < ph; y++) {
    let sy = y - pad;
    if (sy < 0 || sy >= h) {
      if (!extend) continue;
      sy = sy < 0 ? 0 : h - 1;
    }
    for (let x = 0; x < pw; x++) {
      let sx = x - pad;
      if (sx < 0 || sx >= w) {
        if (!extend) continue;
        sx = sx < 0 ? 0 : w - 1;
      }
      const i = (sy * w + sx) * 4;
      const o = (y * pw + x) * 4;
      const a = src[i + 3];
      const k = a / 255;
      f[o] = src[i] * k;
      f[o + 1] = src[i + 1] * k;
      f[o + 2] = src[i + 2] * k;
      f[o + 3] = a;
    }
  }
  return f;
}

/** Premultiplied floats → RGBA bytes, cropping a `pad`-pixel border. */
function unpremultiply(f, w, h, pad = 0) {
  const out = new Uint8ClampedArray(w * h * 4);
  const pw = w + pad * 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + pad) * pw + x + pad) * 4;
      const o = (y * w + x) * 4;
      const a = f[i + 3];
      if (a > 0) {
        const k = a / 255;
        out[o] = f[i] / k;
        out[o + 1] = f[i + 1] / k;
        out[o + 2] = f[i + 2] / k;
      }
      out[o + 3] = a;
    }
  }
  return out;
}

/** Box radii for three passes that together match a gaussian of `sigma`. */
function boxRadii(sigma, passes = 3) {
  const ideal = Math.sqrt((12 * sigma * sigma) / passes + 1);
  let lo = Math.floor(ideal);
  if (lo % 2 === 0) lo--;
  const m = Math.round(
    (12 * sigma * sigma - passes * lo * lo - 4 * passes * lo - 3 * passes) / (-4 * lo - 4)
  );
  return Array.from({ length: passes }, (_, i) => ((i < m ? lo : lo + 2) - 1) / 2);
}

/**
 * Box blur of RGBA bytes, weighted by alpha so transparent neighbours do not
 * darken the colour. Pixels beyond the border repeat the edge.
 */
export function boxBlurData(src, w, h, radius) {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return new Uint8ClampedArray(src);
  // one pass per axis: clamping at the border is an exact edge extension
  const f = premultiply(src, w, h);
  const tmp = new Float32Array(f.length);
  boxPass(f, tmp, w, h, r, true);
  boxPass(tmp, f, w, h, r, false);
  return unpremultiply(f, w, h);
}

/**
 * Gaussian blur (σ = `sigma`, the same as CSS `blur(σpx)`) of RGBA bytes by
 * three box passes, weighted by alpha. With `extendEdges` the pixels beyond
 * the border repeat the edge; otherwise the outside is transparent.
 */
export function gaussData(src, w, h, sigma, { extendEdges = true } = {}) {
  if (!(sigma > 0.3)) return new Uint8ClampedArray(src);
  const radii = boxRadii(sigma).filter((r) => r >= 1);
  // successive passes need the blurred outside too: work on a padded copy
  const pad = radii.reduce((a, r) => a + r, 0);
  const pw = w + pad * 2;
  const ph = h + pad * 2;
  const f = premultiply(src, w, h, pad, extendEdges);
  const tmp = new Float32Array(f.length);
  for (const r of radii) {
    boxPass(f, tmp, pw, ph, r, true);
    boxPass(tmp, f, pw, ph, r, false);
  }
  return unpremultiply(f, w, h, pad);
}

/**
 * Gaussian blur of a canvas into a new canvas of the same size, equivalent to
 * CSS `blur(radius px)` (σ = radius). With `extendEdges` the pixels beyond
 * the canvas repeat its edge, so the border neither fades to transparent nor
 * darkens; with `extendEdges: false` the outside is transparent.
 */
export function blurCanvas(canvas, radius, { extendEdges = true } = {}) {
  const w = canvas.width;
  const h = canvas.height;
  const out = makeCanvas(w, h);
  const oc = ctx2d(out);
  if (!(radius > 0.05)) {
    oc.drawImage(canvas, 0, 0);
    return out;
  }
  if (!supportsFilter()) {
    const img = canvas.getContext("2d").getImageData(0, 0, w, h);
    img.data.set(gaussData(img.data, w, h, radius, { extendEdges }));
    oc.putImageData(img, 0, 0);
    return out;
  }
  if (!extendEdges) {
    oc.filter = `blur(${radius}px)`;
    oc.drawImage(canvas, 0, 0);
    oc.filter = "none";
    return out;
  }
  // repeat the outermost rows/columns (and corners) into a margin, blur that
  // into a canvas of the same padded size, then crop the middle back out
  const p = blurMargin(radius);
  const pw = w + p * 2;
  const ph = h + p * 2;
  const padded = makeCanvas(pw, ph);
  const pc = ctx2d(padded);
  pc.imageSmoothingEnabled = false;
  pc.drawImage(canvas, p, p);
  pc.drawImage(canvas, 0, 0, w, 1, p, 0, w, p);
  pc.drawImage(canvas, 0, h - 1, w, 1, p, p + h, w, p);
  pc.drawImage(canvas, 0, 0, 1, h, 0, p, p, h);
  pc.drawImage(canvas, w - 1, 0, 1, h, p + w, p, p, h);
  pc.drawImage(canvas, 0, 0, 1, 1, 0, 0, p, p);
  pc.drawImage(canvas, w - 1, 0, 1, 1, p + w, 0, p, p);
  pc.drawImage(canvas, 0, h - 1, 1, 1, 0, p + h, p, p);
  pc.drawImage(canvas, w - 1, h - 1, 1, 1, p + w, p + h, p, p);
  const blurred = makeCanvas(pw, ph);
  const bc = ctx2d(blurred);
  bc.filter = `blur(${radius}px)`;
  bc.drawImage(padded, 0, 0);
  bc.filter = "none";
  oc.drawImage(blurred, -p, -p);
  padded.width = padded.height = blurred.width = blurred.height = 0;
  return out;
}

/**
 * In-place unsharp mask on a canvas (within `region` when given). The blur is
 * weighted by alpha, so transparent surroundings cause no halo along a
 * cut-out's edge.
 */
export function unsharp(canvas, amount, radius = 1.2, region = null) {
  const W = canvas.width;
  const H = canvas.height;
  const r = clipRect(region, W, H);
  if (!r) return canvas;
  const rad = Math.max(1, Math.round(radius));
  const a = growRect(r, rad, W, H);
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(a.x, a.y, a.w, a.h);
  const d = img.data;
  const blurred = boxBlurData(d, a.w, a.h, rad);
  const k = amount * 1.4;
  for (let y = r.y - a.y; y < r.y - a.y + r.h; y++) {
    for (let x = r.x - a.x, i = (y * a.w + x) * 4; x < r.x - a.x + r.w; x++, i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = clamp255(d[i] + (d[i] - blurred[i]) * k);
      d[i + 1] = clamp255(d[i + 1] + (d[i + 1] - blurred[i + 1]) * k);
      d[i + 2] = clamp255(d[i + 2] + (d[i + 2] - blurred[i + 2]) * k);
    }
  }
  ctx.putImageData(img, a.x, a.y, r.x - a.x, r.y - a.y, r.w, r.h);
  return canvas;
}

/**
 * Generic 3×3 convolution; alpha is preserved. A fully transparent neighbour
 * has no colour, so it counts as the centre pixel (like the canvas edge).
 */
export function convolve(canvas, kernel, { divisor, bias = 0 } = {}) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  const div = divisor ?? (kernel.reduce((a, b) => a + b, 0) || 1);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] === 0) continue;
      let r = 0,
        g = 0,
        b = 0;
      let ki = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++, ki++) {
          const k = kernel[ki];
          if (k === 0) continue;
          const sx = Math.min(w - 1, Math.max(0, x + kx));
          const sy = Math.min(h - 1, Math.max(0, y + ky));
          let si = (sy * w + sx) * 4;
          if (src[si + 3] === 0) si = i;
          r += src[si] * k;
          g += src[si + 1] * k;
          b += src[si + 2] * k;
        }
      }
      d[i] = clamp255(r / div + bias);
      d[i + 1] = clamp255(g / div + bias);
      d[i + 2] = clamp255(b / div + bias);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* --------------------------------- effects -------------------------------- */

function eachPixel(canvas, fn) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    fn(d, i);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Give `dst` exactly the alpha channel of `src` (same size). */
function copyAlpha(dst, src) {
  const w = dst.width;
  const h = dst.height;
  const dc = dst.getContext("2d");
  const img = dc.getImageData(0, 0, w, h);
  const a = src.getContext("2d").getImageData(0, 0, w, h).data;
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) d[i] = a[i];
  dc.putImageData(img, 0, 0);
  return dst;
}

/** Gaussian blur (σ = px) returning a new canvas; edges are extended. */
export function gaussianBlur(canvas, px) {
  return blurCanvas(canvas, px);
}

/**
 * A spatial size for an effect run at `scale` (thumbnail pixels per document
 * pixel): sizes shrink with the image so a thumbnail looks like the full
 * result, but never below `min`, where the effect would vanish entirely.
 */
const scaled = (size, scale, min) => (scale < 1 ? Math.max(min, size * scale) : size);

const grayOf = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export const EFFECTS = [
  {
    id: "grayscale",
    name: t("Grayscale"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = grayOf(d, i);
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "noir",
    name: t("Noir"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = clamp255((grayOf(d, i) - 128) * 1.55 + 118);
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "sepia",
    name: t("Sepia"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        d[i] = clamp255(r * 0.393 + g * 0.769 + b * 0.189);
        d[i + 1] = clamp255(r * 0.349 + g * 0.686 + b * 0.168);
        d[i + 2] = clamp255(r * 0.272 + g * 0.534 + b * 0.131);
      }),
  },
  {
    id: "invert",
    name: t("Invert"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }),
  },
  {
    id: "vivid",
    name: t("Vivid"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const l = grayOf(d, i);
        for (let k = 0; k < 3; k++) {
          d[i + k] = clamp255((l + (d[i + k] - l) * 1.45 - 128) * 1.12 + 128);
        }
      }),
  },
  {
    id: "fade",
    name: t("Fade"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const l = grayOf(d, i);
        for (let k = 0; k < 3; k++) {
          d[i + k] = clamp255(l + (d[i + k] - l) * 0.62 + 26);
        }
      }),
  },
  {
    id: "warm",
    name: t("Warm"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        d[i] = clamp255(d[i] * 1.11 + 8);
        d[i + 1] = clamp255(d[i + 1] * 1.02);
        d[i + 2] = clamp255(d[i + 2] * 0.9);
      }),
  },
  {
    id: "cool",
    name: t("Cool"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        d[i] = clamp255(d[i] * 0.92);
        d[i + 1] = clamp255(d[i + 1] * 1.01);
        d[i + 2] = clamp255(d[i + 2] * 1.13 + 6);
      }),
  },
  {
    id: "vintage",
    name: t("Vintage"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const r = d[i],
          g = d[i + 1],
          b = d[i + 2];
        d[i] = clamp255(r * 0.9 + g * 0.16 + 24);
        d[i + 1] = clamp255(g * 0.87 + b * 0.08 + 16);
        d[i + 2] = clamp255(b * 0.78 + 26);
      }),
  },
  {
    id: "duotone",
    name: t("Duotone"),
    fn: (c, { primary, secondary }) => {
      const a = parseColor(primary) || { r: 20, g: 20, b: 60 };
      const b = parseColor(secondary) || { r: 255, g: 220, b: 120 };
      return eachPixel(c, (d, i) => {
        const t = grayOf(d, i) / 255;
        d[i] = clamp255(a.r + (b.r - a.r) * t);
        d[i + 1] = clamp255(a.g + (b.g - a.g) * t);
        d[i + 2] = clamp255(a.b + (b.b - a.b) * t);
      });
    },
  },
  {
    id: "posterize",
    name: t("Posterize"),
    fn: (c) => {
      const steps = 5;
      const q = 255 / (steps - 1);
      return eachPixel(c, (d, i) => {
        d[i] = Math.round(d[i] / q) * q;
        d[i + 1] = Math.round(d[i + 1] / q) * q;
        d[i + 2] = Math.round(d[i + 2] / q) * q;
      });
    },
  },
  {
    id: "threshold",
    name: t("Threshold"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = grayOf(d, i) > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "solarize",
    name: t("Solarize"),
    fn: (c) =>
      eachPixel(c, (d, i) => {
        for (let k = 0; k < 3; k++) {
          d[i + k] = d[i + k] < 128 ? d[i + k] : 255 - d[i + k];
        }
      }),
  },
  {
    id: "blur",
    name: t("Soft blur"),
    fn: (c, o) => blurCanvas(c, scaled(o.radius ?? 5, o.scale, 0.5)),
  },
  {
    id: "sharpen",
    name: t("Sharpen"),
    // a 1 px radius cannot shrink, so a thumbnail gets a gentler amount
    fn: (c, o) => unsharp(c, 0.9 * scaled(1, o.scale, 0.3), 1),
  },
  {
    id: "emboss",
    name: t("Emboss"),
    fn: (c, o) => {
      // identity plus a directional derivative; the derivative of a
      // downscaled image is weaker by the scale factor
      const k = scaled(1, o.scale, 0.3);
      return convolve(c, [-2 * k, -k, 0, -k, 1, k, 0, k, 2 * k], { divisor: 1, bias: 0 });
    },
  },
  {
    id: "edges",
    name: t("Edge detect"),
    fn: (c, o) => {
      const k = scaled(1, o.scale, 0.3);
      const out = convolve(c, [0, -k, 0, -k, 4 * k, -k, 0, -k, 0], { divisor: 1 });
      return eachPixel(out, (d, i) => {
        const g = clamp255(grayOf(d, i) * 2.2);
        d[i] = d[i + 1] = d[i + 2] = g;
      });
    },
  },
  {
    id: "sketch",
    name: t("Pencil sketch"),
    fn: (c, o) => {
      const base = makeCanvas(c.width, c.height);
      ctx2d(base).drawImage(c, 0, 0);
      eachPixel(base, (d, i) => {
        const g = grayOf(d, i);
        d[i] = d[i + 1] = d[i + 2] = g;
      });
      const inverted = makeCanvas(c.width, c.height);
      const ic = ctx2d(inverted);
      ic.drawImage(base, 0, 0);
      eachPixel(inverted, (d, i) => {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      });
      const blurred = blurCanvas(inverted, scaled(6, o.scale, 0.75));
      const out = makeCanvas(c.width, c.height);
      const oc = ctx2d(out);
      oc.drawImage(base, 0, 0);
      oc.globalCompositeOperation = "color-dodge";
      oc.drawImage(blurred, 0, 0);
      oc.globalCompositeOperation = "source-over";
      // keep the original alpha exactly (compositing would have changed it)
      return copyAlpha(out, c);
    },
  },
  {
    id: "bloom",
    name: t("Bloom"),
    fn: (c, o) => {
      const bright = makeCanvas(c.width, c.height);
      const bc = ctx2d(bright);
      bc.drawImage(c, 0, 0);
      eachPixel(bright, (d, i) => {
        const g = grayOf(d, i);
        const k = g > 165 ? 1 : 0;
        d[i] *= k;
        d[i + 1] *= k;
        d[i + 2] *= k;
      });
      const glow = blurCanvas(bright, scaled(14, o.scale, 1));
      const out = makeCanvas(c.width, c.height);
      const oc = ctx2d(out);
      oc.drawImage(c, 0, 0);
      oc.globalAlpha = 0.55;
      oc.globalCompositeOperation = "screen";
      oc.drawImage(glow, 0, 0);
      oc.globalAlpha = 1;
      oc.globalCompositeOperation = "source-over";
      // the glow stays inside the original shape, with its alpha unchanged
      return copyAlpha(out, c);
    },
  },
  {
    id: "pixelate",
    name: t("Pixelate"),
    fn: (c, o) => {
      // the default block is relative to the (document) image size
      const s = o.scale;
      const full = o.block ?? Math.max(2, Math.round(Math.min(c.width, c.height) / s / 90));
      const size = Math.max(1, Math.round(scaled(full, s, 2)));
      const small = makeCanvas(
        Math.max(1, Math.ceil(c.width / size)),
        Math.max(1, Math.ceil(c.height / size))
      );
      const sc = ctx2d(small);
      sc.imageSmoothingEnabled = true;
      sc.drawImage(c, 0, 0, small.width, small.height);
      const out = makeCanvas(c.width, c.height);
      const oc = ctx2d(out);
      oc.imageSmoothingEnabled = false;
      oc.drawImage(small, 0, 0, c.width, c.height);
      return out;
    },
  },
  {
    id: "vignette",
    name: t("Vignette"),
    fn: (c) => {
      const out = makeCanvas(c.width, c.height);
      const oc = ctx2d(out);
      oc.drawImage(c, 0, 0);
      const g = oc.createRadialGradient(
        c.width / 2,
        c.height / 2,
        Math.min(c.width, c.height) * 0.32,
        c.width / 2,
        c.height / 2,
        Math.hypot(c.width, c.height) / 2
      );
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.72)");
      // source-atop darkens the pixels without touching their alpha
      oc.globalCompositeOperation = "source-atop";
      oc.fillStyle = g;
      oc.fillRect(0, 0, c.width, c.height);
      oc.globalCompositeOperation = "source-over";
      return out;
    },
  },
];

/**
 * Apply an effect by id. Always returns a canvas (may be the input one).
 * `opts` carries the colours (`primary`, `secondary`), effect parameters
 * (`radius`, `block`) and `scale` — image pixels per document pixel (0 < scale
 * ≤ 1, default 1) — so a thumbnail renders spatial effects at its own size.
 */
export function applyEffect(id, canvas, opts = {}) {
  const effect = EFFECTS.find((e) => e.id === id);
  if (!effect) return canvas;
  const s = Number(opts.scale);
  const scale = s > 0 && s < 1 ? s : 1;
  return effect.fn(canvas, { ...opts, scale }) || canvas;
}

/* ---------------------------- levels & curves ---------------------------- */

/**
 * Per-channel histograms of the visible pixels inside `region`. With a
 * `selection` canvas (same size, alpha = selectedness) only pixels that are
 * at least half selected count.
 */
export function histogram(canvas, region = null, selection = null) {
  const r = clipRect(region, canvas.width, canvas.height);
  const out = {
    rgb: new Uint32Array(256),
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
  };
  if (!r) return out;
  const { data } = canvas.getContext("2d").getImageData(r.x, r.y, r.w, r.h);
  const sel = selection ? selection.getContext("2d").getImageData(r.x, r.y, r.w, r.h).data : null;
  // large images: sample a grid — the shape of the histogram is what matters
  const step = Math.max(1, Math.floor(Math.sqrt((r.w * r.h) / 1_500_000))) * 4;
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] < 8) continue;
    if (sel && sel[i + 3] < 128) continue;
    const R = data[i];
    const G = data[i + 1];
    const B = data[i + 2];
    out.r[R]++;
    out.g[G]++;
    out.b[B]++;
    out.rgb[Math.round(0.299 * R + 0.587 * G + 0.114 * B)]++;
  }
  return out;
}

/** Lookup table for a levels setting: input black/white, gamma, output range. */
export function levelsLUT({ inBlack = 0, inWhite = 255, gamma = 1, outBlack = 0, outWhite = 255 } = {}) {
  const lut = new Uint8ClampedArray(256);
  const span = Math.max(1, inWhite - inBlack);
  const g = 1 / Math.max(0.01, gamma);
  for (let v = 0; v < 256; v++) {
    const n = Math.min(1, Math.max(0, (v - inBlack) / span));
    lut[v] = outBlack + Math.pow(n, g) * (outWhite - outBlack);
  }
  return lut;
}

/** Black/white points that clip `clip` of the pixels at each end. */
export function autoRange(hist, clip = 0.001) {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i];
  if (!total) return { inBlack: 0, inWhite: 255 };
  const limit = total * clip;
  let lo = 0;
  let acc = 0;
  while (lo < 254 && acc + hist[lo] <= limit) acc += hist[lo++];
  let hi = 255;
  acc = 0;
  while (hi > lo + 1 && acc + hist[hi] <= limit) acc += hist[hi--];
  // a (nearly) single-valued channel has no range to stretch — leave it be
  if (hi - lo < 8) return { inBlack: 0, inWhite: 255 };
  return { inBlack: lo, inWhite: hi };
}

/**
 * Smooth monotone curve through control points (0–255 on both axes) using
 * Fritsch–Carlson tangents, so the curve never overshoots between points.
 */
export function curveLUT(points) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const lut = new Uint8ClampedArray(256);
  const n = pts.length;
  if (n === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }
  if (n === 1) {
    lut.fill(pts[0].y);
    return lut;
  }
  const dx = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = Math.max(1e-6, pts[i + 1].x - pts[i].x);
    slope[i] = (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const m = new Array(n);
  m[0] = slope[0];
  m[n - 1] = slope[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      m[i] = k * a * slope[i];
      m[i + 1] = k * b * slope[i];
    }
  }
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    if (x <= pts[0].x) {
      lut[x] = pts[0].y;
      continue;
    }
    if (x >= pts[n - 1].x) {
      lut[x] = pts[n - 1].y;
      continue;
    }
    while (seg < n - 2 && x > pts[seg + 1].x) seg++;
    const h = dx[seg];
    const tt = (x - pts[seg].x) / h;
    const t2 = tt * tt;
    const t3 = t2 * tt;
    lut[x] =
      (2 * t3 - 3 * t2 + 1) * pts[seg].y +
      (t3 - 2 * t2 + tt) * h * m[seg] +
      (-2 * t3 + 3 * t2) * pts[seg + 1].y +
      (t3 - t2) * h * m[seg + 1];
  }
  return lut;
}

/** Compose two lookup tables: out = second(first(v)). */
export function chainLUT(first, second) {
  const out = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) out[v] = second[first[v]];
  return out;
}

/** Apply per-channel lookup tables, returning a processed copy. */
export function applyLUTs(src, { r, g, b }, region = null) {
  const out = makeCanvas(src.width, src.height);
  const ctx = ctx2d(out);
  ctx.drawImage(src, 0, 0);
  const reg = region || { x: 0, y: 0, w: out.width, h: out.height };
  if (reg.w < 1 || reg.h < 1) return out;
  const img = ctx.getImageData(reg.x, reg.y, reg.w, reg.h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    d[i] = r[d[i]];
    d[i + 1] = g[d[i + 1]];
    d[i + 2] = b[d[i + 2]];
  }
  ctx.putImageData(img, reg.x, reg.y);
  return out;
}
