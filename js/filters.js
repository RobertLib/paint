/* ==========================================================================
   Photo adjustments and creative filters.

   Adjustments run as one ordered pipeline over an ImageData so sliders stay
   interactive; effects are one-shot canvas transforms. Everything preserves
   the alpha channel, and every blur or convolution weights neighbours by
   their alpha, so filters are safe on transparent layers (no dark or light
   fringes along cut-outs). Blurs treat the pixels beyond the canvas edge as
   repeats of the edge, so nothing fades out at the document border.

   Large images are the norm, so the heavy passes stream: blurs keep running
   sums of a few rows instead of whole-image float buffers, and temporary
   canvases are released as soon as they are drawn.
   ========================================================================== */

import { clamp255, parseColor } from "./color.js";
import { ctx2d, makeCanvas, releaseCanvas } from "./doc.js";
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
 * Clarity's local-contrast radius (gaussian σ): relative to the image, so the
 * same setting looks the same on a thumbnail-sized picture and a 24 MP photo.
 */
const claritySigma = (w, h) => Math.max(2, Math.min(w, h) * 0.015);

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

  // clarity reads a margin around the region; everything else is per pixel
  const clarity = values.clarity || 0;
  const sigma = claritySigma(W, H);
  const area = clarity > 0 ? growRect(r, boxReach(boxRadii(sigma)), W, H) : r;

  let img;
  const soft = values.softness || 0;
  if (soft > 0) {
    // the softened pixels of the area, from a blur of the area plus enough
    // margin that its pixels see real neighbours
    const sig = (soft / 100) * 8;
    const a = growRect(area, blurMargin(sig), W, H);
    const whole = a.w === W && a.h === H;
    let part = src;
    if (!whole) {
      part = makeCanvas(a.w, a.h);
      ctx2d(part).drawImage(src, -a.x, -a.y);
    }
    const blurred = blurCanvas(part, sig);
    img = blurred.getContext("2d").getImageData(area.x - a.x, area.y - a.y, area.w, area.h);
    releaseCanvas(blurred);
    if (!whole) releaseCanvas(part);
  } else {
    img = src.getContext("2d").getImageData(area.x, area.y, area.w, area.h);
  }

  if (clarity > 0) localContrast(img, clarity / 100, sigma, r.x - area.x, r.y - area.y, r.w, r.h);
  pixelPass(img, values, W, H, r, area);
  // only the region is written back: the margin was there to be read
  ctx.putImageData(img, area.x, area.y, r.x - area.x, r.y - area.y, r.w, r.h);
  return out;
}

/**
 * Clarity: midtone local contrast. Each pixel's luminance is pushed away from
 * a wide, alpha-weighted blur of the luminance around it, most in the
 * midtones and not at all in pure black or white, by the same amount on all
 * three channels (no colour shift). Works in place on the `w` × `h` part of
 * `img` at (`ox`, `oy`); the rest of `img` is the margin the blur reads.
 */
function localContrast(img, amount, sigma, ox, oy, w, h) {
  const d = img.data;
  const W = img.width;
  const H = img.height;
  const n = W * H;
  let opaque = true;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] !== 255) {
      opaque = false;
      break;
    }
  }
  // luminance × alpha and alpha × 256 in 16-bit integers, so transparent
  // surroundings pull nothing towards black. An opaque area skips the alpha
  // (it would blur to 255 × 256 everywhere) with the very same numbers, so a
  // selection's part and the whole image agree exactly.
  const lum = new Uint16Array(n);
  const tmp = new Uint16Array(n);
  const alpha = opaque ? null : new Uint16Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    lum[p] = (l * d[i + 3] + 0.5) | 0;
    if (alpha) alpha[p] = d[i + 3] << 8;
  }
  const radii = boxRadii(sigma);
  boxBlur1(lum, tmp, W, H, radii);
  if (alpha) boxBlur1(alpha, tmp, W, H, radii);

  const k = amount * 1.25;
  for (let y = oy; y < oy + h; y++) {
    for (let x = ox, p = y * W + x; x < ox + w; x++, p++) {
      const i = p * 4;
      if (d[i + 3] === 0) continue;
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let base;
      if (!alpha) base = lum[p] / 255;
      else base = alpha[p] > 0 ? (lum[p] * 256) / alpha[p] : l;
      const t = l / 255;
      const add = k * 4 * t * (1 - t) * (l - base);
      d[i] = clamp255(d[i] + add);
      d[i + 1] = clamp255(d[i + 1] + add);
      d[i + 2] = clamp255(d[i + 2] + add);
    }
  }
}

