#!/usr/bin/env python3
"""
Bake Sam's unarmed-strike hit sparks into the impact sheets the VFX kit plays.

    python scripts/vfx/bake_strike_sparks.py [--preview <dir>]

Source: scripts/vfx/sources/unarmedStrikes/<move>/fx_trim.png — ONE drawn frame
per move, cut from Sam's six-pose sheet (2026-10-22). Only fx_trim is read. The
body/full layers are one specific fighter and stay reference art; nothing of
them ships under public/.

Output: public/vfx/<key>.webp in the same format as every other strike sheet —
960x768, 5 cols x 4 rows of 192px frames, 20 frames at 24 fps, transparent —
and the matching entries in public/vfx/manifest.json.

THE TIMING is pxSigilBurst's (draw_pixel_vfx.py), the hit spark Sam already
approved ("looks good"), stretched from six frames to twenty:

  IT POPS.      Full size by frame 2. A spark is all in its first instant.
  IT HOLDS.     Frames 2-8 are the drawn art, untouched: that is the read.
  IT HOLLOWS.   From frame 9 the centre burns out and the shape breaks into
                chunks from the inside, so the eye reads a shell coming apart
                rather than a blob shrinking.
  IT STOPS.     Full opacity to 80% of its life, then OFF. Frames 16-19 are
                empty. A spark does not fade.

Every frame is scaled from the SOURCE with nearest-neighbour, never from a
previous frame and never smoothed: this is pixel art, and one blurred pass is
the whole difference between a spark and a smudge.

Each cell is centred on the move's impact point (impact_px in the source
manifest), not on its bounding box, so the contact point lands on the target
square and an arc trails back toward whoever threw it. The source poses all
face RIGHT; the kit mirrors the directional ones when the attacker faces left
(MARTIAL_DIRECTIONAL in lib/martial-arts.ts).

Deterministic: the break-up noise is seeded, so a re-run is byte-identical.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

CELL, COLS, ROWS = 192, 5, 4
FRAMES = COLS * ROWS
FPS = 24
# The art may use this much of the half-cell around the impact point. The
# rest is margin for the kit's landing overshoot (1.35x for a tenth of a second).
REACH = 0.96

# Sheet key <- source move. Sam's mapping; change it here.
MAPPING = {
    "strikePunch": "jab",            # starburst
    "strikeKick": "side_kick",       # starburst
    "strikeSneak": "flying_knee",    # starburst
    "strikeSpecial": "roundhouse",   # big arc
    "strikeUppercut": "uppercut",    # arc, launcher
    "strikeSweep": "sweep",          # arc, low
}

# Frame clock (0-based), pxSigilBurst's beats on a 20-frame strip.
GROW = {0: 0.55, 1: 0.85}            # full size from frame 2
HOLLOW_FROM = 9                      # last untouched frame is 8
OFF_AT = int(FRAMES * 0.8)           # frame 16: empty from here on


def hash01(x: np.ndarray, y: np.ndarray, salt: int) -> np.ndarray:
    """Cheap integer hash to [0,1), so the break-up is the same every run."""
    h = (x.astype(np.int64) * 374761393 + y.astype(np.int64) * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65536.0


def frame(src: Image.Image, impact: tuple[float, float], base: float, i: int) -> Image.Image:
    cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    if i >= OFF_AT:
        return cell
    s = base * GROW.get(i, 1.0)
    w, h = max(1, round(src.width * s)), max(1, round(src.height * s))
    art = src.resize((w, h), Image.NEAREST)
    # Put the impact point on the cell centre.
    ox = round(CELL / 2 - impact[0] * s)
    oy = round(CELL / 2 - impact[1] * s)
    # The cell is empty, so a masked paste is exact (and, unlike
    # alpha_composite, it accepts a negative offset).
    cell.paste(art, (ox, oy), art)

    if i < HOLLOW_FROM:
        return cell

    a = np.array(cell)
    ys, xs = np.mgrid[0:CELL, 0:CELL]
    d = np.hypot(xs - CELL / 2, ys - CELL / 2)
    on = a[..., 3] > 0
    if not on.any():
        return cell
    D = float(d[on].max())
    # 0 on the first hollow frame, 1 on the last drawn one.
    k = (i - HOLLOW_FROM) / max(1, OFF_AT - 1 - HOLLOW_FROM)
    # The core burns out first: a ragged hole that runs outward.
    rag = hash01(xs // 3, ys // 3, 11) - 0.5
    hole = d < D * (0.12 + 0.62 * k) * (1 + 0.35 * rag)
    # What is left breaks into chunks: 4px blocks drop out, more each frame.
    chunk = hash01(xs // 4, ys // 4, 29) < 0.10 + 0.55 * k
    a[hole | chunk, 3] = 0
    return Image.fromarray(a, "RGBA")


def bake(key: str, move: str, src_dir: Path, out_dir: Path, colors: int) -> tuple[dict, Image.Image, float]:
    meta = json.loads((src_dir / "manifest.json").read_text())[move]
    src = Image.open(src_dir / move / "fx_trim.png").convert("RGBA")
    # Hard alpha in, hard alpha out.
    al = np.array(src)[..., 3]
    if not set(np.unique(al)) <= {0, 255}:
        raise SystemExit(f"{move}: fx_trim.png has soft alpha; expected 0/255 only")
    bx, by = meta["fx_bbox"][0], meta["fx_bbox"][1]
    impact = (meta["impact_px"][0] - bx, meta["impact_px"][1] - by)
    # Largest scale at which the whole spark fits round the impact point.
    reach = max(impact[0], src.width - impact[0], impact[1], src.height - impact[1])
    base = min(1.0, (CELL / 2) * REACH / reach)

    sheet = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
    for i in range(FRAMES):
        sheet.alpha_composite(frame(src, impact, base, i), ((i % COLS) * CELL, (i // COLS) * CELL))

    # A small palette keeps the sheet near its predecessors' size; the hand-cut
    # alpha survives untouched.
    alpha = sheet.getchannel("A")
    out_im = sheet.convert("RGB").quantize(colors=colors, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    out_im.putalpha(alpha)
    out = out_dir / f"{key}.webp"
    out_im.save(out, "WEBP", lossless=True, quality=100, method=6)
    entry = {"bytes": out.stat().st_size, "cols": COLS, "file": out.name, "fps": FPS,
             "frames": FRAMES, "rows": ROWS}
    return entry, out_im, base


def contact_sheet(sheets: dict[str, Image.Image], path: Path) -> None:
    """Every baked strip on one image: a row per key, frames left to right."""
    thumb = 96
    bg = (24, 22, 34, 255)
    im = Image.new("RGBA", (thumb * FRAMES, thumb * len(sheets)), bg)
    for r, (key, sh) in enumerate(sheets.items()):
        for i in range(FRAMES):
            c = sh.crop(((i % COLS) * CELL, (i // COLS) * CELL, (i % COLS + 1) * CELL, (i // COLS + 1) * CELL))
            c = c.resize((thumb, thumb), Image.NEAREST)
            im.alpha_composite(c, (i * thumb, r * thumb))
    im.convert("RGB").save(path)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="scripts/vfx/sources/unarmedStrikes")
    ap.add_argument("--vfx", default="public/vfx")
    ap.add_argument("--colors", type=int, default=48)
    ap.add_argument("--preview", help="write a contact sheet of all six strips into this folder")
    a = ap.parse_args()

    src_dir, vfx = Path(a.src), Path(a.vfx)
    mf = vfx / "manifest.json"
    m = json.loads(mf.read_text())
    baked: dict[str, Image.Image] = {}
    for key, move in MAPPING.items():
        entry, im, base = bake(key, move, src_dir, vfx, a.colors)
        m[key] = entry
        baked[key] = im
        print(f"  {key:16} <- {move:12} x{base:.2f}  {entry['bytes']:>7,} B")
    mf.write_text(json.dumps(dict(sorted(m.items())), indent=2) + "\n")
    if a.preview:
        out = Path(a.preview)
        out.mkdir(parents=True, exist_ok=True)
        contact_sheet(baked, out / "strike-sparks-contact.png")
        print(f"  contact sheet -> {out / 'strike-sparks-contact.png'}")


if __name__ == "__main__":
    main()
