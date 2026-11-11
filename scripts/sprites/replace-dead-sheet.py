#!/usr/bin/env python3
"""
Replace a sprite's death sheet with a new PixelLab clip (all eight facings).

    python scripts/sprites/replace-dead-sheet.py <slug> <animation-dir>

<animation-dir> is the clip's folder from a PixelLab download: <direction>/frame_000.png ... for each of the eight
directions, frame 0 being the standing figure. Writes public/sprites/<slug>/dead.png and updates the frame count;
run scripts/sprites/add-dead-drop.py <slug> afterwards so the body rests on the floor.

Sam, 2026-11-10: "Derendil looks weird. Why does he have five arms." His first death sheet (PixelLab's template
clip) grew extra hands and lost his head in some facings. The posed-skeleton version of the same clip keeps one
head, two arms and two legs. Each facing is scaled so its standing frame is as tall as that facing's idle and
stands on the pivot; later frames are slid across so the fallen body ends centred on the ground point, inside the cell.
"""
from __future__ import annotations
import json, re, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]


def main():
    if len(sys.argv) != 3: sys.exit(__doc__)
    slug, src = sys.argv[1], Path(sys.argv[2])
    out = ROOT / "public" / "sprites" / slug
    man = json.loads((out / "sprite.json").read_text()); cw, ch = man["cell"]; px, py = man["pivot"]
    idle = Image.open(out / "idle.png").convert("RGBA")
    rows = []; shrunk = []
    for r, d in enumerate(DIRECTIONS):
        fs = sorted((src / d).glob("*.png"), key=lambda p: int(re.findall(r"\d+", p.stem)[-1]))
        if not fs: sys.exit(f"no frames for {d}")
        ims = [Image.open(f).convert("RGBA") for f in fs]
        ib = idle.crop((0, r * ch, cw, (r + 1) * ch)).getbbox(); ref = ims[0].getbbox()
        k = (ib[3] - ib[1]) / (ref[3] - ref[1]); cx = (ref[0] + ref[2]) / 2
        cells = []
        for f, im in enumerate(ims):
            big = im.resize((round(im.width * k), round(im.height * k)), Image.NEAREST); bb = big.getbbox()
            fit = min(1, (cw - 2) / (bb[2] - bb[0]), (ch - 2) / (bb[3] - bb[1]))   # a big creature stretched out is longer than its cell: that frame alone is drawn a little smaller
            if fit < 1:
                big = im.resize((round(im.width * k * fit), round(im.height * k * fit)), Image.NEAREST); bb = big.getbbox(); shrunk.append((d, f, round(fit, 2)))
            # The clip throws the body back, off the spot it stood on, and a 128px cell cannot hold that travel: the
            # far end was being cut off. The body is where the map says it is, so each frame is slid across until, by
            # the last one, the fallen figure is centred on the ground point; and nothing is let past the top or bottom.
            t = f / max(1, len(ims) - 1)
            x = round((px - cx * k) * (1 - t) + (px - (bb[0] + bb[2]) / 2) * t)
            x = min(max(x, -bb[0]), cw - bb[2])
            y = round(py + 1 - ref[3] * k * fit); y = min(max(y, -bb[1]), ch - bb[3])
            cell = Image.new("RGBA", (cw, ch)); cell.paste(big, (x, y), big); cells.append(cell)
        rows.append(cells)
    n = min(len(r) for r in rows)
    sheet = Image.new("RGBA", (cw * n, ch * len(rows)))
    for r, cells in enumerate(rows):
        for f in range(n): sheet.paste(cells[f], (f * cw, r * ch))
    sheet.save(out / "dead.png", optimize=True)
    an = man["animations"]["dead"]; an["frames"] = n; an.pop("drop", None)
    (out / "sprite.json").write_text(json.dumps(man, indent=2) + "\n")
    print(f"{slug} dead: {n} frames x {len(rows)} facings; drawn smaller to fit the cell: {shrunk or 'none'}")


if __name__ == "__main__":
    main()
