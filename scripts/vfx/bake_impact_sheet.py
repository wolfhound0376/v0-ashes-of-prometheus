#!/usr/bin/env python3
"""
Turn ONE painted key image into a sprite-sheet flipbook.

The cast sheets already in public/vfx were painted frame by frame. An image
model cannot do that: ask one for a 4x4 sheet and you get sixteen loosely
related pictures whose subject wanders around its cell, which flipbooks as a
twitching mess.

So the model paints the PEAK of the effect once and the motion is derived
here — the burst scales up, flares, and decays. That loses the frame-to-frame
reinvention a hand-painted sheet has, and keeps the thing that actually reads
at 24fps on a 5 ft square: that it blooms and goes.

ALPHA COMES FROM LUMINANCE. The key images are painted on pure black and the
sheets draw additively, so a pixel's brightness IS its opacity. Keying on
black is also the only reliable route — these models do not produce a clean
alpha channel on request.

Usage: bake_impact_sheet.py <key.png> <public/vfx> <sheetName>
"""

import json
import os
import sys
import numpy as np
from PIL import Image


def bake(src_path, out_dir, name, cols=5, rows=4, frame=192, fps=24,
         start=0.55, end=1.45, spin=8.0, hold=0.18):
    frames = cols * rows
    im = Image.open(src_path).convert("RGB")
    # Centre-crop square. The model frames the burst centrally but the canvas
    # is 16:9, and an off-centre burst visibly wanders as it scales.
    w, h = im.size
    s = min(w, h)
    im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    im = im.resize((frame * 2, frame * 2), Image.LANCZOS)

    a = np.asarray(im, dtype=np.float32) / 255.0
    # Brightest channel, not the mean: a saturated blue spark is fully opaque
    # even though its average is low, and averaging turns it to smoke.
    lum = a.max(axis=2)
    lum = np.clip((lum - 0.04) / 0.96, 0, 1)   # black point, kills the haze
    key = Image.fromarray((np.dstack([a, lum]) * 255).astype(np.uint8), "RGBA")

    sheet = Image.new("RGBA", (frame * cols, frame * rows), (0, 0, 0, 0))
    for i in range(frames):
        t = i / (frames - 1)
        scale = start + (end - start) * (1 - (1 - t) ** 2)   # fast, then eases
        if t < hold:
            op = 0.55 + 0.45 * (t / hold)                    # the flash
        else:
            op = (1 - (t - hold) / (1 - hold)) ** 1.5        # the decay tail
        size = max(1, int(frame * scale))
        f = key.resize((size, size), Image.LANCZOS)
        if spin:
            f = f.rotate(spin * t, resample=Image.BICUBIC, expand=False)
        arr = np.asarray(f, dtype=np.float32)
        arr[..., 3] *= op
        f = Image.fromarray(arr.astype(np.uint8), "RGBA")
        if size >= frame:                                     # crop to the cell
            o = (size - frame) // 2
            cell = f.crop((o, o, o + frame, o + frame))
        else:                                                 # or pad to it
            cell = Image.new("RGBA", (frame, frame), (0, 0, 0, 0))
            cell.paste(f, ((frame - size) // 2, (frame - size) // 2))
        sheet.paste(cell, ((i % cols) * frame, (i // cols) * frame))

    out = os.path.join(out_dir, f"{name}.webp")
    sheet.save(out, "WEBP", quality=90, method=6)
    return {"file": f"{name}.webp", "cols": cols, "rows": rows,
            "frames": frames, "fps": fps, "bytes": os.path.getsize(out)}


if __name__ == "__main__":
    src, out_dir, name = sys.argv[1], sys.argv[2], sys.argv[3]
    mpath = os.path.join(out_dir, "manifest.json")
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    man[name] = bake(src, out_dir, name)
    json.dump(dict(sorted(man.items())), open(mpath, "w"), indent=2, sort_keys=True)
    print(f"{name}: {man[name]['bytes'] // 1024} KB, {man[name]['frames']} frames")
