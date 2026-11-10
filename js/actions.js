/* ==========================================================================
   Application commands — everything the menus, panels and shortcuts invoke.
   UI modules stay presentational: they call into here and listen for events.
   ========================================================================== */

import { cssColor } from "./color.js";
import {
  Doc,
  Layer,
  copyCanvas,
  ctx2d,
  drawText,
  grayToMask,
  loadImage,
  makeCanvas,
  makeMask,
  maskToGray,
  paintMasked,
} from "./doc.js";
import {
  ADJUST_DEFAULTS,
  applyAdjustments,
  applyEffect,
  EFFECTS,
  hasAdjustments,
} from "./filters.js";
import {
  beginPixelEdit,
  editDoc,
  editPixels,
  editSelection,
  history,
} from "./history.js";
import { t } from "./i18n.js";
import { overlay, requestRender } from "./render.js";
import { emit, markDirty, state } from "./state.js";
import { track } from "./track.js";
import { view } from "./viewport.js";

export const MAX_DIM = 8000;

const toast = (msg, kind = "info") => emit("toast", { msg, kind });

/* ============================== documents ================================= */

export function setDocument(doc, { fit = true, reason = "open" } = {}) {
  endAdjustSession();
  overlay.crop = null;
  overlay.marquee = null;
  overlay.transform = null;
  state.doc = doc;
  history.reset();
  markDirty(false);
  emit("doc", { reason, doc });
  emit("layers", doc);
  emit("selection", doc);
  if (fit) view.fit();
  requestRender();
}

export function newDocument({ width, height, background = "#ffffff" }) {
  if (!confirmDiscard()) return false;
  const bg = background === "custom" ? cssColor(state.primary) : background;
  const doc = Doc.blank(clampDim(width), clampDim(height), bg);
  setDocument(doc);
  toast(t("New {w} × {h} document", { w: doc.width, h: doc.height }), "ok");
  track("new-document");
  return true;
}

export function confirmDiscard() {
  if (!state.dirty || !state.doc) return true;
  return window.confirm(
    t("You have unsaved changes in this document. Discard them and continue?")
  );
}

const clampDim = (v) => Math.max(1, Math.min(MAX_DIM, Math.round(v || 1)));

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

