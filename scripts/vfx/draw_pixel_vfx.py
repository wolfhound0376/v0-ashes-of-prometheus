#!/usr/bin/env python3
"""
Draw the pixel-art projectile and impact sheets — actual pixel art, not a
painting shrunk into blocks.

The first pixel pass (cac7cba) took the painted flipbooks and quantised them
into 4x4 blocks. That made the magic match the sprites' texture, but a
fireball was still a soft radial blob: it had no front, no back, and nothing
to say which way it was going, so the kit could not turn it to face its own
travel. These are drawn the way a sprite artist would draw them — a hard
silhouette with a head at +X and a tail behind, 8 frames of flicker that
loop, on a 3-5 tone ramp with hard alpha — so the kit can point the head at
the target and the tail streams behind it.

Everything here is deterministic (seeded noise), so re-running it produces
byte-identical sheets and a diff only shows what actually changed.

Sheets (all under public/vfx, entries written into manifest.json):

  pxFireball   48x48  8f loop   the ball, head at +X, waving flame tail, embers
  pxMissile    48x48  8f loop   force dart: a sharp violet needle with sparkles
  pxPoison     48x48  8f loop   a green glob with drips behind and bubbles in it
  pxPsychic    48x48  8f loop   a bright core with two crescents orbiting it
  pxFlash      48x48  6f        the white impact flash: star, bloom, rays, dots
  pxRing       64x64  8f        the floor shockwave, drawn flat: ring runs out
  pxSpark       8x8   1f        one spark, the texture the burst particles wear

pxFlash, pxRing and pxSpark are drawn WHITE on purpose: the kit tints them
with the damage type's colour, so one sheet serves every type.

Usage: draw_pixel_vfx.py <public/vfx> [--preview <dir>]
"""

import json
import math
import os
import sys

import numpy as np
from PIL import Image

# ── palettes ─────────────────────────────────────────────────────────────────
# Dark → core. Five tones is what reads as "lit" at this size; more is mud.

def hexes(*hs):
    return [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) + (255,) for h in hs]

FIRE    = hexes("#5a0e00", "#c42600", "#ff6a00", "#ffc21c", "#fff6c8")
FORCE   = hexes("#2a1266", "#5b2bd6", "#8f6bff", "#cfc0ff", "#ffffff")
POISON  = hexes("#123d0c", "#2f8a1f", "#7ee23f", "#c8ff7a", "#f4ffd0")
PSYCHIC = hexes("#3a0a44", "#8a1fa8", "#e04ae8", "#ff9cf5", "#fff0ff")
WHITE   = hexes("#7a7a7a", "#a8a8a8", "#d0d0d0", "#ececec", "#ffffff")

CLEAR = (0, 0, 0, 0)


# ── noise ────────────────────────────────────────────────────────────────────

def _hash(ix, iy, seed):
    h = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def vnoise(x, y, seed):
    """Value noise in [0,1], smooth-stepped between lattice points."""
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    a = _hash(ix, iy, seed);     b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed); d = _hash(ix + 1, iy + 1, seed)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(x, y, seed, octaves=3):
    v, amp, tot = 0.0, 1.0, 0.0
    for o in range(octaves):
        v += vnoise(x * (2 ** o), y * (2 ** o), seed + o) * amp
        tot += amp
        amp *= 0.5
    return v / tot


# ── a canvas that only ever holds whole pixels ───────────────────────────────

class Cell:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = np.zeros((h, w, 4), dtype=np.uint8)

    def put(self, x, y, c):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y, x] = c

    def get(self, x, y):
        x, y = int(x), int(y)
        if 0 <= x < self.w and 0 <= y < self.h:
            return tuple(self.px[y, x])
        return CLEAR

    def disc(self, cx, cy, r, c):
        for y in range(int(cy - r - 1), int(cy + r + 2)):
            for x in range(int(cx - r - 1), int(cx + r + 2)):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    self.put(x, y, c)

    def ring(self, cx, cy, r, thick, c, jag=0.0, seed=0, dither=False):
        for y in range(self.h):
            for x in range(self.w):
                d = math.hypot(x - cx, y - cy)
                rr = r + (vnoise(x * 0.5, y * 0.5, seed) * 2 - 1) * jag
                if rr - thick / 2 <= d <= rr + thick / 2:
                    if dither and (x + y) % 2:
                        continue
                    self.put(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n):
            t = i / max(1, n - 1)
            self.put(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), c)

    def outline(self, c):
        """One dark pixel around every lit pixel that borders empty space."""
        lit = self.px[..., 3] > 0
        out = np.zeros_like(lit)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sh = np.roll(lit, (dy, dx), axis=(0, 1))
            out |= sh & ~lit
        self.px[out] = c


