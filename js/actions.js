/* ==========================================================================
   Application commands — everything the menus, panels and shortcuts invoke.
   UI modules stay presentational: they call into here and listen for events.
   ========================================================================== */

import { cssColor } from "./color.js";
import {
  Doc,
  Layer,
  MAX_DIM,
  copyCanvas,
  ctx2d,
  drawText,
  fitScale,
  grayToMask,
  loadImage,
  makeCanvas,
  makeMask,
  maskToGray,
  maxCanvasPixels,
  paintMasked,
  releaseCanvas,
} from "./doc.js";
import {
  ADJUST_DEFAULTS,
  applyAdjustments,
  applyEffect,
  EFFECTS,
  effectArea,
  hasAdjustments,
} from "./filters.js";
import {
  beginPixelEdit,
  cancelSessions,
  dropSessions,
  editDoc,
  editPixels,
  editSelection,
  history,
  pushCommand,
  registerSession,
  sessionsBusy,
  settleSessions,
} from "./history.js";
import { platformKeys, t, tn } from "./i18n.js";
import { overlay, requestRender } from "./render.js";
import { emit, markDirty, state } from "./state.js";
import { track } from "./track.js";
import { view } from "./viewport.js";

export { MAX_DIM };

/** Finish live previews and transforms (for callers outside this module). */
export const settle = () => settleSessions();

const toast = (msg, kind = "info") => emit("toast", { msg, kind });

/* ============================== documents ================================= */

/**
 * Make `doc` the open document. `restored` marks a document brought back from
 * the autosave (a landing-page task must not be applied to it again).
 */
export function setDocument(doc, { fit = true, reason = "open", restored = false } = {}) {
  dropSessions();
  overlay.crop = null;
  overlay.marquee = null;
  overlay.transform = null;
  state.doc = doc;
  history.reset();
  markDirty(false);
  emit("doc", { reason, doc, restored });
  emit("layers", doc);
  emit("selection", doc);
  if (fit) view.fit();
  requestRender();
}

export function newDocument({ width, height, background = "#ffffff" }) {
  if (!confirmDiscard()) return false;
  const bg = background === "custom" ? cssColor(state.primary) : background;
  const { w, h } = clampSize(width, height);
  const doc = Doc.blank(w, h, bg);
  setDocument(doc);
  toast(t("New {w} × {h} document", { w: doc.width, h: doc.height }), "ok");
  track("new-document");
  return true;
}

export function confirmDiscard() {
  // a live preview or transform is unsaved work too, though nothing is
  // recorded (or marked dirty) until it is applied
  if ((!state.dirty && !sessionsBusy()) || !state.doc) return true;
  return window.confirm(
    t("You have unsaved changes in this document. Discard them and continue?")
  );
}

/**
 * A size this device can hold: at most MAX_DIM on a side and within the
 * canvas area limit, scaled down proportionally so the shape is kept.
 */
export function clampSize(width, height) {
  const w0 = Math.max(1, Math.round(Number(width) || 1));
  const h0 = Math.max(1, Math.round(Number(height) || 1));
  const k = fitScale(w0, h0);
  return {
    w: Math.max(1, Math.floor(w0 * k)),
    h: Math.max(1, Math.floor(h0 * k)),
    scaled: k < 1,
  };
}

/* ================================ import ================================= */

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "avif", "ico", "tif", "tiff"]);

const extOf = (file) => (file.name.match(/\.([^.]+)$/)?.[1] || "").toLowerCase();
const isHeic = (file) => /^image\/hei[cf]/.test(file.type) || ["heic", "heif"].includes(extOf(file));
const isPsd = (file) =>
  extOf(file) === "psd" || file.type === "image/vnd.adobe.photoshop" || file.type === "application/x-photoshop";

/** Anything the editor can open by dropping or picking it. */
export function isOpenable(file) {
  return (
    file.type.startsWith("image/") ||
    IMAGE_EXT.has(extOf(file)) ||
    isHeic(file) ||
    isPsd(file) ||
    extOf(file) === "paint"
  );
}

/** iPhone photos are sometimes renamed to .jpg: recognise HEIC by content. */
async function looksLikeHeic(file) {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const tag = String.fromCharCode(...head.slice(4, 12));
    // (not "mif1" alone: AVIF files carry that brand too)
    return /^ftyp(heic|heix|hevc|hevx|heim|heis)/.test(tag);
  } catch {
    return false;
  }
}

async function decodeFile(file) {
  const url = URL.createObjectURL(file);
  try {
    return await loadImage(url);
  } catch (err) {
    if (!isHeic(file) && !(await looksLikeHeic(file))) throw err;
  } finally {
    URL.revokeObjectURL(url);
  }
  // HEIC: Safari decodes natively above; everyone else gets a decoder on demand
  emit("busy", t("Decoding HEIC photo…"));
  try {
    const { decodeHeic } = await import("./heic.js");
    const png = await decodeHeic(file);
    const pngUrl = URL.createObjectURL(png);
    try {
      return await loadImage(pngUrl);
    } finally {
      URL.revokeObjectURL(pngUrl);
    }
  } finally {
    emit("busy", null);
  }
}

export async function openImageFile(file, { asLayer = false } = {}) {
  if (!file) return false;
  if (extOf(file) === "paint") return openProjectFile(file);
  if (isPsd(file)) return openPsdFile(file);
  if (!isOpenable(file)) {
    toast(t("That file is not an image"), "err");
    return false;
  }
  try {
    const img = await decodeFile(file);
    const name = file.name.replace(/\.[^.]+$/, "") || t("Image");
    if (asLayer && state.doc) {
      placeImage(img, name);
    } else {
      if (!confirmDiscard()) return false;
      const doc = docFromImage(img, name);
      setDocument(doc);
      toast(t("Opened {w} × {h} image", { w: doc.width, h: doc.height }), "ok");
    }
    // only known formats are counted: a file name never leaves the device
    const kind = isHeic(file) ? "heic" : IMAGE_EXT.has(extOf(file)) ? extOf(file) : "image";
    track(`open-${kind}`);
    return true;
  } catch (err) {
    console.error(err);
    toast(
      isHeic(file)
        ? t("Could not decode this HEIC photo — check your connection and try again")
        : t("Could not open that image"),
      "err"
    );
    return false;
  }
}

