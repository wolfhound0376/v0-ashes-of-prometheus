#!/usr/bin/env python3
"""
Cut a LOOPING sprite sheet out of a real video clip.

Used for the gas clouds. The floor decals are procedural and the impact
sheets are one painted frame under a transform, but a cloud is the one effect
where neither works: gas is turbulence, and turbulence is exactly what you
cannot fake by scaling a still. So the motion comes from a video model and
this cuts frames out of it.

TWO PROBLEMS THIS SOLVES

1. A CLIP DOES NOT LOOP. Sampling twenty frames out of five seconds gives a
   visible jump at the wrap — the gas snaps back to where it started, every
   two seconds, in every square at once. So the tail is cross-faded back over
   the head: the last few frames are blended with the first few, which costs
   a little detail across the seam and buys a loop nobody notices.

2. WHATEVER IS IN THE TILE IS IN EVERY CELL. A twenty-square Cloudkill draws
   this texture twenty times. A skull in the tile is twenty identical skulls
   in a grid, which reads as wallpaper rather than as a charnel fog — so the
   crop is chosen for churn and against recognisable bone. `--survey` prints
   the bone fraction of each candidate crop so that choice is measured rather
   than guessed.

Alpha is keyed from luminance, as everywhere else: the clip is on black.
"""

import glob
import json
import os
import sys
import numpy as np
from PIL import Image


def bone_fraction(arr: np.ndarray) -> float:
    """How much of this crop reads as skull rather than as vapour.

    Bone is bright and near-neutral between red and green; the gas is green
    dominant. Crude, and good enough to rank crops.
    """
    r, g = arr[..., 0], arr[..., 1]
    return float(((r > 0.45) & (g > 0.45) & (np.abs(r - g) < 0.12)).mean())


def bake(frame_glob, out_dir, name, crop_x, crop_w,
         cols=5, rows=4, frame=256, fps=20, fade=5):
    files = sorted(glob.glob(frame_glob))
    want = cols * rows
    if len(files) < want:
        raise SystemExit(f"need {want} frames, found {len(files)}")
    # Even spread across the clip.
    picks = [files[round(i * (len(files) - 1) / (want - 1))] for i in range(want)]

    imgs = []
    for f in picks:
        im = Image.open(f).convert("RGB")
        h = im.size[1]
        im = im.crop((crop_x, 0, crop_x + crop_w, h)).resize((frame, frame), Image.LANCZOS)
        imgs.append(np.asarray(im, dtype=np.float32) / 255.0)

    # Cross-fade the tail back over the head so the sheet loops.
    out = list(imgs)
    for i in range(fade):
        w = (i + 1) / (fade + 1)          # 0 -> 1 across the seam
        out[want - fade + i] = imgs[want - fade + i] * (1 - w) + imgs[i] * w

    sheet = Image.new("RGBA", (frame * cols, frame * rows), (0, 0, 0, 0))
    for i, a in enumerate(out):
        lum = np.clip((a.max(axis=2) - 0.05) / 0.95, 0, 1)
        rgba = (np.dstack([a, lum]) * 255).astype(np.uint8)
        sheet.paste(Image.fromarray(rgba, "RGBA"),
                    ((i % cols) * frame, (i // cols) * frame))

    path = os.path.join(out_dir, f"{name}.webp")
    sheet.save(path, "WEBP", quality=90, method=6)
    return {"file": f"{name}.webp", "cols": cols, "rows": rows,
            "frames": want, "fps": fps, "bytes": os.path.getsize(path)}


if __name__ == "__main__":
    if "--survey" in sys.argv:
        f = sorted(glob.glob(sys.argv[1]))[len(glob.glob(sys.argv[1])) // 2]
        a = np.asarray(Image.open(f).convert("RGB"), dtype=np.float32) / 255
        H, W, _ = a.shape
        cw = int(H * 0.82)                 # the cloud quad is taller than wide
        print(f"{'crop':>14}  {'green':>6}  {'bone':>6}")
        for x in range(0, W - cw + 1, 120):
            sl = a[:, x:x + cw]
            print(f"{x:5d}-{x + cw:<8d} {sl[..., 1].mean():6.3f}  {bone_fraction(sl) * 100:5.2f}%")
        raise SystemExit(0)

    frame_glob, out_dir, name, crop_x = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    crop_w = int(sys.argv[5]) if len(sys.argv) > 5 else 886
    mpath = os.path.join(out_dir, "manifest.json")
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    man[name] = bake(frame_glob, out_dir, name, crop_x, crop_w)
    json.dump(dict(sorted(man.items())), open(mpath, "w"), indent=2, sort_keys=True)
    print(f"{name}: {man[name]['bytes'] // 1024} KB, {man[name]['frames']} frames looping")
