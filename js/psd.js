/* ==========================================================================
   Photoshop documents — read and write .psd without any library.

   Reading covers what a pixel editor can honour: 8-, 16- and 32-bit RGB or
   grayscale; raw, RLE (PackBits) and ZIP channels (with or without
   prediction); pixel layers with names (including Unicode), opacity and fill
   opacity, visibility, blend modes, user masks (including "hide all" masks,
   density and feather) and clipping masks, which are baked into the clipped
   layers' pixels. Groups are flattened into a plain stack (a hidden group
   hides its children; a group's opacity and mask carry over to them). Text,
   shape and smart-object layers arrive as the pixels Photoshop stored for
   them; adjustment layers have no pixels and are left out (`doc.psdSkipped`
   counts them). 32-bit documents (linear light) are converted to 8-bit
   sRGB. A document larger than `maxDim` is scaled down while it is decoded,
   a band of rows at a time, so the full-size image is never held in memory.
   When the layer data cannot be used (damaged, or more canvases than the
   browser grants), the flattened composite is used instead
   (`doc.psdFlattened`).

   Writing produces an 8-bit RGB PSD with one RLE-compressed layer per layer,
   masks included, plus a flattened composite for apps that only read that.
   ========================================================================== */

import {
  CanvasTooLargeError,
  Doc,
  Layer,
  alphaBounds,
  blurAlpha,
  ctx2d,
  makeCanvas,
  releaseCanvas,
} from "./doc.js";
import { t } from "./i18n.js";

const BLEND_FROM_PSD = {
  norm: "source-over",
  diss: "source-over", // dissolve
  pass: "source-over", // pass through (groups)
  mul: "multiply",
  scrn: "screen",
  over: "overlay",
  dark: "darken",
  lite: "lighten",
  div: "color-dodge",
  idiv: "color-burn",
  hLit: "hard-light",
  sLit: "soft-light",
  diff: "difference",
  smud: "exclusion",
  hue: "hue",
  sat: "saturation",
  colr: "color",
  lum: "luminosity",
  lddg: "lighter", // linear dodge (add): exact for opaque layers
  // no canvas equivalent — the mode with the smallest mean error instead
  lbrn: "multiply", // linear burn
  dkCl: "darken", // darker color
  lgCl: "lighten", // lighter color
  lLit: "hard-light", // linear light
  vLit: "hard-light", // vivid light
  pLit: "hard-light", // pin light
  hMix: "hard-light", // hard mix
  fsub: "difference", // subtract
  fdiv: "color-dodge", // divide
};
const BLEND_TO_PSD = {
  "source-over": "norm",
  multiply: "mul ",
  screen: "scrn",
  overlay: "over",
  darken: "dark",
  lighten: "lite",
  "color-dodge": "div ",
  "color-burn": "idiv",
  "hard-light": "hLit",
  "soft-light": "sLit",
  difference: "diff",
  exclusion: "smud",
  hue: "hue ",
  saturation: "sat ",
  color: "colr",
  luminosity: "lum ",
  lighter: "lddg",
};

/** Layers that only hold settings (adjustments), never pixels. */
const ADJUSTMENT_KEYS = new Set([
  "brit", "levl", "curv", "expA", "vibA", "hue ", "hue2", "blnc", "blwh",
  "phfl", "mixr", "clrL", "nvrt", "post", "thrs", "grdm", "selc", "CgEd",
]);
/** Fill layers: Photoshop usually stores their pixels, but not always. */
const FILL_KEYS = new Set(["SoCo", "GdFl", "PtFl"]);

/** Rows decoded and handed to the canvas at a time (bounds memory use). */
const BAND_PIXELS = 1 << 22;
/** Largest layer edge accepted (layers may extend beyond the canvas). */
const MAX_LAYER_EDGE = 1 << 18;

/* ================================= reading ================================ */

/** Damaged or unreadable data. Inside the layer section it means "use the composite". */
class PsdError extends Error {}
const damaged = () => new PsdError("This PSD file is damaged");

