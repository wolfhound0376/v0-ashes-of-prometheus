#!/usr/bin/env python3
"""
Record how far each frame of a sprite's death sheet sits above the ground, so the map can lay the body on the floor.

    python scripts/sprites/add-dead-drop.py            # every sprite with a dead sheet
    python scripts/sprites/add-dead-drop.py kenta ront  # just these

Sam, 2026-11-10: "When characters drop they sometimes look like they are floating." They were. PixelLab draws a
lying body in the middle of its canvas, so on the heroes' and the prisoners' death sheets the lowest pixel of the
fallen figure sits 16 to 48 sprite pixels above the pivot (the ground point their feet stand on), a different amount
for each facing. The drow sheets sit on the pivot, which is why only some bodies floated.

This writes animations.dead.drop into sprite.json: for each facing, for each frame, how many sprite pixels to lower
the frame so its lowest pixel rests where the standing figure's does. The first frame (still standing) is 0 by
construction, and a frame is never lowered by more than every later frame needs, so the body settles as it falls, a hop
in the air mid-fall is kept, and a sheet that already ends on the ground (the drow) records nothing. The art is not touched.
"""
from __future__ import annotations
import json, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]


def bottom(im, x, y, w, h):
    bb = im.crop((x, y, x + w, y + h)).getbbox()
    return None if not bb else bb[3]


# Sam, the same evening, after the first pass: "Eldeth, fifi, ront are floating." Resting the LOWEST pixel on the ground
# was not enough: in several facings the last frame is a body still tumbling, one hand or heel hanging down and the
# trunk well above it, so the hand touched the floor and the body hung in the air. The body is now also rested on its
# weight: the middle of its mass (the alpha-weighted mean row) is brought to HALF_BODY sprite pixels above the ground
# point, about half the thickness of a figure lying down. Whichever asks for more wins, and the extra is eased in over
# the fall so nothing jumps. A trailing hand or foot then lies a little past the ground point, on the shadow.
HALF_BODY = 9


def mass_row(im, x, y, w, h):
    import numpy as np
    a = np.asarray(im.crop((x, y, x + w, y + h)))[:, :, 3].astype(float)
    t = a.sum()
    return None if t <= 0 else float((a.sum(axis=1) * np.arange(h)).sum() / t)


def main():
    want = set(sys.argv[1:])
    for d in sorted((ROOT / "public" / "sprites").iterdir()):
        mf = d / "sprite.json"
        if not mf.exists() or (want and d.name not in want): continue
        man = json.loads(mf.read_text()); an = man.get("animations", {}).get("dead")
        if not an or not (d / an.get("sheet", "dead.png")).exists(): continue
        cw, ch = man["cell"]; n = an["frames"]
        im = Image.open(d / an.get("sheet", "dead.png")).convert("RGBA"); rows = im.height // ch
        drop = []
        for r in range(rows):
            bots = [bottom(im, f * cw, r * ch, cw, ch) for f in range(n)]
            base = bots[0] if bots[0] is not None else man["pivot"][1] + 1     # where this figure's feet are while it still stands
            raw = [0 if b is None else max(0, base - b) for b in bots]
            # never lower a frame by more than every later frame needs: a body knocked up into the air mid-fall keeps
            # its hop, and only the height it never comes down from is taken out
            row = [min(raw[f:]) for f in range(n)]
            mid = mass_row(im, (n - 1) * cw, r * ch, cw, ch)
            if mid is not None:
                extra = max(0, round((base - HALF_BODY) - mid) - row[-1])        # what resting on its weight asks beyond the lowest pixel
                row = [row[f] + round(extra * f / max(1, n - 1)) for f in range(n)]
            drop.append(row)
        if max(max(r) for r in drop) < 3:                                       # already on the ground: nothing to record
            if "drop" in an: del an["drop"]; mf.write_text(json.dumps(man, indent=2) + "\n")
            continue
        an["drop"] = drop; mf.write_text(json.dumps(man, indent=2) + "\n")
        print(f"{d.name:22} lowered by up to {max(max(r) for r in drop)} px (last frame per facing: {[r[-1] for r in drop]})")


if __name__ == "__main__":
    main()
