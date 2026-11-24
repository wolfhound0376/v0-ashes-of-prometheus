#!/usr/bin/env python3
"""
Add the drawn `dodge` pose to a hero's sprite.

    python scripts/sprites/add-dodge-pose.py <slug> <frames-root> [--fps 14]

<frames-root> is a PixelLab character download's animation folder for the dodge, one folder per direction:
    <frames-root>/south/frame_000.png ... <frames-root>/south-west/frame_007.png
(the ZIP's <State>/animations/<Name>/ folder). Writes public/sprites/<slug>/dodge.png and adds `dodge` to sprite.json.

WHY (Sam, 2026-11-23: "some of the dodge effects look like the art just gets rotated 30 degrees. This is garbage; lets
make better." then "yes" to drawn dodges for the heroes). The heroes had no drawn dodge, so a miss on them was only the
code's lean (PR #1521). sparMiss in scripts/velkynvelve-walk/template.html already plays `dodge` for the sidestep and
the sway whenever the sheet exists, and adds no lean of its own over drawn art, so this needs no game code: only the
sheet, and 'dodge' in the hero list in scripts/velkynvelve-walk/build_walk.py.

HOW IT WAS DRAWN: PixelLab's posed skeleton (animate_character mode="skeleton-v3", move {"name": "dodge_side"},
8 frames), one 3D motion projected to all eight facings, 3 generations per direction. See the aop-pixel-animation skill.

Fitting: the frames come back on a larger canvas than the sprite (~176 px for a 128 hero), so each row is scaled ONCE,
from frame 0, to the height of the hero's own idle in that facing, then moved as a block, like add-sneak-poses.py:
horizontally by frame 0's leg midpoint (so the step to the side survives, instead of being re-centred away frame by
frame) and down to idle's feet by the lowest foot in the clip. Each frame is clipped to its own cell. Clean-up (specks,
the cyan glint) is add-labor-poses.py's.
"""
from __future__ import annotations

import argparse
import collections
import importlib.util
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("labor", Path(__file__).with_name("add-labor-poses.py"))
labor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(labor)
ROWS = labor.ROWS


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("frames_root")
    ap.add_argument("--fps", type=int, default=14)
    a = ap.parse_args()

    sprite_dir = ROOT / "public" / "sprites" / a.slug
    manifest = sprite_dir / "sprite.json"
    d = json.loads(manifest.read_text(), object_pairs_hook=collections.OrderedDict)
    cell = int(d["cell"][0])
    src = Path(a.frames_root)
    idle = np.asarray(Image.open(sprite_dir / "idle.png").convert("RGBA"))

    counts = {r: len(sorted((src / r).glob("frame_*.png"))) for r in ROWS}
    n = min(counts.values())
    if n < 4:
        raise SystemExit(f"too few frames: {counts}")

    out = Image.new("RGBA", (n * cell, len(ROWS) * cell), (0, 0, 0, 0))
    for r, direction in enumerate(ROWS):
        iy0, iy1, icx = labor.legs_anchor(idle[r * cell:(r + 1) * cell, 0:cell])
        files = sorted((src / direction).glob("frame_*.png"))[:n]
        fr = [labor.clean(Image.open(f)) for f in files]
        y0, y1, _ = labor.legs_anchor(np.asarray(fr[0]))
        scale = (iy1 - iy0 + 1) / (y1 - y0 + 1)                       # ONE scale for the whole row
        fr = [im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.NEAREST) for im in fr]
        anchors = [labor.legs_anchor(np.asarray(im)) for im in fr]
        dx = round(icx - anchors[0][2])                                 # frame 0 stands where idle stands
        dy = round(iy1 - max(an[1] for an in anchors))                  # the lowest foot of the clip on idle's floor
        for i, im in enumerate(fr):
            tile = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
            tile.paste(im, (dx, dy), im)                                # clipped at the cell
            out.alpha_composite(tile, (i * cell, r * cell))

    out.save(sprite_dir / "dodge.png")
    d["animations"]["dodge"] = {"sheet": "dodge.png", "frames": n, "fps": a.fps, "loop": False}
    raw = manifest.read_text()
    ind = len(raw.split("\n")[1]) - len(raw.split("\n")[1].lstrip()) or 2
    manifest.write_text(json.dumps(d, indent=ind) + ("\n" if raw.endswith("\n") else ""))
    print(f"{a.slug}: dodge.png {out.size}, {n} frames @ {a.fps}fps = {n / a.fps:.2f}s")


if __name__ == "__main__":
    main()
