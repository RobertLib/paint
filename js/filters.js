/* ==========================================================================
   Photo adjustments and creative filters.

   Adjustments run as one ordered pipeline over an ImageData so sliders stay
   interactive; effects are one-shot canvas transforms. Everything operates on
   premultiplied-free RGBA and preserves the alpha channel, so filters are safe
   on transparent layers.
   ========================================================================== */

import { clamp255, hsvToRgb, parseColor, rgbToHsv } from "./color.js";
import { ctx2d, makeCanvas } from "./doc.js";

/* ------------------------------ adjustments ------------------------------ */

export const ADJUST_GROUPS = [
  {
    group: "Light",
    items: [
      { id: "exposure", label: "Exposure", min: -100, max: 100 },
      { id: "brightness", label: "Brightness", min: -100, max: 100 },
      { id: "contrast", label: "Contrast", min: -100, max: 100 },
      { id: "highlights", label: "Highlights", min: -100, max: 100 },
      { id: "shadows", label: "Shadows", min: -100, max: 100 },
      { id: "gamma", label: "Gamma", min: -100, max: 100 },
    ],
  },
  {
    group: "Color",
    items: [
      { id: "saturation", label: "Saturation", min: -100, max: 100 },
      { id: "vibrance", label: "Vibrance", min: -100, max: 100 },
      { id: "temperature", label: "Temperature", min: -100, max: 100 },
      { id: "tint", label: "Tint", min: -100, max: 100 },
      { id: "hue", label: "Hue shift", min: -180, max: 180, unit: "°" },
    ],
  },
  {
    group: "Detail",
    items: [
      { id: "clarity", label: "Clarity", min: 0, max: 100 },
      { id: "softness", label: "Softness", min: 0, max: 100 },
      { id: "grain", label: "Grain", min: 0, max: 100 },
      { id: "vignette", label: "Vignette", min: -100, max: 100 },
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

function boxBlurData(src, w, h, radius) {
  const out = new Uint8ClampedArray(src.length);
  const tmp = new Uint8ClampedArray(src.length);
  const pass = (from, to, horizontal) => {
    const outer = horizontal ? h : w;
    const inner = horizontal ? w : h;
    for (let o = 0; o < outer; o++) {
      for (let n = 0; n < inner; n++) {
        let r = 0,
          g = 0,
          b = 0,
          a = 0,
          count = 0;
        for (let k = -radius; k <= radius; k++) {
          const p = n + k;
          if (p < 0 || p >= inner) continue;
          const idx = horizontal ? (o * w + p) * 4 : (p * w + o) * 4;
          r += from[idx];
          g += from[idx + 1];
          b += from[idx + 2];
          a += from[idx + 3];
          count++;
        }
        const t = horizontal ? (o * w + n) * 4 : (n * w + o) * 4;
        to[t] = r / count;
        to[t + 1] = g / count;
        to[t + 2] = b / count;
        to[t + 3] = a / count;
      }
    }
  };
  pass(src, tmp, true);
  pass(tmp, out, false);
  return out;
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

function gaussianBlur(canvas, px) {
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
  const blurred = boxBlurData(img.data, canvas.width, canvas.height, Math.max(1, px | 0));
  img.data.set(blurred);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const grayOf = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export const EFFECTS = [
  {
    id: "grayscale",
    name: "Grayscale",
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = grayOf(d, i);
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "noir",
    name: "Noir",
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = clamp255((grayOf(d, i) - 128) * 1.55 + 118);
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "sepia",
    name: "Sepia",
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
    name: "Invert",
    fn: (c) =>
      eachPixel(c, (d, i) => {
        d[i] = 255 - d[i];
        d[i + 1] = 255 - d[i + 1];
        d[i + 2] = 255 - d[i + 2];
      }),
  },
  {
    id: "vivid",
    name: "Vivid",
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
    name: "Fade",
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
    name: "Warm",
    fn: (c) =>
      eachPixel(c, (d, i) => {
        d[i] = clamp255(d[i] * 1.11 + 8);
        d[i + 1] = clamp255(d[i + 1] * 1.02);
        d[i + 2] = clamp255(d[i + 2] * 0.9);
      }),
  },
  {
    id: "cool",
    name: "Cool",
    fn: (c) =>
      eachPixel(c, (d, i) => {
        d[i] = clamp255(d[i] * 0.92);
        d[i + 1] = clamp255(d[i + 1] * 1.01);
        d[i + 2] = clamp255(d[i + 2] * 1.13 + 6);
      }),
  },
  {
    id: "vintage",
    name: "Vintage",
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
    name: "Duotone",
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
    name: "Posterize",
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
    name: "Threshold",
    fn: (c) =>
      eachPixel(c, (d, i) => {
        const g = grayOf(d, i) > 128 ? 255 : 0;
        d[i] = d[i + 1] = d[i + 2] = g;
      }),
  },
  {
    id: "solarize",
    name: "Solarize",
    fn: (c) =>
      eachPixel(c, (d, i) => {
        for (let k = 0; k < 3; k++) {
          d[i + k] = d[i + k] < 128 ? d[i + k] : 255 - d[i + k];
        }
      }),
  },
  { id: "blur", name: "Soft blur", fn: (c) => gaussianBlur(c, 5) },
  { id: "sharpen", name: "Sharpen", fn: (c) => unsharp(c, 0.9, 1) },
  {
    id: "emboss",
    name: "Emboss",
    fn: (c) => convolve(c, [-2, -1, 0, -1, 1, 1, 0, 1, 2], { divisor: 1, bias: 0 }),
  },
  {
    id: "edges",
    name: "Edge detect",
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
    name: "Pencil sketch",
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
    name: "Bloom",
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
    name: "Pixelate",
    fn: (c) => {
      const size = Math.max(2, Math.round(Math.min(c.width, c.height) / 90));
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
    name: "Vignette",
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
