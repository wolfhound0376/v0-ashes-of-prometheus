#!/usr/bin/env python3
"""
Bake a SCHOOL SIGIL — flat painted ring + upright pixel flames — from one
animated source.

    python scripts/vfx/bake_school_sigil.py <source.gif> Evocation
    python scripts/vfx/bake_school_sigil.py <source.gif> Evocation --px 3

Produces public/vfx/sigil<School>Ring.webp and sigil<School>Plume.webp and
registers both in the manifest.

WHY THIS EXISTS ALONGSIDE bake_target_sigil.py
----------------------------------------------
That script takes a source whose ring and plume are ALREADY separable by a
horizontal band split. Sam's evocation source is not like that: the fire
erupts THROUGH and AROUND the ring, so any horizontal cut takes flames with
the ring and ring with the flames.

It also cannot be run as committed. Its docstring describes a ring/plume
split, `loop: false` and a recorded `peak`; its main() does none of those —
it never calls its own peak_of(), passes no `wrap` to interpolate(), does no
split, and writes `loop: True`. Every shipped sigil has `loop: false` and a
`peak`, so it cannot have produced them. Left alone rather than half-fixed:
this file is the complete path for sources shaped like Sam's.

THE FOUR THINGS THAT MAKE THIS WORK
-----------------------------------

1. THE FIRST FRAME IS THE MASK. A source drawn as "clean ring, then ignite"
   hands you the separation for free: frame 0 is the ring with no fire, so
   `frame[i] - frame[0]` IS the flames and frame 0 IS the ring. No hand-drawn
   matte, and it cannot drift out of register with the art.

2. THE RING STILL BLEEDS, because it GLOWS while it burns — the subtraction
   leaves its silhouette in the difference. A vertical fade above the ring's
   top edge removes it.

   That mask must be (H, 1, 1), NEVER (H, 1). numpy aligns trailing axes, so
   an (H, 1) mask against an (H, W, 3) frame applies across COLUMNS and wipes
   half of every frame instead of banding it by row. bake_target_sigil.py
   records that exact bug shipping a half-ring through two rebakes.

3. UN-SQUASH THE RING, DON'T PRE-TILT IT. The art is drawn as an ellipse
   because that is what the board's dimetric camera does to a circle. The
   engine lays the ring FLAT and spins it about Y (target-sigil.ts:
   `ring.mesh.rotateZ(pose.spin)`), so the sheet must hold a true CIRCLE —
   the camera re-applies the squash. Ship the ellipse as drawn and the camera
   squashes it twice; spin the ellipse in 2D and the whole plate tips over
   instead of turning.

   The sheet is therefore ONE STATIC FRAME. The rotation belongs to the
   renderer. Bake a spin into the frames and you get two rotations at once.

4. THE PALETTE COMES FROM THE SOURCE, NOT FROM TASTE. Sam: "keep the same
   colors and paint it the same way with pixels." So the flame ramp is
   quantised out of his own fire pixels.

   Filter to WARM pixels first (r > b). A P-mode GIF carries dither speckle,
   and sampling raw pulled #244D2C and #195B57 — green and teal — into a fire
   palette on the first run.

BUDGET. The shipped sigils run 184-287 KB per layer. Painted ring plus pixel
flames comes in far under: evocation measured 58 KB and 20 KB. Coverage is
the number that matters more than bytes — a sheet keying at 97% renders as an
opaque plate over the board instead of as light. The shipped sigils sit near
43%; this prints coverage so a bad key is caught before it ships.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "vfx"

#: What the board's dimetric camera does to a circle. The ring is stretched
#: back out by the ratio it was DRAWN at, then the camera re-applies this.
BOARD_RATIO = 2.04


def frames_of(src: Path) -> list[np.ndarray]:
    im = Image.open(src)
    n = getattr(im, "n_frames", 1)
    out = []
    for i in range(n):
        im.seek(i)
        out.append(np.asarray(im.convert("RGB")).astype(np.float32))
    return out


def luma(a: np.ndarray) -> np.ndarray:
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def ring_band(clean: np.ndarray, thresh: float = 45.0) -> tuple[int, int, float]:
    """Top row, centre row and drawn ellipse ratio, measured off the art."""
    lit = luma(clean) > thresh
    widths = np.array([
        (np.nonzero(r)[0][-1] - np.nonzero(r)[0][0]) if r.any() else 0 for r in lit
    ])
    rows = np.nonzero(widths > widths.max() * 0.30)[0]
    height = max(1, int(rows[-1] - rows[0]))
    return int(rows[0]), int(widths.argmax()), float(widths.max()) / height


def flame_palette(frames: list[np.ndarray], clean: np.ndarray, colors: int) -> np.ndarray:
    """Quantise a ramp out of the source's own fire. Warm pixels only."""
    lit = []
    for f in frames[::2]:
        d = (f - clean).clip(0, None)
        m = (d.sum(2) > 70) & (d[..., 0] > d[..., 2] * 1.25)
        if m.any():
            lit.append(d[m])
    if not lit:
        raise SystemExit("no flame pixels found — is frame 0 really the clean ring?")
    px = np.concatenate(lit, 0)
    rng = np.random.default_rng(7)          # deterministic: same art, same ramp
    px = px[rng.choice(len(px), size=min(200_000, len(px)), replace=False)]
    pal = Image.fromarray(px.reshape(-1, 1, 3).astype(np.uint8), "RGB").quantize(
        colors=colors, method=Image.FASTOCTREE)
    cols = np.array(pal.getpalette()[: colors * 3]).reshape(colors, 3)
    return cols[np.argsort(cols.sum(1))].astype(np.float32)


