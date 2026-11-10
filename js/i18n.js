/* ==========================================================================
   Localisation.

   English source strings are the keys: t("Brush") returns the Czech word when
   the UI runs in Czech and the string itself otherwise, so a missing
   translation degrades to readable English instead of a key name.

   The language is settled while this module evaluates — before any other
   module builds its tool tables or menus — from, in order: ?lang= in the URL,
   the saved choice, then the browser's preferred languages.
   ========================================================================== */

import cs from "./lang/cs.js";

const DICTS = { cs };
const KEY = "paint-studio:lang";

export const LANGS = [
  ["en", "English"],
  ["cs", "Čeština"],
];

function detect() {
  try {
    const fromUrl = new URLSearchParams(location.search).get("lang");
    if (fromUrl && LANGS.some(([code]) => code === fromUrl)) {
      localStorage.setItem(KEY, fromUrl);
      return fromUrl;
    }
  } catch {
    /* sandboxed storage — fall through */
  }
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && LANGS.some(([code]) => code === saved)) return saved;
  } catch {
    /* ignore */
  }
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  for (const p of prefs) {
    const base = String(p).toLowerCase().split("-")[0];
    // Slovak readers get the Czech UI — far closer than English
    if (base === "cs" || base === "sk") return "cs";
    if (base === "en") return "en";
  }
  return "en";
}

export const lang = detect();
const dict = DICTS[lang] || null;

/** Translate an English source string, filling {placeholders} from `vars`. */
export function t(source, vars) {
  let out = (dict && dict[source]) || source;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

/** Remember a language choice; the caller reloads so every table rebuilds. */
export function saveLang(code) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* ignore */
  }
}

/* ------------------------------ static markup ----------------------------- */

const ATTRS = ["aria-label", "data-tip", "title", "placeholder", "alt"];

/** Tooltips read "Label · shortcut": translate the label, keep the keys. */
function translateValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (dict[trimmed]) return value.replace(trimmed, dict[trimmed]);
  if (trimmed.includes(" · ")) {
    return trimmed
      .split(" · ")
      .map((part) => dict[part] || part)
      .join(" · ");
  }
  return value;
}

/** Translate text nodes and UI attributes of hand-written markup in place. */
export function translateDOM(root = document.body) {
  document.documentElement.lang = lang;
  if (!dict) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      // translate="no" marks names (the brand) that must stay as they are
      if (!parent || parent.closest('script, style, svg, [translate="no"]')) return NodeFilter.FILTER_REJECT;
      return node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) node.nodeValue = translateValue(node.nodeValue);

  for (const el of root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(","))) {
    for (const attr of ATTRS) {
      const v = el.getAttribute(attr);
      if (v) el.setAttribute(attr, translateValue(v));
    }
  }
}
