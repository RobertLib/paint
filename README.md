# Paint Studio

A complete image editor and drawing app that runs entirely in the browser — no
build step, no server, no uploads. Open it, drop in a photo, and edit.

**Live:** https://robertlib.github.io/paint/ · editor: https://robertlib.github.io/paint/editor/

The interface is available in English and Czech.

![Paint Studio: a photo with a black-and-white copy revealed through a gradient layer mask](docs/screenshot.png)

## Features

**Layers** — unlimited layers with 17 blend modes, per-layer opacity,
visibility, locking, drag-to-reorder, rename, duplicate, merge down and flatten.
**Layer masks** (reveal all, hide all or from the selection; paint black to
hide and white to reveal; invert, disable, apply, delete).

**Painting** — brush with hardness/opacity/smoothing and pen-pressure support,
pencil, airbrush, eraser, paint bucket with tolerance and edge expansion, and
linear/radial gradients.

**Retouching** — blur, sharpen, smudge, clone stamp, healing brush, spot
healing (fills the painted area from its surroundings with matched texture) and
dodge/burn by tonal range.

**Shapes & type** — line and arrow (Shift snaps the angle), plus rectangle
(with corner radius), ellipse, polygon and star, each as outline, solid or
both. The text tool types directly on the canvas in the final font; every text
becomes a **text layer that stays editable** until its pixels change (painting,
filters, adjustments, the Transform tool, rotating or flipping the image, merge
down, apply mask).

**Selections** — rectangular, elliptical, freehand lasso and magic wand, with
new/add/subtract/intersect modes, feathering and animated marching ants. Every
brush, fill, filter and adjustment respects the active selection.

**Free transform** — scale, rotate and move a layer or a selection with
handles (proportional corners, Alt from the centre, Shift snaps rotation).

**Photo adjustments** — exposure, brightness, contrast, highlights, shadows,
gamma, saturation, vibrance, temperature, tint, hue, clarity, softness, grain
and vignette, previewing live on the active layer. **Levels** (histogram, per
channel, auto) and **Curves** (per channel).

**Filters** — 21 one-click effects, each shown as a live thumbnail of your own
image.

**Files** — opens PNG, JPEG, WebP, GIF, SVG, BMP, AVIF, **HEIC** (natively in
Safari; elsewhere a decoder is fetched once from jsDelivr, pinned by version and
integrity hash) and **PSD** — 8-, 16- and 32-bit RGB or grayscale with layers,
masks and blend modes, including Photoshop's 16/32-bit layer blocks and
ZIP-compressed channels (converted to 8 bits per channel); clipping masks are baked
into the clipped layers and fill opacity is folded into opacity; groups are
flattened, text/shape/smart-object layers come in as pixels, adjustment layers
and layer effects are not applied; PSB, CMYK, Lab, indexed, bitmap and duotone are not supported.
Exports PNG, JPEG, WebP with quality, scale and a live size estimate, and
**layered PSD**. `.paint` project files keep layers, masks and editable text.

**Everything else** — undo/redo history (up to 80 steps within a memory
budget), **autosave** to the browser's own storage with restore on the next
visit (skipped for documents above 192 megapixels summed over all layers),
documents up to 8000 × 8000 px within the browser's canvas limit (about
16.7 MP in iPhone/iPad Safari; larger images are scaled down on open), zoom to
3200% with pan and pinch, dark and light themes that follow the system until
one is chosen, drag-and-drop and clipboard import, offline support and
installable PWA (with "open with" file handling), and a full keyboard shortcut
set (press `?`).

## Running it

It is a static site with no dependencies and no build step:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Any static host works — the project is deployed straight from the repository
root via GitHub Pages.

## Site structure

| Path | What it is |
| --- | --- |
| `/` , `/cs/` | landing pages (English, Czech) with a drop zone that opens the editor |
| `/<task>/`, `/cs/<task>/` | one page per job people search for — crop, resize, PNG to JPG, blur a face… |
| `/editor/` | the editor itself (`noindex`; the landing pages are what search engines rank) |
| `/404.html`, `/sitemap.xml` | generated with the pages |

A landing page hands a dropped file to the editor through IndexedDB (same
origin, nothing is uploaded) and opens `editor/?task=<task>&lang=<lang>&open=1`.
The task (see `js/tasks.js`) selects the right tool and shows a task bar with
the next step — e.g. `?task=crop` brings up the crop frame, `?task=blur` offers
Blur/Pixelate for the selection.

### Regenerating the landing pages

The pages are plain HTML committed to the repository, produced by a
dependency-free Node script from structured copy:

```sh
node scripts/build-site.mjs
```

| File | Contents |
| --- | --- |
| `scripts/site/config.mjs` | base URL, languages, analytics, IndexNow key |
| `scripts/site/pages.mjs` | page ids, slugs per language, task, icon, related pages |
| `scripts/site/content/en.mjs`, `cs.mjs` | all copy (titles, descriptions, steps, sections, FAQ) |
| `scripts/site/lastmod.json` | per-URL content hash and `<lastmod>` date (generated — commit it) |

The generator also writes `sitemap.xml` (with `hreflang` alternates), the
IndexNow key file, keeps the `modulepreload` list and analytics snippet of
`editor/index.html` up to date and sets the `id` in `manifest.json` to the
path of `base` (see below).