class Reader {
  constructor(buffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
    this.pos = 0;
  }
  need(n) {
    if (!(n >= 0) || this.pos + n > this.bytes.length) throw damaged();
  }
  u8() {
    this.need(1);
    return this.bytes[this.pos++];
  }
  i16() {
    this.need(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }
  u16() {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  i32() {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  u32() {
    this.need(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  f64() {
    this.need(8);
    const v = this.view.getFloat64(this.pos);
    this.pos += 8;
    return v;
  }
  str(n) {
    this.need(n);
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.bytes[this.pos + i]);
    this.pos += n;
    return s;
  }
  skip(n) {
    this.need(n);
    this.pos += n;
  }
  /** Read a u32 length; return where that block ends (it must fit in `limit`). */
  block(limit = this.bytes.length) {
    const len = this.u32();
    const end = this.pos + len;
    if (end > limit) throw damaged();
    return end;
  }
  isSig(p) {
    const b = this.bytes;
    return p + 4 <= b.length && b[p] === 0x38 && b[p + 1] === 0x42 && // "8B"
      ((b[p + 2] === 0x49 && b[p + 3] === 0x4d) || (b[p + 2] === 0x36 && b[p + 3] === 0x34)); // "IM" | "64"
  }
}

/** PackBits: n ≥ 0 copies n+1 literal bytes, n < 0 repeats the next byte 1−n times. */
function unpackBits(src, start, length, out, outStart, outLength) {
  let i = start;
  const end = start + length;
  let o = outStart;
  const oEnd = outStart + outLength;
  while (i < end && o < oEnd) {
    let n = src[i++];
    if (n > 127) n -= 256;
    if (n >= 0) {
      const count = Math.min(n + 1, oEnd - o, end - i);
      out.set(src.subarray(i, i + count), o);
      i += n + 1;
      o += count;
    } else if (n !== -128) {
      if (i >= end) break; // the run's byte is missing: never read the next row's data
      const count = Math.min(1 - n, oEnd - o);
      out.fill(src[i++], o, o + count);
      o += count;
    }
  }
}

/** Upper half of Mac OS Roman — legacy layer names are stored in it. */
const MAC_ROMAN =
  "\u00c4\u00c5\u00c7\u00c9\u00d1\u00d6\u00dc\u00e1\u00e0\u00e2\u00e4\u00e3\u00e5\u00e7\u00e9\u00e8\u00ea\u00eb\u00ed\u00ec\u00ee\u00ef\u00f1\u00f3\u00f2\u00f4\u00f6\u00f5\u00fa\u00f9\u00fb\u00fc\u2020\u00b0\u00a2\u00a3\u00a7\u2022\u00b6\u00df\u00ae\u00a9\u2122\u00b4\u00a8\u2260\u00c6\u00d8\u221e\u00b1\u2264\u2265\u00a5\u00b5\u2202\u2211\u220f\u03c0\u222b\u00aa\u00ba\u03a9\u00e6\u00f8\u00bf\u00a1\u00ac\u221a\u0192\u2248\u2206\u00ab\u00bb\u2026\u00a0\u00c0\u00c3\u00d5\u0152\u0153\u2013\u2014\u201c\u201d\u2018\u2019\u00f7\u25ca\u00ff\u0178\u2044\u20ac\u2039\u203a\ufb01\ufb02\u2021\u00b7\u201a\u201e\u2030\u00c2\u00ca\u00c1\u00cb\u00c8\u00cd\u00ce\u00cf\u00cc\u00d3\u00d4\uf8ff\u00d2\u00da\u00db\u00d9\u0131\u02c6\u02dc\u00af\u02d8\u02d9\u02da\u00b8\u02dd\u02db\u02c7";

/**
 * Legacy (Pascal) layer names: valid UTF-8 from some tools, Mac OS Roman from
 * the rest. Photoshop itself also writes a Unicode copy, which wins anyway.
 */
function decodeLatin(s) {
  if (!/[\x80-\xff]/.test(s)) return s;
  const bytes = Uint8Array.from(s, (ch) => ch.charCodeAt(0));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return String.fromCharCode(...bytes).replace(/[\x80-\xff]/g, (ch) => MAC_ROMAN[ch.charCodeAt(0) - 128]);
  }
}

/* ------------------------------ structure ------------------------------ */

function readLayerRecord(r, end) {
  const top = r.i32();
  const left = r.i32();
  const bottom = r.i32();
  const right = r.i32();
  const count = r.u16();
  if (count > 56) throw damaged();
  const channels = [];
  for (let i = 0; i < count; i++) channels.push({ id: r.i16(), length: r.u32() });
  if (r.str(4) !== "8BIM") throw damaged();
  const blendKey = r.str(4).trim();
  const opacity = r.u8() / 255;
  const clipping = r.u8() === 1;
  const flags = r.u8();
  r.u8(); // filler
  const extraEnd = r.block(end);

  // Layer mask data. With both a user mask and a vector mask, the first
  // rectangle describes the combined (rendered) mask in channel −2 and the
  // "real" fields the user's own pixel mask in channel −3.
  let mask = null;
  const maskEnd = r.block(extraEnd);
  const maskStart = r.pos;
  if (maskEnd - maskStart >= 18) {
    mask = {
      top: r.i32(),
      left: r.i32(),
      bottom: r.i32(),
      right: r.i32(),
      defaultColor: r.u8(),
      flags: r.u8(),
      real: null,
    };
    if (maskEnd - maskStart >= 36) {
      mask.real = {
        flags: r.u8(),
        defaultColor: r.u8(),
        top: r.i32(),
        left: r.i32(),
        bottom: r.i32(),
        right: r.i32(),
      };
    }
    // the user mask's density and feather, which Photoshop applies when it
    // renders the mask (stored after the real mask, whatever the spec says)
    mask.density = 1;
    mask.feather = 0;
    if (mask.flags & 16 && r.pos < maskEnd) {
      const params = r.u8();
      const size = (params & 1) + (params & 2 ? 8 : 0) + (params & 4 ? 1 : 0) + (params & 8 ? 8 : 0);
      if (r.pos + size <= maskEnd) {
        if (params & 1) mask.density = r.u8() / 255;
        if (params & 2) {
          const feather = r.f64();
          mask.feather = feather > 0 ? Math.min(feather, 1000) : 0; // NaN → 0
        }
      }
    }
  }
  r.pos = maskEnd;
  r.pos = r.block(extraEnd); // blending ranges

  const nameLength = r.u8();
  let name = decodeLatin(r.str(Math.min(nameLength, extraEnd - r.pos)));
  r.pos = Math.min(extraEnd, r.pos + ((4 - ((nameLength + 1) % 4)) % 4));

  let section = 0;
  let fill = 1;
  let adjustment = false;
  let fillLayer = false;
  while (r.pos + 12 <= extraEnd) {
    if (!r.isSig(r.pos)) break;
    r.pos += 4;
    const key = r.str(4);
    const blockEnd = r.pos + 4 + r.view.getUint32(r.pos);
    r.pos += 4;
    if (blockEnd > extraEnd) break;
    if (key === "luni" && blockEnd - r.pos >= 4) {
      const chars = Math.min(r.u32(), (blockEnd - r.pos) >> 1);
      let s = "";
      for (let i = 0; i < chars; i++) s += String.fromCharCode(r.u16());
      name = s.replace(/\0+$/, "") || name;
    } else if ((key === "lsct" || key === "lsdk") && blockEnd - r.pos >= 4) {
      const type = r.u32();
      section = type <= 3 ? type : 0;
    } else if (key === "iOpa" && blockEnd > r.pos) {
      fill = r.u8() / 255;
    } else if (ADJUSTMENT_KEYS.has(key)) {
      adjustment = true;
    } else if (FILL_KEYS.has(key)) {
      fillLayer = true;
    }
    r.pos = blockEnd;
  }
  r.pos = extraEnd;

  return {
    top,
    left,
    bottom,
    right,
    channels,
    blend: BLEND_FROM_PSD[blendKey] || "source-over",
    opacity,
    fill,
    clipping,
    hidden: !!(flags & 2),
    mask,
    name,
    section,
    adjustment,
    fillLayer,
  };
}

/** Layer records plus where each channel's data lies (nothing is decoded yet). */
function readLayerInfo(r, end) {
  let count = r.i16();
  const mergedAlpha = count < 0;
  count = Math.abs(count);
  if (count * 34 > end - r.pos) throw damaged();
  const records = [];
  for (let i = 0; i < count; i++) records.push(readLayerRecord(r, end));
  for (const rec of records) {
    for (const ch of rec.channels) {
      ch.start = r.pos;
      ch.end = r.pos + ch.length;
      if (ch.end > end) throw damaged();
      r.pos = ch.end;
    }
  }
  return { records, mergedAlpha };
}

/**
 * The layer and mask information section. 16- and 32-bit documents leave
 * the plain layer info empty and keep their layers in an `Lr16` / `Lr32`
 * block among the tagged blocks that follow the global mask info.
 */
function readLayerSection(r, end) {
  let info = null;
  const infoEnd = r.block(end);
  if (infoEnd > r.pos) info = readLayerInfo(r, infoEnd);
  r.pos = infoEnd;
  if (r.pos + 4 <= end) r.pos = r.block(end); // global layer mask info
  while (r.pos + 12 <= end && r.isSig(r.pos)) {
    r.pos += 4;
    const key = r.str(4);
    const len = r.u32();
    const blockEnd = r.pos + len;
    if (blockEnd > end) break;
    if ((key === "Lr16" || key === "Lr32" || key === "Layr") && !info?.records.length) {
      info = readLayerInfo(r, blockEnd);
    }
    // these blocks are padded to a multiple of four bytes (some writers: two)
    const padded = blockEnd + ((4 - (len % 4)) % 4);
    r.pos = r.isSig(blockEnd) || !r.isSig(padded) ? blockEnd : padded;
    if (!r.isSig(r.pos) && r.isSig(blockEnd + (len & 1))) r.pos = blockEnd + (len & 1);
  }
  return info;
}

/* ------------------------------ pixel data ------------------------------ */

let srgbTable = null;
/** Linear light (0..1 in 16384 steps) → 8-bit sRGB. */
function srgbLUT() {
  if (!srgbTable) {
    srgbTable = new Uint8Array(16385);
    for (let i = 0; i <= 16384; i++) {
      const l = i / 16384;
      const s = l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
      srgbTable[i] = Math.round(s * 255);
    }
  }
  return srgbTable;
}

/**
 * Convert `n` big-endian samples at `src[off]` to 8 bits into `out[o]`.
 * 16-bit samples round; 32-bit floats are linear light, so colour goes
 * through the sRGB curve while alpha and masks scale linearly.
 */
function converter(depth, alpha) {
  if (depth === 8) {
    return (src, off, n, out, o) => out.set(src.subarray(off, off + n), o);
  }
  if (depth === 16) {
    return (src, off, n, out, o) => {
      for (let i = 0; i < n; i++, off += 2) out[o + i] = (((src[off] << 8) | src[off + 1]) + 128) / 257;
    };
  }
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  const lut = alpha ? null : srgbLUT();
  return (src, off, n, out, o) => {
    for (let i = 0; i < n; i++, off += 4) {
      u32[0] = ((src[off] << 24) | (src[off + 1] << 16) | (src[off + 2] << 8) | src[off + 3]) >>> 0;
      const f = f32[0];
      const v = f > 0 ? (f < 1 ? f : 1) : 0; // NaN → 0
      out[o + i] = alpha ? v * 255 + 0.5 : lut[(v * 16384 + 0.5) | 0];
    }
  };
}

/*
 * A row source returns rows [y0, y1) of one channel as 8-bit samples, cut to
 * the columns [lx, lx + cw). Requests only ever move down the image.
 */

function rawRows(bytes, start, end, w, depth, alpha, lx, cw) {
  const bps = depth >> 3;
  const rowBytes = w * bps;
  const conv = converter(depth, alpha);
  return async (y0, y1) => {
    const out = new Uint8Array((y1 - y0) * cw);
    for (let y = y0; y < y1; y++) {
      const s = start + y * rowBytes + lx * bps;
      if (s + cw * bps > end) break; // truncated file: the rest stays empty
      conv(bytes, s, cw, out, (y - y0) * cw);
    }
    return out;
  };
}

function rleRows(bytes, rowStarts, end, w, depth, alpha, lx, cw) {
  const bps = depth >> 3;
  const rowBytes = w * bps;
  const row = new Uint8Array(rowBytes);
  const conv = converter(depth, alpha);
  return async (y0, y1) => {
    const out = new Uint8Array((y1 - y0) * cw);
    for (let y = y0; y < y1; y++) {
      const s = rowStarts[y];
      const e = Math.min(rowStarts[y + 1], end);
      row.fill(0);
      if (e > s) unpackBits(bytes, s, e - s, row, 0, rowBytes);
      conv(row, lx * bps, cw, out, (y - y0) * cw);
    }
    return out;
  };
}

/** Undo ZIP prediction (a horizontal delta per row) in place. */
function unpredict(row, w, depth, shuffled) {
  if (depth === 8) {
    for (let i = 1; i < w; i++) row[i] += row[i - 1];
  } else if (depth === 16) {
    for (let i = 1, p = 2; i < w; i++, p += 2) {
      const v = ((row[p] << 8) | row[p + 1]) + ((row[p - 2] << 8) | row[p - 1]);
      row[p] = v >> 8;
      row[p + 1] = v;
    }
  } else {
    // 32-bit: a byte-wise delta over the row, whose bytes are stored as four
    // planes (all first bytes, then all second bytes…) — interleave them back
    for (let i = 1; i < row.length; i++) row[i] += row[i - 1];
    for (let x = 0, p = 0; x < w; x++, p += 4) {
      shuffled[p] = row[x];
      shuffled[p + 1] = row[w + x];
      shuffled[p + 2] = row[2 * w + x];
      shuffled[p + 3] = row[3 * w + x];
    }
    return shuffled;
  }
  return row;
}

/** Deflate never expands data more than this (a 258-byte match in ~2 bits). */
const MAX_DEFLATE_RATIO = 1032;
/** Compressed bytes handed to the inflater at a time: each yields ≤ ~17 MB. */
const ZIP_CHUNK = 1 << 14;

/**
 * Compressed bytes as a stream of small chunks, pulled only as the inflater
 * needs them — the inflater turns each chunk into output all at once, so a
 * small chunk bounds the memory even for extremely compressible data.
 */
function chunkStream(data) {
  let p = 0;
  return new ReadableStream({
    pull(ctrl) {
      if (p >= data.length) ctrl.close();
      else ctrl.enqueue(data.slice(p, (p += ZIP_CHUNK)));
    },
  });
}

/**
 * ZIP data is inflated as a stream, a row at a time, never all at once.
 * Rows from `alphaFrom` on hold transparency or mask values. The stream
 * stops after row `h`.
 */
function zipRows(data, w, h, depth, predict, alphaFrom, lx, cw) {
  if (typeof DecompressionStream !== "function") throw damaged();
  const bps = depth >> 3;
  const rowBytes = w * bps;
  const colorConv = converter(depth, false);
  const alphaConv = converter(depth, true);
  const row = new Uint8Array(rowBytes);
  const shuffled = depth === 32 && predict ? new Uint8Array(rowBytes) : null;
  const reader = chunkStream(data).pipeThrough(new DecompressionStream("deflate")).getReader();
  let chunk = new Uint8Array(0);
  let cp = 0;
  let next = 0; // next row to inflate
  let first = 0; // rows above this are no longer kept
  const kept = [];

  const inflateRow = async () => {
    for (let o = 0; o < rowBytes; ) {
      if (cp >= chunk.length) {
        let res;
        try {
          res = await reader.read();
        } catch {
          throw damaged();
        }
        if (res.done) throw damaged();
        chunk = res.value;
        cp = 0;
        continue;
      }
      const n = Math.min(rowBytes - o, chunk.length - cp);
      row.set(chunk.subarray(cp, cp + n), o);
      o += n;
      cp += n;
    }
  };

  return async (y0, y1) => {
    for (let y = first; y < Math.min(y0, next); y++) kept[y] = undefined;
    first = Math.max(first, y0);
    while (next < y1) {
      await inflateRow();
      if (next >= first) {
        const samples = predict ? unpredict(row, w, depth, shuffled) : row;
        const out = new Uint8Array(cw);
        (next >= alphaFrom ? alphaConv : colorConv)(samples, lx * bps, cw, out, 0);
        kept[next] = out;
      }
      next++;
      if (next === h) reader.cancel().catch(() => {});
    }
    const out = new Uint8Array((y1 - y0) * cw);
    for (let y = y0; y < y1; y++) out.set(kept[y], (y - y0) * cw);
    return out;
  };
}

/**
 * Row source for one layer channel (`ch` from the layer info) of a w × h
 * rectangle, or null when the channel has no data. Throws PsdError when the
 * data is damaged or uses an unknown compression.
 */
function channelRows(src, ch, w, h, alpha, lx, cw) {
  if (!ch || ch.end - ch.start < 2) return null;
  const { bytes, depth } = src;
  const compression = (bytes[ch.start] << 8) | bytes[ch.start + 1];
  const start = ch.start + 2;
  const end = ch.end;
  const rowBytes = w * (depth >> 3);
  if (compression === 0) {
    if (start + rowBytes * h > end) throw damaged();
    return rawRows(bytes, start, end, w, depth, alpha, lx, cw);
  }
  if (compression === 1) {
    if (start + h * 2 > end) throw damaged();
    const rowStarts = new Float64Array(h + 1);
    rowStarts[0] = start + h * 2;
    for (let y = 0; y < h; y++) {
      rowStarts[y + 1] = rowStarts[y] + ((bytes[start + y * 2] << 8) | bytes[start + y * 2 + 1]);
    }
    if (rowStarts[h] > end) throw damaged();
    return rleRows(bytes, rowStarts, end, w, depth, alpha, lx, cw);
  }
  if (compression === 2 || compression === 3) {
    // more than deflate can expand to: not a real channel
    if ((end - start) * MAX_DEFLATE_RATIO < rowBytes * h) throw damaged();
    return zipRows(bytes.subarray(start, end), w, h, depth, compression === 3, alpha ? 0 : Infinity, lx, cw);
  }
  throw damaged();
}

/* ------------------------------ drawing ------------------------------ */

/**
 * Paint a w × h source rectangle at document position (x, y) into `ctx`,
 * scaled by kx/ky. `band(data, y0, y1)` fills RGBA rows [y0, y1). Scaled
 * bands carry extra rows above and below so resampling sees the real
 * neighbours, and a clip makes each target row come from exactly one band.
 */
async function paintBands(ctx, x, y, w, h, kx, ky, band) {
  if (kx === 1 && ky === 1) {
    const rows = Math.max(1, Math.min(h, Math.floor(BAND_PIXELS / w)));
    for (let y0 = 0; y0 < h; y0 += rows) {
      const y1 = Math.min(h, y0 + rows);
      const img = ctx.createImageData(w, y1 - y0);
      await band(img.data, y0, y1);
      ctx.putImageData(img, x, y + y0);
    }
    return;
  }
  const margin = Math.ceil(3 / ky) + 2;
  const ty0 = Math.max(0, Math.floor(y * ky));
  const ty1 = Math.min(ctx.canvas.height, Math.ceil((y + h) * ky));
  const step = Math.max(1, Math.floor((BAND_PIXELS / w) * ky));
  let tmp = null;
  let tc = null;
  try {
    for (let a = ty0; a < ty1; a += step) {
      const b = Math.min(ty1, a + step);
      const s0 = Math.max(0, Math.floor(a / ky) - y - margin);
      const s1 = Math.min(h, Math.ceil(b / ky) - y + margin);
      if (s1 <= s0) continue;
      if (!tmp || tmp.height !== s1 - s0) {
        releaseCanvas(tmp);
        tmp = makeCanvas(w, s1 - s0);
        tc = ctx2d(tmp);
      }
      const img = tc.createImageData(w, s1 - s0);
      await band(img.data, s0, s1);
      tc.putImageData(img, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, a, ctx.canvas.width, b - a);
      ctx.clip();
      ctx.drawImage(tmp, x * kx, (y + s0) * ky, w * kx, (s1 - s0) * ky);
      ctx.restore();
    }
  } finally {
    // also when decoding fails: the composite fallback needs the memory
    releaseCanvas(tmp);
  }
}

/** The part of a document-space rectangle that lies on the canvas. */
function onCanvas(src, rect) {
  const w = rect.right - rect.left;
  const h = rect.bottom - rect.top;
  if (w <= 0 || h <= 0) return null;
  if (w > MAX_LAYER_EDGE || h > MAX_LAYER_EDGE) throw damaged();
  const x0 = Math.max(0, rect.left);
  const y0 = Math.max(0, rect.top);
  const x1 = Math.min(src.width, rect.right);
  const y1 = Math.min(src.height, rect.bottom);
  if (x1 <= x0 || y1 <= y0) return null;
  return { w, h, x: x0, y: y0, cw: x1 - x0, ch: y1 - y0, lx: x0 - rect.left, ly: y0 - rect.top };
}

/** Paint a layer's colour + alpha channels into its (target-size) canvas. */
async function paintLayer(ctx, src, rec) {
  const c = onCanvas(src, rec);
  if (!c) return;
  const ids = src.gray ? [0, -1] : [0, 1, 2, -1];
  const rows = ids.map((id) =>
    channelRows(src, rec.channels.find((ch) => ch.id === id), c.w, c.h, id < 0, c.lx, c.cw)
  );
  if (rows.every((get) => !get)) return;
  await paintBands(ctx, c.x, c.y, c.cw, c.ch, src.kx, src.ky, async (data, y0, y1) => {
    const planes = await Promise.all(rows.map((get) => get && get(c.ly + y0, c.ly + y1)));
    const [R, G, B, A] = src.gray ? [planes[0], planes[0], planes[0], planes[1]] : planes;
    const n = (y1 - y0) * c.cw;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      data[p] = R ? R[i] : 0;
      data[p + 1] = G ? G[i] : 0;
      data[p + 2] = B ? B[i] : 0;
      data[p + 3] = A ? A[i] : 255;
    }
  });
}

/** Mask canvas alpha ← its grey value (white everywhere), a band at a time. */
function grayToAlpha(canvas) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const rows = Math.max(1, Math.floor(BAND_PIXELS / w));
  for (let y = 0; y < h; y += rows) {
    const img = ctx.getImageData(0, y, w, Math.min(rows, h - y));
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i + 3] = d[i];
      d[i] = d[i + 1] = d[i + 2] = 255;
    }
    ctx.putImageData(img, 0, y);
  }
}

