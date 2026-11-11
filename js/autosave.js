/* ==========================================================================
   Autosave — the open document is written to this browser's IndexedDB a
   moment after each change, so a closed tab, a crash or a reload never costs
   the work. Nothing is uploaded. The next visit offers to restore it.

   Work is kept in two slots: the current session and the one before it.
   Editing another document moves the previous session to the second slot
   instead of overwriting it, so it can still be restored from File › Restore
   previous session. A document that has only been opened (or created) and
   not edited or renamed yet does not take part in that: it waits in a slot
   of its own, which the next such document replaces — opening files never
   pushes real work out of storage.

   A session open in one tab is not offered by the others, and restoring it
   there anyway makes a copy with its own id, so two tabs never write over
   each other's work.
   ========================================================================== */

import { Doc } from "./doc.js";
import { history, sessionsBusy, settleSessions } from "./history.js";
import { t } from "./i18n.js";
import { emit, on, state } from "./state.js";
import { idbGetMany, idbReadMany, idbUpdate } from "./store.js";

export const SLOT_CURRENT = "autosave";
export const SLOT_PREVIOUS = "autosave-prev";
/** A document that has been opened but not edited yet (never displaces work). */
export const SLOT_OPENED = "autosave-open";
/** For loadAutosave: whichever stored session was written last. */
export const SLOT_LATEST = "latest";
const SLOTS = [SLOT_CURRENT, SLOT_PREVIOUS, SLOT_OPENED];

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

/* documents that have been edited or renamed since they were opened */
const edited = new WeakSet();

/** Every layer and every layer mask is a document-sized bitmap to encode. */
const tooBig = (doc) =>
  doc.layers.reduce((n, l) => n + (l.mask ? 2 : 1), 0) * doc.width * doc.height > MAX_PIXELS;

/* ------------------------------ session locks ----------------------------- */

/* The tab that has a session open holds a Web Lock named after it, which
   lets the other tabs see that it is taken (where the browser has locks).
   A page that is being left lets go of its lock only a moment after the
   next page of the same tab has started: the tab remembers its session
   (sessionStorage outlives its pages), so that lock is not mistaken for
   another tab's and is waited for instead. */
const LOCK = "paint-studio-session:";
/** sid → function that releases this tab's lock on it */
const held = new Map();
/** How long the page before may take to let go of this tab's session. */
const HANDOVER_WAIT = 3000;
const TAB_KEY = "paint-studio-session";

function tabSession() {
  try {
    return sessionStorage.getItem(TAB_KEY);
  } catch {
    return null;
  }
}

/** The session the page before this one in the tab had open, if any. */
const pageBefore = tabSession();
/** This tab's session — now, or on the page before (whose lock may linger). */
const ofThisTab = (sid) => !!sid && (sid === pageBefore || sid === tabSession());

function setTabSession(sid) {
  try {
    sessionStorage.setItem(TAB_KEY, sid);
  } catch {
    /* storage blocked: other tabs' sessions may then be offered too */
  }
}

/**
 * Take the lock of session `sid` for this tab. Resolves false when another
 * tab has it — after waiting up to `wait` ms for it to let go (a reloading
 * tab releases it as it unloads) — and true when it is ours, or when the
 * browser has no locks to ask.
 */
function claim(sid, wait = 0) {
  const locks = navigator.locks;
  if (!locks?.request || held.has(sid)) return Promise.resolve(true);
  const signal = wait > 0 && AbortSignal.timeout ? AbortSignal.timeout(wait) : null;
  return new Promise((resolve) => {
    locks
      .request(LOCK + sid, signal ? { signal } : { ifAvailable: true }, (lock) => {
        if (!lock) return resolve(false);
        resolve(true);
        // held until released (another document opens in this tab)
        return new Promise((release) => held.set(sid, release));
      })
      .catch((err) => resolve(err?.name !== "AbortError"));
  });
}

/** Let go of every session lock except the one of `keep`. */
function releaseOthers(keep) {
  for (const [sid, release] of held) {
    if (sid === keep) continue;
    held.delete(sid);
    release();
  }
}

/** Sessions that another tab has open. */
async function takenElsewhere() {
  try {
    const { held: locks = [] } = (await navigator.locks?.query?.()) || {};
    return new Set(
      locks
        .map((l) => l.name || "")
        .filter((name) => name.startsWith(LOCK))
        .map((name) => name.slice(LOCK.length))
        .filter((sid) => !held.has(sid) && !ofThisTab(sid))
    );
  } catch {
    return new Set();
  }
}

/* ---------------------------------- saving -------------------------------- */

