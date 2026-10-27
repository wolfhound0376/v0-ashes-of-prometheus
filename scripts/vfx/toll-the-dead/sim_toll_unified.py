"""Toll the Dead — unified 4K effect: target fumes -> extraction stream -> pixel lantern.

One stable-fluids simulation spans the whole cast, so the gas that wreathes the
target is the SAME gas that travels the path and pours into the lantern glass.
The stream follows the path of the pixel connecting-wisps: horizontal, right ->
left, twisting as it goes. Souls (Sam's painted soul, recoloured) ride inside it.

Palette: the reference painting's four smoke tones (k-means of its green-cast
smoke: shadow 61,91,84 / low 90,123,116 / mid 124,165,153 / high 168,209,199),
kept at the same brightness steps but rotated to an emerald hue and saturated.

  python3 sim_toll_unified.py <pack_dir> <pixel_lantern_frames_dir> <out_dir>
"""
import colorsys, json, math, os, subprocess, sys
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates, gaussian_filter, zoom, maximum_filter, minimum_filter

PACK, LDIR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(os.path.join(OUT, 'master'), exist_ok=True)
GW, GH = 768, 256            # sim grid
SC = 5                       # 4K: 3840 x 1280
FPS = 24
NF = 72                      # sim frames (2.75 s) after the toll
SUB = 3
rng = np.random.default_rng(23)
Y, X = np.mgrid[0:GH, 0:GW].astype(np.float64)

# --- scene geometry (grid units)
LAN = np.array([118.0, 132.0])       # centre of the lantern glass (intake)
TGT = np.array([630.0, 136.0])      # target chest
HRX, HRY = 20.0, 46.0               # target silhouette
MOUTH = TGT + [-2.0, -24.0]
ARCH = 14.0                         # gentle upward arch of the path


def path_y(x):
    s = np.clip((TGT[0] - x) / (TGT[0] - LAN[0]), 0, 1)
    return TGT[1] + (LAN[1] - TGT[1]) * s - ARCH * np.sin(np.pi * s), s


PY, PS = path_y(X)
inside = (X > LAN[0] - 4) & (X < TGT[0] + 10)

# --- palette
REF = [(61, 91, 84), (90, 123, 116), (124, 165, 153), (168, 209, 199), (214, 234, 235)]


def emeraldize(c, hue=152 / 360, sat_mul=1.9):
    h, s, v = colorsys.rgb_to_hsv(*(np.array(c) / 255))
    s = min(0.9, s * sat_mul)
    if v > 0.85: s = min(s, 0.22)       # the hottest tone stays near-white mint, like the reference
    r, g, b = colorsys.hsv_to_rgb(hue + (0.02 if v > .7 else 0), s, v)
    return np.array([r, g, b]) * 255


# The reference's tone steps, pushed to emerald with real depth: dark emerald shadows,
# saturated emerald body, aqua-mint highlights, near-white mint peak (the reference's brightest wisps).
PAL = np.array([[8, 62, 40],      # shadow  (ref 61,91,84 -> emerald, deeper)
                [22, 128, 82],    # low     (ref 90,123,116)
                [58, 196, 132],   # mid     (ref 124,165,153)
                [150, 236, 200],  # high    (ref 168,209,199)
                [226, 255, 240]], dtype=float)  # peak (ref 214,234,235)

kx = np.fft.fftfreq(GW)[None, :] * 2 * np.pi
ky = np.fft.fftfreq(GH)[:, None] * 2 * np.pi
k2 = kx ** 2 + ky ** 2; k2[0, 0] = 1


def project(u, v):
    uh, vh = np.fft.fft2(u), np.fft.fft2(v)
    dot = (kx * uh + ky * vh) / k2
    return np.real(np.fft.ifft2(uh - kx * dot)), np.real(np.fft.ifft2(vh - ky * dot))


def sl(f, u, v, order=3):
    return map_coordinates(f, [Y - v, X - u], order=order, mode='constant', cval=0.0, prefilter=False)


def bfecc(f, u, v):
    fwd = sl(f, u, v); back = sl(fwd, -u, -v)
    out = sl(f + 0.5 * (f - back), u, v)
    lin = sl(f, u, v, order=1)
    return np.clip(out, minimum_filter(lin, 3), maximum_filter(lin, 3))


