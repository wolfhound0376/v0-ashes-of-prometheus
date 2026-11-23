"""Gray ooze moves drawn from the game's own idle frames (no AI generation).

attack: squash, rear up, whip one pseudopod over and slam it down in front, splat, settle (12 frames, hit ~0.62)
hurt:   cave in, spray droplets, jiggle back (8 frames)
dead:   the approved emerge sheet played backwards: it melts into a puddle (16 frames)

Body warps are nearest-neighbour about the foot pivot (64,108), so pixels stay pixels.
The pseudopod and droplets are drawn in the ooze's own palette, read from its idle frame.
"""
import math, sys
from PIL import Image, ImageDraw

SRC = sys.argv[1]           # public/sprites/gray-ooze
OUT = sys.argv[2]
C, PX, PY = 128, 64, 108
DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]   # S SE E NE N NW W SW
OUTLINE, DARK, MID, LIGHT, HI = (2, 5, 9, 255), (42, 51, 61, 255), (99, 113, 118, 255), (126, 139, 145, 255), (141, 154, 161, 255)

idle = Image.open(f"{SRC}/idle.png").convert("RGBA")
emerge = Image.open(f"{SRC}/emerge.png").convert("RGBA")
base = [idle.crop((0, r * C, C, (r + 1) * C)) for r in range(8)]


def warp(img, sy, shear):
    """Scale height by sy (width by 1/sqrt(sy)) and shear toward x, anchored at the feet."""
    sx = 1 / math.sqrt(sy)
    src, out = img.load(), Image.new("RGBA", (C, C), (0, 0, 0, 0))
    o = out.load()
    for y in range(C):
        for x in range(C):
            h = PY - y                                      # height above the feet
            ux = PX + (x - PX - shear * h) / sx
            uy = PY - h / sy
            ix, iy = int(round(ux)), int(round(uy))
            if 0 <= ix < C and 0 <= iy < C:
                o[x, y] = src[ix, iy]
    return out


def top_y(img):
    a = img.getchannel("A")
    bb = a.getbbox()
    return bb[1] if bb else 40


def bez(p0, p1, p2, t):
    return tuple((1 - t) ** 2 * p0[i] + 2 * (1 - t) * t * p1[i] + t * t * p2[i] for i in range(2))


SHADE = (74, 85, 92, 255)
def rad(i, n, r0, r1, bulb):
    t = i / max(1, n - 1)
    r = r0 + (r1 - r0) * t ** .7
    return r + (bulb * max(0, (t - .8) / .2)) if bulb else r
def blob_line(d, pts, r0, r1, bulb=0):
    n = len(pts)
    for grow, col, dy in ((1.6, OUTLINE, 0), (0.6, DARK, 0), (-.4, SHADE, -1), (-1.8, MID, -2)):
        for i, (x, y) in enumerate(pts):
            r = rad(i, n, r0, r1, bulb) + grow - 0.6
            if r > 0.5: d.ellipse([x - r, y - r + dy, x + r, y + r + dy], fill=col)
    for i, (x, y) in enumerate(pts[2: int(n * .92)]):   # wet highlight along the upper edge
        r = max(1, rad(i + 2, n, r0, r1, bulb) * .28)
        d.ellipse([x - r - 2, y - r - 3, x + r - 2, y + r - 3], fill=LIGHT if i % 4 else HI)


def drops(d, cx, cy, spread, n, size, seed):
    import random
    rnd = random.Random(seed)
    for _ in range(n):
        a = rnd.uniform(math.pi * 1.05, math.pi * 1.95)
        r = rnd.uniform(spread * .4, spread)
        x, y = cx + math.cos(a) * r, cy + math.sin(a) * r * .6
        s = rnd.choice(size)
        if s <= 1: d.point((x, y), fill=LIGHT); continue          # a speck
        d.ellipse([x - s, y - s, x + s, y + s], fill=DARK)
        d.ellipse([x - s + 1, y - s, x + s - 1, y + s - 2], fill=MID)


def clamp(p):
    return (max(8, min(C - 8, p[0])), max(8, min(C - 6, p[1])))


