"""Pixel lantern + Sam's painted art.

- The pixel lantern is drawn WITHOUT its pixel skeleton and WITHOUT its pixel bell ring.
- The painted skeleton (pack lantern frames: dormant hooded / awake glowing) is set into the
  centre glass panel, BEHIND the bronze frame (the frame's bronze pixels are re-laid on top).
- The painted sphere from pack lantern frame 3 (the bell pulse) is extracted (green only, the
  painted lantern body dropped) and burst around the pixel lantern on the toll, faintly on each flash.

  python3 build_lantern_painted.py <pack_dir> <out_dir>
Output: lanternPainted_XX.png (720x720, the 96px pixel lantern at 5x nearest in the centre).
"""
import os, sys, math
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import draw_toll as D

PACK, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
D.SKELETON = False
D.PULSE = False
frames, tags = D.lantern_frames()

K = 5; BOX = 720; OFF = (BOX - 96 * K) // 2           # pixel lantern 480px, centred
strip = Image.open(os.path.join(PACK, 'lantern.png')).convert('RGBA')
cell = lambda i: strip.crop((i * 512, 0, i * 512 + 512, 512))

# painted centre panels (measured): awake frame panel x230-292 y228-372; dormant frame sits 7px left
PANEL_W, PANEL_H = 13 * K, 31 * K                      # pixel centre panel x42..54, y38..68
P_AWAKE = np.asarray(cell(1).crop((230, 228, 292, 372)).resize((PANEL_W, PANEL_H), Image.LANCZOS)).astype(np.float32)
P_DORM = np.asarray(cell(0).crop((223, 228, 285, 372)).resize((PANEL_W, PANEL_H), Image.LANCZOS)).astype(np.float32)
PANEL_XY = (OFF + 42 * K, OFF + 38 * K)

# sphere: green only (drop bronze and dark matte), centre (258,285), painted glass centre (258,300)
c2 = np.asarray(cell(2)).astype(np.float32)
green = np.clip((c2[..., 1] - c2[..., 0] * 1.15) / 40, 0, 1)
sph = c2.copy(); sph[..., 3] *= green
yy, xx = np.mgrid[0:512, 0:512]
r = np.hypot(xx - 258, yy - 285)
sph[..., 3] *= np.clip((r - 70) / 40, 0, 1)            # hollow: the lantern sits in the middle
SPHERE = Image.fromarray(sph.astype(np.uint8), 'RGBA')
SCALE = 1.07                                           # painted lantern body -> pixel lantern body
GLASS = (OFF + 48 * K, OFF + 52 * K)                   # pixel glass centre in the box

BRONZE = {tuple(c[:3]) for c in D.B} | {(12, 8, 5)}


def panel_for(i):
    """Painted skeleton state per lantern frame."""
    t = next(k for k, v in tags.items() if i in v); j = tags[t].index(i)
    if t == 'dormant': return P_DORM, 1.0
    if t == 'awaken':
        w = (j + 1) / 4; return P_DORM * (1 - w) + P_AWAKE * w, 1.0
    if t in ('toll', 'receive_loop'): return P_AWAKE, 1.0 + (0.08 * math.sin(j * 2.1) if t == 'receive_loop' else 0.1)
    if t == 'flash': return P_AWAKE, (1.45, 1.8, 1.5)[j]
    w = max(0, 1 - (j + 1) / 6); return P_DORM * (1 - w) + P_AWAKE * w, 1.0


def sphere_for(i):
    t = next(k for k, v in tags.items() if i in v); j = tags[t].index(i)
    if t == 'toll': return (0.82, 1.0, 1.14, 1.26)[j], (1.0, 0.95, 0.7, 0.38)[j], j * 6
    if t == 'flash': return (0.86, 0.92, 0.98)[j], (0.35, 0.55, 0.25)[j], 20 + j * 4
    return None


for i, f in enumerate(frames):
    pix = f.img().resize((96 * K, 96 * K), Image.NEAREST)
    pa = np.asarray(pix).astype(np.float32)
    box = Image.new('RGBA', (BOX, BOX), (0, 0, 0, 0))
    sp = sphere_for(i)
    if sp:
        s, a, rot = sp
        size = int(512 * SCALE * s)
        im = SPHERE.rotate(rot, resample=Image.BICUBIC).resize((size, size), Image.LANCZOS)
        arr = np.asarray(im).astype(np.float32); arr[..., 3] *= a
        cx = GLASS[0] - (258 / 512) * size; cy = GLASS[1] - (300 / 512) * size
        box.alpha_composite(Image.fromarray(arr.astype(np.uint8), 'RGBA'), (int(cx), int(cy)))
    box.alpha_composite(pix, (OFF, OFF))
    # painted skeleton into the glass
    panel, gain = panel_for(i)
    pr = panel.copy(); pr[..., :3] = np.clip(pr[..., :3] * gain + (gain - 1) * 40, 0, 255)
    fy = np.clip(np.minimum(np.arange(PANEL_H), np.arange(PANEL_H)[::-1]) / 4, 0, 1)
    fx = np.clip(np.minimum(np.arange(PANEL_W), np.arange(PANEL_W)[::-1]) / 4, 0, 1)
    pr[..., 3] = 255 * 0.97 * fy[:, None] * fx[None, :]
    box.alpha_composite(Image.fromarray(pr.astype(np.uint8), 'RGBA'), PANEL_XY)
    # bronze frame back on top, so the art sits behind the glass bars and arch
    rgb = pa[..., :3].astype(int); m = np.zeros(rgb.shape[:2], bool)
    for c in BRONZE: m |= np.all(rgb == c, axis=-1)
    m &= pa[..., 3] > 0
    top = pa.copy(); top[~m, 3] = 0
    box.alpha_composite(Image.fromarray(top.astype(np.uint8), 'RGBA'), (OFF, OFF))
    box.save(os.path.join(OUT, f'lanternPainted_{i:02d}.png'))
print('frames', len(frames))
