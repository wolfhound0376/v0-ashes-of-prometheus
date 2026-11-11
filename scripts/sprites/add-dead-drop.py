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
            drop.append([min(raw[f:]) for f in range(n)])
        if max(max(r) for r in drop) < 3:                                       # already on the ground: nothing to record
            if "drop" in an: del an["drop"]; mf.write_text(json.dumps(man, indent=2) + "\n")
            continue
        an["drop"] = drop; mf.write_text(json.dumps(man, indent=2) + "\n")
        print(f"{d.name:22} lowered by up to {max(max(r) for r in drop)} px (last frame per facing: {[r[-1] for r in drop]})")


if __name__ == "__main__":
    main()
