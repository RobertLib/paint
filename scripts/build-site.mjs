#!/usr/bin/env node
/* ==========================================================================
   Landing-page generator.

   Writes the static, crawlable part of the site from scripts/site/:
     /index.html, /cs/index.html          home pages
     /<slug>/index.html, /cs/<slug>/…     one page per task (pages.mjs)
     /404.html, /sitemap.xml
     scripts/site/lastmod.json            per-page <lastmod> (see lastmod.mjs)
   refreshes the analytics + modulepreload blocks of /editor/index.html and
   keeps the "id" of /manifest.json in step with SITE.base.

   Every page it writes carries GENERATOR_MARK. A page folder whose
   index.html has the mark but which this build no longer produces (a renamed
   or dropped slug or language) is removed, so it can't stay deployed with a
   self-canonical outside the sitemap. Nothing without the mark is touched.

   The output is committed, so the site still deploys without a build step —
   run `node scripts/build-site.mjs` after changing copy or settings.
   No dependencies: Node 18+ only.
   ========================================================================== */

import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "./site/config.mjs";
import { readLastmod, writeLastmod } from "./site/lastmod.mjs";
import { PAGES, PAGE_BY_ID } from "./site/pages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = Object.fromEntries(
  await Promise.all(
    SITE.languages.map(async (l) => [l, (await import(`./site/content/${l}.mjs`)).default])
  )
);
const DEFAULT_LANG = SITE.languages[0];
const TODAY = new Date().toISOString().slice(0, 10);

/** Marks a page as this generator's output; only marked pages are ever deleted. */
const GENERATOR_MARK = `<meta name="generator" content="paint-studio-site" />`;

/* --------------------------------- helpers -------------------------------- */

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** JSON that is safe inside a <script> element: no "</script>" or "<!--" can form. */
const json = (value) =>
  JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/** Copy may carry a few inline tags; everything else is escaped. */
const rich = (s) =>
  esc(s).replace(/&lt;(\/?)(strong|em|kbd|code)&gt;/g, "<$1$2>");

/** Plain text for meta tags and JSON-LD. */
const plain = (s) => String(s).replace(/<\/?(strong|em|kbd|code)>/g, "");

/** Path of a page relative to the site root, e.g. "cs/oriznout-obrazek/". */
function pagePath(lang, page) {
  const prefix = lang === DEFAULT_LANG ? "" : `${lang}/`;
  return page ? `${prefix}${page.slug[lang]}/` : prefix;
}

const absolute = (path) => SITE.base + path;
const depthOf = (path) => path.split("/").filter(Boolean).length;
const rootFrom = (path) => "../".repeat(depthOf(path)) || "./";

