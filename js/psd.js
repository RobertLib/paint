/* ==========================================================================
   Photoshop documents — read and write .psd without any library.

   Reading covers what a pixel editor can honour: 8- and 16-bit RGB or
   grayscale, raw or RLE (PackBits) channels, pixel layers with names
   (including Unicode), opacity, visibility, blend modes and user masks.
   Groups are flattened into a plain stack (a hidden group hides its
   children). Text, shape and smart-object layers arrive as the pixels
   Photoshop stored for them. When layer data cannot be read (ZIP compressed,
   32-bit) the flattened composite is used instead.

   Writing produces an 8-bit RGB PSD with one RLE-compressed layer per layer,
   masks included, plus a flattened composite for apps that only read that.
   ========================================================================== */

import { Doc, Layer, alphaBounds, ctx2d, makeCanvas } from "./doc.js";
import { t } from "./i18n.js";

const BLEND_FROM_PSD = {
  norm: "source-over",
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
};
const BLEND_TO_PSD = Object.fromEntries(
  Object.entries(BLEND_FROM_PSD).map(([k, v]) => [v, k.padEnd(4, " ")])
);

/* ================================= reading ================================ */

class Reader {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
    this.pos = 0;
  }
  u8() {
    return this.view.getUint8(this.pos++);
  }
  i16() {
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }
  u16() {
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }
  i32() {
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }
  u32() {
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }
  str(n) {
    let s = "";
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.bytes[this.pos + i]);
    this.pos += n;
    return s;
  }
  skip(n) {
    this.pos += n;
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
      const count = Math.min(1 - n, oEnd - o);
      out.fill(src[i++], o, o + count);
      o += count;
    }
  }
}

/** Decode one channel to 8-bit samples. Returns null for unsupported compression. */
function readChannel(r, compression, w, h, depth, dataEnd) {
  const bps = depth / 8;
  const rowBytes = w * bps;
  const raw = new Uint8Array(rowBytes * h);
  if (compression === 0) {
    raw.set(r.bytes.subarray(r.pos, r.pos + raw.length));
    r.pos += raw.length;
  } else if (compression === 1) {
    const counts = new Array(h);
    for (let y = 0; y < h; y++) counts[y] = r.u16();
    for (let y = 0; y < h; y++) {
      unpackBits(r.bytes, r.pos, counts[y], raw, y * rowBytes, rowBytes);
      r.pos += counts[y];
    }
  } else {
    if (dataEnd != null) r.pos = dataEnd;
    return null;
  }
  if (bps === 1) return raw;
  // 16-bit: keep the high byte of each big-endian sample
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = raw[i * 2];
  return out;
}

