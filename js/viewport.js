/* ==========================================================================
   Viewport — maps document space to the on-screen canvas (zoom + pan).
   ========================================================================== */

import { clamp } from "./color.js";
import { emit, state } from "./state.js";

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 32;

export const view = {
  canvas: null,
  ctx: null,
  stage: null,
  dpr: 1,
  /** CSS pixel size of the stage */
  w: 0,
  h: 0,
  zoom: 1,
  /** document origin in stage CSS pixels */
  x: 0,
  y: 0,

  attach(canvas, stage) {
    this.canvas = canvas;
    this.stage = stage;
    this.ctx = canvas.getContext("2d");
    this.resize();
  },

  resize() {
    if (!this.stage) return;
    const rect = this.stage.getBoundingClientRect();
    this.w = Math.max(1, rect.width);
    this.h = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bw = Math.round(this.w * this.dpr);
    const bh = Math.round(this.h * this.dpr);
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    emit("view", this);
  },

  /* ------------------------------ transforms ----------------------------- */

  toDoc(sx, sy) {
    return { x: (sx - this.x) / this.zoom, y: (sy - this.y) / this.zoom };
  },

  toScreen(dx, dy) {
    return { x: dx * this.zoom + this.x, y: dy * this.zoom + this.y };
  },

  /** Stage-relative CSS coordinates for a pointer event. */
  eventPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  },

  docRect() {
    const doc = state.doc;
    if (!doc) return { x: 0, y: 0, w: 0, h: 0 };
    return {
      x: this.x,
      y: this.y,
      w: doc.width * this.zoom,
      h: doc.height * this.zoom,
    };
  },

  /* -------------------------------- zoom -------------------------------- */

  setZoom(z, anchor) {
    const next = clamp(z, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(next - this.zoom) < 1e-6) return;
    const a = anchor || { x: this.w / 2, y: this.h / 2 };
    const before = this.toDoc(a.x, a.y);
    this.zoom = next;
    const after = this.toScreen(before.x, before.y);
    this.x += a.x - after.x;
    this.y += a.y - after.y;
    emit("zoom", this.zoom);
    emit("view", this);
  },

  zoomBy(factor, anchor) {
    this.setZoom(this.zoom * factor, anchor);
  },

  /** Step through a pleasant zoom ladder instead of raw multiplication. */
  zoomStep(dir, anchor) {
    const ladder = [
      0.02, 0.05, 0.08, 0.12, 0.17, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6,
      8, 12, 16, 24, 32,
    ];
    const z = this.zoom;
    if (dir > 0) {
      this.setZoom(ladder.find((v) => v > z + 1e-4) ?? MAX_ZOOM, anchor);
    } else {
      const lower = ladder.filter((v) => v < z - 1e-4);
      this.setZoom(lower.length ? lower[lower.length - 1] : MIN_ZOOM, anchor);
    }
  },

  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
    emit("view", this);
  },

  center() {
    const doc = state.doc;
    if (!doc) return;
    this.x = Math.round((this.w - doc.width * this.zoom) / 2);
    this.y = Math.round((this.h - doc.height * this.zoom) / 2);
    emit("view", this);
  },

  fit({ padding = 56, max = 8 } = {}) {
    const doc = state.doc;
    if (!doc) return;
    const z = Math.min(
      (this.w - padding) / doc.width,
      (this.h - padding) / doc.height
    );
    this.zoom = clamp(z, MIN_ZOOM, max);
    this.center();
    emit("zoom", this.zoom);
  },

  actualSize() {
    this.zoom = 1;
    this.center();
    emit("zoom", this.zoom);
  },
};
