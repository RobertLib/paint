/* ==========================================================================
   UI — builds and syncs the chrome: tool rail, contextual options bar, color
   picker, layers panel, adjustment sliders, filter gallery, status bar,
   tooltips and toasts. Nothing here touches pixels; it calls into actions.js.
   ========================================================================== */

import * as A from "./actions.js";
import { cssColor, hsvToRgb, parseColor, rgbToHex, rgbToHsv } from "./color.js";
import { BLEND_MODES, ctx2d, makeCanvas } from "./doc.js";
import { ADJUST_GROUPS, EFFECTS } from "./filters.js";
import { history } from "./history.js";
import { requestRender } from "./render.js";
import {
  on,
  opt,
  recordRecent,
  setActiveChip,
  setColor,
  setOpt,
  setTheme,
  setTool,
  state,
  swapColors,
} from "./state.js";
import { TOOL_GROUPS, activeTool } from "./tools.js";
import { view } from "./viewport.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function icon(name, cls = "icon") {
  return `<svg class="${cls}"><use href="#${name}" /></svg>`;
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const MOD = isMac ? "⌘" : "Ctrl";

/* ================================== rail ================================== */

function buildRail() {
  const rail = $("#toolRail");
  rail.innerHTML = TOOL_GROUPS.map(
    (group) => `
    <div class="rail-group">
      <span class="rail-label">${group.name}</span>
      ${group.tools
        .map(
          (t) => `<button class="tool-btn" data-tool="${t.id}" data-tip="${t.label}${
            t.shortcut ? ` · ${t.shortcut.toUpperCase()}` : ""
          }" aria-label="${t.label}">
            ${icon(t.icon)}
            ${t.shortcut ? `<kbd>${t.shortcut.toUpperCase()}</kbd>` : ""}
          </button>`
        )
        .join("")}
    </div>`
  ).join("");

  rail.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tool]");
    if (btn) setTool(btn.dataset.tool);
  });
  syncRail();
}

/** Contextual one-liners shown in the status bar per tool. */
const HINTS = {
  brush: "Alt-click samples a colour · [ and ] resize the brush",
  pencil: "Alt-click samples a colour · [ and ] resize the tip",
  airbrush: "Hold to build up paint · Flow sets the rate",
  eraser: "[ and ] resize · Hardness softens the edge",
  bucket: "Raise Tolerance to spread further · Expand tucks under outlines",
  gradient: "Drag to set direction and length · Shift constrains",
  blurBrush: "Paint over an area to soften it",
  sharpenBrush: "Paint over an area to add local contrast",
  smudge: "Drag to pull pixels along the stroke",
  clone: "Alt-click to set the source, then paint elsewhere",
  line: "Shift snaps to 45° steps",
  arrow: "Drag from tail to head",
  rect: "Shift for a square · Alt from the centre · Corner rounds it",
  ellipse: "Shift for a circle · Alt draws from the centre",
  polygon: "Shift for a regular shape · Sides sets the count",
  star: "Points sets the number of spikes",
  text: "Type on the canvas · ⌘/Ctrl + Enter commits · Esc cancels",
  selectRect: "Shift adds · Alt subtracts · click to deselect",
  selectEllipse: "Shift adds · Alt subtracts · click to deselect",
  lasso: "Draw a freehand loop · Shift adds · Alt subtracts",
  wand: "Click a colour · Tolerance controls the spread",
  move: "Drags the selected pixels, or the whole layer",
  crop: "Drag the frame or its handles · Enter applies",
  eyedropper: "Click to sample · Alt fills the other swatch",
  hand: "Drag to pan · Space does this with any tool",
  zoom: "Click to zoom in · Alt-click to zoom out",
};

function syncRail() {
  $$("#toolRail .tool-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.tool === state.tool)
  );
  const tool = activeTool();
  $("#statusTool").textContent = tool.label;
  $("#statusHint").textContent =
    HINTS[tool.id] || "Space + drag to pan · Scroll to zoom";
}

/* =============================== options bar ============================== */

let optionsWired = false;

