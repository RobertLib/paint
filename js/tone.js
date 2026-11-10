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
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  $("[data-apply]", dialog).addEventListener("click", () => {
    applied = true;
    dialog.close();
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
  const luts = levelsLuts();
  levels.ctl.session?.update((orig, region) => applyLUTs(orig, luts, region));
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
    const luts = (() => {
      levels.values = autoLevelsValues(sessionHistogram(session));
      return levelsLuts();
    })();
    session.update((orig, region) => applyLUTs(orig, luts, region));
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
    if (!active && curves.points[ch].length === 2 && lut[0] === 0 && lut[255] === 255) continue;
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
  const luts = curvesLuts();
  curves.ctl.session?.update((orig, region) => applyLUTs(orig, luts, region));
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
    let index = pts.findIndex((q) => Math.abs(q.x - p.x) < 10 && Math.abs(q.y - p.y) < 14);
    if (index < 0) {
      // a click adds a point on the curve under the pointer
      const lut = curveLUT(pts);
      const point = { x: Math.max(1, Math.min(254, p.x)), y: lut[Math.max(0, Math.min(255, p.x))] };
      pts.push(point);
      pts.sort((a, b) => a.x - b.x);
      index = pts.indexOf(point);
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
      pts.splice(i, 1);
      curves.drag = null;
      updateCurves();
      return;
    }
    const lo = i > 0 ? pts[i - 1].x + 1 : 0;
    const hi = i < pts.length - 1 ? pts[i + 1].x - 1 : 255;
    pts[i] = {
      x: Math.max(lo, Math.min(hi, p.x)),
      y: Math.max(0, Math.min(255, p.y)),
    };
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
    const i = pts.findIndex((q) => Math.abs(q.x - p.x) < 10 && Math.abs(q.y - p.y) < 14);
    if (i > 0 && i < pts.length - 1) {
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
