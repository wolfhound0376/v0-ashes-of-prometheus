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


def glyph_band(ring: Image.Image) -> tuple[float, float]:
    """
    Radii (as a fraction of the half-cell) of the annulus the glyphs sit in.

    Anchored to the disc's OUTER EDGE, not to its densest ring. The first cut
    took the busiest radius and got r=0.12-0.30 — the centre star, which is
    solid and therefore densest, while the runes Sam means are the outer band.
    Lifting the middle reads as the sigil breathing; lifting the outer band
    reads as icons lighting one after another, which is the ask.
    """
    a = np.asarray(ring).astype(np.float32)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt((yy - h / 2.0) ** 2 + (xx - w / 2.0) ** 2) / (h / 2.0)
    lit = (a[..., 3] > 8) & (luma(a[..., :3]) > 60)
    step = 0.05
    outer = 0.0
    for t in np.arange(0, 1.0, step):
        m = (r >= t) & (r < t + step)
        if m.any() and lit[m].mean() > 0.20:
            outer = float(t + step)
    if outer <= 0:
        return 0.55, 0.95
    return max(0.15, outer * 0.62), outer


def chase_ring(ring: Image.Image, count: int, cols: int, lift: float, arc: float) -> Image.Image:
    """
    Light the glyphs progressively round the band, as a head with a tail behind
    it (Sam, 2026-09-28: "glow brighter progressively as the disc spins").

    This is a SHEET animation, and it stacks with the renderer's own rotation
    rather than replacing it: the plane keeps turning about Y, and the bright
    head travels round the art at its own rate. Two motions at once is the
    point — bake the head at the same rate as the spin and it would sit still
    in world space and look painted on.

    The sweep is computed in the UN-SQUASHED circle, so the angle is a real
    angle. Measuring it on the drawn ellipse would bunch the head up at the
    left and right edges and race it through top and bottom.

    TWO THINGS THAT LOOKED FINE AND WERE WRONG:

    The lift BLENDS TOWARD A HOT COLOUR, it does not scale RGB. Multiplying
    clips the red channel first on an already-hot orange, so the head drifted
    yellow-green — visibly off-palette on art whose colours were the whole
    point. Blending keeps the hue and only adds heat.

    Only the GLYPH ANNULUS lifts, not the whole disc. Lifting everything
    brightens the centre star and the outer rim with it, and the result reads
    as the sigil breathing rather than as icons lighting in turn.

    Only LIT pixels lift either way: the alpha is keyed off luminance, so
    raising the black field would quietly gain coverage and start occluding
    the board.
    """
    w, h = ring.size
    a = np.asarray(ring).astype(np.float32)
    r0, r1 = glyph_band(ring)
    yy, xx = np.mgrid[0:h, 0:w]
    ang = np.arctan2(yy - h / 2.0, xx - w / 2.0)
    rad = np.sqrt((yy - h / 2.0) ** 2 + (xx - w / 2.0) ** 2) / (h / 2.0)
    band = ((rad >= r0) & (rad <= r1)).astype(np.float32)
    # soften the annulus edges so the head does not cut off at a hard radius
    band = np.clip(band + 0.45 * ((rad >= r0 - 0.08) & (rad <= r1 + 0.08)), 0, 1)
    hot = np.array([255.0, 233.0, 176.0])       # heat, not white: white greys the gold
    rows = (count + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * w, rows * h), (0, 0, 0, 0))
    for i in range(count):
        phase = 2 * np.pi * i / count
        d = (ang - phase + np.pi) % (2 * np.pi) - np.pi
        tail = np.where(d <= 0, np.exp(d / max(1e-3, arc)), 0.0)
        k = (np.clip(lift, 0, 1) * tail * band)[..., None]
        rgbf = a[..., :3]
        frame = a.copy()
        frame[..., :3] = np.clip(rgbf + (hot - rgbf) * k, 0, 255)
        sheet.paste(Image.fromarray(frame.astype(np.uint8), "RGBA"), ((i % cols) * w, (i // cols) * h))
    return sheet


def bake_plume(frames: list[np.ndarray], clean: np.ndarray, top: int, pal: np.ndarray,
               px: int, cw: int, ch: int, cols: int, count: int, width: float) -> Image.Image:
    """
    `width` is the fraction of the source taken for the flames, centred.

    THE FLAMES BELONG IN THE MIDDLE OF THE SIGIL (Sam, 2026-09-28). The
    renderer sets the plume at the sigil's own centre and billboards it
    upright (target-sigil.ts: `plume.mesh.position.set(at.x, ...)`), so a
    sheet baked across the ring's full width puts fire on the rim where there
    is no quad to hold it, and the column reads as sitting in front of the
    circle rather than rising out of it.

    A first cut took the full width for exactly that reason and it was wrong:
    the source draws fire all round the band because the SOURCE is a single
    flat image, not because the board has anywhere to put it.
    """
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
        full = Image.fromarray(d.clip(0, 255).astype(np.uint8), "RGB").crop((0, 0, d.shape[1], top + 20))
        keep = max(0.05, min(1.0, width))
        half = int(full.width * keep / 2)
        im = full.crop((full.width // 2 - half, 0, full.width // 2 + half, full.height))
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
    ap.add_argument("--plume-w", type=int, default=192)
    ap.add_argument("--flame-width", type=float, default=0.46, metavar="0..1",
                    help="fraction of the source width taken for the flames, centred on the sigil")
    ap.add_argument("--plume-h", type=int, default=256)
    ap.add_argument("--frames", type=int, default=12)
    ap.add_argument("--cols", type=int, default=4)
    ap.add_argument("--colors", type=int, default=8, help="flame ramp steps")
    ap.add_argument("--chase", type=int, default=12, metavar="N",
                    help="ring frames with a travelling glow; 1 = a static ring")
    ap.add_argument("--chase-lift", type=float, default=0.75, metavar="0..1",
                    help="how far the head blends toward hot; 0 is off, 1 is full heat")
    ap.add_argument("--chase-arc", type=float, default=0.85,
                    help="tail length in radians; larger is a longer comet")
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
    ring_sheet = ring if a.chase <= 1 else chase_ring(ring, a.chase, a.cols, a.chase_lift, a.chase_arc)
    plume = bake_plume(frames, clean, top, pal, a.px, a.plume_w, a.plume_h, a.cols, a.frames,
                       a.flame_width)

    print(f"  source        {len(frames)} frames, ring band top={top} centre={centre}")
    print(f"  drawn ellipse {ratio:.2f}:1   (board camera is {BOARD_RATIO:.2f}:1)")
    if abs(ratio - BOARD_RATIO) > 0.25:
        print(f"  NOTE the art is drawn at a different angle from the board's camera, so the")
        print(f"       ring will read {'rounder' if ratio > BOARD_RATIO else 'flatter'} on the board than in the source.")
    print("  flame ramp    " + " ".join("#%02X%02X%02X" % tuple(int(v) for v in c) for c in pal))
    print(f"  ring          coverage {coverage(ring_sheet):4.1f}%"
          + ("" if a.chase <= 1 else
             f"   chase {a.chase} frames, glyph band r={glyph_band(ring)[0]:.2f}-{glyph_band(ring)[1]:.2f}"))
    print(f"  plume         coverage {coverage(plume):4.1f}%   ({a.plume_w // a.px}x{a.plume_h // a.px} px art)")
    for name, im in (("ring", ring_sheet), ("plume", plume)):
        if coverage(im) > 70:
            print(f"  WARNING {name} keys at >70% — it will render as an opaque plate, not as light.")

    # A SOURCE WITH NO IGNITE HAS NO PLUME, and the failure is silent without
    # this. The whole split rests on frame 0 being the ring BEFORE the fire:
    # a source that simply loops — steady mean luminance, only a shimmer
    # between frames — leaves `frame - frame0` as noise, so the plume bakes
    # near-empty and the flame ramp is quantised from dither speckle rather
    # than from any real fire. Both sheets still write, the manifest still
    # looks right, and nothing shows up until someone casts the spell.
    if coverage(plume) < 3.0:
        print(f"  ERROR the plume is empty ({coverage(plume):.1f}% coverage).")
        print("        This source never ignites — its frames differ only by a shimmer, so")
        print("        there is no fire to separate from the ring. The ring above is fine.")
        print("        Bake the ring from this source and take the plume from art that has")
        print("        one, or give the school a plume of its own; SigilArt requires both.")
        raise SystemExit(2)

    if a.dry_run:
        print("  dry run — nothing written")
        return

    entries = {}
    for suffix, im, meta in (
        ("Ring", ring_sheet,
         {"cols": 1, "rows": 1, "frames": 1, "fps": 1, "loop": False, "peak": 0} if a.chase <= 1 else
         {"cols": a.cols, "rows": (a.chase + a.cols - 1) // a.cols, "frames": a.chase,
          "fps": 12, "loop": True}),
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
