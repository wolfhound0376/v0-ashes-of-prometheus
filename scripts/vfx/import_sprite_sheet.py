#!/usr/bin/env python3
"""
Pack drawn frames into a VFX sheet the kit can play.

draw_pixel_vfx.py draws its sheets from code. This is for the ones that
were drawn by hand or by PixelLab — the Vicious Mockery ghost — where the
source is a PNG (or a run of PNGs, one per frame) kept under
scripts/vfx/sources/<name>/. The frames are laid on a grid, saved lossless,
and the manifest entry written, exactly as the generator does, so the kit
cannot tell the two apart.

Frames are taken in filename order; every frame must be the same size.

Usage: import_sprite_sheet.py <name> <public/vfx> [--fps N] [--loop] [--cols N]
                              [--quality Q]
       (reads scripts/vfx/sources/<name>/*.png)

LOSSLESS IS THE DEFAULT AND PIXEL ART MUST KEEP IT. A lossy pass smears a
hard-edged palette into mush, and the board draws these at 1:1.

--quality Q switches to lossy for a source that was RENDERED rather than
drawn — a soft glow, a smoke plume, a photographic plate. There is no palette
to protect, and the saving is large: the magic-missile dart is 190 KB lossless
and 99 KB at q88, which is where its siblings guidingBoltTravel (80 KB) and
frostRayTravel (91 KB) sit. Measured round-trip error at q88 is 1.3% of range
on the visible dart. Pillow keeps the ALPHA channel lossless either way, so
the silhouette never degrades — only the colour inside it.
"""

import glob
import json
import math
import os
import sys

from PIL import Image


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)
    name, out_dir = sys.argv[1], sys.argv[2]
    fps = int(sys.argv[sys.argv.index("--fps") + 1]) if "--fps" in sys.argv else 8
    loop = "--loop" in sys.argv
    quality = int(sys.argv[sys.argv.index("--quality") + 1]) if "--quality" in sys.argv else None
    src_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources", name)
    paths = sorted(glob.glob(os.path.join(src_dir, "*.png")))
    if not paths:
        sys.exit(f"no frames under {src_dir}")
    frames = [Image.open(p).convert("RGBA") for p in paths]
    w, h = frames[0].size
    for p, f in zip(paths, frames):
        if f.size != (w, h):
            sys.exit(f"{p} is {f.size}, expected {(w, h)}")
    n = len(frames)
    cols = int(sys.argv[sys.argv.index("--cols") + 1]) if "--cols" in sys.argv else min(n, 4)
    rows = math.ceil(n / cols)
    sheet = Image.new("RGBA", (w * cols, h * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, ((i % cols) * w, (i // cols) * h))
    out = os.path.join(out_dir, f"{name}.webp")
    if quality is None:
        sheet.save(out, "WEBP", lossless=True, quality=100, method=6)
    else:
        sheet.save(out, "WEBP", quality=quality, method=6)

    mpath = os.path.join(out_dir, "manifest.json")
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    entry = {"file": f"{name}.webp", "cols": cols, "rows": rows, "frames": n,
             "fps": fps, "bytes": os.path.getsize(out)}
    if loop:
        entry["loop"] = True
    man[name] = entry
    json.dump(dict(sorted(man.items())), open(mpath, "w"), indent=2, sort_keys=True)
    how = "lossless" if quality is None else f"q{quality}"
    print(f"{name}: {n} frame(s) {w}x{h}, {entry['bytes']} B ({how})")


if __name__ == "__main__":
    main()
