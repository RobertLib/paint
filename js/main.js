/* ==========================================================================
   Bootstrap — wire the modules together and hand control to the user.
   ========================================================================== */

import { translateDOM } from "./i18n.js";
import * as A from "./actions.js";
import {
  clearAutosave,
  initAutosave,
  loadAutosave,
  peekAutosave,
  relativeTime,
} from "./autosave.js";
import { t } from "./i18n.js";
import { initMenus, showWelcome } from "./menus.js";
import { initRender, requestRender } from "./render.js";
import { emit, loadPrefs, on, registerDefaults, state } from "./state.js";
import { HANDOFF_KEY, HANDOFF_TTL, idbDelete, idbGet } from "./store.js";
import { isBlankTask, startTask } from "./tasks.js";
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

async function restore() {
  try {
    const doc = await loadAutosave();
    if (!doc) return false;
    A.setDocument(doc);
    emit("toast", { msg: t("Restored “{name}”", { name: doc.name }), kind: "ok" });
    track("restore");
    return true;
  } catch (err) {
    console.error(err);
    emit("toast", { msg: t("The saved session could not be restored"), kind: "err" });
    await clearAutosave();
    return false;
  }
}

on("restore-autosave", restore);

/** Offer the autosaved document on the welcome screen. */
async function offerRestore() {
  const saved = await peekAutosave();
  const card = document.getElementById("restoreCard");
  if (!saved || !card) return;
  card.hidden = false;
  card.querySelector("[data-restore-name]").textContent = saved.name || t("Untitled");
  card.querySelector("[data-restore-meta]").textContent = t("{w} × {h} · {when}", {
    w: saved.width,
    h: saved.height,
    when: relativeTime(saved.savedAt),
  });
  if (saved.thumb) {
    const img = card.querySelector("img");
    img.src = URL.createObjectURL(saved.thumb);
    img.hidden = false;
  }
}

async function boot() {
  let opened = false;
  const file = await takeHandoff().catch(() => null);
  if (file) opened = await A.openImageFile(file);
  if (!opened && params.get("restore") === "1") opened = await restore();
  if (!opened && task && isBlankTask(task)) {
    startTask(task);
    opened = !!state.doc;
  }
  if (!opened) {
    showWelcome();
    offerRestore();
  }
  if (task) startTask(task);

  // a reload should not replay the hand-over or the restore
  if (params.has("open") || params.has("restore")) {
    params.delete("open");
    params.delete("restore");
    const qs = params.toString();
    history.replaceState(null, "", `${location.pathname}${qs ? `?${qs}` : ""}${location.hash}`);
  }
  track(task ? `editor-${task}` : "editor");
}

boot();

/* installed app: files opened from the OS ("Open with Paint Studio") */
if ("launchQueue" in window) {
  window.launchQueue.setConsumer(async ({ files }) => {
    for (const handle of files || []) {
      const file = await handle.getFile();
      await A.openImageFile(file, { asLayer: !!state.doc && files.length > 1 });
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
