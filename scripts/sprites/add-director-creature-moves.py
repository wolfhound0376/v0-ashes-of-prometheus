"""Walk / attack (and optional extra) sheets for the Horrors & Wonders director creatures.

Source: PixelLab v3 free-prompt clips downloaded as ZIPs into /home/claude/anim/<zipdir>/
(<state>/animations/<name>/<direction>/frame_NNN.png, frame 000 = the reference still).

v3 likes to paint hit sparks, glows and smoke puffs that are not part of the creature.
Three filters strip them, in order:
  fx_filter  - pixels far from every colour in the creature's own reference still AND bright or
               strongly saturated (cyan glints, yellow flashes) are dropped
  dewhite    - near-pure-white pixels (the figure is never pure white)
  despeck    - small islands floating free of the body
Usage: python3 scripts/sprites/add-director-creature-moves.py [slug ...]
"""
import sys, json, glob
from PIL import ImageOps
from pathlib import Path
import numpy as np
from PIL import Image
from scipy import ndimage

DIRS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]
REPO = Path(__file__).resolve().parents[2] / "public" / "sprites"
ANIM = Path("/home/claude/anim")

# Rows v3 drew off-model (turned to camera, a different weapon, smoke clouds) are rebuilt as the mirror of
# the opposite side, the same fix the orog's west row got. pose -> {bad direction: good direction to mirror}
MIRROR = {
    ("goblin", "attack"): {"west": "east", "south-west": "south-east", "north-east": "north-west"},
    ("goblin-boss", "attack"): {"west": "east"},
    ("skeleton-swordsman", "attack"): {"east": "west"},
}
# A direction drawn again under another animation name because the first take went off-model
SOURCE = {("goblin", "shoot-bow"): {"south": "shoot-bow-s"}, ("goblin-boss", "shoot-bow"): {"south": "shoot-bow-s2"}}
# A frame whose leftover off-palette area (after the filters) is this large is a flash or smoke burst:
# hold the frame before it instead.
BURST = 160
# frames checked by eye that still carry a swoosh the filters miss: hold the frame before them
HOLD = {("skeleton-swordsman", "attack"): {"north": [5, 6]}, ("goblin", "shoot-bow"): {"south": [5, 6, 7]}}

# slug: (zip dir, {pose: (pixellab animation name, hit fraction or None, fps, loop)})
CREATURES = {
    "bandit":             ("bandit",      {"walk": ("walk", None, 10, True), "attack": ("attack", 0.6, 12, False), "shoot": ("shoot", 0.8, 12, False)}),
    "goblin":             ("a",           {"walk": ("walk", None, 10, True), "attack": ("attack", 0.6, 12, False), "shoot-bow": ("shoot-bow", 0.8, 12, False)}),
    "goblin-boss":        ("goblin-boss", {"walk": ("walk", None, 10, True), "attack": ("attack", 0.65, 12, False), "shoot-bow": ("shoot-bow", 0.8, 12, False)}),
    "skeleton-swordsman": ("b",           {"walk": ("walk", None, 9, True),  "attack": ("attack", 0.6, 12, False), "shoot-bow": ("shoot-bow", 0.8, 12, False)}),
    "orc-eye-of-gruumsh": ("c",           {"walk": ("walk", None, 9, True),  "attack": ("attack", 0.7, 12, False)}),
    "carrion-crawler":    ("crawler",     {"walk": ("walk", None, 10, True), "attack": ("attack", 0.55, 12, False)}),
    "grell":              ("grell",       {"walk": ("walk", None, 8, True),  "attack": ("attack", 0.55, 12, False)}),
    "chuul":              ("chuul",       {"walk": ("walk", None, 9, True),  "attack": ("attack", 0.6, 12, False)}),
    "ochre-jelly":        ("jelly",       {"walk": ("walk", None, 7, True),  "attack": ("attack", 0.6, 11, False)}),
}


def frames(zipdir, anim, d):
    fs = sorted(glob.glob(str(ANIM / zipdir / "*" / "animations" / anim / d / "frame_*.png")))
    return [Image.open(f).convert("RGBA") for f in fs]


def cell(im, c):
    x = (im.width - c) // 2
    y = (im.height - c) // 2
    return im.crop((x, y, x + c, y + c))


