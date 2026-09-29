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
  pxIce        64x64  4f loop   rime left on the floor after a frost hit, drawn flat
  pxGlow       64x64  8f loop   healing luminescence around a target, motes rising
  pxSwirl      48x48  8f loop   the dizzy spiral over a mocked head, violet and blue
  pxPlumeMotes 48x96  8f loop   embers rising through a target sigil's plume, white
  pxSigilBurst 96x96  6f        fighting-game hit spark for the frame a spell takes, white
  pxFlame      32x48  8f loop   a tongue of fire riding a burning creature
  pxArc        24x24  6f        a lightning crackle around a charged creature
  pxWebWrap    48x64  1f        strands wrapped around a webbed creature
  pxWebFloor   64x64  1f        the web on a webbed creature's square, flat

pxFlash, pxRing, pxSpark, pxGlow, pxArc and the two webs are drawn WHITE on
purpose: the kit tints them with the damage type's colour, so one sheet serves
every type. (The
Vicious Mockery ghost is a drawn sprite, packed by import_sprite_sheet.py.)

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


def ice(f, n):
    """Rime left on the floor where a frost spell landed: a frozen patch with
    shards, drawn flat. Four frames so the ice glints rather than sits."""
    cell = Cell(64, 64)
    cx = cy = 32
    ICE = hexes("#1e3d5c", "#3f7fb5", "#8ecbee", "#d6f3ff", "#ffffff")
    for y in range(64):
        for x in range(64):
            d = math.hypot((x - cx) / 27, (y - cy) / 21)
            nz = fbm(x * 0.16, y * 0.16, 31) * 2 - 1
            if d + nz * 0.28 > 1:
                continue
            crack = fbm(x * 0.45, y * 0.45, 32)
            h = 0.28 + 0.4 * (1 - d) + (0.35 if crack > 0.68 else 0)
            cell.put(x, y, tone(ICE, min(0.99, h)))
    # Shards standing up out of the rime, each a small spike.
    for k in range(7):
        sx = cx + (_hash(k, 0, 40) * 2 - 1) * 22
        sy = cy + (_hash(k, 1, 40) * 2 - 1) * 14
        ln = 4 + int(_hash(k, 2, 40) * 6)
        for i in range(ln):
            cell.put(round(sx + i * 0.35), round(sy - i), ICE[3 if i < ln - 2 else 4])
            cell.put(round(sx + i * 0.35) + 1, round(sy - i), ICE[2])
    # The glint: one bright pixel wandering across the patch per frame.
    for k in range(3):
        gp = (f / n + k / 3) % 1
        gx = int(cx - 18 + gp * 36)
        gy = int(cy + math.sin(gp * math.pi * 2 + k) * 10)
        if cell.get(gx, gy)[3]:
            cell.put(gx, gy, ICE[4])
            cell.put(gx + 1, gy, ICE[3])
    return cell


def glow(f, n):
    """A healing luminescence: a halo around the target with RAYS streaking
    outward from it and motes rising through it. Sam: "golden, luminescent,
    and have rays of light streaking outwards." Drawn white; the kit tints
    it gold, so the gold is one number in the kit rather than a repaint."""
    cell = Cell(64, 64)
    cx, cy = 32, 36
    ph = f / n
    # The rays first, so the halo draws over their roots. Twelve of them,
    # each with its own length that breathes on its own phase, turning
    # slowly as a whole.
    for k in range(12):
        a = k * math.pi / 6 + ph * math.pi / 6
        breathe = 0.5 + 0.5 * math.sin(ph * 2 * math.pi * 2 + k * 1.3)
        r0 = 20
        r1 = 24 + 8 * breathe
        for i in range(int((r1 - r0) * 2)):
            r = r0 + i / 2
            x = cx + math.cos(a) * r * 1.0
            y = cy + math.sin(a) * r * 1.15
            tip = (r - r0) / max(1, r1 - r0)
            cell.put(round(x), round(y), WHITE[4] if tip < 0.4 else WHITE[3] if tip < 0.75 else WHITE[1])
    for y in range(64):
        for x in range(64):
            d = math.hypot((x - cx) / 21, (y - cy) / 26)
            nz = fbm(x * 0.2 + ph * 2, y * 0.2 - ph * 3, 51) * 2 - 1
            r = d + nz * 0.16
            if r > 1 or r < 0.66:
                continue
            cell.put(x, y, WHITE[4] if r > 0.9 else WHITE[3] if r > 0.8 else WHITE[2])
    # Motes rising: small crosses that drift up and fade through the ramp.
    for k in range(7):
        mp = (ph + k / 7) % 1
        mx = int(cx + math.sin(k * 2.1 + mp * 3) * 16)
        my = int(cy + 24 - mp * 46)
        col = WHITE[4] if mp < 0.5 else WHITE[2]
        cell.put(mx, my, col)
        if mp < 0.7:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                cell.put(mx + dx, my + dy, WHITE[1])
    return cell