/** Icons used on the landing pages, lifted from the editor's sprite. */
const EDITOR_HTML = readFileSync(join(ROOT, "editor/index.html"), "utf8");
function sprite(ids) {
  const out = [];
  for (const id of new Set(ids)) {
    const m = EDITOR_HTML.match(new RegExp(`<symbol id="${id}"[\\s\\S]*?</symbol>`));
    if (m) out.push(m[0]);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true"><defs>${out.join("")}</defs></svg>`;
}
const icon = (id, cls = "icon") =>
  `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${id}" /></svg>`;

/** Files the pickers offer; the editor's open path handles all of them. */
const ACCEPT = "image/*,.heic,.heif,.psd,.paint";

/* the theme picked in the editor (js/state.js saves it as `themeChoice`, and
   only once the user has chosen) applies here too, browser chrome included;
   otherwise follow the system. Runs after the theme-color metas and before
   the stylesheets, so the page never flashes the wrong theme. */
const THEME_SCRIPT = `<script>
      (function () {
        var choice = null;
        try {
          var p = JSON.parse(localStorage.getItem("paint-studio:prefs:v2") || "null");
          if (p && (p.themeChoice === "light" || p.themeChoice === "dark")) choice = p.themeChoice;
        } catch (e) {}
        var light = window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches;
        document.documentElement.dataset.theme = choice || (light ? "light" : "dark");
        if (choice) {
          var metas = document.querySelectorAll('meta[name="theme-color"]');
          for (var i = 0; i < metas.length; i++) metas[i].content = choice === "light" ? "#f4f5f9" : "#0e0f14";
        }
      })();
    </script>`;

const THEME_COLOR = `<meta name="theme-color" content="#0e0f14" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#f4f5f9" media="(prefers-color-scheme: light)" />`;

/* GoatCounter's versioned script, which never changes once published
   (https://www.goatcounter.com/help/countjs-versions), pinned with its
   integrity hash: a changed file is refused instead of run. Update both
   together, from that page. */
const GOATCOUNTER_SRC = "https://gc.zgo.at/count.v5.js";
const GOATCOUNTER_INTEGRITY = "sha384-atnOLvQb9t+jTSipvd75X2yginT4PjVbqDdlJAmxMm+wYElFmeR6EmLP5bYeoRVQ";

function analytics() {
  if (!SITE.goatcounter) return "";
  return `<script data-goatcounter="https://${SITE.goatcounter}.goatcounter.com/count" async src="${GOATCOUNTER_SRC}" integrity="${GOATCOUNTER_INTEGRITY}" crossorigin="anonymous"></script>`;
}

/* -------------------------------- template -------------------------------- */

function head({ lang, path, page, title, description, jsonld, ui }) {
  const alternates = SITE.languages
    .map((l) => `<link rel="alternate" hreflang="${l}" href="${absolute(pagePath(l, page))}" />`)
    .join("\n    ");
  const root = rootFrom(path);
  const locale = SITE.locales[lang];
  const otherLocales = SITE.languages
    .filter((l) => l !== lang)
    .map((l) => `<meta property="og:locale:alternate" content="${SITE.locales[l]}" />`)
    .join("\n    ");
  return `<!DOCTYPE html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    ${GENERATOR_MARK}
    <title>${esc(plain(title))}</title>
    <meta name="description" content="${esc(plain(description))}" />
    <link rel="canonical" href="${absolute(path)}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${absolute(pagePath(DEFAULT_LANG, page))}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(SITE.name)}" />
    <meta property="og:title" content="${esc(plain(title))}" />
    <meta property="og:description" content="${esc(plain(description))}" />
    <meta property="og:url" content="${absolute(path)}" />
    <meta property="og:image" content="${SITE.base}og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(ui.ogImageAlt)}" />
    <meta property="og:locale" content="${locale}" />
    ${otherLocales}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image:alt" content="${esc(ui.ogImageAlt)}" />

    <link rel="icon" type="image/svg+xml" href="${root}favicon.svg" />
    <link rel="icon" type="image/x-icon" href="${root}favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="${root}apple-touch-icon.png" />
    <link rel="manifest" href="${root}manifest.json" />
    ${THEME_COLOR}

    ${THEME_SCRIPT}
    <link rel="stylesheet" href="${root}css/tokens.css" />
    <link rel="stylesheet" href="${root}css/site.css" />
    <link rel="modulepreload" href="${root}js/site.js" />
    <link rel="modulepreload" href="${root}js/store.js" />
    <script type="application/ld+json">${json(jsonld)}</script>
    ${analytics()}
  </head>`;
}

function header({ lang, path, page, ui }) {
  const root = rootFrom(path);
  const editor = `${root}editor/?${new URLSearchParams({ lang, ...(page ? { task: page.task } : {}) })}`;
  const langLinks = SITE.languages
    .map((l) =>
      l === lang
        ? `<span class="lang is-current" aria-current="true">${l.toUpperCase()}</span>`
        : `<a class="lang" href="${root}${pagePath(l, page)}" hreflang="${l}" lang="${l}">${l.toUpperCase()}</a>`
    )
    .join("");
  return `
    <header class="site-head">
      <a class="site-brand" href="${root}${pagePath(lang)}">
        <span class="brand-mark" aria-hidden="true">${icon("i-brush")}</span>
        <span translate="no">Paint<em>Studio</em></span>
      </a>
      <nav class="site-nav" aria-label="${esc(ui.navMain)}">
        <a href="${root}${pagePath(lang)}#tools">${esc(ui.navTools)}</a>
        <span class="langs" role="group" aria-label="${esc(ui.languageLabel)}">${langLinks}</span>
        <a class="btn btn-primary" href="${editor}">${icon("i-brush")}<span>${esc(ui.navEditor)}</span></a>
      </nav>
    </header>`;
}

function dropzone({ lang, path, page, ui }) {
  const root = rootFrom(path);
  const task = page?.task || "";
  const blank = !page || page.needsFile === false;
  const blankHref = `${root}editor/?${new URLSearchParams({ lang, task: "paint" })}`;
  // the input stays focusable (visually hidden, not [hidden]) so the picker
  // works from the keyboard; the label shows the focus ring (site.css)
  const picker = (cls, iconId) =>
    `<label class="btn ${cls}">${icon(iconId)}<span>${esc(ui.dropButton)}</span>
          <input type="file" accept="${ACCEPT}" class="sr-only" data-file /></label>`;
  // shown by js/site.js when a dropped or picked file can't be opened
  const error = `<p class="drop-error" data-error role="alert" hidden></p>`;
  const config = (task) =>
    `<script type="application/json" id="dropConfig">${json({
      editor: `${root}editor/`,
      task,
      lang,
      notOpenable: ui.dropUnsupported,
    })}</script>`;
  if (page && page.needsFile === false) {
    return `
      <div class="drop drop-blank">
        <a class="btn btn-primary btn-lg" href="${blankHref}">${icon("i-brush")}<span>${esc(ui.blankButton)}</span></a>
        <p class="drop-hint">${esc(ui.dropHint)}</p>
        ${picker("btn-ghost", "i-image")}
        ${error}
      </div>
      ${config("draw")}`;
  }
  return `
      <div class="drop" data-drop>
        ${icon("i-image", "icon drop-icon")}
        <strong class="drop-title">${esc(ui.dropTitle)}</strong>
        ${picker("btn-primary btn-lg", "i-folder")}
        <p class="drop-hint">${esc(ui.dropHint)}</p>
        ${blank ? `<a class="drop-blank-link" href="${blankHref}">${esc(ui.blankButton)}</a>` : ""}
        <p class="drop-busy" data-busy role="status" aria-live="polite" hidden>${esc(ui.dropBusy)}</p>
        ${error}
      </div>
      ${config(task)}`;
}

function trust(ui) {
  return `<ul class="trust">${ui.trust
    .map((t) => `<li>${icon("i-check")}<span>${esc(t)}</span></li>`)
    .join("")}</ul>`;
}

function toolCards({ lang, path, ids, ui }) {
  const root = rootFrom(path);
  return `<ul class="tool-grid">${ids
    .map((id) => {
      const page = PAGE_BY_ID[id];
      const c = CONTENT[lang].pages[id];
      return `<li><a class="tool-card" href="${root}${pagePath(lang, page)}">
          <span class="tool-icon">${icon(page.icon)}</span>
          <span class="tool-text"><strong>${esc(c.card)}</strong><span>${esc(c.cardText)}</span></span>
        </a></li>`;
    })
    .join("")}</ul>`;
}

function faq(items, ui) {
  return `
      <section class="block faq">
        <h2>${esc(ui.faqTitle)}</h2>
        ${items.map((f) => `<h3>${rich(f.q)}</h3>\n        <p>${rich(f.a)}</p>`).join("\n        ")}
      </section>`;
}

function footer({ lang, path, page, ui }) {
  const root = rootFrom(path);
  const c = CONTENT[lang];
  const links = PAGES.map(
    (p) => `<li><a href="${root}${pagePath(lang, p)}">${esc(c.pages[p.id].card)}</a></li>`
  ).join("");
  const langLinks = SITE.languages
    .map((l) => `<a href="${root}${pagePath(l, page)}" hreflang="${l}" lang="${l}">${esc(SITE.languageNames[l])}</a>`)
    .join(" · ");
  return `
    <footer class="site-foot">
      <div class="foot-inner">
        <div class="foot-about">
          <a class="site-brand" href="${root}${pagePath(lang)}">
            <span class="brand-mark" aria-hidden="true">${icon("i-brush")}</span>
            <span translate="no">Paint<em>Studio</em></span>
          </a>
          <p>${esc(ui.footerText)}</p>
          <p><a href="${SITE.github}" rel="noopener">${esc(ui.footerSource)}</a> · ${langLinks}</p>
        </div>
        <nav aria-labelledby="foot-tools">
          <h2 id="foot-tools">${esc(ui.allToolsTitle)}</h2>
          <ul class="foot-links">${links}</ul>
        </nav>
      </div>
    </footer>
    <script type="module" src="${root}js/site.js"></script>
  </body>
</html>
`;
}

/* ---------------------------------- pages --------------------------------- */

const ICONS_ALWAYS = ["i-brush", "i-image", "i-folder", "i-check"];

/* ------------------------------ structured data --------------------------- */
/* One WebSite and one WebApplication per language, identified by the home page
   URL of that language; every page repeats both nodes verbatim (so its graph is
   self-contained) and describes itself as a WebPage about the app. */

const ids = (lang) => {
  const home = absolute(pagePath(lang));
  return { home, website: `${home}#website`, app: `${home}#app` };
};

function websiteNode(lang) {
  const { home, website } = ids(lang);
  return { "@type": "WebSite", "@id": website, name: SITE.name, url: home, inLanguage: lang };
}

function appNode(lang) {
  const { home, app } = ids(lang);
  return {
    "@type": "WebApplication",
    "@id": app,
    name: SITE.name,
    url: home,
    description: plain(CONTENT[lang].home.description),
    applicationCategory: "MultimediaApplication",
    applicationSubCategory: "Image editor",
    operatingSystem: "Any (modern web browser)",
    browserRequirements: "Requires JavaScript and HTML5 canvas",
    inLanguage: SITE.languages,
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    image: `${SITE.base}og-image.png`,
    screenshot: `${SITE.base}docs/screenshot.png`,
    license: "https://opensource.org/licenses/MIT",
    codeRepository: SITE.github,
    author: { "@type": "Person", name: SITE.author.name, url: SITE.author.url },
  };
}

function webPageNode({ lang, path, title, description, breadcrumb }) {
  const url = absolute(path);
  return {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: plain(title),
    description: plain(description),
    inLanguage: lang,
    isPartOf: { "@id": ids(lang).website },
    about: { "@id": ids(lang).app },
    primaryImageOfPage: { "@type": "ImageObject", url: `${SITE.base}og-image.png`, width: 1200, height: 630 },
    ...(breadcrumb ? { breadcrumb: { "@id": breadcrumb } } : {}),
  };
}

function homePage(lang) {
  const c = CONTENT[lang];
  const ui = c.ui;
  const path = pagePath(lang);
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(lang),
      appNode(lang),
      webPageNode({ lang, path, title: c.home.title, description: c.home.description }),
    ],
  };
  const body = `
  <body class="site">
    ${sprite([...ICONS_ALWAYS, ...PAGES.map((p) => p.icon)])}
    ${header({ lang, path, page: null, ui })}
    <main>
      <section class="hero">
        <h1>${rich(c.home.h1)}</h1>
        <p class="lead">${rich(c.home.lead)}</p>
        ${dropzone({ lang, path, page: null, ui })}
        ${trust(ui)}
      </section>

      <section class="block" id="tools">
        <h2>${esc(ui.allToolsTitle)}</h2>
        ${toolCards({ lang, path, ids: PAGES.map((p) => p.id), ui })}
      </section>

      <section class="block features">
        ${c.home.features.map((f) => `<article><h2>${rich(f.h2)}</h2><p>${rich(f.p)}</p></article>`).join("\n        ")}
      </section>
      ${faq(c.home.faq, ui)}
    </main>`;
  return (
    head({ lang, path, page: null, title: c.home.title, description: c.home.description, jsonld, ui }) +
    body +
    footer({ lang, path, page: null, ui })
  );
}

