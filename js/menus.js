/* ==========================================================================
   Menus, dialogs, keyboard shortcuts and file drag-and-drop.
   ========================================================================== */

import * as A from "./actions.js";
import { clamp } from "./color.js";
import { history } from "./history.js";
import { LANGS, lang, platformKeys, saveLang, t } from "./i18n.js";
import { overlay, requestRender } from "./render.js";
import { emit, on, opt, setOpt, setTheme, setTool, state, swapColors } from "./state.js";
import { openCurves, openLevels } from "./tone.js";
import { TOOL_LIST, TOOLS, isTypingTarget } from "./tools.js";
import { MOD, icon, openTab } from "./ui.js";
import { view } from "./viewport.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SIZE_PRESETS = [
  { name: t("HD"), w: 1920, h: 1080 },
  { name: t("Square post"), w: 1080, h: 1080 },
  { name: t("Story"), w: 1080, h: 1920 },
  { name: t("Social card"), w: 1200, h: 630 },
  { name: t("A4 · 300 dpi"), w: 2480, h: 3508 },
  { name: t("Classic"), w: 800, h: 600 },
];

/** Landing pages live one level up; the Czech ones under /cs/. */
export const SITE_HOME = lang === "cs" ? "../cs/" : "../";

/**
 * Browsers keep Ctrl/⌘+N and Ctrl/⌘+Shift+N for new windows — a page never
 * sees them. An installed app window does, so the app offers both: ⌘N there,
 * ⌥N (which always works) in a browser tab.
 */
const STANDALONE = window.matchMedia?.("(display-mode: standalone)").matches ?? false;
const KEY_NEW = STANDALONE ? `${MOD}N` : "⌥N";
const KEY_NEW_LAYER = STANDALONE ? `⇧${MOD}N` : "⇧⌥N";

/* ================================== menus ================================= */

function startTransform() {
  if (!state.doc) return;
  if (state.tool === "transform") TOOLS.transform._begin();
  else setTool("transform");
}

