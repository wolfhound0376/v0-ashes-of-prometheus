#!/usr/bin/env python3
"""
Add 8-facing moves (attack, hurt, dead, jump) to a hero sprite that new-hero-look.py built, touching nothing else.

    python scripts/sprites/add-hero-moves.py <slug> <animations-dir> --attack attack --hurt hit --dead dead --jump jump

<animations-dir> is the `animations` folder of a PixelLab character download (api.pixellab.ai/mcp/characters/<id>/download,
unzipped: <state>/animations/<group>/<direction>/frame_<nnn>.png). Name the group to use for each move; give only the
ones you have. Writes public/sprites/<slug>/<move>.png and adds each to sprite.json; idle/walk/sneak/crouch and the
camp poses are left byte-for-byte as they are.

WHY NOT add-jump.py / build-sprite.py. Those assume the 128px cell the four original heroes were built on. A hero
re-dressed by new-hero-look.py (Lynkes, 2026-10-29) sits on the bigger cell PixelLab's skeleton-v3 clips come back on
(176), with idle centred in it. These moves come back on that canvas too, so nothing is scaled: each clip is moved,
ONE OFFSET PER ROW (per facing), so its feet stand where idle's feet stand in that row -- horizontally by the median
leg midpoint over the clip, vertically by the lowest point the clip reaches (new-hero-look.py's rule). One offset per
row keeps the motion in the art: a jump still leaves the ground, a fall still drops, a punch still lunges. A frame is
pasted onto its own empty tile, so it can never spill into its neighbour; any row that clips is reported.

PLAYBACK matches build-sprite.py so these moves play like every other sprite's.

ORDER. new-hero-look.py rewrites sprite.json with only idle/walk/sneak/crouch, so after it, run this and then
add-camp-poses.py again (both only ADD to sprite.json).

--swap MOVE:FACING:FRAME=SOURCE replaces one bad frame with another frame of the same clip, drawn already (no
re-roll, which would redraw the whole facing and can break the frames that were right). Lynkes, 2026-10-29:
  attack:south-west:5=0   PixelLab drew a dagger into his last punch frame; he ends back on his opening guard
  dead:north-east:6=5     his last death frame stood him back up; he stays on the frame where he is down
"""
from __future__ import annotations

import argparse
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
# scripts/sprites/build-sprite.py PLAYBACK -- kept identical on purpose.
PLAYBACK = {
    "attack": {"fps": 12, "loop": False, "hit": 0.75},
    "hurt": {"fps": 10, "loop": False},
    "dead": {"fps": 8, "loop": False},
    "jump": {"fps": 12, "loop": False},
    # a bladed swing, played instead of `attack` when the weapon is a dagger, sword or other blade (the walk's strike());
    # the thrust lands on the 5th of 7 frames. Lynkes, 2026-10-29: his `attack` stays the bare-handed cross-punch.
    "dagger": {"fps": 12, "loop": False, "hit": 0.62},
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("animations_dir")
    for move in PLAYBACK:
        ap.add_argument(f"--{move}", help=f"PixelLab group name for {move}")
    ap.add_argument("--swap", action="append", default=[], help="MOVE:FACING:FRAME=SOURCE, e.g. dead:north-east:6=5")
    a = ap.parse_args()
    swaps: dict[tuple[str, str], list[tuple[int, int]]] = {}
    for s in a.swap:
        lhs, src_i = s.split("=")
        move, facing, dst_i = lhs.split(":")
        if facing not in ROWS:
            raise SystemExit(f"--swap {s}: unknown facing {facing}")
        swaps.setdefault((move, facing), []).append((int(dst_i), int(src_i)))

    here = ROOT / "public" / "sprites" / a.slug
    manifest = json.loads((here / "sprite.json").read_text())
    cell = int(manifest["cell"][0])
    idle = np.asarray(Image.open(here / "idle.png").convert("RGBA"))
    nidle = manifest["animations"]["idle"]["frames"]
    anchors = []                                         # per row: idle's (lowest foot, leg midpoint)
    for r in range(len(ROWS)):
        feet = [labor.legs_anchor(idle[r * cell:(r + 1) * cell, i * cell:(i + 1) * cell]) for i in range(nidle)]
        anchors.append((max(f[1] for f in feet), float(np.median([f[2] for f in feet]))))

    src = Path(a.animations_dir)
    for move in PLAYBACK:
        group = getattr(a, move)
        if not group:
            continue
        rows = []
        for d in ROWS:
            files = sorted((src / group / d).glob("frame_*.png"))
            if len(files) < 2:
                raise SystemExit(f"only {len(files)} frames in {src / group / d}")
            fr = [labor.clean(Image.open(f)) for f in files]
            for dst_i, src_i in swaps.get((move, d), []):
                fr[dst_i] = fr[src_i].copy()
                print(f"{a.slug}: {move} {d} frame {dst_i} <- frame {src_i}")
            rows.append(fr)
        n = min(len(r) for r in rows)
        out = Image.new("RGBA", (n * cell, len(ROWS) * cell), (0, 0, 0, 0))
        clipped = []
        for r, fr in enumerate(rows):
            fr = fr[:n]
            fa = [labor.legs_anchor(np.asarray(im)) for im in fr]
            ry1, rcx = anchors[r]
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
        out.save(here / f"{move}.png", optimize=True)
        manifest["animations"][move] = {"sheet": f"{move}.png", "frames": n, **PLAYBACK[move]}
        print(f"{a.slug}: {move}.png {out.size}, {n} frames from group '{group}'" + (f", CLIPPED {clipped}" if clipped else ""))

    (here / "sprite.json").write_text(json.dumps(manifest, indent=1) + "\n")


if __name__ == "__main__":
    main()