Every generated page carries `<meta name="generator" content="paint-studio-site" />`.
When a slug is renamed or a page or language is dropped, the next build deletes
the old folder's `index.html` (and the folder, once it is empty) — but only if
it carries that marker, so nothing else in the repository is ever removed.

A page's `<lastmod>` only moves when its title, description or main content
changes: `lastmod.json` remembers a hash per URL, so rebuilding without copy
changes leaves `sitemap.xml` untouched.

Adding a language takes:

1. `scripts/site/content/<lang>.mjs` with all the copy (start from `en.mjs`),
   and slugs for it in every page of `pages.mjs`;
2. the language in `scripts/site/config.mjs` — `languages`, `locales` and
   `languageNames` (the header switcher, footer links and `hreflang` are
   derived from these);
3. the editor: a dictionary in `js/lang/<lang>.js`, imported in `js/i18n.js`
   and added to its `DICTS` and `LANGS` (and to the browser-language match in
   `detect()`), plus the landing-page path for that language in `SITE_HOME`
   in `js/menus.js` (the "All tools and guides" link);
4. `./<lang>/` in the precache list of `sw.js`.

### Search engines and analytics

- **Analytics** — set `goatcounter` in `scripts/site/config.mjs` to a
  [GoatCounter](https://www.goatcounter.com) site code and rebuild. It is
  cookie-free, so no consent banner is needed. The editor additionally counts
  anonymous events (`event/open-png`, `event/export-jpg`, `event/editor-crop`…);
  no file names or image data are ever sent.
- **IndexNow** (Bing, Seznam, Yandex…) — after a deploy run
  `node scripts/indexnow.mjs`. It sends only the pages whose content changed
  since the last submission (`--all` sends every URL, `--dry-run` previews)
  and records what it sent in `scripts/site/lastmod.json` — commit that.
- **Webmaster tools** — the sitemap is `https://robertlib.github.io/paint/sitemap.xml`;
  submit it by hand in Google Search Console, Bing Webmaster Tools and Seznam
  Webmaster. As a GitHub Pages *project* site the address has no root of its
  own, so crawlers never see `robots.txt` (it is served at `/paint/robots.txt`,
  and robots files only count at `/robots.txt`) and can't discover the sitemap
  from it — manual submission is the only way until the site has its own domain.

### Moving to a custom domain

1. Point the domain at GitHub Pages and add a `CNAME` file with the domain.
2. Change `base` in `scripts/site/config.mjs` and run `node scripts/build-site.mjs`.
   The build also moves the `id` in `manifest.json` to the new path (`"/"` at
   the root of a domain): the manifest `id` resolves against the origin, not
   against the manifest's URL, so on `robertlib.github.io` it has to be
   `"/paint/"` — `"./"` would claim the whole account. Check that it changed.
3. Update the `Sitemap:` line in `robots.txt` — on its own domain the file is
   finally served from the root, where crawlers read it.

GitHub Pages redirects the old `github.io` address to the custom domain.

## Architecture

ES modules, no framework, no bundler.

| File | Responsibility |
| --- | --- |
| `js/main.js` | entry point: boots the editor, opens a handed-over file, task or autosave, registers the service worker |
| `js/i18n.js`, `js/lang/cs.js` | UI language detection and the Czech dictionary |
| `js/state.js` | app state and a small event bus; preferences persistence |
| `js/color.js` | colour conversions (RGB/HSV/HEX) and parsing |
| `js/doc.js` | document model: layers, masks, text layers, selections, compositing, geometry |
| `js/history.js` | undo/redo commands with a memory budget |
| `js/viewport.js` | zoom/pan and document ↔ screen coordinates |
| `js/render.js` | draws the document, checkerboard and canvas overlays |
| `js/tools.js` | every tool plus pointer, wheel and pinch input |
| `js/filters.js` | adjustment pipeline, effects, levels/curves lookup tables |
| `js/tone.js` | Levels and Curves dialogs |
| `js/actions.js` | application commands used by the UI and shortcuts |
| `js/ui.js` | panels, options bar, colour picker, layers, toasts |
| `js/menus.js` | menu bar, dialogs, shortcuts, drag-and-drop |
| `js/tasks.js` | `?task=` handling and the task bar |
| `js/autosave.js`, `js/store.js` | IndexedDB autosave and the landing-page hand-over |
| `js/psd.js` | PSD reader and writer |
| `js/heic.js` | on-demand HEIC decoder |
| `js/track.js` | cookie-free GoatCounter event counting (no file names or image data) |
| `js/site.js` | landing-page script (drop zone → editor) |
| `sw.js` | service worker: network-first with an offline cache |

Strokes are painted into a document-sized floating buffer that is composited
above the active layer and flattened on pointer-up, so semi-transparent brushes
never darken where they overlap and every stroke is a single undo step.
Compositing caches everything below the active layer, which keeps painting fast
on tall layer stacks. A layer mask is a second canvas whose alpha is the
visibility; while a mask is the paint target, strokes are translated from
colour to mask value and the preview only recomputes the area the brush
touched.

Images never leave the device — all editing happens on the local canvas.

## Licence

MIT — see [LICENSE](LICENSE).