def key_alpha(rgb: np.ndarray, floor: float, gain: float) -> np.ndarray:
    lum = luma(rgb) / 255.0
    return (np.clip((lum - floor) / (1 - floor), 0, 1) ** (1 / gain) * 255).astype(np.uint8)


def bake_ring(clean: np.ndarray, top: int, centre: int, ratio: float, cell: int,
              floor: float, gain: float) -> Image.Image:
    """The painted ring, flame-free, stretched back into a true circle."""
    im = Image.fromarray(np.dstack([clean.astype(np.uint8), key_alpha(clean, floor, gain)]), "RGBA")
    half = centre - top + 40
    band = im.crop((0, max(0, centre - half), im.width, min(im.height, centre + half)))
    circle = band.resize((band.width, int(round(band.height * ratio))), Image.LANCZOS)
    return circle.resize((cell, cell), Image.LANCZOS)


def bake_plume(frames: list[np.ndarray], clean: np.ndarray, top: int, pal: np.ndarray,
               px: int, cw: int, ch: int, cols: int, count: int) -> Image.Image:
    gw, gh = cw // px, ch // px
    sheet = Image.new("RGBA", (cols * cw, ((count + cols - 1) // cols) * ch), (0, 0, 0, 0))
    n = len(frames)
    idxs = [int(round(1 + k * (n - 2) / (count - 1))) for k in range(count)]
    for j, i in enumerate(idxs):
        d = (frames[i] - clean).clip(0, None)
        warm = (d[..., 0] > d[..., 2] * 1.2) & (d.sum(2) > 45)
        d = d * warm[..., None]
        h = d.shape[0]
        # (H, 1, 1) — see the header. (H, 1) wipes half of every frame.
        fade = np.clip((top + 20 - np.arange(h)) / 45.0, 0, 1).reshape(h, 1, 1)
        d = d * fade
        im = Image.fromarray(d.clip(0, 255).astype(np.uint8), "RGB").crop((0, 0, d.shape[1], top + 20))
        a = np.asarray(im.resize((gw, gh), Image.BILINEAR)).astype(np.float32)
        idx = ((a[:, :, None, :] - pal[None, None, :, :]) ** 2).sum(3).argmin(2)
        rgb = pal[idx].astype(np.uint8)
        # Hard alpha. Pixel art has no semi-transparent fringe, and a soft one
        # is what makes these sheets large.
        alpha = np.where(luma(a) > 22, 255, 0).astype(np.uint8)
        quad = Image.fromarray(np.dstack([rgb, alpha]), "RGBA")
        # NEAREST on the way up, or the blocks stop being square.
        sheet.paste(quad.resize((cw, ch), Image.NEAREST), ((j % cols) * cw, (j // cols) * ch))
    return sheet


def coverage(im: Image.Image) -> float:
    return 100.0 * float((np.asarray(im)[..., 3] > 8).mean())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", type=Path, help="animated GIF/APNG whose FIRST frame is the clean ring")
    ap.add_argument("school", help="capitalised, e.g. Evocation -> sigilEvocationRing/Plume")
    ap.add_argument("--px", type=int, default=4, help="pixel block size for the flames")
    ap.add_argument("--ring-cell", type=int, default=256)
    ap.add_argument("--plume-w", type=int, default=320)
    ap.add_argument("--plume-h", type=int, default=256)
    ap.add_argument("--frames", type=int, default=12)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--colors", type=int, default=8, help="flame ramp steps")
    ap.add_argument("--floor", type=float, default=0.05)
    ap.add_argument("--gain", type=float, default=1.25)
    ap.add_argument("--dry-run", action="store_true", help="measure and report, write nothing")
    a = ap.parse_args()

    frames = frames_of(a.source)
    if len(frames) < 4:
        raise SystemExit(f"{a.source} has {len(frames)} frames; this needs the animated source")
    clean = frames[0]
    top, centre, ratio = ring_band(clean)
    pal = flame_palette(frames, clean, a.colors)

    ring = bake_ring(clean, top, centre, ratio, a.ring_cell, a.floor, a.gain)
    plume = bake_plume(frames, clean, top, pal, a.px, a.plume_w, a.plume_h, a.cols, a.frames)

    print(f"  source        {len(frames)} frames, ring band top={top} centre={centre}")
    print(f"  drawn ellipse {ratio:.2f}:1   (board camera is {BOARD_RATIO:.2f}:1)")
    if abs(ratio - BOARD_RATIO) > 0.25:
        print(f"  NOTE the art is drawn at a different angle from the board's camera, so the")
        print(f"       ring will read {'rounder' if ratio > BOARD_RATIO else 'flatter'} on the board than in the source.")
    print("  flame ramp    " + " ".join("#%02X%02X%02X" % tuple(int(v) for v in c) for c in pal))
    print(f"  ring          coverage {coverage(ring):4.1f}%")
    print(f"  plume         coverage {coverage(plume):4.1f}%   ({a.plume_w // a.px}x{a.plume_h // a.px} px art)")
    for name, im in (("ring", ring), ("plume", plume)):
        if coverage(im) > 70:
            print(f"  WARNING {name} keys at >70% — it will render as an opaque plate, not as light.")

    if a.dry_run:
        print("  dry run — nothing written")
        return

    entries = {}
    for suffix, im, meta in (
        ("Ring", ring, {"cols": 1, "rows": 1, "frames": 1, "fps": 1, "loop": False, "peak": 0}),
        ("Plume", plume, {"cols": a.cols, "rows": (a.frames + a.cols - 1) // a.cols,
                          "frames": a.frames, "fps": 12, "loop": True}),
    ):
        key = f"sigil{a.school}{suffix}"
        dest = OUT / f"{key}.webp"
        im.save(dest, "WEBP", quality=90, method=6)
        entries[key] = {"file": dest.name, "bytes": dest.stat().st_size, **meta}
        print(f"  wrote {key:26} {dest.stat().st_size:>7,} B")

    mf = OUT / "manifest.json"
    man = json.loads(mf.read_text())
    man.update(entries)
    mf.write_text(json.dumps(dict(sorted(man.items())), indent=1) + "\n")
    print(f"  manifest updated with {len(entries)} keys")


if __name__ == "__main__":
    main()
