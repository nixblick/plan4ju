#!/usr/bin/env python3
"""Outline the wordmark "plan4ju" (Outfit 700, the 4 in terracotta) to SVG paths.

Outlined so the SVG renders the same everywhere (no font needed). Usage:
  python3 scripts/wordmark.py assets/fonts/Outfit-Variable.ttf > assets/wortmarke.svg
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

INK, BRAND = "#2B2522", "#C65D3B"
TEXT, SIZE, TRACK = "plan4ju", 100, -1.5  # font size in px, letter spacing in px (-0.5 at 34 px)

font = instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 700})
upm = font["head"].unitsPerEm
cmap, glyphs, hmtx = font.getBestCmap(), font.getGlyphSet(), font["hmtx"]
scale = SIZE / upm
ascent = font["hhea"].ascent * scale
x, parts = 0.0, []
bounds = BoundsPen(glyphs)
for ch in TEXT:
    name = cmap[ord(ch)]
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, ascent)))
    glyphs[name].draw(TransformPen(bounds, (scale, 0, 0, -scale, x, ascent)))
    parts.append((ch, pen.getCommands()))
    x += hmtx[name][0] * scale + TRACK
# Crop to the ink (plus 2 px), so the wordmark aligns with the logo without guesswork.
x0, y0, x1, y1 = (round(v) for v in bounds.bounds)
x0, y0, w, h = x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4
print(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0} {y0} {w} {h}" width="{w}" height="{h}" role="img" aria-label="plan4ju">')
for ch, d in parts:
    print(f'<path fill="{BRAND if ch == "4" else INK}" d="{d}"/>')
print("</svg>")