function buildOptions() {
  const bar = $("#optionsBar");
  const tool = activeTool();
  const parts = [
    `<span class="opt-title">${icon(tool.icon)}${tool.label}</span>`,
    `<span class="sep"></span>`,
  ];

  for (const o of tool.opts || []) {
    if (o.type === "range") {
      parts.push(`
        <div class="opt" data-opt="${o.key}">
          <label for="opt-${o.key}">${o.label}</label>
          <div class="opt-range">
            <input id="opt-${o.key}" type="range" min="${o.min}" max="${o.max}"
                   step="${o.step ?? 1}" value="${opt(o.key) ?? o.def}" data-key="${o.key}" />
            <input class="opt-num" type="text" inputmode="numeric"
                   value="${opt(o.key) ?? o.def}" data-num="${o.key}"
                   aria-label="${o.label}" />
          </div>
        </div>`);
    } else if (o.type === "toggle") {
      parts.push(
        `<button class="opt-toggle${opt(o.key) ? " is-on" : ""}" data-toggle="${o.key}">
           ${icon("i-check")}<span>${o.label}</span>
         </button>`
      );
    } else if (o.type === "seg") {
      parts.push(`
        <div class="opt" data-opt="${o.key}">
          <label>${o.label}</label>
          <div class="seg" data-seg="${o.key}">
            ${o.options
              .map(
                ([value, label]) =>
                  `<button class="seg-btn${
                    (opt(o.key) ?? o.def) === value ? " is-active" : ""
                  }" data-value="${value}">${label}</button>`
              )
              .join("")}
          </div>
        </div>`);
    } else if (o.type === "select") {
      parts.push(`
        <div class="opt" data-opt="${o.key}">
          <label for="opt-${o.key}">${o.label}</label>
          <select class="select" id="opt-${o.key}" data-select="${o.key}">
            ${o.options
              .map(
                ([value, label]) =>
                  `<option value="${value}"${
                    String(opt(o.key) ?? o.def) === String(value) ? " selected" : ""
                  }>${label}</option>`
              )
              .join("")}
          </select>
        </div>`);
    } else if (o.type === "button") {
      parts.push(
        `<button class="btn${o.primary ? " btn-primary" : " btn-ghost"}" data-action-btn="${
          o.label
        }">${o.icon ? icon(o.icon) : ""}<span>${o.label}</span></button>`
      );
    }
  }

  // colors are shared across tools, so show them inline for painting tools
  if (tool.opts?.some((o) => o.key === "size") || tool.group === "Shape") {
    parts.push(
      `<span class="sep"></span>`,
      `<div class="opt"><label>Color</label>
         <button class="opt-swatch" data-pick="primary" data-tip="Primary color"><i></i></button>
         <button class="opt-swatch" data-pick="secondary" data-tip="Secondary color"><i></i></button>
       </div>`
    );
  }

  bar.innerHTML = parts.join("");

  if (optionsWired) {
    syncOptionSwatches();
    return;
  }
  optionsWired = true;

  bar.addEventListener("input", onOptionInput);
  bar.addEventListener("change", onOptionInput);
  bar.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      setOpt(toggle.dataset.toggle, !opt(toggle.dataset.toggle));
      toggle.classList.toggle("is-on");
      return;
    }
    const seg = e.target.closest("[data-seg] .seg-btn");
    if (seg) {
      const key = seg.closest("[data-seg]").dataset.seg;
      setOpt(key, seg.dataset.value);
      $$(".seg-btn", seg.parentElement).forEach((b) =>
        b.classList.toggle("is-active", b === seg)
      );
      return;
    }
    const actionBtn = e.target.closest("[data-action-btn]");
    if (actionBtn) {
      const spec = (activeTool().opts || []).find(
        (o) => o.type === "button" && o.label === actionBtn.dataset.actionBtn
      );
      spec?.onClick?.();
      return;
    }
    const pick = e.target.closest("[data-pick]");
    if (pick) setActiveChip(pick.dataset.pick);
  });

  syncOptionSwatches();
}

