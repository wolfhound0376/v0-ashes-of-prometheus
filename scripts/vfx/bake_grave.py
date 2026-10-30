#!/usr/bin/env python3
"""
Bake the hero grave sprite for Ashes of Prometheus.

Sam, 2026-10-30: "When your last character dies you get the RIP tombstone with
a mound in front of it. Then you cut to the Game Over screen."

ONE SHEET, SIX FRAMES, PLAYED ONCE AND THEN HELD
================================================

A hero dies, and a grave pushes up out of the floor where they fell. The sheet
is the push: cracked ground, the mound swelling, the stone rising behind it,
a half-pixel of overshoot as it seats, and then frame 5 — the resting frame,
which the board holds for the rest of the session. The map plays this the way
it already plays `crisp` and `acidMelt`: a SEQ of frame indices against age,
clamped to the last one.

THREE THINGS DRIVE THE DESIGN
-----------------------------

1. IT IS READ IN CAVE GLOOM, NOT DAYLIGHT. The Underwalk is lit by fungus and
   torches. A mid-grey stone disappears into a mid-grey floor, so the stone
   carries a cool rim light down its left edge and a hard black outline all
   the way round — the same trick the walk's other props use to stay legible
   against painted plates.

2. THE MOUND SITS IN FRONT, NOT UNDER. Sam asked for the mound in front of the
   stone, and that is also what sells the depth: the mound's top edge overlaps
   the stone's base, so the stone reads as standing behind freshly turned
   earth rather than floating on top of a brown smear.

3. NOTHING MOVES IN THE RESTING FRAME. A grave that shimmers or pulses pulls
   the eye for the rest of the session, and there may be five of them on the
   board by the time the party wipes. Frame 5 is deliberately flat and still.

Pixel art: drawn at 48x48 logical pixels per frame with no antialiasing, then
nearest-upscaled 2x so the webp has clean square pixels at the size the board
draws it. Writes public/vfx/lab/grave.webp (the LAB_DIR the map's labImg()
reads from).
"""

import os
from PIL import Image, ImageDraw

F = 48                    # logical pixels per frame
FRAMES = 6                # the push, and the last one is held for the rest of the session
UP = 2                    # nearest upscale, so the webp has hard square pixels
GROUND = F - 1            # the floor line: the last row, so the frame bottom IS the ground

OUT = os.path.join(os.path.dirname(__file__), "..", "..",
                   "public", "vfx", "lab", "grave.webp")

# ── palette ──────────────────────────────────────────────────────────────────
# Cool stone against warm earth: the two must not sit at the same temperature
# or the mound stops reading as a separate object in the gloom.
OUTLINE = (20, 21, 26, 255)
STONE_LIT = (150, 157, 172, 255)
STONE_MID = (104, 110, 124, 255)
STONE_DARK = (60, 64, 75, 255)
CARVE = (42, 45, 54, 255)      # the engraving, darker than the darkest face
DIRT_LIT = (126, 94, 64, 255)
DIRT_MID = (92, 68, 46, 255)
DIRT_DARK = (58, 42, 28, 255)
DUST = (138, 118, 96, 255)

STONE_W, STONE_H = 19, 23      # the slab, arch included

# A 3x5 face for the three letters we need. Anything smaller than this stops
# being readable once the board scales it down on a wide shot.
GLYPH = {
    "R": ["111", "101", "111", "110", "101"],
    "I": ["111", "010", "010", "010", "111"],
    "P": ["111", "101", "111", "100", "100"],
}


def px(d, x, y, col):
    """One logical pixel. ImageDraw.point, named so the intent is obvious."""
    d.point((x, y), fill=col)


def rect(d, x0, y0, x1, y1, col):
    d.rectangle([x0, y0, x1, y1], fill=col)


def draw_stone(d, cx, top, reveal, tilt=0):
    """
    The slab, drawn from its top down, clipped to `reveal` pixels of height.

    While it is rising, the earth hides everything below the mound line, so we
    simply do not draw past it — cheaper than a mask and it keeps every edge on
    the pixel grid, which a rotate or a scale would not.
    """
    if reveal <= 0:
        return
    half = STONE_W // 2
    for row in range(min(reveal, STONE_H)):
        y = top + row
        if y > GROUND:
            break
        # the arch: the top four rows pull in, so the slab has a rounded head
        inset = [3, 1, 0, 0][row] if row < 4 else 0
        x0 = cx - half + inset + tilt
        x1 = cx + half - inset + tilt
        rect(d, x0, y, x1, y, STONE_MID)
        px(d, x0, y, STONE_LIT)          # rim light down the left edge
        px(d, x1, y, STONE_DARK)         # the shaded right edge
    # hard outline, so the stone survives a busy painted plate behind it
    for row in range(min(reveal, STONE_H)):
        y = top + row
        if y > GROUND:
            break
        inset = [3, 1, 0, 0][row] if row < 4 else 0
        px(d, cx - half + inset - 1 + tilt, y, OUTLINE)
        px(d, cx + half - inset + 1 + tilt, y, OUTLINE)
    if reveal >= 1:
        y = top
        inset = 3
        rect(d, cx - half + inset + tilt, y - 1, cx + half - inset + tilt, y - 1, OUTLINE)