function toolPage(lang, page) {
  const c = CONTENT[lang];
  const ui = c.ui;
  const p = c.pages[page.id];
  const path = pagePath(lang, page);
  const title = `${p.title} | ${SITE.name}`;
  const breadcrumb = `${absolute(path)}#breadcrumb`;
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      websiteNode(lang),
      appNode(lang),
      webPageNode({ lang, path, title, description: p.description, breadcrumb }),
      {
        "@type": "BreadcrumbList",
        "@id": breadcrumb,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: ui.homeLink, item: absolute(pagePath(lang)) },
          { "@type": "ListItem", position: 2, name: plain(p.card), item: absolute(path) },
        ],
      },
    ],
  };
  const body = `
  <body class="site">
    ${sprite([...ICONS_ALWAYS, page.icon, ...page.related.map((id) => PAGE_BY_ID[id].icon)])}
    ${header({ lang, path, page, ui })}
    <main>
      <section class="hero">
        <nav class="crumbs" aria-label="${esc(ui.breadcrumbLabel)}"><a href="${rootFrom(path)}${pagePath(lang)}">${esc(ui.homeLink)}</a><span aria-hidden="true">›</span><span aria-current="page">${esc(p.card)}</span></nav>
        <h1>${rich(p.h1)}</h1>
        <p class="lead">${rich(p.lead)}</p>
        ${dropzone({ lang, path, page, ui })}
        ${trust(ui)}
      </section>

      <section class="block steps">
        <h2>${esc(ui.stepsTitle)}</h2>
        <ol>${p.steps.map((s) => `<li>${rich(s)}</li>`).join("")}</ol>
      </section>

      <section class="block prose">
        ${p.sections.map((s) => `<h2>${rich(s.h2)}</h2>\n        <p>${rich(s.p)}</p>`).join("\n        ")}
      </section>
      ${faq(p.faq, ui)}

      <section class="block">
        <h2>${esc(ui.relatedTitle)}</h2>
        ${toolCards({ lang, path, ids: page.related, ui })}
      </section>
    </main>`;
  return (
    head({ lang, path, page, title, description: p.description, jsonld, ui }) +
    body +
    footer({ lang, path, page, ui })
  );
}