def vort(u, v, eps):
    w = (np.roll(v, -1, 1) - np.roll(v, 1, 1)) * .5 - (np.roll(u, -1, 0) - np.roll(u, 1, 0)) * .5
    aw = np.abs(w)
    gx = (np.roll(aw, -1, 1) - np.roll(aw, 1, 1)) * .5; gy = (np.roll(aw, -1, 0) - np.roll(aw, 1, 0)) * .5
    m = np.hypot(gx, gy) + 1e-6
    return eps * (gy / m) * w, -eps * (gx / m) * w


def splat(f, cx, cy, r, amt):
    x0, x1 = int(max(0, cx - 4 * r)), int(min(GW, cx + 4 * r + 1))
    y0, y1 = int(max(0, cy - 4 * r)), int(min(GH, cy + 4 * r + 1))
    if x0 >= x1 or y0 >= y1: return
    f[y0:y1, x0:x1] += amt * np.exp(-((X[y0:y1, x0:x1] - cx) ** 2 + (Y[y0:y1, x0:x1] - cy) ** 2) / (2 * r * r))


bd = np.minimum.reduce([X, Y, GW - 1 - X, GH - 1 - Y])
sponge = np.clip(bd / 40, 0, 1)
lan_r2 = (X - LAN[0]) ** 2 + (Y - LAN[1]) ** 2
sink = np.exp(-lan_r2 / (2 * 14.0 ** 2))
beyond = np.clip((X - (LAN[0] - 34)) / 30, 0, 1)        # nothing passes the lantern                       # the glass drinks the gas
u = np.zeros((GH, GW)); v = np.zeros((GH, GW)); d = np.zeros((GH, GW))
vents = [(rng.uniform(0, math.tau), rng.uniform(.7, 1.3), rng.choice([-1, 1])) for _ in range(20)]
frames, intake = [], []
PRE = 40; total = NF * SUB
for step in range(-PRE, total):
    pre = step < 0
    t = max(0, step) / total
    emit = 1.0 if pre else min(1, 0.4 + t / 0.1) * (1 if t < 0.6 else max(0, 1 - (t - 0.6) / 0.14))
    suck = 0.35 if pre else min(1, 0.35 + t / 0.12) * (1 if t < 0.8 else max(0.3, 1 - (t - 0.8) / 0.2))
    # wreath of vents around the target (never inside it)
    for i, (a0, gain, spin) in enumerate(vents):
        a = a0 + 0.25 * math.sin(max(step, 0) * 0.03 + i)
        e = 1.1 + 0.08 * math.sin(i * 2.3 + step * 0.04)
        cx, cy = TGT[0] + HRX * e * math.cos(a), TGT[1] + HRY * e * math.sin(a)
        if not pre: splat(d, cx, cy, 2.4, 0.028 * gain * emit * min(1, t / 0.08 + 0.25))
        tx, ty = -math.sin(a) * spin, math.cos(a) * spin
        splat(u, cx, cy, 4.5, 0.15 * emit * (0.8 * tx + 0.6 * math.cos(a)))
        splat(v, cx, cy, 4.5, 0.15 * emit * (0.8 * ty + 0.6 * math.sin(a) - 0.15))
    # the soul-stream: peels from chest and mouth, straight into the path
    if not pre and suck > 0.4:
        splat(d, TGT[0] - 30, path_y(np.array([TGT[0] - 30.0]))[0][0], 3.0, 0.10 * emit)
        for p, amt in ((TGT + [-6, -4], 0.16), (MOUTH + [-6, -2], 0.13)):
            splat(d, p[0], p[1], 2.0, amt * emit)
            splat(u, p[0], p[1], 3.5, -0.5 * emit)
    # --- forces
    v -= 0.004 * d                                                # buoyancy (light: this gas is being drawn, not rising)
    # --- the extraction corridor along the pixel-wisps path: velocity is STEERED, not merely nudged
    w = np.exp(-((Y - PY) / 13.0) ** 2) * inside
    tw = 2 * math.pi * (max(step, 0) / (SUB * FPS)) * 1.6
    helix = 2.6 * np.sin(PS * 2 * math.pi * 3.0 + tw)             # the twist of the pixel wisps
    dPY = np.gradient(PY, axis=1)
    U_t = -6.0 * suck; V_t = U_t * dPY + helix * suck - 0.05 * (Y - PY)
    a = 0.5 * w * min(1, suck * 1.5)
    u = u * (1 - a) + U_t * a; v = v * (1 - a) + V_t * a
    # the target's smoke is drawn into the corridor mouth
    MX, MY = TGT[0] - 34, TGT[1] - 4
    rx, ry = MX - X, MY - Y; rr = np.hypot(rx, ry) + 1e-3
    near = np.exp(-(rr / 70.0) ** 2) * (X > MX - 10)
    b = 0.06 * near * suck
    u = u * (1 - b) + (1.6 * rx / rr) * b; v = v * (1 - b) + (1.6 * ry / rr) * b
    # funnel into the lantern glass
    fun = np.exp(-lan_r2 / (2 * 28 ** 2)) * suck * 0.25
    u = u * (1 - fun) + (LAN[0] - X) / 20 * fun; v = v * (1 - fun) + (LAN[1] - Y) / 20 * fun
    fu, fv = vort(u, v, 0.035); u += fu; v += fv
    if step % 9 == 0:
        cx, cy = rng.uniform(TGT[0] - 120, TGT[0] + 60), rng.uniform(40, 220)
        splat(u, cx, cy, 14, rng.normal(0, .25)); splat(v, cx, cy, 14, rng.normal(0, .25))
    u, v = sl(u, u, v, order=1), sl(v, u, v, order=1)
    damp = 0.985 + 0.015 * np.clip(bd / 8, 0, 1)
    u, v = project(u * damp, v * damp)
    u = gaussian_filter(u, 1.0); v = gaussian_filter(v, 1.0)   # viscosity; also removes the grid-scale sawtooth
    # re-impose the corridor after projection so its speed and twist survive (a guided stream, like the pixel wisps)
    a2 = 0.6 * w * min(1, suck * 1.5)
    u = u * (1 - a2) + U_t * a2; v = v * (1 - a2) + V_t * a2
    d = np.clip(bfecc(d, u, v), 0, None)
    d = d + 0.06 * (gaussian_filter(d, 0.7) - d)                  # light diffusion: smooth edges at 4K
    taken = (d * sink * 0.45).sum()
    d *= (1 - 0.45 * sink) * (0.6 + 0.4 * beyond)
    d *= (0.99 + 0.009 * w) * (0.93 + 0.07 * sponge) * (0.9 + 0.1 * np.clip(np.abs(X - LAN[0]) / 25, 0, 1))
    if step >= 0 and (step + 1) % SUB == 0:
        frames.append(d.copy()); intake.append(taken)

