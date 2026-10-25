#!/usr/bin/env python3
"""
build-creature-sheets.py — a PixelLab character -> the cave engine's creature sheets.

The first-person cave (public/cave-pov/pov.js spriteFrame) draws a creature from one PNG per state, frames left to right,
one ROW PER FACING. The row order is the hook horror's, measured against its PixelLab rotations (2026-10-25):

    row 0 south-east · 1 east · 2 north-east · 3 north · 4 north-west · 5 west · 6 south-west · 7 south

The idle sheet is the 8 rotations (one frame each). Walk / attack / dodge are PixelLab animations; a state with no
animation is simply not written, and the engine falls back to the walk (pov.js: S[st]||S.walk||S.idle).

Usage:  python3 scripts/cave/build-creature-sheets.py spec.json public/cave-pov/assets
spec.json: {"key": "gnoll", "cell": 128,
            "rotations": {"south": url, ...8},
            "anims": {"walk": {"south": [url, url, ...], ...8}, "attack": {...}}}
URLs are PixelLab's public backblaze links (get_character prints them). Frames larger than `cell` are centred and cropped
(template clips keep the character's canvas, so normally nothing is cut).
"""
import io, json, sys, urllib.request
from PIL import Image

ROWS = ["south-east", "east", "north-east", "north", "north-west", "west", "south-west", "south"]

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (aop build-creature-sheets)"})  # bare urllib is refused (403)
    with urllib.request.urlopen(req, timeout=60) as r:
        return Image.open(io.BytesIO(r.read())).convert("RGBA")

def fit(im, cell):
    if im.size == (cell, cell):
        return im
    out = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    out.alpha_composite(im, ((cell - im.width) // 2, (cell - im.height) // 2)) if im.width <= cell and im.height <= cell else \
        out.alpha_composite(im.crop(((im.width - cell) // 2, (im.height - cell) // 2, (im.width + cell) // 2, (im.height + cell) // 2)))
    return out

def sheet(frames_by_dir, cell):
    n = max(len(frames_by_dir[d]) for d in ROWS)
    out = Image.new("RGBA", (n * cell, 8 * cell), (0, 0, 0, 0))
    for r, d in enumerate(ROWS):
        fr = frames_by_dir[d]
        for i in range(n):
            out.alpha_composite(fit(fr[i % len(fr)], cell), (i * cell, r * cell))
    return out

def main():
    spec = json.load(open(sys.argv[1])); dest = sys.argv[2]; cell = spec.get("cell", 128); key = spec["key"]
    missing = [d for d in ROWS if d not in spec["rotations"]]
    assert not missing, f"rotations missing {missing}"
    idle = sheet({d: [fetch(spec["rotations"][d])] for d in ROWS}, cell)
    idle.save(f"{dest}/sprites-{key}-idle.png", optimize=True); print("idle", idle.size)
    for state, dirs in spec.get("anims", {}).items():
        missing = [d for d in ROWS if d not in dirs]
        assert not missing, f"{state}: directions missing {missing}"
        im = sheet({d: [fetch(u) for u in dirs[d]] for d in ROWS}, cell)
        im.save(f"{dest}/sprites-{key}-{state}.png", optimize=True); print(state, im.size)

if __name__ == "__main__":
    main()
