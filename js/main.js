/* ==========================================================================
   Bootstrap — wire the modules together and hand control to the user.
   ========================================================================== */

import { translateDOM } from "./i18n.js";
import * as A from "./actions.js";
import {
  SLOT_CURRENT,
  SLOT_LATEST,
  initAutosave,
  listSessions,
  loadAutosave,
  relativeTime,
} from "./autosave.js";
import { sessionsBusy } from "./history.js";
import { t } from "./i18n.js";
import { initMenus, openNewDialog, showWelcome, showWelcomeDialog } from "./menus.js";
import { initRender, requestRender } from "./render.js";
import { emit, loadPrefs, on, registerDefaults, state } from "./state.js";
import { HANDOFF_KEY, HANDOFF_TTL, handoffKey, idbDelete, idbGet, idbSweep } from "./store.js";
import { isBlankTask, isTask, startTask } from "./tasks.js";
import { initTone } from "./tone.js";
import { TOOL_DEFAULTS, TOOLS, initInput, switchTool } from "./tools.js";
import { track } from "./track.js";
import { initUI } from "./ui.js";
import { view } from "./viewport.js";

/* static markup first, so everything built afterwards starts translated */
translateDOM(document.body);

/* preferences first: saved values win, defaults fill the gaps */
loadPrefs();
registerDefaults(TOOL_DEFAULTS);
if (!TOOLS[state.tool] || state.tool === "transform") state.tool = "brush";

const canvas = document.getElementById("view");
const stage = document.getElementById("stage");

initRender(canvas, stage);
const input = initInput(canvas);
initUI();
initMenus();
initTone();
initAutosave();

on("tool", ({ tool, prev }) => {
  switchTool(tool, prev);
  input.applyCursor();
});

on("view", () => TOOLS.text.onViewChange?.());

/* tools that draw an on-canvas UI (crop, clone) need a document to attach to */
on("doc", ({ reason }) => {
  if (reason === "open") TOOLS[state.tool]?.activate?.();
});

window.addEventListener("resize", () => {
  view.resize();
  requestRender();
});

/* work on screen that is not in the document yet — a live adjustment or
   filter preview, a transform, typed text — would be lost as well */
const pendingWork = () => sessionsBusy() || !!TOOLS.text._editor?.value.trim();

window.addEventListener("beforeunload", (e) => {
  if (!state.dirty && !pendingWork()) return;
  e.preventDefault();
  e.returnValue = "";
});

/* ------------------------------ first document ---------------------------- */

const params = new URLSearchParams(location.search);
const task = params.get("task");

/** What ?restore= accepts besides "1": a session id (see autosave.js). */
const SESSION_ID = /^[a-z0-9-]{1,40}$/i;
/** How long the page before a reload may hold on to its session. */
const RELOAD_LOCK_WAIT = 3000;
/** How long the welcome screen waits for the stored sessions to be listed. */
const SESSIONS_WAIT = 700;

const handoffStale = (entry) => !(Math.abs(Date.now() - (entry?.at || 0)) <= HANDOFF_TTL);

/** A file a landing page left for us, if it is fresh. */
async function takeHandoff() {
  const id = params.get("open");
  // ?open=1 with the one shared key: landing pages from before per-drop keys
  // (an older service worker may still serve them from its cache)
  // (?open=0: the landing page could not store the file — see boot())
  const key = id === "1" ? HANDOFF_KEY : id === "0" ? null : handoffKey(id);
  if (!key) return null;
  const entry = await idbGet(key);
  await idbDelete(key);
  if (!entry?.file || handoffStale(entry)) return null;
  const { file, name, type } = entry;
  return file instanceof File ? file : new File([file], name || "image", { type: type || file.type });
}

/**
 * The default name is stored in the language it was given in: either
 * language's "Untitled" shows in the current one.
 */
const shownName = (name) => (!name || name === "Untitled" || name === "Bez názvu" ? t("Untitled") : name);

/**
 * Restore the session in `slot` — or, given `sid`, that session wherever it
 * is now. `waitForLock` (ms): how long a tab that still has the session open
 * (the page being reloaded) may take to let go of it.
 */
async function restore(slot = SLOT_CURRENT, sid = null, { waitForLock = 0 } = {}) {
  if (state.doc && !A.confirmDiscard()) return false;
  emit("busy", t("Restoring…"));
  try {
    const doc = await loadAutosave(slot, sid, { waitForLock });
    if (!doc) {
      emit("toast", { msg: t("That session is no longer available"), kind: "err" });
      return false;
    }
    doc.name = shownName(doc.name);
    A.setDocument(doc, { restored: true });
    emit("toast", { msg: t("Restored “{name}”", { name: doc.name }), kind: "ok" });
    track("restore");
    return true;
  } catch (err) {
    // keep the stored session: a later attempt (more memory, another
    // browser update) may well succeed — never delete the only copy
    console.error(err);
    emit("toast", { msg: t("The saved session could not be restored"), kind: "err" });
    return false;
  } finally {
    emit("busy", null);
  }
}

/* a restore card sends { slot, sid } — another tab may have moved that
   session to the other slot since the card was drawn; older callers: a slot */