function onOptionInput(e) {
  const range = e.target.closest("[data-key]");
  if (range) {
    const key = range.dataset.key;
    const value = Number(range.value);
    setOpt(key, value);
    const num = $(`[data-num="${key}"]`, $("#optionsBar"));
    if (num) num.value = String(value);
    activeTool().onOptsChange?.();
    return;
  }
  const num = e.target.closest("[data-num]");
  if (num) {
    const key = num.dataset.num;
    const spec = (activeTool().opts || []).find((o) => o.key === key);
    let value = parseFloat(num.value);
    if (Number.isNaN(value)) value = opt(key);
    value = Math.min(spec.max, Math.max(spec.min, value));
    setOpt(key, value);
    num.value = String(value);
    const slider = $(`[data-key="${key}"]`, $("#optionsBar"));
    if (slider) slider.value = String(value);
    activeTool().onOptsChange?.();
    return;
  }
  const select = e.target.closest("[data-select]");
  if (select) {
    setOpt(select.dataset.select, select.value);
    activeTool().onOptsChange?.();
  }
}

function syncOptionSwatches() {
  const bar = $("#optionsBar");
  const p = $('[data-pick="primary"] i', bar);
  const s = $('[data-pick="secondary"] i', bar);
  if (p) p.style.background = cssColor(state.primary);
  if (s) s.style.background = cssColor(state.secondary);
  $$("[data-pick]", bar).forEach((el) =>
    el.classList.toggle("is-active", el.dataset.pick === state.activeChip)
  );
}

/* ============================== color picker ============================== */

const picker = { h: 0, s: 0, v: 0, a: 1, silent: false };

function buildColorPanel() {
  const canvas = $("#svCanvas");
  const field = $("#svField");
  const hue = $("#hueSlider");
  const alpha = $("#alphaSlider");
  const hex = $("#hexInput");

  const commit = () => {
    const { r, g, b } = hsvToRgb(picker.h, picker.s, picker.v);
    setColor({ r, g, b, a: picker.a });
  };

  // Dragging the field or a slider streams hundreds of colours; only the one
  // the user settles on belongs in the recents list.
  let settleTimer = 0;
  const settle = () => {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => recordRecent(), 500);
  };

  const pickAt = (e) => {
    const rect = field.getBoundingClientRect();
    picker.s = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    picker.v = 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    commit();
  };

  field.addEventListener("pointerdown", (e) => {
    field.setPointerCapture(e.pointerId);
    clearTimeout(settleTimer);
    pickAt(e);
    const move = (ev) => pickAt(ev);
    const up = () => {
      field.removeEventListener("pointermove", move);
      field.removeEventListener("pointerup", up);
      recordRecent();
    };
    field.addEventListener("pointermove", move);
    field.addEventListener("pointerup", up);
  });

  hue.addEventListener("input", () => {
    picker.h = Number(hue.value);
    commit();
  });
  hue.addEventListener("change", settle);

  alpha.addEventListener("input", () => {
    picker.a = Number(alpha.value) / 100;
    commit();
  });
  alpha.addEventListener("change", settle);

  hex.addEventListener("change", () => {
    const c = parseColor(hex.value);
    if (c) setColor(c, state.activeChip, { record: true });
    else syncColorPanel();
  });

  $("#primaryChip").addEventListener("click", () => setActiveChip("primary"));
  $("#secondaryChip").addEventListener("click", () => setActiveChip("secondary"));
  $("#swapColorsBtn").addEventListener("click", swapColors);
  $("#resetColorsBtn").addEventListener("click", () => {
    setColor("#111115", "primary");
    setColor("#ffffff", "secondary");
  });
  $("#pickFromCanvas").addEventListener("click", () => setTool("eyedropper"));

  $("#swatchGrid").innerHTML = state.swatches
    .map(
      (c) =>
        `<button class="swatch" style="background:${c}" data-color="${c}" data-tip="${c.toUpperCase()}" aria-label="${c}"></button>`
    )
    .join("");

  $("#swatchGrid").addEventListener("click", (e) => {
    const sw = e.target.closest("[data-color]");
    if (sw) setColor(sw.dataset.color, state.activeChip, { record: true });
  });

  $("#recentRow").addEventListener("click", (e) => {
    const sw = e.target.closest("[data-color]");
    if (sw) setColor(sw.dataset.color, state.activeChip, { record: true });
  });

  drawSV(canvas);
  syncColorPanel();
}

