#!/bin/bash
#
# Regenerates every raster icon from the SVG sources.
#
#   icon.svg           rounded tile  → favicons (browser tabs)
#   icon-maskable.svg  full bleed    → PWA + Apple touch icon (the OS masks it)
#   og-image.svg       social card   → og-image.png
#
# Rendering goes through rsvg-convert: ImageMagick's built-in SVG renderer
# ignores linearGradient and would output a black square.

set -euo pipefail
cd "$(dirname "$0")"

for tool in rsvg-convert magick; do
  if ! command -v "$tool" &>/dev/null; then
    echo "Missing $tool. Install both with:"
    echo "  brew install librsvg imagemagick"
    exit 1
  fi
done

render() { # render <src.svg> <size> <out.png>
  rsvg-convert -w "$2" -h "$2" "$1" -o "$3"
}

echo "Generating icons…"

# Browser favicons — keep the rounded tile
render icon.svg 16 favicon-16x16.png
render icon.svg 32 favicon-32x32.png
render icon.svg 48 .favicon-48.png
magick .favicon-48.png favicon-32x32.png favicon-16x16.png favicon.ico
rm -f .favicon-48.png
cp icon.svg favicon.svg

# Apple touch icon + PWA icons — full bleed so the platform mask fits
render icon-maskable.svg 180 apple-touch-icon.png
render icon-maskable.svg 192 icon-192x192.png
render icon-maskable.svg 512 icon-512x512.png

# Social card
rsvg-convert -w 1200 -h 630 og-image.svg -o og-image.png

echo "✓ Done:"
for f in favicon.svg favicon.ico favicon-16x16.png favicon-32x32.png \
  apple-touch-icon.png icon-192x192.png icon-512x512.png og-image.png; do
  printf '  %-24s %s\n' "$f" "$(identify -format '%wx%h' "$f" 2>/dev/null || echo vector)"
done
