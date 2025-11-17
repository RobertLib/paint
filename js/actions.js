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
  loadImage,
  makeCanvas,
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
import { overlay, requestRender } from "./render.js";
import { emit, markDirty, state } from "./state.js";
import { view } from "./viewport.js";

const MAX_DIM = 8000;

const toast = (msg, kind = "info") => emit("toast", { msg, kind });

/* ============================== documents ================================= */

export function setDocument(doc, { fit = true } = {}) {
  endAdjustSession();
  overlay.crop = null;
  overlay.marquee = null;
  state.doc = doc;
  history.reset();
  markDirty(false);
  emit("doc", { reason: "open", doc });
  emit("layers", doc);
  emit("selection", doc);
  if (fit) view.fit();
  requestRender();
}

export function newDocument({ width, height, background = "#ffffff" }) {
  if (!confirmDiscard()) return;
  const bg = background === "custom" ? cssColor(state.primary) : background;
  const doc = Doc.blank(clampDim(width), clampDim(height), bg);
  doc.name = "Untitled";
  setDocument(doc);
  toast(`New ${doc.width} × ${doc.height} document`, "ok");
}

export function confirmDiscard() {
  if (!state.dirty || !state.doc) return true;
  return window.confirm(
    "You have unsaved changes in this document. Discard them and continue?"
  );
}

const clampDim = (v) => Math.max(1, Math.min(MAX_DIM, Math.round(v || 1)));

/* ================================ import ================================= */

export async function openImageFile(file, { asLayer = false } = {}) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("That file is not an image", "err");
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const name = file.name.replace(/\.[^.]+$/, "") || "Image";
    if (asLayer && state.doc) placeImage(img, name);
    else {
      if (!confirmDiscard()) return;
      const doc = docFromImage(img, name);
      setDocument(doc);
      toast(`Opened ${doc.width} × ${doc.height} image`, "ok");
    }
  } catch (err) {
    console.error(err);
    toast("Could not open that image", "err");
  } finally {
    URL.revokeObjectURL(url);
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
    toast("Image was very large — scaled down to 8000px", "info");
    return doc;
  }
  const doc = Doc.fromImage(img, name);
  doc.name = name;
  return doc;
}

/** Add an image to the current document as its own layer, scaled to fit. */
export function placeImage(img, name = "Image") {
  const doc = state.doc;
  if (!doc) return;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, doc.width / iw, doc.height / ih);
  const w = Math.round(iw * scale);
  const h = Math.round(ih * scale);
  const x = Math.round((doc.width - w) / 2);
  const y = Math.round((doc.height - h) / 2);

  editDoc("Place image", () => {
    const layer = doc.addLayer({ name });
    layer.ctx.drawImage(img, x, y, w, h);
    layer.touch();
  });
  emit("layers", doc);
  requestRender();
  toast(`Placed “${name}” as a new layer`, "ok");
}

export async function pasteImage(source) {
  try {
    const img =
      source instanceof Blob ? await loadImage(URL.createObjectURL(source)) : source;
    if (!state.doc) {
      setDocument(docFromImage(img, "Pasted"));
      toast("Pasted as a new document", "ok");
      return true;
    }
    placeImage(img, "Pasted");
    return true;
  } catch (err) {
    console.error(err);
    toast("Nothing usable on the clipboard", "err");
    return false;
  }
}

export async function pasteFromClipboard() {
  if (!navigator.clipboard?.read) {
    toast("Press ⌘V / Ctrl+V to paste an image", "info");
    return;
  }
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith("image/"));
      if (type) {
        await pasteImage(await item.getType(type));
        return;
      }
    }
    toast("No image found on the clipboard", "err");
  } catch {
    toast("Clipboard access was blocked — use ⌘V instead", "err");
  }
}