function drawSV(canvas) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const base = hsvToRgb(picker.h, 1, 1);
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  ctx.fillRect(0, 0, w, h);

  const white = ctx.createLinearGradient(0, 0, w, 0);
  white.addColorStop(0, "rgba(255,255,255,1)");
  white.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = white;
  ctx.fillRect(0, 0, w, h);

  const black = ctx.createLinearGradient(0, 0, 0, h);
  black.addColorStop(0, "rgba(0,0,0,0)");
  black.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = black;
  ctx.fillRect(0, 0, w, h);
}

/** Push state → picker widgets (called whenever the active color changes). */
function syncColorPanel() {
  const color = state[state.activeChip];
  const hsv = rgbToHsv(color);
  // keep the hue slider steady on greys, where hue is undefined
  picker.h = hsv.s > 0.004 ? hsv.h : picker.h;
  picker.s = hsv.s;
  picker.v = hsv.v;
  picker.a = color.a ?? 1;

  drawSV($("#svCanvas"));
  const field = $("#svField");
  const thumb = $("#svThumb");
  thumb.style.left = `${picker.s * field.clientWidth}px`;
  thumb.style.top = `${(1 - picker.v) * field.clientHeight}px`;
  thumb.style.background = cssColor(color);

  $("#hueSlider").value = String(Math.round(picker.h));
  $("#alphaSlider").value = String(Math.round(picker.a * 100));
  $("#alphaTrack").style.setProperty("--alpha-color", rgbToHex(color));
  $("#hexInput").value = rgbToHex(color, color.a < 1);
  $("#rgbReadout").textContent = `${color.r}, ${color.g}, ${color.b}${
    color.a < 1 ? `, ${color.a.toFixed(2)}` : ""
  }`;

  $("#primaryChip .chip-fill").style.background = cssColor(state.primary);
  $("#secondaryChip .chip-fill").style.background = cssColor(state.secondary);
  $("#primaryChip").classList.toggle("is-active", state.activeChip === "primary");
  $("#secondaryChip").classList.toggle("is-active", state.activeChip === "secondary");

  $("#recentRow").innerHTML = state.recent
    .map(
      (c) =>
        `<button class="swatch" style="background:${c}" data-color="${c}" data-tip="${c.toUpperCase()}" aria-label="${c}"></button>`
    )
    .join("");

  syncOptionSwatches();
}

/* ================================= layers ================================= */

const thumbCache = new WeakMap();

function layerThumb(layer) {
  const cached = thumbCache.get(layer);
  if (cached && cached.version === layer.version) return cached.canvas;
  const maxW = 76;
  const maxH = 60;
  const scale = Math.min(maxW / layer.width, maxH / layer.height);
  const c = makeCanvas(Math.max(1, layer.width * scale), Math.max(1, layer.height * scale));
  const cc = ctx2d(c);
  cc.drawImage(layer.canvas, 0, 0, c.width, c.height);
  thumbCache.set(layer, { version: layer.version, canvas: c });
  return c;
}