/**
 * The per-pixel stage, on the `region` part of `img` — which holds the
 * document area `area` (the region itself unless clarity read a margin).
 */
function pixelPass(img, v, docW, docH, region, area = region) {
  const d = img.data;
  const stride = img.width;
  const ox = region.x - area.x;
  const oy = region.y - area.y;
  const w = region.w;
  const h = region.h;

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

  // vignette: an ellipse following the frame (corners at distance 1),
  // measured from pixel centres in document space
  const hx = docW / 2;
  const hy = docH / 2;

  // deterministic grain so previews do not shimmer between renders
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 4294967295 - 0.5) * 2;
  };

  for (let y = 0; y < h; y++) {
    const ny = (region.y + y + 0.5 - hy) / hy;
    for (let x = 0; x < w; x++) {
      const i = ((oy + y) * stride + ox + x) * 4;
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

      // everything after this works on displayable values — always, so the
      // vignette does not jump when a colour slider leaves zero, and
      // out-of-range intermediates cannot invert hues (vibrance on (−100, 2, 2))
      r = r < 0 ? 0 : r > 255 ? 255 : r;
      g = g < 0 ? 0 : g > 255 ? 255 : g;
      b = b < 0 ? 0 : b > 255 ? 255 : b;

      if (doColor) {
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
        // full desaturation plus negative vibrance stops at gray: a negative
        // factor would invert the hue
        if (s < 0) s = 0;
        if (s !== 1) {
          r = l + (r - l) * s;
          g = l + (g - l) * s;
          b = l + (b - l) * s;
        }
      }

      if (vig !== 0) {
        const nx = (region.x + x + 0.5 - hx) / hx;
        const dist = Math.sqrt((nx * nx + ny * ny) / 2);
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
 * One sliding-window box pass over a single-channel buffer, along rows
 * (`horizontal`) or down columns — cost independent of the radius, rows
 * walked in memory order. Pixels beyond the border repeat the edge pixel.
 * `bias` 0.5 rounds into an integer buffer; 0 keeps floats as they are.
 */
function boxPass1(src, dst, w, h, r, horizontal, bias, acc) {
  const span = r * 2 + 1;
  if (horizontal) {
    const last = w - 1;
    for (let y = 0, o = 0; y < h; y++, o += w) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += src[o + (k < 0 ? 0 : k > last ? last : k)];
      for (let x = 0; x < w; x++) {
        dst[o + x] = s / span + bias;
        const add = x + r + 1;
        const sub = x - r;
        s += src[o + (add > last ? last : add)] - src[o + (sub < 0 ? 0 : sub)];
      }
    }
    return;
  }
  // columns: one running sum per column, advanced a whole row at a time
  const last = h - 1;
  acc.fill(0);
  for (let k = -r; k <= r; k++) {
    const o = (k < 0 ? 0 : k > last ? last : k) * w;
    for (let x = 0; x < w; x++) acc[x] += src[o + x];
  }
  for (let y = 0, o = 0; y < h; y++, o += w) {
    const add = y + r + 1;
    const sub = y - r;
    const ao = (add > last ? last : add) * w;
    const so = (sub < 0 ? 0 : sub) * w;
    for (let x = 0; x < w; x++) {
      dst[o + x] = acc[x] / span + bias;
      acc[x] += src[ao + x] - src[so + x];
    }
  }
}

/**
 * Three box passes per axis (radii from boxRadii) over a single-channel
 * buffer, in place; `tmp` is scratch of the same size. Integer buffers are
 * rounded after every pass, float buffers kept exact.
 */
function boxBlur1(buf, tmp, w, h, radii) {
  const bias = buf instanceof Float32Array || buf instanceof Float64Array ? 0 : 0.5;
  const acc = new Float64Array(w);
  for (const r of radii) {
    if (r < 1) continue;
    boxPass1(buf, tmp, w, h, r, true, bias, acc);
    boxPass1(tmp, buf, w, h, r, false, bias, acc);
  }
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

/** How far successive box passes reach together. */
const boxReach = (radii) => radii.reduce((a, r) => a + (r >= 1 ? r : 0), 0);

/**
 * Alpha-weighted box blur of RGBA bytes (radius `r`, edges repeated),
 * streamed a row at a time with only 2r + 2 rows of running sums in memory.
 * `emit(y, acc, n)` gets, for every pixel of output row y at acc[x * 4…],
 * the window's sums of colour × alpha (r, g, b) and of alpha, over `n`
 * pixels. Source rows up to y are not read again once row y is emitted, so
 * `emit` may overwrite them in place.
 */
function boxStream(src, w, h, r, emit) {
  const span = r * 2 + 1;
  const ring = r * 2 + 2;
  const rowLen = w * 4;
  const rows = new Float64Array(ring * rowLen);
  const rowOf = new Int32Array(ring).fill(-1);
  const lastX = w - 1;
  const lastY = h - 1;
  // horizontal window sums of row k, cached in the ring
  const hrow = (k) => {
    const slot = k % ring;
    const base = slot * rowLen;
    if (rowOf[slot] === k) return base;
    rowOf[slot] = k;
    const o = k * rowLen;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    let sa = 0;
    for (let j = -r; j <= r; j++) {
      const i = o + (j < 0 ? 0 : j > lastX ? lastX : j) * 4;
      const a = src[i + 3];
      sr += src[i] * a;
      sg += src[i + 1] * a;
      sb += src[i + 2] * a;
      sa += a;
    }
    for (let x = 0, q = base; x < w; x++, q += 4) {
      rows[q] = sr;
      rows[q + 1] = sg;
      rows[q + 2] = sb;
      rows[q + 3] = sa;
      const add = x + r + 1;
      const sub = x - r;
      const ia = o + (add > lastX ? lastX : add) * 4;
      const is = o + (sub < 0 ? 0 : sub) * 4;
      const a1 = src[ia + 3];
      const a0 = src[is + 3];
      sr += src[ia] * a1 - src[is] * a0;
      sg += src[ia + 1] * a1 - src[is + 1] * a0;
      sb += src[ia + 2] * a1 - src[is + 2] * a0;
      sa += a1 - a0;
    }
    return base;
  };
  const acc = new Float64Array(rowLen);
  for (let k = -r; k <= r; k++) {
    const b = hrow(k < 0 ? 0 : k > lastY ? lastY : k);
    for (let q = 0; q < rowLen; q++) acc[q] += rows[b + q];
  }
  for (let y = 0; y < h; y++) {
    // the row entering the window is read before row y may be overwritten;
    // the one leaving it is still in the ring (2r + 2 rows apart at most)
    const add = y + r + 1;
    const sub = y - r;
    const ba = hrow(add > lastY ? lastY : add);
    emit(y, acc, span * span);
    const bs = hrow(sub < 0 ? 0 : sub);
    for (let q = 0; q < rowLen; q++) acc[q] += rows[ba + q] - rows[bs + q];
  }
}

/**
 * Box blur of RGBA bytes, weighted by alpha so transparent neighbours do not
 * darken the colour. Pixels beyond the border repeat the edge.
 */
export function boxBlurData(src, w, h, radius) {
  const r = Math.max(0, Math.round(radius));
  if (r === 0) return new Uint8ClampedArray(src);
  const out = new Uint8ClampedArray(w * h * 4);
  boxStream(src, w, h, r, (y, acc, n) => {
    for (let q = 0, o = y * w * 4; q < w * 4; q += 4, o += 4) {
      const a = acc[q + 3];
      if (a > 0) {
        out[o] = acc[q] / a;
        out[o + 1] = acc[q + 1] / a;
        out[o + 2] = acc[q + 2] / a;
      }
      out[o + 3] = a / n;
    }
  });
  return out;
}

/** Below this σ a gaussian is computed exactly; box passes undershoot there. */
const EXACT_SIGMA = 2;

/** Normalised gaussian weights for σ, radius ⌈3σ⌉. */
function gaussKernel(sigma) {
  const R = Math.ceil(sigma * 3);
  const k = new Float64Array(R * 2 + 1);
  let sum = 0;
  for (let i = -R; i <= R; i++) sum += k[i + R] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  return k;
}

/** How far gaussData(σ) reaches: the margin a part needs to blur exactly. */
function gaussReach(sigma) {
  if (!(sigma > 0.05)) return 0;
  if (sigma < EXACT_SIGMA) return Math.ceil(sigma * 3);
  return boxReach(boxRadii(sigma));
}

/**
 * Exact separable gaussian of RGBA bytes, weighted by alpha, streamed with a
 * ring of 2R + 1 horizontally filtered rows. One pass per axis, so reading
 * clamped coordinates is an exact edge extension; without `extend` the
 * outside counts as transparent.
 */
function gaussExact(src, w, h, sigma, extend) {
  const kern = gaussKernel(sigma);
  const R = (kern.length - 1) / 2;
  const ring = R * 2 + 1;
  const rowLen = w * 4;
  const rows = new Float64Array(ring * rowLen);
  const rowOf = new Int32Array(ring).fill(-1);
  const lastX = w - 1;
  const lastY = h - 1;
  const hrow = (k) => {
    const slot = k % ring;
    const base = slot * rowLen;
    if (rowOf[slot] === k) return base;
    rowOf[slot] = k;
    const o = k * rowLen;
    for (let x = 0, q = base; x < w; x++, q += 4) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let j = -R; j <= R; j++) {
        let xx = x + j;
        if (xx < 0 || xx > lastX) {
          if (!extend) continue;
          xx = xx < 0 ? 0 : lastX;
        }
        const i = o + xx * 4;
        const wa = kern[j + R] * src[i + 3];
        sr += src[i] * wa;
        sg += src[i + 1] * wa;
        sb += src[i + 2] * wa;
        sa += wa;
      }
      rows[q] = sr;
      rows[q + 1] = sg;
      rows[q + 2] = sb;
      rows[q + 3] = sa;
    }
    return base;
  };
  const out = new Uint8ClampedArray(w * h * 4);
  const bases = new Int32Array(ring);
  const weights = new Float64Array(ring);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let j = -R; j <= R; j++) {
      let yy = y + j;
      if (yy < 0 || yy > lastY) {
        if (!extend) continue;
        yy = yy < 0 ? 0 : lastY;
      }
      bases[n] = hrow(yy);
      weights[n++] = kern[j + R];
    }
    for (let q = 0, o = y * rowLen; q < rowLen; q += 4, o += 4) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let m = 0; m < n; m++) {
        const p = bases[m] + q;
        const k = weights[m];
        sr += rows[p] * k;
        sg += rows[p + 1] * k;
        sb += rows[p + 2] * k;
        sa += rows[p + 3] * k;
      }
      if (sa > 0) {
        out[o] = sr / sa;
        out[o + 1] = sg / sa;
        out[o + 2] = sb / sa;
      }
      out[o + 3] = sa;
    }
  }
  return out;
}

