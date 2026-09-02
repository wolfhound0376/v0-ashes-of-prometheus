#!/usr/bin/env python3
"""
Cut a sprite sheet out of a real video clip.

bake_impact_sheet.py takes ONE painted frame and derives motion from it by
scaling and fading. That is enough for a burst, and it is not enough for
anything whose motion is the point — ice that splinters as it grows, gas that
churns. For those the motion has to be real, so it comes from a video model
and this cuts frames out of the result.

Two modes:

  --oneshot   an effect that happens once and is gone: an impact. Frames run
              start to finish with a fade-out tail so it does not pop off.
              Pair with --fit, which letterboxes the whole frame into the cell
              instead of cropping it — an impact cropped square runs off its
              own quad and reads as clipped geometry.

  --loop      an effect that persists: a gas cloud. A clip does not loop, so
              sampling it straight gives a visible snap-back every couple of
              seconds, in every square at once. The tail is cross-faded over
              the head, which costs a little detail across the seam and buys
              a loop nobody notices.

Alpha is keyed from luminance, as everywhere else — the clips are shot on
black and the sheets draw additively.
"""

import glob
import json
import os
import sys
import numpy as np
from PIL import Image


def bone_fraction(arr):
    """How much of a crop reads as skull rather than as vapour.

    Only meaningful for the poison clip. Bone is bright and near-neutral
    between red and green; the gas is green dominant. Used by --survey,
    because whatever is in a tile appears in EVERY cell of an area, and a
    crop full of skulls is twenty identical skulls in a grid.
    """
    r, g = arr[..., 0], arr[..., 1]
    return float(((r > 0.45) & (g > 0.45) & (np.abs(r - g) < 0.12)).mean())


def bake(frame_glob, out_dir, name, crop_x=None, crop_w=None, loop=False,
         fit=False, cols=5, rows=4, frame=256, fps=24, fade=5):
    files = sorted(glob.glob(frame_glob))
    want = cols * rows
    if len(files) < want:
        raise SystemExit(f"need {want} frames, found {len(files)}")
    picks = [files[round(i * (len(files) - 1) / (want - 1))] for i in range(want)]

    imgs = []
    for f in picks:
        im = Image.open(f).convert("RGB")
        W, H = im.size
        if fit:
            # LETTERBOX, do not crop.
            #
            # A cloud tile is a slice of a larger mass and cropping it is
            # right. An impact is a single object, and cropping a 16:9 burst
            # to a square cuts its own edges off — the sheet then draws an
            # effect that runs off its own quad, which reads as clipped
            # geometry rather than as ice. Fitting the whole frame inside the
            # cell keeps the burst intact with black around it, which is how
            # every hand-painted sheet in this library is framed.
            sc = min(frame / W, frame / H)
            small = im.resize((max(1, int(W * sc)), max(1, int(H * sc))), Image.LANCZOS)
            canvas = Image.new("RGB", (frame, frame), (0, 0, 0))
            canvas.paste(small, ((frame - small.size[0]) // 2, (frame - small.size[1]) // 2))
            im = canvas
        else:
            cw = crop_w or H
            cx = crop_x if crop_x is not None else (W - cw) // 2
            im = im.crop((cx, 0, cx + cw, H)).resize((frame, frame), Image.LANCZOS)
        imgs.append(np.asarray(im, dtype=np.float32) / 255.0)

    out = list(imgs)
    if loop:
        for i in range(fade):
            w = (i + 1) / (fade + 1)
            out[want - fade + i] = imgs[want - fade + i] * (1 - w) + imgs[i] * w

    sheet = Image.new("RGBA", (frame * cols, frame * rows), (0, 0, 0, 0))
    for i, a in enumerate(out):
        lum = np.clip((a.max(axis=2) - 0.05) / 0.95, 0, 1)
        if not loop:
            # A one-shot must reach zero. Left at its natural brightness the
            # last frame simply vanishes when the handle is dropped, which
            # reads as the effect being cut off rather than ending.
            t = i / (want - 1)
            if t > 0.6:
                lum = lum * (1 - (t - 0.6) / 0.4) ** 1.4
        rgba = (np.dstack([a, lum]) * 255).astype(np.uint8)
        sheet.paste(Image.fromarray(rgba, "RGBA"),
                    ((i % cols) * frame, (i // cols) * frame))

    path = os.path.join(out_dir, f"{name}.webp")
    sheet.save(path, "WEBP", quality=90, method=6)
    return {"file": f"{name}.webp", "cols": cols, "rows": rows,
            "frames": want, "fps": fps, "bytes": os.path.getsize(path)}


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    loop = "--loop" in sys.argv
    fit = "--fit" in sys.argv
    if "--survey" in sys.argv:
        fs = sorted(glob.glob(args[0]))
        a = np.asarray(Image.open(fs[len(fs) // 2]).convert("RGB"), dtype=np.float32) / 255
        H, W, _ = a.shape
        cw = int(H * 0.82)
        print(f"{'crop':>16}  {'green':>6}  {'bone':>6}")
        for x in range(0, W - cw + 1, 120):
            sl = a[:, x:x + cw]
            print(f"{x:5d}-{x + cw:<9d} {sl[..., 1].mean():6.3f}  {bone_fraction(sl) * 100:5.2f}%")
        raise SystemExit(0)

    frame_glob, out_dir, name = args[0], args[1], args[2]
    crop_x = int(args[3]) if len(args) > 3 else None
    crop_w = int(args[4]) if len(args) > 4 else None
    mpath = os.path.join(out_dir, "manifest.json")
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    man[name] = bake(frame_glob, out_dir, name, crop_x, crop_w, loop, fit)
    json.dump(dict(sorted(man.items())), open(mpath, "w"), indent=2, sort_keys=True)
    k = "looping" if loop else "one-shot"
    print(f"{name}: {man[name]['bytes'] // 1024} KB, {man[name]['frames']} frames {k}")