export async function copyToClipboard() {
  const doc = state.doc;
  if (!doc) return;
  try {
    const canvas = selectionCanvas() || doc.renderFlat();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast("Copied to clipboard", "ok");
  } catch {
    toast("Copying is not available in this browser", "err");
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

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

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

export async function exportImage({
  format = "image/png",
  quality = 0.92,
  scale = 1,
  name = "paint-studio",
} = {}) {
  const canvas = exportCanvas({ scale, format });
  if (!canvas) return;
  const blob = await new Promise((r) => canvas.toBlob(r, format, quality));
  if (!blob) {
    toast("Export failed — try PNG", "err");
    return;
  }
  download(blob, `${sanitize(name)}.${EXT[format] || "png"}`);
  markDirty(false);
  toast(`Exported ${canvas.width} × ${canvas.height} ${EXT[format].toUpperCase()}`, "ok");
}

export function saveProject() {
  const doc = state.doc;
  if (!doc) return;
  const json = JSON.stringify(doc.toJSON());
  download(new Blob([json], { type: "application/json" }), `${sanitize(doc.name)}.paint`);
  markDirty(false);
  toast("Project saved", "ok");
}

export async function openProjectFile(file) {
  if (!file) return;
  if (!confirmDiscard()) return;
  try {
    const doc = await Doc.fromJSON(JSON.parse(await file.text()));
    setDocument(doc);
    toast(`Opened project “${doc.name}”`, "ok");
  } catch (err) {
    console.error(err);
    toast("That is not a valid .paint project", "err");
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
  (s || "untitled").trim().replace(/[^\w\-. ]+/g, "").replace(/\s+/g, "-") ||
  "untitled";

/* ================================ layers ================================= */

export function addLayer() {
  const doc = state.doc;
  if (!doc) return;
  editDoc("New layer", () => doc.addLayer({ name: `Layer ${doc.layers.length + 1}` }));
  emit("layers", doc);
  requestRender();
}

export function duplicateLayer() {
  const doc = state.doc;
  if (!doc) return;
  editDoc("Duplicate layer", () => doc.duplicateLayer());
  emit("layers", doc);
  requestRender();
}

export function deleteLayer(index = state.doc?.activeIndex) {
  const doc = state.doc;
  if (!doc) return;
  if (doc.layers.length <= 1) {
    toast("A document needs at least one layer", "err");
    return;
  }
  editDoc("Delete layer", () => doc.removeLayer(index));
  emit("layers", doc);
  requestRender();
}

export function mergeDown() {
  const doc = state.doc;
  if (!doc) return;
  if (doc.activeIndex <= 0) {
    toast("Nothing below this layer to merge into", "err");
    return;
  }
  editDoc("Merge down", () => doc.mergeDown());
  emit("layers", doc);
  requestRender();
}

export function flattenImage() {
  const doc = state.doc;
  if (!doc || doc.layers.length === 1) return;
  editDoc("Flatten image", () => doc.flatten());
  emit("layers", doc);
  requestRender();
}

export function moveLayer(from, to) {
  const doc = state.doc;
  if (!doc || from === to) return;
  editDoc("Reorder layers", () => doc.moveLayer(from, to));
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

export function setActiveLayer(index) {
  const doc = state.doc;
  if (!doc || index === doc.activeIndex) return;
  endAdjustSession();
  doc.setActive(index);
  emit("layers", doc);
  requestRender();
}

/**
 * Visibility / opacity / blend / lock / name. Recorded as a lightweight
 * command (no bitmaps) and resolved by layer id so it survives other undos.
 */
export function setLayerProp(index, prop, value, label = "Layer settings") {
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

/* =============================== selection =============================== */

export function selectAll() {
  const doc = state.doc;
  if (!doc) return;
  editSelection("Select all", () => doc.selectAll());
  requestRender();
}

export function deselect() {
  const doc = state.doc;
  if (!doc?.selection) return;
  editSelection("Deselect", () => doc.setSelection(null));
  requestRender();
}

export function invertSelection() {
  const doc = state.doc;
  if (!doc) return;
  editSelection("Invert selection", () => {
    doc.setSelection(doc.selection ? doc.selection.invert() : null);
  });
  requestRender();
}

export function clearSelectionPixels() {
  const doc = state.doc;
  const layer = doc?.active;
  if (!doc || !layer || layer.locked) return;
  editPixels(
    "Clear",
    () => {
      const c = layer.ctx;
      c.save();
      if (doc.selection) {
        c.globalCompositeOperation = "destination-out";
        c.drawImage(doc.selection.canvas, 0, 0);
      } else {
        c.clearRect(0, 0, doc.width, doc.height);
      }
      c.restore();
      layer.touch();
    },
    layer
  );
  emit("layers", doc);
  requestRender();
}

export function fillSelection(which = "primary") {
  const doc = state.doc;
  const layer = doc?.active;
  if (!doc || !layer || layer.locked) return;
  const paint = makeCanvas(doc.width, doc.height);
  const pc = ctx2d(paint);
  pc.fillStyle = cssColor(state[which]);
  pc.fillRect(0, 0, doc.width, doc.height);
  editPixels("Fill", () => paintMasked(layer, paint, doc.selection, {}), layer);
  emit("layers", doc);
  requestRender();
}

export function duplicateSelectionToLayer() {
  const doc = state.doc;
  if (!doc) return;
  const cut = selectionCanvas();
  if (!cut) {
    toast("Make a selection first", "err");
    return;
  }
  const b = doc.selection.bounds;
  editDoc("Selection to layer", () => {
    const layer = doc.addLayer({ name: "Selection" });
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
  editDoc("Crop", () => doc.crop(rect));
  emit("layers", doc);
  emit("doc", { reason: "geometry" });
  view.fit();
  requestRender();
  toast(`Cropped to ${Math.round(rect.w)} × ${Math.round(rect.h)}`, "ok");
}

export function cropToSelection() {
  const doc = state.doc;
  const b = doc?.selection?.bounds;
  if (!b) {
    toast("Make a selection first", "err");
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
    toast("Nothing to trim — the image is empty", "err");
    return;
  }
  if (minX === 0 && minY === 0 && maxX === doc.width - 1 && maxY === doc.height - 1) {
    toast("No transparent border to trim", "info");
    return;
  }
  cropTo({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 });
}

export function resizeImage(width, height) {
  const doc = state.doc;
  if (!doc) return;
  editDoc("Image size", () => doc.scaleImage(clampDim(width), clampDim(height)));
  emit("layers", doc);
  emit("doc", { reason: "geometry" });
  view.fit();
  requestRender();
  toast(`Resized to ${doc.width} × ${doc.height}`, "ok");
}

export function resizeCanvas(width, height, anchor = "center") {
  const doc = state.doc;
  if (!doc) return;
  editDoc("Canvas size", () => doc.resizeCanvas(clampDim(width), clampDim(height), anchor));
  emit("layers", doc);
  emit("doc", { reason: "geometry" });
  view.fit();
  requestRender();
  toast(`Canvas is now ${doc.width} × ${doc.height}`, "ok");
}

export function rotate(dir) {
  const doc = state.doc;
  if (!doc) return;
  editDoc(dir === 180 ? "Rotate 180°" : "Rotate 90°", () => {
    if (dir === 180) doc.rotate180();
    else doc.rotate90(dir);
  });
  emit("layers", doc);
  emit("doc", { reason: "geometry" });
  view.fit();
  requestRender();
}

export function flip(axis) {
  const doc = state.doc;
  if (!doc) return;
  editDoc(axis === "h" ? "Flip horizontal" : "Flip vertical", () => doc.flip(axis));
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
  const layer = doc?.active;
  if (!layer || layer.locked) return null;

  if (adjustSession) {
    const same =
      adjustSession.layerId === layer.id &&
      adjustSession.version === layer.version;
    if (same) return adjustSession;
    // the layer changed underneath us (a stroke, a filter): abandon the old
    // session without rolling back, so that work is never thrown away
    adjustSession = null;
  }

  const edit = beginPixelEdit(layer);
  adjustSession = {
    layerId: layer.id,
    edit,
    orig: edit.before,
    version: layer.version,
    region: doc.selection?.bounds || null,
  };
  return adjustSession;
}

/** Called on every slider input; the heavy pass runs once per frame. */
export function previewAdjustments(values) {
  Object.assign(adjustValues, values);
  const doc = state.doc;
  if (!doc) return;
  const session = ensureAdjustSession();
  if (!session) return;
  pendingValues = { ...adjustValues };
  if (adjustFrame) return;
  adjustFrame = requestAnimationFrame(() => {
    adjustFrame = 0;
    const v = pendingValues;
    const layer = doc.layers.find((l) => l.id === session.layerId);
    if (!layer) return;
    const processed = applyAdjustments(session.orig, v, session.region);
    const c = layer.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = "copy";
    c.drawImage(session.orig, 0, 0);
    c.restore();
    paintMasked(layer, processed, doc.selection, { replace: true });
    session.version = layer.version;
    doc.invalidate();
    requestRender();
  });
}

export function commitAdjustments() {
  const session = adjustSession;
  if (!session) {
    toast("Move a slider first", "info");
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
    const doc = state.doc;
    const layer = doc.layers.find((l) => l.id === session.layerId);
    if (layer) {
      const processed = applyAdjustments(session.orig, adjustValues, session.region);
      const c = layer.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = "copy";
      c.drawImage(session.orig, 0, 0);
      c.restore();
      paintMasked(layer, processed, doc.selection, { replace: true });
      session.version = layer.version;
    }
  }
  session.edit.commit("Adjustments");
  adjustSession = null;
  Object.assign(adjustValues, ADJUST_DEFAULTS);
  emit("layers", state.doc);
  emit("adjust", adjustValues);
  requestRender();
  toast("Adjustments applied", "ok");
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

/* ================================ filters ================================ */

/**
 * Run a synchronous, possibly slow operation. On large documents the busy
 * overlay is shown and the work is deferred by a frame so it can paint.
 */
async function heavy(label, fn) {
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

export async function applyFilter(id) {
  const doc = state.doc;
  const layer = doc?.active;
  if (!doc || !layer) return;
  if (layer.locked) {
    toast("This layer is locked", "err");
    return;
  }
  endAdjustSession();
  const effect = EFFECTS.find((e) => e.id === id);
  if (!effect) return;

  await heavy(`Applying ${effect.name}…`, () => {
    const src = copyCanvas(layer.canvas);
    const out = applyEffect(id, src, {
      primary: state.primary,
      secondary: state.secondary,
    });
    editPixels(
      effect.name,
      () => paintMasked(layer, out, doc.selection, { replace: true }),
      layer
    );
  });
  emit("layers", doc);
  requestRender();
  toast(`${effect.name} applied`, "ok");
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
  });
}

/* ================================= history ================================ */

export function undo() {
  endAdjustSession();
  if (!history.undo()) toast("Nothing to undo", "info");
  requestRender();
}

export function redo() {
  endAdjustSession();
  if (!history.redo()) toast("Nothing to redo", "info");
  requestRender();
}
