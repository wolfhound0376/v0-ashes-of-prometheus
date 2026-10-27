"""Toll the Dead — native pixel-art VFX layers.

Every pixel is placed on the native grid from a fixed palette (no smoothing,
no resampling). Exports per-layer strips, per-frame PNGs, 4x previews, GIFs.
"""
import json, math, os
import numpy as np
from PIL import Image

OUT = os.environ.get("OUT", "/home/claude/ttd/out")
TAU = math.tau

def hx(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)

# Emerald necrotic ramp (dark -> bright)
G = [hx('061510'), hx('0b2a1f'), hx('11402e'), hx('17603f'), hx('1f8a55'),
     hx('2fb86f'), hx('5ee89b'), hx('a8ffcf'), hx('e9fff3')]
# Antique bronze ramp
B = [hx('140d07'), hx('2b1d0e'), hx('4a3418'), hx('6e5226'), hx('957338'),
     hx('bf9a52'), hx('e6cd8a')]
GLASS_DIM = [hx('0a1714'), hx('10241f'), hx('17342c'), hx('234a3d')]
CLEAR = (0, 0, 0, 0)

BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) / 16.0 - 0.5


class Canvas:
    def __init__(s, w, h):
        s.w, s.h = w, h
        s.a = np.zeros((h, w, 4), np.uint8)

    def put(s, x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < s.w and 0 <= y < s.h and c is not None:
            if c[3] == 0: s.a[y, x] = 0; return
            s.a[y, x] = c

    def hline(s, x0, x1, y, c):
        for x in range(int(x0), int(x1) + 1): s.put(x, y, c)

    def vline(s, x, y0, y1, c):
        for y in range(int(y0), int(y1) + 1): s.put(x, y, c)

    def rect(s, x0, y0, x1, y1, c):
        for y in range(int(y0), int(y1) + 1): s.hline(x0, x1, y, c)

    def img(s): return Image.fromarray(s.a, 'RGBA')


def quantize(dens, ramp, lo, hi, x0=0, y0=0, alpha_floor=None, dither=0.9):
    """density field -> palette indices with ordered dithering. -1 = clear."""
    h, w = dens.shape
    by = BAYER[(np.arange(h)[:, None] + y0) % 4, (np.arange(w)[None, :] + x0) % 4]
    n = len(ramp)
    t = (dens - lo) / (hi - lo)
    idx = np.floor(t * n + by * dither).astype(int)
    idx[dens < lo + by * 0.0] = -1
    idx = np.clip(idx, -1, n - 1)
    return idx


def blit_idx(cv, idx, ramp, edge_alpha=None):
    h, w = idx.shape
    for y in range(h):
        for x in range(w):
            i = idx[y, x]
            if i >= 0:
                c = ramp[i]
                if edge_alpha is not None and i == 0: c = c[:3] + (edge_alpha,)
                cv.a[y, x] = c


def loop_turb(X, Y, t, seed, scale=1.0, octaves=4, warp=3.0):
    """Seamlessly looping turbulence: integer temporal frequencies only."""
    rng = np.random.default_rng(seed)
    v = np.zeros_like(X, dtype=float)
    Xw = X + warp * np.sin(0.19 * Y / scale + TAU * t + rng.uniform(0, TAU))
    Yw = Y + warp * np.cos(0.17 * X / scale - TAU * t + rng.uniform(0, TAU))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        f = (0.09 * (1.9 ** o)) / scale
        ang = rng.uniform(0, TAU)
        kx, ky = f * math.cos(ang), f * math.sin(ang)
        m = rng.choice([-1, 1]) * (1 + (o % 2))
        v += amp * np.sin(kx * Xw + ky * Yw + TAU * m * t + rng.uniform(0, TAU))
        ang2 = ang + 1.9
        v += amp * np.sin(f * math.cos(ang2) * Xw + f * math.sin(ang2) * Yw - TAU * m * t + rng.uniform(0, TAU))
        tot += 2 * amp; amp *= 0.55
    return v / tot  # ~[-1,1]


def zero_cross(v):
    s = v > 0
    e = np.zeros_like(s)
    e[:, :-1] |= s[:, :-1] != s[:, 1:]
    e[:-1, :] |= s[:-1, :] != s[1:, :]
    return e


def outline(cv, col, only_if_alpha_below=1):
    a = cv.a
    solid = a[:, :, 3] >= 200
    out = np.zeros_like(solid)
    out[1:, :] |= solid[:-1, :]; out[:-1, :] |= solid[1:, :]
    out[:, 1:] |= solid[:, :-1]; out[:, :-1] |= solid[:, 1:]
    out &= a[:, :, 3] < only_if_alpha_below
    a[out] = col


# ---------------------------------------------------------------- LANTERN
SKELETON = True   # False: leave the centre panel empty for painted art
PULSE = True      # False: no pixel bell ring (painted sphere instead)
LW, LH = 96, 96
CX = 48

def lantern_frame(glow, pulse_r=None, pulse_a=0.0, flash=0.0, eyes=0.0, flicker=0.0, aura=0.0, t=0.0):
    """glow 0..1 skeleton awakening; flash 0..1 soul-energy intake."""
    cv = Canvas(LW, LH)
    # --- soft aura behind the lantern (pixel dithered, inside margins)
    if aura > 0:
        Y, X = np.mgrid[0:LH, 0:LW].astype(float)
        d = np.hypot((X - CX) / 1.0, (Y - 52) / 1.25)
        tb = loop_turb(X, Y, t, 77, scale=0.8, octaves=3, warp=2)
        dens = aura * np.clip(1 - d / 30, 0, 1) * (0.75 + 0.35 * tb)
        idx = quantize(dens, G[1:5], 0.12, 0.85, dither=1.0)
        blit_idx(cv, idx, G[1:5], edge_alpha=150)
    if PULSE:
        # --- bell pulse ring (one deep toll)
        if pulse_r is not None and pulse_a > 0:
            for k in range(720):
                ang = TAU * k / 720
                for dr, ci in ((0, 7 if pulse_a > .6 else 6), (-1, 5), (1, 4), (-2, 3)):
                    if pulse_a < 0.35 and dr != 0: continue
                    r = pulse_r + dr
                    x = CX + r * math.cos(ang); y = 52 + r * 1.0 * math.sin(ang)
                    # broken ring: gaps rotate so it reads as a resonance, not a shield
                    if math.sin(ang * 7 + pulse_r * 0.4) < -0.55: continue
                    cv.put(x, y, G[max(0, ci - (0 if pulse_a > .6 else 1))])

    br = B
    # --- hanging ring
    for k in range(360):
        ang = TAU * k / 360
        for r, ci in ((5, None), (4, None)):
            x = CX + r * math.cos(ang); y = 12 + r * math.sin(ang)
            shade = 5 if (math.cos(ang) < -0.2 and math.sin(ang) < 0.3) else (2 if math.cos(ang) > 0.3 else 4)
            if r == 5: shade = max(1, shade - 1)
            cv.put(x, y, br[shade])
    # finial + neck
    cv.rect(CX - 1, 17, CX + 1, 18, br[4]); cv.put(CX - 1, 17, br[6])
    cv.rect(CX - 2, 19, CX + 2, 20, br[3]); cv.hline(CX - 2, CX - 1, 19, br[5])
    cv.rect(CX - 1, 21, CX + 1, 22, br[2]); cv.put(CX - 1, 21, br[4])
    # --- roof: two-stage gothic canopy
    for y in range(23, 35):
        half = 2 + int((y - 23) * 1.05) if y < 30 else 9 + (y - 30) * 1
        for x in range(CX - half, CX + half + 1):
            rel = (x - (CX - half)) / max(1, 2 * half)
            ci = 5 if rel < 0.18 else 4 if rel < 0.45 else 3 if rel < 0.75 else 2
            cv.put(x, y, br[ci])
        cv.put(CX - half, y, br[1]); cv.put(CX + half, y, br[0])
    # roof ribs / tracery
    for y in range(24, 35):
        cv.put(CX, y, br[6] if y % 3 else br[4])
        o = int((y - 23) * 0.55)
        cv.put(CX - 3 - o, y, br[2]); cv.put(CX + 3 + o, y, br[1])
    # dormer windows on roof (tiny gothic arches)
    for dx in (-5, 5):
        cv.vline(CX + dx, 29, 31, G[2] if glow < .3 else G[min(6, 3 + int(glow * 3))])
        cv.put(CX + dx, 28, br[1])
    # corner spires
    for sx, lite in ((CX - 14, True), (CX + 14, False), (CX - 9, True), (CX + 9, False)):
        top = 22 if abs(sx - CX) > 10 else 25
        for y in range(top, 36):
            cv.put(sx, y, br[5] if lite else br[2])
        cv.put(sx, top - 1, br[6] if lite else br[3])
        cv.put(sx - 1 if lite else sx + 1, 33, br[3])
    # cornice
    cv.rect(CX - 15, 35, CX + 15, 37, br[3])
    cv.hline(CX - 15, CX + 15, 35, br[5]); cv.hline(CX - 15, CX + 15, 37, br[1])
    for x in range(CX - 14, CX + 15, 3): cv.put(x, 36, br[6] if x < CX else br[4])

    # --- body / glass
    top, bot = 38, 68
    # glass panels: left side (x 36..40), centre (42..54), right side (56..60)
    g_center = glow
    for y in range(top, bot + 1):
        for x in range(CX - 12, CX + 13):
            side = x < CX - 6 or x > CX + 6
            # glass colour
            if g_center <= 0.02 and flash <= 0:
                c = GLASS_DIM[1 if side else 2]
                if (x + y) % 7 == 0 and not side: c = GLASS_DIM[3]
            else:
                # vertical radial glow centred on skeleton chest
                dd = math.hypot((x - CX) / 1.0, (y - 52) / 1.6) / 14
                lvl = g_center * (1 - dd) * (0.55 if side else 1.0) + 0.15 * flicker * math.sin(y * 0.9 + x)
                lvl += flash * (0.9 - dd * 0.4) * (0.7 if side else 1.0)
                lvl = max(0.0, min(1.0, lvl)) + BAYER[y % 4, x % 4] * 0.18
                ramp = [GLASS_DIM[1], G[2], G[3], G[4], G[5], G[6]] + ([] if flash > 0 else [G[7], G[8]])
                c = ramp[max(0, min(len(ramp) - 1, int(lvl * len(ramp))))]
            cv.put(x, y, c)
    # glass sheen streaks (upper-left light)
    for i in range(6):
        cv.put(CX - 4 + i // 2, top + 3 + i, (G[7] if glow > .5 else GLASS_DIM[3]))
    cv.put(CX - 10, top + 4, GLASS_DIM[3]); cv.put(CX - 10, top + 5, GLASS_DIM[3])

    if SKELETON:
        # --- skeleton (tiny dead figure) in centre panel
        def sk(lv):  # bone colour by awakening
            if flash > 0: return G[8]
            if lv < .15: return hx('4c5a50')
            if lv < .45: return G[5]
            if lv < .8: return G[6]
            return G[7]
        bone = sk(glow); bone_d = G[3] if glow > .15 else hx('2c3832')
        hood = hx('0c1311') if glow < .5 else (G[2] if flash > 0 else G[1])
        # hood
        for y in range(41, 56):
            half = 3 + (y - 41) // 3
            if y < 43: half = 2 + (y - 41)
            for x in range(CX - half, CX + half + 1):
                if abs(x - CX) >= half - 1 or y < 43:
                    cv.put(x, y, hood)
        # skull
        cv.rect(CX - 2, 43, CX + 2, 46, bone)
        cv.hline(CX - 1, CX + 1, 47, bone)
        cv.put(CX + 2, 46, bone_d); cv.put(CX - 2, 46, bone_d)
        ecol = G[8] if eyes > .6 else (G[6] if eyes > .2 else hx('050807'))
        cv.put(CX - 1, 44, ecol); cv.put(CX + 1, 44, ecol)
        cv.put(CX, 46, bone_d)
        if eyes > .6: cv.put(CX - 1, 45, G[5]); cv.put(CX + 1, 45, G[5])
        # spine + ribs
        cv.vline(CX, 48, 58, bone)
        for i, y in enumerate((50, 52, 54)):
            w = 3 - (i == 2)
            cv.hline(CX - w, CX - 1, y, bone); cv.hline(CX + 1, CX + w, y, bone)
            cv.put(CX - w, y + 1, bone_d); cv.put(CX + w, y + 1, bone_d)
        # arms — dead (hanging) vs awakened (raised, clutching)
        if glow < .5:
            cv.vline(CX - 4, 49, 55, bone); cv.vline(CX + 4, 49, 55, bone)
            cv.put(CX - 4, 56, bone_d); cv.put(CX + 4, 56, bone_d)
        else:
            for i in range(4):
                cv.put(CX - 4 - (i > 1), 49 - i // 2 + (i > 2), bone)
                cv.put(CX + 4 + (i > 1), 49 - i // 2 + (i > 2), bone)
            cv.vline(CX - 6, 44, 47, bone); cv.vline(CX + 6, 44, 47, bone)
            cv.put(CX - 6, 43, bone_d); cv.put(CX + 6, 43, bone_d)
        # pelvis + legs
        cv.hline(CX - 2, CX + 2, 59, bone); cv.put(CX - 2, 60, bone_d); cv.put(CX + 2, 60, bone_d)
        cv.vline(CX - 2, 61, 66, bone); cv.vline(CX + 2, 61, 66, bone)
        # robe hem
        for x in range(CX - 7, CX + 8):
            if (x * 3) % 5 != 0: cv.put(x, 67, hood)

    # --- frame posts and gothic arches
    posts = ((CX - 13, 5, 3), (CX - 7, 4, 2), (CX + 7, 3, 1), (CX + 13, 2, 0))
    for px, lit, dk in posts:
        cv.vline(px, top, bot, br[lit]); cv.vline(px + (1 if px < CX else -1), top, bot, br[dk])
        for y in range(top + 3, bot, 6): cv.put(px, y, br[6] if px < CX else br[4])
    # centre arch
    for x in range(CX - 6, CX + 7):
        ah = int(round(3.2 * (1 - ((x - CX) / 6.5) ** 2)))
        for y in range(top, top + 4 - ah): cv.put(x, y, br[3] if x < CX else br[2])
        cv.put(x, top + 4 - ah, br[5] if x <= CX else br[3])
    for sx0, sx1 in ((CX - 12, CX - 8), (CX + 8, CX + 12)):
        cv.hline(sx0, sx1, top, br[3]); cv.hline(sx0, sx1, top + 1, br[2])
    # mid tracery bar
    cv.hline(CX - 12, CX - 8, 53, br[3]); cv.hline(CX + 8, CX + 12, 53, br[1])

    # --- base
    cv.rect(CX - 15, 69, CX + 15, 71, br[3])
    cv.hline(CX - 15, CX + 15, 69, br[5]); cv.hline(CX - 15, CX + 15, 71, br[1])
    for x in range(CX - 14, CX + 15, 2): cv.put(x, 70, br[4] if x < CX else br[2])
    for i, y in enumerate(range(72, 77)):
        half = 12 - i * 2
        for x in range(CX - half, CX + half + 1):
            rel = (x - (CX - half)) / max(1, 2 * half)
            cv.put(x, y, br[5 if rel < .2 else 4 if rel < .5 else 2 if rel < .8 else 1])
    # feet + pendant
    for fx in (CX - 9, CX + 9):
        cv.rect(fx - 1, 74, fx + 1, 77, br[3]); cv.put(fx - 1, 74, br[5]); cv.put(fx, 78, br[2])
    cv.vline(CX, 77, 79, br[3]); cv.put(CX, 80, br[5])

    outline(cv, B[0] + () if False else (12, 8, 5, 255))
    # restore aura/pulse pixels that the outline overwrote? outline only writes where alpha<1 (empty)
    # --- flash bloom specks (energy received) drawn after outline
    if flash > 0:
        rng = np.random.default_rng(int(flash * 100) + 5)
        for _ in range(int(14 * flash)):
            ang = rng.uniform(0, TAU); r = rng.uniform(16, 24)
            x, y = CX + r * math.cos(ang), 52 + r * 1.15 * math.sin(ang)
            cv.put(x, y, G[8]); cv.put(x + 1, y, G[6])
        # rays out of glass
        for ang in np.linspace(0, TAU, 12, endpoint=False):
            for r in range(15, 15 + int(6 * flash)):
                cv.put(CX + r * math.cos(ang), 52 + r * 1.2 * math.sin(ang), G[7] if r < 18 else G[5])
    if glow > .4 and flash == 0:
        # small motes being drawn INTO the lantern from the right (soul intake)
        for i in range(5):
            ph = (t + i / 5) % 1.0
            r = 28 * (1 - ph)
            ang = -0.25 + 0.5 * math.sin(i * 2.1)
            x, y = CX + 6 + r * math.cos(ang), 52 + r * math.sin(ang) * 0.6
            if r > 14: cv.put(x, y, G[6] if ph > .5 else G[5])
    return cv


def lantern_frames():
    frames, tags = [], {}
    def add(tag, **kw):
        tags.setdefault(tag, []).append(len(frames)); frames.append(lantern_frame(**kw))
    for i in range(4):   # dormant, faint breathing
        add('dormant', glow=0.0, eyes=0.1 * (i % 2))
    for i, g in enumerate((0.18, 0.36, 0.58, 0.8)):  # awakening: eyes first
        add('awaken', glow=g, eyes=min(1, 0.4 + i * 0.25), aura=g * 0.5, t=i / 4)
    for i, r in enumerate((16, 22, 29, 36)):  # single toll pulse
        add('toll', glow=1.0, eyes=1, pulse_r=r, pulse_a=(1.0, 0.85, 0.55, 0.3)[i], aura=0.75 - i * .08, t=i / 4)
    for i in range(6):   # receiving loop (seamless)
        add('receive_loop', glow=0.85 + 0.1 * math.sin(TAU * i / 6), eyes=1, aura=0.55, flicker=0.6 * math.sin(TAU * i / 6 * 2), t=i / 6)
    for f in (0.6, 1.0, 0.7):  # soul energy arrives -> flash
        add('flash', glow=1.0, eyes=1, flash=f, aura=0.9, t=0)
    for i, g in enumerate((0.75, 0.5, 0.3, 0.15, 0.05, 0.0)):  # dims
        add('dim', glow=g, eyes=max(0, 1 - i * 0.25), aura=max(0, 0.5 - i * 0.12), t=i / 6)
    return frames, tags


# ---------------------------------------------------------------- TARGET FUMES
FW, FH = 128, 128
FCX, FCY = 64, 66           # centre of reserved character space
HOLE_RX, HOLE_RY = 15, 26   # empty ellipse (character stays readable)
CHEST = (64, 62); MOUTH = (63, 47)

def wisp_curve(p0, n, bend, length):
    pts = []
    x, y = p0
    for i in range(n):
        u = i / (n - 1)
        # pulled up and left, curling
        curl = 2.5 * u * math.sin(u * TAU * 1.2 + bend)
        x = p0[0] - length * 0.9 * u ** 1.25 + bend * math.sin(u * math.pi) * 0.35
        y = p0[1] - length * 0.78 * u ** 0.85 + curl
        pts.append((x, y, u))
    return pts


def fumes_frame(t, n_frames):
    cv = Canvas(FW, FH)
    Y, X = np.mgrid[0:FH, 0:FW].astype(float)
    ex = (X - FCX) / HOLE_RX; ey = (Y - FCY) / HOLE_RY
    e = np.sqrt(ex ** 2 + ey ** 2)
    # ring envelope: zero inside the hole, peak just outside, fade by r~1.9
    ring = np.clip((e - 1.0) / 0.25, 0, 1) * np.clip((2.05 - e) / 0.8, 0, 1)
    # bias: heavier at the bottom and on the right (smoke streams up-left away)
    bias = 0.85 + 0.25 * np.clip((Y - FCY) / 40, -1, 1) + 0.12 * np.clip((X - FCX) / 30, -1, 1)
    tb = loop_turb(X, Y, t, 11, scale=1.0, octaves=4, warp=4.5)
    tb2 = loop_turb(X * 1.7, Y * 1.7, t, 19, scale=1.0, octaves=3, warp=3)
    dens = ring * bias * (0.62 + 0.55 * tb) + 0.15 * tb2 * ring
    # swirl rotation: angular streaks
    ang = np.arctan2(Y - FCY, X - FCX)
    dens += ring * 0.12 * np.sin(ang * 5 + e * 7 - TAU * t)
    idx = quantize(dens, G[0:6], 0.16, 1.0, dither=1.0)
    blit_idx(cv, idx, G[0:6], edge_alpha=150)
    # bright ridge filaments in the smoke (sharp spectral lines)
    rv = loop_turb(X, Y, t, 31, scale=1.3, octaves=2, warp=5)
    zc = zero_cross(rv)
    cv.a[zc & (ring > 0.45) & (dens > 0.45)] = G[5]
    cv.a[zc & (ring > 0.7) & (dens > 0.75)] = G[6]
    rv2 = loop_turb(X, Y, t, 37, scale=0.9, octaves=2, warp=4)
    cv.a[zero_cross(rv2) & (ring > 0.8) & (dens > 0.9)] = G[7]

    # ghost faces emerging in the smoke (brief, then dissolve)
    faces = []
    for deg, a0, a1 in ((165, 0.10, 0.42), (-25, 0.45, 0.78), (215, 0.72, 1.05)):
        r_ = 1.42
        faces.append(((FCX + r_ * HOLE_RX * math.cos(math.radians(deg)),
                       FCY + r_ * HOLE_RY * math.sin(math.radians(deg))), a0, a1))
    for (fx, fy), a0, a1 in faces:
        fx, fy = int(round(fx)), int(round(fy))
        ph = ((t - a0) % 1.0) / (a1 - a0)
        if ph < 0 or ph > 1: continue
        k = math.sin(math.pi * ph)
        if k < 0.25: continue
        lit = G[4] if k < .55 else G[5]
        dark = G[1] if k < .55 else G[0]
        # gaunt elongated face, dissolving at the edges (dither by k)
        for yy in range(-8, 11):
            hw = 5 if yy < 1 else 4 if yy < 6 else 3
            for xx in range(-hw, hw + 1):
                if (abs(xx) == hw or yy in (-8, 10)) and BAYER[(fy+yy) % 4, (fx+xx) % 4] > k - 0.6: continue
                cv.put(fx + xx, fy + yy, lit if xx < 1 else G[3] if k < .7 else G[4])
        for xx in range(-4, 4): cv.put(fx + xx, fy - 8, G[6] if k > .7 else G[5])
        # hollow, sorrowful eyes (slanted down at the outer corners)
        for ex in (-2, 2):
            for yy in (-3, -2, -1, 0):
                cv.put(fx + ex, fy + yy, dark); cv.put(fx + ex + (-1 if ex < 0 else 1), fy + yy + 1, dark)
            cv.put(fx + ex - (1 if ex < 0 else -1), fy - 3, dark)
            if k > .8: cv.put(fx + ex, fy - 2, G[7])
        cv.put(fx, fy + 1, G[2])
        # wailing mouth
        mh = 3 + int(round(4 * k))
        for yy in range(mh):
            w = 1 if 0 < yy < mh - 1 else 0
            for xx in range(-w, w + 1): cv.put(fx + xx, fy + 2 + yy, dark)

    # wisps peeling from chest + mouth, pulled up-left toward the offscreen lantern
    for (p0, seed, length, bend, ph0) in ((MOUTH, 3, 46, 5, 0.0), (CHEST, 7, 58, -9, 0.33), (CHEST, 9, 50, 12, 0.66)):
        pts = wisp_curve(p0, 90, bend + 2 * math.sin(TAU * (t + ph0)), length)
        prev = None
        for (x, y, u) in pts:
            if x < 8 or y < 8: continue
            if u > 0.3 and math.sin(u * 34 - TAU * (t + ph0) * 3) < -0.8: continue  # puffs breaking off
            pulse = (u * 3 - (t + ph0) * 3) % 1.0
            wid = 3 if u < 0.35 else 2 if u < 0.7 else 1
            # vapour sleeve
            for dy in range(-wid, wid + 1):
                for dx in (-1, 0):
                    if abs(dy) == wid and BAYER[int(y + dy) % 4, int(x + dx) % 4] > 0.1: continue
                    if abs(dy) >= 1: cv.put(x + dx, y + dy, G[3] if abs(dy) == wid else G[4])
            core = G[8] if pulse < 0.08 else G[7] if pulse < 0.2 else G[6] if u < .6 else G[5]
            cv.put(x, y, core)
    # keep the hole very sparse: knock out any smoke inside the character area except wisps
    hole = (e < 0.92)
    keep = np.isin(cv.a[:, :, 1], [G[4][1], G[5][1], G[6][1], G[7][1]])  # bright wisp pixels
    cv.a[hole & ~keep] = 0
    # transparent margin guarantee
    m = 4
    cv.a[:m] = 0; cv.a[-m:] = 0; cv.a[:, :m] = 0; cv.a[:, -m:] = 0
    return cv


# ---------------------------------------------------------------- TRAVELING SOUL
SW, SH = 96, 56
HX, HY = 24, 27   # head centre (faces LEFT)

def soul_frame(t):
    cv = Canvas(SW, SH)
    Y, X = np.mgrid[0:SH, 0:SW].astype(float)
    # tail: tapering vapour body streaming to the RIGHT
    u = np.clip((X - HX) / (SW - 12 - HX), 0, 1.2)
    centre = HY + 3.0 * np.sin(u * 5.5 - TAU * t) * u + 1.5 * u
    half = 12.5 * np.clip(1 - u, 0, 1) ** 0.8 + 0.6
    d_tail = np.abs(Y - centre) / np.maximum(half, 0.5)
    tb = loop_turb(X, Y, t, 41, scale=0.9, octaves=4, warp=3.5)
    body = np.clip(1 - d_tail, 0, 1) * (X > HX - 4) * (u < 1.0)
    dens = body * (0.75 + 0.45 * tb) * (1 - 0.6 * u)
    # head volume
    dh = np.hypot((X - HX) / 12.0, (Y - HY) / 14.0)
    dens = np.maximum(dens, np.clip(1.15 - dh, 0, 1) * (0.9 + 0.2 * tb))
    # streaming hair strands from the scalp backward
    for k, (off, ph) in enumerate(((-9, 0.0), (-5, .3), (0, .55), (5, .8))):
        sy = HY + off + 2 * np.sin((X - HX) * 0.22 - TAU * (t + ph))
        strand = (np.abs(Y - sy) < 0.9) & (X > HX + 2) & (X < HX + 34 - abs(off) * 1.5)
        dens = np.where(strand, np.maximum(dens, 0.62), dens)
    idx = quantize(dens, G[0:7], 0.18, 1.1, dither=1.0)
    blit_idx(cv, idx, G[0:7], edge_alpha=160)
    # sharp filaments through the tail
    rv = loop_turb(X, Y * 1.4, t, 53, scale=1.2, octaves=2, warp=4)
    zc = zero_cross(rv)
    cv.a[zc & (body > 0.3) & (X > HX + 10)] = G[5]
    cv.a[zc & (body > 0.55) & (X > HX + 10)] = G[6]

    # ---- face (facing LEFT, screaming) — 3/4 profile, lit from the front-left
    flick = 0.5 + 0.5 * math.sin(TAU * t * 2)
    jaw = 8 + int(round(2 * math.sin(TAU * t)))
    face, face_l, dark, deep = G[4], G[5], G[0], hx('020806')
    for yy in range(-12, 14):
        if yy < 0: w = int(round(9 * math.sqrt(1 - (yy / 12.5) ** 2)))
        else: w = int(round(8 - yy * 0.42))
        for xx in range(-w, w // 2 + 2):
            col = G[6] if xx < -w + 2 and yy < 4 else face_l if xx < -w + 5 else face
            if yy < -8: col = G[5]
            cv.put(HX + xx, HY + yy, col)
    # cheekbone shadow and temple hollow
    for yy in range(0, 6): cv.put(HX + 1, HY + yy, G[3]); cv.put(HX + 2, HY + yy + 1, G[2])
    for yy in range(-7, -3): cv.put(HX + 3, HY + yy, G[3])
    # brow ridge
    for xx in range(-8, 2): cv.put(HX + xx, HY - 6, G[7] if xx < -4 else G[6])
    # eye sockets: near eye large, far eye foreshortened
    for (ex, ey, ew) in ((HX - 6, HY - 4, 2), (HX - 1, HY - 4, 1)):
        for yy in range(4):
            for xx in range(-ew, ew + 1):
                cv.put(ex + xx, ey + yy + 1, deep if 0 < yy < 3 else dark)
        pc = G[8] if flick > .4 else G[7]
        cv.put(ex - (1 if ew == 2 else 0), ey + 2, pc)
        if flick > .4 and ew == 2: cv.put(ex - 1, ey + 3, G[6])
    # nose cavity
    cv.put(HX - 6, HY + 2, dark); cv.put(HX - 5, HY + 2, dark); cv.put(HX - 6, HY + 3, G[2])
    # screaming mouth — tall, stretched O
    my0 = HY + 5
    for yy in range(jaw):
        w = 1 if yy in (0, jaw - 1) else 2 if yy in (1, jaw - 2) else 3
        for xx in range(-w, w + 1):
            cv.put(HX - 5 + xx, my0 + yy, deep if abs(xx) < w else dark)
    for xx in (-6, -4, -2): cv.put(HX + xx - 1, my0 + 1, G[7])  # upper teeth
    cv.put(HX - 6, my0 + jaw - 2, G[5]); cv.put(HX - 4, my0 + jaw - 2, G[5])
    # wail vapour from the mouth (short, leading edge)
    for i in range(4):
        cv.put(HX - 10 - i, my0 + 3 + int(round(math.sin(TAU * t + i))), G[4] if i < 2 else G[3])
    outline(cv, (4, 14, 10, 200))
    m = 2
    cv.a[:m] = 0; cv.a[-m:] = 0; cv.a[:, :m] = 0; cv.a[:, -m:] = 0
    return cv


# ---------------------------------------------------------------- CONNECTING WISPS
WW, WH = 128, 32

def wisp_frame(t):
    cv = Canvas(WW, WH)
    xs = np.arange(WW)
    env = np.clip(xs / 18, 0, 1) * np.clip((WW - 1 - xs) / 18, 0, 1)  # tapered ends
    env = env ** 0.8
    yc = WH / 2
    # faint vapour sleeve
    Y, X = np.mgrid[0:WH, 0:WW].astype(float)
    tb = loop_turb(X, Y, t, 61, scale=0.8, octaves=3, warp=2.5)
    # flow leftward: features move -x as t grows (integer spatial cycles keep it seamless)
    sleeve = np.clip(1 - np.abs(Y - yc) / (5.5 * env[None, :] + 0.01), 0, 1) * env[None, :]
    dens = sleeve * (0.5 + 0.4 * tb)
    idx = quantize(dens, G[1:4], 0.22, 0.95, dither=1.0)
    blit_idx(cv, idx, G[1:4], edge_alpha=140)
    # twisting filaments (helix pairs), consistent thickness
    strands = [(2, 4.0, 0.0, 1), (2, 4.0, 0.5, 1), (3, 2.5, 0.25, 0), (1, 6.0, 0.7, 0)]
    for (m, amp, ph, bright) in strands:
        for x in range(WW):
            if env[x] <= 0.02: continue
            a = amp * env[x]
            phase = TAU * (m * x / WW + t * m + ph)   # moves toward -x
            y = yc + a * math.sin(phase)
            depth = math.cos(phase)  # front/back of the twist
            col = (G[7] if depth > .55 else G[6] if depth > -0.1 else G[4]) if bright else (G[5] if depth > .3 else G[3])
            if env[x] < .35: col = G[4] if bright else G[3]
            # suction pulses: brighter beads travelling left
            bead = (x / WW * 4 + t * 4) % 1.0
            if bright and bead < 0.08 and env[x] > .5: col = G[8]
            cv.put(x, y, col)
    # sparse drifting motes (shift by 32px per loop -> seamless)
    for base, dy in ((5, -6), (21, 7)):
        for k in range(4):
            x = (base + 32 * k - 32 * t) % WW
            e = env[int(x)]
            if e < .3: continue
            y = yc + dy * e + math.sin(TAU * (t + k * .25)) * 1
            cv.put(x, y, G[7]); cv.put(x + 1, y, G[5])
    return cv


# ---------------------------------------------------------------- EXPORT
def save_layer(name, frames, fps, tags=None, loop=True, scale=4):
    d = os.path.join(OUT, name); os.makedirs(os.path.join(d, 'frames'), exist_ok=True)
    imgs = [f.img() for f in frames]
    w, h = imgs[0].size
    strip = Image.new('RGBA', (w * len(imgs), h), (0, 0, 0, 0))
    for i, im in enumerate(imgs):
        strip.paste(im, (i * w, 0)); im.save(os.path.join(d, 'frames', f'{name}_{i:02d}.png'))
    strip.save(os.path.join(d, f'{name}_strip.png'))
    strip.resize((strip.width * scale, strip.height * scale), Image.NEAREST).save(os.path.join(d, f'{name}_strip@{scale}x.png'))
    # GIF previews on a dark map-ish background
    prev = []
    for im in imgs:
        bg = Image.new('RGBA', (w, h), (24, 22, 30, 255))
        checker = np.zeros((h, w, 4), np.uint8); checker[..., 3] = 255
        cy, cx = np.mgrid[0:h, 0:w]
        checker[..., :3] = np.where((((cx // 8) + (cy // 8)) % 2 == 0)[..., None], [26, 24, 33], [32, 30, 40])
        bg = Image.fromarray(checker, 'RGBA'); bg.alpha_composite(im)
        prev.append(bg.convert('RGB').resize((w * scale, h * scale), Image.NEAREST))
    prev[0].save(os.path.join(d, f'{name}_preview.gif'), save_all=True, append_images=prev[1:],
                 duration=int(1000 / fps), loop=0)
    meta = {'layer': name, 'frame_w': w, 'frame_h': h, 'frames': len(imgs), 'fps': fps,
            'loop': loop, 'tags': tags or {}, 'filter': 'nearest'}
    with open(os.path.join(d, f'{name}.json'), 'w') as fh: json.dump(meta, fh, indent=2)
    return meta


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    metas = {}
    lf, tags = lantern_frames()
    metas['lantern'] = save_layer('lantern', lf, 10, tags=tags, loop=False)
    metas['lantern']['anchor'] = {'x': CX, 'y': 17, 'note': 'hanging ring = caster hand'}
    N = 16
    metas['target_fumes'] = save_layer('target_fumes', [fumes_frame(i / N, N) for i in range(N)], 12)
    metas['target_fumes']['anchor'] = {'x': FCX, 'y': FCY, 'note': 'centre of target sprite; hole rx15 ry28'}
    N = 8
    metas['traveling_soul'] = save_layer('traveling_soul', [soul_frame(i / N) for i in range(N)], 12)
    metas['traveling_soul']['anchor'] = {'x': HX, 'y': HY, 'note': 'face centre; art faces LEFT, rotate to path'}
    N = 12
    metas['connecting_wisps'] = save_layer('connecting_wisps', [wisp_frame(i / N) for i in range(N)], 12)
    metas['connecting_wisps']['anchor'] = {'x': WW // 2, 'y': WH // 2, 'note': 'flows RIGHT->LEFT; tile along path'}
    with open(os.path.join(OUT, 'toll_the_dead_pixel.json'), 'w') as fh: json.dump(metas, fh, indent=2)
    print(json.dumps({k: (v['frame_w'], v['frame_h'], v['frames']) for k, v in metas.items()}))
