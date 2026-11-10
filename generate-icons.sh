#!/bin/bash
#
# Regenerates every raster icon from the SVG sources.
#
#   icon.svg           rounded tile  → favicons (browser tabs)
#   icon-maskable.svg  full bleed    → PWA + Apple touch icon (the OS masks it)
#   og-image.svg       social card   → og-image.png
#
# Rendering goes through rsvg-convert: ImageMagick's built-in SVG renderer
# ignores linearGradient and would output a black square. ImageMagick (7's
# `magick`, or 6's `convert`/`identify`) only packs favicon.ico and reports
# the sizes at the end.

set -euo pipefail
cd "$(dirname "$0")"

install_hint() {
  echo "Install librsvg and ImageMagick with your package manager, e.g."
  echo "  macOS:          brew install librsvg imagemagick"
  echo "  Debian/Ubuntu:  sudo apt install librsvg2-bin imagemagick"
  echo "  Fedora:         sudo dnf install librsvg2-tools ImageMagick"
  echo "  Windows:        winget install ImageMagick.ImageMagick (rsvg-convert via MSYS2: pacman -S mingw-w64-x86_64-librsvg)"
}

if ! command -v rsvg-convert &>/dev/null; then
  echo "Missing rsvg-convert (librsvg)."
  install_hint
  exit 1
fi

# ImageMagick 7 ships `magick`; 6 only has the separate `convert`/`identify`
if command -v magick &>/dev/null; then
  im_convert=(magick)
  im_identify=(magick identify)
elif command -v convert &>/dev/null && command -v identify &>/dev/null; then
  im_convert=(convert)
  im_identify=(identify)
else
  echo "Missing ImageMagick (neither magick nor convert/identify found)."
  install_hint
  exit 1
fi

render() { # render <src.svg> <size> <out.png>
  rsvg-convert -w "$2" -h "$2" "$1" -o "$3"
}

echo "Generating icons…"

# Browser favicons — keep the rounded tile
render icon.svg 16 favicon-16x16.png
render icon.svg 32 favicon-32x32.png
render icon.svg 48 .favicon-48.png
"${im_convert[@]}" .favicon-48.png favicon-32x32.png favicon-16x16.png favicon.ico
rm -f .favicon-48.png
cp icon.svg favicon.svg

# Apple touch icon + PWA icons — full bleed so the platform mask fits
render icon-maskable.svg 180 apple-touch-icon.png
render icon-maskable.svg 192 icon-192x192.png
render icon-maskable.svg 512 icon-512x512.png

# Social card
rsvg-convert -w 1200 -h 630 og-image.svg -o og-image.png

echo "✓ Done:"
status=0
for f in favicon.svg favicon.ico favicon-16x16.png favicon-32x32.png \
  apple-touch-icon.png icon-192x192.png icon-512x512.png og-image.png; do
  if [[ $f == *.svg ]]; then
    size="vector"
  elif ! size=$("${im_identify[@]}" -format '%wx%h ' "$f" 2>&1); then
    echo "  $f: could not read it — $size" >&2
    status=1
    continue
  fi
  # favicon.ico holds several sizes; identify lists each of them
  printf '  %-24s %s\n' "$f" "${size% }"
done
exit "$status"
