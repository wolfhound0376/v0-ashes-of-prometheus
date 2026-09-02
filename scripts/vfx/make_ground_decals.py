#!/usr/bin/env python3
"""
Bake the AoE ground-decal sprite sheets for Ashes of Prometheus.

Eight sheets, one per DecalKind in lib/aoe-visual.ts, each a 4x4 flipbook of
16 frames showing the mark burning in over its bloom.

THREE CONSTRAINTS DRIVE EVERY DESIGN CHOICE HERE
================================================

1. SEAMLESS. Each frame is stamped onto ONE 5 ft square, and a Fireball lays
   down sixty-nine of them edge to edge. Any feature that stops at the frame
   border draws a grid line across the blast. So all noise is periodic: the
   right edge continues into the left, the bottom into the top.

2. ROTATION-TOLERANT. The renderer turns each square's UVs a random quarter
   turn to break up the tiling (see turnFor in aoe-decal.ts). A frame with an
   up-direction — a flame licking upward, a rune with a top — would show four
   different up-directions across one blast. So nothing here has an axis.

3. GROWS BY COVERAGE, NOT BY RADIUS. The obvious animation is a circle
   expanding from the middle of the frame. Tiled, that is sixty-nine
   expanding circles, which reads as polka dots rather than as one spreading
   burn. Instead the mark is a noise field under a falling threshold: more of
   it appears each frame, everywhere at once, the way a real burn spreads
   into whatever was going to catch first.

Writes .webp with alpha into public/vfx/ and merges the entries into
public/vfx/manifest.json, leaving the existing cast sheets untouched.
"""

import json
import os
import sys
import numpy as np
from PIL import Image, ImageFilter

FRAME = 128          # px per frame
COLS, ROWS = 4, 4
FRAMES = COLS * ROWS
SIZE = FRAME * COLS  # 512 x 512 sheet

rng = np.random.default_rng(0xA5E5)  # fixed: the art must be reproducible

# ── how much floor each mark is allowed to cover ─────────────────────────────
#
# THE MOST IMPORTANT NUMBERS IN THIS FILE, and the ones that were wrong first
# time: every mark grew until it was a solid sheet of colour. Sixty-nine solid
# squares do not read as a scorched floor, they read as a tarpaulin, and they
# hide the floor art the blast is supposed to be landing ON — which is Sam's
# standing rule for the board: edges, not fills.
#
# So each kind is given a coverage budget: the fraction of the frame its
# finished mark may occupy. These are not guesses. CEILINGS below is solved
# for numerically by calibrate(), binary-searching each threshold until the
# baked frame 15 actually measures its target.
TARGET_COVER = {
    "groundScorch":   0.55,  # a burn is nearly complete, but always cracked
    "groundFrost":    0.36,  # rime, not a snowfield
    "groundShock":    0.20,  # forks and nothing else
    "groundPoison":   0.50,  # a pool with its edges still creeping
    "groundWeb":      0.28,  # strands and the holes you see the rogue through
    "groundGloom":    0.45,
    "groundHallowed": 0.38,  # filigree and glow, never a gold floor
    "groundArcane":   0.32,
}

# Solved by calibrate(). Edit TARGET_COVER, not this.
CEILINGS = {
    "groundScorch": 0.72, "groundFrost": 0.62, "groundShock": 0.30,
    "groundPoison": 0.70, "groundWeb": 0.34, "groundGloom": 0.66,
    "groundHallowed": 0.74, "groundArcane": 0.48,
}


# ── periodic noise ───────────────────────────────────────────────────────────