/**
 * Gaussian blur (σ = `sigma`, the same as CSS `blur(σpx)`) of RGBA bytes,
 * weighted by alpha: exact for small σ, three box passes otherwise. With
 * `extendEdges` the pixels beyond the border repeat the edge; otherwise the
 * outside is transparent.
 */
export function gaussData(src, w, h, sigma, { extendEdges = true } = {}) {
  if (!(sigma > 0.05)) return new Uint8ClampedArray(src);
  if (sigma < EXACT_SIGMA) return gaussExact(src, w, h, sigma, extendEdges);
  const radii = boxRadii(sigma).filter((r) => r >= 1);
  // successive passes need the blurred outside too: work on a padded copy,
  // one channel at a time (alpha first, then colour × alpha)
  const pad = boxReach(radii);
  const pw = w + pad * 2;
  const ph = h + pad * 2;
  const buf = new Float32Array(pw * ph);
  const tmp = new Float32Array(pw * ph);
  const alpha = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h * 4);
  for (const ch of [3, 0, 1, 2]) {
    for (let y = 0; y < ph; y++) {
      let sy = y - pad;
      if (sy < 0 || sy > h - 1) {
        if (!extendEdges) {
          buf.fill(0, y * pw, (y + 1) * pw);
          continue;
        }
        sy = sy < 0 ? 0 : h - 1;
      }
      for (let x = 0, o = y * pw; x < pw; x++, o++) {
        let sx = x - pad;
        if (sx < 0 || sx > w - 1) {
          if (!extendEdges) {
            buf[o] = 0;
            continue;
          }
          sx = sx < 0 ? 0 : w - 1;
        }
        const i = (sy * w + sx) * 4;
        buf[o] = ch === 3 ? src[i + 3] : (src[i + ch] * src[i + 3]) / 255;
      }
    }
    boxBlur1(buf, tmp, pw, ph, radii);
    for (let y = 0; y < h; y++) {
      for (let x = 0, p = (y + pad) * pw + pad, o = y * w * 4; x < w; x++, p++, o += 4) {
        const v = buf[p];
        if (ch === 3) {
          alpha[y * w + x] = v;
          out[o + 3] = v;
        } else {
          const a = alpha[y * w + x];
          if (a > 0) out[o + ch] = (v * 255) / a;
        }
      }
    }
  }
  return out;
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
  releaseCanvas(padded);
  releaseCanvas(blurred);
  return out;
}

