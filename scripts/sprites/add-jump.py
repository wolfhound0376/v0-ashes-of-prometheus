#!/usr/bin/env python3
"""
Add the `jump` sheet — a running long jump — to an existing battle sprite.

    python scripts/sprites/add-jump.py <slug> <pixellab-character-id-or-zip>

Writes public/sprites/<slug>/jump.png and adds the animation to sprite.json,
touching NOTHING ELSE. Re-running build-sprite.py would regenerate every sheet
the character already has, and those are approved art; this adds one row.

WHY A SEPARATE SCRIPT. The four heroes were built before the walk had any
notion of jumping, so their sheets are idle/walk/attack/cast/hurt/dead plus the
camp poses. `lib/sprite-token.ts` and `scripts/sprites/build-sprite.py` have
always known the `jump` state — only the art was missing.

WHY NO RE-ANCHORING, unlike add-ward-pose.py. A ward is arms-only, so each
frame has to be pinned to the legs or the body slides as the arms spread. A
jump is the opposite: leaving the ground IS the motion, and re-anchoring each
frame on the feet would cancel exactly what makes it a jump. PixelLab returns
these on the character's own 128px canvas, so they are taken as drawn, with the
same centre-crop build-sprite.py uses for a grown canvas.

The page's arcTo() moves the whole sprite along its own parabola on top of
this; the sheet supplies the posture, not the trajectory.
"""
from __future__ import annotations

import argparse
import io
import json
import re
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
# lib/sprite-token.ts SPRITE_DIRECTIONS — the order the renderer reads rows in.
ROWS = ["south", "south-east", "east", "north-east",
        "north", "north-west", "west", "south-west"]
# scripts/sprites/build-sprite.py PLAYBACK["jump"] — kept identical on purpose.
PLAYBACK = {"fps": 12, "loop": False}


def open_zip(src: str) -> zipfile.ZipFile:
    if src.endswith(".zip"):
        return zipfile.ZipFile(src)
    url = f"https://api.pixellab.ai/mcp/characters/{src}/download"
    with urllib.request.urlopen(url, timeout=300) as r:
        return zipfile.ZipFile(io.BytesIO(r.read()))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("source", nargs="+",
                    help="PixelLab character id(s) or .zip(s). Later sources OVERRIDE earlier "
                         "ones per direction, so a one-direction patch run can replace a single "
                         "bad row without re-rolling the seven that came out right.")
    ap.add_argument("--anim", default="running_jump",
                    help="the animation folder inside the zip (default running_jump)")
    ap.add_argument("--only", action="append", default=[], metavar="DIRS",
                    help="restrict the matching source to these directions, comma separated. "
                         "Repeat once per source, in the same order. A template run can drop a "
                         "single direction (wrong facing, washed-out colours, 'heavy load'), and "
                         "re-rolling the whole character to fix one row trades a known-good row "
                         "for a fresh dice throw. Pass the good bundle first, the patch second.")
    args = ap.parse_args()

    out = ROOT / "public" / "sprites" / args.slug
    manifest_path = out / "sprite.json"
    if not manifest_path.exists():
        raise SystemExit(f"no sprite at {out} — build it with build-sprite.py first")
    manifest = json.loads(manifest_path.read_text())
    cw, ch = manifest["cell"]

    want = re.compile(rf"/animations/{re.escape(args.anim)}/([a-z-]+)/frame_(\d+)\.png$")
    by_dir: dict[str, list[tuple[int, Image.Image]]] = {}
    for i, src in enumerate(args.source):
        keep = {d.strip() for d in args.only[i].split(",")} if i < len(args.only) and args.only[i] else None
        z = open_zip(src)
        found: dict[str, list[tuple[int, Image.Image]]] = {}
        for name in z.namelist():
            m = want.search(name)
            if m:
                found.setdefault(m.group(1), []).append(
                    (int(m.group(2)), Image.open(io.BytesIO(z.read(name))).convert("RGBA")))
        if not found:
            raise SystemExit(f"no '{args.anim}' frames in {src}")
        for d, frames in found.items():
            if keep is not None and d not in keep:
                continue
            if d in by_dir:
                print(f"  {d}: replaced by {src}")
            by_dir[d] = frames
    missing = [d for d in ROWS if d not in by_dir]
    if missing:
        raise SystemExit(f"missing directions: {', '.join(missing)} — let the jobs finish")
    for seq in by_dir.values():
        seq.sort(key=lambda t: t[0])

    n = max(len(v) for v in by_dir.values())
    sheet = Image.new("RGBA", (cw * n, ch * len(ROWS)), (0, 0, 0, 0))
    for row, d in enumerate(ROWS):
        seq = [im for _, im in by_dir[d]]
        for col in range(n):
            im = seq[min(col, len(seq) - 1)]
            if im.size != (cw, ch):
                # PixelLab grows a canvas evenly on every side; cut the centre back out.
                x, y = (im.width - cw) // 2, (im.height - ch) // 2
                if x >= 0 and y >= 0:
                    im = im.crop((x, y, x + cw, y + ch))
                else:
                    cell = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
                    cell.alpha_composite(im, (max(0, -x), max(0, -y)))
                    im = cell
            sheet.alpha_composite(im, (col * cw, row * ch))
    sheet.save(out / "jump.png", optimize=True)
    manifest["animations"]["jump"] = {"sheet": "jump.png", "frames": n, **PLAYBACK}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{args.slug}: jump {n} frames x 8 directions -> {out / 'jump.png'}")


if __name__ == "__main__":
    main()