const MENUS = [
  {
    name: t("File"),
    items: () => [
      { label: t("New…"), keys: KEY_NEW, icon: "i-file", run: openNewDialog },
      { label: t("Open image…"), keys: `${MOD}O`, icon: "i-image", run: () => $("#imageInput").click() },
      { label: t("Open project…"), icon: "i-folder", run: () => $("#projectInput").click() },
      { label: t("Restore previous session…"), icon: "i-undo", run: () => emit("show-sessions") },
      { divider: true },
      { label: t("Save project"), keys: `${MOD}S`, icon: "i-save", run: A.saveProject, enabled: !!state.doc },
      { label: t("Export image…"), keys: `⇧${MOD}E`, icon: "i-download", run: openExportDialog, enabled: !!state.doc },
      { divider: true },
      { label: t("Copy"), keys: `${MOD}C`, icon: "i-copy", run: A.copyToClipboard, enabled: !!state.doc },
      { label: t("Paste"), keys: `${MOD}V`, icon: "i-paste", run: A.pasteFromClipboard },
    ],
  },
  {
    name: t("Edit"),
    items: () => [
      { label: t("Undo"), keys: `${MOD}Z`, icon: "i-undo", run: A.undo, enabled: history.canUndo },
      { label: t("Redo"), keys: `⇧${MOD}Z`, icon: "i-redo", run: A.redo, enabled: history.canRedo },
      { divider: true },
      { label: t("Free transform"), keys: `⌥${MOD}T`, icon: "i-transform", run: startTransform, enabled: !!state.doc },
      { divider: true },
      { label: t("Select all"), keys: `${MOD}A`, icon: "i-select-rect", run: A.selectAll, enabled: !!state.doc },
      { label: t("Deselect"), keys: `${MOD}D`, run: A.deselect, enabled: !!state.doc?.selection },
      { label: t("Invert selection"), keys: `⇧${MOD}I`, run: A.invertSelection, enabled: !!state.doc?.selection },
      { divider: true },
      { label: t("Fill with primary"), keys: "⌥⌫", icon: "i-bucket", run: () => A.fillSelection("primary"), enabled: !!state.doc },
      { label: t("Delete selected pixels"), keys: "⌫", icon: "i-trash", run: A.clearSelectionPixels, enabled: !!state.doc?.selection },
      { label: t("Selection to new layer"), keys: `⇧${MOD}J`, icon: "i-layers", run: A.duplicateSelectionToLayer, enabled: !!state.doc?.selection },
    ],
  },
  {
    name: t("Image"),
    items: () => [
      { label: t("Image size…"), icon: "i-frame", run: () => openResizeDialog("image"), enabled: !!state.doc },
      { label: t("Canvas size…"), icon: "i-grid", run: () => openResizeDialog("canvas"), enabled: !!state.doc },
      { divider: true },
      { label: t("Crop to selection"), icon: "i-crop", run: A.cropToSelection, enabled: !!state.doc?.selection },
      { label: t("Trim transparent edges"), run: A.trimTransparent, enabled: !!state.doc },
      { divider: true },
      { label: t("Rotate 90° right"), icon: "i-rotate-cw", run: () => A.rotate(1), enabled: !!state.doc },
      { label: t("Rotate 90° left"), icon: "i-rotate-ccw", run: () => A.rotate(-1), enabled: !!state.doc },
      { label: t("Rotate 180°"), run: () => A.rotate(180), enabled: !!state.doc },
      { label: t("Flip horizontal"), icon: "i-flip-h", run: () => A.flip("h"), enabled: !!state.doc },
      { label: t("Flip vertical"), icon: "i-flip-v", run: () => A.flip("v"), enabled: !!state.doc },
    ],
  },
  {
    name: t("Layer"),
    items: () => {
      const layer = state.doc?.active;
      const hasMask = !!layer?.mask;
      return [
        { label: t("New layer"), keys: KEY_NEW_LAYER, icon: "i-plus", run: A.addLayer, enabled: !!state.doc },
        { label: t("Duplicate layer"), keys: `${MOD}J`, icon: "i-copy", run: A.duplicateLayer, enabled: !!state.doc },
        { label: t("Delete layer"), icon: "i-trash", run: () => A.deleteLayer(), enabled: (state.doc?.layers.length || 0) > 1 },
        { divider: true },
        { label: t("Add mask (reveal all)"), icon: "i-mask", run: () => A.addMask("reveal"), enabled: !!layer && !hasMask },
        { label: t("Add mask from selection"), run: () => A.addMask("selection"), enabled: !!layer && !hasMask && !!state.doc?.selection },
        { label: t("Invert mask"), run: A.invertMask, enabled: hasMask },
        { label: layer?.maskEnabled === false ? t("Enable mask") : t("Disable mask"), run: () => A.toggleMaskEnabled(), enabled: hasMask },
        { label: t("Apply mask"), run: A.applyLayerMask, enabled: hasMask },
        { label: t("Delete mask"), run: A.deleteMask, enabled: hasMask },
        { divider: true },
        { label: t("Merge down"), keys: `${MOD}E`, icon: "i-merge", run: A.mergeDown, enabled: (state.doc?.activeIndex || 0) > 0 && !state.doc?.layers[state.doc.activeIndex - 1]?.locked },
        { label: t("Flatten image"), icon: "i-layers", run: A.flattenImage, enabled: (state.doc?.layers.length || 0) > 1 },
        { divider: true },
        { label: t("Bring forward"), run: () => A.raiseLayer(1), enabled: !!state.doc },
        { label: t("Send backward"), run: () => A.raiseLayer(-1), enabled: !!state.doc },
      ];
    },
  },
  {
    name: t("Adjust"),
    items: () => [
      { label: t("Adjustments panel"), icon: "i-sliders", run: () => openTab("adjust") },
      { label: t("Filter gallery"), icon: "i-sparkles", run: () => openTab("filters") },
      { divider: true },
      { label: t("Levels…"), keys: `${MOD}L`, icon: "i-levels", run: openLevels, enabled: !!state.doc },
      { label: t("Curves…"), keys: `${MOD}M`, icon: "i-curves", run: openCurves, enabled: !!state.doc },
      { label: t("Auto levels"), run: () => openLevels({ auto: true, apply: true }), enabled: !!state.doc },
      { divider: true },
      { label: t("Auto contrast"), run: () => quickAdjust({ contrast: 18, clarity: 12 }), enabled: !!state.doc },
      { label: t("Warm up"), run: () => quickAdjust({ temperature: 22, saturation: 8 }), enabled: !!state.doc },
      { label: t("Cool down"), run: () => quickAdjust({ temperature: -22 }), enabled: !!state.doc },
      { label: t("Punchy"), run: () => quickAdjust({ contrast: 14, vibrance: 24, clarity: 18 }), enabled: !!state.doc },
    ],
  },
  {
    name: t("View"),
    items: () => [
      { label: t("Zoom in"), keys: `${MOD}+`, run: () => view.zoomStep(1) },
      { label: t("Zoom out"), keys: `${MOD}−`, run: () => view.zoomStep(-1) },
      { label: t("Fit on screen"), keys: `${MOD}0`, icon: "i-fit", run: () => view.fit() },
      { label: t("Actual pixels"), keys: `${MOD}1`, run: () => view.actualSize() },
      { divider: true },
      {
        label: state.theme === "dark" ? t("Light theme") : t("Dark theme"),
        icon: state.theme === "dark" ? "i-sun" : "i-moon",
        run: () => setTheme(state.theme === "dark" ? "light" : "dark"),
      },
      {
        label: t("Toggle panels"),
        icon: "i-panel",
        run: togglePanels,
      },
      { divider: true },
      ...LANGS.map(([code, name]) => ({
        label: name,
        icon: code === lang ? "i-check" : null,
        run: () => switchLanguage(code),
      })),
    ],
  },
  {
    name: t("Help"),
    items: () => [
      { label: t("Keyboard shortcuts"), keys: "?", icon: "i-help", run: openShortcuts },
      { label: t("All tools and guides"), icon: "i-sparkles", run: () => window.open(SITE_HOME, "_blank", "noopener") },
      {
        label: t("Source code on GitHub"),
        icon: "i-file",
        run: () => window.open("https://github.com/RobertLib/paint", "_blank", "noopener"),
      },
    ],
  },
];