def sigilburst(f, n):
    """A fighting-game hit spark, for the frame a save-based spell TAKES.

    Sam, 2026-09-28: "the sprites should look like the explosions from Street
    Fighter." Original art in that idiom, drawn here from scratch like every
    other sheet in this file — no traced or copied frames.

    What actually makes a 2D fighter's spark read, and what this reproduces:

      MASS, NOT LINES.  The spikes are a STAR BOUNDARY — the radius is a
                        function of the angle and everything inside it is
                        filled — so each spike is a solid wedge. Rays drawn as
                        lines look like a sparkler; wedges look like an impact.
      A WHITE-HOT CORE. Tone steps by distance from the centre, hard, never
                        blended: white core, bright body, dim rim.
      IT POPS.          Six frames over a quarter second. It is at full size by
                        frame 2 and spends the rest breaking up, which is the
                        opposite of a plume's slow bloom.
      IT HOLLOWS.       The core burns out and the burst becomes a ragged ring
                        before it fragments, so the eye reads an expanding
                        shell rather than a shrinking blob.

    Drawn WHITE so the kit tints it with the school's colour, the same as
    pxFlash, pxRing and pxGlow."""
    cell = Cell(96, 96)
    cx = cy = 48
    W = WHITE
    p = f / max(1, n - 1)

    # Out fast, then hold: a spark is all in its first third.
    grow = 1 - (1 - min(1.0, p * 1.75)) ** 3
    R = 9 + 36 * grow

    # THE SPIKES, fixed for the whole burst so the six frames read as ONE
    # thing expanding rather than six unrelated stars.
    #
    # The first attempt used a smooth |cos(k*a)| boundary and drew a FLOWER:
    # twelve identical rounded petals, evenly spaced. A hit spark is the
    # opposite of that — a few NARROW, SHARP, IRREGULARLY placed needles of
    # very different lengths coming off a small hot body. So the spikes are
    # explicit and seeded: four dominant ones, five lesser, none of them evenly
    # spaced and none the same length.
    spikes = []
    for k in range(9):
        jitter = (vnoise(k * 2.7, 0.4, 61) - 0.5) * 0.85
        ang = k * (2 * math.pi / 9) + jitter
        big = k % 2 == 0
        ln = (0.80 + 0.20 * vnoise(k * 1.3, 1.9, 23)) if big else \
             (0.38 + 0.22 * vnoise(k * 3.1, 2.7, 37))
        wd = (0.20 + 0.09 * vnoise(k * 0.9, 3.3, 43)) if big else \
             (0.11 + 0.06 * vnoise(k * 1.7, 4.1, 47))
        spikes.append((ang, ln, wd))

    BODY = 0.26          # the solid hot centre every spike grows out of

    def bound(a):
        b = R * BODY
        for sa, sl, sw in spikes:
            da = abs(((a - sa + math.pi) % (2 * math.pi)) - math.pi)
            if da < sw:
                # Full length at the spike's own angle, tapering hard to the
                # body at its edges. The exponent is what makes it a needle
                # rather than a petal.
                t = (1 - da / sw) ** 1.7
                b = max(b, R * (BODY + (sl - BODY) * t))
        return b

    # The core burns out from frame 3, leaving a shell.
    inner = 0.0 if f < 3 else R * (0.30 + 0.26 * (f - 3))

    for y in range(96):
        for x in range(96):
            dx, dy = x - cx, y - cy
            d = math.hypot(dx, dy)
            if d > R * 1.25:
                continue
            b = bound(math.atan2(dy, dx))
            if d > b or d < inner:
                continue
            h = 1 - d / max(1e-6, b)          # 1 at the centre, 0 at the tip
            # Hard steps. The late frames lose the white core entirely.
            if f >= 4:
                c = W[2] if h > 0.45 else W[1]
            elif f == 3:
                c = W[3] if h > 0.55 else W[2] if h > 0.2 else W[1]
            else:
                c = W[4] if h > 0.62 else W[3] if h > 0.36 else W[2] if h > 0.12 else W[1]
            cell.put(x, y, c)

    # Fragments thrown clear of the shell on the last two frames — the bits
    # that keep going after the spark itself is spent.
    if f >= 3:
        for k in range(14):
            a = k * math.pi / 7 + 0.31
            fr = R * (1.02 + 0.20 * vnoise(k * 1.7, 2.0, 55)) + (f - 3) * 7
            fx, fy = cx + math.cos(a) * fr, cy + math.sin(a) * fr
            col = W[3] if f == 3 else W[1]
            cell.put(fx, fy, col)
            if k % 2 == 0:
                cell.put(fx + (1 if math.cos(a) > 0 else -1), fy, W[1])
    return cell