function buildLayersPanel() {
  $("#layerBlend").innerHTML = BLEND_MODES.map(
    ([value, label]) => `<option value="${value}">${label}</option>`
  ).join("");

  $("#layerBlend").addEventListener("change", (e) => {
    A.setLayerProp(state.doc.activeIndex, "blend", e.target.value, "Blend mode");
  });

  // dragging previews live; the undo entry is written once the drag settles
  const opacity = $("#layerOpacity");
  let opacityBefore = null;
  opacity.addEventListener("input", () => {
    const layer = state.doc?.active;
    if (!layer) return;
    if (opacityBefore === null) opacityBefore = layer.opacity;
    $("#layerOpacityOut").value = `${opacity.value}%`;
    A.previewLayerProp(state.doc.activeIndex, "opacity", Number(opacity.value) / 100);
  });
  opacity.addEventListener("change", () => {
    const layer = state.doc?.active;
    if (!layer) return;
    const value = Number(opacity.value) / 100;
    if (opacityBefore !== null) layer.opacity = opacityBefore;
    opacityBefore = null;
    A.setLayerProp(state.doc.activeIndex, "opacity", value, "Layer opacity");
  });

  $("#addLayerBtn").addEventListener("click", A.addLayer);
  $("#dupLayerBtn").addEventListener("click", A.duplicateLayer);
  $("#mergeLayerBtn").addEventListener("click", A.mergeDown);
  $("#delLayerBtn").addEventListener("click", () => A.deleteLayer());

  const list = $("#layerList");

  list.addEventListener("click", (e) => {
    const item = e.target.closest(".layer-item");
    if (!item) return;
    const index = Number(item.dataset.index);
    const toggle = e.target.closest("[data-toggle-layer]");
    if (toggle) {
      const prop = toggle.dataset.toggleLayer;
      const layer = state.doc.layers[index];
      A.setLayerProp(
        index,
        prop,
        !layer[prop],
        prop === "visible" ? "Layer visibility" : "Lock layer"
      );
      return;
    }
    A.setActiveLayer(index);
  });

  list.addEventListener("dblclick", (e) => {
    const nameEl = e.target.closest(".layer-name");
    if (!nameEl) return;
    const item = nameEl.closest(".layer-item");
    const index = Number(item.dataset.index);
    startRename(nameEl, index);
  });

  // drag to reorder
  let dragIndex = null;
  list.addEventListener("dragstart", (e) => {
    const item = e.target.closest(".layer-item");
    if (!item) return;
    dragIndex = Number(item.dataset.index);
    item.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(dragIndex));
  });
  list.addEventListener("dragover", (e) => {
    e.preventDefault();
    const item = e.target.closest(".layer-item");
    if (!item || dragIndex === null) return;
    const rect = item.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    $$(".layer-item", list).forEach((el) =>
      el.classList.remove("drop-above", "drop-below")
    );
    item.classList.add(above ? "drop-above" : "drop-below");
  });
  list.addEventListener("drop", (e) => {
    e.preventDefault();
    const item = e.target.closest(".layer-item");
    $$(".layer-item", list).forEach((el) =>
      el.classList.remove("drop-above", "drop-below", "is-dragging")
    );
    if (!item || dragIndex === null) return;
    const target = Number(item.dataset.index);
    const rect = item.getBoundingClientRect();
    const above = e.clientY < rect.top + rect.height / 2;
    // list is rendered top-down, so "above" means a higher array index
    let to = above ? target + 1 : target;
    if (dragIndex < to) to -= 1;
    A.moveLayer(dragIndex, to);
    dragIndex = null;
  });
  list.addEventListener("dragend", () => {
    $$(".layer-item", list).forEach((el) =>
      el.classList.remove("drop-above", "drop-below", "is-dragging")
    );
    dragIndex = null;
  });
}

function startRename(nameEl, index) {
  const layer = state.doc.layers[index];
  const input = document.createElement("input");
  input.className = "layer-name-input";
  input.value = layer.name;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  const done = (save) => {
    if (save && input.value.trim()) {
      A.setLayerProp(index, "name", input.value.trim(), "Rename layer");
    }
    syncLayers();
  };
  input.addEventListener("blur", () => done(true));
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") done(true);
    if (e.key === "Escape") done(false);
  });
}

