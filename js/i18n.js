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
  const fromUrl = new URLSearchParams(location.search).get("lang");
  if (fromUrl && LANGS.some(([code]) => code === fromUrl)) {
    // remembering the choice is a nicety; blocked storage must not undo it
    try {
      localStorage.setItem(KEY, fromUrl);
    } catch {
      /* sandboxed storage */
    }
    return fromUrl;
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

const fill = (s, vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;

/** Translate an English source string, filling {placeholders} from `vars`. */
export function t(source, vars) {
  const entry = dict && dict[source];
  return fill(typeof entry === "string" ? entry : source, vars);
}

/**
 * Translate a count. English has "1 layer" / "2 layers"; a dictionary entry
 * (keyed by the plural English string) may give the forms Czech needs:
 * { one: "1", few: "2–4", many: "5 and more" }.
 */
export function tn(n, one, other, vars) {
  const entry = dict && dict[other];
  if (entry && typeof entry === "object") {
    const form = n === 1 ? entry.one : n >= 2 && n <= 4 ? entry.few : entry.many;
    return fill(form || entry.many || other, vars);
  }
  return fill(n === 1 ? one : other, vars);
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
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Modifier glyphs in the order Windows and Linux name them: Ctrl+Alt+Shift+…. */
const MODIFIERS = [
  [/[⌘⌃]/, "Ctrl"],
  [/⌥/, "Alt"],
  [/⇧/, "Shift"],
];

/**
 * Shortcut glyphs in hand-written markup are Mac-style (⌘, ⌥, ⇧); elsewhere
 * they read Ctrl+…, Alt+…, Shift+…. A run of modifiers may come in any order
 * and spaced ("⇧ ⌘ E", "⌥⌘T"): it always reads "Ctrl+Shift+E", "Ctrl+Alt+T".
 */
export function platformKeys(s) {
  if (isMac || !/[⌘⌃⌥⇧⌫]/.test(s)) return s;
  return s
    .replace(/[⌘⌃⌥⇧](?:\s?[⌘⌃⌥⇧])*\s?/g, (run) =>
      MODIFIERS.filter(([glyph]) => glyph.test(run))
        .map(([, name]) => `${name}+`)
        .join("")
    )
    .replace(/⌫/g, "Backspace");
}

function translateValue(value) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  const word = (part) => (typeof dict?.[part] === "string" ? dict[part] : part);
  if (dict && typeof dict[trimmed] === "string") {
    return platformKeys(value.replace(trimmed, dict[trimmed]));
  }
  if (trimmed.includes(" · ")) {
    return trimmed
      .split(" · ")
      .map((part) => platformKeys(word(part)))
      .join(" · ");
  }
  return value;
}

/** Translate text nodes and UI attributes of hand-written markup in place. */
export function translateDOM(root = document.body) {
  document.documentElement.lang = lang;
  if (dict && typeof dict[document.title] === "string") document.title = dict[document.title];
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
