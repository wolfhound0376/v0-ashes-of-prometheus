# =============================================================================
# CARD FRAME PALETTE RECUTS
#
# One painting, thirteen classes. This takes the frame that was painted for
# Kenta and rotates ONLY its violet magework onto each class's own hue, so a
# cleric stops wearing a sorcerer's card.
#
# Run:  python scripts/recut-card-frames.py
# Needs: pillow
#
# WHAT MOVES AND WHAT DOES NOT
#
# The frame has three colour families and only one of them belongs to the
# class:
#
#   gold ironwork   0-60 deg    the card itself. Universal. Never touched.
#   violet magework 185-330 deg the vines, finials, medallion ring, the
#                               nebula behind the class bar. THIS is the class.
#   everything else             the green active orb, the red heart, the amber
#                               inspiration bulb - all outside the violet band,
#                               so all safe by hue alone.
#
# The exception is the resource row, and it is the whole reason this script
# has a geometry section instead of being four lines of hue rotation. The
# BONUS ACTION gem is violet and the SPELL SLOT crystals are blue - both sit
# inside the class band, and both mean a RESOURCE, not a class. A bard whose
# spell slots came out green would be unreadable at the table. So the five
# chambers are masked out by position.
#
# The mask is the chambers only, not a full-width stripe. The outer border
# tracery runs down past them on both edges, and cutting a band through it
# leaves a seam where the vines change colour mid-stem.
# =============================================================================

import colorsys
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("pillow is missing:  pip install pillow --break-system-packages")

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# The master is a BUILD INPUT, not a runtime asset, and it lives outside
# public/ for one reason: it is also the sorcerer's output. Read and write the
# same path and the second run recolours an already-recoloured, already-
# downscaled file, and the palettes drift a little further every time anyone
# touches the script.
SRC = os.path.join(REPO, "scripts", "assets", "card-frame-master.webp")
OUT = os.path.join(REPO, "public", "ui-frames")

# The class band, in degrees. Wide enough for the whole violet-through-blue
# spread of the magework, tight enough to leave the gold alone.
BAND_LO, BAND_HI = 185.0, 330.0
# What the band reads as, so a rotation can be measured from somewhere.
BAND_PIVOT = 285.0
# Below this saturation a pixel is structure, not colour. Tinting it turns
# the panel's grain into confetti.
MIN_SAT = 0.15
MIN_LUM = 0.06

# The five resource chambers, as fractions of the card. Anything inside is a
# RESOURCE colour and is left exactly as painted.
CHAMBERS = (0.040, 0.655, 0.962, 0.885)  # left, top, right, bottom

# Saturation of the source magework, near enough. A class whose accent is
# muted (fighter's blue-grey, monk's cream) has to pull the vines down with
# it or it gets a fully saturated vine in a colour it never uses.
SOURCE_SAT = 0.62

# Width the frames actually ship at. The recolour runs on the full 1437 so no
# blending happens on already-resampled pixels, and only the SAVE is reduced.
#
# The card renders at 210 on the board and 300 at its largest, so 900 is three
# times the biggest use - retina covered twice over, and the browser is
# downscaling in every case, which is the direction that stays sharp. Shipping
# all thirteen at full size costs 3.9 MB in the repo and on every cold load,
# to serve detail no screen ever asks for.
SHIP_WIDTH = 900

# key -> accent, straight out of lib/class-frames.ts. Keep them in step.
ACCENTS = {
    "bard":      "#5c7ce0",
    "rogue":     "#3f7a4e",
    "cleric":    "#e0b53c",
    "barbarian": "#b4432a",
    "druid":     "#4f9a5c",
    "fighter":   "#9aa4b0",
    "monk":      "#d8cfae",
    "paladin":   "#f0dc8a",
    "ranger":    "#4e8a52",
    "wizard":    "#4fa8d8",
    "unaligned": "#a89468",
}

# Sorcerer and warlock are NOT in that list on purpose. The painting is
# Kenta's, and Kenta is the sorcerer - it is the card that was signed off.
# Warlock is where the art actually came from. Both keep the original violet
# and both point at the same file; recutting either would be recolouring a
# thing to look like itself.
KEEPS_ORIGINAL = ("sorcerer", "warlock")


def hue_and_sat(hex_color):
    r = int(hex_color[1:3], 16) / 255
    g = int(hex_color[3:5], 16) / 255
    b = int(hex_color[5:7], 16) / 255
    h, _, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s


def recut(src, target_hex):
    target_h, target_s = hue_and_sat(target_hex)
    rotation = target_h - BAND_PIVOT
    # Pull vine saturation toward the accent's own, but never all the way to
    # flat and never past a shade brighter than the original.
    sat_scale = max(0.35, min(1.25, target_s / SOURCE_SAT))

    im = src.copy()
    w, h = im.size
    px = im.load()
    x0, y0 = int(CHAMBERS[0] * w), int(CHAMBERS[1] * h)
    x1, y1 = int(CHAMBERS[2] * w), int(CHAMBERS[3] * h)

    moved = 0
    for y in range(h):
        row_is_chambers = y0 <= y <= y1
        for x in range(w):
            if row_is_chambers and x0 <= x <= x1:
                continue
            r, g, b, a = px[x, y]
            if a < 8:
                continue
            hh, ll, ss = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
            if ss < MIN_SAT or ll < MIN_LUM:
                continue
            deg = hh * 360
            if not (BAND_LO <= deg <= BAND_HI):
                continue
            new_deg = (deg + rotation) % 360
            new_s = max(0.0, min(1.0, ss * sat_scale))
            nr, ng, nb = colorsys.hls_to_rgb(new_deg / 360, ll, new_s)
            px[x, y] = (int(nr * 255 + 0.5), int(ng * 255 + 0.5), int(nb * 255 + 0.5), a)
            moved += 1
    return im, moved


def ship(im, key):
    """Downscale to SHIP_WIDTH and write. The recolour above ran at full size."""
    w = SHIP_WIDTH
    h = round(im.size[1] * w / im.size[0])
    dst = os.path.join(OUT, "card-frame-%s.webp" % key)
    im.resize((w, h), Image.LANCZOS).save(dst, "WEBP", quality=88, method=6)
    return os.path.getsize(dst) / 1024


def main():
    if not os.path.exists(SRC):
        sys.exit("missing source frame: " + SRC)
    src = Image.open(SRC).convert("RGBA")
    print("source", src.size, "-> ship width", SHIP_WIDTH)

    for key in KEEPS_ORIGINAL:
        print("%-10s kept original  %6.0f KB" % (key, ship(src, key)))

    for key, accent in ACCENTS.items():
        im, moved = recut(src, accent)
        print("%-10s %s  %7d px  %6.0f KB" % (key, accent, moved, ship(im, key)))


if __name__ == "__main__":
    main()
