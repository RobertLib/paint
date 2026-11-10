#!/usr/bin/env node
/* ==========================================================================
   Landing-page generator.

   Writes the static, crawlable part of the site from scripts/site/:
     /index.html, /cs/index.html          home pages
     /<slug>/index.html, /cs/<slug>/…     one page per task (pages.mjs)
     /404.html, /sitemap.xml
   and refreshes the analytics + modulepreload blocks of /editor/index.html.

   The output is committed, so the site still deploys without a build step —
   run `node scripts/build-site.mjs` after changing copy or settings.
   No dependencies: Node 18+ only.
   ========================================================================== */

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "./site/config.mjs";
import { PAGES, PAGE_BY_ID } from "./site/pages.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONTENT = Object.fromEntries(
  await Promise.all(
    SITE.languages.map(async (l) => [l, (await import(`./site/content/${l}.mjs`)).default])
  )
);
const DEFAULT_LANG = SITE.languages[0];
const TODAY = new Date().toISOString().slice(0, 10);

/* --------------------------------- helpers -------------------------------- */

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

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
const icon = (id, cls = "icon") => `<svg class="${cls}"><use href="#${id}" /></svg>`;

function analytics() {
  if (!SITE.goatcounter) return "";
  return `<script data-goatcounter="https://${SITE.goatcounter}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>`;
}

/* -------------------------------- template -------------------------------- */

function head({ lang, path, page, title, description, jsonld }) {
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
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${absolute(path)}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${absolute(pagePath(DEFAULT_LANG, page))}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${esc(SITE.name)}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${absolute(path)}" />
    <meta property="og:image" content="${SITE.base}og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="${locale}" />
    ${otherLocales}
    <meta name="twitter:card" content="summary_large_image" />

    <link rel="icon" type="image/svg+xml" href="${root}favicon.svg" />
    <link rel="icon" type="image/x-icon" href="${root}favicon.ico" />
    <link rel="apple-touch-icon" sizes="180x180" href="${root}apple-touch-icon.png" />
    <link rel="manifest" href="${root}manifest.json" />
    <meta name="theme-color" content="#0e0f14" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#f4f5f9" media="(prefers-color-scheme: light)" />

    <script>
      // the editor's theme choice applies here too; otherwise follow the system
      try {
        var t = JSON.parse(localStorage.getItem("paint-studio:prefs:v2") || "null");
        document.documentElement.dataset.theme =
          (t && t.theme) || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      } catch (e) {
        document.documentElement.dataset.theme = "dark";
      }
    </script>
    <link rel="stylesheet" href="${root}css/tokens.css" />
    <link rel="stylesheet" href="${root}css/site.css" />
    <link rel="modulepreload" href="${root}js/site.js" />
    <link rel="modulepreload" href="${root}js/store.js" />
    <script type="application/ld+json">${JSON.stringify(jsonld)}</script>
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
      <nav class="site-nav" aria-label="${esc(ui.navTools)}">
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
  if (page && page.needsFile === false) {
    return `
      <div class="drop drop-blank">
        <a class="btn btn-primary btn-lg" href="${blankHref}">${icon("i-brush")}<span>${esc(ui.blankButton)}</span></a>
        <p class="drop-hint">${esc(ui.dropHint)}</p>
        <label class="btn btn-ghost">${icon("i-image")}<span>${esc(ui.dropButton)}</span>
          <input type="file" accept="image/*,.heic,.heif,.psd" hidden data-file /></label>
      </div>
      <script type="application/json" id="dropConfig">${JSON.stringify({ editor: `${root}editor/`, task: "draw", lang })}</script>`;
  }
  return `
      <div class="drop" data-drop>
        ${icon("i-image", "icon drop-icon")}
        <strong class="drop-title">${esc(ui.dropTitle)}</strong>
        <label class="btn btn-primary btn-lg">${icon("i-folder")}<span>${esc(ui.dropButton)}</span>
          <input type="file" accept="image/*,.heic,.heif,.psd" hidden data-file /></label>
        <p class="drop-hint">${esc(ui.dropHint)}</p>
        ${blank ? `<a class="drop-blank-link" href="${blankHref}">${esc(ui.blankButton)}</a>` : ""}
        <p class="drop-busy" data-busy hidden>${esc(ui.dropBusy)}</p>
      </div>
      <script type="application/json" id="dropConfig">${JSON.stringify({ editor: `${root}editor/`, task, lang })}</script>`;
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
    .map((l) => `<a href="${root}${pagePath(l, page)}" hreflang="${l}" lang="${l}">${l === "cs" ? "Čeština" : "English"}</a>`)
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
        <nav aria-label="${esc(ui.allToolsTitle)}">
          <h2>${esc(ui.allToolsTitle)}</h2>
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

function homePage(lang) {
  const c = CONTENT[lang];
  const ui = c.ui;
  const path = pagePath(lang);
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE.base}#website`,
        name: SITE.name,
        url: absolute(path),
        inLanguage: lang,
      },
      {
        "@type": "WebApplication",
        name: SITE.name,
        url: absolute(path),
        description: plain(c.home.description),
        applicationCategory: "MultimediaApplication",
        applicationSubCategory: "Image editor",
        operatingSystem: "Any (modern web browser)",
        browserRequirements: "Requires JavaScript and HTML5 canvas",
        inLanguage: SITE.languages,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        image: `${SITE.base}og-image.png`,
        screenshot: `${SITE.base}og-image.png`,
        license: "https://opensource.org/licenses/MIT",
        codeRepository: SITE.github,
        author: { "@type": "Person", name: SITE.author.name, url: SITE.author.url },
      },
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
    head({ lang, path, page: null, title: c.home.title, description: c.home.description, jsonld }) +
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
  const jsonld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: ui.homeLink, item: absolute(pagePath(lang)) },
          { "@type": "ListItem", position: 2, name: plain(p.h1), item: absolute(path) },
        ],
      },
      {
        "@type": "WebApplication",
        name: `${plain(p.card)} — ${SITE.name}`,
        url: absolute(path),
        description: plain(p.description),
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any (modern web browser)",
        inLanguage: lang,
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        isPartOf: { "@id": `${SITE.base}#website` },
      },
    ],
  };
  const body = `
  <body class="site">
    ${sprite([...ICONS_ALWAYS, page.icon, ...page.related.map((id) => PAGE_BY_ID[id].icon)])}
    ${header({ lang, path, page, ui })}
    <main>
      <section class="hero">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="${rootFrom(path)}${pagePath(lang)}">${esc(ui.homeLink)}</a><span aria-hidden="true">›</span><span>${esc(p.card)}</span></nav>
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
    head({ lang, path, page, title, description: p.description, jsonld }) +
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>404 · ${esc(SITE.name)}</title>
    <meta name="robots" content="noindex" />
    <link rel="icon" type="image/svg+xml" href="${SITE.base}favicon.svg" />
    <link rel="stylesheet" href="${SITE.base}css/tokens.css" />
    <link rel="stylesheet" href="${SITE.base}css/site.css" />
  </head>
  <body class="site">
    <main>${blocks}</main>
  </body>
</html>
`;
}

