#!/usr/bin/env python3
"""
Bake a strike glyph into the 20-frame impact flipbook the VFX kit expects.

    python scripts/vfx/bake-impact.py <glyph.png> strikePunch

public/vfx/<impact>.webp are 960x768 sheets: 5 cols x 4 rows of 192px frames
at 24 fps. physicalImpact is the reference — a crescent slash that snaps in
bright and small, swells, throws a few speed lines and fades. It is on screen
for well under a second, which is why one drawn glyph plus motion reads as
animation: nobody gets to study it.

The motion, matched to that reference:
  frames 0-3    snap in: small, brightest, no streaks yet
  frames 4-11   swell past full size, streaks extend
  frames 12-19  fade and drift out, holding the shape

Same two lessons as bake-rune.py, for the same reasons: alpha stays CRISP
(a soft edge is what made the first rune sheets 25x their budget), and the
glyph is chunked to a grid before scaling so the pixels stay square.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

import numpy as np
from PIL import Image

CELL, COLS, ROWS = 192, 5, 4
FRAMES = COLS * ROWS


def keyed(im: Image.Image, floor: float, gain: float, keep_alpha: bool) -> Image.Image:
    """Lift the shape, and drop dark fill only when there is dark fill to drop.

    keep_alpha is the default for generated strikes, which already arrive on a
    transparent background. Luminance keying on one of those is not just
    unnecessary, it is destructive: strikeSneak is dark crimson on black by
    design — mean luminance 15 against the others' 200 — and keying it baked an
    EMPTY sheet, 0% coverage. Only reach for the luminance key on art that has
    a solid disc or plate behind the shape.
    """
    if keep_alpha:
        a = np.array(im.convert("RGBA")).astype(np.float32)
        a[..., :3] = np.clip(a[..., :3] * gain, 0, 255)
        a[..., 3] = np.where(a[..., 3] > 24, 255, 0)
        return Image.fromarray(a.astype(np.uint8), "RGBA")
    a = np.array(im.convert("RGBA")).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    lum = 0.2126 * rgb[..., 0] + 0.7152 * rgb[..., 1] + 0.0722 * rgb[..., 2]
    k = np.clip((lum - floor) / (255.0 - floor), 0, 1)
    a[..., 3] = np.where(k > 0.14, 255, 0) * (al > 8)
    a[..., :3] = np.clip(rgb * np.clip(1.0 + 0.8 * k[..., None], 1, 2.2) * gain, 0, 255)
    return Image.fromarray(a.astype(np.uint8), "RGBA")


def bake(src: Path, out_dir: Path, key: str, fps: int, grid: int,
         floor: float, gain: float, colors: int, quality: int, spin: float,
         keep_alpha: bool = True):
    glyph = keyed(Image.open(src).convert("RGBA"), floor, gain, keep_alpha)
    small = glyph.resize((grid, grid), Image.NEAREST)

    sheet = Image.new("RGBA", (CELL * COLS, CELL * ROWS), (0, 0, 0, 0))
    for i in range(FRAMES):
        t = i / (FRAMES - 1)
        # Snap in over the first fifth, swell past full, then hold.
        scale = 0.42 + 0.95 * min(1.0, t / 0.22) + 0.30 * max(0.0, t - 0.22)
        # Fade only in the back half — an impact is brightest the moment it lands.
        alpha = 1.0 if t < 0.45 else max(0.0, 1.0 - (t - 0.45) / 0.55)
        if alpha <= 0:
            continue
        f = small.rotate(-spin * 360.0 * t, resample=Image.NEAREST, expand=False) if spin else small
        w = max(2, int(grid * scale))
        f = f.resize((w, w), Image.NEAREST).resize((int(CELL * w / grid), int(CELL * w / grid)), Image.NEAREST)
        if alpha < 1.0:
            arr = np.array(f).astype(np.float32)
            arr[..., 3] *= alpha
            f = Image.fromarray(arr.astype(np.uint8), "RGBA")
        cell = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        cell.alpha_composite(f, ((CELL - f.width) // 2, (CELL - f.height) // 2))
        sheet.alpha_composite(cell, ((i % COLS) * CELL, (i // COLS) * CELL))

    alpha_ch = sheet.getchannel("A").point(lambda p: 255 if p > 96 else 0)
    out_im = sheet.convert("RGB").quantize(colors=colors, method=Image.FASTOCTREE).convert("RGBA")
    out_im.putalpha(alpha_ch)
    out = out_dir / f"{key}.webp"
    out_im.save(out, "WEBP", quality=quality, method=6)
    cov = float((np.array(out_im)[..., 3] > 8).mean())
    return {"file": out.name, "bytes": out.stat().st_size, "cols": COLS, "rows": ROWS,
            "frames": FRAMES, "fps": fps}, cov


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("glyph"); ap.add_argument("key")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--grid", type=int, default=48)
    ap.add_argument("--floor", type=float, default=45)
    ap.add_argument("--gain", type=float, default=1.0)
    ap.add_argument("--colors", type=int, default=24)
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--spin", type=float, default=0.0, help="turns across the flipbook; 0 for a held shape")
    ap.add_argument("--luma-key", action="store_true",
                    help="drop dark fill by luminance. Only for art with a solid plate behind it — it empties a dark effect")
    ap.add_argument("--vfx", default="public/vfx")
    a = ap.parse_args()

    vfx = Path(a.vfx)
    entry, cov = bake(Path(a.glyph), vfx, a.key, a.fps, a.grid, a.floor, a.gain, a.colors, a.quality, a.spin,
                      keep_alpha=not a.luma_key)
    mf = vfx / "manifest.json"
    m = json.loads(mf.read_text()); m[a.key] = entry
    mf.write_text(json.dumps(dict(sorted(m.items())), indent=2) + "\n")
    print(f"  {a.key:18} {entry['bytes']:>7,} B  coverage {100*cov:4.1f}%")


if __name__ == "__main__":
    main()
