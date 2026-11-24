import numpy as np
from PIL import Image
from scipy import ndimage
import os
# Sam's pack (2026-11-23, BloodPakc.png): run from the repo root with  python scripts/blood-pack/build.py
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = Image.open(os.path.join(HERE, 'BloodPack.webp')).convert('RGBA')
BOX = {  # crops of Sam's pack (x0,y0,x1,y1)
 'streak': (0, 90, 680, 800),
 'burst':  (690, 160, 1210, 700),
 'drop1': (1300, 80, 1420, 350), 'drop2': (1500, 330, 1670, 555), 'drop3': (1295, 375, 1415, 555),
 'drop4': (1500, 548, 1660, 768), 'orb1': (1515, 178, 1640, 300), 'orb2': (1310, 652, 1415, 755)}
# blood palette, tuned to the walk's dark plates (darkest first)
AIR   = [(58,4,8),(118,10,14),(172,20,22),(214,40,32),(255,138,116)]
FLOOR = [(34,2,5),(66,6,9),(98,12,14),(132,20,18),(186,70,58)]
def crop(k): return SRC.crop(BOX[k])
def pixelize(im, w, squash=1.0, rot=0, pal=AIR, thr=.42, hi=.04, outline=True, core=None):
    if rot: im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    bb = im.getbbox(); im = im.crop(bb)
    h = max(1, round(im.height * w / im.width * squash))
    a = np.asarray(im).astype(float) / 255
    f = im.width / w
    if f > 2: a[..., 3] = ndimage.maximum_filter(a[..., 3], size=int(f * .55))   # thicken thin strokes so they survive the shrink
    pm = a[..., :3] * a[..., 3:4]                      # premultiplied, so edges average right
    big = Image.fromarray((np.dstack([pm, a[..., 3:4]]) * 255).astype(np.uint8), 'RGBA')
    sm = np.asarray(big.resize((w, h), Image.BOX)).astype(float) / 255
    al = sm[..., 3]; m = al > thr
    if core is not None: m &= al > core
    lum = np.where(al > 0, (sm[..., 0] * .6 + sm[..., 1] * .3 + sm[..., 2] * .1) / np.maximum(al, 1e-3), 0)
    out = np.zeros((h, w, 4), np.uint8)
    if not m.any(): return Image.fromarray(out, 'RGBA')
    v = lum[m]; qs = np.quantile(v, [.25, .6, 1 - hi]) if len(v) > 8 else [v.min(), v.mean(), v.max()]
    tone = np.full(lum.shape, 2); tone[lum < qs[1]] = 1; tone[lum >= qs[1]] = 2; tone[lum >= qs[0]] = np.maximum(tone[lum >= qs[0]], 2)
    tone = np.where(lum < qs[0], 1, np.where(lum < qs[1], 2, 3)); tone = ndimage.median_filter(tone, size=3); tone[(lum >= qs[2]) & m] = 4
    if outline:
        er = ndimage.binary_erosion(m, structure=np.ones((3, 3)))
        edge = m & ~er
        # light comes from above-left: lower/right edges go darkest
        low = edge & ~np.roll(m, -1, 0) | edge & ~np.roll(m, -1, 1)
        tone[edge] = np.minimum(tone[edge], 1); tone[low] = 0
        tone[edge & (tone == 4)] = 3
    for i, c in enumerate(pal):
        sel = m & (tone == i); out[sel, :3] = c; out[sel, 3] = 255
    return Image.fromarray(out, 'RGBA')

def despeckle(img, keep=2):
    a = np.asarray(img).copy(); m = a[..., 3] > 0
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    sz = ndimage.sum(m, lab, range(1, n + 1))
    rng = np.random.default_rng(7)
    for i, s in enumerate(sz):
        if s < keep and rng.random() < .65: a[lab == i + 1] = 0      # thin the dust, keep some
    return Image.fromarray(a, 'RGBA')

def pool(w, squash=.46, seed=0, pal=FLOOR):
    """A puddle: the burst's solid heart, rounded off, a few satellite drops, wet sheen on the top-left lip."""
    rng = np.random.default_rng(seed)
    im = crop('burst').rotate(seed * 97 % 360, resample=Image.BICUBIC, expand=True)
    a = np.asarray(im).astype(float)[..., 3] / 255
    core = ndimage.gaussian_filter((a > .85).astype(float), 9) > .3
    lab, n = ndimage.label(core); sz = ndimage.sum(core, lab, range(1, n + 1)); core = lab == (np.argmax(sz) + 1)
    core = ndimage.binary_closing(core, iterations=6)
    ys, xs = np.nonzero(core); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    pad = 60; core = core[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
    h = max(1, round(core.shape[0] * w / core.shape[1] * squash))
    sm = np.asarray(Image.fromarray((core * 255).astype(np.uint8)).resize((w, h), Image.BOX)) / 255
    m = sm > .5
    out = np.zeros((h, w, 4), np.uint8)
    er = ndimage.binary_erosion(m, iterations=1); er2 = ndimage.binary_erosion(m, iterations=2)
    tone = np.full((h, w), 2)
    # depth: the middle of the pool is darkest
    # wet lip on the top-left, a shine streak
    up = m & ~np.roll(m, 1, 0); lf = m & ~np.roll(m, 1, 1)
    tone[(up | lf) & m] = 3
    edge = m & ~er; low = edge & (~np.roll(m, -1, 0) | ~np.roll(m, -1, 1)); tone[low] = 0
    yy, xx = np.nonzero(er2)
    if len(yy):
        j = rng.integers(len(yy)); cy, cx = yy[j], xx[j]
        cy = yy.min() + (yy.max() - yy.min()) // 3; row = xx[yy == cy]
        if len(row): cx = row.min() + (row.max() - row.min()) // 4; L = max(2, w // 12)
        for k in range(L):
            if 0 <= cx + k < w and er2[cy, cx + k]: tone[cy, cx + k] = 4
    for i, c in enumerate(pal):
        sel = m & (tone == i); out[sel, :3] = c; out[sel, 3] = 255
    # satellites round the rim
    for _ in range(rng.integers(4, 8)):
        ang = rng.random() * 6.283; r = (.55 + rng.random() * .35)
        x = int(w / 2 + np.cos(ang) * r * w / 2); y = int(h / 2 + np.sin(ang) * r * h / 2)
        if 0 <= x < w - 1 and 0 <= y < h and not m[y, x]:
            out[y, x] = (*pal[1], 255)
            if rng.random() < .5: out[y, x + 1] = (*pal[0], 255)
    return Image.fromarray(out, 'RGBA')