if os.environ.get('QUICK'):
    pk = np.percentile(np.concatenate([f.ravel() for f in frames]), 99.6)
    for i in (8, 18, 28, 40, 55, 68):
        g = np.clip(frames[i] / pk, 0, 1)
        im = (np.dstack([g * 140 + 30, g * 230 + 28, g * 190 + 38])).astype(np.uint8)
        Image.fromarray(im).save(os.path.join(OUT, f'_q{i}.png'))
    sys.exit(0)

# ---------------------------------------------------------------- souls (painted, recoloured)
soul_strip = Image.open(os.path.join(PACK, 'traveling-soul.png')).convert('RGBA')
souls = []
for i in range(4):
    c = np.asarray(soul_strip.crop((i * 512, 0, i * 512 + 512, 512))).astype(np.float32)
    lum = (c[..., :3] @ np.array([.3, .59, .11])) / 255
    lv = np.clip((lum - 0.12) / 0.75, 0, 1)
    idx = lv * (len(PAL) - 1); lo = np.floor(idx).astype(int); hi = np.minimum(lo + 1, len(PAL) - 1); fr = (idx - lo)[..., None]
    rgb = PAL[lo] * (1 - fr) + PAL[hi] * fr
    souls.append(np.dstack([rgb, c[..., 3] * 0.9]).astype(np.uint8))
SOUL_IMGS = [Image.fromarray(s, 'RGBA') for s in souls]

