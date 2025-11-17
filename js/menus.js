/* ==========================================================================
   Menus, dialogs, keyboard shortcuts and file drag-and-drop.
   ========================================================================== */

import * as A from "./actions.js";
import { clamp } from "./color.js";
import { history } from "./history.js";
import { overlay, requestRender } from "./render.js";
import { emit, on, opt, setOpt, setTheme, setTool, state, swapColors } from "./state.js";
import { TOOL_LIST, TOOLS, isTypingTarget } from "./tools.js";
import { MOD, icon, openTab } from "./ui.js";
import { view } from "./viewport.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const SIZE_PRESETS = [
  { name: "HD", w: 1920, h: 1080 },
  { name: "Square post", w: 1080, h: 1080 },
  { name: "Story", w: 1080, h: 1920 },
  { name: "Social card", w: 1200, h: 630 },
  { name: "A4 · 300 dpi", w: 2480, h: 3508 },
  { name: "Classic", w: 800, h: 600 },
];

/* ================================== menus ================================= */

const MENUS = [
  {
    name: "File",
    items: () => [
      { label: "New…", keys: `${MOD}N`, icon: "i-file", run: openNewDialog },
      { label: "Open image…", keys: `${MOD}O`, icon: "i-image", run: () => $("#imageInput").click() },
      { label: "Open project…", icon: "i-folder", run: () => $("#projectInput").click() },
      { divider: true },
      { label: "Save project", keys: `${MOD}S`, icon: "i-save", run: A.saveProject, enabled: !!state.doc },
      { label: "Export image…", keys: `⇧${MOD}E`, icon: "i-download", run: openExportDialog, enabled: !!state.doc },
      { divider: true },
      { label: "Copy", keys: `${MOD}C`, icon: "i-copy", run: A.copyToClipboard, enabled: !!state.doc },
      { label: "Paste", keys: `${MOD}V`, icon: "i-paste", run: A.pasteFromClipboard },
    ],
  },
  {
    name: "Edit",
    items: () => [
      { label: "Undo", keys: `${MOD}Z`, icon: "i-undo", run: A.undo, enabled: history.canUndo },
      { label: "Redo", keys: `⇧${MOD}Z`, icon: "i-redo", run: A.redo, enabled: history.canRedo },
      { divider: true },
      { label: "Select all", keys: `${MOD}A`, icon: "i-select-rect", run: A.selectAll, enabled: !!state.doc },
      { label: "Deselect", keys: `${MOD}D`, run: A.deselect, enabled: !!state.doc?.selection },
      { label: "Invert selection", keys: `⇧${MOD}I`, run: A.invertSelection, enabled: !!state.doc?.selection },
      { divider: true },
      { label: "Fill with primary", keys: "⌥⌫", icon: "i-bucket", run: () => A.fillSelection("primary"), enabled: !!state.doc },
      { label: "Delete selected pixels", keys: "⌫", icon: "i-trash", run: A.clearSelectionPixels, enabled: !!state.doc },
      { label: "Selection to new layer", keys: `⇧${MOD}J`, icon: "i-layers", run: A.duplicateSelectionToLayer, enabled: !!state.doc?.selection },
    ],
  },
  {
    name: "Image",
    items: () => [
      { label: "Image size…", icon: "i-frame", run: () => openResizeDialog("image"), enabled: !!state.doc },
      { label: "Canvas size…", icon: "i-grid", run: () => openResizeDialog("canvas"), enabled: !!state.doc },
      { divider: true },
      { label: "Crop to selection", icon: "i-crop", run: A.cropToSelection, enabled: !!state.doc?.selection },
      { label: "Trim transparent edges", run: A.trimTransparent, enabled: !!state.doc },
      { divider: true },
      { label: "Rotate 90° right", icon: "i-rotate-cw", run: () => A.rotate(1), enabled: !!state.doc },
      { label: "Rotate 90° left", icon: "i-rotate-ccw", run: () => A.rotate(-1), enabled: !!state.doc },
      { label: "Rotate 180°", run: () => A.rotate(180), enabled: !!state.doc },
      { label: "Flip horizontal", icon: "i-flip-h", run: () => A.flip("h"), enabled: !!state.doc },
      { label: "Flip vertical", icon: "i-flip-v", run: () => A.flip("v"), enabled: !!state.doc },
    ],
  },
  {
    name: "Layer",
    items: () => [
      { label: "New layer", keys: `⇧${MOD}N`, icon: "i-plus", run: A.addLayer, enabled: !!state.doc },
      { label: "Duplicate layer", keys: `${MOD}J`, icon: "i-copy", run: A.duplicateLayer, enabled: !!state.doc },
      { label: "Delete layer", icon: "i-trash", run: () => A.deleteLayer(), enabled: (state.doc?.layers.length || 0) > 1 },
      { divider: true },
      { label: "Merge down", keys: `${MOD}E`, icon: "i-merge", run: A.mergeDown, enabled: (state.doc?.activeIndex || 0) > 0 },
      { label: "Flatten image", icon: "i-layers", run: A.flattenImage, enabled: (state.doc?.layers.length || 0) > 1 },
      { divider: true },
      { label: "Bring forward", run: () => A.raiseLayer(1), enabled: !!state.doc },
      { label: "Send backward", run: () => A.raiseLayer(-1), enabled: !!state.doc },
    ],
  },
  {
    name: "Adjust",
    items: () => [
      { label: "Adjustments panel", icon: "i-sliders", run: () => openTab("adjust") },
      { label: "Filter gallery", icon: "i-sparkles", run: () => openTab("filters") },
      { divider: true },
      { label: "Auto contrast", run: () => quickAdjust({ contrast: 18, clarity: 12 }), enabled: !!state.doc },
      { label: "Warm up", run: () => quickAdjust({ temperature: 22, saturation: 8 }), enabled: !!state.doc },
      { label: "Cool down", run: () => quickAdjust({ temperature: -22 }), enabled: !!state.doc },
      { label: "Punchy", run: () => quickAdjust({ contrast: 14, vibrance: 24, clarity: 18 }), enabled: !!state.doc },
    ],
  },
  {
    name: "View",
    items: () => [
      { label: "Zoom in", keys: `${MOD}+`, run: () => view.zoomStep(1) },
      { label: "Zoom out", keys: `${MOD}−`, run: () => view.zoomStep(-1) },
      { label: "Fit on screen", keys: `${MOD}0`, icon: "i-fit", run: () => view.fit() },
      { label: "Actual pixels", keys: `${MOD}1`, run: () => view.actualSize() },
      { divider: true },
      {
        label: state.theme === "dark" ? "Light theme" : "Dark theme",
        icon: state.theme === "dark" ? "i-sun" : "i-moon",
        run: () => setTheme(state.theme === "dark" ? "light" : "dark"),
      },
      {
        label: "Toggle panels",
        icon: "i-panel",
        run: () => $(".workspace").classList.toggle("side-collapsed"),
      },
    ],
  },
  {
    name: "Help",
    items: () => [
      { label: "Keyboard shortcuts", keys: "?", icon: "i-help", run: openShortcuts },
      { label: "About Paint Studio", icon: "i-sparkles", run: openAbout },
    ],
  },
];