def plumemotes(f, n):
    """Embers rising through a target sigil's plume.

    Sam, 2026-09-28: "add pixels to enhance the plumes." The sigil sheets are
    painted art; everything else the kit draws is pixel art, and the plume was
    the one place the two met with nothing to bridge them. These are drawn the
    way the rest of public/vfx/px* are drawn — hard alpha, a white tone ramp,
    seeded so a re-run is byte-identical — and the renderer tints them with the
    school's own colour, so one sheet serves every sigil.

    The cell is 1:2 to match the plume quad it rides, and the motes rise
    through the WHOLE height and die at the top rather than looping mid-air:
    the plume is a one-shot, so a mote that wraps would be the only thing on
    screen admitting the effect is a loop."""
    cell = Cell(48, 96)
    ph = f / n
    # Two ranks so the column reads as having depth: the far rank is dimmer,
    # smaller and slower, the near rank brighter, larger and faster.
    #
    # The first pass used 16 single pixels and read as dust rather than fire —
    # at the size this rides on the board a one-pixel mote is invisible. These
    # are short vertical EMBERS, two to four pixels tall, which is what makes a
    # rising column read as rising.
    for rank, (count, speed, dim, spread) in enumerate(
            ((16, 0.70, True, 18), (13, 1.0, False, 13))):
        for k in range(count):
            mp = (ph * speed + k / count + rank * 0.37) % 1
            my = 96 - mp * 104          # from below the base to off the top
            wob = math.sin(mp * 3.4 + k * 1.9 + rank) * spread * (0.30 + 0.70 * mp)
            mx = 24 + wob
            # Fades in fast, dies over the top third.
            life = 1.0 if mp < 0.55 else max(0.0, (1 - mp) / 0.45)
            if life <= 0.05:
                continue
            hot  = WHITE[2] if dim else WHITE[4]
            warm = WHITE[1] if dim else WHITE[3]
            cool = WHITE[0] if dim else WHITE[1]
            # An ember is a short vertical bar: bright head, warm body, cool
            # tail. Taller on the near rank and taller again low down, where
            # it is moving fastest out of the ring.
            tall = (3 if dim else 4) + (1 if mp < 0.35 else 0)
            for i in range(tall):
                c = hot if i == 0 else warm if i < tall - 1 else cool
                cell.put(mx, my + i, c if life > 0.45 else cool)
            if not dim:
                # A second column of pixels on the brightest few, so the near
                # rank has embers with actual body rather than hairlines.
                if k % 3 == 0 and life > 0.55:
                    for i in range(max(1, tall - 1)):
                        cell.put(mx + 1, my + i, warm if i == 0 else cool)
                if k % 5 == 2 and life > 0.7:
                    cell.put(mx - 1, my, warm)
    # Sparks near the base, so the foot of the plume is alive while the embers
    # are high in the cell.
    for k in range(10):
        sp = (ph * 2 + k / 10) % 1
        if sp > 0.6:
            continue
        sx = 24 + int(math.sin(k * 2.7) * 16)
        sy = 90 - int(abs(math.cos(k * 1.3)) * 14)
        cell.put(sx, sy, WHITE[4] if sp < 0.2 else WHITE[2])
        cell.put(sx, sy + 1, WHITE[1])
    return cell


def swirl(f, n):
    """The dizzy spiral over a mocked head — the reference has a violet and
    blue whorl with sparks in it. Two arms, turning, drawn flat in its own
    colours (the ghosts are green; this is not)."""
    cell = Cell(48, 48)
    cx = cy = 24
    SW = hexes("#3b2a7a", "#7b4fd8", "#c56cff", "#8fd0ff", "#ffffff")
    ph = f / n
    for arm in (0, 1):
        for i in range(0, 150):
            t = i / 150
            a = t * math.pi * 2.6 + ph * math.pi * 2 + arm * math.pi
            r = 3 + t * 19
            x = cx + math.cos(a) * r
            y = cy + math.sin(a) * r * 0.55
            cell.put(round(x), round(y), SW[3] if t < 0.3 else SW[2] if t < 0.7 else SW[1])
            if t > 0.4 and i % 9 == 0:
                cell.put(round(x), round(y) + 1, SW[0])
    for k in range(5):
        sp = (ph + k / 5) % 1
        a = sp * math.pi * 2 + k
        r = 8 + sp * 12
        cell.put(round(cx + math.cos(a) * r), round(cy + math.sin(a) * r * 0.55), SW[4])
    return cell