/** Reload in another language; the autosave brings the document back. */
async function switchLanguage(code) {
  if (code === lang) return;
  let saved = true;
  if (state.doc) {
    const { flushAutosave } = await import("./autosave.js");
    saved = await flushAutosave();
    if (
      !saved &&
      !window.confirm(
        t("This document could not be kept for the reload (it may be too large). Switch the language anyway and lose it?")
      )
    ) {
      return;
    }
  }
  saveLang(code);
  const url = new URL(location.href);
  url.searchParams.set("lang", code);
  if (state.doc && saved) url.searchParams.set("restore", "1");
  else url.searchParams.delete("restore");
  url.searchParams.delete("task");
  // the document is safe in the autosave: no "leave page?" prompt
  state.dirty = false;
  location.href = url.toString();
}

function quickAdjust(values) {
  if (!A.previewAdjustments(values)) return;
  emit("adjust", A.adjustValues);
  openTab("adjust");
  A.commitAdjustments();
}

function buildMenubar() {
  const bar = $("#menubar");
  bar.innerHTML = MENUS.map(
    (m, i) => `<button class="menu-btn" data-menu="${i}">${m.name}</button>`
  ).join("");

  let openIndex = null;

  const close = () => {
    $("#menuPopover").hidden = true;
    $$(".menu-btn", bar).forEach((b) => b.classList.remove("is-open"));
    openIndex = null;
  };

  const open = (index, btn) => {
    const menu = MENUS[index];
    if (!menu) return;
    const items = menu.items();
    const pop = $("#menuPopover");
    pop.innerHTML = items
      .map((item, i) =>
        item.divider
          ? `<div class="menu-divider"></div>`
          : `<button class="menu-item" data-item="${i}"${
              item.enabled === false ? " disabled" : ""
            }>${item.icon ? icon(item.icon) : `<span class="icon"></span>`}
               <span>${item.label}</span>
               ${item.keys ? `<span class="keys">${platformKeys(item.keys)}</span>` : ""}
             </button>`
      )
      .join("");
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(4, Math.min(r.left, innerWidth - pop.offsetWidth - 8))}px`;
    pop.style.top = `${r.bottom + 4}px`;
    $$(".menu-btn", bar).forEach((b) => b.classList.toggle("is-open", b === btn));
    openIndex = index;

    pop.onclick = (e) => {
      const el = e.target.closest("[data-item]");
      if (!el) return;
      const item = items[Number(el.dataset.item)];
      close();
      item?.run?.();
    };
  };

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-menu]");
    if (!btn) return;
    const index = Number(btn.dataset.menu);
    if (openIndex === index) close();
    else open(index, btn);
  });

  bar.addEventListener("pointerover", (e) => {
    const btn = e.target.closest("[data-menu]");
    if (btn && openIndex !== null && openIndex !== Number(btn.dataset.menu)) {
      open(Number(btn.dataset.menu), btn);
    }
  });

  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#menuPopover") && !e.target.closest("#menubar")) close();
  });
  window.addEventListener("keydown", (e) => {
    // Escape closes the menu — and only the menu, not the selection under it
    if (e.key === "Escape" && openIndex !== null) {
      close();
      e.stopImmediatePropagation();
    }
  });

  // tasks can open a menu programmatically
  on("open-menu", (index) => {
    const btn = $(`[data-menu="${index}"]`, bar);
    if (btn) open(index, btn);
  });
}

/* ================================= dialogs ================================ */

export function wireDialog(dialog, { canClose = () => true } = {}) {
  $$("[data-close]", dialog).forEach((btn) =>
    btn.addEventListener("click", () => dialog.close())
  );
  // a click on the backdrop closes — but only one that started there too:
  // releasing a slider or a text selection outside the box is not a click
  // on the backdrop
  let downOutside = false;
  const outside = (e) => {
    if (e.target !== dialog) return false;
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  dialog.addEventListener("pointerdown", (e) => {
    downOutside = outside(e);
  });
  dialog.addEventListener("click", (e) => {
    if (downOutside && outside(e) && canClose()) dialog.close();
    downOutside = false;
  });
}

/**
 * True while a modal dialog covers the document: any dialog — the welcome
 * screen too once it is shown over a document (Restore previous session…).
 */
export const modalOpen = () =>
  !!document.querySelector("dialog[open]:not(#welcomeDialog)") ||
  (!!state.doc && !!document.getElementById("welcomeDialog")?.open);

/* --- new document --- */

function presetChips(host, onPick) {
  host.innerHTML = SIZE_PRESETS.map(
    (p) =>
      `<button class="preset-chip" data-w="${p.w}" data-h="${p.h}">
         <strong>${p.name}</strong><span>${p.w} × ${p.h}</span>
       </button>`
  ).join("");
  host.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-w]");
    if (chip) onPick(Number(chip.dataset.w), Number(chip.dataset.h));
  });
}

function openNewDialog() {
  const dialog = $("#newDocDialog");
  if (state.doc) {
    $("#newDocW").value = String(state.doc.width);
    $("#newDocH").value = String(state.doc.height);
  }
  dialog.showModal();
}

function initNewDialog() {
  const dialog = $("#newDocDialog");
  wireDialog(dialog);
  presetChips($("#newDocPresets"), (w, h) => {
    $("#newDocW").value = String(w);
    $("#newDocH").value = String(h);
  });
  $("#newDocCreate").addEventListener("click", () => {
    const bg = $('#newDocBg input:checked').value;
    A.newDocument({
      width: Number($("#newDocW").value),
      height: Number($("#newDocH").value),
      background: bg,
    });
    dialog.close();
    $("#welcomeDialog").close();
  });
}

/* --- resize --- */

let resizeMode = "image";
let resizeAnchor = "center";
const ANCHORS = [
  "top-left", "top", "top-right",
  "left", "center", "right",
  "bottom-left", "bottom", "bottom-right",
];

function openResizeDialog(mode) {
  const doc = state.doc;
  if (!doc) return;
  resizeMode = mode;
  $("#resizeTitle").textContent = mode === "image" ? t("Image size") : t("Canvas size");
  $("#resizeW").value = String(doc.width);
  $("#resizeH").value = String(doc.height);
  $("#resizePct").value = "100";
  $("#resizePctRow").hidden = mode !== "image";
  $("#anchorPicker").hidden = mode !== "canvas";
  $("#resizeLock").checked = mode === "image";
  $("#resizeDialog").showModal();
}

function initResizeDialog() {
  const dialog = $("#resizeDialog");
  wireDialog(dialog);

  const grid = $("#anchorPicker .anchor-grid");
  grid.innerHTML = ANCHORS.map(
    (a) =>
      `<button class="anchor-cell${a === "center" ? " is-active" : ""}" data-anchor="${a}" aria-label="${a}"></button>`
  ).join("");
  grid.addEventListener("click", (e) => {
    const cell = e.target.closest("[data-anchor]");
    if (!cell) return;
    resizeAnchor = cell.dataset.anchor;
    $$(".anchor-cell", grid).forEach((c) => c.classList.toggle("is-active", c === cell));
  });

  const w = $("#resizeW");
  const h = $("#resizeH");
  const pct = $("#resizePct");
  const lock = $("#resizeLock");
  const ratio = () => (state.doc ? state.doc.width / state.doc.height : 1);
  w.addEventListener("input", () => {
    if (lock.checked) h.value = String(Math.max(1, Math.round(Number(w.value) / ratio())));
    if (state.doc) pct.value = String(Math.round((Number(w.value) / state.doc.width) * 100));
  });
  h.addEventListener("input", () => {
    if (lock.checked) w.value = String(Math.max(1, Math.round(Number(h.value) * ratio())));
  });
  pct.addEventListener("input", () => {
    const doc = state.doc;
    const k = Number(pct.value) / 100;
    if (!doc || !k) return;
    w.value = String(Math.max(1, Math.round(doc.width * k)));
    h.value = String(Math.max(1, Math.round(doc.height * k)));
  });

  $("#resizeApply").addEventListener("click", () => {
    const width = Number(w.value);
    const height = Number(h.value);
    if (!(width > 0) || !(height > 0)) return;
    if (width > A.MAX_DIM || height > A.MAX_DIM) {
      emit("toast", { msg: t("The largest supported size is 8000 × 8000 px"), kind: "info" });
    }
    if (resizeMode === "image") A.resizeImage(width, height);
    else A.resizeCanvas(width, height, resizeAnchor);
    dialog.close();
  });
}

/* --- export --- */

let exportFormat = "image/png";
let sizeTimer = 0;

function setExportFormat(format) {
  exportFormat = format;
  $$(".seg-btn", $("#exportFormat")).forEach((b) =>
    b.classList.toggle("is-active", b.dataset.format === format)
  );
  $("#qualityRow").hidden = format === "image/png" || format === "psd";
  $("#scaleRow").hidden = format === "psd";
  $("#exportFormatHint").textContent =
    format === "image/jpeg"
      ? t("JPEG has no transparency — transparent areas become white.")
      : format === "psd"
      ? t("Layered Photoshop file: layers, masks, opacity and blend modes are kept.")
      : format === "image/webp"
      ? t("WebP keeps transparency and is usually the smallest file.")
      : t("PNG is lossless and keeps transparency.");
}

function openExportDialog({ format, quality } = {}) {
  if (!state.doc) return;
  $("#exportName").value = state.doc.name || "paint-studio";
  if (format) setExportFormat(format);
  if (quality) {
    $("#exportQuality").value = String(quality);
    $("#exportQualityOut").value = String(quality);
  }
  $("#exportDialog").showModal();
  refreshExportPreview();
}

function initExportDialog() {
  const dialog = $("#exportDialog");
  wireDialog(dialog);
  setExportFormat(exportFormat);

  $("#exportFormat").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-format]");
    if (!btn) return;
    setExportFormat(btn.dataset.format);
    refreshExportPreview();
  });

  $("#exportQuality").addEventListener("input", (e) => {
    $("#exportQualityOut").value = e.target.value;
    refreshExportPreview();
  });
  $("#exportScale").addEventListener("input", (e) => {
    $("#exportScaleOut").value = `${e.target.value}%`;
    refreshExportPreview();
  });

  $("#exportGo").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (btn.disabled) return;
    btn.disabled = true;
    try {
      const ok = await A.exportImage({
        format: exportFormat,
        quality: Number($("#exportQuality").value) / 100,
        scale: Number($("#exportScale").value) / 100,
        name: $("#exportName").value,
      });
      if (ok) dialog.close();
    } finally {
      btn.disabled = false;
    }
  });
}

const formatSize = (bytes) => {
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`;
};

