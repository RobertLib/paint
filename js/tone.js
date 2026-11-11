/* ==========================================================================
   Levels and Curves — tone dialogs with a live preview on the paint target.

   Both build per-channel lookup tables: the RGB (master) table runs first,
   then the channel's own table, exactly like the classic editors.
   ========================================================================== */

import * as A from "./actions.js";
import {
  applyLUTs,
  autoRange,
  chainLUT,
  curveAddPoint,
  curveLUT,
  histogram,
  levelsLUT,
} from "./filters.js";
import { t } from "./i18n.js";
import { state } from "./state.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const CHANNELS = ["rgb", "r", "g", "b"];
const CHANNEL_COLOR = { rgb: "#c9cdd8", r: "#ff6b6b", g: "#4ade80", b: "#60a5fa" };

/* --------------------------------- shared --------------------------------- */

function drawHistogram(canvas, hist, color) {
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  let max = 1;
  // ignore the extreme bins when scaling so a clipped photo still shows shape
  for (let i = 1; i < 255; i++) max = Math.max(max, hist[i]);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < 256; i++) {
    const v = Math.min(1, hist[i] / max);
    ctx.lineTo((i / 255) * w, h - v * h * 0.96);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

/** Histogram of what the session edits: inside the selection only, if any. */
const sessionHistogram = (session) =>
  histogram(session.orig, session.region, state.doc?.selection?.canvas || null);

/** True when the tables leave every value as it is. */
const isIdentity = (luts) =>
  [luts.r, luts.g, luts.b].every((lut) => lut.every((v, i) => v === i));

/**
 * What the preview shows for a set of tables: nothing at all for tables that
 * change nothing, so applying them records no step (and keeps a text layer
 * editable).
 */
const lutPreview = (luts) =>
  isIdentity(luts) ? null : (orig, region) => applyLUTs(orig, luts, region);

/** Wire a dialog to a preview session: Apply commits, anything else cancels. */
function sessionDialog(dialog, label, onOpen) {
  let session = null;
  let applied = false;
  dialog.addEventListener("close", () => {
    if (!session) return;
    if (applied) session.commit();
    else session.cancel();
    session = null;
  });
  $$("[data-close]", dialog).forEach((b) => b.addEventListener("click", () => dialog.close()));
  // a click on the backdrop cancels — but only one that started there too:
  // releasing a slider or a text selection outside the box is not a click on
  // the backdrop (the same rule as wireDialog in menus.js)
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
    if (downOutside && outside(e)) dialog.close();
    downOutside = false;
  });
  const apply = $("[data-apply]", dialog);
  apply.addEventListener("click", () => {
    applied = true;
    dialog.close();
  });
  // Enter in a number field applies, as in the other dialogs: the typed value
  // is taken first (its `change` would otherwise come only on blur)
  dialog.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.isComposing || e.repeat) return;
    if (e.target.tagName !== "INPUT" || e.target.type !== "number") return;
    e.preventDefault();
    e.target.dispatchEvent(new Event("change", { bubbles: true }));
    if (!apply.disabled) apply.click();
  });
  return {
    open(options) {
      if (!state.doc) return null;
      session = A.beginPreview(label);
      if (!session) return null;
      applied = false;
      onOpen(session, options);
      dialog.showModal();
      return session;
    },
    get session() {
      return session;
    },
  };
}

/* --------------------------------- levels --------------------------------- */

const LEVEL_DEFAULT = () => ({ inBlack: 0, inWhite: 255, gamma: 1, outBlack: 0, outWhite: 255 });

const levels = {
  values: null,
  channel: "rgb",
  hist: null,
  ctl: null,
};

function levelsLuts() {
  const v = levels.values;
  const master = levelsLUT(v.rgb);
  return {
    r: chainLUT(master, levelsLUT(v.r)),
    g: chainLUT(master, levelsLUT(v.g)),
    b: chainLUT(master, levelsLUT(v.b)),
  };
}

