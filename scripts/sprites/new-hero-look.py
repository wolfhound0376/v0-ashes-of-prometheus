#!/usr/bin/env python3
"""
Give a hero a new look on the map, and keep the old one for the pen and Hard Labor.

    python scripts/sprites/new-hero-look.py <slug> <animations-dir> --idle breathing-idle --walk walk-v2 --sneak sneak-v2

<animations-dir> is the `animations` folder of a PixelLab character download (api.pixellab.ai/mcp/characters/<id>/download,
unzipped: <state>/animations/<group>/<direction>/frame_<nnn>.png). Name the groups to use; anything else in the download
is ignored (Lynkes's had older `walk` and `sneak` groups next to the v2 ones, Sam 2026-10-29: "ignore the older ones").

What it does:
  1. Moves public/sprites/<slug>/ to public/sprites/<slug>-prisoner/ (once; skipped when that folder already exists).
     That is the PRISON GARB: the map dresses the hero in it inside the slave pen and on a Hard Labor detail
     (dressHeroes in scripts/velkynvelve-walk/template.html; build_walk.py bakes the pair). The labor poses
     (scrub/heave/carry) and the old crouch stay there with the rags they were drawn in.
  2. Writes public/sprites/<slug>/ fresh: idle, walk and (optional) sneak sheets plus sprite.json.

ONE CELL FOR EVERY SHEET. PixelLab returns the idle on the character's own canvas (128) but the v2 walk and sneak on a
bigger one (176): the same figure at the same scale, with more room around it for the stride. sprite.json has one
`cell` and one `pivot` for all sheets, so everything goes onto the biggest canvas. Cropping the walk down instead would
cut a crouched stride off (Lynkes's sneak reaches x=10..143 of 176). Idle is placed in the middle of the big cell;
walk and sneak are then moved, one offset per ROW (per facing), so their feet stand where idle's feet stand in that
row: horizontally by the median leg midpoint, vertically by the lowest foot in the clip (add-sneak-poses.py's rule; a
per-frame offset would slide the body side to side as the legs spread). A frame never spills into its neighbour: each
is pasted onto its own empty tile, which clips at the cell edge, and the script reports any row that had to clip.

SIZE. The hero keeps the height they stood at in the old look, so they do not grow or shrink stepping out of the pen:
ppu is set so the new idle's figure (south row, median of its frames) is as many feet tall as the old idle's figure was
at the old ppu. Change his height with --feet (sets ppu = figure_px * 5 / feet, the sprite height rule in AGENTS.md).
Clean-up (specks, the cyan glint) is add-labor-poses.py's.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("labor", Path(__file__).with_name("add-labor-poses.py"))
labor = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(labor)
ROWS = labor.ROWS
PLAYBACK = {"idle": (5, True), "walk": (10, True), "sneak": (10, True)}


def clip(src: Path, group: str, direction: str) -> list[Image.Image]:
    files = sorted((src / group / direction).glob("frame_*.png"))
    if len(files) < 2:
        raise SystemExit(f"only {len(files)} frames in {src / group / direction}")
    return [labor.clean(Image.open(f)) for f in files]


def figure_height(a: np.ndarray) -> int:
    y0, y1, _ = labor.legs_anchor(a)
    return y1 - y0 + 1


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("animations_dir")
    ap.add_argument("--idle", required=True)
    ap.add_argument("--walk", required=True)
    ap.add_argument("--sneak")
    ap.add_argument("--name", help="display name (default: the old sprite's)")
    ap.add_argument("--feet", type=float, help="height in feet (default: keep the old look's height)")
    a = ap.parse_args()

    sprites = ROOT / "public" / "sprites"
    here, rags = sprites / a.slug, sprites / f"{a.slug}-prisoner"
    if not rags.exists():
        shutil.move(str(here), str(rags))
        print(f"moved {here.relative_to(ROOT)} -> {rags.relative_to(ROOT)}")
    old = json.loads((rags / "sprite.json").read_text())
    ocell = int(old["cell"][1])
    old_idle = np.asarray(Image.open(rags / "idle.png").convert("RGBA"))
    old_feet = np.median([figure_height(old_idle[0:ocell, f * ocell:(f + 1) * ocell])
                          for f in range(old["animations"]["idle"]["frames"])]) * 5 / old["ppu"]

    src = Path(a.animations_dir)
    groups = {"idle": a.idle, "walk": a.walk, **({"sneak": a.sneak} if a.sneak else {})}
    clips = {state: [clip(src, g, d) for d in ROWS] for state, g in groups.items()}
    for state, rows in clips.items():                    # every row of a sheet must have the same frame count
        n = min(len(r) for r in rows)
        clips[state] = [r[:n] for r in rows]
    cell = max(im.size[0] for rows in clips.values() for r in rows for im in r)

    here.mkdir(parents=True, exist_ok=True)
    anchors = []                                         # per row: idle's feet (lowest foot, leg midpoint) in the cell
    manifest = {"version": 1, "name": a.name or old.get("name", a.slug), "cell": [cell, cell], "pivot": [cell // 2, cell - 2],
                "ppu": 0, "animations": {}}
    for state, rows in clips.items():
        n = len(rows[0])
        out = Image.new("RGBA", (n * cell, len(ROWS) * cell), (0, 0, 0, 0))
        clipped = []
        for r, fr in enumerate(rows):
            if state == "idle":                          # centred in the big cell
                dx, dy = (cell - fr[0].size[0]) // 2, (cell - fr[0].size[1]) // 2
            else:
                ry1, rcx = anchors[r]
                fa = [labor.legs_anchor(np.asarray(im)) for im in fr]
                dx = round(rcx - float(np.median([x[2] for x in fa])))
                dy = round(ry1 - max(x[1] for x in fa))
            for i, im in enumerate(fr):
                al = np.asarray(im)[..., 3]
                ys, xs = np.nonzero(al > 0)
                if xs.min() + dx < 0 or xs.max() + dx >= cell or ys.min() + dy < 0 or ys.max() + dy >= cell:
                    clipped.append(f"{ROWS[r]}#{i}")
                tile = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
                tile.paste(im, (dx, dy), im)
                out.alpha_composite(tile, (i * cell, r * cell))
            if state == "idle":
                cut = np.asarray(out)[r * cell:(r + 1) * cell]
                feet = [labor.legs_anchor(cut[:, i * cell:(i + 1) * cell]) for i in range(n)]
                anchors.append((max(f[1] for f in feet), float(np.median([f[2] for f in feet]))))
        out.save(here / f"{state}.png", optimize=True)
        fps, loop = PLAYBACK[state]
        manifest["animations"][state] = {"sheet": f"{state}.png", "frames": n, "fps": fps, "loop": loop}
        arr = np.asarray(out)
        feet = [labor.legs_anchor(arr[r * cell:(r + 1) * cell, 0:cell])[1] for r in range(len(ROWS))]
        print(f"{a.slug}: {state}.png {out.size}, {n} frames, feet (frame 0) by row {feet}"
              + (f", CLIPPED {clipped}" if clipped else ""))

    idle = np.asarray(Image.open(here / "idle.png").convert("RGBA"))
    fig = float(np.median([figure_height(idle[0:cell, f * cell:(f + 1) * cell]) for f in range(manifest["animations"]["idle"]["frames"])]))
    feet = a.feet or old_feet
    manifest["ppu"] = round(fig * 5 / feet)
    manifest["pivot"] = [cell // 2, int(np.median([y for y, _ in anchors])) + 1]
    (here / "sprite.json").write_text(json.dumps(manifest, indent=1) + "\n")
    print(f"{a.slug}: figure {fig:.0f}px at {feet:.2f} ft -> ppu {manifest['ppu']}, pivot {manifest['pivot']}")


if __name__ == "__main__":
    main()
