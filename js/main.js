/* ==========================================================================
   Bootstrap — wire the modules together and hand control to the user.
   ========================================================================== */

import { translateDOM } from "./i18n.js";
import * as A from "./actions.js";
import {
  SLOT_CURRENT,
  initAutosave,
  listSessions,
  loadAutosave,
  relativeTime,
} from "./autosave.js";
import { t } from "./i18n.js";
import { initMenus, openNewDialog, showWelcome, showWelcomeDialog } from "./menus.js";
import { initRender, requestRender } from "./render.js";
import { emit, loadPrefs, on, registerDefaults, state } from "./state.js";
import { HANDOFF_KEY, HANDOFF_TTL, idbDelete, idbGet } from "./store.js";
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

window.addEventListener("beforeunload", (e) => {
  if (!state.dirty) return;
  e.preventDefault();
  e.returnValue = "";
});

/* ------------------------------ first document ---------------------------- */

const params = new URLSearchParams(location.search);
const task = params.get("task");

/** A file a landing page left for us, if it is fresh. */
async function takeHandoff() {
  if (!params.has("open")) return null;
  const entry = await idbGet(HANDOFF_KEY);
  await idbDelete(HANDOFF_KEY);
  if (!entry?.file || Date.now() - (entry.at || 0) > HANDOFF_TTL) return null;
  const { file, name, type } = entry;
  return file instanceof File ? file : new File([file], name || "image", { type: type || file.type });
}

async function restore(slot = SLOT_CURRENT) {
  if (state.doc && !A.confirmDiscard()) return false;
  emit("busy", t("Restoring…"));
  try {
    const doc = await loadAutosave(slot);
    if (!doc) {
      emit("toast", { msg: t("That session is no longer available"), kind: "err" });
      return false;
    }
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

on("restore-autosave", (slot) => restore(slot || SLOT_CURRENT));

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
      if (i > 0) card.querySelector("strong").textContent = t("An earlier session");
      card.querySelector("[data-restore-name]").textContent = saved.name || t("Untitled");
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
  if (file) opened = await A.openImageFile(file);
  if (!opened && params.get("restore") === "1") opened = restored = await restore();
  if (!opened && task && isBlankTask(task)) {
    startTask(task);
    opened = !!state.doc;
  }
  if (!opened) {
    await renderSessions();
    showWelcome();
  } else if (!restored) {
    // the earlier work is kept in the second autosave slot — say where
    const earlier = (await listSessions())[0];
    if (earlier) {
      emit("toast", {
        msg: t("Your earlier work “{name}” is kept", { name: earlier.name || t("Untitled") }),
        kind: "info",
        action: { label: t("Show"), onClick: () => emit("show-sessions") },
      });
    }
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