function quickAdjust(values) {
  A.previewAdjustments(values);
  emit("adjust", A.adjustValues);
  openTab("adjust");
  A.commitAdjustments();
}

function buildMenubar() {
  const bar = $("#menubar");
  bar.innerHTML = MENUS.map(
    (m) => `<button class="menu-btn" data-menu="${m.name}">${m.name}</button>`
  ).join("");

  let openName = null;

  const close = () => {
    $("#menuPopover").hidden = true;
    $$(".menu-btn", bar).forEach((b) => b.classList.remove("is-open"));
    openName = null;
  };

  const open = (name, btn) => {
    const menu = MENUS.find((m) => m.name === name);
    if (!menu) return;
    const pop = $("#menuPopover");
    pop.innerHTML = menu
      .items()
      .map((item) =>
        item.divider
          ? `<div class="menu-divider"></div>`
          : `<button class="menu-item" data-item="${item.label}"${
              item.enabled === false ? " disabled" : ""
            }>${item.icon ? icon(item.icon) : `<span class="icon"></span>`}
               <span>${item.label}</span>
               ${item.keys ? `<span class="keys">${item.keys}</span>` : ""}
             </button>`
      )
      .join("");
    pop.hidden = false;
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.min(r.left, innerWidth - pop.offsetWidth - 8)}px`;
    pop.style.top = `${r.bottom + 4}px`;
    $$(".menu-btn", bar).forEach((b) => b.classList.toggle("is-open", b === btn));
    openName = name;

    pop.onclick = (e) => {
      const el = e.target.closest("[data-item]");
      if (!el) return;
      const item = menu.items().find((i) => i.label === el.dataset.item);
      close();
      item?.run?.();
    };
  };

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-menu]");
    if (!btn) return;
    if (openName === btn.dataset.menu) close();
    else open(btn.dataset.menu, btn);
  });

  bar.addEventListener("pointerover", (e) => {
    const btn = e.target.closest("[data-menu]");
    if (btn && openName && openName !== btn.dataset.menu) open(btn.dataset.menu, btn);
  });

  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#menuPopover") && !e.target.closest("#menubar")) close();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

/* ================================= dialogs ================================ */

function wireDialog(dialog) {
  $$("[data-close]", dialog).forEach((btn) =>
    btn.addEventListener("click", () => dialog.close())
  );
  dialog.addEventListener("click", (e) => {
    // click on the backdrop area closes
    if (e.target === dialog) dialog.close();
  });
}

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
  $("#resizeTitle").textContent = mode === "image" ? "Image size" : "Canvas size";
  $("#resizeW").value = String(doc.width);
  $("#resizeH").value = String(doc.height);
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
  const lock = $("#resizeLock");
  const ratio = () => (state.doc ? state.doc.width / state.doc.height : 1);
  w.addEventListener("input", () => {
    if (lock.checked) h.value = String(Math.max(1, Math.round(Number(w.value) / ratio())));
  });
  h.addEventListener("input", () => {
    if (lock.checked) w.value = String(Math.max(1, Math.round(Number(h.value) * ratio())));
  });

  $("#resizeApply").addEventListener("click", () => {
    const width = Number(w.value);
    const height = Number(h.value);
    if (!width || !height) return;
    if (resizeMode === "image") A.resizeImage(width, height);
    else A.resizeCanvas(width, height, resizeAnchor);
    dialog.close();
  });
}

/* --- export --- */

let exportFormat = "image/png";
let sizeTimer = 0;

function openExportDialog() {
  if (!state.doc) return;
  $("#exportName").value = state.doc.name || "paint-studio";
  $("#exportDialog").showModal();
  refreshExportPreview();
}

function initExportDialog() {
  const dialog = $("#exportDialog");
  wireDialog(dialog);

  $("#exportFormat").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-format]");
    if (!btn) return;
    exportFormat = btn.dataset.format;
    $$(".seg-btn", $("#exportFormat")).forEach((b) =>
      b.classList.toggle("is-active", b === btn)
    );
    $("#qualityRow").hidden = exportFormat === "image/png";
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

  $("#exportGo").addEventListener("click", async () => {
    await A.exportImage({
      format: exportFormat,
      quality: Number($("#exportQuality").value) / 100,
      scale: Number($("#exportScale").value) / 100,
      name: $("#exportName").value,
    });
    dialog.close();
  });
}

function refreshExportPreview() {
  const doc = state.doc;
  if (!doc) return;
  const scale = Number($("#exportScale").value) / 100;
  const w = Math.max(1, Math.round(doc.width * scale));
  const h = Math.max(1, Math.round(doc.height * scale));

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

  $("#exportInfo").textContent = `${w} × ${h} px — calculating size…`;
  clearTimeout(sizeTimer);
  sizeTimer = setTimeout(async () => {
    const canvas = A.exportCanvas({ scale, format: exportFormat });
    if (!canvas) return;
    const blob = await new Promise((r) =>
      canvas.toBlob(r, exportFormat, Number($("#exportQuality").value) / 100)
    );
    const kb = blob ? blob.size / 1024 : 0;
    $("#exportInfo").textContent = `${w} × ${h} px — about ${
      kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`
    }`;
  }, 260);
}