/** Feather radii above this blur a reduced copy of the mask instead. */
const FEATHER_FULL = 8;

/**
 * Photoshop's mask feather: a Gaussian blur of the mask, done in place. A
 * wide radius blurs a reduced copy (the result is smooth anyway), so no
 * canvas padded by three radii on each side is ever needed.
 */
function featherMask(canvas, radius) {
  const f = Math.min(1, FEATHER_FULL / radius);
  let small = canvas;
  if (f < 1) {
    small = makeCanvas(canvas.width * f, canvas.height * f);
    ctx2d(small).drawImage(canvas, 0, 0, small.width, small.height);
  }
  let blurred = null;
  try {
    blurred = blurAlpha(small, radius * f);
    const ctx = ctx2d(canvas);
    ctx.save();
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(blurred, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } finally {
    if (small !== canvas) releaseCanvas(small);
    releaseCanvas(blurred);
  }
}

/**
 * A layer's (or group's) mask as a target-size canvas: filled with its
 * default colour, so a "hide all" mask without any pixel data still hides,
 * then its data at its rectangle. On a layer, a mask rendered from a vector
 * mask is already part of the layer's alpha (shape layers) and is skipped;
 * when there is also a user mask, that one is in channel −3. The user mask's
 * density and feather are applied.
 */
async function buildMask(rec, src, isGroup = false) {
  const m = rec.mask;
  if (!m) return null;
  const realData = !isGroup && m.real && rec.channels.find((ch) => ch.id === -3);
  if (!realData && !isGroup && m.flags & 8) return null;
  const info = realData ? m.real : m;
  const ch = realData || rec.channels.find((c) => c.id === -2);
  // density lightens what the mask hides: visibility = 1 − density × (1 − mask)
  const density = m.density ?? 1;
  const dense = density < 1 ? Uint8Array.from({ length: 256 }, (_, v) => 255 - density * (255 - v) + 0.5) : null;
  const canvas = makeCanvas(src.tw, src.th);
  try {
    const ctx = ctx2d(canvas);
    const def = dense ? dense[info.defaultColor] : info.defaultColor;
    const exact = src.kx === 1 && src.ky === 1;
    // scaled masks are drawn as opaque grey (so resampled edges blend with the
    // default colour around them) and turned into alpha afterwards
    ctx.fillStyle = exact ? `rgba(255,255,255,${def / 255})` : `rgb(${def},${def},${def})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const c = onCanvas(src, info);
    const rows = c && channelRows(src, ch, c.w, c.h, true, c.lx, c.cw);
    if (rows) {
      await paintBands(ctx, c.x, c.y, c.cw, c.ch, src.kx, src.ky, async (data, y0, y1) => {
        const M = await rows(c.ly + y0, c.ly + y1);
        for (let i = 0, p = 0; i < M.length; i++, p += 4) {
          const v = dense ? dense[M[i]] : M[i];
          if (exact) {
            data[p] = data[p + 1] = data[p + 2] = 255;
            data[p + 3] = v;
          } else {
            data[p] = data[p + 1] = data[p + 2] = v;
            data[p + 3] = 255;
          }
        }
      });
    }
    if (!exact) grayToAlpha(canvas);
    // the feather radius is in document pixels
    const feather = (m.feather || 0) * src.kx;
    if (feather >= 0.5) featherMask(canvas, feather);
  } catch (err) {
    releaseCanvas(canvas);
    throw err;
  }
  return { canvas, enabled: !(info.flags & 2) };
}

/**
 * A clipped layer shows only where its base (the nearest unclipped layer
 * below) shows: bake the base's own pixels and own mask into its pixels and
 * take on the base's opacity — not its fill, which fades only the base's own
 * pixels (a Fill 0 % base is the usual "photo inside text" stencil). Runs
 * before the group masks are baked in, so those — like a group's opacity —
 * count once.
 */
function bakeClipping(records) {
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    if (!rec.clipping || !rec.layer) continue;
    let j = i - 1;
    while (j >= 0 && records[j].clipping && records[j].section === 0) j--;
    const baseRec = records[j]?.section === 0 ? records[j] : null;
    const base = baseRec?.layer;
    if (!base) continue; // clipped to a group or an adjustment layer: left as is
    const shape = base.maskedPixels();
    const c = rec.layer.ctx;
    c.save();
    c.globalCompositeOperation = "destination-in";
    c.drawImage(shape, 0, 0);
    c.restore();
    if (shape !== base.canvas) releaseCanvas(shape);
    rec.alpha *= baseRec.opacity;
    if (!base.visible) rec.layer.visible = false;
  }
}

/** Free a layer's canvases now (its import failed or is not used). */
function releaseLayer(layer) {
  releaseCanvas(layer.canvas);
  releaseCanvas(layer.mask);
}

/**
 * Build the layers. Returns null when the composite shows the document
 * better (only adjustment or fill layers without stored pixels). On any
 * error the canvases created so far are released before it is rethrown.
 */
async function importLayers(src, records) {
  const layers = [];
  const groupMasks = [];
  try {
    // walk top → bottom to resolve group visibility, opacity and masks
    const effective = new Map();
    const stack = [];
    const top = { hidden: false, opacity: 1, masks: [] };
    for (let i = records.length - 1; i >= 0; i--) {
      const rec = records[i];
      if (rec.section === 1 || rec.section === 2) {
        const parent = stack[stack.length - 1] || top;
        const mask = rec.hidden || parent.hidden ? null : await buildMask(rec, src, true);
        if (mask) groupMasks.push(mask.canvas);
        stack.push({
          hidden: parent.hidden || rec.hidden,
          opacity: parent.opacity * rec.opacity,
          masks: mask?.enabled ? [...parent.masks, mask.canvas] : parent.masks,
        });
      } else if (rec.section === 3) {
        stack.pop();
      } else {
        effective.set(rec, stack[stack.length - 1] || top);
      }
    }

    let skipped = 0;
    let pixels = false;
    for (const rec of records) {
      if (rec.section !== 0) continue;
      const hasPixels = rec.right > rec.left && rec.bottom > rec.top;
      if (rec.adjustment || (rec.fillLayer && !hasPixels)) {
        skipped++;
        continue;
      }
      const group = effective.get(rec);
      const layer = new Layer(src.tw, src.th, { name: rec.name || t("Layer") });
      layers.push(layer);
      if (hasPixels) {
        await paintLayer(layer.ctx, src, rec);
        pixels = true;
      }
      layer.visible = !rec.hidden && !group.hidden;
      // fill opacity equals opacity for a normal layer without layer effects
      rec.alpha = rec.opacity * rec.fill * group.opacity;
      layer.blend = rec.blend;
      const mask = await buildMask(rec, src);
      if (mask) {
        layer.setMask(mask.canvas);
        layer.maskEnabled = mask.enabled;
      }
      rec.layer = layer;
    }
    if (!pixels && skipped) {
      for (const layer of layers.splice(0)) releaseLayer(layer);
      return null;
    }
    bakeClipping(records);
    for (const rec of records) {
      const layer = rec.layer;
      if (!layer) continue;
      layer.opacity = Math.round(rec.alpha * 100) / 100;
      // groups are flattened: a group's mask becomes part of its layers' pixels
      for (const groupMask of effective.get(rec).masks) {
        layer.ctx.save();
        layer.ctx.globalCompositeOperation = "destination-in";
        layer.ctx.drawImage(groupMask, 0, 0);
        layer.ctx.restore();
      }
    }
    return { layers, skipped };
  } catch (err) {
    for (const layer of layers) releaseLayer(layer);
    throw err;
  } finally {
    for (const canvas of groupMasks) releaseCanvas(canvas);
  }
}

/** The flattened composite ("merged image data") at the end of the file. */
async function paintComposite(ctx, src, start, channelCount, mergedAlpha) {
  const { bytes, width, height, depth, gray } = src;
  if (start + 2 > bytes.length) throw damaged();
  const compression = (bytes[start] << 8) | bytes[start + 1];
  const colors = gray ? 1 : 3;
  // the first extra channel is transparency only when the layer info says so
  const wanted = Array.from({ length: mergedAlpha && channelCount > colors ? colors + 1 : colors }, (_, i) => i);
  const bps = depth >> 3;
  const rowBytes = width * bps;
  const data = start + 2;
  let rows;
  if (compression === 0) {
    rows = wanted.map((c) => rawRows(bytes, data + c * height * rowBytes, bytes.length, width, depth, c === colors, 0, width));
  } else if (compression === 1) {
    const total = channelCount * height;
    const starts = new Float64Array(total + 1);
    starts[0] = data + total * 2;
    for (let i = 0; i < total; i++) {
      const p = data + i * 2;
      starts[i + 1] = starts[i] + (p + 1 < bytes.length ? (bytes[p] << 8) | bytes[p + 1] : 0);
    }
    rows = wanted.map((c) =>
      rleRows(bytes, starts.subarray(c * height, (c + 1) * height + 1), bytes.length, width, depth, c === colors, 0, width)
    );
  } else if (compression === 2 || compression === 3) {
    // one stream holds every channel in turn: each channel inflates it on its
    // own, skipping the channels before it, so only a band of rows is ever
    // held — never a whole channel, at any document size
    const zip = bytes.subarray(data);
    rows = wanted.map((c) => {
      const get = zipRows(zip, width, (c + 1) * height, depth, compression === 3, colors * height, 0, width);
      return (y0, y1) => get(c * height + y0, c * height + y1);
    });
  } else {
    return false;
  }
  await paintBands(ctx, 0, 0, width, height, src.kx, src.ky, async (out, y0, y1) => {
    const planes = await Promise.all(rows.map((get) => get(y0, y1)));
    const [R, G, B, A] = gray ? [planes[0], planes[0], planes[0], planes[1]] : planes;
    const n = (y1 - y0) * width;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      out[p] = R[i];
      out[p + 1] = G[i];
      out[p + 2] = B[i];
      out[p + 3] = A ? A[i] : 255;
    }
  });
  return true;
}

/**
 * Read a PSD into a new Doc. Documents larger than `maxDim` on an edge (or
 * than `maxPixels` in area) are scaled down on the fly; `doc.psdScaled` and
 * `doc.psdOriginalSize` then say so. When the layers would need more than
 * `maxLayerBytes` of canvas memory, or cannot be read, the flattened image
 * is used (`doc.psdFlattened`). `doc.psdSkipped` counts the adjustment layers
 * left out. Throws an Error with a stable English message for files that
 * cannot be opened at all.
 */
export async function readPSD(buffer, { maxDim = 8000, maxPixels = Infinity, maxLayerBytes = 2 ** 31 } = {}) {
  const r = new Reader(buffer);
  if (r.bytes.length < 26 || r.str(4) !== "8BPS") throw new Error("Not a Photoshop file");
  const version = r.u16();
  if (version === 2) throw new Error("PSB (large document) files are not supported");
  if (version !== 1) throw new Error("Unknown PSD version");
  r.skip(6);
  const channelCount = r.u16();
  const height = r.u32();
  const width = r.u32();
  const depth = r.u16();
  const mode = r.u16();
  if (mode !== 3 && mode !== 1) {
    throw new Error(mode === 4 ? "CMYK PSD files are not supported" : "Only RGB and grayscale PSD files are supported");
  }
  if (depth !== 8 && depth !== 16 && depth !== 32) throw new Error("Only 8-, 16- and 32-bit PSD files are supported");
  if (!width || !height || !channelCount || channelCount > 56 || (mode === 3 && channelCount < 3)) throw damaged();
  if (width > 30000 || height > 30000) throw new Error("This PSD is too large to open in a browser");

  r.pos = r.block(); // colour mode data
  r.pos = r.block(); // image resources
  const sectionEnd = r.block();
  let info = null;
  let layersDamaged = false;
  try {
    if (sectionEnd > r.pos) info = readLayerSection(r, sectionEnd);
  } catch (err) {
    if (!(err instanceof PsdError)) throw err;
    layersDamaged = true;
  }
  let records = info?.records || [];

  // a file that cannot even hold its composite image is not what it claims
  // to be — refuse it before allocating a document of the claimed size. ZIP
  // data must hold every channel the reader inflates (the colours, and the
  // transparency when there is one) at no more than deflate's expansion
  const compression = sectionEnd + 2 <= r.bytes.length ? r.view.getUint16(sectionEnd) : -1;
  const colors = mode === 1 ? 1 : 3;
  const planes = compression > 1 && info?.mergedAlpha && channelCount > colors ? colors + 1 : colors;
  const decoded = planes * height * width * (depth >> 3);
  const ratio = compression === 0 ? 2 : compression === 1 ? 128 : compression > 1 ? MAX_DEFLATE_RATIO : Infinity;
  const table = compression === 1 ? channelCount * height * 2 : 0;
  if (r.bytes.length - sectionEnd - 2 < table + decoded / ratio) throw damaged();

  const k = Math.min(1, maxDim / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  const tw = Math.max(1, Math.round(width * k));
  const th = Math.max(1, Math.round(height * k));
  const src = {
    bytes: r.bytes,
    width,
    height,
    depth,
    gray: mode === 1,
    tw,
    th,
    kx: tw / width,
    ky: th / height,
  };
  const doc = new Doc(tw, th);
  if (tw !== width || th !== height) {
    doc.psdScaled = true;
    doc.psdOriginalSize = { width, height };
  }

  // every layer (and mask) becomes a document-sized canvas: past the memory
  // budget, open the flattened image rather than exhaust the device
  const canvases = records.filter((rec) => rec.section === 0 && !rec.adjustment).length +
    records.filter((rec) => rec.mask).length;
  if (canvases * tw * th * 4 > maxLayerBytes) records = [];

  let imported = null;
  if (records.length) {
    try {
      imported = await importLayers(src, records);
    } catch (err) {
      // damaged layer data, or more canvases than the browser grants (iOS
      // Safari caps their total memory): the composite needs only one
      if (!(err instanceof PsdError || err instanceof CanvasTooLargeError)) throw err;
      imported = null;
    }
  }
  if (imported?.layers.length) {
    doc.layers.push(...imported.layers);
    doc.psdSkipped = imported.skipped;
  } else {
    const layer = new Layer(tw, th, { name: t("Background") });
    const ok = await paintComposite(layer.ctx, src, sectionEnd, channelCount, !!info?.mergedAlpha);
    if (!ok) throw new Error("This PSD uses compression that cannot be read here");
    doc.layers.push(layer);
    doc.psdFlattened = layersDamaged || (info?.records || []).some((rec) => rec.section === 0);
  }
  doc.setActive(doc.layers.length - 1);
  return doc;
}

/* ================================= writing ================================ */

class Writer {
  constructor() {
    this.chunks = [];
    this.buf = new Uint8Array(1 << 16);
    this.view = new DataView(this.buf.buffer);
    this.pos = 0;
    this.total = 0;
  }
  _room(n) {
    if (this.pos + n <= this.buf.length) return;
    this.flush();
    if (n > this.buf.length) {
      this.buf = new Uint8Array(n);
      this.view = new DataView(this.buf.buffer);
    }
  }
  flush() {
    if (this.pos) this.chunks.push(this.buf.slice(0, this.pos));
    this.total += this.pos;
    this.pos = 0;
  }
  u8(v) {
    this._room(1);
    this.view.setUint8(this.pos++, v);
  }
  u16(v) {
    this._room(2);
    this.view.setUint16(this.pos, v);
    this.pos += 2;
  }
  i16(v) {
    this._room(2);
    this.view.setInt16(this.pos, v);
    this.pos += 2;
  }
  u32(v) {
    this._room(4);
    this.view.setUint32(this.pos, v);
    this.pos += 4;
  }
  i32(v) {
    this._room(4);
    this.view.setInt32(this.pos, v);
    this.pos += 4;
  }
  str(s) {
    for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i) & 0xff);
  }
  bytes(arr) {
    this.flush();
    this.chunks.push(arr);
    this.total += arr.length;
  }
  get length() {
    return this.total + this.pos;
  }
  blob() {
    this.flush();
    return new Blob(this.chunks, { type: "image/vnd.adobe.photoshop" });
  }
}

/**
 * PackBits-encode `n` bytes of `src` from `start` into `out` at `o`; returns
 * the number of bytes written (at most n + ceil(n / 128)).
 */
function packRow(src, start, n, out, o) {
  const begin = o;
  const end = start + n;
  let i = start;
  while (i < end) {
    let run = 1;
    while (i + run < end && run < 128 && src[i + run] === src[i]) run++;
    if (run >= 3) {
      out[o++] = 257 - run;
      out[o++] = src[i];
      i += run;
      continue;
    }
    const lit = o++;
    let count = 0;
    while (i < end && count < 128) {
      if (i + 2 < end && src[i] === src[i + 1] && src[i] === src[i + 2]) break;
      out[o++] = src[i++];
      count++;
    }
    out[lit] = count - 1;
  }
  return o - begin;
}

/** RLE-compress a plane (w × h samples) into [rowCounts…, data…] bytes. */
function packPlane(plane, w, h) {
  const worst = w + Math.ceil(w / 128);
  let out = new Uint8Array(h * 2 + Math.max(worst, Math.min(h * worst, (w * h) >> 2) + worst));
  let o = h * 2;
  for (let y = 0; y < h; y++) {
    if (o + worst > out.length) {
      const grown = new Uint8Array(Math.min(h * 2 + h * worst, out.length * 2) + worst);
      grown.set(out.subarray(0, o));
      out = grown;
    }
    const n = packRow(plane, y * w, w, out, o);
    out[y * 2] = n >> 8;
    out[y * 2 + 1] = n & 255;
    o += n;
  }
  return out.subarray(0, o);
}

function planesOf(canvas, rect) {
  const { data } = canvas.getContext("2d").getImageData(rect.x, rect.y, rect.w, rect.h);
  const n = rect.w * rect.h;
  const planes = [new Uint8Array(n), new Uint8Array(n), new Uint8Array(n), new Uint8Array(n)];
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    planes[0][i] = data[p];
    planes[1][i] = data[p + 1];
    planes[2][i] = data[p + 2];
    planes[3][i] = data[p + 3];
  }
  return planes;
}

function pascalName(name) {
  // the legacy name is single-byte; the Unicode copy follows in 'luni'
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").slice(0, 255);
  const total = 1 + ascii.length;
  const pad = (4 - (total % 4)) % 4;
  return { ascii, pad };
}

export async function writePSD(doc) {
  const w = new Writer();
  const W = doc.width;
  const H = doc.height;

  // header
  w.str("8BPS");
  w.u16(1);
  for (let i = 0; i < 6; i++) w.u8(0);
  w.u16(3);
  w.u32(H);
  w.u32(W);
  w.u16(8);
  w.u16(3);
  w.u32(0); // colour mode data
  w.u32(0); // image resources

  // prepare layer pixel data first so record lengths are known
  const prepared = doc.layers.map((layer) => {
    const b = alphaBounds(layer.canvas, 0);
    const rect = b || { x: 0, y: 0, w: 0, h: 0 };
    const channels = [];
    if (rect.w && rect.h) {
      const [R, G, B, A] = planesOf(layer.canvas, rect);
      for (const [id, plane] of [
        [-1, A],
        [0, R],
        [1, G],
        [2, B],
      ]) {
        channels.push({ id, data: packPlane(plane, rect.w, rect.h), compression: 1 });
      }
    } else {
      for (const id of [-1, 0, 1, 2]) channels.push({ id, data: new Uint8Array(0), compression: 0 });
    }
    let mask = null;
    if (layer.mask) {
      const full = { x: 0, y: 0, w: W, h: H };
      const alpha = planesOf(layer.mask, full)[3];
      mask = { rect: full, disabled: !layer.maskEnabled };
      channels.push({ id: -2, data: packPlane(alpha, W, H), compression: 1 });
    }
    return { layer, rect, channels, mask };
  });

  // layer and mask information section, assembled in its own writer
  const info = new Writer();
  info.i16(prepared.length);
  for (const { layer, rect, channels, mask } of prepared) {
    info.i32(rect.y);
    info.i32(rect.x);
    info.i32(rect.y + rect.h);
    info.i32(rect.x + rect.w);
    info.u16(channels.length);
    for (const ch of channels) {
      info.i16(ch.id);
      info.u32(2 + ch.data.length);
    }
    info.str("8BIM");
    info.str(BLEND_TO_PSD[layer.blend] || "norm");
    info.u8(Math.round(layer.opacity * 255));
    info.u8(0);
    info.u8(layer.visible ? 0 : 2);
    info.u8(0);

    const { ascii, pad } = pascalName(layer.name);
    const uni = layer.name;
    const luniLength = 4 + uni.length * 2;
    const luniPadded = luniLength + (luniLength % 4 ? 4 - (luniLength % 4) : 0);
    const extra = (mask ? 4 + 20 : 4) + 4 + 1 + ascii.length + pad + 12 + luniPadded;
    info.u32(extra);
    if (mask) {
      info.u32(20);
      info.i32(mask.rect.y);
      info.i32(mask.rect.x);
      info.i32(mask.rect.y + mask.rect.h);
      info.i32(mask.rect.x + mask.rect.w);
      info.u8(0); // default colour outside the rectangle (it covers the document)
      info.u8(mask.disabled ? 2 : 0);
      info.u16(0);
    } else {
      info.u32(0);
    }
    info.u32(0); // blending ranges
    info.u8(ascii.length);
    info.str(ascii);
    for (let i = 0; i < pad; i++) info.u8(0);
    info.str("8BIM");
    info.str("luni");
    info.u32(luniPadded);
    info.u32(uni.length);
    for (let i = 0; i < uni.length; i++) info.u16(uni.charCodeAt(i));
    for (let i = luniLength; i < luniPadded; i++) info.u8(0);
  }
  for (const { channels } of prepared) {
    for (const ch of channels) {
      info.u16(ch.compression);
      if (ch.data.length) info.bytes(ch.data);
    }
  }
  if (info.length % 2) info.u8(0);
  const infoBlob = info.blob();
  const infoBytes = new Uint8Array(await infoBlob.arrayBuffer());

  w.u32(4 + infoBytes.length + 4); // layer and mask section
  w.u32(infoBytes.length); // layer info
  w.bytes(infoBytes);
  w.u32(0); // global layer mask info

  // flattened composite on white, for viewers that ignore layers
  const flat = doc.renderFlat({ background: "#ffffff" });
  const [R, G, B] = planesOf(flat, { x: 0, y: 0, w: W, h: H });
  w.u16(1);
  const packed = [R, G, B].map((p) => packPlane(p, W, H));
  // all row counts first, then all data
  for (const p of packed) w.bytes(p.subarray(0, H * 2));
  for (const p of packed) w.bytes(p.subarray(H * 2));
  return w.blob();
}