/** Reader errors with a translation; anything else gets a generic message. */
const PSD_ERRORS = new Set([
  "Not a Photoshop file",
  "PSB (large document) files are not supported",
  "Unknown PSD version",
  "CMYK PSD files are not supported",
  "Only RGB and grayscale PSD files are supported",
  "Only 8-, 16- and 32-bit PSD files are supported",
  "This PSD is too large to open in a browser",
  "This PSD uses compression that cannot be read here",
  "This PSD file is damaged",
]);

const layerCount = (n) =>
  tn(n, "Opened PSD with {n} layer", "Opened PSD with {n} layers", { n });

async function openPsdFile(file) {
  if (!confirmDiscard()) return false;
  emit("busy", t("Reading PSD…"));
  try {
    const { readPSD } = await import("./psd.js");
    const doc = await readPSD(await file.arrayBuffer(), {
      maxDim: MAX_DIM,
      maxPixels: maxCanvasPixels(),
    });
    doc.name = file.name.replace(/\.[^.]+$/, "") || t("Untitled");
    setDocument(doc);
    toast(
      doc.psdFlattened
        ? t("Opened the flattened PSD image — its layer data could not be read")
        : layerCount(doc.layers.length),
      doc.psdFlattened ? "info" : "ok"
    );
    if (doc.psdScaled) {
      toast(t("The PSD was too large for this device — scaled down to {w} × {h}", { w: doc.width, h: doc.height }), "info");
    }
    if (doc.psdSkipped > 0) {
      toast(t("Adjustment layers can't be edited here and were left out ({n})", { n: doc.psdSkipped }), "info");
    }
    track("open-psd");
    return true;
  } catch (err) {
    console.error(err);
    const msg = PSD_ERRORS.has(err?.message) ? t(err.message) : t("The file could not be read");
    toast(t("Could not read that PSD file: {msg}", { msg }), "err");
    return false;
  } finally {
    emit("busy", null);
  }
}

function docFromImage(img, name) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  // an SVG without width/height has no intrinsic size in some browsers
  if (!w || !h) {
    w = 1200;
    h = 900;
  }
  const scale = fitScale(w, h);
  const iw = w;
  const ih = h;
  w = Math.max(1, Math.floor(w * scale));
  h = Math.max(1, Math.floor(h * scale));
  const doc = new Doc(w, h);
  const layer = new Layer(w, h, { name });
  layer.ctx.drawImage(img, 0, 0, w, h);
  layer.touch();
  doc.layers.push(layer);
  doc.name = name;
  if (scale < 1) {
    toast(
      t("The image was too large for this device — scaled down from {iw} × {ih} to {w} × {h}", {
        iw,
        ih,
        w,
        h,
      }),
      "info"
    );
  }
  return doc;
}

/** Add an image to the current document as its own layer, scaled to fit. */
export function placeImage(img, name = t("Image")) {
  const doc = state.doc;
  if (!doc) return;
  let iw = img.naturalWidth || img.width;
  let ih = img.naturalHeight || img.height;
  // an SVG without width/height has no intrinsic size (as in docFromImage)
  if (!iw || !ih) {
    iw = 1200;
    ih = 900;
  }
  const scale = Math.min(1, doc.width / iw, doc.height / ih);
  const w = Math.round(iw * scale);
  const h = Math.round(ih * scale);
  const x = Math.round((doc.width - w) / 2);
  const y = Math.round((doc.height - h) / 2);

  editDoc(t("Place image"), () => {
    const layer = doc.addLayer({ name });
    layer.ctx.drawImage(img, x, y, w, h);
    layer.touch();
  });
  emit("layers", doc);
  requestRender();
  toast(t("Placed “{name}” as a new layer", { name }), "ok");
}

async function imageFromBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function pasteImage(source) {
  try {
    const img = source instanceof Blob ? await imageFromBlob(source) : source;
    if (!state.doc) {
      setDocument(docFromImage(img, t("Pasted")));
      toast(t("Pasted as a new document"), "ok");
      return true;
    }
    placeImage(img, t("Pasted"));
    return true;
  } catch (err) {
    console.error(err);
    toast(t("Nothing usable on the clipboard"), "err");
    return false;
  }
}

export async function pasteFromClipboard() {
  // the shortcut reads Ctrl+V outside Apple devices
  if (!navigator.clipboard?.read) {
    toast(platformKeys(t("Press ⌘V to paste an image")), "info");
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((ty) => ty.startsWith("image/"));
      if (type) {
        await pasteImage(await item.getType(type));
        return;
      }
    }
    toast(t("No image found on the clipboard"), "err");
  } catch {
    toast(platformKeys(t("Clipboard access was blocked — use ⌘V instead")), "err");
  }
}

export async function copyToClipboard() {
  const doc = state.doc;
  if (!doc) return;
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    toast(t("Copying is not available in this browser"), "err");
    return;
  }
  settleSessions();
  const canvas = selectionCanvas() || doc.renderFlat();
  // hand the clipboard a promise: Safari only accepts a write that starts
  // inside the click, before any await
  const blob = new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/png")
  );
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(t("Copied to clipboard"), "ok");
  } catch {
    toast(t("Copying is not available in this browser"), "err");
  }
}

/**
 * Pixels inside the selection, cropped to its bounds — of the whole picture
 * by default, or only of `layer` (as it shows, mask applied).
 */
function selectionCanvas({ layer = null } = {}) {
  const doc = state.doc;
  const sel = doc?.selection;
  if (!sel) return null;
  const b = sel.bounds;
  if (!b) return null;
  const out = makeCanvas(b.w, b.h);
  const c = ctx2d(out);
  c.drawImage(layer ? layer.maskedPixels() : doc.composite(), -b.x, -b.y);
  c.globalCompositeOperation = "destination-in";
  c.drawImage(sel.canvas, -b.x, -b.y);
  return out;
}

/* ================================ export ================================= */

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", psd: "psd" };

/**
 * The export size for a scale, kept within what this device can encode (the
 * scale slider goes to 400 %, which a big photo cannot reach).
 */
export function exportSize(scale = 1) {
  const doc = state.doc;
  if (!doc) return { w: 0, h: 0, scale };
  let w = Math.max(1, Math.round(doc.width * scale));
  let h = Math.max(1, Math.round(doc.height * scale));
  const area = w * h;
  const k = Math.min(
    1,
    16384 / Math.max(w, h),
    area > 4096 * 4096 ? Math.sqrt(maxCanvasPixels() / area) : 1
  );
  if (k < 1) {
    w = Math.max(1, Math.floor(w * k));
    h = Math.max(1, Math.floor(h * k));
  }
  return { w, h, limited: k < 1 };
}

