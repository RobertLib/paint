/* ==========================================================================
   Global application state + a tiny event bus.

   Everything that is not pixel data lives here: the active tool, colors,
   per-tool options, UI preferences. Modules subscribe with on(event, fn) and
   the owning setter emits — no module reaches into another module's DOM.
   ========================================================================== */

import { PALETTE, parseColor, rgbToHex } from "./color.js";

const listeners = new Map();

export function on(event, fn) {
  let set = listeners.get(event);
  if (!set) listeners.set(event, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[paint] listener for "${event}" failed`, err);
    }
  }
}

/* ------------------------------- the state ------------------------------- */

export const state = {
  /** current Doc instance (see doc.js) — null before a document exists */
  doc: null,
  tool: "brush",
  /** tool we auto-return to after a transient tool (space-pan, alt-picker) */
  resumeTool: null,
  primary: { r: 17, g: 17, b: 21, a: 1 },
  secondary: { r: 255, g: 255, b: 255, a: 1 },
  /** which chip the color picker edits */
  activeChip: "primary",
  swatches: [...PALETTE],
  recent: [],
  /** per-tool option values, keyed by tool id */
  opts: {},
  theme: "dark",
  /** stage cursor position in document space, or null when outside */
  cursor: null,
  dirty: false,
  /** a pointer gesture is in progress — shortcuts and undo wait for it */
  dragging: false,
};

const PREFS_KEY = "paint-studio:prefs:v2";

/* --------------------------------- tools --------------------------------- */

export function setTool(id, { transient = false } = {}) {
  if (state.tool === id) return;
  if (transient && !state.resumeTool) state.resumeTool = state.tool;
  if (!transient) state.resumeTool = null;
  const prev = state.tool;
  state.tool = id;
  // a transient tool (space-pan, Alt-pick) is not a choice worth keeping
  if (!transient) savePrefs();
  emit("tool", { tool: id, prev });
}

/* -------------------------------- options -------------------------------- */

/** Seed defaults for tools that have no stored values yet. */
export function registerDefaults(defaults) {
  for (const [toolId, values] of Object.entries(defaults)) {
    state.opts[toolId] = { ...values, ...(state.opts[toolId] || {}) };
  }
}

export function opt(key, toolId = state.tool) {
  const bag = state.opts[toolId];
  return bag ? bag[key] : undefined;
}

export function setOpt(key, value, toolId = state.tool) {
  const bag = (state.opts[toolId] ||= {});
  if (bag[key] === value) return;
  bag[key] = value;
  savePrefs();
  emit("opts", { tool: toolId, key, value });
}

/* --------------------------------- colors -------------------------------- */

/**
 * Set the primary/secondary colour.
 *
 * `record` is opt-in on purpose: the picker fires this continuously while the
 * user drags through the field or the hue slider, and every one of those
 * intermediate colours would otherwise land in the recents list.
 */
export function setColor(color, which = state.activeChip, { record = false } = {}) {
  const c = parseColor(color);
  if (!c) return;
  state[which] = { a: 1, ...c };
  if (record) pushRecent(state[which]);
  savePrefs();
  emit("color", { which, color: state[which] });
}

/** Remember the current colour as recently used — call once per interaction. */
export function recordRecent(which = state.activeChip) {
  pushRecent(state[which]);
  savePrefs();
  emit("color", { which: "recent" });
}

export function swapColors() {
  const p = state.primary;
  state.primary = state.secondary;
  state.secondary = p;
  savePrefs();
  emit("color", { which: "both" });
}

export function setActiveChip(which) {
  if (state.activeChip === which) return;
  state.activeChip = which;
  emit("color", { which: "chip" });
}

function pushRecent(c) {
  const hex = rgbToHex(c);
  state.recent = [hex, ...state.recent.filter((h) => h !== hex)].slice(0, 12);
}

/* --------------------------------- theme --------------------------------- */

/**
 * The theme the user picked ("light" | "dark"), or null to follow the
 * system's — live, so an OS switching to dark mode at sunset is followed.
 * Only a choice is saved (as `themeChoice`).
 */
let themeChoice = null;

const BAR_COLOR = { light: "#f4f5f9", dark: "#0e0f14" };
const systemLight = window.matchMedia?.("(prefers-color-scheme: light)") || null;
const systemTheme = () => (systemLight?.matches ? "light" : "dark");

function applyTheme(theme) {
  state.theme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = state.theme;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    // a chosen theme paints the browser chrome whatever the system uses;
    // following the system, every tag keeps the colour of the scheme its
    // media query names
    const media = meta.getAttribute("media") || "";
    const own = /light/.test(media) ? "light" : /dark/.test(media) ? "dark" : state.theme;
    meta.setAttribute("content", BAR_COLOR[themeChoice ? state.theme : own]);
  }
  emit("theme", state.theme);
}

/** The user picked a theme (the toolbar and menu toggles): kept from now on. */
export function setTheme(theme) {
  themeChoice = theme === "light" ? "light" : "dark";
  applyTheme(themeChoice);
  savePrefs();
}

systemLight?.addEventListener?.("change", () => {
  if (!themeChoice) applyTheme(systemTheme());
});

/* ------------------------------ persistence ------------------------------ */

let saveTimer = 0;

/** Preferences are written a moment after the last change… */
export function savePrefs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPrefs, 250);
}

/** …or right away when the page is hidden or closed (the timer may never fire). */
function flushPrefs() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = 0;
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        tool: state.tool,
        primary: state.primary,
        secondary: state.secondary,
        recent: state.recent,
        opts: state.opts,
        // absent while following the system theme
        themeChoice: themeChoice || undefined,
      })
    );
  } catch {
    /* private mode / quota — preferences are a nicety, never fatal */
  }
}

window.addEventListener("pagehide", flushPrefs);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPrefs();
});

export function loadPrefs() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
  } catch {
    saved = null;
  }

  if (saved && typeof saved === "object") {
    // stored data is checked piece by piece: one bad value must not keep the
    // editor from starting
    const channel = (v) => Math.min(255, Math.max(0, Math.round(v)));
    const color = (c) =>
      c && typeof c === "object" && [c.r, c.g, c.b].every(Number.isFinite)
        ? {
            r: channel(c.r),
            g: channel(c.g),
            b: channel(c.b),
            a: Number.isFinite(c.a) ? Math.min(1, Math.max(0, c.a)) : 1,
          }
        : null;
    state.primary = color(saved.primary) || state.primary;
    state.secondary = color(saved.secondary) || state.secondary;
    if (Array.isArray(saved.recent)) {
      state.recent = saved.recent
        .filter((h) => typeof h === "string" && /^#[0-9a-f]{3,8}$/i.test(h))
        .slice(0, 12);
    }
    if (saved.opts && typeof saved.opts === "object" && !Array.isArray(saved.opts)) {
      for (const [tool, bag] of Object.entries(saved.opts)) {
        if (bag && typeof bag === "object" && !Array.isArray(bag)) state.opts[tool] = { ...bag };
      }
    }
    if (typeof saved.tool === "string") state.tool = saved.tool;
    // the old `theme` field was written on every visit, chosen or not: only
    // an explicit choice counts
    if (saved.themeChoice === "light" || saved.themeChoice === "dark") {
      themeChoice = saved.themeChoice;
    }
  }
  applyTheme(themeChoice || systemTheme());
}

/* -------------------------------- helpers -------------------------------- */

export function markDirty(value = true) {
  if (state.dirty === value) return;
  state.dirty = value;
  emit("dirty", value);
}