function notFoundPage() {
  // served for any missing URL — absolute links, since the depth is unknown
  const lang = DEFAULT_LANG;
  const blocks = SITE.languages
    .map((l) => {
      const ui = CONTENT[l].ui;
      return `<section class="hero" lang="${l}">
        <h1>${esc(ui.notFoundTitle)}</h1>
        <p class="lead">${esc(ui.notFoundText)}</p>
        <p><a class="btn btn-primary btn-lg" href="${absolute(pagePath(l))}">${esc(ui.notFoundBack)}</a></p>
      </section>`;
    })
    .join("\n");
  return `<!DOCTYPE html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>404 · ${esc(SITE.name)}</title>
    <meta name="robots" content="noindex" />
    <link rel="icon" type="image/svg+xml" href="${SITE.base}favicon.svg" />
    ${THEME_COLOR}
    ${THEME_SCRIPT}
    <link rel="stylesheet" href="${SITE.base}css/tokens.css" />
    <link rel="stylesheet" href="${SITE.base}css/site.css" />
  </head>
  <body class="site">
    <main>${blocks}</main>
  </body>
</html>
`;
}

/* ------------------------------- lastmod ---------------------------------- */

/** Fingerprint of what a reader (or a search engine) sees as the page's content. */
function contentHash(html) {
  const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] || "";
  const description = html.match(/<meta name="description"[^>]*>/)?.[0] || "";
  const main = html.match(/<main>[\s\S]*<\/main>/)?.[0] || html;
  return createHash("sha256").update(`${title}\n${description}\n${main}`).digest("hex").slice(0, 16);
}