let estimateId = 0;

function refreshExportPreview() {
  const doc = state.doc;
  if (!doc) return;
  const scale = exportFormat === "psd" ? 1 : Number($("#exportScale").value) / 100;
  const { w, h } = exportFormat === "psd" ? { w: doc.width, h: doc.height } : A.exportSize(scale);

  const preview = $("#exportPreview");
  const box = 320;
  const k = Math.min(box / doc.width, 150 / doc.height, 1);
  preview.width = Math.max(1, Math.round(doc.width * k));
  preview.height = Math.max(1, Math.round(doc.height * k));
  const ctx = preview.getContext("2d");
  ctx.clearRect(0, 0, preview.width, preview.height);
  if (exportFormat === "image/jpeg") {
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, preview.width, preview.height);
  }
  ctx.drawImage(doc.composite(), 0, 0, preview.width, preview.height);

  $("#exportInfo").textContent = t("{w} × {h} px — calculating size…", { w, h });
  clearTimeout(sizeTimer);
  const format = exportFormat;
  // only the newest estimate may write the line (an old one can finish last)
  const id = ++estimateId;
  sizeTimer = setTimeout(async () => {
    let blob = null;
    try {
      blob = await A.exportBlob({
        format,
        quality: Number($("#exportQuality").value) / 100,
        scale,
      });
    } catch (err) {
      console.error(err);
    }
    if (id !== estimateId) return;
    if (blob && !A.encodedAs(blob, format)) {
      $("#exportInfo").textContent = t("This browser can't encode {fmt} — choose PNG or JPEG", {
        fmt: format.replace("image/", "").toUpperCase(),
      });
      return;
    }
    $("#exportInfo").textContent = blob
      ? t("{w} × {h} px — about {size}", { w, h, size: formatSize(blob.size) })
      : t("{w} × {h} px — this size can't be exported here", { w, h });
  }, 260);
}

