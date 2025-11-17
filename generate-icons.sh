#!/bin/bash

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo "ImageMagick is not installed. Installing via Homebrew..."
    if ! command -v brew &> /dev/null; then
        echo "Homebrew is not installed. Please install Homebrew first:"
        echo '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
        exit 1
    fi
    brew install imagemagick
fi

echo "Generating PNG icons from SVG..."

# Generate favicons
magick -background none icon.svg -resize 16x16 favicon-16x16.png
magick -background none icon.svg -resize 32x32 favicon-32x32.png
magick -background none icon.svg -resize 48x48 -gravity center -extent 48x48 favicon.ico

# Generate Apple touch icon
magick -background none icon.svg -resize 180x180 apple-touch-icon.png

# Generate PWA icons
magick -background none icon.svg -resize 192x192 icon-192x192.png
magick -background none icon.svg -resize 512x512 icon-512x512.png

# Generate OG image (1200x630)
magick -size 1200x630 xc:"#667eea" \
    \( -size 250x250 xc:none -fill white -draw "circle 125,125 125,15" \) -gravity center -geometry +0-50 -composite \
    -pointsize 60 -fill white -gravity north -annotate +0+435 "Paint - Drawing App" \
    og-image.png

echo "✓ All icons generated successfully!"
echo ""
echo "Generated files:"
echo "  - favicon-16x16.png"
echo "  - favicon-32x32.png"
echo "  - favicon.ico"
echo "  - apple-touch-icon.png"
echo "  - icon-192x192.png"
echo "  - icon-512x512.png"
echo "  - og-image.png"