/* --- shortcuts --- */

const SHORTCUT_GROUPS = [
  {
    title: "File",
    rows: [
      ["New document", `${MOD} N`],
      ["Open image", `${MOD} O`],
      ["Save project", `${MOD} S`],
      ["Export image", `⇧ ${MOD} E`],
      ["Paste image", `${MOD} V`],
    ],
  },
  {
    title: "Edit",
    rows: [
      ["Undo / Redo", `${MOD} Z · ⇧${MOD} Z`],
      ["Select all / Deselect", `${MOD} A · ${MOD} D`],
      ["Invert selection", `⇧ ${MOD} I`],
      ["Delete selected pixels", "⌫"],
      ["Fill with primary color", "⌥ ⌫"],
      ["Selection to new layer", `⇧ ${MOD} J`],
    ],
  },
  {
    title: "Layers",
    rows: [
      ["New layer", `⇧ ${MOD} N`],
      ["Duplicate layer", `${MOD} J`],
      ["Merge down", `${MOD} E`],
    ],
  },
  {
    title: "View",
    rows: [
      ["Zoom in / out", `${MOD} + · ${MOD} −`],
      ["Fit on screen", `${MOD} 0`],
      ["Actual pixels", `${MOD} 1`],
      ["Pan the canvas", "Space + drag"],
      ["Zoom at pointer", "Scroll"],
    ],
  },
  {
    title: "Painting",
    rows: [
      ["Brush size down / up", "[ · ]"],
      ["Swap primary / secondary", "X"],
      ["Pick color while painting", "Alt + click"],
      ["Constrain shape / straight line", "Shift"],
      ["Draw shape from centre", "Alt"],
      ["Add / subtract selection", "Shift · Alt"],
      ["Apply crop", "Enter"],
      ["Cancel current action", "Esc"],
    ],
  },
];

