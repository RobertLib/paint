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
import { formatNumber, formatPercent, platformKeys, t } from "./i18n.js";
import { requestRender } from "./render.js";
import {
  emit,
  markDirty,
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

/**
 * The command key in shortcut labels. Labels are written Mac-style and pass
 * through platformKeys() when shown, which reads Ctrl+… elsewhere.
 */
export const MOD = "⌘";

/* ================================== rail ================================== */

function buildRail() {
  const rail = $("#toolRail");
  rail.innerHTML = TOOL_GROUPS.map(
    (group) => `
    <div class="rail-group">
      <span class="rail-label">${t(group.name)}</span>
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
  brush: t("Alt-click samples a colour · [ and ] resize the brush"),
  pencil: t("Alt-click samples a colour · [ and ] resize the tip"),
  airbrush: t("Hold to build up paint · Flow sets the rate"),
  eraser: t("[ and ] resize · Hardness softens the edge"),
  bucket: t("Raise Tolerance to spread further · Expand tucks under outlines"),
  gradient: t("Drag to set direction and length · Shift constrains"),
  blurBrush: t("Paint over an area to soften it"),
  sharpenBrush: t("Paint over an area to add local contrast"),
  smudge: t("Drag to pull pixels along the stroke"),
  clone: t("Alt-click to set the source, then paint elsewhere"),
  line: t("Shift snaps to 45° steps"),
  arrow: t("Drag from tail to head"),
  rect: t("Shift for a square · Alt from the centre · Corner rounds it"),
  ellipse: t("Shift for a circle · Alt draws from the centre"),
  polygon: t("Shift for a regular shape · Sides sets the count"),
  star: t("Points sets the number of spikes"),
  text: t("Type on the canvas · ⌘/Ctrl + Enter commits · Esc cancels"),
  selectRect: t("Shift adds · Alt subtracts · click to deselect"),
  selectEllipse: t("Shift adds · Alt subtracts · click to deselect"),
  lasso: t("Draw a freehand loop · Shift adds · Alt subtracts"),
  wand: t("Click a colour · Tolerance controls the spread"),
  move: t("Drags the selected pixels, or the whole layer"),
  crop: t("Drag the frame or its handles · Enter applies"),
  eyedropper: t("Click to sample · Alt fills the other swatch"),
  hand: t("Drag to pan · Space does this with any tool"),
  zoom: t("Click to zoom in · Alt-click to zoom out"),
  transform: t("Drag a handle to scale · outside the box to rotate · Enter applies"),
  heal: t("Alt-click a clean area, then paint over the flaw"),
  spotHeal: t("Paint over a blemish — it is repaired when you let go"),
  dodge: t("Paint to lighten · Alt darkens · Range picks the tones"),
};

function syncRail() {
  $$("#toolRail .tool-btn").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.tool === state.tool);
    b.setAttribute("aria-pressed", String(b.dataset.tool === state.tool));
  });
  const tool = activeTool();
  $("#statusTool").textContent = tool.label;
  $("#statusHint").textContent =
    HINTS[tool.id] || t("Space + drag to pan · Scroll to zoom");
}

/* =============================== options bar ============================== */

/**
 * A bar that scrolls sideways with its scrollbar hidden (the options bar, the
 * menu bar on narrow screens): a mouse wheel scrolls it too, and an edge
 * with more beyond it fades out (.more-start / .more-end in layout.css).
 * Returns the function that re-measures it after its content changed.
 */
export function sideScroll(el) {
  const update = () => {
    const max = el.scrollWidth - el.clientWidth;
    el.classList.toggle("more-start", max > 1 && el.scrollLeft > 1);
    el.classList.toggle("more-end", max > 1 && el.scrollLeft < max - 1);
  };
  el.addEventListener("scroll", update, { passive: true });
  el.addEventListener(
    "wheel",
    (e) => {
      if (el.scrollWidth - el.clientWidth <= 1) return;
      // trackpads scroll sideways by themselves; a wheel only knows up/down
      if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientWidth : 1;
      el.scrollLeft += e.deltaY * unit;
    },
    { passive: false }
  );
  if (window.ResizeObserver) new ResizeObserver(update).observe(el);
  update();
  return update;
}

let optionsWired = false;
let measureOptions = () => {};

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
        `<button class="opt-toggle${opt(o.key) ? " is-on" : ""}" data-toggle="${o.key}" aria-pressed="${!!opt(o.key)}">
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
                  }" data-value="${value}" aria-pressed="${(opt(o.key) ?? o.def) === value}">${label}</button>`
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
      // a button that waits for something (Set source) looks like a toggle
      const pressed = o.pressed ? !!o.pressed() : null;
      const cls =
        pressed === null
          ? `btn${o.primary ? " btn-primary" : " btn-ghost"}`
          : `opt-toggle${pressed ? " is-on" : ""}`;
      parts.push(
        `<button class="${cls}" data-action-btn="${o.label}"${
          pressed === null ? "" : ` aria-pressed="${pressed}"`
        }>${o.icon ? icon(o.icon) : ""}<span>${o.label}</span></button>`
      );
    }
  }

  // colors are shared across tools, so show them inline for painting tools
  if (tool.opts?.some((o) => o.key === "size") || tool.group === "Shape") {
    parts.push(
      `<span class="sep"></span>`,
      `<div class="opt"><label>${t("Color")}</label>
         <button class="opt-swatch" data-pick="primary" data-tip="${t("Primary color")}" aria-label="${t("Primary color")}"><i></i></button>
         <button class="opt-swatch" data-pick="secondary" data-tip="${t("Secondary color")}" aria-label="${t("Secondary color")}"><i></i></button>
       </div>`
    );
  }

  bar.innerHTML = parts.join("");
  // a new tool's options start at the beginning
  bar.scrollLeft = 0;

  if (optionsWired) {
    syncOptionSwatches();
    measureOptions();
    return;
  }
  optionsWired = true;
  measureOptions = sideScroll(bar);

  bar.addEventListener("input", onOptionInput);
  bar.addEventListener("change", onOptionInput);
  bar.addEventListener("click", (e) => {
    const toggle = e.target.closest("[data-toggle]");
    if (toggle) {
      const on = !opt(toggle.dataset.toggle);
      setOpt(toggle.dataset.toggle, on);
      toggle.classList.toggle("is-on", on);
      toggle.setAttribute("aria-pressed", String(on));
      activeTool().onOptsChange?.();
      return;
    }
    const seg = e.target.closest("[data-seg] .seg-btn");
    if (seg) {
      const key = seg.closest("[data-seg]").dataset.seg;
      setOpt(key, seg.dataset.value);
      $$(".seg-btn", seg.parentElement).forEach((b) => {
        b.classList.toggle("is-active", b === seg);
        b.setAttribute("aria-pressed", String(b === seg));
      });
      activeTool().onOptsChange?.();
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
    if (!spec) return;
    const value = parseFloat(num.value);
    const inRange = Number.isFinite(value) && value >= spec.min && value <= spec.max;
    // while typing ("1" on the way to "12") take only values that already
    // make sense and leave the field alone; tidy it up when editing ends
    if (e.type === "input") {
      if (!inRange) return;
    } else {
      const clamped = Number.isFinite(value)
        ? Math.min(spec.max, Math.max(spec.min, Math.round(value)))
        : opt(key) ?? spec.def;
      num.value = String(clamped);
      if (clamped === opt(key)) return;
      setOpt(key, clamped);
      const slider = $(`[data-key="${key}"]`, $("#optionsBar"));
      if (slider) slider.value = String(clamped);
      activeTool().onOptsChange?.();
      return;
    }
    setOpt(key, value);
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
    const end = () => {
      field.removeEventListener("pointermove", move);
      field.removeEventListener("pointerup", end);
      field.removeEventListener("pointercancel", end);
      field.removeEventListener("lostpointercapture", end);
      recordRecent();
    };
    field.addEventListener("pointermove", move);
    field.addEventListener("pointerup", end);
    field.addEventListener("pointercancel", end);
    field.addEventListener("lostpointercapture", end);
  });

  // the field works from the keyboard too: arrows move the picker
  // (aria-valuenow follows saturation, the value text names both axes)
  field.tabIndex = 0;
  field.setAttribute("role", "slider");
  field.setAttribute("aria-label", t("Saturation and brightness"));
  field.setAttribute("aria-valuemin", "0");
  field.setAttribute("aria-valuemax", "100");
  field.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.1 : 0.01;
    const moves = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    picker.s = Math.min(1, Math.max(0, picker.s + m[0]));
    picker.v = Math.min(1, Math.max(0, picker.v + m[1]));
    // the picker owns s/v here: rounding to RGB must not pull them back
    picker.silent = true;
    try {
      commit();
    } finally {
      picker.silent = false;
    }
    settle();
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
  wireColorCollapse();

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

/** The colour panel folds down to its two chips (and stays so next time). */
const COLLAPSE_KEY = "paint-studio:color-collapsed";

function wireColorCollapse() {
  const panel = $(".color-panel");
  const btn = $("#colorCollapse");
  if (!panel || !btn) return;
  const apply = (collapsed) => {
    panel.classList.toggle("is-collapsed", collapsed);
    btn.setAttribute("aria-expanded", String(!collapsed));
    const label = collapsed ? t("Expand color panel") : t("Collapse color panel");
    btn.setAttribute("aria-label", label);
    btn.dataset.tip = label;
  };
  let collapsed = false;
  try {
    collapsed = localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    /* storage blocked: start expanded */
  }
  apply(collapsed);
  btn.addEventListener("click", () => {
    collapsed = !panel.classList.contains("is-collapsed");
    apply(collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* not remembered */
    }
  });
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
  if (!picker.silent) {
    // Only a different colour moves the picker. RGB loses what the picker
    // still knows: black (value 0) has no hue or saturation, greys no hue —
    // dragging along the bottom edge must not snap the marker to the left.
    const shown = hsvToRgb(picker.h, picker.s, picker.v);
    if (shown.r !== color.r || shown.g !== color.g || shown.b !== color.b) {
      const hsv = rgbToHsv(color);
      // keep the hue slider steady on greys, where hue is undefined
      picker.h = hsv.s > 0.004 ? hsv.h : picker.h;
      picker.s = hsv.s;
      picker.v = hsv.v;
    }
  }
  picker.a = color.a ?? 1;

  drawSV($("#svCanvas"));
  const field = $("#svField");
  const thumb = $("#svThumb");
  // percentages stay right while the panel is hidden or resized
  thumb.style.left = `${picker.s * 100}%`;
  thumb.style.top = `${(1 - picker.v) * 100}%`;
  thumb.style.background = cssColor(color);
  field.setAttribute("aria-valuenow", String(Math.round(picker.s * 100)));
  field.setAttribute(
    "aria-valuetext",
    `${t("Saturation")} ${formatPercent(picker.s)}, ${t("Brightness")} ${formatPercent(picker.v)}`
  );

  $("#hueSlider").value = String(Math.round(picker.h));
  $("#alphaSlider").value = String(Math.round(picker.a * 100));
  $("#alphaTrack").style.setProperty("--alpha-color", rgbToHex(color));
  $("#hexInput").value = rgbToHex(color, color.a < 1);
  $("#rgbReadout").textContent = `${color.r}, ${color.g}, ${color.b}${
    color.a < 1 ? ` · ${formatPercent(color.a)}` : ""
  }`;

  $("#primaryChip .chip-fill").style.background = cssColor(state.primary);
  $("#secondaryChip .chip-fill").style.background = cssColor(state.secondary);
  $("#primaryChip").classList.toggle("is-active", state.activeChip === "primary");
  $("#secondaryChip").classList.toggle("is-active", state.activeChip === "secondary");
  $("#primaryChip").setAttribute("aria-pressed", String(state.activeChip === "primary"));
  $("#secondaryChip").setAttribute("aria-pressed", String(state.activeChip === "secondary"));

  // stored preferences are only trusted as plain hex colours
  $("#recentRow").innerHTML = state.recent
    .filter((c) => typeof c === "string" && /^#[0-9a-f]{3,8}$/i.test(c))
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

const maskThumbCache = new WeakMap();

/** Mask preview: white = visible, black = hidden. */
function maskThumb(layer) {
  const cached = maskThumbCache.get(layer);
  if (cached && cached.version === layer.version) return cached.canvas;
  const scale = Math.min(76 / layer.width, 60 / layer.height);
  const c = makeCanvas(Math.max(1, layer.width * scale), Math.max(1, layer.height * scale));
  const cc = ctx2d(c);
  cc.fillStyle = "#000";
  cc.fillRect(0, 0, c.width, c.height);
  cc.drawImage(layer.mask, 0, 0, c.width, c.height);
  maskThumbCache.set(layer, { version: layer.version, canvas: c });
  return c;
}

function buildLayersPanel() {
  $("#layerBlend").innerHTML = BLEND_MODES.map(
    ([value, label]) => `<option value="${value}">${label}</option>`
  ).join("");

  $("#layerBlend").addEventListener("change", (e) => {
    A.setLayerProp(state.doc.activeIndex, "blend", e.target.value, t("Blend mode"));
  });

  // Dragging previews live; the undo entry is written once the drag settles.
  // The value before the drag belongs to that layer and that drag only: a
  // drag that ends where it started fires no "change", and its baseline must
  // not become the next drag's (on another layer, after an undo…).
  const opacity = $("#layerOpacity");
  let opacityDrag = null; // { id, before }
  // released where it started: no "change" comes — put back the exact value
  // (an opacity like 0.333 from a PSD is shown as 33 %)
  const endOpacityDrag = () => {
    window.removeEventListener("pointerup", endOpacityDrag);
    window.removeEventListener("pointercancel", endOpacityDrag);
    setTimeout(() => {
      const drag = opacityDrag;
      if (!drag) return;
      opacityDrag = null;
      const at = state.doc?.indexOfLayer(drag.id) ?? -1;
      if (at >= 0) A.previewLayerProp(at, "opacity", drag.before);
    }, 0);
  };
  opacity.addEventListener("pointerdown", () => {
    opacityDrag = null;
    window.addEventListener("pointerup", endOpacityDrag);
    window.addEventListener("pointercancel", endOpacityDrag);
  });
  opacity.addEventListener("keydown", () => {
    opacityDrag = null;
  });
  opacity.addEventListener("input", () => {
    const layer = state.doc?.active;
    if (!layer) return;
    if (!opacityDrag || opacityDrag.id !== layer.id) {
      opacityDrag = { id: layer.id, before: layer.opacity };
    }
    $("#layerOpacityOut").value = formatPercent(Number(opacity.value) / 100);
    A.previewLayerProp(state.doc.activeIndex, "opacity", Number(opacity.value) / 100);
  });
  opacity.addEventListener("change", () => {
    const layer = state.doc?.active;
    const drag = opacityDrag;
    opacityDrag = null;
    if (!layer) return;
    const value = Number(opacity.value) / 100;
    if (drag && drag.id === layer.id) layer.opacity = drag.before;
    A.setLayerProp(state.doc.activeIndex, "opacity", value, t("Layer opacity"));
  });

  $("#addLayerBtn").addEventListener("click", A.addLayer);
  $("#dupLayerBtn").addEventListener("click", A.duplicateLayer);
  $("#mergeLayerBtn").addEventListener("click", A.mergeDown);
  $("#delLayerBtn").addEventListener("click", () => A.deleteLayer());
  $("#maskLayerBtn").addEventListener("click", () => {
    if (state.doc?.active?.mask) A.deleteMask();
    else A.addMask();
  });

  const list = $("#layerList");

  list.addEventListener("click", (e) => {
    const item = e.target.closest(".layer-item");
    if (!item) return;
    const index = Number(item.dataset.index);
    const pick = e.target.closest("[data-pick-target]");
    if (pick) {
      if (pick.dataset.pickTarget === "mask" && e.shiftKey) {
        A.toggleMaskEnabled(index);
        return;
      }
      A.setActiveLayer(index, { mask: pick.dataset.pickTarget === "mask" });
      return;
    }
    const toggle = e.target.closest("[data-toggle-layer]");
    if (toggle) {
      const prop = toggle.dataset.toggleLayer;
      const layer = state.doc.layers[index];
      // named after what the click does: a locked layer gets unlocked
      A.setLayerProp(
        index,
        prop,
        !layer[prop],
        prop === "visible" ? t("Layer visibility") : layer.locked ? t("Unlock layer") : t("Lock layer")
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

  // keyboard: Enter/Space selects, F2 renames, arrows move between rows
  list.addEventListener("keydown", (e) => {
    const item = e.target.closest?.(".layer-item");
    if (!item) return;
    // the buttons in a row (thumbnails, eye, lock) press themselves: the keys
    // must not also reach the global shortcuts (Enter applies a crop, Space
    // pans)
    if (e.target !== item) {
      if (e.target.tagName === "BUTTON" && (e.key === "Enter" || e.key === " ")) {
        e.stopPropagation();
      }
      return;
    }
    const index = Number(item.dataset.index);
    const id = state.doc?.layers[index]?.id;
    // keys handled here must not also reach the global shortcuts (Enter
    // would apply a crop, Space would arm panning)
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      A.setActiveLayer(index);
      focusLayer(id);
    } else if (e.key === "F2") {
      e.preventDefault();
      e.stopPropagation();
      const nameEl = $(".layer-name", item);
      if (nameEl) startRename(nameEl, index);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const next = index + (e.key === "ArrowUp" ? 1 : -1);
      $(`.layer-item[data-index="${next}"]`, list)?.focus();
    }
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

/** F2 outside the list (a focused row handles its own): rename the active layer. */
export function renameActiveLayer() {
  const doc = state.doc;
  if (!doc?.active) return;
  // the field appears in the Layers panel: bring it forward
  openTab("layers");
  const nameEl = $(`#layerList .layer-item[data-index="${doc.activeIndex}"] .layer-name`);
  if (nameEl) startRename(nameEl, doc.activeIndex);
}

function startRename(nameEl, index) {
  const layer = state.doc.layers[index];
  if (!layer) return;
  const id = layer.id;
  // the row is selected before the field appears: selecting rebuilds the
  // list, and left to the first click into the field it threw the field
  // away together with the name being typed
  if (index !== state.doc.activeIndex) {
    A.setActiveLayer(index);
    const at = state.doc.indexOfLayer(id);
    nameEl = $(`#layerList .layer-item[data-index="${at}"] .layer-name`);
    if (!nameEl) return;
  }
  const item = nameEl.closest(".layer-item");
  const input = document.createElement("input");
  // typed, so the text-field styles apply (16px on touch screens: no iOS zoom)
  input.type = "text";
  input.className = "layer-name-input";
  input.value = layer.name;
  input.setAttribute("aria-label", t("Layer name"));
  // clicks in the field place the caret — they are not clicks on the row,
  // and selecting its text must not start dragging the row
  for (const type of ["click", "dblclick"]) {
    input.addEventListener(type, (e) => e.stopPropagation());
  }
  if (item) item.draggable = false;
  nameEl.replaceWith(input);
  input.focus();
  input.select();
  let finished = false;
  const done = (save, { refocus = false } = {}) => {
    // re-rendering removes the input, which fires blur: finish only once
    if (finished) return;
    finished = true;
    input.removeEventListener("blur", onBlur);
    if (item) item.draggable = true;
    const value = input.value.trim();
    const at = state.doc?.indexOfLayer(id) ?? -1;
    if (save && value && at >= 0) A.setLayerProp(at, "name", value, t("Layer rename"));
    syncLayers();
    // back to the row after Enter/Escape — but a click elsewhere keeps the
    // focus where the user put it
    if (refocus) focusLayer(id);
  };
  const onBlur = () => done(true);
  input.addEventListener("blur", onBlur);
  input.addEventListener("keydown", (e) => {
    // typing is the field's own; a command key (⌘S) goes on to the app
    if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
    // Enter / Escape while an input method is composing belong to the IME
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") done(true, { refocus: true });
    if (e.key === "Escape") done(false, { refocus: true });
  });
}

/**
 * Put keyboard focus back on a layer row after the list was rebuilt — or on
 * one of its thumbnails (`pick`: "layer" | "mask") or its eye / lock button
 * (`toggle`: "visible" | "locked") when that had it, so a second Space
 * toggles back.
 */
function focusLayer(id, pick = null, toggle = null) {
  const doc = state.doc;
  const index = doc?.indexOfLayer(id) ?? -1;
  if (index < 0) return;
  const row = $(`#layerList .layer-item[data-index="${index}"]`);
  const inner = pick
    ? `[data-pick-target="${pick}"]`
    : toggle
    ? `[data-toggle-layer="${toggle}"]`
    : null;
  ((inner && row && $(inner, row)) || row)?.focus();
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
    const active = i === doc.activeIndex;
    const editingMask = active && layer.editMask && layer.mask;
    items.push(`
      <div class="layer-item${active ? " is-active" : ""}${
      layer.visible ? "" : " is-hidden"
    }${editingMask ? " is-editing-mask" : ""}" data-index="${i}" draggable="true" role="listitem"
        tabindex="0" aria-current="${active ? "true" : "false"}" aria-label="${escapeHtml(layer.name)}${
          layer.text ? ` · ${t("Text layer")}` : ""
        }">
        <button type="button" class="layer-thumb${active && !editingMask ? " is-target" : ""}" data-thumb="${i}" data-pick-target="layer" data-tip="${t(
          "Edit layer pixels"
        )}" aria-label="${t("Edit layer pixels")}" aria-pressed="${!!active && !editingMask}">${
          layer.text ? `<span class="layer-badge" aria-hidden="true">T</span>` : ""
        }</button>
        ${
          layer.mask
            ? `<button type="button" class="layer-thumb mask-thumb${editingMask ? " is-target" : ""}${
                layer.maskEnabled ? "" : " is-disabled"
              }" data-mask-thumb="${i}" data-pick-target="mask" data-tip="${t(
                "Edit mask · Shift-click turns it off"
              )}" aria-label="${t("Edit mask")}" aria-pressed="${!!editingMask}"></button>`
            : ""
        }
        <span class="layer-info">
          <span class="layer-name">${escapeHtml(layer.name)}</span>
          <span class="layer-sub">${
            BLEND_MODES.find(([v]) => v === layer.blend)?.[1] || t("Normal")
          } · ${formatPercent(layer.opacity)}</span>
        </span>
        <span class="layer-actions">
          <button class="icon-btn xs" data-toggle-layer="visible" data-tip="${
            layer.visible ? t("Hide layer") : t("Show layer")
          }" aria-label="${t("Show layer")}" aria-pressed="${!!layer.visible}">${icon(
            layer.visible ? "i-eye" : "i-eye-off"
          )}</button>
          <button class="icon-btn xs${layer.locked ? " is-active" : ""}" data-toggle-layer="locked" data-tip="${
            layer.locked ? t("Unlock layer") : t("Lock layer")
          }" aria-label="${t("Lock layer")}" aria-pressed="${!!layer.locked}">${icon("i-lock")}</button>
        </span>
      </div>`);
  }
  // rebuilding the list drops focus: give it back to the same row (or the
  // same thumbnail or eye / lock button in it)
  const focused = list.contains(document.activeElement) ? document.activeElement : null;
  const focusedIndex = focused?.closest?.(".layer-item")?.dataset.index;
  const focusedId = focusedIndex !== undefined ? doc.layers[Number(focusedIndex)]?.id : null;
  const focusedPick = focused?.dataset?.pickTarget || null;
  const focusedToggle = focused?.dataset?.toggleLayer || null;
  list.innerHTML = items.join("");

  for (const holder of $$("[data-thumb]", list)) {
    const layer = doc.layers[Number(holder.dataset.thumb)];
    holder.prepend(layerThumb(layer));
  }
  for (const holder of $$("[data-mask-thumb]", list)) {
    const layer = doc.layers[Number(holder.dataset.maskThumb)];
    holder.appendChild(maskThumb(layer));
  }
  if (focusedId) focusLayer(focusedId, focusedPick, focusedToggle);

  const active = doc.active;
  if (active) {
    $("#layerBlend").value = active.blend;
    $("#layerOpacity").value = String(Math.round(active.opacity * 100));
    $("#layerOpacityOut").value = formatPercent(active.opacity);
  }
  $("#mergeLayerBtn").disabled = !canMergeDown(doc);
  $("#delLayerBtn").disabled = doc.layers.length <= 1;
  const maskBtn = $("#maskLayerBtn");
  const maskAction = active?.mask ? t("Delete layer mask") : t("Add layer mask");
  maskBtn.classList.toggle("is-active", !!active?.mask);
  maskBtn.dataset.tip = maskAction;
  maskBtn.setAttribute("aria-label", maskAction);
}

/**
 * Merge down needs a layer below that can take the pixels: one that is
 * neither locked nor hidden (merging into a hidden layer would make the
 * result vanish). Shared with the Layer menu.
 */
export function canMergeDown(doc = state.doc) {
  const below = doc?.layers[doc.activeIndex - 1];
  return !!below && !below.locked && below.visible !== false;
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
  $(".adjust-val", row).textContent = `${formatNumber(value, { signDisplay: "exceptZero" })}${item.unit || ""}`;
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
    <button class="filter-card" data-filter="${e.id}" data-tip="${t("Apply {name}", { name: e.name })}">
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

/** Effects whose look comes from the primary/secondary colours (filters.js). */
const COLOR_EFFECTS = ["duotone"];
let colorFilterTimer = 0;

/** New colours: redraw just the thumbnails that show them, once they settle. */
function invalidateColorFilters() {
  clearTimeout(colorFilterTimer);
  colorFilterTimer = setTimeout(() => {
    if (!state.doc) return;
    const panel = $('[data-panel="filters"]');
    // a hidden gallery redraws everything when it is shown again
    if (!panel.classList.contains("is-active")) {
      filtersDirty = true;
      return;
    }
    for (const id of COLOR_EFFECTS) {
      $(`[data-preview="${id}"]`, panel)?.replaceChildren(A.filterPreview(id, 112, 70));
    }
  }, 350);
}

/* ================================== tabs ================================== */

function buildTabs() {
  const tabs = $$(".tab");
  const select = (tab) => {
    for (const t of tabs) {
      t.classList.toggle("is-active", t === tab);
      t.setAttribute("aria-selected", String(t === tab));
      // one tab stop for the whole tab list; the arrows move inside it
      t.tabIndex = t === tab ? 0 : -1;
    }
    $$(".tab-panel").forEach((p) =>
      p.classList.toggle("is-active", p.dataset.panel === tab.dataset.tab)
    );
    // an upright phone shows Adjust and Filters in a lower sheet (layout.css)
    $("#sidebar").dataset.tab = tab.dataset.tab;
    followSheet();
    if (tab.dataset.tab === "filters") refreshFilterPreviews();
  };
  for (const tab of tabs) tab.addEventListener("click", () => select(tab));
  $(".tabs").addEventListener("keydown", (e) => {
    const i = tabs.indexOf(e.target);
    if (i < 0) return;
    const to = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    const tab = tabs[(to + tabs.length) % tabs.length];
    select(tab);
    tab.focus();
  });
  select(tabs.find((t) => t.classList.contains("is-active")) || tabs[0]);
}

/**
 * Bring a panel tab forward. `reveal: false` only selects the tab: the
 * column or the phone's sheet stay as they are (a task that already shows
 * its result must not cover it with the sheet).
 */
export function openTab(name, { reveal = true } = {}) {
  const tab = $(`.tab[data-tab="${name}"]`);
  tab?.click();
  if (!reveal) return;
  // the panel must be visible, also when the panels were hidden
  $(".workspace")?.classList.remove("side-collapsed");
  setSidebarOpen(true);
}

/* ============================ phone panel sheet =========================== */

const PHONE = window.matchMedia?.("(max-width: 760px)") ?? null;

/** Phones show the panels as a sheet sliding over the stage (layout.css). */
export const isPhoneLayout = () => !!PHONE?.matches;

/** Slide the panel sheet in or out (on a desktop the panels are a column). */
export function setSidebarOpen(open) {
  $("#sidebar").classList.toggle("is-open", open);
  $(".panel-toggle")?.setAttribute("aria-expanded", String(open));
  followSheet();
}

/** Where the sheet of Adjust and Filters comes up from the bottom (layout.css). */
const LOWER_SHEET = window.matchMedia?.("(max-width: 760px) and (orientation: portrait)") ?? null;
LOWER_SHEET?.addEventListener?.("change", () => followSheet());

/** How far the picture went up for the lower sheet, and the view it left. */
let sheetShift = 0;
let shiftedView = null;

/**
 * The lower sheet covers the bottom of the stage: the picture goes up by half
 * of that, to the middle of what stays in view, and back down when the sheet
 * goes — unless the view was changed meanwhile (Fit, a zoom).
 */
function followSheet() {
  const sidebar = $("#sidebar");
  const lower =
    sidebar.classList.contains("is-open") &&
    !!LOWER_SHEET?.matches &&
    (sidebar.dataset.tab === "adjust" || sidebar.dataset.tab === "filters");
  const shift = lower ? Math.round(sidebar.offsetHeight / 2) : 0;
  if (shift === sheetShift) return;
  const kept =
    shiftedView?.x === view.x && shiftedView?.y === view.y && shiftedView?.zoom === view.zoom;
  const dy = (kept ? sheetShift : 0) - shift;
  if (dy) view.pan(0, dy);
  sheetShift = shift;
  shiftedView = { x: view.x, y: view.y, zoom: view.zoom };
}

/* ============================== radio groups ============================== */

/**
 * Segmented controls marked role="radiogroup" (export format, the Levels and
 * Curves channels): their own code marks the choice with .is-active on
 * click. This keeps aria-checked and a single tab stop in step with it and
 * lets the arrow keys move the choice, by clicking the neighbour.
 */
function wireRadioGroup(group) {
  const radios = () => $$('[role="radio"]', group);
  const sync = () => {
    const list = radios();
    const checked = list.find((b) => b.classList.contains("is-active")) || list[0];
    for (const b of list) {
      b.setAttribute("aria-checked", String(b === checked));
      b.tabIndex = b === checked ? 0 : -1;
    }
  };
  new MutationObserver(sync).observe(group, {
    subtree: true,
    attributes: true,
    attributeFilter: ["class"],
  });
  group.addEventListener("keydown", (e) => {
    const list = radios();
    const i = list.indexOf(e.target);
    if (i < 0) return;
    const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    const to = step
      ? (i + step + list.length) % list.length
      : e.key === "Home"
      ? 0
      : e.key === "End"
      ? list.length - 1
      : -1;
    if (to < 0) return;
    e.preventDefault();
    e.stopPropagation();
    list[to].click();
    list[to].focus();
  });
  sync();
}

/* ================================ chrome ================================== */

function buildChrome() {
  $("#undoBtn").addEventListener("click", A.undo);
  $("#redoBtn").addEventListener("click", A.redo);
  $("#themeBtn").addEventListener("click", () =>
    setTheme(state.theme === "dark" ? "light" : "dark")
  );

  $("#docTitle").addEventListener("change", (e) => {
    const doc = state.doc;
    if (!doc) return;
    const name = e.target.value.trim() || t("Untitled");
    e.target.value = name;
    if (name === doc.name) return;
    doc.name = name;
    // the name belongs to the document: unsaved like any edit, and the
    // autosave keeps it
    markDirty(true);
    emit("doc-renamed");
  });
  $("#docTitle").addEventListener("keydown", (e) => {
    // typing is the field's own; a command key (⌘S) goes on to the app —
    // and the name typed so far is part of what ⌘S / ⇧⌘E save
    if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
    else if (!e.altKey && (e.code === "KeyS" || (e.shiftKey && e.code === "KeyE"))) e.target.blur();
    // an Enter that confirms an input method's word is not the end of the name
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) e.target.blur();
  });

  $("#zoomInBtn").addEventListener("click", () => view.zoomStep(1));
  $("#zoomOutBtn").addEventListener("click", () => view.zoomStep(-1));
  $("#zoomValue").addEventListener("click", () => view.actualSize());
  $("#fitBtn").addEventListener("click", () => view.fit());

  // panels toggle for narrow screens
  const sidebar = $("#sidebar");
  const toggle = document.createElement("button");
  toggle.className = "panel-toggle";
  toggle.dataset.tip = t("Panels");
  toggle.setAttribute("aria-label", t("Toggle panels"));
  toggle.setAttribute("aria-controls", "sidebar");
  toggle.setAttribute("aria-expanded", String(sidebar.classList.contains("is-open")));
  toggle.innerHTML = icon("i-panel");
  toggle.addEventListener("click", () => setSidebarOpen(!sidebar.classList.contains("is-open")));
  $(".stage-hud").prepend(toggle);

  // the open sheet covers that button: it closes from its own header, or
  // with a tap on the stage beside it — a tap that only closes, paints nothing
  $("#sidebarClose").addEventListener("click", () => {
    setSidebarOpen(false);
    // the focus was inside the sheet that just went away
    toggle.focus();
  });
  $("#stage").addEventListener(
    "pointerdown",
    (e) => {
      if (!isPhoneLayout() || !sidebar.classList.contains("is-open")) return;
      if (e.target.closest?.("button, input, select, textarea, .taskbar")) return;
      e.stopPropagation();
      e.preventDefault();
      setSidebarOpen(false);
    },
    true
  );
}

function syncHistoryButtons() {
  $("#undoBtn").disabled = !history.canUndo;
  $("#redoBtn").disabled = !history.canRedo;
  $("#undoBtn").dataset.tip = history.undoLabel
    ? `${t("Undo {label}", { label: history.undoLabel })} · ${platformKeys(`${MOD}Z`)}`
    : `${t("Undo")} · ${platformKeys(`${MOD}Z`)}`;
  $("#redoBtn").dataset.tip = history.redoLabel
    ? `${t("Redo {label}", { label: history.redoLabel })} · ${platformKeys(`⇧${MOD}Z`)}`
    : `${t("Redo")} · ${platformKeys(`⇧${MOD}Z`)}`;
}

function syncDocMeta() {
  const doc = state.doc;
  $("#docTitle").value = doc?.name || t("Untitled");
  $("#docMeta").textContent = doc ? `${doc.width} × ${doc.height}` : "";
  $("#statusSize").textContent = doc ? `${doc.width} × ${doc.height} px` : "—";
  $("#themeBtn").innerHTML = icon(state.theme === "dark" ? "i-moon" : "i-sun");
}

function syncZoom() {
  const z = view.zoom;
  $("#zoomValue").textContent = formatPercent(z, z < 0.1 ? 1 : 0);
}

function syncStatus() {
  const doc = state.doc;
  const p = state.cursor;
  $("#statusPos").textContent = p
    ? `${Math.floor(p.x)}, ${Math.floor(p.y)}`
    : "—";
  const b = doc?.selection?.bounds;
  $("#statusSel").textContent = b ? t("Selection {w} × {h}", { w: b.w, h: b.h }) : "";
}

/* ================================= toasts ================================= */

/** Keep a popover host shown and above everything shown before it. */
function raise(el) {
  if (!el.showPopover) return false;
  try {
    if (el.matches(":popover-open")) el.hidePopover();
    el.showPopover();
    return true;
  } catch {
    return false;
  }
}

export function toast(msg, kind = "info", { action } = {}) {
  const host = $("#toasts");
  // a modal dialog opened after the host would cover it: bring it back up
  if (host.showPopover && (!host.matches(":popover-open") || document.querySelector("dialog[open]"))) {
    raise(host);
  }
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
  const popover = !!el.showPopover;
  if (!label) {
    if (popover) {
      try {
        el.hidePopover();
      } catch {
        /* already hidden */
      }
    }
    el.hidden = true;
    return;
  }
  $("#busyLabel").textContent = label;
  el.hidden = false;
  // above any open dialog (exporting a PSD, decoding from the welcome screen)
  if (popover) raise(el);
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
  $$('[role="radiogroup"]').forEach(wireRadioGroup);

  on("tool", () => {
    syncRail();
    buildOptions();
  });
  on("opts", () => {
    syncOptionSwatches();
    requestRender();
  });
  on("color", (e) => {
    syncColorPanel();
    // switching the edited chip or recording a recent colour changes neither
    if (e?.which !== "chip" && e?.which !== "recent") invalidateColorFilters();
  });
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
  $("#layerOpacityOut").value = formatPercent(1);
  raise($("#toasts"));
}