function syncLevels() {
  const v = levels.values[levels.channel];
  $("#lvBlack").value = String(v.inBlack);
  $("#lvBlackNum").value = String(v.inBlack);
  $("#lvWhite").value = String(v.inWhite);
  $("#lvWhiteNum").value = String(v.inWhite);
  $("#lvGamma").value = String(Math.round(Math.log2(v.gamma) * 100));
  $("#lvGammaNum").value = v.gamma.toFixed(2);
  $("#lvOutBlack").value = String(v.outBlack);
  $("#lvOutBlackNum").value = String(v.outBlack);
  $("#lvOutWhite").value = String(v.outWhite);
  $("#lvOutWhiteNum").value = String(v.outWhite);
  $$("#levelsChannel .seg-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.channel === levels.channel)
  );
  const canvas = $("#levelsHist");
  drawHistogram(canvas, levels.hist[levels.channel], CHANNEL_COLOR[levels.channel]);
  // markers for the three input points
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  const mid = v.inBlack + (v.inWhite - v.inBlack) * Math.pow(0.5, v.gamma);
  for (const [x, fill] of [
    [v.inBlack, "#000"],
    [mid, "#888"],
    [v.inWhite, "#fff"],
  ]) {
    const px = (x / 255) * w;
    ctx.fillStyle = fill;
    ctx.strokeStyle = "rgba(127,127,140,0.9)";
    ctx.beginPath();
    ctx.moveTo(px, h - 12);
    ctx.lineTo(px - 7, h);
    ctx.lineTo(px + 7, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

function updateLevels() {
  syncLevels();
  levels.ctl.session?.update(lutPreview(levelsLuts()));
}

function autoLevelsValues(hist) {
  const out = { rgb: LEVEL_DEFAULT() };
  for (const ch of ["r", "g", "b"]) out[ch] = { ...LEVEL_DEFAULT(), ...autoRange(hist[ch]) };
  return out;
}

function initLevels() {
  const dialog = $("#levelsDialog");
  levels.ctl = sessionDialog(dialog, t("Levels"), (session, { auto } = {}) => {
    levels.hist = sessionHistogram(session);
    levels.values = Object.fromEntries(CHANNELS.map((c) => [c, LEVEL_DEFAULT()]));
    levels.channel = "rgb";
    if (auto) levels.values = autoLevelsValues(levels.hist);
    updateLevels();
  });

  $("#levelsChannel").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-channel]");
    if (!btn) return;
    levels.channel = btn.dataset.channel;
    syncLevels();
  });

  const bind = (rangeId, numId, apply) => {
    const range = $(rangeId);
    const num = $(numId);
    range.addEventListener("input", () => {
      apply(Number(range.value), "range");
      updateLevels();
    });
    num.addEventListener("change", () => {
      apply(Number(num.value), "num");
      updateLevels();
    });
  };
  const cur = () => levels.values[levels.channel];
  bind("#lvBlack", "#lvBlackNum", (v) => {
    cur().inBlack = Math.max(0, Math.min(cur().inWhite - 2, Math.round(v)));
  });
  bind("#lvWhite", "#lvWhiteNum", (v) => {
    cur().inWhite = Math.min(255, Math.max(cur().inBlack + 2, Math.round(v)));
  });
  bind("#lvGamma", "#lvGammaNum", (v, from) => {
    const g = from === "range" ? Math.pow(2, v / 100) : v;
    cur().gamma = Math.max(0.1, Math.min(9.99, g || 1));
  });
  bind("#lvOutBlack", "#lvOutBlackNum", (v) => {
    cur().outBlack = Math.max(0, Math.min(255, Math.round(v)));
  });
  bind("#lvOutWhite", "#lvOutWhiteNum", (v) => {
    cur().outWhite = Math.max(0, Math.min(255, Math.round(v)));
  });

  $("#levelsAuto").addEventListener("click", () => {
    levels.values = autoLevelsValues(levels.hist);
    updateLevels();
  });
  $("#levelsReset").addEventListener("click", () => {
    levels.values = Object.fromEntries(CHANNELS.map((c) => [c, LEVEL_DEFAULT()]));
    updateLevels();
  });
}

/**
 * Open Levels. `auto` starts from per-channel auto levels; `apply` commits
 * that straight away without showing the dialog (Adjust → Auto levels).
 */
export function openLevels({ auto = false, apply = false } = {}) {
  if (!state.doc) return;
  if (apply) {
    const session = A.beginPreview(t("Auto levels"));
    if (!session) return;
    levels.values = autoLevelsValues(sessionHistogram(session));
    // already balanced: the commit then records nothing
    session.update(lutPreview(levelsLuts()));
    session.commit();
    return;
  }
  levels.ctl.open({ auto });
}

/* --------------------------------- curves --------------------------------- */

const curves = {
  points: null,
  channel: "rgb",
  hist: null,
  drag: null,
  ctl: null,
};

const DEFAULT_POINTS = () => [
  { x: 0, y: 0 },
  { x: 255, y: 255 },
];

function curvesLuts() {
  const master = curveLUT(curves.points.rgb);
  return {
    r: chainLUT(master, curveLUT(curves.points.r)),
    g: chainLUT(master, curveLUT(curves.points.g)),
    b: chainLUT(master, curveLUT(curves.points.b)),
  };
}

