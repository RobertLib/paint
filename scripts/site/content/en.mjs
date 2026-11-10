/* English copy for the landing pages. Structure and slugs live in ../pages.mjs. */

export default {
  ui: {
    navEditor: "Open editor",
    navTools: "All tools",
    dropTitle: "Drop an image here",
    dropButton: "Choose image",
    dropHint: "or paste with Ctrl+V · PNG, JPG, WebP, HEIC, PSD…",
    dropBusy: "Opening the editor…",
    blankButton: "Start with a blank canvas",
    trust: ["Nothing is uploaded", "No sign-up", "No watermark"],
    stepsTitle: "How it works",
    faqTitle: "Frequently asked questions",
    relatedTitle: "Related tools",
    allToolsTitle: "All tools",
    footerText:
      "Paint Studio is a free, open-source image editor under the MIT license. It runs entirely in your browser, so your images never leave your device.",
    footerSource: "Source code on GitHub",
    languageLabel: "Language",
    homeLink: "Paint Studio",
    notFoundTitle: "Page not found",
    notFoundText:
      "This page doesn’t exist or has moved. The editor and all the tools are still one click away.",
    notFoundBack: "Back to Paint Studio",
  },

  home: {
    title: "Paint Studio — Free Image Editor in Your Browser",
    description:
      "Edit photos and paint online for free. Layers, brushes, filters, PSD and HEIC support — all in your browser, with no upload, no sign-up and no watermark.",
    h1: "A free image editor that runs in your browser",
    lead:
      "Crop, resize, retouch, convert or paint from scratch — Paint Studio is a full layer-based editor that works in any modern browser. Your images are opened and processed on your own device, so nothing is uploaded and there is no account to create.",
    features: [
      {
        h2: "Layers, blend modes and masks",
        p: "Build images the way you would in a desktop editor. Add as many layers as you need, drag them to reorder, rename, lock or hide them and set opacity per layer. Sixteen blend modes such as Multiply, Screen, Overlay and Soft light composite without touching the pixels below. Layer masks hide parts of a layer non-destructively: paint black to hide, white to reveal, then apply or delete the mask when you are done.",
      },
      {
        h2: "Brushes, shapes and text",
        p: "The Brush has size, opacity, hardness, smoothing and pen pressure, and sits next to the Pencil, Airbrush, Eraser, Fill and a linear or radial Gradient. Line, Arrow, Rectangle with rounded corners, Ellipse, Polygon and Star draw as outline, solid or both. The Text tool types straight onto the canvas in the final font, and every text layer stays editable, so a typo is never a reason to start over.",
      },
      {
        h2: "Retouching tools",
        p: "Remove dust, blemishes and stray wires with Spot healing, which fills each stroke from its surroundings. The Healing brush and Clone stamp copy from a source you pick, Dodge / Burn lightens or darkens shadows, midtones or highlights, and the Blur, Sharpen and Smudge brushes soften, crisp up or push pixels exactly where you paint. There is no AI generative fill; these are manual tools that reward a steady hand.",
      },
      {
        h2: "Adjustments and filters",
        p: "Fifteen sliders in the Adjust panel preview live: exposure, brightness, contrast, highlights, shadows, gamma, saturation, vibrance, temperature, tint, hue shift, clarity, softness, grain and vignette. Levels… and Curves… work per channel, and quick presets like Auto contrast or Punchy fix a flat photo in one click. The Filters panel adds 21 effects, from Grayscale and Vintage to Pencil sketch, each shown as a thumbnail of your own image.",
      },
      {
        h2: "Selections that keep edits in place",
        p: "Rectangle select, Ellipse select, Lasso and Magic wand create selections you can add to, subtract from, intersect, feather or invert. Everything respects the selection: brushes, fills, filters, adjustments and deleting all stop at its edge. That makes it easy to crop to an exact area, blur a single face, brighten only the foreground or make a background transparent without touching the subject.",
      },
      {
        h2: "Crop, resize and transform",
        p: "Crop with ratio presets and rule-of-thirds guides, change the pixel dimensions in Image size…, or extend the canvas in Canvas size… with an anchor that decides where the picture sits. Rotate by 90° or 180°, flip, trim transparent edges automatically, or use the Transform tool to move, scale and rotate a layer by any angle. Documents can be up to 8000 × 8000 pixels.",
      },
      {
        h2: "Opens almost anything, exports what you need",
        p: "Drop in PNG, JPEG, WebP, GIF, SVG, BMP, AVIF, iPhone HEIC photos or Photoshop PSD files with their layers, or paste a screenshot with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>. Export as PNG, JPEG or WebP with a quality slider, a scale slider and a live file-size estimate, save a layered PSD for another editor, or keep a .paint project that preserves every layer for later.",
      },
      {
        h2: "Private, offline and free",
        p: "Paint Studio runs entirely in your browser tab. Images are never uploaded, there is no account, no ads and no watermark, and the code is open source under the MIT license. After the first visit it also works offline and can be installed as an app. Work in progress is autosaved in your browser and offered for restore the next time you open the editor.",
      },
    ],
    faq: [
      {
        q: "Are my images uploaded anywhere?",
        a: "No. Paint Studio has no server that receives your files. Images are decoded and edited inside your own browser tab, and exports are created there too, which makes it suitable for personal photos, ID scans and screenshots with private information. The only file-related download is a one-time HEIC decoder library, fetched in browsers that can’t open iPhone photos natively.",
      },
      {
        q: "Is Paint Studio really free?",
        a: "Yes. There is no trial, no paid tier, no sign-up and no watermark on exported images. The project is open source under the MIT license, so anyone can read the code, run their own copy or contribute on GitHub.",
      },
      {
        q: "Does it work offline?",
        a: "Yes, after your first visit. The editor is a progressive web app: it caches itself in the browser and can be installed to your desktop, dock or home screen. Work in progress is autosaved in the browser’s own storage, and the next time you open Paint Studio it offers to restore it.",
      },
      {
        q: "Can I use it on a phone, tablet or Chromebook?",
        a: "Yes. It runs in any modern browser and supports touch, pinch zoom and stylus input, including pen pressure where the browser reports it. A tablet with a pen is comfortable for drawing; on a phone it is best for quick crops, conversions, filters and adjustments.",
      },
      {
        q: "Which file formats can I open and save?",
        a: "You can open PNG, JPEG, WebP, GIF (first frame only), SVG, BMP, AVIF when your browser decodes it, HEIC/HEIF and 8-bit PSD files, plus .paint projects. You can export PNG, JPEG and WebP, a layered PSD, or a .paint project that keeps layers for later editing.",
      },
      {
        q: "How large can an image be?",
        a: "Documents can be up to 8000 × 8000 pixels, which covers photos from most phones and cameras. Bigger images are scaled down to fit within 8000 px when they are opened, so you can still edit them, just at a slightly lower resolution.",
      },
      {
        q: "Does it have AI features like automatic background removal?",
        a: "No. There is no generative fill and no automatic subject or background detection. Backgrounds are removed with the Magic wand, Eraser and layer masks, blemishes with the healing tools. That works well on plain backgrounds and small spots, and keeps every change predictable and local.",
      },
      {
        q: "Which languages and themes are available?",
        a: "The interface is available in English and Czech, with a dark and a light theme. Keyboard shortcuts work the same in both languages; press <kbd>?</kbd> in the editor to see the full list of shortcuts.",
      },
    ],
  },

  pages: {
    /* ------------------------------------------------------------------ */
    "crop-image": {
      title: "Crop Image Online – Free, No Upload",
      description:
        "Crop an image online for free: drag the frame, pick a ratio such as 1:1, 4:3 or 16:9 and line it up with rule-of-thirds guides. Nothing is uploaded.",
      h1: "Crop image online",
      lead: "Drop a photo and the crop frame is already there. Drag it over the part you want to keep, lock an aspect ratio if you need one, and download the result.",
      card: "Crop image",
      cardText: "Cut out the part you want, with ratio presets",
      steps: [
        "Drop your image — the Crop tool opens with a frame over most of the picture.",
        "Drag the edges, corners or the whole frame, or choose a ratio such as 1:1 or 16:9.",
        "Press <kbd>Enter</kbd> or Apply crop, then click Export to download.",
      ],
      sections: [
        {
          h2: "Choosing the right aspect ratio",
          p: "Freeform lets you crop to any shape, which is fine for tidying up a snapshot. When the picture has a destination, lock a ratio instead. 1:1 suits profile pictures and square posts, 16:9 fits video thumbnails, slides and desktop wallpapers, and 9:16 is the vertical format of stories and phone screens. 3:2 matches most camera sensors and standard photo prints, while 4:3 and 3:4 fit tablets and many phone photos. The frame keeps its ratio while you resize it, so all you decide is what goes in.",
        },
        {
          h2: "Composing with the rule-of-thirds guides",
          p: "The crop frame shows two horizontal and two vertical lines that split it into nine parts. Placing the main subject — an eye, a person, the horizon — on one of those lines or where two of them cross usually looks more balanced than putting it dead center. Leave a little space in the direction a person is looking or moving. If the horizon is tilted, rotate the photo a few degrees with the Transform tool first, then crop, so the same frame also cuts away the empty corners.",
        },
        {
          h2: "Cropping to an exact area",
          p: "If you already know exactly which part you need — one product from a group shot, a single face from a crowd, a paragraph from a screenshot — draw a box around it with Rectangle select and choose Crop to selection in the Image menu. Cropping in the editor can always be undone, so experiment freely; the cut only becomes permanent in the file you export. Save photos as JPEG, and screenshots or graphics with sharp edges and text as PNG.",
        },
      ],
      faq: [
        {
          q: "Does cropping reduce image quality?",
          a: "Cropping itself only removes pixels; the ones you keep are unchanged. Quality can drop slightly when you save, because JPEG and WebP are lossy formats. Export photos at a quality of 85–92, or choose PNG when you need a lossless copy.",
        },
        {
          q: "How do I crop a picture to a square?",
          a: "Choose 1:1 in the ratio presets of the Crop tool. The frame becomes a square that stays square while you resize it; drag it over the area you want and press Enter. Export, and the image is ready for a profile picture or a square post.",
        },
        {
          q: "Can I crop a photo on my phone?",
          a: "Yes. The editor works in mobile browsers: drag the corners of the frame with your finger and pinch to zoom for precise placement. The photo is processed on the phone itself and is not sent to any server.",
        },
        {
          q: "Can I undo a crop?",
          a: "Yes, as long as you are still in the editor. Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd> to step back; the history keeps up to 60 steps. The exported file contains only the cropped area, while the original file on your device stays exactly as it was.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "resize-image": {
      title: "Resize Image Online – Change Pixel Size",
      description:
        "Resize an image online for free: set the exact width and height in pixels, keep the aspect ratio and scale the export. Fast, private, no upload needed.",
      h1: "Resize image online",
      lead: "Set a new width and height in pixels and download the smaller or larger picture. The Image size dialog opens as soon as you drop your photo.",
      card: "Resize image",
      cardText: "Change width and height in pixels",
      steps: [
        "Drop your image — the Image size dialog opens right away.",
        "Type the new width or height; Keep aspect ratio prevents stretching.",
        "Click Apply, then Export and download the resized file.",
      ],
      sections: [
        {
          h2: "Pixels, aspect ratio and what size to choose",
          p: "Width and height are set in pixels, which is what websites, email and social networks care about. With <strong>Keep aspect ratio</strong> checked, changing one value updates the other, so faces and circles don’t get squashed. As a rough guide, 1920 px on the long side is plenty for a full-screen photo or a presentation slide, 1200 px works for most blog images and email attachments, and 400–800 px is enough for a profile picture or product thumbnail. Making a picture smaller is safe; enlarging it adds pixels but not detail, so it looks softer.",
        },
        {
          h2: "Image size versus Canvas size",
          p: "Image size… scales the whole picture up or down. Canvas size…, also in the Image menu, changes the area around it instead: the picture keeps its size and the canvas is extended or cut. The 9-point anchor decides where the existing picture sits — choose the center to add an even border on all sides, or a corner to add space in one direction only. That is handy for fitting a portrait photo into a square without cropping it, or for making room for a caption.",
        },
        {
          h2: "Resizing while you export",
          p: "The Export dialog has its own Scale slider from 10 to 400 %. Use it when you want to keep the full-resolution document for further editing but download a smaller copy — 50 % for a quick share, for example. The dialog shows the expected file size before you click Download, so you can check whether the image now fits an upload limit. If the limit is about file size rather than pixels, lowering the JPEG or WebP quality helps as well.",
        },
      ],
      faq: [
        {
          q: "How do I resize an image without stretching it?",
          a: "Leave Keep aspect ratio checked in the Image size dialog and change only the width or only the height. The other value is calculated for you, so the proportions stay exactly as they were. To change the shape as well, crop to the new ratio first, then resize.",
        },
        {
          q: "Can I make a small image bigger without losing quality?",
          a: "You can enlarge it up to 8000 × 8000 pixels, but no editor can recreate detail the original never captured, and Paint Studio has no AI upscaling. Small enlargements usually look fine on screen; large ones look noticeably soft.",
        },
        {
          q: "What is the difference between resizing and compressing?",
          a: "Resizing changes the number of pixels. Compressing keeps the pixels but stores them more efficiently, usually as JPEG or WebP with a lower quality setting. Reducing dimensions is the most effective way to cut file size, and the two work well together.",
        },
        {
          q: "Can I resize many images at once?",
          a: "Not in one go — Paint Studio edits one image at a time and has no batch processing. For a handful of pictures, open each one, set the size and export; since nothing is uploaded, each file takes only a few seconds.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "rotate-image": {
      title: "Rotate Image Online – Flip or Straighten",
      description:
        "Rotate an image online by 90° or 180°, flip it horizontally or vertically, or straighten a crooked horizon by any angle. Free, in your browser, no upload.",
      h1: "Rotate image online",
      lead: "Turn a sideways photo upright, mirror a selfie or straighten a tilted horizon. The buttons for all of it are waiting in the task bar when your picture opens.",
      card: "Rotate image",
      cardText: "Rotate 90°, flip or straighten at any angle",
      steps: [
        "Drop your image — rotate and flip buttons appear in the task bar.",
        "Rotate 90° left or right, flip it, or use Free rotate for any angle.",
        "Press <kbd>Enter</kbd> to apply a free rotation, then Export the result.",
      ],
      sections: [
        {
          h2: "Rotating by 90° and flipping",
          p: "Rotate 90° left and rotate 90° right turn the whole image, so a portrait photo becomes landscape and its width and height swap. Click twice for 180°, which fixes pictures taken upside down. Flip horizontal mirrors the image left to right — useful when a selfie comes out mirrored or text in a photo reads backwards. Flip vertical turns it upside down as a reflection. Right-angle rotations and flips only move pixels without recalculating them, and the same commands are also in the Image menu.",
        },
        {
          h2: "Straightening a crooked horizon",
          p: "Click Free rotate to switch to the Transform tool. Drag outside the box to rotate by any angle, and watch a line that should be straight — the horizon, a doorframe, the edge of a building — until it is level. Hold <kbd>Shift</kbd> to snap to 15° steps when you need exactly 15°, 30° or 45°. Press Enter to apply. Rotating by an odd angle leaves empty corners, so finish with the Crop tool and place the frame inside them.",
        },
        {
          h2: "Saving the rotated picture",
          p: "Export in the format you started with: JPEG for photos, PNG for screenshots, scans and graphics. If you straightened a photo and some corners are still empty, JPEG fills them with white, so crop them away first, or export as PNG to keep them transparent. The Export dialog shows the expected file size before you click Download, and the quality slider lets you balance size against sharpness for JPEG and WebP files.",
        },
      ],
      faq: [
        {
          q: "Why does my photo appear sideways?",
          a: "Phones and cameras often store a photo in one orientation and add a note saying how it should be turned. Some apps ignore that note, so the picture shows up sideways. If it looks wrong in Paint Studio too, rotate it 90° in the right direction and export — the saved file is upright everywhere.",
        },
        {
          q: "Can I rotate an image by a custom angle, like 5°?",
          a: "Yes. Use Free rotate and drag outside the transform box until the picture looks right; any angle works. Hold Shift to snap to 15° steps. After pressing Enter, crop away the empty corners that appear around a tilted image.",
        },
        {
          q: "What is the difference between rotating and flipping?",
          a: "Rotating turns the picture around its center, like turning a printed photo on a table. Flipping mirrors it, as if you held it up to a mirror: left and right (or top and bottom) swap, and any text in it reads backwards.",
        },
        {
          q: "Does rotating reduce image quality?",
          a: "Rotating by 90° or 180° and flipping move pixels without changing them. Any other angle has to recalculate pixels, which softens very fine detail slightly, so rotate once to the final angle instead of in several small steps.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "compress-image": {
      title: "Compress Image – Reduce File Size Online",
      description:
        "Compress an image online and reduce its file size: adjust JPEG or WebP quality and scale, and see the new size before you download. Free, private, no upload.",
      h1: "Compress image online",
      lead: "Make a photo small enough for an email, a web form or a website. The Export dialog opens ready to go, with JPEG at quality 75 and a live estimate of the final file size.",
      card: "Compress image",
      cardText: "Shrink file size with quality and scale",
      steps: [
        "Drop your image — the Export dialog opens with JPEG at quality 75.",
        "Lower the quality or the scale until the estimated size fits your limit.",
        "Click Download to save the compressed copy.",
      ],
      sections: [
        {
          h2: "Quality, scale and format: what shrinks a file most",
          p: "Three controls decide the file size. <strong>Scale</strong> reduces the pixel dimensions and has by far the biggest effect: at 50 % only a quarter of the pixels remain, and the file shrinks accordingly. <strong>Quality</strong> controls how much detail JPEG and WebP discard; going from 100 down to around 80 typically saves a lot of space with little visible change. <strong>Format</strong> matters too — WebP usually produces smaller files than JPEG at similar quality. Start with scale if the image is larger than it will ever be displayed, then fine-tune quality.",
        },
        {
          h2: "Settings that work for common limits",
          p: "For photos on a website or in an email, quality 70–80 is usually indistinguishable from the original at normal viewing size. Go down to 50–60 only for thumbnails, where artifacts are hard to spot. If a form says “max 1 MB” or “max 500 KB”, watch the estimate in the dialog and lower the scale first, then the quality, until it fits. Screenshots with text compress poorly as JPEG — letters get fuzzy halos — so try WebP or keep PNG and reduce the scale instead.",
        },
        {
          h2: "What compression can’t do",
          p: "Lossy compression throws information away for good, so keep your original and compress a copy. Saving an already compressed JPEG again and again adds a little blockiness each time. PNG is lossless: quality settings don’t shrink it, and a photo saved as PNG is often much bigger than the JPEG you started with. Transparency survives in WebP and PNG but not in JPEG, where transparent areas turn white. Paint Studio compresses one image at a time; there is no batch mode.",
        },
      ],
      faq: [
        {
          q: "What quality setting should I use for JPEG?",
          a: "For most photos, 70–85 is a good balance between size and sharpness, and the preset 75 suits web pages and email. Use 90 or more for images you plan to print or edit further, and 50–60 only when size matters more than detail.",
        },
        {
          q: "Is WebP better than JPEG for small files?",
          a: "Usually, yes. At similar visual quality WebP files tend to be smaller, and WebP can also keep transparency. JPEG is still the safest choice when the file must open everywhere, for example in older software or strict upload forms.",
        },
        {
          q: "How can I get a photo under a size limit like 1 MB?",
          a: "Lower the Scale slider first, because fewer pixels shrink the file the most, then reduce Quality. The estimate updates as you drag, so you can stop as soon as it fits. For very small targets, combine a low scale with moderate quality rather than pushing quality to the minimum, which looks blocky.",
        },
        {
          q: "Will compressing remove transparency?",
          a: "Only if you choose JPEG, which can’t store transparency and fills those areas with white. Pick WebP to keep transparency and still get a compact file, or PNG for lossless output.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "image-converter": {
      title: "Image Converter – PNG, JPG, WebP, HEIC",
      description:
        "Free online image converter: open PNG, JPG, WebP, HEIC, AVIF, GIF, SVG, BMP or PSD and save as PNG, JPG, WebP or layered PSD. Runs in your browser.",
      h1: "Online image converter",
      lead: "Open an image in almost any common format and save it as PNG, JPEG, WebP or a layered PSD. The Export dialog appears as soon as the file is loaded, so a conversion takes only a few clicks.",
      card: "Image converter",
      cardText: "Convert between PNG, JPG, WebP and PSD",
      steps: [
        "Drop an image in any supported format.",
        "Choose the output format in the Export dialog and set the quality if needed.",
        "Click Download to save the converted file.",
      ],
      sections: [
        {
          h2: "Which format to convert to",
          p: "<strong>JPEG</strong> is the universal choice for photos: small files that open on every device, but no transparency. <strong>PNG</strong> is lossless and keeps transparency, which makes it ideal for screenshots, logos, diagrams and anything with sharp edges or text; photos saved as PNG are large. <strong>WebP</strong> supports both quality-based compression and transparency and usually gives the smallest files, though some older software can’t open it. A layered <strong>PSD</strong> is the right choice when someone will keep editing the file in Photoshop or another editor that reads PSD.",
        },
        {
          h2: "Formats you can open",
          p: "Paint Studio reads PNG, JPEG, WebP, BMP and SVG, the first frame of a GIF, AVIF if your browser can decode it, iPhone HEIC/HEIF photos and 8-bit Photoshop PSD files with their layers. Drag the file onto the page, use the file picker, or paste an image copied from another app with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>. SVG drawings are turned into pixels when they open, so the result is a regular bitmap; there is no SVG export or vector editing. Animated GIFs come in as a single still image.",
        },
        {
          h2: "What changes during conversion",
          p: "Converting re-encodes the pixels rather than just renaming the file. Transparent areas become white when you save as JPEG, so pick PNG or WebP for logos and cut-outs. JPEG and WebP use the quality slider (10–100): around 85–92 keeps photos visually unchanged, lower values save space. Converting a JPEG to PNG won’t restore detail that JPEG compression already removed — it only prevents further loss. Each file is converted on its own; there is no batch conversion of whole folders.",
        },
      ],
      faq: [
        {
          q: "Can I convert images to AVIF or HEIC?",
          a: "No. Paint Studio can open AVIF and HEIC files, but saves only PNG, JPEG, WebP, layered PSD and its own .paint project format. If you want a modern, compact format with wide support, WebP is a good alternative.",
        },
        {
          q: "Does converting to JPG lose transparency?",
          a: "Yes. JPEG has no transparency, so transparent pixels are filled with white during export. If you need to keep a see-through background, convert to PNG, or to WebP if you also want a small file.",
        },
        {
          q: "Can I convert several images at once?",
          a: "No, there is no batch conversion. Each image is opened, converted and downloaded on its own. For a few files that still goes quickly, since nothing has to be uploaded to a server or downloaded back from one.",
        },
        {
          q: "Which format should I choose for a website?",
          a: "Use WebP for photos and graphics whenever your site or platform accepts it, since it is usually the smallest. Use JPEG for photos when you need maximum compatibility, and PNG for logos, icons and screenshots that need crisp edges or transparency.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "png-to-jpg": {
      title: "PNG to JPG Converter – Free, No Upload",
      description:
        "Convert PNG to JPG online for free. Pick the JPEG quality, see the file size before you download and know exactly what happens to transparent areas.",
      h1: "Convert PNG to JPG",
      lead: "Turn a large PNG into a compact JPG that every app, website and email client accepts. Drop the file and the Export dialog opens with JPEG already selected.",
      card: "PNG to JPG",
      cardText: "Turn PNGs into compact, compatible JPGs",
      steps: [
        "Drop your PNG — the Export dialog opens with JPEG selected.",
        "Set the quality and check the estimated file size.",
        "Click Download to save the JPG.",
      ],
      sections: [
        {
          h2: "Why convert PNG to JPG",
          p: "PNG is lossless, which is perfect for graphics but wasteful for photographs: a photo saved as PNG is often several times larger than the same photo as JPEG. Converting makes it practical to email, to upload through forms with size limits, or to post on sites that only accept JPG. JPEG works by discarding fine detail the eye barely notices, so it suits photos, soft gradients and scanned pictures far better than flat graphics.",
        },
        {
          h2: "What happens to transparency",
          p: "JPEG can’t store transparent pixels. When you export a PNG with a transparent background — a logo, an icon, a cut-out product — the transparent parts become white. That is usually what you want for documents and white web pages. If the image will sit on a colored background, keep it as PNG or WebP, or choose New layer in the Layer menu, drag that layer below the image in the Layers panel, fill it with the color you need using the Fill tool, and then export to JPG.",
        },
        {
          h2: "Choosing JPEG quality",
          p: "The quality slider runs from 10 to 100. For photos, 80–90 gives files that look the same as the PNG at normal size. If the PNG is a screenshot, a chart or anything with small text, JPEG tends to create fuzzy halos around sharp edges; use 90 or higher, or consider staying with PNG. The file-size estimate updates as you move the slider, so you can see exactly what each step saves before you click Download.",
        },
      ],
      faq: [
        {
          q: "Does converting PNG to JPG reduce quality?",
          a: "Slightly, because JPEG is a lossy format. At quality 85 or above the difference is hard to see in photos. Graphics with flat colors and sharp lines show artifacts sooner, so check the result and keep PNG if crisp edges matter.",
        },
        {
          q: "Why did my transparent background turn white?",
          a: "JPEG doesn’t support transparency, so the editor fills transparent areas with white when it saves a JPG. To keep the background see-through, export as PNG or WebP instead.",
        },
        {
          q: "Can I convert JPG back to PNG?",
          a: "Yes — open the JPG and choose PNG in the Export dialog. The file is lossless from then on, but detail already removed by JPEG compression doesn’t come back, and the PNG will usually be larger.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "webp-to-jpg": {
      title: "WebP to JPG Converter – Free Online",
      description:
        "Convert WebP to JPG online when a downloaded image won’t open in your app. Choose the quality, or keep transparency as PNG. Free, nothing is uploaded.",
      h1: "Convert WebP to JPG",
      lead: "Saved a picture from a website and got a .webp file that your photo viewer, editor or upload form refuses? Convert it to a standard JPG in a few seconds.",
      card: "WebP to JPG",
      cardText: "Make web images open in any app",
      steps: [
        "Drop the .webp file — the Export dialog opens with JPEG selected.",
        "Adjust the quality, or switch to PNG to keep transparency.",
        "Click Download to save the converted image.",
      ],
      sections: [
        {
          h2: "Why WebP files cause trouble",
          p: "Many websites serve images as WebP because the files are small and load quickly. When you save one of those images, you get a .webp file — and older photo viewers, office programs, print shops and some upload forms still don’t accept it. Converting to JPG gives you a file that opens practically everywhere. What you see in the picture stays the same; only the way it is stored changes.",
        },
        {
          h2: "JPG or PNG?",
          p: "Choose JPEG for photographs and for anything you want to print, share by email or attach to a document. Choose PNG when the WebP has a transparent background, such as a logo or a sticker: JPEG would fill those areas with white, while PNG keeps them see-through. PNG is also the better choice for screenshots and illustrations with text. Not sure whether your image has transparency? Look at the canvas in the editor — a checkerboard pattern marks transparent areas.",
        },
        {
          h2: "Fix the image before you save",
          p: "Because the WebP is open in a full editor, you can improve it before converting. Crop away a website banner or border, resize it for a document, or adjust brightness and contrast in the Adjust panel. Then click the Export button to open the dialog again. Quality 85–90 is a safe choice for JPG, and the estimate shows the resulting file size before you download.",
        },
      ],
      faq: [
        {
          q: "Will I lose quality converting WebP to JPG?",
          a: "A little, since both are usually lossy formats and the image is compressed again. At quality 85–90 the difference is very hard to see. Avoid converting the same picture back and forth repeatedly, as every lossy save adds small artifacts.",
        },
        {
          q: "Why won’t my computer open WebP files?",
          a: "WebP is newer than JPEG and PNG, and support arrived in different programs at different times. Up-to-date browsers open it without problems, but older image viewers, office suites and some online forms don’t. Converting to JPG or PNG is the simplest fix.",
        },
        {
          q: "Can I convert JPG to WebP too?",
          a: "Yes. Open any JPG or PNG and choose WebP in the Export dialog. WebP files are usually smaller than JPEGs at similar quality and can keep transparency, which makes them a good choice for websites.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "heic-to-jpg": {
      title: "HEIC to JPG – Convert iPhone Photos",
      description:
        "Convert HEIC to JPG online for free. Open iPhone photos in any browser and save them as JPG or PNG — the photo is decoded on your device, never uploaded.",
      h1: "Convert HEIC to JPG",
      lead: "iPhones save photos as HEIC, which many Windows programs, websites and older devices can’t open. Drop the file here and save it as a regular JPG.",
      card: "HEIC to JPG",
      cardText: "Open iPhone photos anywhere as JPG",
      steps: [
        "Drop a .heic or .heif photo from your iPhone or iPad.",
        "Wait a moment while it is decoded; the Export dialog opens with JPEG selected.",
        "Click Download to save the JPG.",
      ],
      sections: [
        {
          h2: "What HEIC is and why it won’t open",
          p: "HEIC (or HEIF) is the default photo format on iPhones and iPads. It stores the same picture in noticeably less space than JPEG, but support outside Apple devices is patchy: many Windows apps, web upload forms and older phones show an error or a blank thumbnail instead of your photo. JPG is understood by practically everything, so converting is the quickest way to share, print or attach the picture.",
        },
        {
          h2: "How the conversion stays on your device",
          p: "Safari can decode HEIC by itself, so on a Mac, iPhone or iPad the photo opens immediately. Other browsers need a decoder: the first time you open a HEIC file, Paint Studio downloads a decoder library once from the jsDelivr CDN, and the decoding then runs inside your browser. Only the library comes from the network — the photo itself is never uploaded. That matters for pictures of family, of documents or of anything else you would rather not hand to a conversion website.",
        },
        {
          h2: "What is and isn’t converted",
          p: "Only the main still image is converted. Live Photo motion, the depth maps used for portrait effects and the extra frames of a burst are not part of the JPG. Before you download, you can crop, straighten or brighten the photo like any other image. Quality 85–92 keeps phone photos visually unchanged; if you need a smaller file for email, lower the Scale slider as well, since iPhone photos have far more pixels than a screen shows.",
        },
      ],
      faq: [
        {
          q: "Is it safe to convert my iPhone photos here?",
          a: "Yes. Your photos are decoded and converted inside your browser. In browsers other than Safari, only the HEIC decoder library is downloaded from jsDelivr on first use; the image data itself never leaves your device.",
        },
        {
          q: "Can I stop my iPhone from saving HEIC?",
          a: "Yes. On the iPhone, open Settings › Camera › Formats and choose Most Compatible. New photos are then saved as JPEG; photos you have already taken stay HEIC and still need converting.",
        },
        {
          q: "Why does a HEIC file take a moment to open?",
          a: "HEIC uses more complex compression than JPEG, and outside Safari the decoder has to be downloaded the first time you use it. Decoding a large photo can still take a moment after that, depending on how fast your device is.",
        },
        {
          q: "Can I convert HEIC to PNG instead?",
          a: "Yes. Pick PNG in the Export dialog. The file will be lossless but much larger than a JPG, so PNG is mainly useful if you plan to edit the photo further in another program.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "blur-image": {
      title: "Blur Image Online – Hide Faces & Details",
      description:
        "Blur or pixelate faces, license plates and personal data in an image online. Select the area and click Blur or Pixelate — processed locally, never uploaded.",
      h1: "Blur image online",
      lead: "Hide faces, license plates, addresses or private details in a photo or screenshot. Select the area, click Blur or Pixelate, and the content is gone — without the image ever leaving your device.",
      card: "Blur image",
      cardText: "Blur or pixelate faces and private details",
      steps: [
        "Drop your image — Rectangle select is ready.",
        "Drag over the face, plate or text you want to hide.",
        "Click Blur or Pixelate in the task bar, then Export.",
      ],
      sections: [
        {
          h2: "Blur or pixelate?",
          p: "Both hide the content, and the strength grows with the size of the selection, so even a large face is fully unrecognizable after one click. <strong>Blur</strong> gives a soft, smooth patch that blends into a photo — good for faces in the background or a street scene. <strong>Pixelate</strong> turns the area into large blocks; it looks deliberate, which is what you want when redacting a screenshot or a document. For the most sensitive details, such as passwords or account numbers, you can also cover the area with a solid Rectangle, which leaves nothing of the original.",
        },
        {
          h2: "Selecting exactly what to hide",
          p: "Rectangle select is ideal for text, plates and screenshots. Use Ellipse select for faces, the Lasso for irregular shapes, or the Magic wand to pick an area of similar color. Hold <kbd>Shift</kbd> while selecting to add more areas, so you can blur several faces in one go. Feather softens the selection edge, so a blurred patch fades into the photo instead of ending in a hard line. If nothing is selected, the whole image is blurred.",
        },
        {
          h2: "Blurring a background and other effects",
          p: "Blur works the other way round too: select your subject with the Lasso, choose Invert selection in the Edit menu and apply Blur to soften everything except the person, for a simple portrait look. For gentle, hand-controlled softening, paint with the Blur brush exactly where you want it, for example over a distracting sign. The Filters panel also offers Soft blur and Pixelate, which apply to the whole image or to the current selection.",
        },
      ],
      faq: [
        {
          q: "Can someone un-blur the hidden area?",
          a: "Not from the exported file. Blurring and pixelating replace the original pixels, and the strength scales with the selection so that the content is fully hidden. For passwords or ID numbers, a solid black Rectangle over the area is the most certain option.",
        },
        {
          q: "Is it safe to blur sensitive documents here?",
          a: "Yes. The image is opened and blurred inside your browser and is never uploaded, so the unredacted version doesn’t pass through anyone else’s server. Just remember to share the exported file, not the original.",
        },
        {
          q: "How do I blur several faces at once?",
          a: "Hold Shift while drawing additional selections to add them to the first one. When every face is selected, click Blur or Pixelate once and all of the selected areas are hidden together.",
        },
        {
          q: "How do I blur part of a screenshot?",
          a: "Paste the screenshot straight into the page with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>, or drop the saved file. Select names, emails or numbers with Rectangle select, click Pixelate and export as PNG, which keeps the rest of the text sharp.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "add-text-to-photo": {
      title: "Add Text to Photo Online – Free",
      description:
        "Add text to a photo online: type on the image in the final font, choose size, color and alignment, and edit it any time. Make memes, captions, watermarks.",
      h1: "Add text to a photo",
      lead: "Write a caption, a meme line or a watermark directly on your picture. What you type appears on the canvas in the final font, and you can come back to change it later.",
      card: "Add text",
      cardText: "Captions, memes and watermarks on photos",
      steps: [
        "Drop your photo — the Text tool is ready.",
        "Click where the text should go and type; set the font, size and color.",
        "Press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Enter</kbd> to commit, then Export.",
      ],
      sections: [
        {
          h2: "Fonts, size and color",
          p: "Choose from six fonts: System sans for clean captions, Serif for a classic look, Monospace for code or technical labels, Impact for memes, Handwritten for a personal note and Trebuchet for friendly headings. Size goes from 6 to 400 px, and you can align left, center or right, switch on bold or italic and lower the opacity. The text color is the primary color in the Color panel — set it before typing, or pick it from the photo with the Eyedropper so the text matches the picture.",
        },
        {
          h2: "Editing, moving and layering text",
          p: "Every piece of text becomes its own text layer in the Layers panel. Click it again with the Text tool to fix a typo or change the wording, and use the Move tool to reposition it. The layer stays editable until you paint on it, rotate it or flip it; after that it becomes ordinary pixels. To make text readable on a busy photo, add a new layer below it, draw a solid black or white Rectangle and lower that layer’s opacity to create a soft band behind the words.",
        },
        {
          h2: "Memes and watermarks",
          p: "For the classic meme style, pick Impact, set a large size, center the alignment and use white text near the top and bottom edges. For a watermark, type your name or website in a small size, place it in a corner and set the opacity to around 30–50 % so it is visible without covering the picture. Export as JPEG for photos you share, or as PNG if the image consists mostly of text and flat graphics.",
        },
      ],
      faq: [
        {
          q: "Can I edit the text after adding it?",
          a: "Yes. Each text is a separate text layer; select the Text tool and click the text to change the words, font, size or color. It stays editable until you paint on that layer, rotate it or flip it. Save a .paint project to keep all layers for later.",
        },
        {
          q: "Which fonts are available?",
          a: "System sans, Serif, Monospace, Impact, Handwritten and Trebuchet. You can’t add your own font files, and the exact look of each family may vary slightly between operating systems.",
        },
        {
          q: "How do I add text to a picture on my phone?",
          a: "Open this page in your phone’s browser, choose a photo, tap where the text should go and type with the on-screen keyboard. Use the Move tool to drag the text into place, then Export to download the finished image.",
        },
        {
          q: "Can I rotate text?",
          a: "Yes, with the Transform tool, which rotates the text layer by any angle. Rotating turns the text into pixels, though, so finish the wording first and rotate it as the very last step.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "black-and-white-photo": {
      title: "Black and White Photo – Free Online",
      description:
        "Make a photo black and white online in one click. Try Noir or Sepia, fine-tune contrast with Curves, or keep one color for a color-splash effect. Free.",
      h1: "Make a photo black and white",
      lead: "Your photo turns black and white the moment it opens. Keep it, try a punchier Noir or a warm Sepia, and fine-tune the contrast before you download.",
      card: "Black and white",
      cardText: "Grayscale, Noir and Sepia in one click",
      steps: [
        "Drop your photo — it is converted to grayscale right away.",
        "Try Noir or Sepia in the task bar, or click Undo to go back.",
        "Fine-tune the contrast if you like, then click Export.",
      ],
      sections: [
        {
          h2: "Grayscale, Noir or Sepia",
          p: "<strong>Grayscale</strong> is a faithful conversion that keeps the full range of tones — a good start for portraits and documents. <strong>Noir</strong> is high-contrast black and white with deeper shadows and brighter highlights, suited to street photography, architecture and moody shots. <strong>Sepia</strong> gives the warm brown tone of old prints and works well for family photos and vintage looks. Each one is a single undo step, so comparing them is quick. All three are also in the Filters panel, next to Duotone for a two-color variation.",
        },
        {
          h2: "Fine-tuning the black-and-white look",
          p: "A black-and-white conversion often looks flat, because colors that differed in hue end up as similar grays. Fix that with contrast: open Curves… and drag a gentle S-shape, lowering the shadows and raising the highlights, or use Levels… and move the black and white points inward until the histogram fills the range. The Contrast and Clarity sliders in the Adjust panel are a quicker option. A little Grain or Vignette gives the image a film-like feel.",
        },
        {
          h2: "Color splash: keep one color",
          p: "To leave one object in color — a red umbrella, a bouquet, a pair of eyes — click Undo first to bring the color photo back. Select the object with the Lasso or Magic wand, choose Invert selection in the Edit menu, then apply Grayscale from the Filters panel. Only the selected area changes, so the object keeps its color while everything around it turns gray. A small Feather value on the selection tool makes the transition look natural.",
        },
      ],
      faq: [
        {
          q: "Can I get the color back after converting?",
          a: "Yes, while the photo is open: click Undo in the task bar or press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>, because the conversion is a single undo step. The exported file is black and white, but the original photo on your device stays in color.",
        },
        {
          q: "What is the difference between grayscale and black and white?",
          a: "In everyday use they mean the same: a photo without color. Strictly speaking, grayscale contains all the shades between black and white, while pure black and white has only two tones. For that stark two-tone look, use the Threshold filter in the Filters panel.",
        },
        {
          q: "Should I save a black-and-white photo as JPG or PNG?",
          a: "Use JPEG for photographs; the file stays small and prints well. Choose PNG only if the image is a scan of text, a drawing or line art, where perfectly crisp edges matter more than file size.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "invert-colors": {
      title: "Invert Colors of an Image Online",
      description:
        "Invert the colors of an image online and turn it into a negative in one click. Useful for scanned film negatives and dark screenshots. Free and private.",
      h1: "Invert image colors",
      lead: "Turn any picture into its negative: black becomes white, blue becomes yellow and every color flips to its opposite. The effect is applied as soon as your image opens.",
      card: "Invert colors",
      cardText: "Make a negative in one click",
      steps: [
        "Drop your image — its colors are inverted immediately.",
        "Fine-tune with Levels… if you are working with a scanned negative.",
        "Click Export and download the result.",
      ],
      sections: [
        {
          h2: "What inverting does",
          p: "Invert replaces every color with its opposite and every brightness with its mirror value: white turns black, light gray turns dark gray, red becomes cyan and yellow becomes blue. Applying it a second time gives back the original exactly. Transparent areas stay transparent, so a logo on a transparent background keeps its shape. To invert only part of an image, click Undo, select the area and apply Invert from the Filters panel — handy for highlighting one region of a diagram.",
        },
        {
          h2: "Scanned film negatives",
          p: "If you photographed or scanned a film negative, inverting is the first step to a positive picture. Black-and-white negatives often look good straight away; Levels… then sets the black and white points to bring back contrast. Color negatives have an orange base, so after inverting the photo looks blue. Open Levels… and adjust the red, green and blue channels separately until neutral areas look gray, then fine-tune with Temperature and Tint in the Adjust panel. There are no film-specific profiles, so expect some manual tweaking.",
        },
        {
          h2: "Screenshots, diagrams and creative uses",
          p: "Inverting a dark-mode screenshot gives a light version that prints better and fits into documents, and a white document becomes a dark one for a presentation. Colors flip too, so a blue link turns yellow; dragging the Hue shift slider in the Adjust panel can bring hues closer to the originals while keeping the inverted brightness. As an effect, invert gives photos an X-ray look, especially combined with the Grayscale filter.",
        },
      ],
      faq: [
        {
          q: "How do I invert only part of an image?",
          a: "Click Undo to remove the full inversion, select the area with Rectangle select, Lasso or Magic wand, then click Invert in the Filters panel. Only the selection changes; the rest of the image stays as it was.",
        },
        {
          q: "Can I invert colors in a transparent PNG?",
          a: "Yes. Invert changes only the colors, not the transparency, so the transparent background stays transparent. Export as PNG or WebP to keep it; JPEG would fill the transparent areas with white.",
        },
        {
          q: "How do I undo an inverted image?",
          a: "Click Undo or press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>. You can also simply apply Invert a second time: inverting twice returns exactly the original colors, because the operation is fully reversible.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "photo-filters": {
      title: "Photo Filters Online – 21 Free Effects",
      description:
        "Apply photo filters online: Vintage, Noir, Sepia, Duotone, Pencil sketch, Bloom and more, each previewed live on your own photo. Free, with no sign-up.",
      h1: "Photo filters online",
      lead: "Pick from 21 one-click filters, each shown as a live thumbnail of your own photo, so you see the result before you click. Stack them, undo them, or apply them to just part of the picture.",
      card: "Photo filters",
      cardText: "21 effects previewed on your own photo",
      steps: [
        "Drop your photo — the Filters panel opens with live previews.",
        "Click a filter; click more to stack effects, or Undo to remove one.",
        "Click Export to download the finished photo.",
      ],
      sections: [
        {
          h2: "The 21 filters at a glance",
          p: "Color looks: Vivid boosts saturation and contrast, Fade mutes colors and lifts the blacks for a matte finish, Warm and Cool shift the color temperature, Vintage gives an aged print, and Duotone maps the tones between your primary and secondary colors. Monochrome: Grayscale, Noir and Sepia. Graphic effects: Invert, Posterize, Threshold and Solarize. Detail: Soft blur, Sharpen, Emboss and Edge detect. Artistic: Pencil sketch, Bloom (a dreamy glow around highlights), Pixelate and Vignette, which darkens the corners to draw the eye to the center.",
        },
        {
          h2: "Stacking and toning down filters",
          p: "Each filter is one step in the history, and filters stack: Sharpen followed by Vintage, or Warm plus Vignette, builds a look step by step. When a filter is too strong, use Duplicate layer in the Layer menu, apply the filter to the copy and lower that layer’s opacity in the Layers panel until it looks right. Changing the copy’s blend mode, for example to Soft light or Multiply, opens up even more variations without any extra filters.",
        },
        {
          h2: "Filtering part of a photo",
          p: "Filters apply only inside a selection when one exists. Select the sky with the Magic wand and apply Cool, select a face with Ellipse select and apply Soft blur for a gentle glow, or select everything except your subject with Invert selection in the Edit menu and apply Grayscale for a color-splash effect. Without a selection, the whole layer is filtered. For corrections the filters don’t cover, such as fixing exposure, switch to the Adjust panel.",
        },
      ],
      faq: [
        {
          q: "Can I remove a filter after applying it?",
          a: "Yes. Click Undo or press <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>; each filter is a single step and the history keeps up to 60 of them. Filters stacked on top can be undone one by one, in reverse order.",
        },
        {
          q: "How does the Duotone filter choose its colors?",
          a: "Duotone uses the primary and secondary colors from the Color panel: dark tones take the primary color, light tones the secondary one. Set both before applying — navy and pale yellow, for instance — and after Undo you can try another pair.",
        },
        {
          q: "Can I make a photo look like a pencil drawing?",
          a: "Yes, apply Pencil sketch. For a bolder sketch, increase the contrast in the Adjust panel first. For a drawing with a hint of color, duplicate the layer, apply Pencil sketch to the copy and set its blend mode to Multiply.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "brighten-photo": {
      title: "Brighten Photo Online – Fix Dark Pictures",
      description:
        "Brighten a dark photo online with live sliders for exposure, shadows, highlights and contrast, plus Levels, Curves and one-click Auto levels. Free.",
      h1: "Brighten a photo online",
      lead: "Rescue an underexposed or backlit picture. The Adjust panel opens with 15 live sliders, and Auto levels, Levels… and Curves… are one click away in the task bar.",
      card: "Brighten photo",
      cardText: "Fix dark photos with exposure and Levels",
      steps: [
        "Drop your photo — the Adjust panel opens with a live preview.",
        "Try Auto levels, or raise Exposure and Shadows until it looks right.",
        "Click Apply, then Export the brighter photo.",
      ],
      sections: [
        {
          h2: "Which slider to use for a dark photo",
          p: "<strong>Exposure</strong> brightens the whole picture as if more light had reached the camera — the first slider to try for an underexposed shot. <strong>Shadows</strong> lifts only the dark areas, ideal for a backlit person in front of a bright window or sky; pair it with slightly negative <strong>Highlights</strong> to keep the sky from burning out. <strong>Brightness</strong> shifts all tones evenly, while <strong>Gamma</strong> brightens the midtones and leaves pure black and white in place. Afterwards, add a touch of Contrast or Clarity, because brightening tends to make a photo look flat.",
        },
        {
          h2: "Auto levels, Levels and Curves",
          p: "Auto levels sets the black and white points automatically so the tones span the full range — often all a dull photo needs. Levels… shows the histogram: if it stops short of the right edge, drag the white input point to where the data ends and the picture brightens without clipping, while the middle (gamma) point brightens the midtones. Curves… gives the most control: drag the middle of the curve upward to brighten, or edit a single channel to remove a color cast. Both work on all channels together or on red, green and blue separately.",
        },
        {
          h2: "Color and finishing touches",
          p: "Indoor photos under warm light often look too orange; drag Temperature toward blue to neutralize them, and use Tint against a green or magenta cast. Vibrance boosts muted colors more than already strong ones, while Saturation affects all colors equally. For a fast result, the Adjust menu has quick presets: Auto contrast, Warm up, Cool down and Punchy. Very dark photos reveal noise when brightened; Softness can calm it down, and Grain can make it look intentional.",
        },
      ],
      faq: [
        {
          q: "How do I brighten a photo without washing it out?",
          a: "Brighten with Shadows or Gamma rather than Brightness, since they lift the darker tones while keeping black and white in place. Then add a little Contrast or Clarity to restore depth. If clouds or skin turn pure white, lower Highlights.",
        },
        {
          q: "Can I brighten only part of a photo?",
          a: "Yes. Select the area first — for example a face with Ellipse select and some Feather — and the adjustments apply only inside the selection. To paint light onto specific spots instead, use the Dodge / Burn tool with the range set to midtones.",
        },
        {
          q: "What does Auto levels do?",
          a: "It analyzes the photo’s histogram and sets the black and white points for you, so the tones span the full range from dark to light. It is a good starting point for flat or hazy pictures, and you can refine the result with the sliders afterwards.",
        },
        {
          q: "Can a very dark photo be fixed completely?",
          a: "Often a lot can be recovered, but areas that are pure black contain no detail to bring back, and heavy brightening makes noise visible. Use moderate settings, consider a black-and-white version for very noisy images, and keep the original file.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "make-background-transparent": {
      title: "Make Background Transparent Online",
      description:
        "Make an image background transparent online: click it with the Magic wand, delete it, refine the edges and save as PNG. Ideal for logos and signatures.",
      h1: "Make an image background transparent",
      lead: "Remove a plain background from a logo, product photo or signature and save it with transparency. Click the background with the Magic wand, delete it and download a PNG.",
      card: "Transparent background",
      cardText: "Remove plain backgrounds from logos and photos",
      steps: [
        "Drop your image — the Magic wand is ready.",
        "Click the background, Shift-click to add more, and press <kbd>Delete</kbd>.",
        "Refine the edges if needed, then Export as PNG or WebP.",
      ],
      sections: [
        {
          h2: "When this works best",
          p: "The Magic wand selects pixels by color, so it shines on plain, evenly colored backgrounds: logos on white, product shots on a studio backdrop, scanned signatures, icons and clip art. A busy background — a street, a forest, a patterned sofa — has too many different colors for one click and needs more manual work with the Lasso and Eraser. There is no AI subject detection, so you stay in control of exactly which pixels disappear. A checkerboard pattern shows the areas that are already transparent.",
        },
        {
          h2: "Getting a clean selection",
          p: "<strong>Tolerance</strong> decides how similar a color must be to get selected: low values for crisp graphics, higher values for backgrounds with shadows or JPEG noise. Shift-click adds areas, such as the gaps inside letters like “o” or “a”, and Alt-click (Option-click on a Mac) removes areas you grabbed by accident. Turning off Contiguous selects the color everywhere in the image at once. After deleting, zoom in on the edges: a pale fringe left behind usually means the tolerance was too low.",
        },
        {
          h2: "Refining edges and saving",
          p: "For non-destructive work, use a layer mask instead of deleting: after selecting the background, invert the selection and create a mask from it. The background is hidden rather than erased, and painting black or white on the mask hides or reveals pixels again, so a stray click is easy to fix. The Eraser cleans up anything the wand missed. Trim transparent edges in the Image menu cuts the empty margin around a logo. Export as PNG for compatibility or WebP for a smaller file; JPEG can’t store transparency and fills it with white.",
        },
      ],
      faq: [
        {
          q: "Can it remove the background from a portrait automatically?",
          a: "No. Paint Studio has no AI background removal. You can still cut out a person with the Lasso, the Magic wand and a layer mask, but hair and complex backgrounds take patience. Plain backgrounds, like a white wall, are much quicker.",
        },
        {
          q: "Why does my transparent image have a white background after saving?",
          a: "It was most likely saved as JPEG, which has no transparency and fills those areas with white. Export again and choose PNG or WebP. Also check your viewer: some apps display transparent areas as white or black even when the file is transparent.",
        },
        {
          q: "How do I make a signature transparent?",
          a: "Photograph or scan the signature on white paper, then raise Contrast in the Adjust panel so the paper becomes whiter and the ink darker. Click the paper with the Magic wand, delete it, use Trim transparent edges and export as PNG.",
        },
        {
          q: "How do I remove a white background from a logo?",
          a: "Click the white area with the Magic wand, then Shift-click inside closed letters — or turn off Contiguous to grab all the white at once, as long as the logo itself contains no white. Press Delete and export as PNG.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "color-picker-from-image": {
      title: "Color Picker from Image – HEX & RGB",
      description:
        "Pick a color from any image online and get its HEX and RGB code in one click. Zoom in to single pixels, copy the value and reuse it. Free, no upload.",
      h1: "Color picker from image",
      lead: "Find the exact color of any pixel in a photo, logo or screenshot. Click it with the Eyedropper and copy its HEX or RGB code.",
      card: "Color picker",
      cardText: "Get HEX and RGB codes from any pixel",
      steps: [
        "Drop an image or paste a screenshot — the Eyedropper is ready.",
        "Click or drag over the image to sample a color.",
        "Read the HEX and RGB value in the task bar and click Copy.",
      ],
      sections: [
        {
          h2: "Getting the exact color",
          p: "Click anywhere to sample a pixel, or press and drag to watch the value change as you move across the image. The task bar shows the color as a HEX code (such as #1E88E5) and as RGB, with a Copy button that puts the value on your clipboard; the Color panel shows it as well. To hit a single pixel — a thin line, a small icon, one letter — zoom in with the scroll wheel or a pinch gesture. At up to 3200 % every pixel becomes a large square.",
        },
        {
          h2: "Photos, logos and screenshots",
          p: "In a photograph, neighboring pixels rarely have exactly the same color, and JPEG compression adds small variations on top. Sample a few points and pick the one that represents the area best. For brand colors, use the cleanest source you have, such as an original PNG or SVG logo rather than a compressed screenshot. To pick a color from a website or app, take a screenshot and paste it with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>. Paint Studio reads the stored RGB values without color management, so results can differ slightly from tools that convert color profiles.",
        },
        {
          h2: "Layers and recent colors",
          p: "In a document with several layers, choose whether to sample from all layers — the color you actually see — or only from the active layer, which helps when a semi-transparent layer sits on top. Every picked color is added to the Recent row in the Color panel, so you can collect a small palette from one image and reuse it later while painting, drawing shapes or adding text in the same session.",
        },
      ],
      faq: [
        {
          q: "How do I get the HEX code of a color in an image?",
          a: "Open the image, click the color with the Eyedropper and read the HEX value in the task bar. Click Copy to put it on your clipboard, then paste it into your design tool, CSS file or document.",
        },
        {
          q: "Can I pick a color from a screenshot?",
          a: "Yes. Take a screenshot as usual and paste it straight into the page with Ctrl/⌘+V, or save it and drop the file. Zoom in to the exact spot and click it with the Eyedropper.",
        },
        {
          q: "Why do I get slightly different values in the same area?",
          a: "Photos contain noise and gradients, and JPEG compression adds small variations, so neighboring pixels often differ by a few units. Zoom in, sample several points and choose a representative one, or use an uncompressed original if you have it.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "draw-on-image": {
      title: "Draw on Image Online – Arrows & Shapes",
      description:
        "Draw on an image online: add arrows, circles, boxes and freehand notes to photos and screenshots, with pen pressure and layers. Free, nothing uploaded.",
      h1: "Draw on an image",
      lead: "Mark up a screenshot, circle a spot on a map or sketch over a photo. The Brush is ready the moment your image opens, with arrows, shapes and a highlighter effect close at hand.",
      card: "Draw on image",
      cardText: "Arrows, shapes and freehand notes on photos",
      steps: [
        "Drop your image — the Brush is ready to draw.",
        "Add a new layer, then draw with the Brush, Arrow, Rectangle or Ellipse.",
        "Click Export to download the marked-up image.",
      ],
      sections: [
        {
          h2: "Annotating screenshots and plans",
          p: "For tutorials and bug reports, the Arrow points at exactly the button you mean, and Rectangle or Ellipse in outline mode draws a clean frame around it; give the Rectangle rounded corners for a softer look. Line draws straight connections, and holding <kbd>Shift</kbd> constrains the angle of lines and the proportions of shapes. On maps and floor plans, outline an area with the Polygon, or switch to solid or both to fill it. Red or bright yellow at a medium size stands out on most backgrounds.",
        },
        {
          h2: "A highlighter effect",
          p: "To mark text the way a highlighter pen does, choose a bright yellow, set the Brush or a solid Rectangle to low opacity — around 40 % — and set the layer’s blend mode to Multiply in the Layers panel. Multiply only darkens, so black text stays fully readable through the color instead of being covered. Keeping the highlights on their own layer lets you change their opacity or delete them later without touching the screenshot underneath.",
        },
        {
          h2: "Freehand drawing on photos",
          p: "The Brush has size, opacity, hardness and smoothing controls and responds to pen pressure from a tablet or stylus. Smoothing steadies shaky mouse strokes, and hardness decides between a crisp and a soft edge. The Pencil gives hard, pixel-sharp lines, the Airbrush builds up color gradually, and the Eraser removes strokes. Press <kbd>[</kbd> and <kbd>]</kbd> to change the brush size quickly. Drawing on a separate layer means the photo underneath is never touched.",
        },
      ],
      faq: [
        {
          q: "How do I draw an arrow on a picture?",
          a: "Select the Arrow tool, pick a color in the Color panel and drag from where the arrow should start to where it should point. Adjust its size in the tool options, and hold Shift while dragging to constrain the arrow’s angle.",
        },
        {
          q: "Can I erase my drawing without erasing the photo?",
          a: "Yes, if you drew on a separate layer. Add a new layer before drawing; the Eraser then removes only your strokes, and you can hide or delete the whole layer at any time. If you drew straight onto the photo, use Undo instead.",
        },
        {
          q: "Does it work with Apple Pencil or a drawing tablet?",
          a: "Yes. The Brush reacts to pen pressure, so strokes respond to how hard you press, as long as the browser passes pressure data through. Touch and stylus input work on tablets and touch screens as well.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "paint-online": {
      title: "Paint Online – Free Drawing App",
      description:
        "Paint online for free on a blank canvas: pressure-sensitive brushes, layers, shapes, gradients and text. Works on Chromebooks, tablets and phones.",
      h1: "Paint online",
      lead: "Open a blank canvas and start painting — no file, no account, no download. Brushes, layers, shapes and text work with a mouse, a finger or a stylus.",
      card: "Paint online",
      cardText: "A blank canvas with brushes and layers",
      steps: [
        "Open a blank white 1600 × 1000 canvas — the Brush is already selected.",
        "Paint with brushes, Fill, Gradient and shapes; add layers as you go.",
        "Save a .paint project to continue later, or Export as PNG.",
      ],
      sections: [
        {
          h2: "Tools for drawing and painting",
          p: "The Brush is the main tool: set its size, opacity, hardness and smoothing, and with a stylus it responds to pen pressure. The Pencil draws hard pixel lines for pixel art and outlines, the Airbrush sprays soft color that builds up, and the Eraser removes. Fill pours color into an area, with tolerance and expand settings so fills tuck neatly under anti-aliased line art. Gradient paints linear or radial blends for skies and backgrounds. Line, Rectangle, Ellipse, Polygon and Star draw clean shapes, and the Text tool adds lettering.",
        },
        {
          h2: "Layers for cleaner artwork",
          p: "Work the way digital artists do: sketch on one layer, ink on a second and color on a third below the line art, so you can fix the colors without damaging the outlines. There is no limit on the number of layers, and 16 blend modes, such as Multiply for shading or Screen for light effects, help you build up a painting. Lock a finished layer to protect it, hide one to compare, and merge or flatten when you are done. Undo goes back up to 60 steps.",
        },
        {
          h2: "Painting on a tablet, Chromebook or phone",
          p: "Everything runs in the browser, so Paint Studio works on school Chromebooks, iPads, Android tablets and phones as well as on computers. Pinch to zoom on a touch screen, and go up to 3200 % for detail work. Apple Pencil and other styluses give pressure-sensitive strokes where the browser supports them. It is simple enough for kids to doodle with and complete enough for adults to sketch and paint. Your work is autosaved in the browser, so an accidentally closed tab isn’t a disaster.",
        },
      ],
      faq: [
        {
          q: "Do I need to download or install anything?",
          a: "No. The painting app runs in your browser as soon as the page loads. If you like, you can install it as an app from the browser menu for quick access and offline use, but that is entirely optional.",
        },
        {
          q: "How do I save my painting?",
          a: "Use Save project in the File menu to keep a .paint file with all layers, so you can continue later. To share the picture, click Export and choose PNG, JPEG or WebP; you can also save a layered PSD. Unsaved work is autosaved in your browser too.",
        },
        {
          q: "Is it suitable for kids?",
          a: "Yes. There are no ads, no accounts and no chat or sharing features, so children can draw freely. The Brush, Fill and shapes are easy to understand, and Undo fixes any mistake. On a tablet, painting with a finger or stylus feels natural.",
        },
        {
          q: "Can I change the canvas size?",
          a: "Yes. Choose Canvas size… in the Image menu to make the canvas bigger or smaller, with an anchor that decides where your painting sits. You can also start a new document from the File menu with your own dimensions, up to 8000 × 8000 pixels.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "open-psd-online": {
      title: "Open PSD File Online – View & Edit Layers",
      description:
        "Open PSD files online without Photoshop. View and edit layers with names, opacity, blend modes and masks, then save as PNG, JPG or PSD. Free, no upload.",
      h1: "Open PSD files online",
      lead: "View and edit Photoshop files without Photoshop. Drop a .psd and its layers appear in the Layers panel, ready to edit, export as an image or save back as PSD.",
      card: "Open PSD",
      cardText: "View and edit Photoshop files with layers",
      steps: [
        "Drop your .psd file — its layers load into the Layers panel.",
        "Hide, reorder or edit layers, or simply check the design.",
        "Export as PNG, JPEG or WebP, or save back to a layered PSD.",
      ],
      sections: [
        {
          h2: "What is imported from a PSD",
          p: "Paint Studio reads 8-bit RGB and grayscale PSD files with their pixel layers, layer names, opacity, visibility, blend modes and layer masks. Layer groups are flattened into a plain list, so every layer is still there, just without the folder structure. Text, shape and smart-object layers come in as their rendered pixels: they look right, but the text can’t be retyped and vectors can’t be edited. Adjustment layers and layer effects such as drop shadows or strokes are not applied, so a design that relies on them may look different.",
        },
        {
          h2: "When layers can’t be read",
          p: "Some PSD files store their layers in ways Paint Studio can’t decode, for example ZIP-compressed layer data or 16- and 32-bit color depth. In that case the editor opens the flattened composite image instead, so you can still view, crop, convert or retouch the picture — just as a single layer. PSB (the large document format), CMYK and Lab files are not supported; convert them to 8-bit RGB in the original program first if you need to open them here.",
        },
        {
          h2: "Exporting and saving back to PSD",
          p: "To share a design with someone who doesn’t have Photoshop, export it as PNG for graphics and screenshots or as JPEG for photos. To hand a file back to a designer, save a layered PSD, which keeps your layers separate. Groups stay flattened and text remains pixels, though, so this round trip suits small fixes better than complex templates. A .paint project keeps everything editable for later sessions in Paint Studio.",
        },
      ],
      faq: [
        {
          q: "Can I open a PSD file without Photoshop?",
          a: "Yes. Drop the file on this page and it opens in your browser with its layers. Nothing is installed and the file isn’t uploaded, which matters for client work under NDA. It works on Windows, macOS, Linux and Chromebooks.",
        },
        {
          q: "Why does my PSD look different from Photoshop?",
          a: "Most likely the file uses adjustment layers or layer effects such as shadows, glows or strokes, which are not applied. Text and smart objects are shown as their saved pixels. If the layer data can’t be read, you see the flattened composite as a single layer instead.",
        },
        {
          q: "Can I edit the text in a PSD?",
          a: "Not as text. Text layers come in as rendered pixels, so you can move, hide or paint over them, but not retype the words. To change wording, hide the layer and add new text with the Text tool, choosing the closest of the six available fonts.",
        },
        {
          q: "Does it open PSB or CMYK files?",
          a: "No. PSB, CMYK and Lab files are not supported, and 16- or 32-bit files open only as the flattened composite. Save a copy as an 8-bit RGB PSD in the original application to open it here with its layers.",
        },
      ],
    },

    /* ------------------------------------------------------------------ */
    "retouch-photo": {
      title: "Retouch Photo Online – Remove Blemishes",
      description:
        "Retouch photos online: remove blemishes, dust and small objects with the Spot healing tool, then clone, heal, dodge and burn. Free, runs in your browser.",
      h1: "Retouch photos online",
      lead: "Remove a blemish, a dust spot or a stray wire by painting over it. Spot healing is ready when your photo opens, with the Healing brush, Clone stamp and Dodge / Burn close by for finer work.",
      card: "Retouch photo",
      cardText: "Remove blemishes, dust and small objects",
      steps: [
        "Drop your photo — the Spot healing tool is ready.",
        "Zoom in and paint over the blemish, dust spot or small object.",
        "Release to heal it, repeat where needed, then Export.",
      ],
      sections: [
        {
          h2: "Spot healing, Healing brush or Clone stamp?",
          p: "<strong>Spot healing</strong> is the quickest: paint over a spot and, when you release, it is filled from the surrounding area with matching texture. Use it for pimples, dust on a scan, sensor spots and small distractions. The <strong>Healing brush</strong> lets you choose the source yourself — Alt-click (Option-click on a Mac) a clean area, then paint — and blends the copied texture into the color and brightness of the destination, which suits skin. The <strong>Clone stamp</strong> copies the source exactly, best for patterns, edges and straight lines where blending would smear detail.",
        },
        {
          h2: "Tips for natural results",
          p: "Make the brush only slightly larger than the blemish and work in short strokes rather than one long one. Zoom in for precision, then zoom out often to judge the result at normal size. When removing a wire or a branch, follow it in several sections instead of covering it all at once. For skin, less is more: remove temporary blemishes but keep the texture and pores, and soften wrinkles rather than erasing them. Use Duplicate layer before you start, so you can hide the copy and compare.",
        },
        {
          h2: "Dodge, burn and the other retouch brushes",
          p: "Dodge / Burn lightens or darkens exactly where you paint, with a range setting for shadows, midtones or highlights — brighten eyes, tone down a shiny forehead, or add depth to a landscape. The Blur brush softens a busy background, Sharpen brings out eyes and textures, and Smudge pushes pixels around like wet paint. These tools shine on small areas; removing a large object from a complex scene is possible but takes patience, since there is no AI generative fill.",
        },
      ],
      faq: [
        {
          q: "Can I remove a person or a large object from a photo?",
          a: "On simple backgrounds like sky, grass or a plain wall, yes, using the Clone stamp and Healing brush in several passes. In complex scenes it takes time and patience, because Paint Studio has no AI generative fill that invents the missing background for you.",
        },
        {
          q: "What is the difference between the Healing brush and the Clone stamp?",
          a: "Both copy pixels from a source you set with Alt-click. The Clone stamp copies them exactly; the Healing brush copies the texture but adapts the color and brightness to the spot you paint on, so repairs on skin and gradients blend in more naturally.",
        },
        {
          q: "How do I remove dust spots from a scanned photo?",
          a: "Zoom in to around 100 % and work across the image section by section. Click or paint each spot with Spot healing, using a size just larger than the speck. For scratches, paint along them in short strokes.",
        },
        {
          q: "Are my portraits uploaded for retouching?",
          a: "No. All retouching happens inside your browser and the photo never leaves your device, so it is safe to edit portraits, family pictures and other personal images.",
        },
      ],
    },
  },
};