def palette_of(im):
    a = np.array(im).reshape(-1, 4)
    a = a[a[:, 3] > 0][:, :3].astype(int)
    return np.unique((a // 8) * 8 + 4, axis=0)


def fx_filter(im, pal, dist=70):
    a = np.array(im)
    m = a[..., 3] > 0
    px = a[m][:, :3].astype(int)
    if not len(px):
        return 0
    best = np.full(len(px), 1e9)
    for i in range(0, len(pal), 256):
        d = ((px[:, None, :] - pal[None, i:i + 256, :]) ** 2).sum(-1).min(1)
        best = np.minimum(best, d)
    mx, mn = px.max(1), px.min(1)
    sat = (mx - mn) / np.maximum(mx, 1)
    dd = np.sqrt(best)
    bad = (((dd > dist) & ((mx > 190) | (sat > 0.55)))
           | ((dd > 35) & (mn > 180))                                            # cream swoosh arcs
           | ((dd > 40) & (mx > 220) & (sat > 0.6))                              # hot yellow sparks
           | ((dd > 22) & (px[:, 2] - px[:, 0] > 45) & (px[:, 1] - px[:, 0] > 25)))  # cyan blade glow
    idx = np.argwhere(m)[bad]
    a[idx[:, 0], idx[:, 1]] = 0
    im.paste(Image.fromarray(a))
    return int(bad.sum())


def off_palette(im, pal, dist=30):
    a = np.array(im)
    px = a[a[..., 3] > 0][:, :3].astype(int)
    if not len(px):
        return 0
    best = np.full(len(px), 1e9)
    for i in range(0, len(pal), 256):
        best = np.minimum(best, ((px[:, None, :] - pal[None, i:i + 256, :]) ** 2).sum(-1).min(1))
    return int((np.sqrt(best) > dist).sum())


def dewhite(im, thr=240):
    a = np.array(im)
    bad = (a[..., 3] > 0) & (a[..., :3].min(-1) >= thr)
    a[bad] = 0
    im.paste(Image.fromarray(a))
    return int(bad.sum())


def despeck(im, frac=0.12):
    a = np.array(im)
    lab, n = ndimage.label(a[..., 3] > 0, structure=np.ones((3, 3)))
    if n < 2:
        return 0
    sizes = ndimage.sum(a[..., 3] > 0, lab, range(1, n + 1))
    big, cut = sizes.max(), 0
    for i, sz in enumerate(sizes, 1):
        if sz < big * frac:
            a[lab == i] = 0
            cut += int(sz)
    im.paste(Image.fromarray(a))
    return cut


def build(slug):
    zipdir, poses = CREATURES[slug]
    man = json.loads((REPO / slug / "sprite.json").read_text())
    c = man["cell"][0]
    report = {}
    for pose, (anim, hit, fps, loop) in poses.items():
        by, cut, held = {}, 0, []
        for d in DIRS:
            fs = frames(zipdir, SOURCE.get((slug, pose), {}).get(d, anim), d)
            assert fs, (slug, anim, d, "missing")
            pal = palette_of(fs[0])
            body = [cell(f, c) for f in fs[1:]]
            for f in body:
                cut += fx_filter(f, pal) + dewhite(f) + despeck(f)
            score = [off_palette(f, pal) for f in body]
            line = max(BURST, 2.5 * float(np.median(score)))   # a clip that drifts off-palette evenly is not a burst
            burst = False   # after a burst the smoke lingers in palette colours: hold to the end of the clip
            for k, f in enumerate(body):
                if k and (burst or k in HOLD.get((slug, pose), {}).get(d, []) or score[k] > line):
                    burst = burst or k not in HOLD.get((slug, pose), {}).get(d, [])
                    body[k] = body[k - 1].copy()
                    held.append(f"{d}#{k}")
            by[d] = body
        for bad, good in MIRROR.get((slug, pose), {}).items():
            by[bad] = [ImageOps.mirror(f) for f in by[good]]
        n = len(by["south"])
        assert all(len(v) == n for v in by.values()), (slug, pose, {d: len(v) for d, v in by.items()})
        sh = Image.new("RGBA", (c * n, c * 8), (0, 0, 0, 0))
        for r, d in enumerate(DIRS):
            for k, f in enumerate(by[d]):
                sh.alpha_composite(f, (k * c, r * c))
        sh.save(REPO / slug / f"{pose}.png", optimize=True)
        entry = {"sheet": f"{pose}.png", "frames": n, "fps": fps, "loop": loop}
        if hit is not None:
            entry["hit"] = hit
        man["animations"][pose] = entry
        report[pose] = (n, cut, held)
    (REPO / slug / "sprite.json").write_text(json.dumps(man, indent=2) + "\n")
    print(slug, report)


if __name__ == "__main__":
    for s in sys.argv[1:] or CREATURES:
        build(s)
