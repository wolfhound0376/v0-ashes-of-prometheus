#!/usr/bin/env python3
"""
Bake a TARGET SIGIL — a rune that lands on the creature and holds — out of a
short animated source (GIF/APNG/frame folder).

    python scripts/vfx/bake_target_sigil.py <source.gif> sigilNecrotic

WHY THIS IS NOT bake_video_sheet.py
-----------------------------------
That script cuts a sheet out of a real video clip, where the motion is already
dense enough to sample. The sigil sources are hand-made loops of only three or
four keys — Sam's necrotic sigil is 4 frames over 940 ms, about 4 fps. Sampled
straight it reads as a slideshow, and there is no video to go back to.

So this INTERPOLATES: each pair of consecutive keys is cross-faded into
`--steps` frames, which turns 4 keys into 12 and the loop into something that
churns instead of ticking. Cross-fading a swirling plume ghosts a little, and
on additive smoke that reads as turbulence rather than as a defect.

ONE-SHOT, NOT A LOOP — and this cost a rebake to learn. Sam's necrotic sigil
LOOKS like a breathing loop and is not one: its four keys run 18.5 -> 35.2 ->
48.1 -> 14.9 mean luminance, which is an ignite, a peak, and a fade. Baked as
a loop it cycled back through the fade every 940 ms, so the sigil guttered out
and relit under the target forever.

So the wrap pair is NOT interpolated, the sheet is marked `loop: false`, and
the manifest records `peak` — the frame where the bloom tops out. The hold,
while the save is being rolled, is the renderer parking on `peak`; the sheet
supplies the bloom and the fade and nothing else.

ALPHA is keyed from luminance, as everywhere else in public/vfx: the sources
are drawn on black, the sheets draw additively, and a hard black fill would
otherwise sit on the board as an opaque plate occluding the squares under it.

TWO LAYERS, because the ring has to turn (Sam, 2026-09-28): "the ring should
stay horizontal and the magic should radiate and permeate while the ring
rotates clockwise." A billboarded quad cannot rotate about the vertical axis —
turn it and the whole plate visibly tips over — so the ring must be a real
horizontal plane, and the rising plume cannot share that plane or it would be
painted onto the floor. The source is therefore split along the ring band:

  <key>Ring    the sigil circle, UN-SQUASHED. Sam drew it as a 2.04:1 ellipse
              because that is what the board's dimetric camera does to a
              circle; laid flat as drawn the camera would squash it again into
              roughly 4:1. Stretched back here, the camera restores exactly
              the ellipse he drew — and it can now spin without wobbling.
  <key>Plume   the rising energy, left alone and billboarded upright.

MASK SHAPE IS LOAD-BEARING. The vertical masks must be (H, 1, 1), never
(H, 1): numpy aligns trailing axes, so an (H, 1) mask multiplied into an
(H, W, 3) frame is applied across COLUMNS and wipes the left half of every
frame instead of banding it by row. That bug shipped a half-ring through two
rebakes before a column-profile measurement caught it.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "vfx"


def load_keys(src: Path) -> list[np.ndarray]:
    im = Image.open(src)
    n = getattr(im, "n_frames", 1)
    keys = []
    for i in range(n):
        im.seek(i)
        keys.append(np.asarray(im.convert("RGB")).astype(np.float32))
    return keys


def interpolate(keys: list[np.ndarray], steps: int, wrap: bool) -> list[np.ndarray]:
    """Cross-fade each key into the next. `wrap` joins the last back to the first."""
    out = []
    pairs = len(keys) if wrap else len(keys) - 1
    for i in range(pairs):
        a, b = keys[i], keys[(i + 1) % len(keys)]
        for s in range(steps):
            out.append(a * (1 - s / steps) + b * (s / steps))
    if not wrap:
        out.append(keys[-1])
    return out


def peak_of(frames: list[np.ndarray]) -> int:
    """The brightest frame — where the bloom tops out and the hold parks."""
    return max(range(len(frames)), key=lambda i: float(frames[i].mean()))


def key_alpha(rgb: np.ndarray, gain: float, floor: float) -> np.ndarray:
    """Alpha from luminance, so the black field drops out and light survives."""
    lum = (0.2126 * rgb[:, :, 0] + 0.7152 * rgb[:, :, 1] + 0.0722 * rgb[:, :, 2]) / 255.0
    a = np.clip((lum - floor) / max(1e-6, 1 - floor), 0, 1) ** (1 / max(1e-6, gain))
    return (a * 255).astype(np.uint8)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path)
    ap.add_argument("key", help="manifest key, e.g. sigilNecrotic")
    ap.add_argument("--steps", type=int, default=3, help="interpolated frames per key pair")
    ap.add_argument("--cell", type=int, default=320)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--gain", type=float, default=1.35, help=">1 lifts the faint smoke")
    ap.add_argument("--floor", type=float, default=0.03, help="luminance below this is fully clear")
    args = ap.parse_args()

    keys = load_keys(args.source)
    frames = interpolate(keys, args.steps)
    n = len(frames)
    cols = args.cols
    rows = (n + cols - 1) // cols
    cell = args.cell

    sheet = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        rgb = np.clip(f, 0, 255)
        a = key_alpha(rgb, args.gain, args.floor)
        img = Image.fromarray(
            np.dstack([rgb.astype(np.uint8), a]), "RGBA"
        ).resize((cell, cell), Image.LANCZOS)
        sheet.paste(img, ((i % cols) * cell, (i // cols) * cell))

    dest = OUT / f"{args.key}.webp"
    sheet.save(dest, "WEBP", quality=88, method=6)

    fps = round(n / (sum(Image.open(args.source).info.get("duration", 200) for _ in [0]) * len(keys) / 1000.0), 1)
    man_path = OUT / "manifest.json"
    man = json.loads(man_path.read_text())
    man[args.key] = {
        "file": f"{args.key}.webp",
        "bytes": dest.stat().st_size,
        "cols": cols,
        "rows": rows,
        "frames": n,
        "fps": int(round(fps)) or 13,
        "loop": True,
    }
    man_path.write_text(json.dumps(man, indent=1, sort_keys=True) + "\n")
    print(f"{args.key}: {n} frames {cols}x{rows} cell {cell} -> {dest.stat().st_size//1024} KB, fps {man[args.key]['fps']}")


if __name__ == "__main__":
    main()