on("restore-autosave", (arg) => {
  const { slot, sid } = arg && typeof arg === "object" ? arg : { slot: arg };
  restore(slot || SLOT_CURRENT, sid || null);
});

const thumbUrls = [];

/** Cards for the stored sessions on the welcome screen. */
async function renderSessions() {
  const list = document.getElementById("restoreList");
  const template = document.getElementById("restoreCard");
  if (!list || !template) return [];
  const sessions = await listSessions();
  for (const url of thumbUrls.splice(0)) URL.revokeObjectURL(url);
  list.replaceChildren(
    ...sessions.map((saved, i) => {
      const card = template.cloneNode(true);
      card.removeAttribute("id");
      card.hidden = false;
      card.dataset.slot = saved.slot;
      card.dataset.sid = saved.sid || "";
      if (i > 0) card.querySelector("strong").textContent = t("An earlier session");
      card.querySelector("[data-restore-name]").textContent = shownName(saved.name);
      card.querySelector("[data-restore-meta]").textContent = t("{w} × {h} · {when}", {
        w: saved.width,
        h: saved.height,
        when: relativeTime(saved.savedAt),
      });
      if (saved.thumb) {
        const img = card.querySelector("img");
        const url = URL.createObjectURL(saved.thumb);
        thumbUrls.push(url);
        img.src = url;
        img.hidden = false;
      }
      return card;
    })
  );
  return sessions;
}

/** File › Restore previous session…: the welcome screen with the sessions. */
on("show-sessions", async () => {
  const sessions = await renderSessions();
  if (!sessions.length) {
    emit("toast", { msg: t("There is no other saved session"), kind: "info" });
    return;
  }
  showWelcomeDialog();
});

async function boot() {
  let opened = false;
  let restored = false;
  const file = await takeHandoff().catch(() => null);
  // files left for an editor that never opened (an aborted navigation)
  idbSweep(HANDOFF_KEY, handoffStale).catch(() => {});
  if (file) opened = await A.openImageFile(file);
  // a reload that keeps the document (switching the language): ?restore=<the
  // session's id>, or ?restore=1 from older pages — the session saved last
  const again = params.get("restore");
  if (!opened && again) {
    const sid = again !== "1" && SESSION_ID.test(again) ? again : null;
    if (sid || again === "1") {
      opened = restored = await restore(sid ? SLOT_CURRENT : SLOT_LATEST, sid, { waitForLock: RELOAD_LOCK_WAIT });
    }
  }
  if (!opened && task && isBlankTask(task)) {
    startTask(task);
    opened = !!state.doc;
  }
  if (!opened) {
    // the stored sessions come with the welcome screen — unless storage is
    // slow to answer (a hung IndexedDB): then they join it when they can
    const cards = renderSessions().catch(() => []);
    await Promise.race([cards, new Promise((r) => setTimeout(r, SESSIONS_WAIT))]);
    showWelcome();
  } else if (!restored) {
    // the earlier work is kept in the autosave — say where (a document that
    // was only opened, never edited, is not "work")
    const earlier = (await listSessions()).find((s) => !s.pristine);
    if (earlier) {
      emit("toast", {
        msg: t("Your earlier work “{name}” is kept", { name: shownName(earlier.name) }),
        kind: "info",
        action: { label: t("Show"), onClick: () => emit("show-sessions") },
      });
    }
  }
  if (params.get("open") === "0") {
    // the landing page could not store the file it was given (storage
    // blocked or full): say so instead of leaving the user to wonder
    // (without a document the welcome screen is up, with its own "Open
    // image" — and a modal dialog leaves a toast's button unclickable)
    const action = state.doc
      ? { label: t("Open image…"), onClick: () => document.getElementById("imageInput").click() }
      : null;
    emit("toast", {
      msg: t("The file could not be handed over to the editor — open it again"),
      kind: "err",
      action,
    });
  }
  if (task) startTask(task, { restored });

  // a reload should not replay the hand-over, the restore or the task
  if (params.has("open") || params.has("restore") || params.has("task")) {
    params.delete("open");
    params.delete("restore");
    params.delete("task");
    const qs = params.toString();
    history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  }
  track(task && isTask(task) ? `editor-${task}` : "editor");
}

boot();

/* installed app: files opened from the OS ("Open with Paint Studio") and
   app shortcuts while the window is already open (launch_handler) */
if ("launchQueue" in window) {
  window.launchQueue.setConsumer(async ({ files, targetURL }) => {
    const handles = files || [];
    for (const handle of handles) {
      try {
        const file = await handle.getFile();
        await A.openImageFile(file, { asLayer: !!state.doc && handles.length > 1 });
      } catch (err) {
        console.error(err);
        emit("toast", { msg: t("Could not open that image"), kind: "err" });
      }
    }
    if (!handles.length && targetURL) {
      const next = new URL(targetURL).searchParams.get("task");
      // "New canvas" with a document open asks for the size, as File › New
      if (next === "paint" && state.doc) openNewDialog();
      else if (next) startTask(next, { again: true });
    }
  });
}

/* offline support — network-first so a deploy is picked up immediately */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("../sw.js", { scope: "../" }).catch(() => {
      /* offline support is optional */
    });
  });
}