function drawCurves() {
  const canvas = $("#curvesCanvas");
  const ctx = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);
  drawHistogram(canvas, curves.hist[curves.channel], "rgba(127,127,140,0.7)");
  // grid
  ctx.strokeStyle = "rgba(127,127,140,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo((w * i) / 4, 0);
    ctx.lineTo((w * i) / 4, h);
    ctx.moveTo(0, (h * i) / 4);
    ctx.lineTo(w, (h * i) / 4);
  }
  ctx.moveTo(0, h);
  ctx.lineTo(w, 0);
  ctx.stroke();
  // other channels faintly, the active one bold
  for (const ch of CHANNELS) {
    const lut = curveLUT(curves.points[ch]);
    const active = ch === curves.channel;
    // an untouched channel is not drawn; one with only its end points moved is
    if (!active && lut.every((v, i) => v === i)) continue;
    ctx.strokeStyle = CHANNEL_COLOR[ch];
    ctx.globalAlpha = active ? 1 : 0.35;
    ctx.lineWidth = active ? 2 : 1;
    ctx.beginPath();
    for (let x = 0; x < 256; x++) {
      const px = (x / 255) * w;
      const py = h - (lut[x] / 255) * h;
      x ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const p of curves.points[curves.channel]) {
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.rect((p.x / 255) * w - 5, h - (p.y / 255) * h - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  }
  $$("#curvesChannel .seg-btn").forEach((b) =>
    b.classList.toggle("is-active", b.dataset.channel === curves.channel)
  );
}

function updateCurves() {
  drawCurves();
  curves.ctl.session?.update(lutPreview(curvesLuts()));
}

/**
 * The point a pointer at `p` grabs: the nearest one within reach, or else
 * the one at the very same input level — a new point there would sit on top
 * of it and bend the curve. −1 when there is none.
 */
function pointAt(pts, p) {
  let best = -1;
  let bestD = Infinity;
  pts.forEach((q, i) => {
    const dx = Math.abs(q.x - p.x);
    const dy = Math.abs(q.y - p.y);
    if (dx >= 10 || dy >= 14) return;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}

function curvePos(e) {
  const canvas = $("#curvesCanvas");
  const r = canvas.getBoundingClientRect();
  return {
    x: Math.round(((e.clientX - r.left) / r.width) * 255),
    y: Math.round((1 - (e.clientY - r.top) / r.height) * 255),
  };
}

function initCurves() {
  const dialog = $("#curvesDialog");
  curves.ctl = sessionDialog(dialog, t("Curves"), (session) => {
    curves.hist = sessionHistogram(session);
    curves.points = Object.fromEntries(CHANNELS.map((c) => [c, DEFAULT_POINTS()]));
    curves.channel = "rgb";
    updateCurves();
  });

  $("#curvesChannel").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-channel]");
    if (!btn) return;
    curves.channel = btn.dataset.channel;
    drawCurves();
  });
  $("#curvesReset").addEventListener("click", () => {
    curves.points[curves.channel] = DEFAULT_POINTS();
    updateCurves();
  });

  const canvas = $("#curvesCanvas");
  canvas.addEventListener("pointerdown", (e) => {
    const pts = curves.points[curves.channel];
    const p = curvePos(e);
    let index = pointAt(pts, p);
    if (index < 0) {
      // a click adds a point on the curve under the pointer — unless a point
      // already sits at that input level: then that one is picked up
      const x = Math.max(1, Math.min(254, p.x));
      index = pts.findIndex((q) => q.x === x);
      if (index < 0) {
        // the new point keeps the curve exactly as it is until it moves
        const added = curveAddPoint(pts, x);
        pts.splice(0, pts.length, ...added.points);
        index = pts.indexOf(added.point);
      }
    }
    canvas.setPointerCapture(e.pointerId);
    curves.drag = { index };
    updateCurves();
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = curvePos(e);
    $("#curvesReadout").textContent = t("Input {i} · Output {o}", {
      i: Math.max(0, Math.min(255, p.x)),
      o: Math.max(0, Math.min(255, p.y)),
    });
    if (!curves.drag) return;
    const pts = curves.points[curves.channel];
    const i = curves.drag.index;
    const isEnd = i === 0 || i === pts.length - 1;
    // dragging an inner point far outside removes it
    if (!isEnd && (p.y < -40 || p.y > 295 || p.x < -30 || p.x > 285)) {
      for (const q of pts) delete q.m;
      pts.splice(i, 1);
      curves.drag = null;
      updateCurves();
      return;
    }
    const lo = i > 0 ? pts[i - 1].x + 1 : 0;
    const hi = i < pts.length - 1 ? pts[i + 1].x - 1 : 255;
    const x = Math.max(lo, Math.min(hi, p.x));
    const y = Math.max(0, Math.min(255, p.y));
    // still where it was (a click, a twitch): the curve stays as it is
    if (x === pts[i].x && Math.abs(y - pts[i].y) < 0.5) return;
    // a moved point re-shapes the whole curve: drop the kept tangents
    for (const q of pts) delete q.m;
    pts[i] = { x, y };
    updateCurves();
  });
  // pointerup, pointercancel and a lost capture all end the drag
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(type, () => {
      curves.drag = null;
    });
  }
  canvas.addEventListener("dblclick", (e) => {
    const pts = curves.points[curves.channel];
    const p = curvePos(e);
    const i = pointAt(pts, p);
    if (i > 0 && i < pts.length - 1) {
      for (const q of pts) delete q.m;
      pts.splice(i, 1);
      updateCurves();
    }
  });
}

export function openCurves() {
  if (!state.doc) return;
  curves.ctl.open();
}

export function initTone() {
  initLevels();
  initCurves();
}