# ---------------------------------------------------------------- render 4K
W4, H4 = GW * SC, GH * SC
fb_x = np.clip(np.minimum(np.arange(W4), np.arange(W4)[::-1]) / 160, 0, 1)
fb_y = np.clip(np.minimum(np.arange(H4), np.arange(H4)[::-1]) / 120, 0, 1)
feather = (fb_y[:, None] * fb_x[None, :]) ** 1.5
yy, xx = np.mgrid[0:H4, 0:W4] / SC
eh = np.hypot((xx - TGT[0]) / HRX, (yy - TGT[1]) / HRY)
veil = 0.55 + 0.45 * np.clip((eh - 0.75) / 0.35, 0, 1)
peak = np.percentile(np.concatenate([f.ravel() for f in frames]), 99.6)


def shade(g):
    gs = gaussian_filter(g, 0.9 * SC / 2)
    gy_, gx_ = np.gradient(gaussian_filter(g, 2.2 * SC / 2))
    grad = np.hypot(gx_, gy_) * (SC * 9)
    sheen = np.clip(grad * 1.4, 0, 1) ** 1.3 * np.clip(gs * 4, 0, 1)
    body = 1 - np.exp(-1.0 * gs)
    lvl = np.clip(gs * 1.15, 0, 1)
    # three-tone body: shadow -> low -> mid -> high by density (the reference's banding)
    idx = lvl * 3; lo = np.floor(idx).astype(int).clip(0, 2); fr = (idx - lo)[..., None]
    bodyc = PAL[lo] * (1 - fr) + PAL[lo + 1] * fr
    glow = gaussian_filter(g, 16 * SC / 2); ga = (1 - np.exp(-1.6 * glow)) * 0.45
    hot = np.clip((gs - 0.6) * 2.0, 0, 1)
    A = ga; C = PAL[1] * ga[..., None]
    for col, a in ((bodyc, body * 0.46), (PAL[3], sheen * 0.62), (PAL[4], hot * 0.5)):
        a = a[..., None]
        C = col * a + C * (1 - a); A = a[..., 0] + A * (1 - a[..., 0])
    C = C / np.maximum(A[..., None], 1e-6)
    return C, A


lan_frames = [Image.open(os.path.join(LDIR, 'frames', f'lantern_{i:02d}.png')) for i in range(27)]
ltags = json.load(open(os.path.join(LDIR, 'lantern.json')))['tags']
LSCALE = 5                                              # 96 px pixel cell -> 480 px, nearest
lan_px = (int(LAN[0] * SC - 48 * LSCALE), int(LAN[1] * SC - 52 * LSCALE))   # glass centre (48,52) on intake

intake = np.array(intake); intake /= intake.max()
soul_spawn = [12, 22, 32]                               # sim frames at which a soul peels off
SOUL_TRAVEL = 26                                        # frames target -> lantern
arrivals = {s + SOUL_TRAVEL for s in soul_spawn}