function openShortcuts() {
  const host = $("#shortcutList");
  const toolRows = TOOL_LIST.filter((t) => t.shortcut).map((t) => [
    t.label,
    t.shortcut.toUpperCase(),
  ]);
  const groups = [...SHORTCUT_GROUPS, { title: "Tools", rows: toolRows }];
  host.innerHTML = groups
    .map(
      (g) => `
      <div class="shortcut-group">
        <h3>${g.title}</h3>
        ${g.rows
          .map(
            ([label, keys]) =>
              `<div class="shortcut-row"><span>${label}</span><kbd>${keys}</kbd></div>`
          )
          .join("")}
      </div>`
    )
    .join("");
  $("#shortcutsDialog").showModal();
}

/* --- about --- */

const isAboutOpen = () => $("#about")?.hidden === false;

function openAbout() {
  const el = $("#about");
  if (!el || !el.hidden) return;
  // a modal dialog lives in the top layer, which would cover this section
  $("#welcomeDialog").close();
  el.hidden = false;
  el.scrollTop = 0;
}

function closeAbout() {
  const el = $("#about");
  if (!el || el.hidden) return;
  el.hidden = true;
  // there is nothing behind the welcome screen until a document exists
  const welcome = $("#welcomeDialog");
  if (!state.doc && !welcome.open) welcome.showModal();
}

function initAbout() {
  $("#aboutLaunch").addEventListener("click", closeAbout);
  $("#welcomeAbout").addEventListener("click", openAbout);
}

/* --- welcome --- */