/**
 * In-place unsharp mask on a canvas (within `region` when given). The blur is
 * weighted by alpha, so transparent surroundings cause no halo along a
 * cut-out's edge. Streams the blur — no full-size buffers besides the pixels.
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
  const k = amount * 1.4;
  const x0 = r.x - a.x;
  const y0 = r.y - a.y;
  const x1 = x0 + r.w;
  const y1 = y0 + r.h;
  boxStream(d, a.w, a.h, rad, (y, acc) => {
    if (y < y0 || y >= y1) return;
    for (let x = x0, i = (y * a.w + x0) * 4, q = x0 * 4; x < x1; x++, i += 4, q += 4) {
      if (d[i + 3] === 0) continue;
      // the window holds this pixel, so its alpha sum is never zero here
      const s = acc[q + 3];
      d[i] = clamp255(d[i] + (d[i] - acc[q] / s) * k);
      d[i + 1] = clamp255(d[i + 1] + (d[i + 1] - acc[q + 1] / s) * k);
      d[i + 2] = clamp255(d[i + 2] + (d[i + 2] - acc[q + 2] / s) * k);
    }
  });
  ctx.putImageData(img, a.x, a.y, x0, y0, r.w, r.h);
  return canvas;
}

/**
 * Generic 3×3 convolution; alpha is preserved. A neighbour counts by its
 * alpha — the rest of its weight goes to the centre colour — so the barely
 * visible, coarsely stored colours along a soft cut-out's edge add no
 * outline (a fully transparent neighbour counts as the centre, like the
 * canvas edge). Keeps copies of two rows, not of the whole image.
 */