/* --- shortcuts --- */

const SHORTCUT_GROUPS = [
  {
    title: t("File"),
    rows: [
      [t("New document"), KEY_NEW],
      [t("Open image"), `${MOD} O`],
      [t("Save project"), `${MOD} S`],
      [t("Export image"), `⇧ ${MOD} E`],
      [t("Paste image"), `${MOD} V`],
    ],
  },
  {
    title: t("Edit"),
    rows: [
      [t("Undo / Redo"), `${MOD} Z · ⇧${MOD} Z`],
      [t("Free transform"), `⌥ ${MOD} T`],
      [t("Select all / Deselect"), `${MOD} A · ${MOD} D`],
      [t("Invert selection"), `⇧ ${MOD} I`],
      [t("Delete selected pixels"), "⌫"],
      [t("Fill with primary color"), "⌥ ⌫"],
      [t("Selection to new layer"), `⇧ ${MOD} J`],
    ],
  },
  {
    title: t("Layers"),
    rows: [
      [t("New layer"), KEY_NEW_LAYER],
      [t("Duplicate layer"), `${MOD} J`],
      [t("Merge down"), `${MOD} E`],
      [t("Levels / Curves"), `${MOD} L · ${MOD} M`],
    ],
  },
  {
    title: t("View"),
    rows: [
      [t("Zoom in / out"), `${MOD} + · ${MOD} −`],
      [t("Fit on screen"), `${MOD} 0`],
      [t("Actual pixels"), `${MOD} 1`],
      [t("Pan the canvas"), t("Space + drag")],
      [t("Zoom at pointer"), t("Scroll")],
    ],
  },
  {
    title: t("Painting"),
    rows: [
      [t("Brush size down / up"), "[ · ]"],
      [t("Swap primary / secondary"), "X"],
      [t("Pick color while painting"), t("Alt + click")],
      [t("Constrain shape / straight line"), "Shift"],
      [t("Draw shape from centre"), "Alt"],
      [t("Add / subtract selection"), "Shift · Alt"],
      [t("Apply crop or transform"), "Enter"],
      [t("Cancel current action"), "Esc"],
    ],
  },
];