function initWelcome() {
  const dialog = $("#welcomeDialog");
  wireDialog(dialog);

  dialog.addEventListener("cancel", (e) => {
    // there is nothing behind the welcome screen until a document exists
    if (!state.doc) e.preventDefault();
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
  });

  on("doc", ({ reason }) => {
    if (reason === "open" && state.doc) dialog.close();
  });

  if (!state.doc) dialog.showModal();
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

  const show = (on) => zone.classList.toggle("is-active", on);

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
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    const project = files.find((f) => f.name.endsWith(".paint"));
    if (project) {
      await A.openProjectFile(project);
      return;
    }
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
      await A.openImageFile(file, { asLayer: !!state.doc });
    }
  });
  stage.addEventListener("dragover", (e) => e.preventDefault());
}

function initPaste() {
  document.addEventListener("paste", async (e) => {
    if (isTypingTarget(e.target)) return;
    const items = [...(e.clipboardData?.items || [])];
    const image = items.find((i) => i.type.startsWith("image/"));
    if (!image) return;
    e.preventDefault();
    const file = image.getAsFile();
    if (file) await A.pasteImage(file);
  });
}

/* =============================== shortcuts ================================ */

function initShortcuts() {
  const toolByKey = new Map(
    TOOL_LIST.filter((t) => t.shortcut).map((t) => [t.shortcut, t.id])
  );

  window.addEventListener("keydown", (e) => {
    if (isAboutOpen()) {
      if (e.key === "Escape") closeAbout();
      return;
    }
    if (isTypingTarget(e.target)) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (mod) {
      switch (key) {
        case "z":
          e.preventDefault();
          e.shiftKey ? A.redo() : A.undo();
          return;
        case "y":
          e.preventDefault();
          A.redo();
          return;
        case "n":
          e.preventDefault();
          e.shiftKey ? A.addLayer() : openNewDialog();
          return;
        case "o":
          e.preventDefault();
          $("#imageInput").click();
          return;
        case "s":
          e.preventDefault();
          A.saveProject();
          return;
        case "e":
          e.preventDefault();
          e.shiftKey ? openExportDialog() : A.mergeDown();
          return;
        case "j":
          e.preventDefault();
          e.shiftKey ? A.duplicateSelectionToLayer() : A.duplicateLayer();
          return;
        case "a":
          e.preventDefault();
          A.selectAll();
          return;
        case "d":
          e.preventDefault();
          A.deselect();
          return;
        case "i":
          if (e.shiftKey) {
            e.preventDefault();
            A.invertSelection();
          }
          return;
        case "c":
          e.preventDefault();
          A.copyToClipboard();
          return;
        case "0":
          e.preventDefault();
          view.fit();
          return;
        case "1":
          e.preventDefault();
          view.actualSize();
          return;
        case "=":
        case "+":
          e.preventDefault();
          view.zoomStep(1);
          return;
        case "-":
          e.preventDefault();
          view.zoomStep(-1);
          return;
        default:
          return;
      }
    }

    if (e.key === "Escape") {
      const tool = TOOLS[state.tool];
      if (overlay.crop) {
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
      }
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      if (e.altKey) A.fillSelection("primary");
      else A.clearSelectionPixels();
      return;
    }

    if (key === "[" || key === "]") {
      const current = opt("size");
      if (typeof current !== "number") return;
      const step = Math.max(1, Math.round(current * 0.15));
      setOpt("size", clamp(current + (key === "]" ? step : -step), 1, 400));
      emit("tool", { tool: state.tool });
      return;
    }

    if (key === "x") {
      swapColors();
      return;
    }
    if (key === "?" || (e.shiftKey && key === "/")) {
      openShortcuts();
      return;
    }
    if (key === "f" && e.shiftKey) {
      $(".workspace").classList.toggle("side-collapsed");
      return;
    }

    const toolId = toolByKey.get(key);
    if (toolId) {
      setTool(toolId);
      e.preventDefault();
    }
  });
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
  initAbout();

  $("#exportBtn").addEventListener("click", openExportDialog);
  $("#helpBtn").addEventListener("click", openShortcuts);

  // the crop tool asks the app to commit its rectangle
  on("crop-apply", (rect) => A.cropTo(rect));
}

export { openExportDialog, openNewDialog, openResizeDialog, openShortcuts };
