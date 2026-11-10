/* ==========================================================================
   Landing pages — one per job people search for.

   Each page opens the editor with a "task" (see js/tasks.js) so a visitor who
   drops a photo on /crop-image/ lands in the editor with the crop frame up.
   Copy lives in ./content/<lang>.mjs keyed by the page id; this file only holds
   structure: URL slugs per language, the task, the icon and internal links.

   `brief` documents what the editor does for that task. It is not rendered —
   it is the contract the copy is written against.
   ========================================================================== */

export const PAGES = [
  {
    id: "crop-image",
    task: "crop",
    icon: "i-crop",
    slug: { en: "crop-image", cs: "oriznout-obrazek" },
    related: ["resize-image", "rotate-image", "compress-image"],
    brief:
      "Editor opens with the Crop tool active and a crop frame over 84% of the image. Ratio presets: Freeform, 1:1, 4:3, 3:4, 16:9, 9:16, 3:2. Rule-of-thirds guides. Drag edges/corners or move the frame; Enter or the Apply button crops. A task bar offers Apply crop and Export.",
  },
  {
    id: "resize-image",
    task: "resize",
    icon: "i-frame",
    slug: { en: "resize-image", cs: "zmenit-velikost-obrazku" },
    related: ["compress-image", "crop-image", "image-converter"],
    brief:
      "Editor opens the Image size dialog (width/height in pixels, keep aspect ratio checkbox). Canvas size (with 9-point anchor) is in the Image menu. Export dialog can additionally scale 10–400%.",
  },
  {
    id: "rotate-image",
    task: "rotate",
    icon: "i-rotate-cw",
    slug: { en: "rotate-image", cs: "otocit-obrazek" },
    related: ["crop-image", "resize-image", "photo-filters"],
    brief:
      "Task bar with buttons: rotate 90° left, rotate 90° right, flip horizontal, flip vertical, and Free rotate (Transform tool: drag outside the box to rotate by any angle, Shift snaps to 15°, Enter applies). Straightening a tilted horizon = free rotate then crop.",
  },
  {
    id: "compress-image",
    task: "compress",
    icon: "i-download",
    slug: { en: "compress-image", cs: "zmensit-velikost-fotky" },
    related: ["resize-image", "image-converter", "png-to-jpg"],
    brief:
      "Editor opens the Export dialog with JPEG preselected at quality 75. Quality slider 10–100, scale slider 10–400%, live estimate of the resulting file size before download. WebP usually gives smaller files than JPEG. Reducing pixel dimensions (scale) shrinks files the most.",
  },
  {
    id: "image-converter",
    task: "convert",
    icon: "i-swap",
    slug: { en: "image-converter", cs: "prevod-obrazku" },
    related: ["png-to-jpg", "webp-to-jpg", "heic-to-jpg"],
    brief:
      "Opens: PNG, JPEG, WebP, GIF (first frame), SVG, BMP, AVIF (if the browser decodes it), HEIC/HEIF, PSD. Exports: PNG, JPEG, WebP, layered PSD. Editor opens the Export dialog where the format is picked; JPEG has no transparency (filled with white).",
  },
  {
    id: "png-to-jpg",
    task: "to-jpg",
    icon: "i-image",
    slug: { en: "png-to-jpg", cs: "png-na-jpg" },
    related: ["image-converter", "compress-image", "webp-to-jpg"],
    brief:
      "Export dialog opens with JPEG preselected. Transparent areas of a PNG become white in JPEG. Quality slider and live file-size estimate.",
  },
  {
    id: "webp-to-jpg",
    task: "to-jpg",
    icon: "i-image",
    slug: { en: "webp-to-jpg", cs: "webp-na-jpg" },
    related: ["image-converter", "png-to-jpg", "heic-to-jpg"],
    brief:
      "Same as PNG to JPG: Export dialog opens with JPEG preselected. WebP files downloaded from websites often won't open in older apps — converting to JPG fixes that. Can also export to PNG to keep transparency.",
  },
  {
    id: "heic-to-jpg",
    task: "to-jpg",
    icon: "i-image",
    slug: { en: "heic-to-jpg", cs: "heic-na-jpg" },
    related: ["image-converter", "compress-image", "resize-image"],
    brief:
      "HEIC/HEIF are iPhone photos. Safari decodes them natively; in other browsers a HEIC decoder library is downloaded once from a CDN (jsDelivr) on first use and decoding runs locally — the photo itself is never uploaded. Then the Export dialog opens with JPEG preselected. Only the main image is converted (no Live Photo motion, depth maps or bursts).",
  },
  {
    id: "blur-image",
    task: "blur",
    icon: "i-blur",
    slug: { en: "blur-image", cs: "rozmazat-fotku" },
    related: ["photo-filters", "crop-image", "retouch-photo"],
    brief:
      "Editor opens with the Rectangle select tool and a task bar: select the area (faces, licence plates, addresses, screenshots with personal data), then click Blur or Pixelate — strength scales with the size of the selection, so it fully hides the content. Ellipse select, Lasso and Magic wand are available too; Feather softens the edge. Without a selection the whole image is blurred. There is also a Blur brush for painting softness, and Soft blur / Pixelate in the filter gallery.",
  },
  {
    id: "add-text-to-photo",
    task: "text",
    icon: "i-text",
    slug: { en: "add-text-to-photo", cs: "pridat-text-do-fotky" },
    related: ["draw-on-image", "photo-filters", "crop-image"],
    brief:
      "Editor opens with the Text tool. Click on the image and type directly on the canvas, in the final font. Options: font (System sans, Serif, Monospace, Impact, Handwritten, Trebuchet), size 6–400 px, align left/center/right, bold, italic, opacity; colour = primary colour. ⌘/Ctrl+Enter commits. Each text becomes its own text layer that stays editable (click it again with the Text tool) until you paint on it, rotate or flip it. Move tool repositions it. Good for memes, captions, watermarks.",
  },
  {
    id: "black-and-white-photo",
    task: "grayscale",
    icon: "i-image",
    slug: { en: "black-and-white-photo", cs: "cernobila-fotka" },
    related: ["photo-filters", "invert-colors", "brighten-photo"],
    brief:
      "The Grayscale filter is applied immediately after the photo opens (one undo step). Task bar offers alternatives: Noir (high-contrast B&W), Sepia, Undo, and Export. Curves/Levels or Contrast can tune the result. Applying a filter inside a selection keeps colour elsewhere (colour splash effect).",
  },
  {
    id: "invert-colors",
    task: "invert",
    icon: "i-swap",
    slug: { en: "invert-colors", cs: "invertovat-barvy" },
    related: ["black-and-white-photo", "photo-filters", "image-converter"],
    brief:
      "Invert filter is applied immediately (negative). Works inside a selection only if one exists. Transparency is preserved. Useful for scanned film negatives (then fine-tune with Levels), dark-mode screenshots, X-ray look.",
  },
  {
    id: "photo-filters",
    task: "filters",
    icon: "i-sparkles",
    slug: { en: "photo-filters", cs: "filtry-na-fotky" },
    related: ["black-and-white-photo", "brighten-photo", "blur-image"],
    brief:
      "Opens the Filters panel: 21 one-click filters, each previewed as a live thumbnail of your own photo: Grayscale, Noir, Sepia, Invert, Vivid, Fade, Warm, Cool, Vintage, Duotone (uses primary/secondary colours), Posterize, Threshold, Solarize, Soft blur, Sharpen, Emboss, Edge detect, Pencil sketch, Bloom, Pixelate, Vignette. Each is one undo step; they stack; they apply inside a selection only when one exists.",
  },
  {
    id: "brighten-photo",
    task: "adjust",
    icon: "i-sun",
    slug: { en: "brighten-photo", cs: "zesvetlit-fotku" },
    related: ["photo-filters", "black-and-white-photo", "retouch-photo"],
    brief:
      "Opens the Adjust panel: 15 sliders with live preview — Exposure, Brightness, Contrast, Highlights, Shadows, Gamma, Saturation, Vibrance, Temperature, Tint, Hue shift, Clarity, Softness, Grain, Vignette. Task bar has Auto levels, Levels… (histogram, black/gamma/white input points, output range, per RGB channel) and Curves… (drag points on the tone curve, per channel). Quick presets in the Adjust menu: Auto contrast, Warm up, Cool down, Punchy.",
  },
  {
    id: "make-background-transparent",
    task: "transparent",
    icon: "i-wand",
    slug: { en: "make-background-transparent", cs: "pruhledne-pozadi" },
    related: ["image-converter", "crop-image", "add-text-to-photo"],
    brief:
      "Editor opens with the Magic wand. Click the background (Tolerance controls the spread, Shift-click adds, Alt-click subtracts), press Delete or the task-bar button to remove it; checkerboard shows transparency. Eraser and layer masks (non-destructive: hide instead of delete, paint black/white on the mask) refine edges. Trim transparent edges in the Image menu. Export as PNG or WebP — JPEG cannot store transparency. Works best on plain/solid backgrounds (logos, product shots on white, signatures). There is no AI subject detection.",
  },
  {
    id: "color-picker-from-image",
    task: "eyedropper",
    icon: "i-eyedropper",
    slug: { en: "color-picker-from-image", cs: "zjistit-barvu-z-obrazku" },
    related: ["image-converter", "photo-filters", "draw-on-image"],
    brief:
      "Editor opens with the Eyedropper. Click (or drag) anywhere on the image; the task bar shows the HEX and RGB value with a Copy button, and the Color panel shows it too. Sample from all layers or only the active layer. Picked colours are kept in the Recent row. Zoom in (scroll, pinch) to hit single pixels.",
  },
  {
    id: "draw-on-image",
    task: "draw",
    icon: "i-brush",
    slug: { en: "draw-on-image", cs: "kresleni-do-fotky" },
    related: ["add-text-to-photo", "paint-online", "blur-image"],
    brief:
      "Editor opens with the Brush on the photo. Tip: add a new layer to keep drawings separate. Tools: brush (size, opacity, hardness, smoothing, pen pressure), pencil, airbrush, eraser, line, arrow, rectangle (rounded corners), ellipse, polygon, star (outline/solid/both), highlighter-like effect with low opacity + Multiply blend. Good for annotating screenshots, marking things on maps/plans, arrows for tutorials.",
  },
  {
    id: "paint-online",
    task: "paint",
    icon: "i-brush",
    slug: { en: "paint-online", cs: "malovani-online" },
    related: ["draw-on-image", "add-text-to-photo", "photo-filters"],
    needsFile: false,
    brief:
      "No file needed: the button opens a blank white 1600×1000 canvas with the Brush. Brushes with pen pressure (stylus/tablet/Apple Pencil in the browser), pencil, airbrush, eraser, fill bucket, linear/radial gradient, shapes, text, unlimited layers with 16 blend modes, undo, zoom to 3200%, pinch-zoom on touch screens. Work is autosaved in the browser and can be saved as a .paint project or exported as PNG/JPEG/WebP/PSD. Suitable for kids and adults; works on Chromebooks, tablets, phones.",
  },
  {
    id: "open-psd-online",
    task: "psd",
    icon: "i-layers",
    slug: { en: "open-psd-online", cs: "otevrit-psd" },
    related: ["image-converter", "resize-image", "crop-image"],
    brief:
      "Opens Photoshop .psd files (8-bit RGB or grayscale) with their pixel layers, names, opacity, visibility, blend modes and layer masks; groups are flattened into a plain layer list. Text, shape and smart-object layers come in as their rendered pixels; adjustment layers and layer effects are not applied. If layer data can't be read (e.g. ZIP-compressed or 16/32-bit), the flattened composite is opened instead. Can export to PNG/JPEG/WebP or save back to a layered PSD. Not supported: PSB, CMYK, Lab.",
  },
  {
    id: "retouch-photo",
    task: "retouch",
    icon: "i-clone",
    slug: { en: "retouch-photo", cs: "retus-fotky" },
    related: ["brighten-photo", "blur-image", "photo-filters"],
    brief:
      "Editor opens with the Spot healing brush: paint over a blemish, dust spot, small object or wire and it is filled from the surrounding area with matched texture when you release. Healing brush: Alt-click a clean source, paint — copies texture but keeps the colour/brightness of the destination. Clone stamp copies exactly. Dodge/Burn lightens or darkens (range: shadows/midtones/highlights). Blur, Sharpen and Smudge brushes. Works best on small areas; large objects in complex scenes need patience (no AI generative fill).",
  },
];

export const PAGE_BY_ID = Object.fromEntries(PAGES.map((p) => [p.id, p]));
