#!/usr/bin/env python3
"""
Add the hidden poses to a hero's sprite: `sneak` (a crouched walk) and `crouch` (holding still, low).

    python scripts/sprites/add-sneak-poses.py <slug> <frames-root> [--fps 10] [--crouch-from N]

<frames-root> holds one folder per pose, each with PixelLab frames for all eight directions:

    <frames-root>/sneak/south/frame_000.png ... <frames-root>/crouch/north-west/frame_00N.png

  sneak   PixelLab's `crouched-walking` template on the hero's own character.
  crouch  PixelLab's `crouching` template. It sinks from standing into the crouch over 5 frames and only the last is
          fully down (figure height 118 -> 86 px on Fifi), so by default only that last frame goes in the sheet: a
          still hold. Playing the sink would make a hero who stops mid-sneak pop up to standing and sink again,
          because the sneak walk is already low. --crouch-from N keeps frames N.. instead.

Writes public/sprites/<slug>/{sneak,crouch}.png and adds both animations to sprite.json.

WHEN THEY PLAY (Sam, 2026-10-26: "sneaking poses (when successfully hidden) for all the players except Kingasaur"):
the Underwalk draws `sneak` in place of `walk` and `crouch` in place of `idle` while the hero is hidden — a mover in a
Sneak nobody has spotted, or a hero holding the `hidden` condition from Hide in a fight (hiddenNow() in
scripts/velkynvelve-walk/template.html). The five main players get them; Kingasaur keeps his walk (Sam's exclusion).

DO NOT rebuild a hero with build-sprite.py from a PixelLab download that includes the sneak clip: its STATE_PATTERNS
maps `crouched-walking` to `walk`, so the crouch would replace the ordinary walk. This script is the way in.

Scaling: template frames come back on the character's own canvas (128 for these heroes), so they are drawn 1:1 and
only re-anchored — the feet put where idle's feet are, by add-labor-poses.py's legs anchor. Measuring the height the
way the labor poses do would be wrong here: a crouch is SUPPOSED to be shorter, and scaling it up to the standing
height would make the hero grow when they hide. Clean-up (specks, the cyan glint) is the labor script's.
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


def frames(src: Path, pose: str, direction: str) -> list[Image.Image]:
    files = sorted((src / pose / direction).glob("frame_*.png"))
    if len(files) < 2:
        raise SystemExit(f"only {len(files)} frames in {src / pose / direction}")
    return [labor.clean(Image.open(f)) for f in files]


def sheet(sprite_dir: Path, cell: int, rows: list[tuple[list[Image.Image], float]]) -> Image.Image:
    """Like add-labor-poses.sheet, but ONE offset per row, not one per frame.

    The labor sheet re-centres every frame on its own legs. On a walk that is wrong twice over: a crouched stride
    spreads the legs, so the leg midpoint swings ~20px frame to frame and the body slides side to side while it
    sneaks (Samson east, measured), and a frame shoved that far spills into the next cell of the sheet. PixelLab
    already keeps the figure registered across a clip's frames, so the row is moved as a block: horizontally by the
    median leg midpoint, down to idle's feet by the lowest foot in the clip. Each frame is clipped to its own cell.
    """
    idle = np.asarray(Image.open(sprite_dir / "idle.png").convert("RGBA"))
    n = len(rows[0][0])
    out = Image.new("RGBA", (n * cell, len(ROWS) * cell), (0, 0, 0, 0))
    for r, (fr, scale) in enumerate(rows):
        _, ry1, rcx = labor.legs_anchor(idle[r * cell:(r + 1) * cell, 0:cell])
        fr = [im.resize((max(1, round(im.size[0] * scale)), max(1, round(im.size[1] * scale))), Image.NEAREST) for im in fr]
        anchors = [labor.legs_anchor(np.asarray(im)) for im in fr]
        dx = round(rcx - float(np.median([a[2] for a in anchors])))
        dy = round(ry1 - max(a[1] for a in anchors))
        for i, im in enumerate(fr):
            tile = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
            tile.paste(im, (dx, dy), im)          # onto an empty tile, so paste == composite; it clips at the cell
            out.alpha_composite(tile, (i * cell, r * cell))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("frames_root")
    ap.add_argument("--fps", type=int, default=10)
    ap.add_argument("--crouch-from", type=int, default=None,
                    help="first frame of the crouch clip to keep (default: the last frame only)")
    ap.add_argument("--crouch-fps", type=int, default=4)
    a = ap.parse_args()

    sprite_dir = ROOT / "public" / "sprites" / a.slug
    manifest = sprite_dir / "sprite.json"
    d = json.loads(manifest.read_text(), object_pairs_hook=collections.OrderedDict)
    cell = int(d["cell"][0])
    src = Path(a.frames_root)

    sneak, crouch = [], []
    for direction in ROWS:
        s = frames(src, "sneak", direction)
        sneak.append((s, cell / s[0].size[0]))
        c = frames(src, "crouch", direction)
        k = a.crouch_from if a.crouch_from is not None else len(c) - 1
        crouch.append((c[min(k, len(c) - 1):], cell / c[0].size[0]))

    # every row of a sheet must have the same frame count
    for name, rows in (("sneak", sneak), ("crouch", crouch)):
        n = min(len(r[0]) for r in rows)
        rows[:] = [(r[0][:n], r[1]) for r in rows]

    for name, rows, fps in (("sneak", sneak, a.fps), ("crouch", crouch, a.crouch_fps)):
        img = sheet(sprite_dir, cell, rows)
        img.save(sprite_dir / f"{name}.png", optimize=True)
        d["animations"][name] = {"sheet": f"{name}.png", "frames": len(rows[0][0]), "fps": fps, "loop": True}
        h = [int(np.ptp(np.nonzero(np.asarray(img)[r * cell:(r + 1) * cell, :cell, 3].max(1) > 24)[0])) for r in range(8)]
        print(f"{a.slug}: {name}.png {img.size}, {len(rows[0][0])} frames, figure height by row {h}")
    manifest.write_text(json.dumps(d, indent=1) + "\n")


if __name__ == "__main__":
    main()