function syncLayers() {
  const doc = state.doc;
  const list = $("#layerList");
  if (!doc) {
    list.innerHTML = "";
    return;
  }

  const items = [];
  for (let i = doc.layers.length - 1; i >= 0; i--) {
    const layer = doc.layers[i];
    items.push(`
      <div class="layer-item${i === doc.activeIndex ? " is-active" : ""}${
      layer.visible ? "" : " is-hidden"
    }" data-index="${i}" draggable="true" role="listitem">
        <span class="layer-thumb" data-thumb="${i}"></span>
        <span class="layer-info">
          <span class="layer-name">${escapeHtml(layer.name)}</span>
          <span class="layer-sub">${
            BLEND_MODES.find(([v]) => v === layer.blend)?.[1] || "Normal"
          } · ${Math.round(layer.opacity * 100)}%</span>
        </span>
        <span class="layer-actions">
          <button class="icon-btn xs" data-toggle-layer="visible" data-tip="${
            layer.visible ? "Hide layer" : "Show layer"
          }" aria-label="Toggle visibility">${icon(layer.visible ? "i-eye" : "i-eye-off")}</button>
          <button class="icon-btn xs" data-toggle-layer="locked" data-tip="${
            layer.locked ? "Unlock layer" : "Lock layer"
          }" aria-label="Toggle lock">${icon("i-lock")}</button>
        </span>
      </div>`);
  }
  list.innerHTML = items.join("");

  for (const holder of $$("[data-thumb]", list)) {
    const layer = doc.layers[Number(holder.dataset.thumb)];
    holder.appendChild(layerThumb(layer));
  }
  $$("[data-toggle-layer='locked']", list).forEach((btn) => {
    const index = Number(btn.closest(".layer-item").dataset.index);
    btn.classList.toggle("is-active", doc.layers[index].locked);
  });

  const active = doc.active;
  if (active) {
    $("#layerBlend").value = active.blend;
    $("#layerOpacity").value = String(Math.round(active.opacity * 100));
    $("#layerOpacityOut").value = `${Math.round(active.opacity * 100)}%`;
  }
  $("#mergeLayerBtn").disabled = doc.activeIndex <= 0;
  $("#delLayerBtn").disabled = doc.layers.length <= 1;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/* =============================== adjustments ============================== */

function buildAdjustPanel() {
  const host = $("#adjustList");
  host.innerHTML = ADJUST_GROUPS.map(
    (group) => `
      <span class="adjust-group-label">${group.group}</span>
      ${group.items
        .map(
          (item) => `
        <div class="adjust-row" data-adjust="${item.id}">
          <div class="adjust-head">
            <label for="adj-${item.id}" data-reset="${item.id}">${item.label}</label>
            <span class="adjust-val">0${item.unit || ""}</span>
          </div>
          <input id="adj-${item.id}" type="range" min="${item.min}" max="${item.max}"
                 step="1" value="0" data-adjust-key="${item.id}" />
        </div>`
        )
        .join("")}`
  ).join("");

  host.addEventListener("input", (e) => {
    const slider = e.target.closest("[data-adjust-key]");
    if (!slider) return;
    A.previewAdjustments({ [slider.dataset.adjustKey]: Number(slider.value) });
    syncAdjustRow(slider.dataset.adjustKey);
  });

  // double-click a label to zero that one slider
  host.addEventListener("dblclick", (e) => {
    const label = e.target.closest("[data-reset]");
    if (!label) return;
    const key = label.dataset.reset;
    $(`[data-adjust-key="${key}"]`, host).value = "0";
    A.previewAdjustments({ [key]: 0 });
    syncAdjustRow(key);
  });

  $("#adjustApplyBtn").addEventListener("click", A.commitAdjustments);
  $("#adjustResetBtn").addEventListener("click", A.resetAdjustments);
}

function syncAdjustRow(key) {
  const row = $(`[data-adjust="${key}"]`);
  if (!row) return;
  const item = ADJUST_GROUPS.flatMap((g) => g.items).find((i) => i.id === key);
  const value = A.adjustValues[key] || 0;
  $(".adjust-val", row).textContent = `${value > 0 ? "+" : ""}${value}${item.unit || ""}`;
  row.classList.toggle("is-changed", value !== 0);
}

function syncAdjustPanel() {
  for (const item of ADJUST_GROUPS.flatMap((g) => g.items)) {
    const slider = $(`[data-adjust-key="${item.id}"]`);
    if (slider) slider.value = String(A.adjustValues[item.id] || 0);
    syncAdjustRow(item.id);
  }
}

/* ================================= filters ================================ */

let filterTimer = 0;
let filtersDirty = true;

function buildFilterPanel() {
  const grid = $("#filterGrid");
  grid.innerHTML = EFFECTS.map(
    (e) => `
    <button class="filter-card" data-filter="${e.id}" data-tip="Apply ${e.name}">
      <span class="filter-preview" data-preview="${e.id}"></span>
      <span class="filter-name">${e.name}</span>
    </button>`
  ).join("");

  grid.addEventListener("click", (e) => {
    const card = e.target.closest("[data-filter]");
    if (card) A.applyFilter(card.dataset.filter);
  });
}

function refreshFilterPreviews() {
  if (!state.doc || !filtersDirty) return;
  const panel = $('[data-panel="filters"]');
  if (!panel.classList.contains("is-active")) return;
  filtersDirty = false;
  for (const holder of $$("[data-preview]", panel)) {
    const canvas = A.filterPreview(holder.dataset.preview, 112, 70);
    holder.replaceChildren(canvas);
  }
}

function invalidateFilters() {
  filtersDirty = true;
  clearTimeout(filterTimer);
  filterTimer = setTimeout(refreshFilterPreviews, 350);
}

/* ================================== tabs ================================== */

function buildTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$(".tab").forEach((t) => t.classList.toggle("is-active", t === tab));
      $$(".tab-panel").forEach((p) =>
        p.classList.toggle("is-active", p.dataset.panel === tab.dataset.tab)
      );
      if (tab.dataset.tab === "filters") refreshFilterPreviews();
    });
  });
}

