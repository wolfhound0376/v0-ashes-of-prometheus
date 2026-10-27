#!/usr/bin/env python3
"""
Add the `lean` pose to a drow guard's sprite: the guard at the pen's bars, back to the pen, arms crossed.

    python scripts/sprites/add-lean-pose.py <slug> <frames-root> [--from N] [--fps 4]

<frames-root>/lean/north-west/frame_NNN.png: a PixelLab v3 custom animation ("leaning back lazily against a wall
behind him, arms crossed ..."), NORTH-WEST ONLY. That is the only way the pose is ever seen: the guard leans with his
back to the bars, facing out of the pen (tickGuardLean in scripts/velkynvelve-walk/template.html sets that facing), so
every row of the sheet carries the north-west frames rather than leaving seven rows empty.

Sam, 2026-10-27: "we will need the guards to sometimes come closer to the gate and lean lazily near it" / "draw him
behind the bars".

v3 frames come back on a bigger canvas than the character (176 / 172 px for a 128 px guard) with frame 0 the standing
reference, so: scaled so frame 0 stands as tall as idle's north-west row, frames from --from on kept (the settled lean;
the first frames are the arms coming up), the row moved as one block so the feet sit on idle's (add-sneak-poses.py's
sheet, for the same reasons), specks cleaned the labor way (the female's clip floats a little speech mark over her head).
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
_here = Path(__file__).parent


def _load(name: str, file: str):
    spec = importlib.util.spec_from_file_location(name, _here / file)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


labor = _load("labor", "add-labor-poses.py")
sneak = _load("sneak", "add-sneak-poses.py")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("frames_root")
    ap.add_argument("--from", dest="start", type=int, default=3)
    ap.add_argument("--fps", type=int, default=4)
    a = ap.parse_args()

    sprite_dir = ROOT / "public" / "sprites" / a.slug
    manifest = sprite_dir / "sprite.json"
    d = json.loads(manifest.read_text(), object_pairs_hook=collections.OrderedDict)
    cell = int(d["cell"][0])
    files = sorted((Path(a.frames_root) / "lean" / "north-west").glob("frame_*.png"))
    if len(files) < a.start + 2:
        raise SystemExit(f"only {len(files)} frames")
    fr = [labor.clean(Image.open(f)) for f in files]

    idle = np.asarray(Image.open(sprite_dir / "idle.png").convert("RGBA"))
    nw = labor.ROWS.index("north-west")
    y0, y1, _ = labor.legs_anchor(idle[nw * cell:(nw + 1) * cell, :cell])
    f0y0, f0y1, _ = labor.legs_anchor(np.asarray(fr[0]))
    scale = (y1 - y0 + 1) / (f0y1 - f0y0 + 1)
    keep = fr[a.start:]
    # a ping-pong of the settled frames, so the loop breathes instead of snapping back
    loop = keep + keep[-2:0:-1]
    rows = [(loop, scale)] * len(labor.ROWS)

    # place every row against idle's NORTH-WEST feet (all rows show the north-west frames)
    img = sneak.sheet(sprite_dir, cell, rows)
    # sneak.sheet anchors each row to that row's idle; re-anchor to the north-west row by copying it down
    row_nw = img.crop((0, nw * cell, img.width, (nw + 1) * cell))
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    for r in range(len(labor.ROWS)):
        out.paste(row_nw, (0, r * cell))
    out.save(sprite_dir / "lean.png", optimize=True)
    d["animations"]["lean"] = {"sheet": "lean.png", "frames": len(loop), "fps": a.fps, "loop": True}
    manifest.write_text(json.dumps(d, indent=2) + "\n")   # the guards' manifests are 2-space indented
    print(f"{a.slug}: lean.png {out.size}, {len(loop)} frames (from frame {a.start}, ping-pong), scale {scale:.2f}")


if __name__ == "__main__":
    main()