function openShortcuts() {
  const host = $("#shortcutList");
  const toolRows = TOOL_LIST.filter((tool) => tool.shortcut).map((tool) => [
    tool.label,
    tool.shortcut.toUpperCase(),
  ]);
  const groups = [...SHORTCUT_GROUPS, { title: t("Tools"), rows: toolRows }];
  host.innerHTML = groups
    .map(
      (g) => `
      <div class="shortcut-group">
        <h3>${g.title}</h3>
        ${g.rows
          .map(
            ([label, keys]) =>
              `<div class="shortcut-row"><span>${label}</span><kbd>${platformKeys(keys)}</kbd></div>`
          )
          .join("")}
      </div>`
    )
    .join("");
  $("#shortcutsDialog").showModal();
}

/* --- welcome --- */

function initWelcome() {
  const dialog = $("#welcomeDialog");
  // there is nothing behind the welcome screen until a document exists
  wireDialog(dialog, { canClose: () => !!state.doc });

  dialog.addEventListener("cancel", (e) => {
    if (!state.doc) e.preventDefault();
  });
  // browsers may close a modal on a repeated Esc regardless of
  // preventDefault(); without a document it simply comes back
  dialog.addEventListener("close", () => {
    if (!state.doc) setTimeout(() => !state.doc && !dialog.open && dialog.showModal(), 0);
  });

  presetChips($("#welcomePresets"), (w, h) => {
    A.newDocument({ width: w, height: h, background: "#ffffff" });
    dialog.close();
  });

  dialog.addEventListener("click", (e) => {
    const card = e.target.closest("[data-start]");
    if (!card) return;
    const kind = card.dataset.start;
    if (kind === "new") openNewDialog();
    else if (kind === "open") $("#imageInput").click();
    else if (kind === "project") $("#projectInput").click();
    else if (kind === "paste") A.pasteFromClipboard();
    else if (kind === "restore") emit("restore-autosave", card.dataset.slot);
  });

  $("#welcomeAbout").setAttribute("href", SITE_HOME);

  on("doc", ({ reason }) => {
    if (reason === "open" && state.doc) dialog.close();
  });
}

/** Called by main.js once it knows whether a document is coming. */
export function showWelcome() {
  const dialog = $("#welcomeDialog");
  if (!state.doc && !dialog.open) dialog.showModal();
}

/** The welcome screen on request (to pick a stored session), document or not. */
export function showWelcomeDialog() {
  const dialog = $("#welcomeDialog");
  if (!dialog.open) dialog.showModal();
}