export function openTab(name) {
  const tab = $(`.tab[data-tab="${name}"]`);
  tab?.click();
  $("#sidebar").classList.add("is-open");
}

/* ================================ chrome ================================== */

function buildChrome() {
  $("#undoBtn").addEventListener("click", A.undo);
  $("#redoBtn").addEventListener("click", A.redo);
  $("#themeBtn").addEventListener("click", () =>
    setTheme(state.theme === "dark" ? "light" : "dark")
  );

  $("#docTitle").addEventListener("change", (e) => {
    if (state.doc) state.doc.name = e.target.value.trim() || "Untitled";
  });
  $("#docTitle").addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") e.target.blur();
  });

  $("#zoomInBtn").addEventListener("click", () => view.zoomStep(1));
  $("#zoomOutBtn").addEventListener("click", () => view.zoomStep(-1));
  $("#zoomValue").addEventListener("click", () => view.actualSize());
  $("#fitBtn").addEventListener("click", () => view.fit());

  // panels toggle for narrow screens
  const toggle = document.createElement("button");
  toggle.className = "panel-toggle";
  toggle.dataset.tip = "Panels";
  toggle.setAttribute("aria-label", "Toggle panels");
  toggle.innerHTML = icon("i-panel");
  toggle.addEventListener("click", () => $("#sidebar").classList.toggle("is-open"));
  $(".stage-hud").prepend(toggle);
}

function syncHistoryButtons() {
  $("#undoBtn").disabled = !history.canUndo;
  $("#redoBtn").disabled = !history.canRedo;
  $("#undoBtn").dataset.tip = history.undoLabel
    ? `Undo ${history.undoLabel} · ${MOD}Z`
    : `Undo · ${MOD}Z`;
  $("#redoBtn").dataset.tip = history.redoLabel
    ? `Redo ${history.redoLabel} · ⇧${MOD}Z`
    : `Redo · ⇧${MOD}Z`;
}

function syncDocMeta() {
  const doc = state.doc;
  $("#docTitle").value = doc?.name || "Untitled";
  $("#docMeta").textContent = doc ? `${doc.width} × ${doc.height}` : "";
  $("#statusSize").textContent = doc ? `${doc.width} × ${doc.height} px` : "—";
  $("#themeBtn").innerHTML = icon(state.theme === "dark" ? "i-moon" : "i-sun");
}

