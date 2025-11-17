/* ==========================================================================
   Renderer — paints the document, the transparency checkerboard and every
   on-canvas overlay (marching ants, crop frame, brush cursor) into the single
   view canvas. Tools describe overlays declaratively via `overlay`.
   ========================================================================== */

import { makeCanvas } from "./doc.js";
import { on, state } from "./state.js";
import { view } from "./viewport.js";

export const overlay = {
  /** live selection being dragged: {kind:'rect'|'ellipse'|'lasso', rect, points} */
  marquee: null,
  /** crop frame in document space: {x,y,w,h} */
  crop: null,
  /** brush outline: {x,y,r} in document space */
  cursor: null,
  /** clone-stamp source marker in document space */
  cloneSrc: null,
  /** floating pixels frame: {x,y,w,h} in document space */
  floatFrame: null,
};

let pending = false;
let antPhase = 0;
let lastAnt = 0;
let checker = null;
let checkerKey = "";

export function requestRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(draw);
}

export function initRender(canvas, stage) {
  view.attach(canvas, stage);
  on("view", requestRender);
  on("doc", requestRender);
  on("layers", requestRender);
  on("selection", requestRender);
  on("theme", () => {
    checkerKey = "";
    requestRender();
  });
  const ro = new ResizeObserver(() => {
    view.resize();
    requestRender();
  });
  ro.observe(stage);
  requestRender();
}

/* ------------------------------ checkerboard ----------------------------- */

function checkerPattern(ctx) {
  const css = getComputedStyle(document.documentElement);
  const a = css.getPropertyValue("--check-a").trim() || "#2a2e39";
  const b = css.getPropertyValue("--check-b").trim() || "#21242d";
  const key = `${a}|${b}|${view.dpr}`;
  if (checker && checkerKey === key) return checker;

  const size = 8;
  const c = makeCanvas(size * 2, size * 2);
  const cc = c.getContext("2d");
  cc.fillStyle = b;
  cc.fillRect(0, 0, size * 2, size * 2);
  cc.fillStyle = a;
  cc.fillRect(0, 0, size, size);
  cc.fillRect(size, size, size, size);
  checker = ctx.createPattern(c, "repeat");
  checkerKey = key;
  return checker;
}

/* --------------------------------- paths --------------------------------- */

/** Document-space Path2D for the current selection, cached on the selection. */
function selectionPath(sel) {
  if (sel._path2d) return sel._path2d;
  const p = new Path2D();
  if (sel.shape?.type === "rect") {
    const { x, y, w, h } = sel.shape;
    p.rect(x, y, w, h);
  } else if (sel.shape?.type === "ellipse") {
    const { x, y, w, h } = sel.shape;
    p.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  } else {
    const s = sel.segments;
    for (let i = 0; i < s.length; i += 4) {
      p.moveTo(s[i], s[i + 1]);
      p.lineTo(s[i + 2], s[i + 3]);
    }
  }
  sel._path2d = p;
  return p;
}

function marqueePath() {
  const m = overlay.marquee;
  if (!m) return null;
  const p = new Path2D();
  if (m.kind === "rect" && m.rect) {
    p.rect(m.rect.x, m.rect.y, m.rect.w, m.rect.h);
  } else if (m.kind === "ellipse" && m.rect) {
    const { x, y, w, h } = m.rect;
    p.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
  } else if (m.points?.length > 1) {
    p.moveTo(m.points[0].x, m.points[0].y);
    for (let i = 1; i < m.points.length; i++) p.lineTo(m.points[i].x, m.points[i].y);
    if (m.close) p.closePath();
  }
  return p;
}

/** Stroke a document-space path as animated marching ants. */
function ants(ctx, path, dash = 5) {
  const z = view.zoom;
  ctx.save();
  ctx.setTransform(view.dpr * z, 0, 0, view.dpr * z, view.dpr * view.x, view.dpr * view.y);
  ctx.lineWidth = 1 / z;
  ctx.setLineDash([dash / z, dash / z]);
  ctx.lineDashOffset = -antPhase / z;
  ctx.strokeStyle = "rgba(0,0,0,0.9)";
  ctx.stroke(path);
  ctx.lineDashOffset = (-antPhase + dash) / z;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke(path);
  ctx.restore();
}

