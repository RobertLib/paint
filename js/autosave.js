/* ==========================================================================
   Autosave — the open document is written to this browser's IndexedDB a
   moment after each change, so a closed tab, a crash or a reload never costs
   the work. Nothing is uploaded. The next visit offers to restore it.
   ========================================================================== */

import { Doc } from "./doc.js";
import { history } from "./history.js";
import { t } from "./i18n.js";
import { emit, on, state } from "./state.js";
import { idbDelete, idbGet, idbSet } from "./store.js";

const KEY = "autosave";
const DELAY = 1500;
/** Skip autosave for documents too big to write without stutter. */
const MAX_PIXELS = 8000 * 8000 * 3;

let timer = 0;
let saving = null;
let pending = false;

async function save() {
  timer = 0;
  const doc = state.doc;
  if (!doc) return;
  if (doc.layers.length * doc.width * doc.height > MAX_PIXELS) return;
  if (saving) {
    pending = true;
    return;
  }
  saving = (async () => {
    try {
      const data = await doc.toStorable();
      await idbSet(KEY, { savedAt: Date.now(), thumb: await thumbnail(doc), doc: data });
    } catch (err) {
      console.warn("[paint] autosave failed", err);
    }
  })();
  await saving;
  saving = null;
  if (pending) {
    pending = false;
    schedule();
  }
}

function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    // write when the browser is idle so a stroke never stutters
    if (window.requestIdleCallback) requestIdleCallback(save, { timeout: 2000 });
    else save();
  }, DELAY);
}

async function thumbnail(doc) {
  const k = Math.min(1, 240 / Math.max(doc.width, doc.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(doc.width * k));
  c.height = Math.max(1, Math.round(doc.height * k));
  c.getContext("2d").drawImage(doc.composite(), 0, 0, c.width, c.height);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

/** Write immediately (before a reload). */
export async function flushAutosave() {
  clearTimeout(timer);
  timer = 0;
  if (saving) await saving;
  await save();
}

/** What a previous session left behind, without loading the bitmaps. */
export async function peekAutosave() {
  const entry = await idbGet(KEY);
  if (!entry?.doc) return null;
  return {
    name: entry.doc.name,
    width: entry.doc.width,
    height: entry.doc.height,
    layers: entry.doc.layers?.length || 0,
    savedAt: entry.savedAt,
    thumb: entry.thumb || null,
  };
}

export async function loadAutosave() {
  const entry = await idbGet(KEY);
  if (!entry?.doc) return null;
  return Doc.fromJSON(entry.doc);
}

export const clearAutosave = () => idbDelete(KEY);

/** "5 minutes ago" in the UI language. */
export function relativeTime(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return t("just now");
  const m = Math.round(s / 60);
  if (m < 60) return t("{n} min ago", { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t("{n} h ago", { n: h });
  return new Date(ts).toLocaleDateString(document.documentElement.lang || undefined);
}

export function initAutosave() {
  on("history", () => {
    if (history.stack.length) schedule();
  });
  on("doc", ({ reason }) => {
    // a freshly opened document replaces the saved one right away
    if (reason === "open") schedule();
  });
  on("flush-autosave", () => flushAutosave());
  // last chance when the tab goes away
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && timer) {
      clearTimeout(timer);
      save();
    }
  });
  emit("autosave-ready");
}