/** URL → {hash, date}: the date only moves when the page's content changes. */
function updateLastmod(hashes) {
  const old = readLastmod();
  const next = {};
  for (const [url, hash] of hashes) {
    const prev = old[url];
    next[url] =
      prev && prev.hash === hash
        ? prev
        : { hash, date: TODAY, ...(prev?.submitted ? { submitted: prev.submitted } : {}) };
  }
  return next;
}

function sitemap(lastmod) {
  const entries = [];
  const add = (page) => {
    for (const l of SITE.languages) {
      const loc = absolute(pagePath(l, page));
      const alts = SITE.languages
        .map((a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${absolute(pagePath(a, page))}" />`)
        .concat(`<xhtml:link rel="alternate" hreflang="x-default" href="${absolute(pagePath(DEFAULT_LANG, page))}" />`)
        .join("\n    ");
      entries.push(`  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod[loc]?.date || TODAY}</lastmod>
    ${alts}
  </url>`);
    }
  };
  add(null);
  for (const page of PAGES) add(page);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;
}

/* --------------------------- editor/index.html ---------------------------- */

/**
 * The modules the editor loads as it starts: js/main.js and everything it
 * imports statically, transitively — paths relative to js/, those in js/
 * first, then the ones in its subfolders, each group sorted. Modules loaded
 * on demand with import() (psd.js, heic.js) are not followed: preloading
 * them would download them on every visit.
 */
function editorModules() {
  const JS = join(ROOT, "js");
  // `import … from "./x.js"`, `import "./x.js"` and `export … from "./x.js"`
  // at the start of a line; never `import(` or `import.meta`
  const STATIC =
    /^[ \t]*(?:import[ \t]*(?:[\w$*{},\s]*?\bfrom[ \t]*)?|export[ \t]*(?:\*(?:[ \t]+as[ \t]+[\w$]+)?|\{[^}]*\})[ \t]*from[ \t]*)["'](\.{1,2}\/[^"']+)["']/gm;
  const seen = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const [, spec] of code.matchAll(STATIC)) visit(join(dirname(file), spec));
  };
  visit(join(JS, "main.js"));
  return [...seen]
    .map((file) => relative(JS, file).split("\\").join("/"))
    .sort((a, b) => a.split("/").length - b.split("/").length || (a < b ? -1 : a > b ? 1 : 0));
}

