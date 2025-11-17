# Paint Studio

A complete image editor and drawing app that runs entirely in the browser — no
build step, no server, no uploads. Open it, drop in a photo, and edit.

**Live:** https://robertlib.github.io/paint/

## Features

**Layers** — unlimited layers with 16 blend modes, per-layer opacity,
visibility, locking, drag-to-reorder, rename, duplicate, merge down and flatten.

**Painting** — brush with hardness/opacity/smoothing and pen-pressure support,
pencil, airbrush, eraser, paint bucket with tolerance and edge expansion, and
linear/radial gradients.

**Retouching** — blur, sharpen, smudge and a clone stamp, all as soft round
brushes that read from the live layer.

**Shapes & type** — line, arrow, rectangle (with corner radius), ellipse,
polygon and star, each as outline, solid or both. The text tool edits directly
on the canvas in the final font, size and colour before it is rasterised.

**Selections** — rectangular, elliptical, freehand lasso and magic wand, with
new/add/subtract/intersect modes, feathering and animated marching ants. Every
brush, fill, filter and adjustment respects the active selection.

**Photo adjustments** — exposure, brightness, contrast, highlights, shadows,
gamma, saturation, vibrance, temperature, tint, hue, clarity, softness, grain
and vignette, previewing live on the active layer.

**Filters** — 21 one-click effects (grayscale, noir, sepia, invert, vivid, fade,
warm, cool, vintage, duotone, posterize, threshold, solarize, blur, sharpen,
emboss, edge detect, pencil sketch, bloom, pixelate, vignette), each shown as a
live thumbnail of your own image.

**Geometry** — crop with ratio presets and rule-of-thirds guides, image resize,
canvas resize with anchor, trim transparent edges, rotate and flip.

**Everything else** — undo/redo history, zoom to 3200% with pan and pinch,
transparency checkerboard, dark and light themes, drag-and-drop and clipboard
import, PNG/JPEG/WebP export with scaling and live file-size estimates,
`.paint` project files that keep your layers, offline support, and a full
keyboard shortcut set (press `?`).

## Running it

It is a static site with no dependencies and no build step:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

Any static host works — the project is deployed straight from the repository
root via GitHub Pages.

## Architecture

ES modules, no framework, no bundler.

| File | Responsibility |
| --- | --- |
| `js/state.js` | app state and a small event bus; preferences persistence |
| `js/doc.js` | document model: layers, selections, compositing, geometry |
| `js/history.js` | undo/redo commands with a memory budget |
| `js/viewport.js` | zoom/pan and document ↔ screen coordinates |
| `js/render.js` | draws the document, checkerboard and canvas overlays |
| `js/tools.js` | every tool plus pointer, wheel and pinch input |
| `js/filters.js` | adjustment pipeline and effect implementations |
| `js/actions.js` | application commands used by the UI and shortcuts |
| `js/ui.js` | panels, options bar, colour picker, layers, toasts |
| `js/menus.js` | menu bar, dialogs, shortcuts, drag-and-drop |

Strokes are painted into a document-sized floating buffer that is composited
above the active layer and flattened on pointer-up, so semi-transparent brushes
never darken where they overlap and every stroke is a single undo step.
Compositing caches everything below the active layer, which keeps painting fast
on tall layer stacks.

Images never leave the device — all editing happens on the local canvas.

## Licence

MIT — see [LICENSE](LICENSE).
