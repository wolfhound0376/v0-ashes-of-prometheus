#!/usr/bin/env python3
"""
Bake a school-rune glyph into the 16-frame spinning disc the VFX kit expects.

    python scripts/vfx/bake-rune.py <glyph.png> runeNecromancy [--gain 1.5]

WHY THIS IS NOT JUST A RESIZE
-----------------------------
public/vfx/rune*.webp are 1024x1024 sheets, 4x4 of 256px frames. The ten that
shipped were cut from footage and they are SPARSE, CHUNKY line art: about 15%
of the disc is lit, in blocks roughly four screen pixels across, hard-edged,
around twenty colours. runeFire is 15 KB.

A generated 128px sigil is nothing like that — it is a dense, finely detailed
medallion, ~65% covered and dark-filled. Dropped in as-is it baked to 375 KB,
twenty-five times the budget the kit is built around ("a fireball costs one
176 KB sheet and a rune disc, not the whole 6.9 MB library"), and it would
have read as an opaque plate occluding the board rather than as light.

Two passes fix it, and both are free:

  emissive keying   alpha follows luminance, so the dark fill drops out and
                    only the bright lines survive. A medallion becomes a ring
                    of light, which is what the slot wants.
  chunk to a grid   resample to GRID px (32 by default) before rotating, then
                    nearest-upscale. That is what produces the blocky pixels
                    of the shipped art, and it is what gets the sheet back
                    under 16 KB — measured 15.9 KB against runeFire's 15.2 KB,
                    at 15.7% coverage against its 15.1%.

Rotating the SMALL grid and upscaling after keeps every block square; rotating
at 256px and shrinking leaves soft edges, which both looks wrong and triples
the file.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

import numpy as np
from PIL import Image

CELL, COLS, ROWS = 256, 4, 4
FRAMES = COLS * ROWS


def emissive(im: Image.Image, floor: float, gamma: float, gain: float) -> Image.Image:
    """Alpha follows brightness: dark fill drops out, bright lines stay and lift."""
    a = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    k = np.clip((lum - floor) / (255.0 - floor), 0, 1) ** gamma
    # Crisp alpha, never a gradient: a soft edge is what makes these files huge.
    a[..., 3] = np.where(k > 0.15, 255, 0) * (al > 8)
    a[..., :3] = np.clip(rgb * np.clip(1.0 + 1.1 * k[..., None], 1, 2.4) * gain, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def bake(src: Path, out_dir: Path, key: str, fps: int, gain: float,
         grid: int, floor: float, colors: int, quality: int) -> dict:
    glyph = emissive(Image.open(src).convert("RGBA"), floor, 1.2, gain)
    small = glyph.resize((grid, grid), Image.NEAREST)

    sheet = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
    for i in range(FRAMES):
        # Spin one full turn over the loop, rotating at grid scale so the
        # blocks stay square, then up to the cell with nearest.
        f = small.rotate(-360.0 * i / FRAMES, resample=Image.NEAREST, expand=False)
        sheet.alpha_composite(f.resize((CELL, CELL), Image.NEAREST), ((i % COLS) * CELL, (i // COLS) * CELL))

    alpha = sheet.getchannel("A").point(lambda p: 255 if p > 110 else 0)
    out_im = sheet.convert("RGB").quantize(colors=colors, method=Image.FASTOCTREE).convert("RGBA")
    out_im.putalpha(alpha)

    out = out_dir / f"{key}.webp"
    out_im.save(out, "WEBP", quality=quality, method=6)
    cov = float((np.array(out_im)[..., 3] > 8).mean())
    return {"file": out.name, "bytes": out.stat().st_size, "cols": COLS, "rows": ROWS,
            "frames": FRAMES, "fps": fps}, cov


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("glyph")
    ap.add_argument("key", help="manifest key, e.g. runeNecromancy")
    ap.add_argument("--fps", type=int, default=14)
    ap.add_argument("--gain", type=float, default=1.0,
                    help="brightness multiplier; illusion is drawn faint on purpose and needs a lift")
    ap.add_argument("--grid", type=int, default=32, help="chunk size before rotation; 32 matches the shipped art")
    ap.add_argument("--floor", type=float, default=55, help="luminance below which a pixel is fill, not line")
    ap.add_argument("--colors", type=int, default=20, help="shipped runes carry about twenty")
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--vfx", default="public/vfx")
    a = ap.parse_args()

    vfx = Path(a.vfx)
    entry, cov = bake(Path(a.glyph), vfx, a.key, a.fps, a.gain, a.grid, a.floor, a.colors, a.quality)
    mf = vfx / "manifest.json"
    m = json.loads(mf.read_text())
    m[a.key] = entry
    mf.write_text(json.dumps(dict(sorted(m.items())), indent=2) + "\n")
    print(f"  {a.key:22} {entry['bytes']:>7,} B  coverage {100*cov:4.1f}%")


if __name__ == "__main__":
    main()