async function decodeFile(file) {
  const url = URL.createObjectURL(file);
  try {
    return await loadImage(url);
  } catch (err) {
    if (!isHeic(file)) throw err;
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
    track(`open-${isHeic(file) ? "heic" : extOf(file) || "image"}`);
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

async function openPsdFile(file) {
  if (!confirmDiscard()) return false;
  emit("busy", t("Reading PSD…"));
  try {
    const { readPSD } = await import("./psd.js");
    const doc = await readPSD(await file.arrayBuffer(), { maxDim: MAX_DIM });
    doc.name = file.name.replace(/\.[^.]+$/, "") || t("Untitled");
    setDocument(doc);
    toast(
      doc.psdFlattened
        ? t("Opened the flattened PSD image — its layer data could not be read")
        : t("Opened PSD with {n} layers", { n: doc.layers.length }),
      doc.psdFlattened ? "info" : "ok"
    );
    track("open-psd");
    return true;
  } catch (err) {
    console.error(err);
    toast(t("Could not read that PSD file: {msg}", { msg: t(err.message) }), "err");
    return false;
  } finally {
    emit("busy", null);
  }
}

function docFromImage(img, name) {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  if (scale < 1) {
    w = Math.round(w * scale);
    h = Math.round(h * scale);
    const resized = makeCanvas(w, h);
    ctx2d(resized).drawImage(img, 0, 0, w, h);
    const doc = new Doc(w, h);
    doc.layers.push(new Layer(w, h, { name, image: resized }));
    doc.name = name;
    toast(t("Image was very large — scaled down to 8000px"), "info");
    return doc;
  }
  const doc = Doc.fromImage(img, name);
  doc.name = name;
  return doc;
}

/** Add an image to the current document as its own layer, scaled to fit. */
export function placeImage(img, name = t("Image")) {
  const doc = state.doc;
  if (!doc) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
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

export async function pasteImage(source) {
  try {
    const img =
      source instanceof Blob ? await loadImage(URL.createObjectURL(source)) : source;
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
  if (!navigator.clipboard?.read) {
    toast(t("Press ⌘V / Ctrl+V to paste an image"), "info");
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
    toast(t("Clipboard access was blocked — use ⌘V instead"), "err");
  }
}

export async function copyToClipboard() {
  const doc = state.doc;
  if (!doc) return;
  try {
    const canvas = selectionCanvas() || doc.renderFlat();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast(t("Copied to clipboard"), "ok");
  } catch {
    toast(t("Copying is not available in this browser"), "err");
  }
}

/** Flattened pixels inside the selection, cropped to its bounds. */
function selectionCanvas() {
  const doc = state.doc;
  const sel = doc?.selection;
  if (!sel) return null;
  const b = sel.bounds;
  if (!b) return null;
  const out = makeCanvas(b.w, b.h);
  const c = ctx2d(out);
  c.drawImage(doc.composite(), -b.x, -b.y);
  c.globalCompositeOperation = "destination-in";
  c.drawImage(sel.canvas, -b.x, -b.y);
  return out;
}

/* ================================ export ================================= */

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", psd: "psd" };

export function exportCanvas({ scale = 1, format = "image/png" } = {}) {
  const doc = state.doc;
  if (!doc) return null;
  const flat = doc.renderFlat({
    background: format === "image/jpeg" ? "#ffffff" : null,
  });
  if (scale === 1) return flat;
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));
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

export async function exportImage({
  format = "image/png",
  quality = 0.92,
  scale = 1,
  name = "paint-studio",
} = {}) {
  const doc = state.doc;
  if (!doc) return;
  if (format === "psd") emit("busy", t("Writing PSD…"));
  let blob = null;
  try {
    blob = await exportBlob({ format, quality, scale });
  } catch (err) {
    console.error(err);
  } finally {
    if (format === "psd") emit("busy", null);
  }
  if (!blob) {
    toast(t("Export failed — try PNG"), "err");
    return;
  }
  const ext = EXT[format] || "png";
  download(blob, `${sanitize(name)}.${ext}`);
  markDirty(false);
  const w = format === "psd" ? doc.width : Math.max(1, Math.round(doc.width * scale));
  const h = format === "psd" ? doc.height : Math.max(1, Math.round(doc.height * scale));
  toast(t("Exported {w} × {h} {fmt}", { w, h, fmt: ext.toUpperCase() }), "ok");
  track(`export-${ext}`);
  emit("exported", { format });
}

export function saveProject() {
  const doc = state.doc;
  if (!doc) return;
  const json = JSON.stringify(doc.toJSON());
  download(new Blob([json], { type: "application/json" }), `${sanitize(doc.name)}.paint`);
  markDirty(false);
  toast(t("Project saved"), "ok");
  track("save-project");
}

export async function openProjectFile(file) {
  if (!file) return false;
  if (!confirmDiscard()) return false;
  try {
    const doc = await Doc.fromJSON(JSON.parse(await file.text()));
    setDocument(doc);
    toast(t("Opened project “{name}”", { name: doc.name }), "ok");
    track("open-project");
    return true;
  } catch (err) {
    console.error(err);
    toast(t("That is not a valid .paint project"), "err");
    return false;
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
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const sanitize = (s) =>
  (s || "untitled").trim().replace(/[^\p{L}\p{N}\-. ]+/gu, "").replace(/\s+/g, "-") ||
  "untitled";

/* ================================ layers ================================= */

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
  editDoc(t("Duplicate layer"), () => doc.duplicateLayer());
  emit("layers", doc);
  requestRender();
}

export function deleteLayer(index = state.doc?.activeIndex) {
  const doc = state.doc;
  if (!doc) return;
  if (doc.layers.length <= 1) {
    toast(t("A document needs at least one layer"), "err");
    return;
  }
  editDoc(t("Delete layer"), () => doc.removeLayer(index));
  emit("layers", doc);
  requestRender();
}

export function mergeDown() {
  const doc = state.doc;
  if (!doc) return;
  if (doc.activeIndex <= 0) {
    toast(t("Nothing below this layer to merge into"), "err");
    return;
  }
  editDoc(t("Merge down"), () => doc.mergeDown());
  emit("layers", doc);
  requestRender();
}

export function flattenImage() {
  const doc = state.doc;
  if (!doc || doc.layers.length === 1) return;
  editDoc(t("Flatten image"), () => doc.flatten());
  emit("layers", doc);
  requestRender();
}

export function moveLayer(from, to) {
  const doc = state.doc;
  if (!doc || from === to) return;
  editDoc(t("Reorder layers"), () => doc.moveLayer(from, to));
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
  const layer = doc.layers[index];
  if (!layer) return;
  const wantMask = mask === undefined ? layer.editMask : !!mask && !!layer.mask;
  if (index === doc.activeIndex && wantMask === layer.editMask) return;
  endAdjustSession();
  emit("before-target-change");
  doc.setActive(index);
  layer.editMask = wantMask;
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

  history.push({
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
  endAdjustSession();
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
  endAdjustSession();
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
  endAdjustSession();
  editDoc(t("Apply layer mask"), () => doc.applyMask(layer));
  emit("layers", doc);
  emit("target", doc.target);
  requestRender();
}

export function invertMask() {
  const doc = state.doc;
  const layer = doc?.active;
  if (!layer?.mask) return;
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
  const doc = state.doc;
  const target = doc?.target;
  if (!doc || !target) return;
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
    target
  );
  emit("layers", doc);
  requestRender();
}

export function fillSelection(which = "primary") {
  const doc = state.doc;
  const target = doc?.target;
  if (!doc || !target || target.locked) return;
  const paint = makeCanvas(doc.width, doc.height);
  const pc = ctx2d(paint);
  pc.fillStyle = cssColor(state[which]);
  pc.fillRect(0, 0, doc.width, doc.height);
  editPixels(t("Fill"), () => paintMasked(target, paint, doc.selection, {}), target);
  emit("layers", doc);
  requestRender();
}

export function duplicateSelectionToLayer() {
  const doc = state.doc;
  if (!doc) return;
  const cut = selectionCanvas();
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
  const doc = state.doc;
  const b = doc?.selection?.bounds;
  if (!b) {
    toast(t("Make a selection first"), "err");
    return;
  }
  cropTo(b);
}

export function trimTransparent() {
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
  editDoc(t("Image size"), () => doc.scaleImage(clampDim(width), clampDim(height)));
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
  editDoc(t("Canvas size"), () => doc.resizeCanvas(clampDim(width), clampDim(height), anchor));
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

let adjustSession = null;
let adjustFrame = 0;
let pendingValues = null;

export const adjustValues = { ...ADJUST_DEFAULTS };

function ensureAdjustSession() {
  const doc = state.doc;
  const target = doc?.target;
  if (!target || target.locked) return null;
  if (target.isMask) {
    toast(t("Adjustments change layer pixels — click the layer thumbnail first"), "info");
    return null;
  }

  if (adjustSession) {
    const same =
      adjustSession.layerId === target.id && adjustSession.version === target.version;
    if (same) return adjustSession;
    // the layer changed underneath us (a stroke, a filter): abandon the old
    // session without rolling back, so that work is never thrown away
    adjustSession = null;
  }

  const edit = beginPixelEdit(target);
  adjustSession = {
    layerId: target.id,
    edit,
    orig: edit.before,
    version: target.version,
    region: doc.selection?.bounds || null,
  };
  return adjustSession;
}

function renderAdjust(session, values) {
  const doc = state.doc;
  const layer = doc.layers.find((l) => l.id === session.layerId);
  if (!layer) return;
  const processed = applyAdjustments(session.orig, values, session.region);
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

/** Called on every slider input; the heavy pass runs once per frame. */
export function previewAdjustments(values) {
  Object.assign(adjustValues, values);
  const doc = state.doc;
  if (!doc) return;
  const session = ensureAdjustSession();
  if (!session) {
    Object.assign(adjustValues, ADJUST_DEFAULTS);
    emit("adjust", adjustValues);
    return;
  }
  pendingValues = { ...adjustValues };
  if (adjustFrame) return;
  adjustFrame = requestAnimationFrame(() => {
    adjustFrame = 0;
    renderAdjust(session, pendingValues);
    requestRender();
  });
}

export function commitAdjustments() {
  const session = adjustSession;
  if (!session) {
    toast(t("Move a slider first"), "info");
    return;
  }
  if (!hasAdjustments(adjustValues)) {
    resetAdjustments();
    return;
  }
  // make sure the last slider position is baked in before committing
  if (adjustFrame) {
    cancelAnimationFrame(adjustFrame);
    adjustFrame = 0;
    renderAdjust(session, adjustValues);
  }
  session.edit.commit(t("Adjustments"));
  adjustSession = null;
  Object.assign(adjustValues, ADJUST_DEFAULTS);
  emit("layers", state.doc);
  emit("adjust", adjustValues);
  requestRender();
  toast(t("Adjustments applied"), "ok");
  track("adjust");
}

export function resetAdjustments() {
  Object.assign(adjustValues, ADJUST_DEFAULTS);
  if (adjustSession) {
    adjustSession.edit.rollback();
    adjustSession = null;
  }
  emit("adjust", adjustValues);
  requestRender();
}

/** Drop the session without touching pixels (they are already committed). */
export function endAdjustSession() {
  if (adjustSession) {
    adjustSession.edit.rollback();
    adjustSession = null;
    Object.assign(adjustValues, ADJUST_DEFAULTS);
    emit("adjust", adjustValues);
  }
  if (adjustFrame) {
    cancelAnimationFrame(adjustFrame);
    adjustFrame = 0;
  }
}

/* ============================ preview sessions ============================ */

/**
 * Live preview for dialog-driven edits (Levels, Curves). `update(produce)`
 * re-renders from the untouched original on the next frame — `produce`
 * receives that original (as grayscale for masks) and the selection bounds,
 * and returns the processed canvas. commit() records one undo step.
 */
export function beginPreview(label) {
  const doc = state.doc;
  const target = doc?.target;
  if (!target) return null;
  if (target.locked) {
    toast(t("This layer is locked"), "err");
    return null;
  }
  endAdjustSession();
  const edit = beginPixelEdit(target);
  const isMask = !!target.isMask;
  const orig = isMask ? maskToGray(edit.before) : edit.before;
  const region = doc.selection?.bounds || null;
  let frame = 0;
  let pending = null;
  let changed = false;

  const render = () => {
    if (!pending) return;
    let processed = pending(orig, region);
    if (isMask) processed = grayToMask(processed);
    const c = target.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "copy";
    c.drawImage(edit.before, 0, 0);
    c.restore();
    paintMasked(target, processed, doc.selection, { replace: true });
    doc.invalidate();
    changed = true;
    requestRender();
  };

  return {
    orig,
    region,
    update(produce) {
      pending = produce;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        render();
      });
    },
    commit() {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        render();
      }
      if (!changed) {
        edit.rollback();
        return;
      }
      edit.commit(label);
      emit("layers", doc);
      requestRender();
      toast(t("{label} applied", { label }), "ok");
    },
    cancel() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      edit.rollback();
      requestRender();
    },
  };
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

/** Apply a filter to the paint target (inside the selection when there is one). */
export async function applyFilter(id, params = {}) {
  const doc = state.doc;
  const target = doc?.target;
  if (!doc || !target) return;
  if (target.locked) {
    toast(t("This layer is locked"), "err");
    return;
  }
  endAdjustSession();
  const effect = EFFECTS.find((e) => e.id === id);
  if (!effect) return;

  await heavy(t("Applying {name}…", { name: effect.name }), () => {
    const isMask = !!target.isMask;
    const src = isMask ? maskToGray(target.canvas) : copyCanvas(target.canvas);
    let out = applyEffect(id, src, {
      primary: state.primary,
      secondary: state.secondary,
      ...params,
    });
    if (isMask) out = grayToMask(out);
    editPixels(
      effect.name,
      () => paintMasked(target, out, doc.selection, { replace: true }),
      target
    );
  });
  emit("layers", doc);
  requestRender();
  toast(t("{name} applied", { name: effect.name }), "ok");
  track(`filter-${id}`);
}

/** Small preview of an effect for the filter gallery. */
export function filterPreview(id, w, h) {
  const doc = state.doc;
  const base = makeCanvas(w, h);
  const c = ctx2d(base);
  if (!doc) return base;
  const scale = Math.max(w / doc.width, h / doc.height);
  const sw = w / scale;
  const sh = h / scale;
  c.drawImage(
    doc.composite(),
    (doc.width - sw) / 2,
    (doc.height - sh) / 2,
    sw,
    sh,
    0,
    0,
    w,
    h
  );
  if (!id) return base;
  return applyEffect(id, base, {
    primary: state.primary,
    secondary: state.secondary,
    preview: true,
  });
}

/* ================================= history ================================ */

export function undo() {
  endAdjustSession();
  emit("before-history");
  if (!history.undo()) toast(t("Nothing to undo"), "info");
  requestRender();
}

export function redo() {
  endAdjustSession();
  emit("before-history");
  if (!history.redo()) toast(t("Nothing to redo"), "info");
  requestRender();
}
