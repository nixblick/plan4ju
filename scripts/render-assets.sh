#!/usr/bin/env bash
# Renders all logo/icon PNGs from the SVG sources in assets/ and copies the web files to public/.
# Reproducible: needs rsvg-convert (librsvg) and ImageMagick `convert`. Run from the repo root:
#   scripts/render-assets.sh
# The wordmark is outlined from the Outfit font beforehand (scripts/wordmark.py), so no font is needed here.
set -euo pipefail
cd "$(dirname "$0")/.."
A=assets
P=public
BRAND='#C65D3B'

png() { rsvg-convert -w "$2" -h "$2" "$1" -o "$3"; }

# PWA icons ("any"): the rounded logo with the week dots
png "$A/logo.svg" 192 "$A/icon-192.png"
png "$A/logo.svg" 512 "$A/icon-512.png"
# Maskable: full-bleed, house inside the safe zone
png "$A/src/maskable.svg" 512 "$A/icon-maskable-512.png"
# Apple home screen: 180 px, full-bleed, no transparency, no rounding (iOS rounds itself)
rsvg-convert -w 180 -h 180 "$A/src/vollflaechig.svg" \
  | convert - -background "$BRAND" -flatten -alpha off "PNG24:$A/apple-touch-icon.png"
# Favicon: small variant without dots
for s in 16 32 48; do png "$A/logo-klein.svg" "$s" "$A/.fav-$s.png"; done
convert "$A/.fav-16.png" "$A/.fav-32.png" "$A/.fav-48.png" "$A/favicon.ico"
cp "$A/.fav-32.png" "$A/favicon-32.png"
rm -f "$A"/.fav-*.png
cp "$A/logo-klein.svg" "$A/icon.svg"
# Social preview 1280x640 (also the GitHub social preview), and a README picture of the hero
rsvg-convert -w 1280 -h 640 "$A/og-image.svg" | convert - -alpha off "PNG24:$A/og-image.png"
rsvg-convert -w 1440 "$A/illustrationen/hero.svg" -o "$A/hero.png"

# Web copies
mkdir -p "$P/illustrationen"
cp "$A"/{logo.svg,logo-klein.svg,wortmarke.svg,icon.svg,favicon.ico,apple-touch-icon.png,icon-192.png,icon-512.png,icon-maskable-512.png,og-image.png} "$P/"
cp "$A"/illustrationen/*.svg "$P/illustrationen/"
echo "ok"
