/* ==========================================================================
   Tasks — what a landing page asked the editor to do.

   /editor/?task=crop arrives from /crop-image/: once a document is open the
   crop tool is up and a small task bar explains the next step and offers the
   one-click actions that page promised (rotate, blur the selection, copy the
   colour…), always ending in Export.
   ========================================================================== */

import * as A from "./actions.js";
import { rgbToHex } from "./color.js";
import { EFFECTS } from "./filters.js";
import { history } from "./history.js";
import { t } from "./i18n.js";
import { openExportDialog, openResizeDialog } from "./menus.js";
import { emit, on, setTool, state } from "./state.js";
import { openCurves, openLevels } from "./tone.js";
import { TOOLS } from "./tools.js";
import { icon, isPhoneLayout, openTab, sideScroll } from "./ui.js";

const $ = (sel, root = document) => root.querySelector(sel);

const effectName = (id) => EFFECTS.find((e) => e.id === id)?.name || id;

/** Blur/pixelate strong enough to really hide what is selected. */
function privacyFilter(id) {
  A.settle();
  const doc = state.doc;
  if (!doc) return;
  // hiding "everything" is never what this task means
  const b = doc.selection?.bounds;
  if (!b) {
    emit("toast", { msg: t("Select what to hide first"), kind: "info" });
    return;
  }
  const short = Math.min(b.w, b.h);
  if (id === "blur") A.applyFilter("blur", { radius: Math.max(6, Math.round(short / 9)) });
  else A.applyFilter("pixelate", { block: Math.max(6, Math.round(short / 10)) });
}

/** The filter this task applied last, while it is still the latest step. */
let taskFilter = null;

async function applyTaskFilter(id, { auto = false } = {}) {
  if (!(await A.applyFilter(id))) return;
  const entry = history.stack[history.index];
  // applied on open, not by the user: to the autosave the document is still
  // only opened (it pushes no stored work out)
  if (auto) entry.auto = true;
  taskFilter = { label: effectName(id), entry };
}

/** Swap the filter a task applied for another one, as a single step. */
async function swapFilter(to) {
  // a live preview (the Adjust sliders) is kept as its own step first: undo
  // would only cancel it, and the check must see the real last step
  A.settle();
  const last = history.stack[history.index];
  if (taskFilter && last && last === taskFilter.entry) A.undo();
  await applyTaskFilter(to);
}

/**
 * The swatch the readout shows: the one the eyedropper filled last — a plain
 * click fills the edited one, Alt-click the other — otherwise the edited one.
 */
let pickedChip = null;
const pickedColor = () => state[pickedChip || state.activeChip] || state.primary;

async function copyHex() {
  const hex = rgbToHex(pickedColor()).toUpperCase();
  try {
    await navigator.clipboard.writeText(hex);
    emit("toast", { msg: t("Copied {hex}", { hex }), kind: "ok" });
  } catch {
    emit("toast", { msg: hex, kind: "info" });
  }
}

/** The live readout: a swatch, the HEX and the RGB values (phones drop RGB). */
function showColor(el) {
  const c = pickedColor();
  const hex = rgbToHex(c).toUpperCase();
  el.innerHTML = `<i class="taskbar-swatch"></i><span>${hex}</span><span class="taskbar-rgb"> · RGB ${c.r}, ${c.g}, ${c.b}</span>`;
  el.firstElementChild.style.background = hex;
  // the readout is the answer: on a phone it keeps its width, the actions scroll
  el.classList.add("is-readout");
}

/** The colour listener of the task bar shown last (a task can be started again). */
let offColor = null;