def flame(f, n):
    """A tongue of fire that rides on a burning creature: taller than wide,
    licking upward, eight frames of flicker. Sam: "the enemy has flames"."""
    cell = Cell(32, 48)
    cx, base = 16.0, 44.0
    ph = f / n
    for y in range(48):
        for x in range(32):
            up = (base - y) / 40.0              # 0 at the base, 1 at the tip
            if up < 0 or up > 1:
                continue
            sway = 3.0 * math.sin(up * 4.0 - ph * 2 * math.pi) * up
            nz = fbm(x * 0.24, y * 0.24 - ph * 8, 61) * 2 - 1
            half = 9.0 * (1 - up) ** 0.9 * (1 + 0.5 * nz) + 1.0
            dx = abs(x - cx - sway)
            if dx > half:
                continue
            h = (1 - dx / half) * (1 - up * 0.45) + 0.1
            cell.put(x, y, tone(FIRE, min(0.99, h)))
    for k in range(3):
        s = _hash(k, f, 62)
        cell.put(int(cx + (s * 2 - 1) * 8), int(4 + s * 10), FIRE[3])
    return cell


def arc(f, n):
    """A crackle of lightning that jumps around a charged creature: a jagged
    arc across the cell, white, tinted by the kit. Six frames, each a new
    arc, so playing them at random reads as crackle rather than as a loop."""
    cell = Cell(24, 24)
    x0, y0 = 2, 4 + int(_hash(f, 0, 71) * 16)
    x1, y1 = 21, 4 + int(_hash(f, 1, 71) * 16)
    pts = [(x0, y0)]
    for i in range(1, 6):
        t = i / 6
        pts.append((round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t + (_hash(f, i, 72) * 2 - 1) * 6)))
    pts.append((x1, y1))
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        cell.line(ax, ay, bx, by, WHITE[4])
    # A fork off the middle.
    mx, my = pts[3]
    cell.line(mx, my, mx + (3 if f % 2 else -3), my + (4 if f % 3 else -4), WHITE[2])
    # Glow one pixel out, dim.
    lit = cell.px[..., 3] > 0
    for y in range(24):
        for x in range(24):
            if lit[y, x]:
                continue
            if any(0 <= x + dx < 24 and 0 <= y + dy < 24 and lit[y + dy, x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                cell.put(x, y, WHITE[0])
    return cell


def webwrap(f, n):
    """Strands wrapped around a webbed creature, drawn as a billboard over the
    body: a loose cocoon of crossing threads with a few sticky knots."""
    cell = Cell(48, 64)
    W = WHITE
    for k in range(9):
        y = 6 + k * 6
        sag = 2 + (k % 3)
        for x in range(4, 44):
            t = (x - 4) / 40
            yy = round(y + math.sin(t * math.pi) * sag * (1 if k % 2 else -1))
            cell.put(x, yy, W[3] if (x + k) % 5 else W[4])
    for k in range(5):
        x = 6 + k * 9
        for y in range(4, 60):
            xx = round(x + math.sin(y * 0.18 + k) * 3)
            if (y + k) % 2:
                cell.put(xx, y, W[2])
    for k in range(6):
        kx = 8 + int(_hash(k, 0, 81) * 32)
        ky = 8 + int(_hash(k, 1, 81) * 46)
        cell.put(kx, ky, W[4]); cell.put(kx + 1, ky, W[3]); cell.put(kx, ky + 1, W[3])
    return cell


def webfloor(f, n):
    """The web on the square a webbed creature stands in, drawn flat: an
    orb-weaver's wheel, spokes and rings, a little torn."""
    cell = Cell(64, 64)
    W = WHITE
    cx = cy = 32
    for k in range(10):
        a = k * math.pi / 5
        cell.line(cx, cy, cx + math.cos(a) * 30, cy + math.sin(a) * 30, W[2])
    for r in (6, 11, 16, 21, 26):
        for i in range(0, 120):
            a = i / 120 * math.pi * 2
            if _hash(r, i // 6, 91) < 0.15:
                continue                       # a torn stretch
            x = cx + math.cos(a) * (r + math.sin(a * 5) * 0.8)
            y = cy + math.sin(a) * (r + math.sin(a * 5) * 0.8)
            cell.put(round(x), round(y), W[3] if r in (11, 21) else W[2])
    cell.disc(cx, cy, 2, W[4])
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
    ("pxIce",      ice,       4, 4, 6,  True),
    ("pxGlow",     glow,      8, 4, 10, True),
    ("pxSwirl",    swirl,     8, 4, 12, True),
    ("pxPlumeMotes", plumemotes, 8, 4, 12, True),
    ("pxSigilBurst", sigilburst, 6, 6, 20, False),
    ("pxFlame",    flame,     8, 4, 12, True),
    ("pxArc",      arc,       6, 6, 12, True),
    ("pxWebWrap",  webwrap,   1, 1, 1,  False),
    ("pxWebFloor", webfloor,  1, 1, 1,  False),
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
