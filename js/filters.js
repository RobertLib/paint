/* ==========================================================================
   Photo adjustments and creative filters.

   Adjustments run as one ordered pipeline over an ImageData so sliders stay
   interactive; effects are one-shot canvas transforms. Everything operates on
   premultiplied-free RGBA and preserves the alpha channel, so filters are safe
   on transparent layers.
   ========================================================================== */

import { clamp255, hsvToRgb, parseColor, rgbToHsv } from "./color.js";
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

const supportsFilter = (() => {
  const c = makeCanvas(1, 1).getContext("2d");
  return typeof c.filter === "string";
})();

/**
 * Apply the adjustment pipeline to a canvas, returning a new canvas.
 * Pass `region` to limit the pixel pass to the selection bounds.
 */
export function applyAdjustments(src, values, region = null) {
  const out = makeCanvas(src.width, src.height);
  const ctx = ctx2d(out);

  const soft = values.softness || 0;
  if (soft > 0 && supportsFilter) {
    ctx.filter = `blur(${(soft / 100) * 8}px)`;
  }
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";

  const clarity = values.clarity || 0;
  if (clarity > 0) unsharp(out, clarity / 100, 1.4);

  const r = region || { x: 0, y: 0, w: out.width, h: out.height };
  if (r.w < 1 || r.h < 1) return out;

  const img = ctx.getImageData(r.x, r.y, r.w, r.h);
  pixelPass(img, values, out.width, out.height, r);
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
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 0) continue;

      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      if (expMul !== 1) {
        r *= expMul;
        g *= expMul;
        b *= expMul;
      }
      if (brightAdd !== 0) {
        r += brightAdd;
        g += brightAdd;
        b += brightAdd;
      }
      if (cMul !== 1) {
        r = (r - 128) * cMul + 128;
        g = (g - 128) * cMul + 128;
        b = (b - 128) * cMul + 128;
      }
      if (doGamma) {
        r = 255 * Math.pow(Math.max(r, 0) / 255, gammaExp);
        g = 255 * Math.pow(Math.max(g, 0) / 255, gammaExp);
        b = 255 * Math.pow(Math.max(b, 0) / 255, gammaExp);
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

      if (sat !== 1 || doVib || doHue) {
        if (doHue) {
          const hsv = rgbToHsv({ r: clamp255(r), g: clamp255(g), b: clamp255(b) });
          const c2 = hsvToRgb(hsv.h + hueShift, hsv.s, hsv.v);
          r = c2.r;
          g = c2.g;
          b = c2.b;
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
        const dy = region.y + y - cy;
        const dist = Math.hypot(dx, dy) / maxDist;
        const f = 1 - vig * Math.pow(Math.max(0, dist - 0.28) / 0.72, 1.7);
        r *= f;
        g *= f;
        b *= f;
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
 * Box blur with a sliding window — cost is independent of the radius, so the
 * same code serves a 1px soften and a 120px privacy blur.
 */
export function boxBlurData(src, w, h, radius) {
  const r = Math.max(0, Math.round(radius));
  const out = new Uint8ClampedArray(src.length);
  if (r === 0) {
    out.set(src);
    return out;
  }
  const tmp = new Float32Array(src.length);
  const span = r * 2 + 1;
  // horizontal: src -> tmp
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let ch = 0; ch < 4; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const x = Math.min(w - 1, Math.max(0, k));
        acc += src[(row + x) * 4 + ch];
      }
      for (let x = 0; x < w; x++) {
        tmp[(row + x) * 4 + ch] = acc / span;
        const add = Math.min(w - 1, x + r + 1);
        const sub = Math.max(0, x - r);
        acc += src[(row + add) * 4 + ch] - src[(row + sub) * 4 + ch];
      }
    }
  }
  // vertical: tmp -> out
  for (let x = 0; x < w; x++) {
    for (let ch = 0; ch < 4; ch++) {
      let acc = 0;
      for (let k = -r; k <= r; k++) {
        const y = Math.min(h - 1, Math.max(0, k));
        acc += tmp[(y * w + x) * 4 + ch];
      }
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + ch] = acc / span;
        const add = Math.min(h - 1, y + r + 1);
        const sub = Math.max(0, y - r);
        acc += tmp[(add * w + x) * 4 + ch] - tmp[(sub * w + x) * 4 + ch];
      }
    }
  }
  return out;
}

/** Three box passes approximate a gaussian closely enough for any use here. */
export function gaussData(src, w, h, sigma) {
  if (sigma <= 0.3) return new Uint8ClampedArray(src);
  const r = Math.max(1, Math.round(sigma * 0.94));
  return boxBlurData(boxBlurData(boxBlurData(src, w, h, r), w, h, r), w, h, r);
}

