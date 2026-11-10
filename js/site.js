/* ==========================================================================
   Landing pages — hand a dropped, picked or pasted image to the editor.

   The file is stored in this browser's IndexedDB (same origin, nothing is
   uploaded) and the editor opens it with the page's task, e.g. the crop tool
   on /crop-image/. The installed app starts in the editor itself (start_url),
   so these pages never redirect: the editor's "All tools and guides" link
   has to land here.
   ========================================================================== */

import { HANDOFF_KEY, idbSet } from "./store.js";

const cfgEl = document.getElementById("dropConfig");
const cfg = cfgEl ? JSON.parse(cfgEl.textContent) : null;
const drop = document.querySelector("[data-drop]");
const busy = document.querySelector("[data-busy]");
const error = document.querySelector("[data-error]");

/** Images, Photoshop files and the editor's own .paint projects. */
const OPENABLE = /\.(png|jpe?g|webp|gif|bmp|svg|avif|heic|heif|psd|paint|ico|tiff?)$/i;
const isOpenable = (f) => !!f && (f.type.startsWith("image/") || OPENABLE.test(f.name));

let opening = false;

/** Show (or clear) a short message in the drop box; it is a live region. */
function say(text) {
  if (!error) return;
  error.hidden = !text;
  error.textContent = "";
  // a frame later, so the now-visible live region announces the change
  if (text) requestAnimationFrame(() => (error.textContent = text));
}

async function openInEditor(file) {
  if (!cfg || !file || opening) return;
  if (!isOpenable(file)) {
    say(cfg.notOpenable || "");
    return;
  }
  say("");
  opening = true;
  drop?.classList.add("is-busy");
  if (busy) busy.hidden = false;
  const stored = await idbSet(HANDOFF_KEY, {
    file,
    name: file.name,
    type: file.type,
    at: Date.now(),
  });
  const q = new URLSearchParams({ lang: cfg.lang });
  if (cfg.task) q.set("task", cfg.task);
  // without storage the editor still opens and asks for the file itself
  if (stored !== null) q.set("open", "1");
  location.href = `${cfg.editor}?${q}`;
}

for (const input of document.querySelectorAll("[data-file]")) {
  input.addEventListener("change", () => {
    openInEditor(input.files[0]);
    // picking the same file again after coming back must fire `change` again
    input.value = "";
  });
}

/* the whole page accepts a drop; the drop box lights up while dragging */
let depth = 0;
const highlight = (on) => drop?.classList.toggle("is-over", on);
window.addEventListener("dragenter", (e) => {
  if (![...(e.dataTransfer?.types || [])].includes("Files")) return;
  depth++;
  highlight(true);
});
window.addEventListener("dragleave", () => {
  depth = Math.max(0, depth - 1);
  if (!depth) highlight(false);
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  depth = 0;
  highlight(false);
  const files = [...(e.dataTransfer?.files || [])];
  if (!files.length) return;
  // an unsupported file gets a message instead of silently doing nothing
  openInEditor(files.find(isOpenable) || files[0]);
});

document.addEventListener("paste", (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (file) {
    e.preventDefault();
    openInEditor(new File([file], file.name || "pasted.png", { type: file.type }));
  }
});

// coming back with the browser's back button must not leave the box "busy"
window.addEventListener("pageshow", () => {
  opening = false;
  drop?.classList.remove("is-busy");
  if (busy) busy.hidden = true;
});

/* offline support and installability start on the landing pages too */
if ("serviceWorker" in navigator && location.protocol.startsWith("http") && cfg) {
  const root = new URL(cfg.editor, location.href);
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(new URL("../sw.js", root), { scope: new URL("../", root).pathname }).catch(() => {});
  });
}