def lantern_index(gi):
    """Global frame -> lantern frame. Lead-in: dormant, awaken, toll at 12-fps cadence (x2 at 24 fps)."""
    lead = 24
    if gi < lead:
        seg = ['dormant'] * 8 + ['awaken'] * 8 + ['toll'] * 8
        tag = seg[gi]; k = (gi % 8) // 2
        return ltags[tag][k % len(ltags[tag])]
    fi = gi - lead
    if fi < NF:
        if any(0 <= fi - a < 3 for a in arrivals): return ltags['flash'][min(2, fi - min(a for a in arrivals if fi - a >= 0 and fi - a < 3))]
        return ltags['receive_loop'][(fi // 2) % len(ltags['receive_loop'])]
    k = (fi - NF) // 2
    return ltags['dim'][min(k, len(ltags['dim']) - 1)]


LEAD, TAIL = 24, 12
NTOT = LEAD + NF + TAIL
CW, CH = 1280, 427
sel = list(range(0, NTOT, 2)); cols = 6; rows = -(-len(sel) // cols)
sheet = Image.new('RGBA', (cols * CW, rows * CH), (0, 0, 0, 0))
gif = []
for gi in range(NTOT):
    fi = gi - LEAD
    canvas = Image.new('RGBA', (W4, H4), (0, 0, 0, 0))
    if 0 <= fi < NF:
        g = np.clip(zoom(frames[fi] / peak, SC, order=3), 0, None)
        C, A = shade(g)
        A = np.clip(A * veil * feather, 0, 0.82)
        canvas = Image.fromarray(np.dstack([np.clip(C, 0, 255), A * 255]).astype(np.uint8), 'RGBA')
        # souls ride the stream: same path, same right->left motion
        for s0 in soul_spawn:
            q = (fi - s0) / SOUL_TRAVEL
            if 0 <= q <= 1:
                x = TGT[0] - 10 - q * (TGT[0] - 10 - LAN[0] - 26)
                y, _ = path_y(np.array([x]))
                size = int(190 * SC * (0.95 - 0.25 * q))
                im = SOUL_IMGS[(gi // 2) % 4].resize((size, size), Image.LANCZOS)
                a = min(1, q * 7, (1 - q) * 7)
                im.putalpha(im.getchannel('A').point(lambda p, a=a: int(p * a)))
                canvas.alpha_composite(im, (int(x * SC - size * 0.28), int(y[0] * SC - size / 2)))
    # the pixel lantern, integer-scaled, nearest-neighbour, drawn last (gas pours INTO it)
    lf = lan_frames[lantern_index(gi)].resize((96 * LSCALE, 96 * LSCALE), Image.NEAREST)
    canvas.alpha_composite(lf, lan_px)
    canvas.save(os.path.join(OUT, 'master', f'toll_{gi:03d}.png'), optimize=False, compress_level=3)
    small = canvas.resize((CW, CH), Image.LANCZOS)
    if gi % 2 == 0:
        k = gi // 2; sheet.paste(small, ((k % cols) * CW, (k // cols) * CH))
    bg = Image.new('RGBA', small.size, (30, 28, 38, 255)); bg.alpha_composite(small); gif.append(bg.convert('RGB'))
    if gi == LEAD + 30:
        bg4 = Image.new('RGBA', canvas.size, (30, 28, 38, 255)); bg4.alpha_composite(canvas); bg4.convert('RGB').save(os.path.join(OUT, '_still4k.png'))
    print("frame", gi, flush=True)
print('master frames', NTOT, W4, H4)

# ---------------------------------------------------------------- encodes
mdir = os.path.join(OUT, 'master')
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(mdir, 'toll_%03d.png'),
                '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-b:v', '0', '-crf', '24', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4',
                os.path.join(OUT, 'toll_the_dead_4k_alpha.webm')], check=True)
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', os.path.join(mdir, 'toll_%03d.png'),
                '-filter_complex', 'color=c=0x1e1c26:s=%dx%d:r=%d[bg];[bg][0:v]overlay=shortest=1,format=yuv420p' % (W4, H4, FPS),
                '-c:v', 'libx264', '-crf', '16', '-preset', 'veryfast', '-movflags', '+faststart',
                os.path.join(OUT, 'toll_the_dead_4k_preview.mp4')], check=True)
gif[0].save(os.path.join(OUT, 'toll_the_dead_preview.gif'), save_all=True, append_images=gif[1:], duration=42, loop=0)
sheet.save(os.path.join(OUT, 'tollUnified.webp'), 'WEBP', quality=84, method=6, alpha_quality=90)
sx = CW / W4
meta = {'tollUnified': {
    'file': 'tollUnified.webp', 'cols': cols, 'rows': rows, 'frames': len(sel), 'fps': 12, 'cell_w': CW, 'cell_h': CH,
    'loop': False, 'filter': 'linear',
    'anchors': {'lantern_ring': [round((lan_px[0] + 48 * LSCALE) * sx), round((lan_px[1] + 17 * LSCALE) * sx)],
                'target_chest': [round(TGT[0] * SC * sx), round(TGT[1] * SC * sx)]},
    'note': 'One frame = the whole cast, lantern LEFT, target RIGHT. Map lantern_ring to the caster hand and '
            'target_chest to the target chest: rotate by the angle between them and scale uniformly by their '
            'distance ratio (flip horizontally when the target is to the caster\'s left).',
    'bytes': os.path.getsize(os.path.join(OUT, 'tollUnified.webp'))}}
json.dump(meta, open(os.path.join(OUT, 'tollUnified.json'), 'w'), indent=2)
print(json.dumps({k: v['bytes'] // 1024 for k, v in meta.items()}), 'palette', PAL.astype(int).tolist())