function syncZoom() {
  const z = view.zoom;
  $("#zoomValue").textContent =
    z >= 1 ? `${Math.round(z * 100)}%` : `${(z * 100).toFixed(z < 0.1 ? 1 : 0)}%`;
}

function syncStatus() {
  const doc = state.doc;
  const p = state.cursor;
  $("#statusPos").textContent = p
    ? `${Math.floor(p.x)}, ${Math.floor(p.y)}`
    : "—";
  const b = doc?.selection?.bounds;
  $("#statusSel").textContent = b ? `Selection ${b.w} × ${b.h}` : "";
}

/* ================================= toasts ================================= */

export function toast(msg, kind = "info", { action } = {}) {
  const host = $("#toasts");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(
    kind === "ok" ? "i-check" : kind === "err" ? "i-close" : "i-sparkles"
  )}<span></span>`;
  $("span", el).textContent = msg;
  if (action) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      action.onClick();
      dismiss();
    });
    el.appendChild(btn);
  }
  host.appendChild(el);

  const dismiss = () => {
    el.classList.add("is-out");
    setTimeout(() => el.remove(), 220);
  };
  const timer = setTimeout(dismiss, action ? 6000 : 2600);
  el.addEventListener("click", (e) => {
    if (e.target.tagName !== "BUTTON") {
      clearTimeout(timer);
      dismiss();
    }
  });
  while (host.children.length > 3) host.firstElementChild.remove();
}

/* ================================ tooltips ================================ */

function initTooltips() {
  const tip = $("#tooltip");
  let timer = 0;
  let current = null;

  const hide = () => {
    clearTimeout(timer);
    tip.hidden = true;
    current = null;
  };

  document.addEventListener("pointerover", (e) => {
    const host = e.target.closest?.("[data-tip]");
    if (!host || host === current) return;
    hide();
    current = host;
    timer = setTimeout(() => {
      const text = host.dataset.tip;
      if (!text) return;
      tip.textContent = text;
      tip.hidden = false;
      const r = host.getBoundingClientRect();
      const t = tip.getBoundingClientRect();
      let x = r.left + r.width / 2 - t.width / 2;
      let y = r.bottom + 7;
      if (y + t.height > innerHeight - 6) y = r.top - t.height - 7;
      tip.style.left = `${Math.max(6, Math.min(innerWidth - t.width - 6, x))}px`;
      tip.style.top = `${Math.max(6, y)}px`;
    }, 380);
  });

  document.addEventListener("pointerout", (e) => {
    if (current && !current.contains(e.relatedTarget)) hide();
  });
  document.addEventListener("pointerdown", hide);
  window.addEventListener("blur", hide);
}

/* ================================== busy ================================== */

/** Shown by actions.js around slow synchronous work on large documents. */
function setBusy(label) {
  const el = $("#busy");
  if (!label) {
    el.hidden = true;
    return;
  }
  $("#busyLabel").textContent = label;
  el.hidden = false;
}

/* ================================== init ================================== */

export function initUI() {
  buildRail();
  buildOptions();
  buildColorPanel();
  buildLayersPanel();
  buildAdjustPanel();
  buildFilterPanel();
  buildTabs();
  buildChrome();
  initTooltips();

  on("tool", () => {
    syncRail();
    buildOptions();
  });
  on("opts", () => {
    syncOptionSwatches();
    requestRender();
  });
  on("color", () => syncColorPanel());
  on("theme", () => {
    syncDocMeta();
    invalidateFilters();
  });
  on("layers", () => {
    syncLayers();
    invalidateFilters();
  });
  on("selection", syncStatus);
  on("cursor", syncStatus);
  on("history", syncHistoryButtons);
  on("adjust", syncAdjustPanel);
  on("zoom", syncZoom);
  on("view", syncZoom);
  on("doc", () => {
    syncDocMeta();
    syncLayers();
    syncStatus();
    syncZoom();
    invalidateFilters();
  });
  on("toast", ({ msg, kind, action }) => toast(msg, kind, { action }));
  on("busy", setBusy);

  syncHistoryButtons();
  syncDocMeta();
  syncZoom();
  syncStatus();
}