/* ================================ file input ============================== */

function initFileInputs() {
  $("#imageInput").addEventListener("change", async (e) => {
    const [file] = e.target.files;
    e.target.value = "";
    if (!file) return;
    await A.openImageFile(file, { asLayer: false });
  });

  $("#projectInput").addEventListener("change", async (e) => {
    const [file] = e.target.files;
    e.target.value = "";
    if (file) await A.openProjectFile(file);
  });
}

function initDragDrop() {
  const stage = $("#stage");
  const zone = $("#dropzone");
  let depth = 0;

  const show = (visible) => zone.classList.toggle("is-active", visible);

  window.addEventListener("dragenter", (e) => {
    if (![...e.dataTransfer.types].includes("Files")) return;
    depth++;
    show(true);
  });
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (!depth) show(false);
  });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", async (e) => {
    e.preventDefault();
    depth = 0;
    show(false);
    // a dialog (Levels, Export…) is working on the current document
    if (modalOpen()) {
      emit("toast", { msg: t("Close the dialog first, then drop the file again"), kind: "info" });
      return;
    }
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const project = files.find((f) => f.name.toLowerCase().endsWith(".paint"));
    if (project) {
      await A.openProjectFile(project);
      return;
    }
    const psd = files.find((f) => /\.psd$/i.test(f.name));
    if (psd) {
      await A.openImageFile(psd);
      return;
    }
    const images = files.filter(A.isOpenable);
    if (!images.length) {
      emit("toast", { msg: t("That file is not an image"), kind: "err" });
      return;
    }
    for (const file of images) {
      await A.openImageFile(file, { asLayer: !!state.doc });
    }
  });
  stage.addEventListener("dragover", (e) => e.preventDefault());
}

function initPaste() {
  document.addEventListener("paste", async (e) => {
    if (isTypingTarget(e.target) || modalOpen()) return;
    const items = [...(e.clipboardData?.items || [])];
    const image = items.find((i) => i.type.startsWith("image/"));
    if (!image) return;
    e.preventDefault();
    const file = image.getAsFile();
    if (file) await A.pasteImage(file);
  });
}

/* =============================== shortcuts ================================ */

/**
 * Keys by position where layouts disagree: on a Czech keyboard the digit row
 * types +ěščřžýáíé and [ ] need AltGr, so e.key alone would break Ctrl+0,
 * Ctrl+1 and the brush-size keys there.
 */
function physicalKey(e) {
  const c = e.code || "";
  if (/^Digit\d$/.test(c)) return c.slice(5);
  if (/^Numpad\d$/.test(c)) return c.slice(6);
  if (c === "Equal" || c === "NumpadAdd") return "+";
  if (c === "Minus" || c === "NumpadSubtract") return "-";
  if (c === "BracketLeft") return "[";
  if (c === "BracketRight") return "]";
  if (/^Key[A-Z]$/.test(c)) return c.slice(3).toLowerCase();
  return null;
}