/**
 * The writes that store `entry`. Work goes to the current slot; another
 * session there moves to the second slot, so it is kept. A document not
 * edited yet only replaces the previous such document. Copies of the same
 * session elsewhere are dropped, so no session is ever listed twice.
 */
function placement(entry, [current, previous, opened]) {
  const { sid } = entry;
  if (entry.pristine) {
    // (a copy that is already among the kept sessions is not needed twice)
    if (current?.sid === sid || previous?.sid === sid) return null;
    return { [SLOT_OPENED]: entry };
  }
  const out = { [SLOT_CURRENT]: entry };
  if (current?.doc && current.sid !== sid && !current.pristine) out[SLOT_PREVIOUS] = current;
  else if (previous?.sid === sid) out[SLOT_PREVIOUS] = undefined;
  if (opened?.sid === sid) out[SLOT_OPENED] = undefined;
  return out;
}

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
      if (!edited.has(doc)) entry.pristine = true;
      // the slots are read again on every write — another tab or window may
      // have saved its own document since. Everything moves in the same
      // transaction: either all writes land or none do, so a session is
      // never overwritten without being kept
      await idbUpdate(SLOTS, (slots) => placement(entry, slots));
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

/* --------------------------------- restoring ------------------------------ */

const summary = (slot, entry) => ({
  slot,
  sid: entry.sid || null,
  name: entry.doc.name,
  width: entry.doc.width,
  height: entry.doc.height,
  layers: entry.doc.layers?.length || 0,
  savedAt: entry.savedAt,
  thumb: entry.thumb || null,
  /** opened but never edited — not work that another session could lose */
  pristine: !!entry.pristine,
});

/** What a session left behind, without loading the bitmaps. */
export async function peekAutosave(slot = SLOT_CURRENT) {
  const [entry] = await idbGetMany([slot]);
  return entry?.doc ? summary(slot, entry) : null;
}

/**
 * The stored sessions that are not the open document and not open in
 * another tab, newest first (edited work before an opened-only document of
 * the same age).
 */
export async function listSessions() {
  const open = state.doc ? sids.get(state.doc) : null;
  const [entries, taken] = await Promise.all([idbGetMany(SLOTS), takenElsewhere()]);
  const seen = new Set();
  return entries
    .map((entry, i) => (entry?.doc ? summary(SLOTS[i], entry) : null))
    .filter((s) => s && (!open || s.sid !== open) && !(s.sid && taken.has(s.sid)))
    .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0) || a.pristine - b.pristine)
    .filter((s) => !s.sid || (!seen.has(s.sid) && seen.add(s.sid)));
}

/**
 * Load a stored session: the one in `slot` — or, given its `sid`, the one
 * with that id in whichever slot holds it now (another tab may have moved
 * it). SLOT_LATEST picks the session written last. Resolves null when there
 * is no such session; rejects when storage fails, which is not the same as
 * the session being gone.
 *
 * When another tab has the session open, the restored document becomes a
 * copy with an id of its own; `waitForLock` (ms) first gives that tab time
 * to let go of it (a tab that is reloading).
 */
export async function loadAutosave(slot = SLOT_CURRENT, sid = null, { waitForLock = 0 } = {}) {
  const entries = await idbReadMany(SLOTS);
  const stored = entries.filter((e) => e?.doc);
  let entry;
  if (sid) entry = stored.find((e) => e.sid === sid);
  else if (slot === SLOT_LATEST) entry = stored.reduce((a, e) => (!a || (e.savedAt || 0) > (a.savedAt || 0) ? e : a), null);
  else entry = entries[SLOTS.indexOf(slot)];
  if (!entry?.doc) return null;
  const doc = await Doc.fromJSON(entry.doc);
  const wait = Math.max(waitForLock, ofThisTab(entry.sid) ? HANDOVER_WAIT : 0);
  const own = entry.sid && (await claim(entry.sid, wait));
  const docSid = own ? entry.sid : newSid();
  if (!own) await claim(docSid);
  sids.set(doc, docSid);
  // stored work stays work; an opened-only document stays just opened
  if (!entry.pristine) edited.add(doc);
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
    if (!history.stack.length || !state.doc) return;
    edited.add(state.doc);
    schedule();
  });
  on("doc", ({ reason }) => {
    if (reason !== "open" || !state.doc) return;
    // this tab now has this session open (and no other)
    const sid = sidOf(state.doc);
    releaseOthers(sid);
    claim(sid);
    setTabSession(sid);
    // a freshly opened document is saved right away — in its own slot
    // until it is edited, where it pushes no stored work out
    schedule();
  });
  // a new title is part of the document too (and makes it work worth keeping)
  on("doc-renamed", () => {
    if (!state.doc) return;
    edited.add(state.doc);
    schedule();
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
