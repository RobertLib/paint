/* ==========================================================================
   Renderer — paints the document, the transparency checkerboard and every
   on-canvas overlay (marching ants, crop frame, brush cursor) into the single
   view canvas. Tools describe overlays declaratively via `overlay`.
   ========================================================================== */

import { makeCanvas, releaseCanvas } from "./doc.js";
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
  /** free-transform box: {corners:[4 doc points], center} */
  transform: null,
};

/** the requested animation frame, 0 when none */
let pending = 0;
let antPhase = 0;
let antTimer = 0;
let checker = null;
let checkerKey = "";
let checkerColors = null;

export function requestRender() {
  if (pending) return;
  pending = requestAnimationFrame(draw);
}

/** Draw right now (a frame already requested is not needed any more). */
function drawNow() {
  if (pending) cancelAnimationFrame(pending);
  draw();
}

export function initRender(canvas, stage) {
  view.attach(canvas, stage);
  on("view", requestRender);
  on("doc", requestRender);
  on("layers", requestRender);
  on("selection", requestRender);
  on("theme", () => {
    checkerKey = "";
    checkerColors = null;
    requestRender();
  });
  // resizing the canvas clears it, and observers run after this frame's
  // animation callbacks: drawing later would show one blank frame
  const ro = new ResizeObserver(() => {
    view.resize();
    drawNow();
  });
  ro.observe(stage);
  // a move to a screen with another pixel ratio resizes the canvas too
  on("dpr", drawNow);
  requestRender();
}

/* ------------------------------ checkerboard ----------------------------- */

function checkerPattern(ctx) {
  // reading computed styles forces style work: do it once per theme
  if (!checkerColors) {
    const css = getComputedStyle(document.documentElement);
    checkerColors = [
      css.getPropertyValue("--check-a").trim() || "#2a2e39",
      css.getPropertyValue("--check-b").trim() || "#21242d",
    ];
  }
  const [a, b] = checkerColors;
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
function ants(ctx, path, dash = 5, { clip = false } = {}) {
  const z = view.zoom;
  ctx.save();
  ctx.setTransform(view.dpr * z, 0, 0, view.dpr * z, view.dpr * view.x, view.dpr * view.y);
  if (clip && state.doc) {
    // a selection never reaches past the canvas, so neither do its ants
    ctx.beginPath();
    ctx.rect(-1 / z, -1 / z, state.doc.width + 2 / z, state.doc.height + 2 / z);
    ctx.clip();
  }
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

/* --------------------------- ants traced on screen ------------------------ */

/** The selection's outline on screen, kept while the view stays as it is. */
const traced = { key: "", edges: null, buf: null, stripes: null };

function releaseTraced() {
  releaseCanvas(traced.edges);
  releaseCanvas(traced.buf);
  traced.key = "";
  traced.edges = traced.buf = traced.stripes = null;
}

/**
 * Trace the outline of `sel` as it is on screen (CSS pixels) into
 * traced.edges: opaque where an inside pixel touches an outside one. Detail
 * finer than a screen pixel is averaged away, as it would not show anyway.
 */
function traceOutline(sel, w, h) {
  if (traced.edges?.width !== w || traced.edges?.height !== h) {
    releaseTraced();
    traced.edges = makeCanvas(w, h);
    traced.buf = makeCanvas(w, h);
  }
  const c = traced.edges.getContext("2d", { willReadFrequently: true });
  c.clearRect(0, 0, w, h);
  // only the part of the view the selection covers (and a pixel around it)
  const b = sel.bounds;
  const z = view.zoom;
  const x0 = Math.max(0, Math.floor(view.x + b.x * z) - 1);
  const y0 = Math.max(0, Math.floor(view.y + b.y * z) - 1);
  const rw = Math.min(w, Math.ceil(view.x + (b.x + b.w) * z) + 1) - x0;
  const rh = Math.min(h, Math.ceil(view.y + (b.y + b.h) * z) + 1) - y0;
  if (rw <= 0 || rh <= 0) return;
  c.save();
  c.beginPath();
  c.rect(x0, y0, rw, rh);
  c.clip();
  c.imageSmoothingEnabled = z < 1;
  c.imageSmoothingQuality = "high";
  c.setTransform(z, 0, 0, z, view.x, view.y);
  c.drawImage(sel.canvas, 0, 0);
  c.restore();
  const img = c.getImageData(x0, y0, rw, rh);
  const d = img.data;
  const limit = sel.outlineAlpha;
  const inside = new Uint8Array(rw * rh);
  for (let i = 0; i < inside.length; i++) inside[i] = d[i * 4 + 3] > limit ? 1 : 0;
  // (the edge of the view is no edge of the selection)
  for (let y = 0, i = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++, i++) {
      const edge =
        inside[i] === 1 &&
        ((x > 0 && !inside[i - 1]) ||
          (x < rw - 1 && !inside[i + 1]) ||
          (y > 0 && !inside[i - rw]) ||
          (y < rh - 1 && !inside[i + rw]));
      d[i * 4 + 3] = edge ? 255 : 0;
    }
  }
  c.putImageData(img, x0, y0);
}

/** Diagonal black and white stripes: dashes of 5 along any straight edge. */
function stripePattern(ctx) {
  const n = 10;
  const tile = makeCanvas(n, n);
  const tc = tile.getContext("2d");
  const img = tc.createImageData(n, n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const j = (y * n + x) * 4;
      const white = (x + y) % n >= n / 2;
      img.data[j] = img.data[j + 1] = img.data[j + 2] = white ? 255 : 0;
      img.data[j + 3] = white ? 242 : 230;
    }
  }
  tc.putImageData(img, 0, 0);
  return ctx.createPattern(tile, "repeat");
}