def draw_carving(d, cx, top, tilt=0):
    """R I P across the stone's face, carved one shade darker than its shadow."""
    word = "RIP"
    w = len(word) * 3 + (len(word) - 1)      # 3px glyphs, 1px gaps
    x = cx - w // 2 + tilt
    y = top + 8
    for ch in word:
        for ry, row in enumerate(GLYPH[ch]):
            for rx, bit in enumerate(row):
                if bit == "1":
                    px(d, x + rx, y + ry, CARVE)
        x += 4


def draw_mound(d, cx, w, h):
    """
    Freshly turned earth, in front of the stone's base.

    Built row by row from the ground up rather than as an ellipse: an ellipse
    at this size antialiases its own edge even with no smoothing asked for,
    and one soft pixel on a 48px sprite is a visible grey halo on the board.
    """
    if h <= 0:
        return
    for row in range(h):
        y = GROUND - row
        k = row / max(1, h - 1) if h > 1 else 1.0
        half = max(1, int(round(w / 2 * (1 - k * k * 0.72))))
        col = DIRT_MID if row < h - 1 else DIRT_LIT
        rect(d, cx - half, y, cx + half, y, col)
        px(d, cx - half, y, DIRT_DARK)
        px(d, cx + half, y, DIRT_DARK)
    # the clods that make it read as turned over rather than poured
    for dx, dy in ((-4, 1), (3, 2), (-1, 3), (5, 1)):
        x, y = cx + dx, GROUND - min(h - 1, max(0, dy))
        if h > dy:
            px(d, x, y, DIRT_LIT)


def draw_crack(d, cx):
    """Frame 0: the floor gives before anything comes up through it."""
    for dx in (-5, -3, -1, 0, 2, 4, 6):
        px(d, cx + dx, GROUND, DIRT_DARK)
    px(d, cx - 2, GROUND - 1, DIRT_DARK)
    px(d, cx + 3, GROUND - 1, DIRT_DARK)


def draw_dust(d, cx, spread, rows):
    """Specks kicked up while the earth moves. Absent from the resting frame."""
    for i, (dx, dy) in enumerate(((-7, 2), (6, 3), (-4, 5), (8, 1), (2, 6))):
        if i >= rows:
            break
        px(d, cx + int(dx * spread), GROUND - dy, DUST)


def frame(i):
    """One frame of the push. Frame 5 is the one the board holds forever."""
    im = Image.new("RGBA", (F, F), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = F // 2

    if i == 0:
        draw_crack(d, cx)
        draw_dust(d, cx, 0.6, 2)
    elif i == 1:
        draw_mound(d, cx, 17, 4)
        draw_dust(d, cx, 0.8, 3)
    elif i == 2:
        draw_stone(d, cx, GROUND - 6, 6)
        draw_mound(d, cx, 22, 6)
        draw_dust(d, cx, 1.0, 5)
    elif i == 3:
        draw_stone(d, cx, GROUND - 14, 14)
        draw_mound(d, cx, 25, 7)
        draw_dust(d, cx, 1.0, 4)
    elif i == 4:
        # a pixel of overshoot and a pixel of lean, so it seats rather than stops
        draw_stone(d, cx, GROUND - STONE_H - 1, STONE_H + 1, tilt=1)
        draw_carving(d, cx, GROUND - STONE_H - 1, tilt=1)
        draw_mound(d, cx, 27, 8)
        draw_dust(d, cx, 1.1, 3)
    else:
        draw_stone(d, cx, GROUND - STONE_H, STONE_H)
        draw_carving(d, cx, GROUND - STONE_H)
        draw_mound(d, cx, 27, 8)
        # no dust: the resting frame does not move
    return im


# Every frame is drawn in a 48x48 box but nothing lives above the stone's head, so the top twenty rows are empty. We
# crop them off: a frame whose height is mostly air makes the renderer's size factor meaningless to read (you would be
# writing labH(a) * .9 to get a stone half a hero tall). Cropped, the frame IS roughly the grave.
KEEP_H = 28


def main():
    sheet = Image.new("RGBA", (F * FRAMES, F), (0, 0, 0, 0))
    for i in range(FRAMES):
        sheet.paste(frame(i), (i * F, 0))
    sheet = sheet.crop((0, F - KEEP_H, F * FRAMES, F))
    sheet = sheet.resize((F * FRAMES * UP, KEEP_H * UP), Image.NEAREST)
    out = os.path.abspath(OUT)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sheet.save(out, "WEBP", lossless=True)
    print(f"wrote {out}  {sheet.width}x{sheet.height}  {FRAMES} frames")


if __name__ == "__main__":
    main()