const TASKS = {
  crop: {
    tool: "crop",
    hint: t("Drag the frame or pick a ratio, then apply"),
    actions: [{ label: t("Apply crop"), icon: "i-check", primary: true, run: () => TOOLS.crop.apply() }],
  },
  resize: {
    run: () => openResizeDialog("image"),
    hint: t("Set the new size in pixels or percent"),
    actions: [{ label: t("Image size…"), icon: "i-frame", run: () => openResizeDialog("image") }],
  },
  rotate: {
    hint: t("Rotate or flip the image"),
    actions: [
      { label: t("Rotate left"), icon: "i-rotate-ccw", run: () => A.rotate(-1) },
      { label: t("Rotate right"), icon: "i-rotate-cw", run: () => A.rotate(1) },
      { label: t("Flip horizontal"), icon: "i-flip-h", run: () => A.flip("h") },
      { label: t("Flip vertical"), icon: "i-flip-v", run: () => A.flip("v") },
      { label: t("Free rotate"), icon: "i-transform", run: () => setTool("transform") },
    ],
  },
  compress: {
    run: () => openExportDialog({ format: "image/jpeg", quality: 75 }),
    hint: t("Lower the quality or the scale until the file is small enough"),
  },
  convert: {
    run: () => openExportDialog(),
    hint: t("Pick the format and download"),
  },
  "to-jpg": {
    run: () => openExportDialog({ format: "image/jpeg", quality: 90 }),
    hint: t("Download as JPG — or pick another format"),
  },
  "to-png": {
    run: () => openExportDialog({ format: "image/png" }),
    hint: t("Download as PNG — or pick another format"),
  },
  blur: {
    tool: "selectRect",
    hint: t("Select what to hide, then:"),
    actions: [
      { label: t("Blur"), icon: "i-blur", run: () => privacyFilter("blur") },
      { label: t("Pixelate"), icon: "i-grid", run: () => privacyFilter("pixelate") },
    ],
  },
  text: {
    tool: "text",
    hint: t("Click on the image and type"),
  },
  grayscale: {
    filter: "grayscale",
    panel: "filters",
    hint: t("Black & white applied"),
    actions: [
      { label: effectName("noir"), run: () => swapFilter("noir") },
      { label: effectName("sepia"), run: () => swapFilter("sepia") },
      { label: t("Undo"), icon: "i-undo", run: () => A.undo() },
    ],
  },
  invert: {
    filter: "invert",
    hint: t("Colours inverted"),
    actions: [{ label: t("Undo"), icon: "i-undo", run: () => A.undo() }],
  },
  filters: {
    panel: "filters",
    hint: t("Click a filter to apply it — every one can be undone"),
  },
  adjust: {
    panel: "adjust",
    hint: t("Move the sliders, then Apply — or try:"),
    actions: [
      { label: t("Auto levels"), icon: "i-sparkles", run: () => openLevels({ auto: true, apply: true }) },
      { label: t("Levels…"), icon: "i-levels", run: () => openLevels() },
      { label: t("Curves…"), icon: "i-curves", run: () => openCurves() },
    ],
  },
  transparent: {
    tool: "wand",
    hint: t("Click the background, then delete it. PNG keeps the transparency."),
    actions: [
      { label: t("Delete selected"), icon: "i-trash", run: () => A.clearSelectionPixels() },
      { label: t("Export PNG"), icon: "i-download", run: () => openExportDialog({ format: "image/png" }) },
    ],
    noExport: true,
  },
  eyedropper: {
    tool: "eyedropper",
    hint: t("Click anywhere on the image to read its colour"),
    live: true,
    actions: [{ label: t("Copy HEX"), icon: "i-copy", run: copyHex }],
  },
  draw: {
    tool: "brush",
    hint: t("Paint on the photo — a new layer keeps drawings separate"),
    actions: [{ label: t("New layer"), icon: "i-plus", run: () => A.addLayer() }],
  },
  paint: {
    tool: "brush",
    blank: true,
  },
  psd: {
    panel: "layers",
    hint: t("The PSD layers are in the Layers panel"),
  },
  retouch: {
    tool: "spotHeal",
    hint: t("Paint over a blemish — it is repaired when you let go"),
    actions: [
      { label: t("Healing brush"), icon: "i-heal", run: () => setTool("heal") },
      { label: t("Clone stamp"), icon: "i-clone", run: () => setTool("clone") },
    ],
  },
};