def _periodic_octave(n: int, cells: int) -> np.ndarray:
    """One octave of value noise on an n x n grid, wrapping at the edges."""
    g = rng.random((cells, cells))
    # Tile by one so interpolation at the last cell wraps to the first.
    g = np.pad(g, ((0, 1), (0, 1)), mode="wrap")
    ys = np.linspace(0, cells, n, endpoint=False)
    xs = np.linspace(0, cells, n, endpoint=False)
    y0 = ys.astype(int); x0 = xs.astype(int)
    fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
    # Smoothstep, so octaves read as soft blobs rather than diamonds.
    fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
    a = g[np.ix_(y0, x0)]; b = g[np.ix_(y0, x0 + 1)]
    c = g[np.ix_(y0 + 1, x0)]; d = g[np.ix_(y0 + 1, x0 + 1)]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(n: int, base: int, octaves: int = 4, gain: float = 0.5) -> np.ndarray:
    """Fractal noise, normalised 0..1, periodic on n."""
    out = np.zeros((n, n)); amp = 1.0; tot = 0.0; cells = base
    for _ in range(octaves):
        out += amp * _periodic_octave(n, cells)
        tot += amp; amp *= gain; cells *= 2
    out /= tot
    return (out - out.min()) / (np.ptp(out) + 1e-9)


def ridged(n: int, base: int, octaves: int = 4) -> np.ndarray:
    """Filament noise — bright along the ridges. Lightning, webs, cracks."""
    f = fbm(n, base, octaves)
    r = 1.0 - np.abs(f * 2 - 1)
    return (r - r.min()) / (np.ptp(r) + 1e-9)


def smooth(a: np.ndarray, px: float) -> np.ndarray:
    """Periodic blur, so the wrap survives it."""
    if px <= 0:
        return a
    n = a.shape[0]
    big = np.tile(a, (3, 3))
    im = Image.fromarray((np.clip(big, 0, 1) * 255).astype(np.uint8), "L")
    im = im.filter(ImageFilter.GaussianBlur(px))
    return np.asarray(im, dtype=np.float32)[n:2 * n, n:2 * n] / 255.0


# ── the mark ─────────────────────────────────────────────────────────────────

def coverage(field: np.ndarray, t: float, lo: float, hi: float, soft: float):
    """
    Threshold `field` so coverage grows with t.

    Low values in `field` appear FIRST and the threshold rises, so coverage
    grows with t. That direction matters for the filament marks: pass them
    an INVERTED ridge field and the strands (ridges) come in first and then
    thicken, which is how a web is spun and how a crack propagates. Pass the
    ridges the right way up and you grow the gaps between them instead —
    which is the same picture in reverse, and reads as the mark healing.

    Returns (body, rim): how much of the mark is here, and how close this
    pixel is to the advancing frontier. The rim is what carries the heat —
    embers on a scorch, glare on a shock — and it is the difference between
    a mark that looks like it is happening and one that looks like a stain.
    """
    thr = lo + (hi - lo) * t
    body = np.clip((thr + soft - field) / (2 * soft), 0, 1)
    edge = np.exp(-((field - thr) ** 2) / (2 * (soft * 0.9) ** 2))
    return body, edge * body


def grain() -> np.ndarray:
    """
    The fine surface texture under a mark. Built ONCE per sheet.

    It used to be drawn inside tint(), which meant every one of the sixteen
    frames got a different one — so the mark did not burn in, it boiled: the
    body reshuffled its own grain every frame at 18fps. Caught by calibration
    disagreeing with the baked result, which is the tell that something is
    drawing fresh randomness where it should be reading a fixed field.
    """
    return smooth(fbm(FRAME, 16, 4), 0.6)[..., None]


def tint(body, rim, dark, mid, hot, tex, glow=1.0):
    """Compose a mark: dark body, mid tone through it, hot advancing edge."""
    base = np.array(dark, np.float32) * (0.75 + 0.5 * tex)
    base = base + (np.array(mid, np.float32) - base) * (body[..., None] ** 1.6)
    rgb = base + np.array(hot, np.float32) * (rim[..., None] * glow)
    return np.clip(rgb, 0, 1)


