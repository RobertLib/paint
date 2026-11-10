/* ==========================================================================
   Autosave — the open document is written to this browser's IndexedDB a
   moment after each change, so a closed tab, a crash or a reload never costs
   the work. Nothing is uploaded. The next visit offers to restore it.

   Two slots: the current session and the one before it. Opening another
   document (for example from a landing page) moves the previous session to
   the second slot instead of overwriting it, so it can still be restored
   from File › Restore previous session.
   ========================================================================== */

import { Doc } from "./doc.js";
import { history, sessionsBusy, settleSessions } from "./history.js";
import { t } from "./i18n.js";
import { emit, on, state } from "./state.js";
import { idbGet, idbRead, idbUpdate } from "./store.js";

export const SLOT_CURRENT = "autosave";
export const SLOT_PREVIOUS = "autosave-prev";
const DELAY = 1500;
/** Skip autosave for documents too big to write without stutter. */
const MAX_PIXELS = 8000 * 8000 * 3;

let timer = 0;
let saving = null;

/* the user hears once per document why it is not being autosaved — and
   again only after a later write has succeeded */
const warned = new WeakMap();
function warn(doc, reason, msg, kind) {
  if (warned.get(doc) === reason) return;
  warned.set(doc, reason);
  emit("toast", { msg, kind });
}

/* every document gets a session id; a restored one keeps its own */
const sids = new WeakMap();
const newSid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
export function sidOf(doc) {
  let sid = sids.get(doc);
  if (!sid) sids.set(doc, (sid = newSid()));
  return sid;
}

const tooBig = (doc) => doc.layers.length * doc.width * doc.height > MAX_PIXELS;

/** Write the open document. Resolves true when it is safely stored. */
async function save() {
  timer = 0;
  const doc = state.doc;
  if (!doc) return false;
  // a live preview or a stroke holds pixels that are not final yet
  if (sessionsBusy() || state.dragging) {
    schedule();
    return false;
  }
  if (tooBig(doc)) {
    const msg = t("This document is too large to be autosaved — save the project to keep your work");
    warn(doc, "big", msg, "info");
    return false;
  }
  if (saving) {
    // one write at a time; then write again with the newest state
    await saving;
    return save();
  }
  saving = (async () => {
    try {
      const sid = sidOf(doc);
      const data = await doc.toStorable();
      const thumb = await thumbnail(doc);
      const entry = { sid, savedAt: Date.now(), thumb, doc: data };
      // the slot is read again on every write — another tab or window may
      // have saved its own document there since. That session moves to the
      // second slot in the same transaction: either both writes land or
      // neither does, so it is never overwritten without being kept
      await idbUpdate(SLOT_CURRENT, (existing) =>
        existing?.doc && existing.sid !== sid
          ? { [SLOT_PREVIOUS]: existing, [SLOT_CURRENT]: entry }
          : { [SLOT_CURRENT]: entry }
      );
      warned.delete(doc);
      emit("autosave", { ok: true });
      return true;
    } catch (err) {
      console.warn("[paint] autosave failed", err);
      const msg = t("Autosave failed — this browser's storage may be full or blocked. Save the project to keep your work");
      warn(doc, "failed", msg, "err");
      emit("autosave", { ok: false });
      return false;
    }
  })();
  const ok = await saving;
  saving = null;
  return ok;
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

/** Write immediately (before a reload). Resolves true when stored. */
export async function flushAutosave() {
  clearTimeout(timer);
  timer = 0;
  // a reload is coming: keep what is on screen (an open preview, a text box)
  settleSessions();
  if (saving) await saving;
  const doc = state.doc;
  if (!doc) return true;
  if (tooBig(doc)) return false;
  return save();
}

/** What a session left behind, without loading the bitmaps. */
export async function peekAutosave(slot = SLOT_CURRENT) {
  const entry = await idbGet(slot);
  if (!entry?.doc) return null;
  return {
    slot,
    sid: entry.sid || null,
    name: entry.doc.name,
    width: entry.doc.width,
    height: entry.doc.height,
    layers: entry.doc.layers?.length || 0,
    savedAt: entry.savedAt,
    thumb: entry.thumb || null,
  };
}

/** Both stored sessions that are not the open document, newest first. */
export async function listSessions() {
  const open = state.doc ? sids.get(state.doc) : null;
  const all = [await peekAutosave(SLOT_CURRENT), await peekAutosave(SLOT_PREVIOUS)];
  return all.filter((s) => s && (!open || s.sid !== open));
}

/**
 * Load a stored session: the one in `slot` — or, given its `sid`, the one
 * with that id in whichever slot holds it now (another tab may have moved
 * it). Resolves null when there is no such session; rejects when storage
 * fails, which is not the same as the session being gone.
 */
export async function loadAutosave(slot = SLOT_CURRENT, sid = null) {
  let entry = await idbRead(slot);
  if (sid && entry?.sid !== sid) {
    entry = await idbRead(slot === SLOT_PREVIOUS ? SLOT_CURRENT : SLOT_PREVIOUS);
    if (entry?.sid !== sid) return null;
  }
  if (!entry?.doc) return null;
  const doc = await Doc.fromJSON(entry.doc);
  sids.set(doc, entry.sid || newSid());
  return doc;
}

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
    // a freshly opened document is saved right away (the session before it
    // moves to the second slot)
    if (reason === "open") schedule();
  });
  // a new title is part of the document too
  on("doc-renamed", () => {
    if (state.doc) schedule();
  });
  on("flush-autosave", () => flushAutosave());
  // last chance when the tab goes away
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && timer) {
      clearTimeout(timer);
      save();
    }
  });
  // ask the browser not to evict the autosave under storage pressure
  navigator.storage?.persisted?.().then((persisted) => {
    if (!persisted) navigator.storage.persist?.().catch(() => {});
  }).catch(() => {});
  emit("autosave-ready");
}
