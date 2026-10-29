#!/usr/bin/env python3
"""
Add the `shoot` pose — hand crossbow up, loose, recoil, lowered — to an existing battle sprite.

    python scripts/sprites/add-shoot-pose.py <slug> <frames-dir> [--fps 12] [--hit 0.55]

<frames-dir> holds PixelLab v3 frames named <direction>_<n>.png for all eight
directions. Writes public/sprites/<slug>/shoot.png and adds the animation to
sprite.json, with `hit` = the fraction of the clip where the bolt leaves the
crossbow (playOnce in the walk reads it; the bolt flies from that frame).

WHY THIS POSE EXISTS (Sam, 2026-10-29, "go" on the drow audit). No sprite had a
shoot sheet, so strike() fell back to a drow standing in its idle while a bolt
appeared from nowhere: every gate volley, patrol and escort shot. strike()
already plays "shoot" when the sheet exists, so this needs no game code.

The scaling and anchoring are add-ward-pose.py's, unchanged: one scale per
row from frame 0, the x-centre from the legs, rows in the sheet's order.
"""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
# lib/sprite-token.ts SPRITE_DIRECTIONS — the order the renderer reads rows in.
ROWS = ["south", "south-east", "east", "north-east",
        "north", "north-west", "west", "south-west"]


def legs_anchor(a: np.ndarray) -> tuple[int, int, float]:
    """(top y, bottom y, x-centre of the lower third) of the drawn figure."""
    al = a[..., 3]
    ys, xs = np.nonzero(al > 24)
    if not len(ys):
        raise SystemExit("a frame is empty")
    y0, y1 = int(ys.min()), int(ys.max())
    lo = y1 - int((y1 - y0) * 0.33)
    legs = np.nonzero(al[lo:y1 + 1].max(axis=0) > 24)[0]
    return y0, y1, float((legs.min() + legs.max()) / 2)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("frames_dir")
    ap.add_argument("--fps", type=int, default=12)
    ap.add_argument("--hit", type=float, default=0.55)
    a = ap.parse_args()

    sprite_dir = ROOT / "public" / "sprites" / a.slug
    manifest = sprite_dir / "sprite.json"
    d = json.loads(manifest.read_text(), object_pairs_hook=collections.OrderedDict)
    cell = int(d["cell"][0])
    src = Path(a.frames_dir)

    n = len(sorted(src.glob("south_*.png")))
    if n < 4:
        raise SystemExit(f"only {n} south frames in {src}")

    # The TARGET is this character's own idle, so the ward matches every other
    # sheet it will be cut between.
    idle = np.asarray(Image.open(sprite_dir / "idle.png").convert("RGBA"))[0:cell, 0:cell]
    ry0, ry1, rcx = legs_anchor(idle)
    target_h, feet = ry1 - ry0 + 1, ry1

    out = Image.new("RGBA", (n * cell, len(ROWS) * cell), (0, 0, 0, 0))
    for r, direction in enumerate(ROWS):
        f0 = np.asarray(Image.open(src / f"{direction}_0.png").convert("RGBA"))
        y0, y1, _ = legs_anchor(f0)
        scale = target_h / (y1 - y0 + 1)          # ONE scale for the whole row
        for i in range(n):
            im = Image.open(src / f"{direction}_{i}.png").convert("RGBA")
            w, h = im.size
            im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))),
                           Image.NEAREST)        # nearest everywhere: pixel art
            _, fy1, fcx = legs_anchor(np.asarray(im))
            out.alpha_composite(im, (i * cell + round(rcx - fcx),
                                     r * cell + round(feet - fy1)))

    out.save(sprite_dir / "shoot.png")
    d["animations"]["shoot"] = {"sheet": "shoot.png", "frames": n,
                                "fps": a.fps, "loop": False, "hit": a.hit}
    manifest.write_text(json.dumps(d, indent=2) + "\n")
    print(f"{a.slug}: shoot.png {out.size}, {n} frames @ {a.fps}fps "
          f"= {n / a.fps:.2f}s, figure {target_h}px to match idle")


if __name__ == "__main__":
    main()