export function exportCanvas({ scale = 1, format = "image/png" } = {}) {
  const doc = state.doc;
  if (!doc) return null;
  const flat = doc.renderFlat({
    background: format === "image/jpeg" ? "#ffffff" : null,
  });
  const { w, h } = exportSize(scale);
  if (w === doc.width && h === doc.height) return flat;
  const out = makeCanvas(w, h);
  const c = ctx2d(out);
  c.imageSmoothingQuality = "high";
  c.drawImage(flat, 0, 0, w, h);
  return out;
}

/** Encode the export without downloading it (size estimates, PSD). */
export async function exportBlob({ format = "image/png", quality = 0.92, scale = 1 } = {}) {
  const doc = state.doc;
  if (!doc) return null;
  if (format === "psd") {
    const { writePSD } = await import("./psd.js");
    return writePSD(doc);
  }
  const canvas = exportCanvas({ scale, format });
  if (!canvas) return null;
  return new Promise((r) => canvas.toBlob(r, format, quality));
}

/** Browsers without a WebP (or other) encoder silently hand back a PNG. */
export const encodedAs = (blob, format) =>
  format === "psd" || !blob?.type || blob.type === format;

let exporting = false;

export async function exportImage({
  format = "image/png",
  quality = 0.92,
  scale = 1,
  name = "paint-studio",
} = {}) {
  const doc = state.doc;
  if (!doc || exporting) return false;
  // an open text box or a live preview is part of what the user sees
  settleSessions();
  exporting = true;
  if (format === "psd") emit("busy", t("Writing PSD…"));
  let blob = null;
  try {
    blob = await exportBlob({ format, quality, scale });
  } catch (err) {
    console.error(err);
  } finally {
    exporting = false;
    if (format === "psd") emit("busy", null);
  }
  if (!blob) {
    toast(t("Export failed — try PNG"), "err");
    return false;
  }
  if (!encodedAs(blob, format)) {
    toast(t("This browser can't encode {fmt} — choose PNG or JPEG", { fmt: (EXT[format] || "").toUpperCase() }), "err");
    return false;
  }
  const ext = EXT[format] || "png";
  download(blob, `${sanitize(name)}.${ext}`);
  // a layered PSD keeps the work; a flat PNG/JPEG/WebP does not
  if (format === "psd") markDirty(false);
  const size = format === "psd" ? { w: doc.width, h: doc.height } : exportSize(scale);
  toast(t("Exported {w} × {h} {fmt}", { w: size.w, h: size.h, fmt: ext.toUpperCase() }), "ok");
  track(`export-${ext}`);
  emit("exported", { format });
  return true;
}

/**
 * The .paint file is built from parts — one data URL per layer — so a big
 * document never needs a single string larger than the browser allows.
 */
function projectBlob(doc) {
  const { layers, ...meta } = doc.toJSON();
  const head = JSON.stringify(meta);
  const parts = [`${head.slice(0, -1)}${head.length > 2 ? "," : ""}"layers":[`];
  layers.forEach((layer, i) => parts.push(`${i ? "," : ""}${JSON.stringify(layer)}`));
  parts.push("]}");
  return new Blob(parts, { type: "application/json" });
}

export function saveProject() {
  const doc = state.doc;
  if (!doc) return;
  settleSessions();
  try {
    download(projectBlob(doc), `${sanitize(doc.name)}.paint`);
  } catch (err) {
    console.error(err);
    toast(t("The project could not be saved — the document may be too large"), "err");
    return;
  }
  markDirty(false);
  toast(t("Project saved"), "ok");
  track("save-project");
}

/** Projects at least this big are read layer by layer (see readProject). */
const BIG_PROJECT = 64 * 1024 * 1024;

/**
 * Parse a .paint file. A project can be larger than the longest string a
 * browser can hold (about 512 MB) — projectBlob writes it in parts for that
 * reason — so a big file is never read as one string: the top-level "layers"
 * array is found by scanning the bytes, and each layer object is parsed on
 * its own when Doc.fromJSON gets to it.
 */
async function readProject(file) {
  if (file.size < BIG_PROJECT) return JSON.parse(await file.text());
  const found = await findLayers(file);
  if (!found) throw new Error("Not a Paint Studio project file");
  // everything else is small: parse it with an empty array in their place
  const rest = new Blob([file.slice(0, found.start), "[]", file.slice(found.end)]);
  const json = JSON.parse(await rest.text());
  if (json && typeof json === "object") {
    json.layers = (async function* () {
      for (const [a, b] of found.items) yield JSON.parse(await file.slice(a, b).text());
    })();
  }
  return json;
}

/**
 * Byte ranges of the top-level "layers" array of a JSON file and of every
 * object in it, found by reading the file in chunks while tracking strings,
 * escapes and nesting. JSON's structural characters are ASCII, which never
 * occurs inside a multi-byte UTF-8 sequence, so no decoding is needed.
 */
async function findLayers(file, chunk = 8 * 1024 * 1024) {
  const QUOTE = 34;
  const BACKSLASH = 92;
  let depth = 0;
  let inString = false;
  // the previous chunk ended on a backslash: skip the character it escapes
  let escaped = false;
  // where the string being read began, if it is a key of the top-level object
  let keyStart = -1;
  let key = null;
  // `"layers":` was just read, so an array starting now is the one
  let wantLayers = false;
  let start = -1;
  let item = -1;
  const items = [];
  for (let off = 0; off < file.size; off += chunk) {
    const bytes = new Uint8Array(await file.slice(off, off + chunk).arrayBuffer());
    let i = escaped ? 1 : 0;
    escaped = false;
    while (i < bytes.length) {
      if (inString) {
        // jump straight to the closing quote: a layer is mostly one long string
        const q = bytes.indexOf(QUOTE, i);
        const bs = bytes.subarray(i, q < 0 ? bytes.length : q).indexOf(BACKSLASH);
        if (bs >= 0) {
          i += bs + 2;
          if (i > bytes.length) escaped = true;
          continue;
        }
        if (q < 0) break;
        inString = false;
        if (keyStart >= 0) {
          const end = off + q;
          key = end - keyStart <= 64 ? await file.slice(keyStart, end).text() : null;
        }
        i = q + 1;
        continue;
      }
      const c = bytes[i];
      if (depth === 1 && c !== 32 && c !== 10 && c !== 13 && c !== 9) {
        if (c === 58) {
          // ":" after a key
          wantLayers = key === "layers";
          i++;
          continue;
        }
        if (c === 91 && wantLayers && start < 0) start = off + i;
        wantLayers = false;
      }
      if (c === QUOTE) {
        inString = true;
        keyStart = depth === 1 ? off + i + 1 : -1;
      } else if (c === 123 || c === 91) {
        // "{" or "[": a layer object starts directly inside the array
        if (c === 123 && depth === 2 && start >= 0) item = off + i;
        depth++;
      } else if (c === 125 || c === 93) {
        depth--;
        if (depth === 2 && item >= 0 && c === 125) {
          items.push([item, off + i + 1]);
          item = -1;
        } else if (depth === 1 && start >= 0 && c === 93) {
          return { start, end: off + i + 1, items };
        }
      }
      i++;
    }
  }
  return null;
}

