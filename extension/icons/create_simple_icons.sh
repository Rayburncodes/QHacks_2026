#!/bin/bash
# Create simple colored square icons
# Requires ImageMagick or similar tool

for size in 16 48 128; do
    # Create a simple blue square with white 'B'
    convert -size ${size}x${size} xc:'#2962ff' \
            -gravity center \
            -pointsize $((size * 3 / 4)) \
            -fill white \
            -annotate +0+0 'B' \
            icon${size}.png 2>/dev/null || echo "ImageMagick not installed. Create ${size}x${size} PNG manually."
done