function parseLayerRecord(r) {
  const top = r.i32();
  const left = r.i32();
  const bottom = r.i32();
  const right = r.i32();
  const count = r.u16();
  const channels = [];
  for (let i = 0; i < count; i++) channels.push({ id: r.i16(), length: r.u32() });
  if (r.str(4) !== "8BIM") throw new Error("Damaged PSD layer record");
  const blendKey = r.str(4).trim();
  const opacity = r.u8() / 255;
  r.u8(); // clipping
  const flags = r.u8();
  r.u8(); // filler
  const extraLength = r.u32();
  const extraEnd = r.pos + extraLength;

  let mask = null;
  const maskLength = r.u32();
  if (maskLength >= 20) {
    const mStart = r.pos;
    mask = {
      top: r.i32(),
      left: r.i32(),
      bottom: r.i32(),
      right: r.i32(),
      defaultColor: r.u8(),
      flags: r.u8(),
    };
    r.pos = mStart + maskLength;
  } else {
    r.skip(maskLength);
  }
  r.skip(r.u32()); // blending ranges

  const nameLength = r.u8();
  let name = decodeLatin(r.str(nameLength));
  r.skip((4 - ((nameLength + 1) % 4)) % 4);

  let section = 0;
  while (r.pos + 12 <= extraEnd) {
    const sig = r.str(4);
    if (sig !== "8BIM" && sig !== "8B64") break;
    const key = r.str(4);
    const len = r.u32();
    const blockEnd = r.pos + len;
    if (key === "luni") {
      const chars = r.u32();
      let s = "";
      for (let i = 0; i < chars; i++) s += String.fromCharCode(r.u16());
      name = s.replace(/\0+$/, "") || name;
    } else if (key === "lsct" || key === "lsdk") {
      section = r.u32();
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
    hidden: !!(flags & 2),
    mask,
    name,
    section,
  };
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

function channelsToCanvas(w, h, planes, gray) {
  const c = makeCanvas(w, h);
  const ctx = ctx2d(c);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const R = planes[0];
  const G = gray ? planes[0] : planes[1];
  const B = gray ? planes[0] : planes[2];
  const A = planes[-1];
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    d[p] = R ? R[i] : 0;
    d[p + 1] = G ? G[i] : 0;
    d[p + 2] = B ? B[i] : 0;
    d[p + 3] = A ? A[i] : 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function readPSD(buffer, { maxDim = 8000 } = {}) {
  const r = new Reader(buffer);
  if (r.str(4) !== "8BPS") throw new Error("Not a Photoshop file");
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
  if (depth !== 8 && depth !== 16) throw new Error("Only 8- and 16-bit PSD files are supported");
  if (width * height > 16000 * 16000) throw new Error("This PSD is too large to open in a browser");
  const gray = mode === 1;

  r.skip(r.u32()); // colour mode data
  r.skip(r.u32()); // image resources

  const layerSectionLength = r.u32();
  const layerSectionEnd = r.pos + layerSectionLength;
  const records = [];
  let mergedAlpha = false;
  let layersReadable = true;

  if (layerSectionLength > 0) {
    const infoLength = r.u32();
    const infoEnd = r.pos + infoLength;
    if (infoLength > 0) {
      let count = r.i16();
      if (count < 0) {
        mergedAlpha = true;
        count = -count;
      }
      for (let i = 0; i < count; i++) records.push(parseLayerRecord(r));
      for (const rec of records) {
        rec.planes = {};
        for (const ch of rec.channels) {
          const end = r.pos + ch.length;
          const isMask = ch.id === -2;
          const w = isMask && rec.mask ? rec.mask.right - rec.mask.left : rec.right - rec.left;
          const h = isMask && rec.mask ? rec.mask.bottom - rec.mask.top : rec.bottom - rec.top;
          if (ch.length < 2 || w <= 0 || h <= 0 || ch.id < -2) {
            r.pos = end;
            continue;
          }
          const compression = r.u16();
          const data = readChannel(r, compression, w, h, depth, end);
          if (!data) layersReadable = false;
          else rec.planes[ch.id] = data;
          r.pos = end;
        }
      }
    }
    r.pos = infoEnd;
  }
  r.pos = layerSectionEnd;

  // merged composite (always present; the fallback when layers can't be used)
  const readMerged = () => {
    const compression = r.u16();
    const planes = {};
    const wanted = gray ? [0] : [0, 1, 2];
    if (compression === 1) {
      const counts = [];
      for (let i = 0; i < channelCount * height; i++) counts.push(r.u16());
      const bps = depth / 8;
      const rowBytes = width * bps;
      let ci = 0;
      for (let c = 0; c < channelCount; c++) {
        const raw = new Uint8Array(rowBytes * height);
        for (let y = 0; y < height; y++) {
          const n = counts[ci++];
          unpackBits(r.bytes, r.pos, n, raw, y * rowBytes, rowBytes);
          r.pos += n;
        }
        let plane = raw;
        if (bps === 2) {
          plane = new Uint8Array(width * height);
          for (let i = 0; i < plane.length; i++) plane[i] = raw[i * 2];
        }
        const id = c < wanted.length ? wanted[c] : c === wanted.length && mergedAlpha ? -1 : null;
        if (id !== null) planes[id] = plane;
      }
    } else if (compression === 0) {
      for (let c = 0; c < channelCount; c++) {
        const plane = readChannel(r, 0, width, height, depth);
        const id = c < wanted.length ? wanted[c] : c === wanted.length && mergedAlpha ? -1 : null;
        if (id !== null) planes[id] = plane;
      }
    } else {
      return null;
    }
    return channelsToCanvas(width, height, planes, gray);
  };

  const doc = new Doc(width, height);
  const pixelLayers = records.filter((rec) => rec.section === 0);

  if (pixelLayers.length && layersReadable) {
    // walk top → bottom to resolve group visibility and opacity
    const effective = new Map();
    const stack = [];
    for (let i = records.length - 1; i >= 0; i--) {
      const rec = records[i];
      if (rec.section === 1 || rec.section === 2) {
        const parent = stack[stack.length - 1] || { hidden: false, opacity: 1 };
        stack.push({ hidden: parent.hidden || rec.hidden, opacity: parent.opacity * rec.opacity });
      } else if (rec.section === 3) {
        stack.pop();
      } else {
        effective.set(rec, stack[stack.length - 1] || { hidden: false, opacity: 1 });
      }
    }
    for (const rec of records) {
      if (rec.section !== 0) continue;
      const group = effective.get(rec);
      const layer = new Layer(width, height, { name: rec.name || t("Layer") });
      const w = rec.right - rec.left;
      const h = rec.bottom - rec.top;
      if (w > 0 && h > 0) {
        const pixels = channelsToCanvas(w, h, rec.planes, gray);
        layer.ctx.drawImage(pixels, rec.left, rec.top);
      }
      layer.visible = !rec.hidden && !group.hidden;
      layer.opacity = Math.round(rec.opacity * group.opacity * 100) / 100;
      layer.blend = rec.blend;
      const m = rec.mask;
      if (m && rec.planes[-2]) {
        const mask = makeCanvas(width, height);
        const mc = ctx2d(mask);
        mc.fillStyle = `rgba(255,255,255,${m.defaultColor / 255})`;
        mc.fillRect(0, 0, width, height);
        const mw = m.right - m.left;
        const mh = m.bottom - m.top;
        const img = mc.createImageData(mw, mh);
        const plane = rec.planes[-2];
        for (let i = 0, p = 0; i < mw * mh; i++, p += 4) {
          img.data[p] = img.data[p + 1] = img.data[p + 2] = 255;
          img.data[p + 3] = plane[i];
        }
        mc.putImageData(img, m.left, m.top);
        layer.setMask(mask);
        layer.maskEnabled = !(m.flags & 2);
      }
      doc.layers.push(layer);
    }
  } else {
    const merged = readMerged();
    if (!merged) throw new Error("This PSD uses compression that cannot be read here");
    doc.layers.push(new Layer(width, height, { name: t("Background"), image: merged }));
    doc.psdFlattened = pixelLayers.length > 0;
  }

  doc.setActive(doc.layers.length - 1);
  if (Math.max(width, height) > maxDim) {
    const k = maxDim / Math.max(width, height);
    doc.scaleImage(Math.round(width * k), Math.round(height * k));
  }
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

/** PackBits-encode one row. */
function packRow(row) {
  const out = [];
  const n = row.length;
  let i = 0;
  while (i < n) {
    let run = 1;
    while (i + run < n && run < 128 && row[i + run] === row[i]) run++;
    if (run >= 3) {
      out.push(257 - run, row[i]);
      i += run;
      continue;
    }
    const start = i;
    let lit = 0;
    while (i < n && lit < 128) {
      if (i + 2 < n && row[i] === row[i + 1] && row[i] === row[i + 2]) break;
      i++;
      lit++;
    }
    out.push(lit - 1);
    for (let k = start; k < start + lit; k++) out.push(row[k]);
  }
  return out;
}

/** RLE-compress a plane (w × h samples) into [rowCounts…, data…] bytes. */
function packPlane(plane, w, h) {
  const rows = [];
  let size = h * 2;
  for (let y = 0; y < h; y++) {
    const packed = packRow(plane.subarray(y * w, (y + 1) * w));
    rows.push(packed);
    size += packed.length;
  }
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  let o = h * 2;
  rows.forEach((row, y) => {
    view.setUint16(y * 2, row.length);
    out.set(row, o);
    o += row.length;
  });
  return out;
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