function sitemap() {
  const entries = [];
  const add = (page) => {
    for (const l of SITE.languages) {
      const alts = SITE.languages
        .map((a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${absolute(pagePath(a, page))}" />`)
        .concat(`<xhtml:link rel="alternate" hreflang="x-default" href="${absolute(pagePath(DEFAULT_LANG, page))}" />`)
        .join("\n    ");
      entries.push(`  <url>
    <loc>${absolute(pagePath(l, page))}</loc>
    <lastmod>${TODAY}</lastmod>
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

/** Keep the editor's modulepreload list and analytics snippet in sync. */
function patchEditor() {
  const modules = readdirSync(join(ROOT, "js"))
    .filter((f) => f.endsWith(".js") && !["site.js", "heic.js", "psd.js"].includes(f))
    .sort()
    .map((f) => `    <link rel="modulepreload" href="../js/${f}" />`);
  modules.push(`    <link rel="modulepreload" href="../js/lang/cs.js" />`);
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

let count = 0;
for (const lang of SITE.languages) {
  write(pagePath(lang), homePage(lang));
  count++;
  for (const page of PAGES) {
    if (!CONTENT[lang].pages[page.id]) throw new Error(`Missing ${lang} copy for ${page.id}`);
    write(pagePath(lang, page), toolPage(lang, page));
    count++;
  }
}
writeFileSync(join(ROOT, "404.html"), notFoundPage());
writeFileSync(join(ROOT, "sitemap.xml"), sitemap());
writeFileSync(join(ROOT, `${SITE.indexNowKey}.txt`), SITE.indexNowKey);
patchEditor();
console.log(`Wrote ${count} pages, 404.html, sitemap.xml and refreshed editor/index.html`);