/** In-place unsharp mask on a canvas. */
export function unsharp(canvas, amount, radius = 1.2) {
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const blurred = boxBlurData(
    img.data,
    canvas.width,
    canvas.height,
    Math.max(1, Math.round(radius))
  );
  const d = img.data;
  const k = amount * 1.4;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp255(d[i] + (d[i] - blurred[i]) * k);
    d[i + 1] = clamp255(d[i + 1] + (d[i + 1] - blurred[i + 1]) * k);
    d[i + 2] = clamp255(d[i + 2] + (d[i + 2] - blurred[i + 2]) * k);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Generic 3×3 convolution; alpha is preserved. */
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
          const si = (sy * w + sx) * 4;
          r += src[si] * k;
          g += src[si + 1] * k;
          b += src[si + 2] * k;
        }
      }
      const i = (y * w + x) * 4;
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

export function gaussianBlur(canvas, px) {
  if (supportsFilter) {
    const out = makeCanvas(canvas.width, canvas.height);
    const ctx = ctx2d(out);
    ctx.filter = `blur(${px}px)`;
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = "none";
    return out;
  }
  const ctx = canvas.getContext("2d");
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  img.data.set(gaussData(img.data, canvas.width, canvas.height, px / 2));
  ctx.putImageData(img, 0, 0);
  return canvas;
}

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
  { id: "blur", name: t("Soft blur"), fn: (c, o) => gaussianBlur(c, o.radius ?? 5) },
  { id: "sharpen", name: t("Sharpen"), fn: (c) => unsharp(c, 0.9, 1) },
  {
    id: "emboss",
    name: t("Emboss"),
    fn: (c) => convolve(c, [-2, -1, 0, -1, 1, 1, 0, 1, 2], { divisor: 1, bias: 0 }),
  },
  {
    id: "edges",
    name: t("Edge detect"),
    fn: (c) => {
      const out = convolve(c, [0, -1, 0, -1, 4, -1, 0, -1, 0], { divisor: 1 });
      return eachPixel(out, (d, i) => {
        const g = clamp255(grayOf(d, i) * 2.2);
        d[i] = d[i + 1] = d[i + 2] = g;
      });
    },
  },
  {
    id: "sketch",
    name: t("Pencil sketch"),
    fn: (c) => {
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
      const blurred = gaussianBlur(inverted, 6);
      const out = makeCanvas(c.width, c.height);
      const oc = ctx2d(out);
      oc.drawImage(base, 0, 0);
      oc.globalCompositeOperation = "color-dodge";
      oc.drawImage(blurred, 0, 0);
      oc.globalCompositeOperation = "source-over";
      // keep the original alpha shape
      oc.globalCompositeOperation = "destination-in";
      oc.drawImage(c, 0, 0);
      return out;
    },
  },
  {
    id: "bloom",
    name: t("Bloom"),
    fn: (c) => {
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
      const glow = gaussianBlur(bright, 14);
      const out = makeCanvas(c.width, c.height);
      const oc = ctx2d(out);
      oc.drawImage(c, 0, 0);
      oc.globalAlpha = 0.55;
      oc.globalCompositeOperation = "screen";
      oc.drawImage(glow, 0, 0);
      oc.globalAlpha = 1;
      oc.globalCompositeOperation = "destination-in";
      oc.drawImage(c, 0, 0);
      return out;
    },
  },
  {
    id: "pixelate",
    name: t("Pixelate"),
    fn: (c, o) => {
      const size = o.block ?? Math.max(2, Math.round(Math.min(c.width, c.height) / 90));
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
      oc.fillStyle = g;
      oc.fillRect(0, 0, c.width, c.height);
      oc.globalCompositeOperation = "destination-in";
      oc.drawImage(c, 0, 0);
      return out;
    },
  },
];

/** Apply an effect by id. Always returns a canvas (may be the input one). */
export function applyEffect(id, canvas, ctxColors = {}) {
  const effect = EFFECTS.find((e) => e.id === id);
  if (!effect) return canvas;
  return effect.fn(canvas, ctxColors) || canvas;
}

/* ---------------------------- levels & curves ---------------------------- */

/** Per-channel histograms of the visible pixels inside `region`. */
export function histogram(canvas, region = null) {
  const r = region || { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const out = {
    rgb: new Uint32Array(256),
    r: new Uint32Array(256),
    g: new Uint32Array(256),
    b: new Uint32Array(256),
  };
  if (r.w < 1 || r.h < 1) return out;
  const { data } = canvas.getContext("2d").getImageData(r.x, r.y, r.w, r.h);
  // large images: sample a grid — the shape of the histogram is what matters
  const step = Math.max(1, Math.floor(Math.sqrt((r.w * r.h) / 1_500_000))) * 4;
  for (let i = 0; i < data.length; i += step) {
    if (data[i + 3] < 8) continue;
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
