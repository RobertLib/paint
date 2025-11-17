/* ==========================================================================
   Color helpers — RGB / HSV conversion, parsing and formatting.
   Colors are plain objects: { r, g, b, a } with r,g,b in 0..255 and a in 0..1
   ========================================================================== */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export function rgb(r, g, b, a = 1) {
  return { r, g, b, a };
}

export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, "");
  if (h.length === 3 || h.length === 4) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6 && h.length !== 8) return null;
  const n = Number.parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  if (h.length === 6) {
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  return {
    r: (n >>> 24) & 255,
    g: (n >>> 16) & 255,
    b: (n >>> 8) & 255,
    a: (n & 255) / 255,
  };
}

const hex2 = (v) => clamp255(Math.round(v)).toString(16).padStart(2, "0");

export function rgbToHex(c, withAlpha = false) {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  if (withAlpha && c.a < 1) return base + hex2((c.a ?? 1) * 255);
  return base;
}

export function cssColor(c) {
  const a = c.a ?? 1;
  if (a >= 1) return rgbToHex(c);
  return `rgba(${c.r | 0}, ${c.g | 0}, ${c.b | 0}, ${Number(a.toFixed(3))})`;
}

/** Parse hex / rgb() / rgba() / a few keywords. Returns null when unparseable. */
export function parseColor(input) {
  if (!input) return null;
  if (typeof input === "object") return { a: 1, ...input };
  const s = String(input).trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (s === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (s === "black") return { r: 0, g: 0, b: 0, a: 1 };
  if (s.startsWith("#")) return hexToRgb(s);
  const m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const p = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.every((v) => !Number.isNaN(v))) {
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    }
  }
  return hexToRgb(s);
}

/** r,g,b 0..255 → h 0..360, s 0..1, v 0..1 */
export function rgbToHsv({ r, g, b }) {
  const rr = r / 255,
    gg = g / 255,
    bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb(h, s, v) {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * Squared RGBA distance used by fill / magic wand, normalized so that
 * tolerance 0..100 maps onto 0..1.
 */
export function colorDelta(r1, g1, b1, a1, r2, g2, b2, a2) {
  const dr = (r1 - r2) / 255;
  const dg = (g1 - g2) / 255;
  const db = (b1 - b2) / 255;
  const da = (a1 - a2) / 255;
  return Math.sqrt((dr * dr + dg * dg + db * db + da * da) / 4);
}

/** Default palette — 10 columns of tuned hues plus a neutral ramp. */
export const PALETTE = [
  "#000000", "#3f3f46", "#71717a", "#a1a1aa", "#d4d4d8",
  "#ffffff", "#fecaca", "#fed7aa", "#fef08a", "#bbf7d0",
  "#e11d48", "#f43f5e", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899", "#78350f", "#a16207", "#166534",
  "#0c4a6e", "#1e1b4b", "#4c1d95", "#701a75", "#881337",
  "#fda4af", "#c4b5fd", "#a5b4fc", "#93c5fd", "#67e8f9",
];