/** Keep the editor's modulepreload list and analytics snippet in sync. */
function patchEditor() {
  const modules = editorModules().map((f) => `    <link rel="modulepreload" href="../js/${f}" />`);
  let html = EDITOR_HTML.replace(
    /<!-- modulepreload:start -->[\s\S]*?<!-- modulepreload:end -->/,
    `<!-- modulepreload:start -->\n${modules.join("\n")}\n    <!-- modulepreload:end -->`
  ).replace(
    /<!-- analytics:start -->[\s\S]*?<!-- analytics:end -->/,
    `<!-- analytics:start -->${analytics() ? `\n    ${analytics()}\n    ` : ""}<!-- analytics:end -->`
  );
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${SITE.base}editor/" />`
  );
  writeFileSync(join(ROOT, "editor/index.html"), html);
}

/* ---------------------------------- write --------------------------------- */

function write(path, html) {
  const file = join(ROOT, path, path.endsWith(".html") || path.endsWith(".xml") ? "" : "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  return file;
}

/* ------------------------------- stale pages ------------------------------ */

/** Never page folders, whatever they contain (dot-folders are skipped too). */
const NOT_PAGES = new Set(["editor", "js", "css", "docs", "scripts", "node_modules"]);

/**
 * Remove page folders an earlier build wrote that this build no longer
 * produces (`produced` holds paths like "cs/oriznout-obrazek/"). Only
 * /<a>/ and /<a>/<b>/ are looked at, only an index.html carrying
 * GENERATOR_MARK is deleted, and its folder only goes once nothing else is
 * left in it. Returns the removed paths.
 */
function removeStalePages(produced) {
  const removed = [];
  const isDir = (p) => {
    try {
      return lstatSync(p).isDirectory(); // a symlink is never followed
    } catch {
      return false;
    }
  };
  const subdirs = (dir) =>
    readdirSync(dir)
      .filter((name) => !name.startsWith(".") && isDir(join(dir, name)))
      .sort();
  const prune = (dir) => {
    const path = `${relative(ROOT, dir).split("\\").join("/")}/`;
    if (produced.has(path)) return;
    const file = join(dir, "index.html");
    if (!existsSync(file) || !lstatSync(file).isFile()) return;
    if (!readFileSync(file, "utf8").includes(GENERATOR_MARK)) return;
    unlinkSync(file);
    removed.push(path);
    const rest = readdirSync(dir);
    if (rest.every((name) => name === ".DS_Store")) {
      for (const name of rest) unlinkSync(join(dir, name));
      rmdirSync(dir);
    }
  };
  for (const top of subdirs(ROOT)) {
    if (NOT_PAGES.has(top)) continue;
    const dir = join(ROOT, top);
    for (const sub of subdirs(dir)) prune(join(dir, sub));
    prune(dir);
  }
  return removed;
}

/* --------------------------------- manifest -------------------------------- */

/**
 * The manifest "id" resolves against the origin of start_url, not against
 * the manifest's own URL, so "./" would claim the whole github.io account.
 * It has to be the site's path ("/paint/"); keep it in step with SITE.base.
 * Only that one value is rewritten, so the file keeps its formatting.
 */
function syncManifestId() {
  const file = join(ROOT, "manifest.json");
  const text = readFileSync(file, "utf8");
  const id = new URL(SITE.base).pathname;
  if (JSON.parse(text).id === id) return false;
  const next = text.replace(/("id"\s*:\s*)"(?:[^"\\]|\\.)*"/, (_, key) => `${key}${JSON.stringify(id)}`);
  if (JSON.parse(next).id !== id) throw new Error(`Set "id": "${id}" in manifest.json by hand`);
  writeFileSync(file, next);
  return true;
}

