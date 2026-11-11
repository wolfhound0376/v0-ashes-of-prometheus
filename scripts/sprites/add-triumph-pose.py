#!/usr/bin/env python3
"""
Add the triumph pose to an existing battle sprite.

    python scripts/sprites/add-triumph-pose.py <slug> <frames-dir>

<frames-dir> holds one PixelLab v3 clip, south facing only, as frame_000.png ... (frame 0 is PixelLab's
standing reference). Writes public/sprites/<slug>/triumph.png and adds the animation to sprite.json.
Sam, 2026-11-10: "the main NPCs should have some triumphant poses they occasionally do when they kill a
tough creature or win."

Like the camp poses (add-camp-poses.py): only south exists, so every row of the sheet repeats it (the
victor turns to the viewer), and stray specks off the body are removed. The scale is set from frame 0:
the standing reference is drawn as tall as the sprite's own idle, so raised arms rise above the head
instead of shrinking the figure.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[2]
ROWS = 8


def clean(im):
    a = np.array(im); mask = a[:, :, 3] > 16
    lab, n = ndimage.label(mask, structure=np.ones((3, 3)))
    if n <= 1: return im
    sizes = ndimage.sum(mask, lab, range(1, n + 1)); big = sizes.max()
    a[~np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 0.08 * big])] = 0
    return Image.fromarray(a)


def main():
    if len(sys.argv) != 3: sys.exit(__doc__)
    slug, src = sys.argv[1], Path(sys.argv[2])
    out = ROOT / "public" / "sprites" / slug
    man = json.loads((out / "sprite.json").read_text())
    cw, ch = man["cell"]; px, py = man["pivot"]
    ims = [clean(Image.open(f).convert("RGBA")) for f in sorted(src.glob("*.png"), key=lambda p: int(re.findall(r"\d+", p.stem)[-1]))]
    idle = Image.open(out / "idle.png").convert("RGBA").crop((0, 0, cw, ch)).getbbox()
    ref = ims[0].getbbox()
    factor = (idle[3] - idle[1]) / (ref[3] - ref[1])
    feet = max(i.getbbox()[3] for i in ims)                       # the ground line, shared by every frame
    cx = (ref[0] + ref[2]) / 2                                     # the body's centre in the standing frame
    sheet = Image.new("RGBA", (cw * len(ims), ch * ROWS))
    for i, im in enumerate(ims):
        w, h = round(im.width * factor), round(im.height * factor)
        big = im.resize((w, h), Image.NEAREST)
        cell = Image.new("RGBA", (cw, ch))
        cell.paste(big, (round(px - cx * factor), round(py + 1 - feet * factor)), big)
        for r in range(ROWS): sheet.paste(cell, (i * cw, r * ch))
    sheet.save(out / "triumph.png", optimize=True)
    man["animations"]["triumph"] = {"sheet": "triumph.png", "frames": len(ims), "fps": 7, "loop": False}
    (out / "sprite.json").write_text(json.dumps(man, indent=2) + "\n")
    print(f"{slug} triumph: {len(ims)} frames, x{factor:.2f}")


if __name__ == "__main__":
    main()