export async function openProjectFile(file) {
  if (!file) return false;
  if (!confirmDiscard()) return false;
  emit("busy", t("Opening project…"));
  try {
    const doc = await Doc.fromJSON(await readProject(file));
    setDocument(doc);
    toast(t("Opened project “{name}”", { name: doc.name }), "ok");
    if (doc.scaledFrom) {
      toast(t("The project was too large for this device — scaled down to {w} × {h}", { w: doc.width, h: doc.height }), "info");
    }
    track("open-project");
    return true;
  } catch (err) {
    console.error(err);
    toast(t("That is not a valid .paint project"), "err");
    return false;
  } finally {
    emit("busy", null);
  }
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS Safari fetches the file only after its download sheet is answered:
  // revoking the URL early fails that with "WebKitBlobResource error 1"
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * A file name from a document name: only what file systems refuse goes
 * (\ / : * ? " < > |, control characters, dots and spaces at either end);
 * spaces (tabs too) become dashes.
 */
const sanitize = (s) =>
  String(s || "")
    .replace(/[\\/:*?"<>|]|(?!\s)\p{Cc}/gu, "")
    .replace(/^[.\s]+|[.\s]+$/g, "")
    .replace(/\s+/g, "-") || "untitled";

/* ================================ layers ================================= */

/**
 * Finish live sessions before a command on `layer` and return its index
 * afterwards, or -1 when it is gone. Finishing an open text box can add a
 * layer (and make it active) or delete an emptied one, so an index read
 * before it may name another layer: a command keeps acting on the layer the
 * user picked, and does nothing once that layer no longer exists.
 */
function settleLayer(layer) {
  const doc = state.doc;
  settleSessions();
  if (!layer || !doc || state.doc !== doc) return -1;
  return doc.layers.indexOf(layer);
}

export function addLayer() {
  const doc = state.doc;
  if (!doc) return;
  editDoc(t("New layer"), () => doc.addLayer());
  emit("layers", doc);
  requestRender();
}

export function duplicateLayer() {
  const doc = state.doc;
  if (!doc) return;
  const index = settleLayer(doc.active);
  if (index < 0) return;
  editDoc(t("Duplicate layer"), () => doc.duplicateLayer(index));
  emit("layers", doc);
  requestRender();
}

export function deleteLayer(index = state.doc?.activeIndex) {
  const doc = state.doc;
  const layer = doc?.layers[index];
  if (!layer) return;
  if (doc.layers.length <= 1) {
    toast(t("A document needs at least one layer"), "err");
    return;
  }
  // an emptied text box deletes its own layer when it is finished
  const at = settleLayer(layer);
  if (at < 0) return;
  if (doc.layers.length <= 1) {
    toast(t("A document needs at least one layer"), "err");
    return;
  }
  editDoc(t("Delete layer"), () => doc.removeLayer(at));
  emit("layers", doc);
  requestRender();
}

export function mergeDown() {
  const doc = state.doc;
  if (!doc) return;
  const index = settleLayer(doc.active);
  if (index < 0) return;
  if (index === 0) {
    toast(t("Nothing below this layer to merge into"), "err");
    return;
  }
  const below = doc.layers[index - 1];
  if (below.locked) {
    toast(t("The layer below is locked"), "err");
    return;
  }
  // the merged layer takes the lower one's visibility: everything would vanish
  if (!below.visible) {
    toast(t("The layer below is hidden"), "err");
    return;
  }
  editDoc(t("Merge down"), () => doc.mergeDown(index));
  emit("layers", doc);
  requestRender();
}

export function flattenImage() {
  const doc = state.doc;
  if (!doc) return;
  // an open text box becomes a layer of its own first: count it
  settleSessions();
  if (doc.layers.length === 1) return;
  editDoc(t("Flatten image"), () => doc.flatten());
  emit("layers", doc);
  requestRender();
}

/** Move the layer at `from` so that it ends up at index `to`. */
export function moveLayer(from, to) {
  const doc = state.doc;
  const layer = doc?.layers[from];
  if (!layer || from === to) return;
  // remember the place by its neighbours, which keep their order when
  // finishing a text box adds or removes a layer
  const others = doc.layers.filter((l) => l !== layer);
  const at = Math.max(0, Math.min(others.length, to));
  const above = others[at] || null;
  const below = others[at - 1] || null;
  const index = settleLayer(layer);
  if (index < 0) return;
  const rest = doc.layers.filter((l) => l !== layer);
  let target;
  if (above && rest.includes(above)) target = rest.indexOf(above);
  else if (below && rest.includes(below)) target = rest.indexOf(below) + 1;
  else if (!below) target = 0;
  else if (!above) target = rest.length;
  else return;
  if (target === index) return;
  editDoc(t("Reorder layers"), () => doc.moveLayer(index, target));
  emit("layers", doc);
  requestRender();
}

export function raiseLayer(delta) {
  const doc = state.doc;
  if (!doc) return;
  const to = doc.activeIndex + delta;
  if (to < 0 || to >= doc.layers.length) return;
  moveLayer(doc.activeIndex, to);
}

export function setActiveLayer(index, { mask } = {}) {
  const doc = state.doc;
  if (!doc) return;
  let layer = doc.layers[index];
  if (!layer) return;
  const wantMask = mask === undefined ? layer.editMask : !!mask && !!layer.mask;
  if (index === doc.activeIndex && wantMask === layer.editMask) return;
  // a preview or a transform belongs to the old target: keep its result
  const id = layer.id;
  settleSessions();
  index = doc.indexOfLayer(id);
  layer = doc.layers[index];
  if (!layer) return;
  doc.setActive(index);
  layer.editMask = wantMask && !!layer.mask;
  doc.invalidate();
  emit("layers", doc);
  emit("target", doc.target);
  requestRender();
}

/**
 * Visibility / opacity / blend / lock / name. Recorded as a lightweight
 * command (no bitmaps) and resolved by layer id so it survives other undos.
 */
export function setLayerProp(index, prop, value, label = t("Layer settings")) {
  const doc = state.doc;
  const layer = doc?.layers[index];
  if (!layer || layer[prop] === value) return;
  if (settleLayer(layer) < 0 || layer[prop] === value) return;
  const id = layer.id;
  const before = layer[prop];

  const apply = (v) => {
    const target = state.doc?.layers.find((l) => l.id === id);
    if (!target) return;
    target[prop] = v;
    state.doc.invalidate();
    emit("layers", state.doc);
    requestRender();
  };

  pushCommand({
    label,
    bytes: 0,
    undo: () => apply(before),
    redo: () => apply(value),
  });
  apply(value);
}

/** Live drag of the opacity slider: no history entry until the drag ends. */
export function previewLayerProp(index, prop, value) {
  const doc = state.doc;
  const layer = doc?.layers[index];
  if (!layer) return;
  layer[prop] = value;
  doc.invalidate();
  requestRender();
}

/* ================================ masks ================================== */

/** mode: "reveal" | "hide" | "selection" */
export function addMask(mode = state.doc?.selection ? "selection" : "reveal") {
  const doc = state.doc;
  const layer = doc?.active;
  if (!layer) return;
  if (layer.mask) {
    toast(t("This layer already has a mask"), "info");
    return;
  }
  if (layer.locked) {
    toast(t("This layer is locked"), "err");
    return;
  }
  if (settleLayer(layer) < 0 || layer.mask) return;
  editDoc(t("Add layer mask"), () => {
    let mask;
    if (mode === "selection" && doc.selection) {
      mask = makeMask(doc.width, doc.height, false);
      ctx2d(mask).drawImage(doc.selection.canvas, 0, 0);
    } else {
      mask = makeMask(doc.width, doc.height, mode !== "hide");
    }
    layer.setMask(mask);
    layer.maskEnabled = true;
    layer.editMask = true;
    layer.touch();
    if (mode === "selection") doc.setSelection(null);
  });
  emit("layers", doc);
  emit("selection", doc);
  emit("target", doc.target);
  requestRender();
  toast(t("Mask added — paint black to hide, white to reveal"), "ok");
  track("add-mask");
}

export function deleteMask() {
  const doc = state.doc;
  const layer = doc?.active;
  if (!layer?.mask) return;
  if (layer.locked) {
    toast(t("This layer is locked"), "err");
    return;
  }
  if (settleLayer(layer) < 0 || !layer.mask) return;
  editDoc(t("Delete layer mask"), () => {
    layer.setMask(null);
    layer.touch();
  });
  emit("layers", doc);
  emit("target", doc.target);
  requestRender();
}

export function applyLayerMask() {
  const doc = state.doc;
  const layer = doc?.active;
  if (!layer?.mask) return;
  if (layer.locked) {
    toast(t("This layer is locked"), "err");
    return;
  }
  if (settleLayer(layer) < 0 || !layer.mask) return;
  editDoc(t("Apply layer mask"), () => doc.applyMask(layer));
  emit("layers", doc);
  emit("target", doc.target);
  requestRender();
}

export function invertMask() {
  const doc = state.doc;
  const layer = doc?.active;
  if (!layer?.mask) return;
  if (layer.locked) {
    toast(t("This layer is locked"), "err");
    return;
  }
  if (settleLayer(layer) < 0 || !layer.mask) return;
  const target = layer.maskTarget;
  editPixels(
    t("Invert mask"),
    () => {
      const inv = makeMask(doc.width, doc.height, true);
      const c = ctx2d(inv);
      c.globalCompositeOperation = "destination-out";
      c.drawImage(layer.mask, 0, 0);
      const mc = target.ctx;
      mc.save();
      mc.globalCompositeOperation = "copy";
      mc.drawImage(inv, 0, 0);
      mc.restore();
      target.touch();
    },
    target
  );
  emit("layers", doc);
  requestRender();
}

export function toggleMaskEnabled(index = state.doc?.activeIndex) {
  const layer = state.doc?.layers[index];
  if (!layer?.mask) return;
  setLayerProp(
    index,
    "maskEnabled",
    !layer.maskEnabled,
    layer.maskEnabled ? t("Disable layer mask") : t("Enable layer mask")
  );
}

/* =============================== text layers ============================== */

const textName = (value) => {
  const line = value.trim().split("\n")[0];
  return line.length > 28 ? `${line.slice(0, 27)}…` : line || t("Text");
};

/** Create a new editable text layer above the active one. */
export function addTextLayer(text) {
  const doc = state.doc;
  if (!doc || !text.value.trim()) return;
  editDoc(t("Text"), () => {
    const layer = doc.addLayer({ name: textName(text.value) });
    layer.text = { ...text, color: { ...text.color } };
    layer.renderText();
  });
  emit("layers", doc);
  requestRender();
  track("text");
}

/** Re-render an existing text layer with new parameters (or remove it when empty). */
export function updateTextLayer(id, text) {
  const doc = state.doc;
  const index = doc?.indexOfLayer(id);
  if (index == null || index < 0) return;
  const layer = doc.layers[index];
  if (!text.value.trim()) {
    if (doc.layers.length > 1) {
      editDoc(t("Delete layer"), () => doc.removeLayer(index));
    } else {
      editDoc(t("Text"), () => {
        layer.text = null;
        layer.ctx.clearRect(0, 0, layer.width, layer.height);
        layer.touch();
      });
    }
  } else {
    editDoc(t("Edit text"), () => {
      layer.text = { ...text, color: { ...text.color } };
      layer.name = textName(text.value);
      layer.renderText();
    });
  }
  emit("layers", doc);
  requestRender();
}

/** Paint text straight into the target (used when the target is a mask). */
export function paintText(text) {
  const doc = state.doc;
  const target = doc?.target;
  if (!target || target.locked || !text.value.trim()) return;
  const buf = makeCanvas(doc.width, doc.height);
  drawText(ctx2d(buf), text);
  editPixels(t("Text"), () => paintMasked(target, buf, doc.selection, {}), target);
  emit("layers", doc);
  requestRender();
}

/* =============================== selection =============================== */

export function selectAll() {
  const doc = state.doc;
  if (!doc) return;
  editSelection(t("Select all"), () => doc.selectAll());
  requestRender();
}

export function deselect() {
  const doc = state.doc;
  if (!doc?.selection) return;
  editSelection(t("Deselect"), () => doc.setSelection(null));
  requestRender();
}

export function invertSelection() {
  const doc = state.doc;
  if (!doc) return;
  editSelection(t("Invert selection"), () => {
    doc.setSelection(doc.selection ? doc.selection.invert() : null);
  });
  requestRender();
}

export function clearSelectionPixels() {
  // a transform in progress moves the selection: settle it before reading
  settleSessions();
  const doc = state.doc;
  const target = doc?.target;
  if (!doc || !target) return;
  // without a selection this would wipe the whole layer on a stray keypress
  if (!doc.selection) {
    toast(t("Make a selection first"), "info");
    return;
  }
  if (target.locked) {
    toast(t("This layer is locked"), "err");
    return;
  }
  editPixels(
    t("Clear"),
    () => {
      const c = target.ctx;
      c.save();
      if (doc.selection) {
        c.globalCompositeOperation = "destination-out";
        c.drawImage(doc.selection.canvas, 0, 0);
      } else {
        c.clearRect(0, 0, doc.width, doc.height);
      }
      c.restore();
      target.touch();
    },
    target,
    doc.selection?.coverBounds || null
  );
  emit("layers", doc);
  requestRender();
}

export function fillSelection(which = "primary") {
  settleSessions();
  const doc = state.doc;
  const target = doc?.target;
  if (!doc || !target) return;
  if (target.locked) {
    toast(t("This layer is locked"), "err");
    return;
  }
  const paint = makeCanvas(doc.width, doc.height);
  const pc = ctx2d(paint);
  pc.fillStyle = cssColor(state[which]);
  pc.fillRect(0, 0, doc.width, doc.height);
  editPixels(
    t("Fill"),
    () => paintMasked(target, paint, doc.selection, {}),
    target,
    doc.selection?.coverBounds || null
  );
  emit("layers", doc);
  requestRender();
}

export function duplicateSelectionToLayer() {
  settleSessions();
  const doc = state.doc;
  if (!doc) return;
  // like "Layer via Copy": the active layer's pixels, not the whole picture
  const cut = selectionCanvas({ layer: doc.active });
  if (!cut) {
    toast(t("Make a selection first"), "err");
    return;
  }
  const b = doc.selection.bounds;
  editDoc(t("Selection to layer"), () => {
    const layer = doc.addLayer({ name: t("Selection") });
    layer.ctx.drawImage(cut, b.x, b.y);
    layer.touch();
  });
  emit("layers", doc);
  requestRender();
}

/* ================================ geometry =============================== */

export function cropTo(rect) {
  const doc = state.doc;
  if (!doc) return;
  editDoc(t("Crop"), () => doc.crop(rect));
  emit("layers", doc);
  emit("doc", { reason: "geometry" });
  view.fit();
  requestRender();
  toast(t("Cropped to {w} × {h}", { w: Math.round(rect.w), h: Math.round(rect.h) }), "ok");
  track("crop");
}

export function cropToSelection() {
  settleSessions();
  const doc = state.doc;
  const b = doc?.selection?.bounds;
  if (!b) {
    toast(t("Make a selection first"), "err");
    return;
  }
  cropTo(b);
}

export function trimTransparent() {
  settleSessions();
  const doc = state.doc;
  if (!doc) return;
  const flat = doc.composite();
  const { data } = flat.getContext("2d").getImageData(0, 0, doc.width, doc.height);
  let minX = doc.width,
    minY = doc.height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < doc.height; y++) {
    for (let x = 0; x < doc.width; x++) {
      if (data[(y * doc.width + x) * 4 + 3] > 2) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) {
    toast(t("Nothing to trim — the image is empty"), "err");
    return;
  }
  if (minX === 0 && minY === 0 && maxX === doc.width - 1 && maxY === doc.height - 1) {
    toast(t("No transparent border to trim"), "info");
    return;
  }
  cropTo({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
}

export function resizeImage(width, height) {
  const doc = state.doc;
  if (!doc) return;
  const { w, h, scaled } = clampSize(width, height);
  if (w === doc.width && h === doc.height) return;
  if (scaled) toast(t("That is larger than this device supports — using {w} × {h}", { w, h }), "info");
  editDoc(t("Image size"), () => doc.scaleImage(w, h));
  emit("layers", doc);
  emit("doc", { reason: "geometry" });
  view.fit();
  requestRender();
  toast(t("Resized to {w} × {h}", { w: doc.width, h: doc.height }), "ok");
  track("resize");
}

export function resizeCanvas(width, height, anchor = "center") {
  const doc = state.doc;
  if (!doc) return;
  const { w, h, scaled } = clampSize(width, height);
  if (w === doc.width && h === doc.height) return;
  if (scaled) toast(t("That is larger than this device supports — using {w} × {h}", { w, h }), "info");
  editDoc(t("Canvas size"), () => doc.resizeCanvas(w, h, anchor));
  emit("layers", doc);
  emit("doc", { reason: "geometry" });
  view.fit();
  requestRender();
  toast(t("Canvas is now {w} × {h}", { w: doc.width, h: doc.height }), "ok");
}

export function rotate(dir) {
  const doc = state.doc;
  if (!doc) return;
  editDoc(dir === 180 ? t("Rotate 180°") : t("Rotate 90°"), () => {
    if (dir === 180) doc.rotate180();
    else doc.rotate90(dir);
  });
  emit("layers", doc);
  emit("doc", { reason: "geometry" });
  view.fit();
  requestRender();
  track("rotate");
}

export function flip(axis) {
  const doc = state.doc;
  if (!doc) return;
  editDoc(axis === "h" ? t("Flip horizontal") : t("Flip vertical"), () => doc.flip(axis));
  emit("layers", doc);
  requestRender();
}

/* ============================== adjustments ============================== */

/**
 * The Adjust panel previews on the active layer. The session keeps the
 * original pixels so every slider move renders from them, and it is a live
 * session (see history.js): before anything else is recorded the preview is
 * applied as its own undo step, so it can never be lost or doubled.
 */
let adjustSession = null;
let adjustFrame = 0;
let pendingValues = null;

export const adjustValues = { ...ADJUST_DEFAULTS };

function resetAdjustValues() {
  Object.assign(adjustValues, ADJUST_DEFAULTS);
  emit("adjust", adjustValues);
}

function cancelAdjustFrame() {
  if (adjustFrame) cancelAnimationFrame(adjustFrame);
  adjustFrame = 0;
}

function ensureAdjustSession() {
  // other live work (a text box, a transform) is finished before the target
  // is read — finishing it can change which layer is active
  if (!adjustSession) settleSessions();
  const doc = state.doc;
  const target = doc?.target;
  if (!target) return null;
  if (target.locked) {
    toast(t("This layer is locked"), "err");
    return null;
  }
  if (target.isMask) {
    toast(t("Adjustments change layer pixels — click the layer thumbnail first"), "info");
    return null;
  }

  if (adjustSession) {
    if (adjustSession.layerId === target.id && adjustSession.version === target.version) {
      return adjustSession;
    }
    if (adjustSession.layerId !== target.id) {
      // another layer is the target now: the preview on the old one is kept
      // as its own step, and this layer starts fresh
      const keep = { ...adjustValues };
      finishAdjustments({ quiet: true });
      Object.assign(adjustValues, keep);
      emit("adjust", adjustValues);
    } else {
      // the pixels changed without going through history (should not
      // happen): start over from what is there now, never a stale original
      adjustSession.edit.dispose();
      adjustSession = null;
    }
  }

  const edit = beginPixelEdit(target);
  adjustSession = {
    layerId: target.id,
    edit,
    orig: edit.before,
    version: target.version,
  };
  return adjustSession;
}

function renderAdjust(session, values) {
  const doc = state.doc;
  const layer = doc.layers.find((l) => l.id === session.layerId);
  if (!layer) return;
  // the selection may have changed since the session began: use it as it is
  const region = doc.selection?.coverBounds || null;
  const processed = applyAdjustments(session.orig, values, region);
  const c = layer.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = "copy";
  c.drawImage(session.orig, 0, 0);
  c.restore();
  paintMasked(layer, processed, doc.selection, { replace: true });
  session.version = layer.version;
  doc.invalidate();
}

/**
 * Called on every slider input; the heavy pass runs once per frame. Returns
 * false when the target can't be adjusted (locked, a mask, no document).
 */
export function previewAdjustments(values) {
  Object.assign(adjustValues, values);
  const doc = state.doc;
  if (!doc) return false;
  const session = ensureAdjustSession();
  if (!session) {
    resetAdjustValues();
    return false;
  }
  pendingValues = { ...adjustValues };
  if (adjustFrame) return true;
  adjustFrame = requestAnimationFrame(() => {
    adjustFrame = 0;
    if (adjustSession !== session) return;
    renderAdjust(session, pendingValues);
    requestRender();
  });
  return true;
}

/** Bake the preview in as one undo step. Quiet when called by settle(). */
function finishAdjustments({ quiet = false } = {}) {
  const session = adjustSession;
  if (!session) return false;
  if (!hasAdjustments(adjustValues)) {
    rollbackAdjustments();
    return false;
  }
  // make sure the last slider position is baked in before committing
  if (adjustFrame) {
    cancelAdjustFrame();
    renderAdjust(session, adjustValues);
  }
  adjustSession = null;
  session.edit.commit(t("Adjustments"), state.doc?.selection?.coverBounds || null);
  resetAdjustValues();
  emit("layers", state.doc);
  requestRender();
  if (!quiet) toast(t("Adjustments applied"), "ok");
  track("adjust");
  return true;
}

function rollbackAdjustments() {
  cancelAdjustFrame();
  const session = adjustSession;
  adjustSession = null;
  if (session) session.edit.rollback();
  resetAdjustValues();
  requestRender();
}

export function commitAdjustments() {
  if (!adjustSession) {
    toast(t("Move a slider first"), "info");
    return;
  }
  finishAdjustments();
}

export function resetAdjustments() {
  rollbackAdjustments();
}

registerSession({
  settle: () => {
    if (adjustSession) finishAdjustments({ quiet: true });
  },
  cancel: () => {
    if (!adjustSession) return false;
    const visible = hasAdjustments(adjustValues);
    rollbackAdjustments();
    return visible;
  },
  drop: () => {
    cancelAdjustFrame();
    adjustSession?.edit.dispose();
    adjustSession = null;
    resetAdjustValues();
  },
  busy: () => !!adjustSession,
});

/* ============================ preview sessions ============================ */

let previewSession = null;

registerSession({
  settle: () => previewSession?.commit(),
  cancel: () => {
    if (!previewSession) return false;
    previewSession.cancel();
    return true;
  },
  drop: () => previewSession?.drop(),
  busy: () => !!previewSession,
});

/**
 * Live preview for dialog-driven edits (Levels, Curves). `update(produce)`
 * re-renders from the untouched original on the next frame — `produce`
 * receives that original (as grayscale for masks) and the selection bounds,
 * and returns the processed canvas; `update(null)` shows the original again
 * (the settings change nothing). commit() records one undo step, if anything
 * changed.
 */
export function beginPreview(label) {
  const doc = state.doc;
  if (!doc) return null;
  previewSession?.cancel();
  // other live work (a text box, a transform) is finished before the target
  // is read — finishing it can change which layer is active
  settleSessions();
  if (state.doc !== doc) return null;
  const target = doc.target;
  if (!target) return null;
  if (target.locked) {
    toast(t("This layer is locked"), "err");
    return null;
  }
  const edit = beginPixelEdit(target);
  const isMask = !!target.isMask;
  const orig = isMask ? maskToGray(edit.before) : edit.before;
  const region = doc.selection?.coverBounds || null;
  let frame = 0;
  let pending = null;
  let changed = false;
  let open = true;

  const render = () => {
    if (!open) return;
    const c = target.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "copy";
    c.drawImage(edit.before, 0, 0);
    c.restore();
    if (pending) {
      let processed = pending(orig, region);
      if (isMask) processed = grayToMask(processed);
      paintMasked(target, processed, doc.selection, { replace: true });
    } else {
      target.touch();
    }
    doc.invalidate();
    changed = !!pending;
    requestRender();
  };

  const close = () => {
    open = false;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (previewSession === session) previewSession = null;
  };

  const session = {
    orig,
    region,
    update(produce) {
      pending = produce || null;
      if (frame || !open) return;
      // nothing shown yet and nothing to show: no repaint needed
      if (!pending && !changed) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    },
    commit() {
      if (!open) return;
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        render();
      }
      close();
      if (!changed) {
        edit.rollback();
        return;
      }
      edit.commit(label, doc.selection?.coverBounds || null);
      emit("layers", doc);
      requestRender();
      toast(t("{label} applied", { label }), "ok");
    },
    cancel() {
      if (!open) return;
      close();
      edit.rollback();
      requestRender();
    },
    drop() {
      if (!open) return;
      close();
      edit.dispose();
    },
  };
  previewSession = session;
  return session;
}

/* ================================ filters ================================ */

/**
 * Run a synchronous, possibly slow operation. On large documents the busy
 * overlay is shown and the work is deferred by a frame so it can paint.
 */
export async function heavy(label, fn) {
  const doc = state.doc;
  const big = doc && doc.width * doc.height > 3_000_000;
  if (!big) return fn();
  emit("busy", label);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  try {
    return fn();
  } finally {
    emit("busy", null);
  }
}

let filtering = false;

/** True when `canvas` has no visible pixel inside `rect` (default: anywhere). */
function isClear(canvas, rect = null) {
  const r = rect || { x: 0, y: 0, w: canvas.width, h: canvas.height };
  const c = canvas.getContext("2d");
  // a strip at a time: a layer with content answers after the first one
  for (let y = r.y; y < r.y + r.h; y += 64) {
    const { data } = c.getImageData(r.x, y, r.w, Math.min(64, r.y + r.h - y));
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  }
  return true;
}

/** A copy of the `r` part of a canvas. */
function cropCanvas(src, r) {
  const out = makeCanvas(r.w, r.h);
  ctx2d(out).drawImage(src, -r.x, -r.y);
  return out;
}

/** Apply a filter to the paint target (inside the selection when there is one). */
export async function applyFilter(id, params = {}) {
  if (filtering) return false;
  // an open text box or transform becomes final first — it may change the target
  settleSessions();
  const doc = state.doc;
  const target = doc?.target;
  if (!doc || !target) return false;
  if (target.locked) {
    toast(t("This layer is locked"), "err");
    return false;
  }
  const effect = EFFECTS.find((e) => e.id === id);
  if (!effect) return false;
  // effects keep transparent pixels transparent: an empty layer stays as it is
  const cover = doc.selection?.coverBounds || null;
  if (!target.isMask && isClear(target.canvas, cover)) {
    toast(t("Nothing to apply the effect to — the area is empty"), "info");
    return false;
  }

  filtering = true;
  let done = false;
  try {
    done = await heavy(t("Applying {name}…", { name: effect.name }), () => {
      // the document or target may have changed while the busy overlay showed
      if (state.doc !== doc || doc.target !== target) return false;
      const isMask = !!target.isMask;
      const W = target.width;
      const H = target.height;
      const opts = { primary: state.primary, secondary: state.secondary, ...params };
      // inside a selection, an effect that only looks at nearby pixels runs
      // on the selected area and the margin it reads — the same result there
      const sel = doc.selection?.coverBounds;
      const area = sel ? effectArea(id, sel, W, H, opts) : null;
      // effects may work in place: never hand them the layer itself
      let src = area ? cropCanvas(target.canvas, area) : null;
      if (isMask) src = maskToGray(src || target.canvas);
      else src ||= copyCanvas(target.canvas);
      let out = applyEffect(id, src, area ? { ...opts, image: { width: W, height: H } } : opts);
      if (isMask) out = grayToMask(out);
      if (area) {
        const full = makeCanvas(W, H);
        ctx2d(full).drawImage(out, area.x, area.y);
        out = full;
      }
      editPixels(
        effect.name,
        () => paintMasked(target, out, doc.selection, { replace: true }),
        target,
        doc.selection?.coverBounds || null
      );
      return true;
    });
  } finally {
    filtering = false;
  }
  if (!done) return false;
  emit("layers", doc);
  requestRender();
  toast(t("{name} applied", { name: effect.name }), "ok");
  track(`filter-${id}`);
  return true;
}

/** doc → { key, canvas }: weak, so a closed document is not kept alive */
const thumbBases = new WeakMap();

/**
 * The picture shrunk to a w × h thumbnail (centred crop). The gallery shows
 * every effect on the same thumbnail, so the downscale of the full-size
 * composite runs once per change of the document, not once per effect.
 */
function previewBase(doc, w, h, scale) {
  const composite = doc.composite();
  const key = `${doc.compositeVersion}|${w}x${h}`;
  const cached = thumbBases.get(doc);
  if (cached?.key === key) return cached.canvas;
  if (cached) releaseCanvas(cached.canvas);
  const canvas = makeCanvas(w, h);
  const sw = w / scale;
  const sh = h / scale;
  ctx2d(canvas).drawImage(
    composite,
    (doc.width - sw) / 2,
    (doc.height - sh) / 2,
    sw,
    sh,
    0,
    0,
    w,
    h
  );
  thumbBases.set(doc, { key, canvas });
  return canvas;
}

/** Small preview of an effect for the filter gallery. */
export function filterPreview(id, w, h) {
  const doc = state.doc;
  if (!doc) return makeCanvas(w, h);
  const scale = Math.max(w / doc.width, h / doc.height);
  // effects may work in place: each gets its own copy of the shared base
  const base = copyCanvas(previewBase(doc, w, h, scale));
  if (!id) return base;
  return applyEffect(id, base, {
    primary: state.primary,
    secondary: state.secondary,
    preview: true,
    // radii are in document pixels: shrink them with the thumbnail
    scale: Math.min(1, scale),
  });
}

/* ================================= history ================================ */

/** Undo of a crop or resize changes the frame: fit the new size on screen. */
function refitIfResized(run) {
  const doc = state.doc;
  const before = doc ? `${doc.width}x${doc.height}` : "";
  const ok = run();
  if (doc && `${doc.width}x${doc.height}` !== before) {
    emit("doc", { reason: "geometry" });
    view.fit();
  }
  return ok;
}

export function undo() {
  // a stroke in progress finishes first; its undo comes after
  if (state.dragging) return;
  // a live preview is the most recent change: undo cancels just that
  if (cancelSessions()) {
    requestRender();
    return;
  }
  if (!refitIfResized(() => history.undo())) toast(t("Nothing to undo"), "info");
  requestRender();
}

export function redo() {
  if (state.dragging) return;
  const could = history.canRedo;
  cancelSessions();
  // finishing an open text box records it, which ends the redo branch: the
  // user saw something to redo, so no "nothing to redo" for that
  if (!history.canRedo) {
    if (!could) toast(t("Nothing to redo"), "info");
    requestRender();
    return;
  }
  refitIfResized(() => history.redo());
  requestRender();
}