def sheet(name: str, frame_fn) -> dict:
    """Bake 16 frames into one 4x4 RGBA sheet."""
    canvas = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    for i in range(FRAMES):
        t = i / (FRAMES - 1)
        rgb, alpha = frame_fn(t)
        arr = np.dstack([
            np.clip(rgb, 0, 1) * 255,
            np.clip(alpha, 0, 1) * 255,
        ]).astype(np.uint8)
        canvas.paste(Image.fromarray(arr, "RGBA"),
                     ((i % COLS) * FRAME, (i // COLS) * FRAME))
    out = os.path.join(VFX, f"{name}.webp")
    canvas.save(out, "WEBP", lossless=True, quality=80, method=6)
    return {"file": f"{name}.webp", "cols": COLS, "rows": ROWS,
            "frames": FRAMES, "fps": 18, "bytes": os.path.getsize(out)}


# ── the eight ────────────────────────────────────────────────────────────────
# Each returns (rgb, alpha) for a given t in 0..1. Fields are built once,
# outside the closure, so all 16 frames of a sheet are the same burn caught at
# 16 moments rather than 16 unrelated burns.

def scorch():
    f = smooth(fbm(FRAME, 5, 5), 1.0); tex = grain()
    def frame(t):
        body, rim = coverage(f, t, 0.12, CEILINGS["groundScorch"], 0.10)
        # Embers cool: the rim is molten as it advances and dulls behind it.
        heat = rim * (1.0 - 0.55 * t)
        rgb = tint(body, heat, (0.05, 0.03, 0.03), (0.14, 0.10, 0.09),
                   (1.0, 0.42, 0.10), tex, glow=1.5)
        return rgb, body * 0.95
    return frame


def frost():
    # Inverted: rime creeps along the crystal ridges first, then fills.
    f = smooth(1.0 - ridged(FRAME, 6, 5), 0.5); tex = grain()
    def frame(t):
        body, rim = coverage(f, t, 0.10, CEILINGS["groundFrost"], 0.11)
        rgb = tint(body, rim, (0.30, 0.44, 0.55), (0.72, 0.88, 0.98),
                   (0.95, 1.0, 1.0), tex, glow=1.2)
        return rgb, body * 0.88
    return frame


def shock():
    # Sharpened hard: a fork is a thin bright line, not a smear. The power
    # pushes everything but the ridge crests down toward black.
    f = smooth(1.0 - ridged(FRAME, 4, 6) ** 3, 0.25); tex = grain()
    def frame(t):
        # Strikes almost at once, then the crazing dulls to a burn.
        body, rim = coverage(f, min(1.0, t * 2.4), 0.03, CEILINGS["groundShock"], 0.05)
        flash = max(0.0, 1.0 - t * 1.8)
        rgb = tint(body, rim, (0.06, 0.07, 0.12), (0.20, 0.28, 0.42),
                   (0.80, 0.92, 1.0), tex, glow=1.1 + 2.2 * flash)
        return rgb, body * (0.92 - 0.25 * t)
    return frame


def poison():
    f = smooth(fbm(FRAME, 4, 4), 2.0); tex = grain()
    # One bubble field for the whole sheet. Drawn per frame it was not
    # bubbling, it was static — a different random pattern every frame reads
    # as noise, not as motion. Held still, the band that "pops" sweeps
    # through it as t rises, and THAT is the bubbling.
    bub = smooth(fbm(FRAME, 14, 3), 0.4)
    def frame(t):
        body, rim = coverage(f, t, 0.12, CEILINGS["groundPoison"], 0.14)
        # A moving band of the held bubble field surfaces through the pool.
        pop = np.clip(1.0 - np.abs(bub - (0.35 + 0.4 * t)) / 0.05, 0, 1) * body
        rgb = tint(body, rim + pop * 0.8, (0.10, 0.17, 0.05),
                   (0.32, 0.52, 0.12), (0.72, 1.0, 0.30), tex, glow=1.0)
        return rgb, body * 0.86
    return frame


def web():
    # Two ridge fields crossed, which reads as strands anchoring to strands
    # rather than as one directionless tangle.
    a = ridged(FRAME, 3, 5) ** 2.5
    b = ridged(FRAME, 7, 4) ** 2.5
    f = smooth(1.0 - np.maximum(a, b * 0.9), 0.22); tex = grain()
    def frame(t):
        # A tight ceiling: a web is strands and holes. Let this flood and it
        # becomes a sheet of pale mush with no holes to see the floor through.
        body, rim = coverage(f, t, 0.02, CEILINGS["groundWeb"], 0.05)
        rgb = tint(body, rim * 0.7, (0.42, 0.40, 0.36), (0.86, 0.84, 0.78),
                   (1.0, 1.0, 0.96), tex, glow=0.8)
        return rgb, body * 0.90
    return frame


def gloom():
    # base 3 tiled visibly: three big soft lobes per frame turned into a
    # repeating chevron across a wide area, which is exactly the wallpaper
    # the UV turns are meant to prevent and too large for them to hide.
    f = smooth(fbm(FRAME, 6, 4), 2.0); tex = grain()
    def frame(t):
        body, rim = coverage(f, t, 0.10, CEILINGS["groundGloom"], 0.22)
        # No hot edge at all — a dimming has no frontier, it just thickens.
        rgb = tint(body, rim * 0.25, (0.06, 0.04, 0.12), (0.24, 0.16, 0.40),
                   (0.55, 0.42, 0.85), tex, glow=0.6)
        return rgb, body * 0.72
    return frame


def hallowed():
    f = smooth(fbm(FRAME, 8, 4), 0.8)
    fil = smooth(ridged(FRAME, 10, 4), 0.3); tex = grain()
    def frame(t):
        body, rim = coverage(f, t, 0.14, CEILINGS["groundHallowed"], 0.16)
        # Filigree lights up through the glow as it settles.
        lace = np.clip((fil - 0.62) / 0.38, 0, 1) * body * (0.35 + 0.65 * t)
        rgb = tint(body, rim * 0.8 + lace, (0.26, 0.20, 0.08),
                   (0.62, 0.52, 0.26), (1.0, 0.90, 0.58), tex, glow=1.3)
        return rgb, np.clip(body * 0.66 + lace * 0.5, 0, 1)
    return frame


def arcane():
    f = smooth(1.0 - ridged(FRAME, 5, 5) ** 2, 0.35); tex = grain()
    def frame(t):
        body, rim = coverage(f, t, 0.06, CEILINGS["groundArcane"], 0.09)
        rgb = tint(body, rim, (0.07, 0.12, 0.20), (0.20, 0.38, 0.58),
                   (0.66, 0.88, 1.0), tex, glow=1.2)
        return rgb, body * 0.80
    return frame


KINDS = {
    "groundScorch": scorch, "groundFrost": frost, "groundShock": shock,
    "groundPoison": poison, "groundWeb": web, "groundGloom": gloom,
    "groundHallowed": hallowed, "groundArcane": arcane,
}

def calibrate(rounds: int = 22) -> None:
    """
    Solve CEILINGS so each mark actually measures its TARGET_COVER.

    Binary search on the threshold ceiling, measuring the alpha of the final
    frame. Done numerically because the fields are noise: the coverage a given
    threshold produces depends on the shape of that kind's histogram, and
    eyeballing it is what produced eight solid sheets on the first pass.
    """
    for name, build in KINDS.items():
        lo, hi = 0.02, 0.99
        for _ in range(rounds):
            CEILINGS[name] = mid = (lo + hi) / 2
            _, alpha = build()(1.0)
            if float(np.clip(alpha, 0, 1).mean()) > TARGET_COVER[name]:
                hi = mid
            else:
                lo = mid
        CEILINGS[name] = round((lo + hi) / 2, 4)
    print("calibrated ceilings:")
    for k, v in CEILINGS.items():
        print(f"    {k + chr(58):18s} {v:.4f}")


if __name__ == "__main__":
    VFX = sys.argv[1] if len(sys.argv) > 1 else "public/vfx"
    mpath = os.path.join(VFX, "manifest.json")
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    calibrate()
    for name, build in KINDS.items():
        man[name] = sheet(name, build())
        print(f"  {name:16s} {man[name]['bytes'] // 1024:4d} KB")
    json.dump(dict(sorted(man.items())), open(mpath, "w"), indent=2, sort_keys=True)
    print(f"manifest: {len(man)} sheets")
