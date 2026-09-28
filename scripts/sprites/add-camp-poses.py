#!/usr/bin/env python3
"""
Add the camp poses — sit, eat, sleep — to an existing battle sprite.

    python scripts/sprites/add-camp-poses.py <slug> <frames-dir>

<frames-dir> holds PixelLab v3 animation frames named <pose>_<n>.png
(sit_0.png … eat_6.png …, and perform_*.png for a bard with an instrument), south facing only. Writes
public/sprites/<slug>/{sit,eat,sleep}.png and adds the three animations to
sprite.json. Sam, 2026-09-27: "make pixellab tokens for sitting, eating, and
sleeping."

Why this is not build-sprite.py:
  * The poses are separate PixelLab *states*, and PixelLab redraws a state to
    fill its canvas — a seated Fifi comes back as tall as a standing one. The
    figure is scaled so a seated character stands 0.66 of their standing idle
    height (cross-legged sitting height; the head then matches the idle
    head). Eat and sleep use the same factor as sit — one scale per character.
  * Only the south direction exists. Every row of the sheet repeats it, so a
    reader that picks a row by facing still gets the pose (camp faces the
    viewer).
  * v3 sometimes leaves stray sparks off the body; anything not touching the
    figure is removed.
  * Some sleep states come back drawn upright — curled, eyes shut, but on
    their feet (PixelLab keeps the standing rig; asking again for "lying
    flat" did not change it). A sleep pose taller than it is wide is laid
    down: turned a quarter, head to the left. A 90-degree turn moves whole
    pixels, so the art stays crisp.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
ROWS = 8  # lib/sprite-token.ts SPRITE_DIRECTIONS
SEATED_OF_STANDING = 0.66
PLAYBACK = {"sit": {"fps": 4, "loop": True}, "eat": {"fps": 6, "loop": True}, "sleep": {"fps": 3, "loop": True},
            # A bard playing at the fire (Sam, 2026-09-28): the instrument is in the art.
            "perform": {"fps": 8, "loop": True}}


def clean(im: Image.Image) -> Image.Image:
    """Keep the largest connected figure (8-connected, alpha > 16); drop specks."""
    a = np.array(im)
    mask = a[:, :, 3] > 16
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n <= 1:
        return im
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    # also keep pieces at least 8% of the main body (a bowl held a pixel apart)
    keepers = {i + 1 for i, s in enumerate(sizes) if s >= 0.08 * sizes[keep - 1]}
    a[~np.isin(lab, list(keepers))] = 0
    return Image.fromarray(a)


def standing_height(sheet_dir: Path, cell: int) -> int:
    idle = Image.open(sheet_dir / "idle.png").convert("RGBA").crop((0, 0, cell, cell))
    bb = idle.getbbox()
    return bb[3] - bb[1]


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    slug, src = sys.argv[1], Path(sys.argv[2])
    out = ROOT / "public" / "sprites" / slug
    manifest = json.loads((out / "sprite.json").read_text())
    cw, ch = manifest["cell"]
    px, py = manifest["pivot"]
    frames: dict[str, list[Image.Image]] = {}
    for f in sorted(src.glob("*.png"), key=lambda p: (p.stem.split("_")[0], int(re.findall(r"\d+", p.stem)[-1]))):
        pose = f.stem.split("_")[0]
        if pose in PLAYBACK:
            frames.setdefault(pose, []).append(clean(Image.open(f).convert("RGBA")))
    if "sit" not in frames:
        sys.exit("need sit_*.png to set the scale")

    def union(ims):
        bbs = [i.getbbox() for i in ims]
        return min(b[0] for b in bbs), min(b[1] for b in bbs), max(b[2] for b in bbs), max(b[3] for b in bbs)

    if "sleep" in frames:
        x0, y0, x1, y1 = union(frames["sleep"])
        if (y1 - y0) > (x1 - x0):
            frames["sleep"] = [im.rotate(90, expand=True) for im in frames["sleep"]]
            print(f"{slug} sleep: drawn upright — laid down (head left)")

    sit_bb = union(frames["sit"])
    factor = SEATED_OF_STANDING * standing_height(out, cw) / (sit_bb[3] - sit_bb[1])
    for pose, ims in frames.items():
        x0, y0, x1, y1 = union(ims)
        w, h = round((x1 - x0) * factor), round((y1 - y0) * factor)
        if w > cw or h > ch:
            f2 = min(cw / (x1 - x0), ch / (y1 - y0))
            print(f"  {pose}: {w}x{h} would overflow the {cw}px cell; fitting at {f2:.2f}")
            w, h = round((x1 - x0) * f2), round((y1 - y0) * f2)
        sheet = Image.new("RGBA", (cw * len(ims), ch * ROWS))
        for i, im in enumerate(ims):
            fig = im.crop((x0, y0, x1, y1)).resize((w, h), Image.NEAREST)
            cell = Image.new("RGBA", (cw, ch))
            # feet (the bottom of the pose) on the pivot, centred on it
            cell.paste(fig, (px - w // 2, py - h + 1), fig)
            for r in range(ROWS):
                sheet.paste(cell, (i * cw, r * ch))
        sheet.save(out / f"{pose}.png", optimize=True)
        manifest["animations"][pose] = {"sheet": f"{pose}.png", "frames": len(ims), **PLAYBACK[pose]}
        print(f"{slug} {pose}: {len(ims)} frames, figure {w}x{h}px (x{factor:.2f})")
    (out / "sprite.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