for (const lang of SITE.languages) {
  for (const key of ["ogImageAlt", "navMain", "breadcrumbLabel", "dropUnsupported"]) {
    if (!CONTENT[lang].ui[key]) throw new Error(`Missing ${lang} ui.${key}`);
  }
  if (!SITE.languageNames?.[lang]) throw new Error(`Missing SITE.languageNames.${lang}`);
}

let count = 0;
const hashes = new Map(); // absolute URL → content hash, in sitemap order
const produced = new Set(); // page paths written by this build
const emit = (path, html) => {
  if (produced.has(path)) throw new Error(`Two pages share the path /${path}`);
  produced.add(path);
  write(path, html);
  hashes.set(absolute(path), contentHash(html));
  count++;
};
for (const lang of SITE.languages) {
  emit(pagePath(lang), homePage(lang));
  for (const page of PAGES) {
    if (!CONTENT[lang].pages[page.id]) throw new Error(`Missing ${lang} copy for ${page.id}`);
    emit(pagePath(lang, page), toolPage(lang, page));
  }
}
const lastmod = updateLastmod(hashes);
writeFileSync(join(ROOT, "404.html"), notFoundPage());
writeFileSync(join(ROOT, "sitemap.xml"), sitemap(lastmod));
// keep the file in sitemap order so diffs stay readable
const ordered = Object.fromEntries(
  [null, ...PAGES].flatMap((page) =>
    SITE.languages.map((l) => {
      const url = absolute(pagePath(l, page));
      return [url, lastmod[url]];
    })
  )
);
writeLastmod(ordered);
writeFileSync(join(ROOT, `${SITE.indexNowKey}.txt`), SITE.indexNowKey);
patchEditor();
const manifestUpdated = syncManifestId();
const stale = removeStalePages(produced);
const changed = Object.values(ordered).filter((e) => e.date === TODAY).length;
console.log(
  `Wrote ${count} pages (${changed} dated ${TODAY}), 404.html, sitemap.xml, lastmod.json and refreshed editor/index.html`
);
if (manifestUpdated) console.log(`Set the manifest.json id to ${new URL(SITE.base).pathname}`);
for (const path of stale) console.log(`Removed the stale page /${path}`);