ATK = [  # sy, lean (toward facing), pseudopod progress (None = none), splat size
    (1.00, 0.00, None, 0), (0.90, -0.03, None, 0), (0.82, -0.06, None, 0),
    (1.08, -0.12, 0.15, 0), (1.20, -0.18, 0.35, 0), (1.24, -0.20, 0.50, 0),
    (1.10, 0.06, 0.75, 0), (0.94, 0.18, 0.95, 0), (0.86, 0.20, 1.00, 3),
    (0.94, 0.10, 0.70, 2), (1.00, 0.04, 0.35, 0), (1.00, 0.00, None, 0)]
HURT = [(1.00, 0.0, 0), (0.66, -0.10, 3), (0.80, -0.07, 2), (1.16, 0.05, 0), (0.90, -0.03, 0), (1.06, 0.02, 0), (0.97, 0, 0), (1.00, 0, 0)]


def attack_frame(row, f):
    dx, dy = DIRS[row]
    sy, lean, p, splat = ATK[f]
    body = warp(base[row], sy, lean * (dx if dx else 0) + (0 if dx else 0))
    if p is None and not splat:
        return body
    ty = top_y(body)
    sx_ = dx if dx else 1                                  # facing the camera or away: swing the arc out to one side so it reads as a curve
    root = clamp((PX + dx * 8 - (0 if dx else 6), ty + 22))
    apex = clamp((PX - sx_ * 18, ty - 20 if dy >= 0 else ty - 16))
    ground = clamp((PX + dx * 46 + (0 if dx else 22), PY + 2 + dy * 12))
    if p <= .5:
        q = p / .5
        tip = (root[0] + (apex[0] - root[0]) * q, root[1] + (apex[1] - root[1]) * q)
        ctrl = ((root[0] + tip[0]) / 2 - dx * 6, min(root[1], tip[1]) - 6)
    else:
        q = (p - .5) / .5
        tip = bez(apex, (ground[0] - dx * 4, apex[1] - 4), ground, q)
        mid = ((root[0] + tip[0]) / 2, (root[1] + tip[1]) / 2)
        lift = 26 - 8 * q                                    # one smooth arc from the body over to the tip, never a hook
        ctrl = (mid[0] - (dx if dx else 1) * 4, min(root[1], tip[1]) - lift)
    pts = [bez(root, ctrl, tip, t / 47) for t in range(48)]
    layer = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    blob_line(d, pts, 11.5, 5.0, bulb=2.5 if p >= .9 else 1.5)
    if splat:
        gx, gy = ground[0], ground[1] + 3
        w = 13 if splat == 3 else 9                             # the slap: a flat splash puddle on the floor, then droplets thrown up
        d.ellipse([gx - w - 1, gy - 4, gx + w + 1, gy + 4], fill=OUTLINE)
        d.ellipse([gx - w, gy - 3, gx + w, gy + 3], fill=DARK)
        d.ellipse([gx - w + 2, gy - 2, gx + w - 3, gy + 1], fill=MID)
        drops(d, gx, gy - 2, 16 if splat == 3 else 24, 8 if splat == 3 else 5, (3, 2, 2) if splat == 3 else (2, 1), row * 7 + f)
    out = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    if dy < 0:            # facing away: the limb goes behind the body
        out.alpha_composite(layer); out.alpha_composite(body)
    else:
        out.alpha_composite(body); out.alpha_composite(layer)
    return out


def hurt_frame(row, f):
    dx, dy = DIRS[row]
    sy, lean, spray = HURT[f]
    body = warp(base[row], sy, lean * (dx if dx else 0))
    if spray:
        d = ImageDraw.Draw(body)
        ty = top_y(body)
        drops(d, PX, ty + 10, 26 if spray == 3 else 34, 10 if spray == 3 else 7, (2, 1) if spray == 3 else (1,), row * 11 + f)
    return body


def sheet(frames_fn, n):
    s = Image.new("RGBA", (C * n, C * 8), (0, 0, 0, 0))
    for r in range(8):
        for f in range(n):
            s.alpha_composite(frames_fn(r, f), (f * C, r * C))
    return s


sheet(attack_frame, 12).save(f"{OUT}/attack.png")
sheet(hurt_frame, 8).save(f"{OUT}/hurt.png")
ne = emerge.size[0] // C
sheet(lambda r, f: emerge.crop(((ne - 1 - f) * C, r * C, (ne - f) * C, (r + 1) * C)), ne).save(f"{OUT}/dead.png")
print("ok", ne)
