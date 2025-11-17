/* ==========================================================================
   Bootstrap — wire the modules together and hand control to the user.
   ========================================================================== */

import { initMenus } from "./menus.js";
import { initRender, requestRender } from "./render.js";
import { loadPrefs, on, registerDefaults, state } from "./state.js";
import { TOOL_DEFAULTS, TOOLS, initInput, switchTool } from "./tools.js";
import { initUI } from "./ui.js";
import { view } from "./viewport.js";

/* preferences first: saved values win, defaults fill the gaps */
loadPrefs();
registerDefaults(TOOL_DEFAULTS);
if (!TOOLS[state.tool]) state.tool = "brush";

const app = document.getElementById("app");
const canvas = document.getElementById("view");
const stage = document.getElementById("stage");

/* the stage must be laid out before the renderer measures it */
app.hidden = false;
/* the landing copy is what the served HTML shows; the app takes over from here */
document.getElementById("about").hidden = true;

initRender(canvas, stage);
const input = initInput(canvas);
initUI();
initMenus();

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

/* offline support — network-first so a deploy is picked up immediately */
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is optional */
    });
  });
}