def tone(ramp, h):
    """Pick a ramp entry from a 0..1 heat — hard steps, no blending."""
    if h <= 0:
        return None
    i = min(len(ramp) - 1, int(h * len(ramp)))
    return ramp[i]


# ── projectiles: head at +X, tail behind ─────────────────────────────────────

def fireball(f, n):
    """A ball of fire with a tail that waves. The head is round and bright;
    the tail narrows over ~28 px and breaks into embers."""
    cell = Cell(48, 48)
    cx, cy = 31.0, 24.0
    ph = f / n
    for y in range(48):
        for x in range(48):
            if x >= cx:
                d = math.hypot(x - cx, (y - cy) * 1.1)
                nz = (fbm(x * 0.22 + ph * 6, y * 0.22, 11) * 2 - 1)
                h = 1 - d / (9.5 + nz * 1.6)
            else:
                back = (cx - x) / 28.0                    # 0 at the head, 1 at the tail tip
                if back > 1:
                    continue
                wave = 2.4 * math.sin(x * 0.42 - ph * 2 * math.pi) * back
                dy = (y - cy) + wave
                nz = (fbm(x * 0.25 - ph * 7, y * 0.25, 12) * 2 - 1)
                radius = 9.0 * (1 - back) ** 0.75 * (1 + 0.45 * nz * (0.3 + back))
                if radius <= 0.5:
                    continue
                h = (1 - abs(dy) / radius) * (1 - 0.55 * back)   # tail is cooler
            c = tone(FIRE, h)
            if c:
                cell.put(x, y, c)
    # Embers: a few loose pixels shed behind the tail, drifting up and back.
    for k in range(5):
        s = _hash(k, f, 77)
        ex = 2 + int(s * 14)
        ey = int(cy + (_hash(k, f, 78) * 2 - 1) * 9 - k * 0.5)
        cell.put(ex, ey, FIRE[2 + (k % 2)])
    return cell