/**
 * Marching ants for an outline with too many edges to stroke on every step
 * (a magic wand on a grainy photo). The outline is traced once per view, and
 * each step only moves stripes through it — the same cost however intricate
 * the outline is.
 */
function tracedAnts(ctx, sel) {
  const w = Math.ceil(view.w);
  const h = Math.ceil(view.h);
  const key = `${sel.uid}|${view.zoom}|${view.x}|${view.y}|${w}x${h}`;
  if (traced.key !== key) {
    traceOutline(sel, w, h);
    traced.key = key;
  }
  const bc = traced.buf.getContext("2d");
  traced.stripes ||= stripePattern(bc);
  traced.stripes.setTransform(new DOMMatrix().translateSelf(Math.round(antPhase), 0));
  bc.globalCompositeOperation = "copy";
  bc.drawImage(traced.edges, 0, 0);
  bc.globalCompositeOperation = "source-in";
  bc.fillStyle = traced.stripes;
  bc.fillRect(0, 0, w, h);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(traced.buf, 0, 0, w, h);
  ctx.restore();
}

/* ---------------------------------- draw --------------------------------- */

function draw(now = 0) {
  pending = 0;
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

    // the artwork: crisp pixels when zoomed in, smooth when zoomed out
    ctx.save();
    ctx.imageSmoothingEnabled = view.zoom < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(doc.composite(), 0, 0, doc.width, doc.height, r.x, r.y, r.w, r.h);
    ctx.restore();

    // hairline border
    ctx.save();
    ctx.strokeStyle = "rgba(127,127,140,0.5)";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x - 0.5, r.y - 0.5, r.w + 1, r.h + 1);
    ctx.restore();

    if (overlay.crop) drawCrop(ctx, overlay.crop);
    const sel = overlay.crop || overlay.transform ? null : doc.selection;
    // an outline with too many edges to stroke on every step (see segments)
    const intricate = !!sel && !sel.shape && !sel.segments;
    if (intricate) tracedAnts(ctx, sel);
    else if (sel) ants(ctx, selectionPath(sel), 5, { clip: true });
    if (!intricate && traced.edges) releaseTraced();
    if (overlay.floatFrame) drawFloatFrame(ctx, overlay.floatFrame);
    if (overlay.transform) drawTransform(ctx, overlay.transform);

    const mp = marqueePath();
    if (mp) ants(ctx, mp, 4);

    if (overlay.cloneSrc) drawCloneSrc(ctx, overlay.cloneSrc);
    if (overlay.cursor) drawCursor(ctx, overlay.cursor);
  }

  // keep the ants moving while a selection or marquee is on screen — a step
  // every 70 ms is all they need, not a full redraw every display frame
  const wantsAnimation = !!(
    (doc && doc.selection) ||
    overlay.marquee ||
    overlay.floatFrame
  );
  if (wantsAnimation && !antTimer && !document.hidden) {
    antTimer = setTimeout(() => {
      antTimer = 0;
      antPhase = (antPhase + 1.6) % 10;
      requestRender();
    }, 70);
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

function drawTransform(ctx, tr) {
  const pts = tr.corners.map((p) => view.toScreen(p.x, p.y));
  ctx.save();
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = "#fff";
  ctx.stroke();

  const handles = [...pts];
  for (let i = 0; i < 4; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % 4];
    handles.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.55)";
  ctx.lineWidth = 1;
  for (const h of handles) {
    ctx.beginPath();
    ctx.rect(h.x - 4.5, h.y - 4.5, 9, 9);
    ctx.fill();
    ctx.stroke();
  }
  const c = view.toScreen(tr.center.x, tr.center.y);
  ctx.beginPath();
  ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
  ctx.moveTo(c.x - 7, c.y);
  ctx.lineTo(c.x + 7, c.y);
  ctx.moveTo(c.x, c.y - 7);
  ctx.lineTo(c.x, c.y + 7);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();
  ctx.restore();
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