export const isBlankTask = (id) => !!TASKS[id]?.blank;
export const isTask = (id) => Object.hasOwn(TASKS, id);

/* --------------------------------- task bar -------------------------------- */

function showBar(task) {
  const bar = $("#taskbar");
  if (!task.hint && !task.actions?.length) {
    bar.hidden = true;
    return;
  }
  const actions = [...(task.actions || [])];
  if (!task.noExport) {
    actions.push({ label: t("Export"), icon: "i-download", primary: true, run: () => openExportDialog() });
  }
  bar.innerHTML = `
    <span class="taskbar-text" id="taskbarText"></span>
    <span class="taskbar-actions">${actions
      .map(
        (a, i) =>
          `<button class="btn ${a.primary ? "btn-primary" : "btn-ghost"} sm" data-task-action="${i}">${
            a.icon ? icon(a.icon) : ""
          }<span>${a.label}</span></button>`
      )
      .join("")}</span>
    <button class="icon-btn sm" data-task-close aria-label="${t("Close")}">${icon("i-close")}</button>`;
  $("#taskbarText").textContent = task.hint || "";
  // a live readout keeps a compact place on phones, where hints are hidden
  bar.classList.toggle("is-live", !!task.live);
  bar.hidden = false;
  // on a phone the actions scroll sideways: fade the edge with more
  sideScroll($(".taskbar-actions", bar));
  bar.onclick = (e) => {
    const btn = e.target.closest("[data-task-action]");
    if (btn) actions[Number(btn.dataset.taskAction)]?.run();
    if (e.target.closest("[data-task-close]")) bar.hidden = true;
  };
  offColor?.();
  offColor = null;
  pickedChip = null;
  if (task.live) {
    offColor = on("color", ({ which } = {}) => {
      // recording a recent colour changes nothing that is shown
      if (bar.hidden || which === "recent") return;
      // a new colour in one swatch: show that one; a swap or another chip
      // to edit: the edited one
      pickedChip = which === "primary" || which === "secondary" ? which : null;
      showColor($("#taskbarText"));
    });
  }
}

let applied = false;

async function run(task) {
  if (applied) return;
  applied = true;
  if (task.tool) setTool(task.tool);
  // a phone's panel sheet would cover the photo and the task bar with the
  // next steps: pick the tab, keep it shut — the panels button opens it there
  if (task.panel) openTab(task.panel, { reveal: !isPhoneLayout() });
  showBar(task);
  if (task.filter) await applyTaskFilter(task.filter, { auto: true });
  task.run?.();
}

/**
 * Apply a task now if a document is open, otherwise as soon as one is.
 * Blank-canvas tasks create their own document. A document restored from
 * the autosave is the user's earlier work: one-shot tasks (filters, dialogs)
 * are not applied to it, only the tool and the hints.
 */
export function startTask(id, { restored = false, again = false } = {}) {
  const task = isTask(id) ? TASKS[id] : null;
  if (!task) return;
  if (again) applied = false;
  if (task.blank && !state.doc) {
    A.newDocument({ width: 1600, height: 1000, background: "#ffffff" });
  }
  if (state.doc) {
    run(restored ? gentle(task) : task);
    return;
  }
  const off = on("doc", ({ reason, restored: wasRestored }) => {
    if (reason !== "open" || !state.doc) return;
    off();
    // let the document settle (fit, tool activation) before acting on it
    requestAnimationFrame(() => run(wasRestored ? gentle(task) : task));
  });
}

/** The parts of a task that never change the picture. */
const gentle = (task) => ({
  tool: task.tool,
  panel: task.panel,
  hint: task.filter ? null : task.hint,
  actions: task.actions,
  live: task.live,
  noExport: task.noExport,
});