def missile(f, n):
    """Magic Missile: a needle of force. Sharp at the front, a hot white core,
    and three sparkles tumbling in its wake."""
    cell = Cell(48, 48)
    cy = 24
    tip, tail = 43, 7
    for x in range(tail, tip + 1):
        t = (x - tail) / (tip - tail)
        half = 3.6 * math.sin(t ** 0.6 * math.pi) if t < 0.7 else 3.6 * math.sin(0.7 ** 0.6 * math.pi) * ((1 - t) / 0.3)
        for dy in range(-4, 5):
            a = abs(dy) / max(0.5, half)
            if a > 1:
                continue
            h = 1 - a * 0.85
            c = tone(FORCE, h)
            if c:
                cell.put(x, cy + dy, c)
    # Aura: a dithered halo one pixel out, so the needle glows without blur.
    lit = cell.px[..., 3] > 0
    for y in range(48):
        for x in range(48):
            if lit[y, x] or (x + y + f) % 2:
                continue
            if any(0 <= x + dx < 48 and 0 <= y + dy < 48 and lit[y + dy, x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                cell.put(x, y, FORCE[0])
    # Sparkles: small crosses, each at its own phase.
    for k in range(3):
        ph = (f / n + k / 3) % 1
        sx = int(tail - 2 - ph * 12)
        sy = int(cy + math.sin(ph * 2 * math.pi + k) * 5)
        col = FORCE[4] if ph < 0.4 else FORCE[3] if ph < 0.75 else FORCE[2]
        cell.put(sx, sy, col)
        if ph < 0.6:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                cell.put(sx + dx, sy + dy, FORCE[2])
    # A bright flare at the tip on alternate frames.
    if f % 2 == 0:
        cell.put(tip + 1, cy, FORCE[4]); cell.put(tip + 2, cy, FORCE[3])
    return cell


def poison(f, n):
    """A glob of venom: a fat green head, drips trailing, bubbles inside."""
    cell = Cell(48, 48)
    cx, cy = 30.0, 24.0
    ph = f / n
    squash = 1 + 0.08 * math.sin(ph * 2 * math.pi)
    for y in range(48):
        for x in range(48):
            d = math.hypot((x - cx) / (8.5 * squash), (y - cy) / (7.0 / squash))
            if d <= 1:
                # lit from the upper-left, like every sprite on the board
                light = 1 - d * 0.85 + 0.25 * ((cx - x) / 8.5 + (cy - y) / 7.0) * 0.5
                cell.put(x, y, tone(POISON, min(0.99, max(0.05, light))))
    # Drips: three shrinking blobs behind, each bobbing at its own phase.
    for k, (bx, r) in enumerate(((19, 4.2), (11, 3.0), (5, 2.0))):
        by = cy + math.sin(ph * 2 * math.pi + k * 1.9) * (1.5 + k)
        for y in range(48):
            for x in range(48):
                d = math.hypot((x - bx) / (r * 1.25), (y - by) / r)
                if d <= 1:
                    cell.put(x, y, tone(POISON, max(0.1, 0.7 - d * 0.5)))
    # Bubbles that rise through the head.
    for k in range(3):
        bp = (ph + k / 3) % 1
        bx = int(cx - 3 + k * 3)
        by = int(cy + 4 - bp * 9)
        if abs(by - cy) < 6:
            cell.put(bx, by, POISON[4] if bp > 0.5 else POISON[3])
    cell.outline(hexes("#0a2408")[0])
    return cell


def psychic(f, n):
    """A psychic bolt: a hot core with two crescents wheeling around it and a
    trail of loose thoughts behind."""
    cell = Cell(48, 48)
    cx, cy = 30.0, 24.0
    ph = f / n
    cell.disc(cx, cy, 5.2, PSYCHIC[2])
    cell.disc(cx, cy, 3.4, PSYCHIC[3])
    cell.disc(cx - 0.5, cy - 0.5, 1.8, PSYCHIC[4])
    # Two crescents, opposite each other, on a tilted orbit.
    for arm in (0, 1):
        a0 = ph * 2 * math.pi + arm * math.pi
        for i in range(0, 60):
            a = a0 + (i / 60) * 1.9 - 0.95
            x = cx + math.cos(a) * 10.5
            y = cy + math.sin(a) * 6.0
            edge = abs(i / 60 - 0.5) * 2
            cell.put(round(x), round(y), PSYCHIC[3] if edge < 0.4 else PSYCHIC[2] if edge < 0.8 else PSYCHIC[1])
            if edge < 0.3:
                cell.put(round(x), round(y) + 1, PSYCHIC[1])
    # Thought-trail: pixels drifting back and fading through the ramp.
    for k in range(6):
        tp = (ph + k / 6) % 1
        tx = int(cx - 9 - tp * 18)
        ty = int(cy + math.sin(tp * 6 + k) * 4)
        cell.put(tx, ty, PSYCHIC[3] if tp < 0.35 else PSYCHIC[2] if tp < 0.7 else PSYCHIC[1])
    return cell


# ── impact: flash, ring, spark ───────────────────────────────────────────────

def flash(f, n):
    """The white pop on arrival. Six frames: a star, a bloom, a ring with rays,
    the ring breaking, dots, gone."""
    cell = Cell(48, 48)
    cx = cy = 24
    W = WHITE
    if f == 0:
        cell.disc(cx, cy, 3, W[4])
        for d in range(4, 9):
            for dx, dy in ((d, 0), (-d, 0), (0, d), (0, -d)):
                cell.put(cx + dx, cy + dy, W[4] if d < 7 else W[3])
    elif f == 1:
        cell.disc(cx, cy, 12, W[4])
        for d in range(13, 21):
            for dx, dy in ((d, 0), (-d, 0), (0, d), (0, -d)):
                cell.put(cx + dx, cy + dy, W[3])
    elif f == 2:
        cell.ring(cx, cy, 13.5, 3.2, W[3], jag=0.8, seed=3)
        cell.disc(cx, cy, 5, W[4])
        for k in range(8):
            a = k * math.pi / 4
            cell.line(cx + math.cos(a) * 15, cy + math.sin(a) * 15, cx + math.cos(a) * 22, cy + math.sin(a) * 22, W[2] if k % 2 else W[3])
    elif f == 3:
        cell.ring(cx, cy, 18.5, 2.2, W[2], jag=1.0, seed=4)
        for k in range(8):
            a = k * math.pi / 4 + 0.2
            cell.line(cx + math.cos(a) * 21, cy + math.sin(a) * 21, cx + math.cos(a) * 23.5, cy + math.sin(a) * 23.5, W[3])
    elif f == 4:
        cell.ring(cx, cy, 21.5, 1.2, W[1], jag=1.2, seed=5, dither=True)
        for k in range(10):
            a = k * math.pi / 5 + 0.5
            r = 15 + (k % 3) * 3
            cell.put(round(cx + math.cos(a) * r), round(cy + math.sin(a) * r), W[3])
    else:
        for k in range(6):
            a = k * math.pi / 3 + 0.9
            r = 19 + (k % 2) * 3
            cell.put(round(cx + math.cos(a) * r), round(cy + math.sin(a) * r), W[1])
    return cell


def shockring(f, n):
    """The shockwave on the floor: a ring that runs out from the point of
    impact, thinning and breaking up as it goes."""
    cell = Cell(64, 64)
    t = f / (n - 1)
    r = 4 + 23 * (1 - (1 - t) ** 2)     # stays inside the cell with its jag
    thick = max(1.0, 3.2 - 2.4 * t)
    tone_i = 4 if t < 0.3 else 3 if t < 0.55 else 2 if t < 0.8 else 1
    cell.ring(32, 32, r, thick, WHITE[tone_i], jag=0.6 + 1.6 * t, seed=20 + f, dither=t > 0.6)
    if f == 0:
        cell.disc(32, 32, 3, WHITE[4])
    return cell


def spark(f, n):
    """One spark. The burst particles are this, scaled, tinted, thrown."""
    cell = Cell(8, 8)
    for x, y in ((3, 3), (4, 3), (3, 4), (4, 4)):
        cell.put(x, y, WHITE[4])
    for x, y in ((2, 3), (2, 4), (5, 3), (5, 4), (3, 2), (4, 2), (3, 5), (4, 5)):
        cell.put(x, y, WHITE[3])
    for x, y in ((1, 3), (1, 4), (6, 3), (6, 4), (3, 1), (4, 1), (3, 6), (4, 6)):
        cell.put(x, y, WHITE[1])
    return cell


# ── sheets ───────────────────────────────────────────────────────────────────

SHEETS = [
    # name, draw, frames, cols, fps, loop
    ("pxFireball", fireball,  8, 4, 12, True),
    ("pxMissile",  missile,   8, 4, 14, True),
    ("pxPoison",   poison,    8, 4, 10, True),
    ("pxPsychic",  psychic,   8, 4, 12, True),
    ("pxFlash",    flash,     6, 6, 24, False),
    ("pxRing",     shockring, 8, 4, 20, False),
    ("pxSpark",    spark,     1, 1, 1,  False),
]


def bake(out_dir, name, draw, frames, cols, fps, loop, preview_dir=None):
    cells = [draw(f, frames) for f in range(frames)]
    w, h = cells[0].w, cells[0].h
    rows = math.ceil(frames / cols)
    sheet = Image.new("RGBA", (w * cols, h * rows), CLEAR)
    for i, c in enumerate(cells):
        sheet.paste(Image.fromarray(c.px, "RGBA"), ((i % cols) * w, (i // cols) * h))
    out = os.path.join(out_dir, f"{name}.webp")
    # Lossless: a lossy encoder would smear the one thing this is about.
    sheet.save(out, "WEBP", lossless=True, quality=100, method=6)
    if preview_dir:
        strip = Image.new("RGBA", (w * frames, h), (24, 20, 18, 255))
        for i, c in enumerate(cells):
            strip.paste(Image.fromarray(c.px, "RGBA"), (i * w, 0), Image.fromarray(c.px, "RGBA"))
        strip = strip.resize((strip.width * 4, strip.height * 4), Image.NEAREST)
        strip.save(os.path.join(preview_dir, f"{name}.png"))
    entry = {"file": f"{name}.webp", "cols": cols, "rows": rows, "frames": frames,
             "fps": fps, "bytes": os.path.getsize(out)}
    if loop:
        entry["loop"] = True
    return entry


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    out_dir = sys.argv[1]
    preview = None
    if "--preview" in sys.argv:
        preview = sys.argv[sys.argv.index("--preview") + 1]
        os.makedirs(preview, exist_ok=True)
    mpath = os.path.join(out_dir, "manifest.json")
    man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for name, draw, frames, cols, fps, loop in SHEETS:
        man[name] = bake(out_dir, name, draw, frames, cols, fps, loop, preview)
        print(f"{name}: {man[name]['bytes']} B, {frames} frames @ {fps} fps")
    json.dump(dict(sorted(man.items())), open(mpath, "w"), indent=2, sort_keys=True)


if __name__ == "__main__":
    main()
