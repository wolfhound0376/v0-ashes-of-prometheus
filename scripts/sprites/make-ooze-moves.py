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
C0 = 128                                   # the source sheets' cell
C, OX, OY = 160, 16, 32                    # Sam's reference arm rises as tall as the body: room above it, by padding (art untouched)
PX, PY = 64 + OX, 108 + OY
DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]   # S SE E NE N NW W SW
OUTLINE, DARK, MID, LIGHT, HI = (2, 5, 9, 255), (42, 51, 61, 255), (99, 113, 118, 255), (126, 139, 145, 255), (141, 154, 161, 255)

SRC_ORIG = sys.argv[3] if len(sys.argv) > 3 else SRC   # the original 128-cell sheets


def pad_sheet(name):
    im = Image.open(f"{SRC_ORIG}/{name}.png").convert("RGBA")
    n = im.size[0] // C0
    out = Image.new("RGBA", (n * C, 8 * C), (0, 0, 0, 0))
    for r in range(8):
        for f in range(n):
            out.alpha_composite(im.crop((f * C0, r * C0, (f + 1) * C0, (r + 1) * C0)), (f * C + OX, r * C + OY))
    return out


idle = pad_sheet("idle")
emerge = pad_sheet("emerge")
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
    r = r0 + (r1 - r0) * t ** 2.4          # stays thick most of the way, then narrows to a point
    return r + (bulb * max(0, (t - .8) / .2)) if bulb else r
def blob_line(d, pts, r0, r1, bulb=0):
    n = len(pts)
    for grow, col, dy in ((1.6, OUTLINE, 0), (0.6, DARK, 0), (-.4, SHADE, -1), (-1.8, MID, -2)):
        for i, (x, y) in enumerate(pts):
            r = rad(i, n, r0, r1, bulb) + grow - 0.6
            if r > 0.5: d.ellipse([x - r, y - r + dy, x + r, y + r + dy], fill=col)
    for i, (x, y) in enumerate(pts[2: int(n * .92): max(1, n // 40)]):   # wet highlight along the upper edge
        r = max(1, rad(min(n - 1, 2 + i * max(1, n // 40)), n, r0, r1, bulb) * .28)
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
    return (max(6, min(C - 6, p[0])), max(4, min(C - 4, p[1])))


HURT = [(1.00, 0.0, 0), (0.66, -0.10, 3), (0.80, -0.07, 2), (1.16, 0.05, 0), (0.90, -0.03, 0), (1.06, 0.02, 0), (0.97, 0, 0), (1.00, 0, 0)]


def catmull(pts, n):
    """Smooth curve through the control points (Catmull-Rom), n samples."""
    P = [pts[0]] + pts + [pts[-1]]
    out = []
    segs = len(pts) - 1
    for k in range(n):
        u = k / (n - 1) * segs
        i = min(int(u), segs - 1); t = u - i
        p0, p1, p2, p3 = P[i], P[i + 1], P[i + 2], P[i + 3]
        out.append(tuple(.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                              + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in range(2)))
    return out


# Sam, 2026-11-23, with a reference figure: "It should strike with a pseudopod like this" -- one thick pseudopod rising out
# of the TOP of the mound, hooked over like a cocked arm, tapering to a point and dripping, then struck down at the target.
# Key poses, offsets from the root on top of the mound: x toward the side it strikes, y up negative. 'G' = the strike point.
KEYS = {
    "stub":   [(0, 0), (0, -6), (1, -10), (2, -12)],
    "rise":   [(0, 0), (-3, -16), (-1, -30), (6, -37)],
    "cocked": [(0, 0), (-5, -18), (-2, -36), (10, -46), (24, -42), (30, -28)],  # the reference: up tall, over, the point hooked down
    "strike": [(0, 0), (2, -20), (16, -30), (32, -18), "G"],
    "slam":   [(0, 0), (8, -16), (26, -12), "G"],
}
FRAME_KEY = {3: ("stub", 1), 4: ("rise", 1), 5: ("cocked", 1), 6: ("cocked", 1), 7: ("strike", 1), 8: ("slam", 1),
             9: ("strike", .7), 10: ("rise", .8)}
ATK = [  # sy, lean (toward facing), splat
    (1.00, 0.00, 0), (0.92, -0.03, 0), (0.85, -0.06, 0), (1.06, -0.10, 0), (1.14, -0.14, 0), (1.18, -0.16, 0),
    (1.20, -0.17, 0), (1.04, 0.10, 0), (0.88, 0.18, 3), (0.94, 0.10, 2), (1.00, 0.04, 0), (1.00, 0.00, 0)]


def attack_frame(row, f):
    dx, dy = DIRS[row]
    sy, lean, splat = ATK[f]
    body = warp(base[row], sy, lean * dx)
    if f not in FRAME_KEY:
        return body
    key, grow = FRAME_KEY[f]
    side = dx if dx else 1                               # facing the camera or away: the arm still hooks out to one side, so it reads
    ty = top_y(body)
    a = body.getchannel("A"); bb = a.getbbox(); cx = (bb[0] + bb[2]) / 2
    root = (cx - side * 6, ty + 12)
    G = clamp((PX + dx * 40 + (0 if dx else 24), PY + 1 + dy * 12))
    ctrl = [(G[0] - root[0], G[1] - root[1]) if c == "G" else (c[0] * side * grow, c[1] * grow) for c in KEYS[key]]
    pts = [(root[0] + x, root[1] + y) for x, y in ctrl]
    pts = [clamp(p) for p in pts]
    curve = catmull(pts, 160)
    layer = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    blob_line(d, curve, 11.0, 2.4)                       # thick at the mound, a point at the tip
    if key in ("cocked", "rise"):                        # slime dripping off the hook
        tx, tyy = curve[-1]
        for k, (ox, oy) in enumerate(((0, 4), (-2, 9))):
            r = 1.6 if k == 0 else 1.1
            d.ellipse([tx + ox - r, tyy + oy - r, tx + ox + r, tyy + oy + r], fill=MID)
    if splat:
        gx, gy = G[0], G[1] + 2
        w = 13 if splat == 3 else 9
        d.ellipse([gx - w - 1, gy - 4, gx + w + 1, gy + 4], fill=OUTLINE)
        d.ellipse([gx - w, gy - 3, gx + w, gy + 3], fill=DARK)
        d.ellipse([gx - w + 2, gy - 2, gx + w - 3, gy + 1], fill=MID)
        drops(d, gx, gy - 2, 16 if splat == 3 else 24, 8 if splat == 3 else 5, (3, 2, 2) if splat == 3 else (2, 1), row * 7 + f)
    out = Image.new("RGBA", (C, C), (0, 0, 0, 0))
    if dy < 0 and key not in ("cocked", "rise", "stub"):
        out.alpha_composite(layer); out.alpha_composite(body)    # struck away from the camera: behind the body
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


idle.save(f"{OUT}/idle.png"); emerge.save(f"{OUT}/emerge.png"); pad_sheet("walk").save(f"{OUT}/walk.png")
sheet(attack_frame, 12).save(f"{OUT}/attack.png")
sheet(hurt_frame, 8).save(f"{OUT}/hurt.png")
ne = emerge.size[0] // C
sheet(lambda r, f: emerge.crop(((ne - 1 - f) * C, r * C, (ne - f) * C, (r + 1) * C)), ne).save(f"{OUT}/dead.png")
print("ok", ne)