function initShortcuts() {
  const toolByKey = new Map(
    TOOL_LIST.filter((tool) => tool.shortcut).map((tool) => [tool.shortcut, tool.id])
  );

  window.addEventListener("keydown", (e) => {
    if (isTypingTarget(e.target)) return;
    if (modalOpen()) return;
    // AltGr arrives as Ctrl+Alt on Windows: it types characters, not commands
    const altGraph = e.getModifierState?.("AltGraph");
    const mod = (e.metaKey || e.ctrlKey) && !altGraph;
    const key = e.key.toLowerCase();
    const phys = physicalKey(e);
    // letters follow the layout (Z/Y swap on QWERTZ), everything else the key
    const letter = key.length === 1 && /\p{L}/u.test(key) && /^[a-z]$/.test(key) ? key : phys;
    // holding a command key must not fire it again and again
    const once = () => !e.repeat;

    if (mod) {
      // ⌥⌘T on a Mac reports "†" as the key; match the physical key instead
      if (e.altKey && e.code === "KeyT") {
        e.preventDefault();
        if (once()) startTransform();
        return;
      }
      // zoom by position: Ctrl+0 / Ctrl+1 / Ctrl+ +/− on any layout
      if (phys === "0" || phys === "1" || phys === "+" || phys === "-" || key === "+" || key === "=" || key === "-") {
        e.preventDefault();
        if (phys === "0") view.fit();
        else if (phys === "1") view.actualSize();
        else if (phys === "+" || key === "+" || key === "=") view.zoomStep(1);
        else view.zoomStep(-1);
        return;
      }
      switch (letter) {
        case "z":
          e.preventDefault();
          e.shiftKey ? A.redo() : A.undo();
          return;
        case "y":
          e.preventDefault();
          A.redo();
          return;
        case "n":
          // only reaches the page in an installed app window
          e.preventDefault();
          if (once()) e.shiftKey ? A.addLayer() : openNewDialog();
          return;
        case "o":
          e.preventDefault();
          if (once()) $("#imageInput").click();
          return;
        case "s":
          e.preventDefault();
          if (once()) A.saveProject();
          return;
        case "e":
          e.preventDefault();
          if (once()) e.shiftKey ? openExportDialog() : A.mergeDown();
          return;
        case "j":
          e.preventDefault();
          if (once()) e.shiftKey ? A.duplicateSelectionToLayer() : A.duplicateLayer();
          return;
        case "a":
          e.preventDefault();
          if (once()) A.selectAll();
          return;
        case "d":
          e.preventDefault();
          if (once()) A.deselect();
          return;
        case "i":
          if (e.shiftKey) {
            e.preventDefault();
            if (once()) A.invertSelection();
          }
          return;
        case "l":
          e.preventDefault();
          if (once()) openLevels();
          return;
        case "m":
          e.preventDefault();
          if (once()) openCurves();
          return;
        case "c":
          e.preventDefault();
          if (once()) A.copyToClipboard();
          return;
        default:
          return;
      }
    }

    // a stroke in progress: Escape abandons it, everything else waits
    if (state.dragging) {
      if (e.key === "Escape") {
        e.preventDefault();
        emit("abort-gesture");
        requestRender();
      }
      return;
    }

    // ⌥N / ⇧⌥N: New… and New layer in a browser tab (see KEY_NEW)
    if (e.altKey && !altGraph && e.code === "KeyN") {
      e.preventDefault();
      if (once()) e.shiftKey ? A.addLayer() : openNewDialog();
      return;
    }

    if (e.key === "Escape") {
      const tool = TOOLS[state.tool];
      if (overlay.crop || overlay.transform) {
        tool.cancel?.();
      } else if (state.doc?.selection) {
        A.deselect();
      } else {
        tool.cancel?.();
      }
      requestRender();
      return;
    }

    if (e.key === "Enter") {
      if (state.tool === "crop") {
        TOOLS.crop.apply();
        e.preventDefault();
      } else if (state.tool === "transform") {
        TOOLS.transform.apply();
        e.preventDefault();
      }
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (!once()) return;
      if (e.altKey) A.fillSelection("primary");
      else A.clearSelectionPixels();
      return;
    }

    const bracket = key === "[" || key === "]" ? key : phys === "[" || phys === "]" ? phys : null;
    if (bracket) {
      const current = opt("size");
      if (typeof current !== "number") return;
      // stay inside the tool's own range (pencil 1–64, text 6–400…)
      const spec = TOOLS[state.tool]?.opts?.find((o) => o.key === "size");
      const step = Math.max(1, Math.round(current * 0.15));
      setOpt(
        "size",
        clamp(current + (bracket === "]" ? step : -step), spec?.min ?? 1, spec?.max ?? 400)
      );
      emit("tool", { tool: state.tool });
      return;
    }

    if (e.altKey || e.ctrlKey || e.metaKey) return;

    if (letter === "x") {
      swapColors();
      return;
    }
    if (key === "?" || (e.shiftKey && (key === "/" || e.code === "Slash"))) {
      openShortcuts();
      return;
    }
    if (letter === "f" && e.shiftKey) {
      togglePanels();
      return;
    }

    const toolId = toolByKey.get(letter);
    if (toolId && !e.shiftKey) {
      setTool(toolId);
      e.preventDefault();
    }
  });
}

/** Hide or show the side panels (desktop) — the menu item and Shift+F. */
export function togglePanels() {
  $(".workspace").classList.toggle("side-collapsed");
}

/* ================================== init ================================== */

export function initMenus() {
  buildMenubar();
  initNewDialog();
  initResizeDialog();
  initExportDialog();
  wireDialog($("#shortcutsDialog"));
  initFileInputs();
  initDragDrop();
  initPaste();
  initShortcuts();
  initWelcome();

  $("#exportBtn").addEventListener("click", () => openExportDialog());
  $("#helpBtn").addEventListener("click", openShortcuts);
  // the static tooltip uses the key that works here (see KEY_NEW)
  $("#addLayerBtn").dataset.tip = `${t("New layer")} · ${platformKeys(KEY_NEW_LAYER)}`;

  // the crop tool asks the app to commit its rectangle
  on("crop-apply", (rect) => A.cropTo(rect));
}

export { openExportDialog, openNewDialog, openResizeDialog, openShortcuts };
