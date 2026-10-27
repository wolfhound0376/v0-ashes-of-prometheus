#!/usr/bin/env python3
"""
Bake public/velkynvelve-walk/img/pen-gate-bars.png: the slave pen's gate cut from the plate with the gaps between the
bars made transparent, so a guard standing on the far side of the gate can be drawn BEHIND the bars (Sam, 2026-10-27:
the leaning guard, "draw him behind the bars").

    python scripts/velkynvelve-walk/make_gate_bars.py [path/to/node-11-slave-pen.jpg]

Without a path it downloads the plate from Supabase storage (vtt-assets/scenes/velkynvelve/walk/img/).

WHY OFFLINE. The plate is served cross-origin, so in the browser the canvas it is drawn into is tainted and its pixels
cannot be read; the map cannot key the bars out at runtime. A small PNG cut once, served same-origin, can simply be
drawn over the guard.

HOW THE GAPS ARE FOUND. Not by colour: the panes between the bars (about rgb 60,48,72) are nearly the bars' own tone
(71,59,83) and drift lighter down the gate, so a colour key comes out patchy. By shape instead: every bar is a thin
strip between dark outlines (luminance < OUTLINE), so everything within BAR px of an outline is bar and stays; the
lock plate is bright (> PLATE) and stays; what is left inside the leaf is pane, and goes transparent (opened by a 3 px
min/max so single stray pixels do not speckle). The leaf is the gate quad from story.json (11 interact.gate.leaf),
pulled in a hair so the frame posts stay solid.

The PNG covers plate box BOX (natural 2400-wide coordinates) and is drawn there at that size by the map.
"""
from __future__ import annotations

import io
import json
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
URL = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/scenes/velkynvelve/walk/img/node-11-slave-pen.jpg"
NAT_W = 2400
OUTLINE, BAR, PLATE = 42, 3, 100
OUT = ROOT / "public" / "velkynvelve-walk" / "img" / "pen-gate-bars.png"


def leaf() -> dict:
    story = json.loads((ROOT / "scripts" / "velkynvelve-walk" / "story.json").read_text())
    found = []

    def walk(o):
        if isinstance(o, dict):
            if "leaf" in o and isinstance(o["leaf"], dict) and "hb" in o["leaf"]:
                found.append(o["leaf"])
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    walk(story)
    if len(found) != 1:
        raise SystemExit(f"expected one gate leaf in story.json, found {len(found)}")
    return found[0]


def main() -> None:
    raw = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(URL).read()
    plate = Image.open(io.BytesIO(raw)).convert("RGB")
    k = plate.width / NAT_W
    L = leaf()
    xs = [L[c][0] for c in ("hb", "ht", "fb", "ft")]
    ys = [L[c][1] for c in ("hb", "ht", "fb", "ft")]
    bx, by = min(xs) - 2, min(ys) - 2
    bw, bh = max(xs) + 2 - bx, max(ys) + 2 - by
    src = plate.crop((round(bx * k), round(by * k), round((bx + bw) * k), round((by + bh) * k)))
    a = np.asarray(src).astype(float)
    lum = a @ [0.3, 0.59, 0.11]
    # the leaf, a hair inside its painted edge (natural coords -> crop px)
    inset = [(L["hb"][0] + 2, L["hb"][1] - 4), (L["fb"][0] - 2, L["fb"][1] - 2), (L["ft"][0] - 2, L["ft"][1] + 4), (L["ht"][0] + 2, L["ht"][1] + 4)]
    m = Image.new("L", src.size, 0)
    ImageDraw.Draw(m).polygon([((x - bx) * k, (y - by) * k) for x, y in inset], fill=255)
    quad = np.asarray(m) > 0
    bar = np.asarray(Image.fromarray(((lum < OUTLINE) * 255).astype("uint8")).filter(ImageFilter.MaxFilter(BAR))) > 0
    hole = quad & ~(bar | (lum > PLATE))
    hole = np.asarray(Image.fromarray((hole * 255).astype("uint8")).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))) > 0
    out = Image.fromarray(np.dstack([a.astype("uint8"), np.where(hole, 0, 255).astype("uint8")]), "RGBA")
    out.save(OUT, optimize=True)
    print(f"{OUT.relative_to(ROOT)} {out.size}, box {bx},{by},{bw},{bh} (natural px), see-through {hole.sum() / quad.sum():.0%} of the leaf")


if __name__ == "__main__":
    main()