/* ---------------------------------- draw --------------------------------- */

function draw(now = 0) {
  pending = false;
  const ctx = view.ctx;
  if (!ctx) return;

  const dpr = view.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.imageSmoothingEnabled = true;

  const doc = state.doc;
  if (doc) {
    const r = view.docRect();

    // paper shadow
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.restore();

    // transparency checkerboard, aligned to the document origin
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.fillStyle = checkerPattern(ctx);
    ctx.translate(r.x, r.y);
    ctx.fillRect(0, 0, r.w, r.h);
    ctx.restore();

    // the artwork
    ctx.save();
    ctx.imageSmoothingEnabled = view.zoom < 1;
    ctx.drawImage(doc.composite(), 0, 0, doc.width, doc.height, r.x, r.y, r.w, r.h);
    ctx.restore();

    // hairline border
    ctx.save();
    ctx.strokeStyle = "rgba(127,127,140,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
    ctx.restore();

    if (overlay.crop) drawCrop(ctx, overlay.crop);
    if (doc.selection && !overlay.crop) ants(ctx, selectionPath(doc.selection));
    if (overlay.floatFrame) drawFloatFrame(ctx, overlay.floatFrame);

    const mp = marqueePath();
    if (mp) ants(ctx, mp, 4);

    if (overlay.cloneSrc) drawCloneSrc(ctx, overlay.cloneSrc);
    if (overlay.cursor) drawCursor(ctx, overlay.cursor);
  }

  // keep the ants moving while a selection or marquee is on screen
  const wantsAnimation = !!(
    (doc && doc.selection) ||
    overlay.marquee ||
    overlay.floatFrame
  );
  if (wantsAnimation) {
    if (now - lastAnt > 70) {
      antPhase = (antPhase + 1.6) % 10;
      lastAnt = now;
    }
    requestRender();
  }
}

function drawCrop(ctx, rect) {
  const a = view.toScreen(rect.x, rect.y);
  const b = view.toScreen(rect.x + rect.w, rect.y + rect.h);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);

  ctx.save();
  // dim everything outside the crop
  ctx.fillStyle = "rgba(8,9,13,0.62)";
  ctx.beginPath();
  ctx.rect(0, 0, view.w, view.h);
  ctx.rect(x, y, w, h);
  ctx.fill("evenodd");

  // thirds guides
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 3; i++) {
    ctx.moveTo(x + (w * i) / 3, y);
    ctx.lineTo(x + (w * i) / 3, y + h);
    ctx.moveTo(x, y + (h * i) / 3);
    ctx.lineTo(x + w, y + (h * i) / 3);
  }
  ctx.stroke();

  // frame + handles
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  const corners = [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
    [x + w / 2, y],
    [x + w / 2, y + h],
    [x, y + h / 2],
    [x + w, y + h / 2],
  ];
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 1;
  for (const [cx, cy] of corners) {
    ctx.beginPath();
    ctx.rect(cx - 4, cy - 4, 8, 8);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloatFrame(ctx, rect) {
  const p = new Path2D();
  p.rect(rect.x, rect.y, rect.w, rect.h);
  ants(ctx, p, 4);
}

function drawCloneSrc(ctx, pt) {
  const p = view.toScreen(pt.x, pt.y);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(p.x - 7, p.y);
  ctx.lineTo(p.x + 7, p.y);
  ctx.moveTo(p.x, p.y - 7);
  ctx.lineTo(p.x, p.y + 7);
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawCursor(ctx, cur) {
  const p = view.toScreen(cur.x, cur.y);
  const r = Math.max(2.5, cur.r * view.zoom);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.stroke();
  if (r > 14) {
    ctx.beginPath();
    ctx.moveTo(p.x - 3, p.y);
    ctx.lineTo(p.x + 3, p.y);
    ctx.moveTo(p.x, p.y - 3);
    ctx.lineTo(p.x, p.y + 3);
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();
}