export function convolve(canvas, kernel, { divisor, bias = 0 } = {}) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const div = divisor ?? (kernel.reduce((a, b) => a + b, 0) || 1);
  const rowLen = w * 4;
  // the original rows above and at the one being written; the row below is
  // still untouched in `d`
  let prev = new Uint8ClampedArray(rowLen);
  let cur = new Uint8ClampedArray(rowLen);
  const rows = [null, null, null];
  const offs = [0, 0, 0];

  for (let y = 0; y < h; y++) {
    [prev, cur] = [cur, prev];
    cur.set(d.subarray(y * rowLen, (y + 1) * rowLen));
    rows[0] = y > 0 ? prev : cur;
    rows[1] = cur;
    rows[2] = y < h - 1 ? d : cur;
    offs[2] = y < h - 1 ? (y + 1) * rowLen : 0;
    for (let x = 0, c = 0; x < w; x++, c += 4) {
      if (cur[c + 3] === 0) continue;
      const cr = cur[c];
      const cg = cur[c + 1];
      const cb = cur[c + 2];
      let r = 0;
      let g = 0;
      let b = 0;
      let ki = 0;
      for (let ky = 0; ky < 3; ky++) {
        const row = rows[ky];
        const off = offs[ky];
        for (let kx = -1; kx <= 1; kx++, ki++) {
          const k = kernel[ki];
          if (k === 0) continue;
          const sx = x + kx < 0 ? 0 : x + kx >= w ? w - 1 : x + kx;
          const si = off + sx * 4;
          const a = row[si + 3];
          if (a === 255) {
            r += row[si] * k;
            g += row[si + 1] * k;
            b += row[si + 2] * k;
          } else {
            const f = a / 255;
            r += (cr + (row[si] - cr) * f) * k;
            g += (cg + (row[si + 1] - cg) * f) * k;
            b += (cb + (row[si + 2] - cb) * f) * k;
          }
        }
      }
      const o = y * rowLen + c;
      d[o] = clamp255(r / div + bias);
      d[o + 1] = clamp255(g / div + bias);
      d[o + 2] = clamp255(b / div + bias);
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

/**
 * The pixels of `canvas` blurred by σ, read back as bytes: the canvas goes
 * through blurCanvas (the browser's own blur where there is one) and every
 * temporary canvas is released again.
 */
function blurredPixels(canvas, sigma) {
  const blurred = blurCanvas(canvas, sigma);
  const data = blurred.getContext("2d").getImageData(0, 0, blurred.width, blurred.height).data;
  releaseCanvas(blurred);
  return data;
}

/** A canvas holding `data` (RGBA bytes, w × h); release it after use. */
function canvasOf(data, w, h) {
  const c = makeCanvas(w, h);
  ctx2d(c).putImageData(new ImageData(data, w, h), 0, 0);
  return c;
}

/** Gaussian blur (σ = px) returning a new canvas; edges are extended. */
export function gaussianBlur(canvas, px) {
  return blurCanvas(canvas, px);
}

/**
 * How far blurCanvas(σ) reaches, for running it on part of an image (see
 * effectArea). The browser's blur filter downsamples large radii on a grid of
 * its own, so its result is exact only on the whole image (null); the
 * JavaScript fallback is exact on any part with this much margin.
 */
function blurReach(sigma) {
  if (supportsFilter()) return null;
  return gaussReach(sigma);
}

/** A per-pixel effect: no pixel depends on any other. */
const PER_PIXEL = () => 0;

/** Pixelate's block edge, relative to the (document) image size by default. */
function blockSize(o) {
  const s = o.scale;
  const full = o.block ?? Math.max(2, Math.round(Math.min(o.image.width, o.image.height) / s / 90));
  return Math.max(1, Math.round(scaled(full, s, 2)));
}

/**
 * A spatial size for an effect run at `scale` (thumbnail pixels per document
 * pixel): sizes shrink with the image so a thumbnail looks like the full
 * result, but never below `min`, where the effect would vanish entirely.
 */
const scaled = (size, scale, min) => (scale < 1 ? Math.max(min, size * scale) : size);

const grayOf = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/**
 * `fn(canvas, opts)` returns the processed canvas (it may work in place).
 * `reach(opts)` tells how far a pixel's result depends on its neighbours, so
 * the effect can run on just a selected part (see effectArea); without it, or
 * when it returns null, the effect needs the whole image. `grid(opts)` is the
 * block size such a part must be aligned to.
 */
export const EFFECTS = [
  {
    id: "grayscale",
    name: t("Grayscale"),
    reach: PER_PIXEL,
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = grayOf(d, i);
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "noir",
    name: t("Noir"),
    reach: PER_PIXEL,
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = clamp255((grayOf(d, i) - 128) * 1.55 + 118);
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "sepia",
    name: t("Sepia"),
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
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
    reach: PER_PIXEL,
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = grayOf(d, i) > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "solarize",
    name: t("Solarize"),
    reach: PER_PIXEL,
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
    reach: (o) => blurReach(scaled(o.radius ?? 5, o.scale, 0.5)),
    fn: (c, o) => blurCanvas(c, scaled(o.radius ?? 5, o.scale, 0.5)),
  },
  {
    id: "sharpen",
    name: t("Sharpen"),
    reach: () => 1,
    // a 1 px radius cannot shrink, so a thumbnail gets a gentler amount
    fn: (c, o) => unsharp(c, 0.9 * scaled(1, o.scale, 0.3), 1),
  },
  {
    id: "emboss",
    name: t("Emboss"),
    reach: () => 1,
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
    reach: () => 1,
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
    reach: (o) => blurReach(scaled(6, o.scale, 0.75)),
    fn: (c, o) => {
      // gray, dodged by a blur of its own negative: flat areas go white,
      // edges stay as pencil lines. The blur is alpha-weighted and the
      // dodge works on the pixel's own colour only, so a cut-out's soft
      // edge is not mixed with anything outside it (no grey outline).
      const w = c.width;
      const h = c.height;
      const ctx = c.getContext("2d");
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      const neg = new Uint8ClampedArray(d.length);
      for (let i = 0; i < d.length; i += 4) {
        const v = 255 - clamp255(grayOf(d, i));
        neg[i] = neg[i + 1] = neg[i + 2] = v;
        neg[i + 3] = d[i + 3];
      }
      const inverted = canvasOf(neg, w, h);
      const blur = blurredPixels(inverted, scaled(6, o.scale, 0.75));
      releaseCanvas(inverted);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const g = clamp255(grayOf(d, i));
        // a pixel the blur left without weight dodges with its own negative
        const s = blur[i + 3] > 0 ? blur[i] : 255 - g;
        // color-dodge, as the canvas composite defines it
        const v = g === 0 ? 0 : s >= 255 ? 255 : Math.min(255, (g * 255) / (255 - s));
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
      return c;
    },
  },
  {
    id: "bloom",
    name: t("Bloom"),
    reach: (o) => blurReach(scaled(14, o.scale, 1)),
    fn: (c, o) => {
      // the bright parts, blurred into a glow and screened over the picture
      // at 55 %. The screen works on each pixel's own colour (as if it were
      // opaque) and the alpha is kept, so semi-transparent edges are not
      // darkened by the glow's empty surroundings.
      const w = c.width;
      const h = c.height;
      const ctx = c.getContext("2d");
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      const bright = new Uint8ClampedArray(d.length);
      for (let i = 0; i < d.length; i += 4) {
        if (grayOf(d, i) > 165) {
          bright[i] = d[i];
          bright[i + 1] = d[i + 1];
          bright[i + 2] = d[i + 2];
        }
        bright[i + 3] = d[i + 3];
      }
      const source = canvasOf(bright, w, h);
      const glow = blurredPixels(source, scaled(14, o.scale, 1));
      releaseCanvas(source);
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        const k = (0.55 * glow[i + 3]) / 255 / 255;
        if (k === 0) continue;
        d[i] = clamp255(d[i] + k * glow[i] * (255 - d[i]));
        d[i + 1] = clamp255(d[i + 1] + k * glow[i + 1] * (255 - d[i + 1]));
        d[i + 2] = clamp255(d[i + 2] + k * glow[i + 2] * (255 - d[i + 2]));
      }
      ctx.putImageData(img, 0, 0);
      return c;
    },
  },
  {
    id: "pixelate",
    name: t("Pixelate"),
    // every block is the average of its own pixels, on a grid that starts at
    // the image origin — so a part aligned to the grid pixelates exactly
    reach: PER_PIXEL,
    grid: blockSize,
    fn: (c, o) => {
      const size = blockSize(o);
      const w = c.width;
      const h = c.height;
      const ctx = c.getContext("2d");
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let by = 0; by < h; by += size) {
        const y1 = Math.min(h, by + size);
        for (let bx = 0; bx < w; bx += size) {
          const x1 = Math.min(w, bx + size);
          // colours weighted by alpha, so transparent pixels add no darkness
          let a = 0;
          let r = 0;
          let g = 0;
          let b = 0;
          for (let y = by; y < y1; y++) {
            for (let i = (y * w + bx) * 4, e = (y * w + x1) * 4; i < e; i += 4) {
              const k = d[i + 3];
              a += k;
              r += d[i] * k;
              g += d[i + 1] * k;
              b += d[i + 2] * k;
            }
          }
          const A = a / ((x1 - bx) * (y1 - by));
          const R = a ? r / a : 0;
          const G = a ? g / a : 0;
          const B = a ? b / a : 0;
          for (let y = by; y < y1; y++) {
            for (let i = (y * w + bx) * 4, e = (y * w + x1) * 4; i < e; i += 4) {
              d[i] = R;
              d[i + 1] = G;
              d[i + 2] = B;
              d[i + 3] = A;
            }
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      return c;
    },
  },
  {
    id: "vignette",
    name: t("Vignette"),
    fn: (c) => {
      const w = c.width;
      const h = c.height;
      const ctx = c.getContext("2d");
      ctx.save();
      // an ellipse following the frame: the gradient is laid out in a space
      // where the image spans −1…1 on both axes (a square stays a circle)
      ctx.setTransform(w / 2, 0, 0, h / 2, w / 2, h / 2);
      const g = ctx.createRadialGradient(0, 0, 0.64, 0, 0, Math.SQRT2);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, "rgba(0,0,0,0.72)");
      // source-atop darkens the pixels without touching their alpha
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = g;
      ctx.fillRect(-1, -1, 2, 2);
      ctx.restore();
      return c;
    },
  },
];

/**
 * Apply an effect by id. Always returns a canvas (may be the input one).
 * `opts` carries the colours (`primary`, `secondary`), effect parameters
 * (`radius`, `block`) and `scale` — image pixels per document pixel (0 < scale
 * ≤ 1, default 1) — so a thumbnail renders spatial effects at its own size.
 * When `canvas` is only a part of the image (see effectArea), `image` gives
 * the whole image's { width, height }.
 */
export function applyEffect(id, canvas, opts = {}) {
  const effect = EFFECTS.find((e) => e.id === id);
  if (!effect) return canvas;
  return effect.fn(canvas, effectOptions(opts, canvas.width, canvas.height)) || canvas;
}

function effectOptions(opts, width, height) {
  const s = Number(opts.scale);
  const scale = s > 0 && s < 1 ? s : 1;
  return { ...opts, scale, image: opts.image || { width, height } };
}

/**
 * The part of a w × h image an effect has to process for its result to be
 * exact inside `rect`: `rect` grown by how far the effect looks at
 * neighbours, and out to its block grid. Null when that is the whole image,
 * or when the effect depends on all of it (its size, as the vignette does).
 * Run the effect on that part with `image: { width: w, height: h }`.
 */
export function effectArea(id, rect, w, h, opts = {}) {
  const effect = EFFECTS.find((e) => e.id === id);
  const r = clipRect(rect, w, h);
  if (!effect?.reach || !r) return null;
  const o = effectOptions(opts, w, h);
  const m = effect.reach(o);
  if (m == null) return null;
  const g = effect.grid ? effect.grid(o) : 1;
  const x0 = Math.max(0, Math.floor((r.x - m) / g) * g);
  const y0 = Math.max(0, Math.floor((r.y - m) / g) * g);
  const x1 = Math.min(w, Math.ceil((r.x + r.w + m) / g) * g);
  const y1 = Math.min(h, Math.ceil((r.y + r.h + m) / g) * g);
  if (x0 === 0 && y0 === 0 && x1 === w && y1 === h) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
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
 * Tangents of the curve through sorted points: Fritsch–Carlson, so the curve
 * never overshoots between points — or the tangents the points carry (`m`)
 * when every one of them does (see curveAddPoint).
 */
function curveTangents(pts) {
  const n = pts.length;
  if (pts.every((p) => Number.isFinite(p.m))) return pts.map((p) => p.m);
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    slope[i] = (pts[i + 1].y - pts[i].y) / Math.max(1e-6, pts[i + 1].x - pts[i].x);
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
  return m;
}

/** Value (and slope) at `x` of the cubic segment from point `p` to `q`. */
function hermite(p, q, mp, mq, x) {
  const h = Math.max(1e-6, q.x - p.x);
  const t = (x - p.x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    y: (2 * t3 - 3 * t2 + 1) * p.y + (t3 - 2 * t2 + t) * h * mp + (-2 * t3 + 3 * t2) * q.y + (t3 - t2) * h * mq,
    slope:
      ((6 * t2 - 6 * t) * p.y + (3 * t2 - 4 * t + 1) * h * mp + (-6 * t2 + 6 * t) * q.y + (3 * t2 - 2 * t) * h * mq) /
      h,
  };
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
  const m = curveTangents(pts);
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
    lut[x] = hermite(pts[seg], pts[seg + 1], m[seg], m[seg + 1], x).y;
  }
  return lut;
}

/**
 * `points` plus a point at input level `x` lying on their curve. Between the
 * end points the new point takes the curve's exact height and every point
 * keeps the tangent it had (`m`), so adding a point leaves the curve exactly
 * as it was; moving any point should drop the tangents again (they are only
 * kept while nothing moves). Returns { points, point }.
 */
export function curveAddPoint(points, x) {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const n = pts.length;
  if (n < 2 || !(x > pts[0].x && x < pts[n - 1].x)) {
    // beyond an end point the curve is flat and cannot stay so: re-shape
    const point = { x, y: curveLUT(pts)[Math.max(0, Math.min(255, Math.round(x)))] };
    const out = pts.map((q) => ({ x: q.x, y: q.y }));
    return { points: [...out, point].sort((a, b) => a.x - b.x), point };
  }
  const m = curveTangents(pts);
  let seg = 0;
  while (seg < n - 2 && x > pts[seg + 1].x) seg++;
  const at = hermite(pts[seg], pts[seg + 1], m[seg], m[seg + 1], x);
  const point = { x, y: Math.max(0, Math.min(255, at.y)), m: at.slope };
  const out = pts.map((p, i) => ({ x: p.x, y: p.y, m: m[i] }));
  out.splice(seg + 1, 0, point);
  return { points: out, point };
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
