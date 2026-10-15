#!/usr/bin/env python3
"""
Cut ONE contact sheet of a whole cast into the three sheets the kit wants.

Sam supplies finished effects as a single 4x4 contact sheet that runs the
entire spell: the caster gathering it, the thing crossing the room, and the
hit. The kit does not play a cast as one clip -- it plays a `gather` at the
hand across the charge, a `travel` sheet while the spell is in flight, and an
`impact` sheet where it lands, each on its own clock and each needing its own
loop behaviour. So the contact sheet has to be cut three ways.

WHERE THE CUTS GO, and how to know rather than guess:

Measure each frame's bright core (luminance over ~110, which ignores the haze
around it). Two numbers separate the phases, and they did so identically on
both sheets Sam has sent:

  gather  the core is small and ROUND          coreW ~0.35-0.73
  travel  the core goes WIDE and stays FLAT    coreW ~0.90+, coreH ~0.37-0.56
  impact  the core goes round again AND the    coreH jumps to ~0.90, with a
          frame's total luminance jumps        1.8x-2.5x step in total mass

The height of the core is the discriminator: a beam is wide and flat, a burst
is wide and tall. --survey prints the table so the cuts can be checked against
the art before baking anything.

Alpha is keyed from luminance exactly as bake_video_sheet.py does it -- the
art is painted on black and the sheets draw additively -- so these sit beside
the video-cut sheets without a second convention.
"""

import json
import os
import sys
import numpy as np
from PIL import Image

CELL = 256          # match the painted sheets already in public/vfx


def cells(path, cols, rows):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    cw, ch = W // cols, H // rows
    out = []
    for i in range(cols * rows):
        r, c = divmod(i, cols)
        out.append(im.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch)))
    return out


def survey(path, cols, rows):
    print(f"{path}\n fr    mass  coreW  coreH   reading")
    prev = None
    for i, cell in enumerate(cells(path, cols, rows)):
        a = np.asarray(cell, dtype=np.float32)
        lum = a.mean(axis=2)
        core = lum > 110
        mass = lum.sum() / 1e6
        ys, xs = np.nonzero(core)
        if len(xs) == 0:
            print(f" {i+1:2d}  {mass:6.2f}     --     --   haze only")
            prev = mass
            continue
        w = (xs.max() - xs.min()) / cell.size[0]
        h = (ys.max() - ys.min()) / cell.size[1]
        step = "" if prev is None else f"  x{mass/max(prev,0.01):.1f}"
        kind = "TRAVEL (wide, flat)" if w > 0.8 and h < 0.7 else \
               "IMPACT (wide, tall)" if w > 0.8 else "gather"
        print(f" {i+1:2d}  {mass:6.2f}  {w:5.2f}  {h:5.2f}   {kind}{step}")
        prev = mass


def bake(src, out_dir, name, frames, cols, fps, loop, fade_tail):
    """Write one sheet from a list of PIL cells. Keying matches bake_video_sheet."""
    n = len(frames)
    rows = (n + cols - 1) // cols
    sheet = Image.new("RGBA", (CELL * cols, CELL * rows), (0, 0, 0, 0))
    for i, cell in enumerate(frames):
        a = np.asarray(cell.resize((CELL, CELL), Image.LANCZOS), dtype=np.float32) / 255.0
        lum = np.clip((a.max(axis=2) - 0.05) / 0.95, 0, 1)
        if fade_tail and n > 1:
            # A one-shot has to fade or it reads as being cut off.
            #
            # NOTE the divisor. The obvious `i / (n - 1)` puts the last frame
            # at t = 1 exactly, where the curve is zero -- so the final frame
            # of the sheet is fully transparent and draws NOTHING. Measured on
            # the first bake of this art: frame 9 of 9 came out alpha max 0, a
            # whole frame of file for a blank. `i / n` keeps the last frame at
            # about 16% instead, and the kit's own quad opacity (which already
            # ramps down over the last 30% of the impact) finishes it off.
            t = i / n
            if t > 0.6:
                lum = lum * (1 - (t - 0.6) / 0.4) ** 1.4
        rgba = (np.dstack([a, lum]) * 255).astype(np.uint8)
        sheet.paste(Image.fromarray(rgba, "RGBA"), ((i % cols) * CELL, (i // cols) * CELL))
    path = os.path.join(out_dir, f"{name}.webp")
    sheet.save(path, "WEBP", quality=90, method=6)
    entry = {"file": f"{name}.webp", "cols": cols, "rows": rows,
             "frames": n, "fps": fps, "bytes": os.path.getsize(path)}
    if loop:
        entry["loop"] = True
    return entry


def main():
    if "--survey" in sys.argv:
        survey(sys.argv[1], 4, 4)
        return
    src, out_dir, stem = sys.argv[1], sys.argv[2], sys.argv[3]
    # frame numbers are 1-based and INCLUSIVE, as the survey prints them
    spec = json.loads(sys.argv[4])       # {"gather":[1,3],"travel":[4,7],"impact":[8,16]}
    all_cells = cells(src, 4, 4)
    mpath = os.path.join(out_dir, "manifest.json")
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    plan = {
        # the gather is played ONCE across the charge, so it must not wrap
        "gather": dict(suffix="Charge", cols=4, fps=12, loop=False, fade=False),
        # the travel repeats for as long as the spell is in the air
        "travel": dict(suffix="Travel", cols=4, fps=18, loop=True,  fade=False),
        # the impact happens once and must end at zero
        "impact": dict(suffix="Impact", cols=3, fps=20, loop=False, fade=True),
    }
    for phase, (a, b) in spec.items():
        p = plan[phase]
        frames = all_cells[a - 1:b]
        name = stem + p["suffix"]
        man[name] = bake(src, out_dir, name, frames, p["cols"], p["fps"], p["loop"], p["fade"])
        print(f"{name}: {man[name]['bytes']:,} B, {len(frames)} frames @ {p['fps']} fps"
              f"{' (loops)' if p['loop'] else ''}")
    json.dump(dict(sorted(man.items())), open(mpath, "w"), indent=2, sort_keys=True)


if __name__ == "__main__":
    main()
