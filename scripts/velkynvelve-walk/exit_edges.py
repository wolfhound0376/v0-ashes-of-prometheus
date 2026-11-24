"""Build exit_edges.json: the line that glows along each way out of a walk plate (Sam, 2026-11-23: "Exits should be similar
color highlighted doors edges, exits, or cavities with a hover showing you where it goes").

Inside each exit's rectangle, the smoothed boundary of Sam's painted floor brush (masks.json; the traced floors on plates
without a brush) is where the floor meets the doorway, cave mouth, stair head, bridge rail or cliff -- the threshold, so
that is what glows. Where the floor runs straight off the painting the lip along the painting's edge glows instead, and an
exit with neither (a ladder, a hatch, the lift basket, open water) gets a soft rounded frame. Reviewed by eye on all 56
plates when it was made; any one can be replaced by hand in exit_edges.json (keep "i" and "label").

Run from the repo root after the floors or exits change:  python scripts/velkynvelve-walk/exit_edges.py
Needs numpy and opencv-python (pip install opencv-python); build_walk.py only reads the JSON it writes.
"""

import json, sys
import numpy as np, cv2

W, H, CELL, GW, GH = 2400, 1340, 20, 120, 67
import os
HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "spec.json")))
out = os.path.join(HERE, "exit_edges.json")


def is_exit(z):
    return (z.get("to") or z.get("kind") in ("leave", "water")) and z.get("kind") not in ("rappel", "gate")


def floor_px(p):
    if p.get("mask"):
        g = np.zeros(GW * GH, np.uint8); i = v = 0
        for r in map(int, p["mask"].split(",")):
            if v: g[i:i + r] = 255
            i += r; v ^= 1
        m = cv2.resize(g.reshape(GH, GW), (W, H), interpolation=cv2.INTER_NEAREST)
        m = cv2.GaussianBlur(m, (0, 0), 9)
        return (m > 127).astype(np.uint8) * 255
    m = np.zeros((H, W), np.uint8)
    for f in p.get("floors", []):
        if "poly" in f: cv2.fillPoly(m, [np.array(f["poly"], np.int32)], 255)
        elif "rect" in f: x0, y0, x1, y1 = map(int, f["rect"]); m[y0:y1, x0:x1] = 255
        elif "ellipse" in f: cx, cy, rx, ry = map(int, f["ellipse"]); cv2.ellipse(m, (cx, cy), (rx, ry), 0, 0, 360, 255, -1)
    for o in p.get("obstacles", []):
        cv2.ellipse(m, (int(o["cx"]), int(o["cy"])), (int(o["rx"]), int(o["ry"])), 0, 0, 360, 0, -1)
    return m


def chaikin(pts, n=2):
    for _ in range(n):
        o = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            o += [[a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]]
        o.append(pts[-1]); pts = o
    return [[round(x), round(y)] for x, y in pts]


res, stats = {}, {"edges": 0, "none": 0}
for k, p in S.items():
    if k.startswith("_"): continue
    fl = floor_px(p)
    cs, _ = cv2.findContours(fl, cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    for zi, z in enumerate(p["zones"]):
        if not is_exit(z): continue
        x0, y0, x1, y1 = z["rect"]
        inside = lambda x, y: x0 <= x <= x1 and y0 <= y <= y1 and 3 < x < W - 4 and 3 < y < H - 4
        paths = []
        for c in cs:
            c = c.reshape(-1, 2); flags = [inside(x, y) for x, y in c]
            if not any(flags): continue
            # runs of consecutive inside points (wrapping round the closed contour)
            n = len(c); start = next((i for i in range(n) if not flags[i]), None)
            order = list(range(n)) if start is None else [(start + i) % n for i in range(n)]
            run = []
            for i in order + [None]:
                if i is not None and flags[i]: run.append(c[i].tolist()); continue
                if len(run) >= 6:
                    pts = cv2.approxPolyDP(np.array(run, np.float32).reshape(-1, 1, 2), 5, False).reshape(-1, 2).tolist()
                    length = sum(np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))
                    if length >= 40: paths.append(chaikin(pts, 2))
                run = []
        if not paths:   # the floor runs straight off the painting: light the lip along the plate's edge where floor meets it
            for side, (a0, a1, fixed) in {"L": (y0, y1, 0), "R": (y0, y1, W - 1), "T": (x0, x1, 0), "B": (x0, x1, H - 1)}.items():
                if (side == "L" and x0 > 8) or (side == "R" and x1 < W - 8) or (side == "T" and y0 > 8) or (side == "B" and y1 < H - 8): continue
                inset = 6
                if side in "LR":
                    col = fl[max(0, a0):min(H, a1), fixed]; ys = np.nonzero(col)[0]
                    if len(ys) > 30: x = inset if side == "L" else W - 1 - inset; paths.append([[x, int(a0 + ys.min())], [x, int(a0 + ys.max())]])
                else:
                    row = fl[fixed, max(0, a0):min(W, a1)]; xs = np.nonzero(row)[0]
                    if len(xs) > 30: y = inset if side == "T" else H - 1 - inset; paths.append([[int(a0 + xs.min()), y], [int(a0 + xs.max()), y]])
        if not paths:   # a ladder, hatch, basket or open water: frame it (there is no floor edge to light)
            r = 14; paths.append(chaikin([[x0 + r, y0], [x1 - r, y0], [x1, y0 + r], [x1, y1 - r], [x1 - r, y1], [x0 + r, y1], [x0, y1 - r], [x0, y0 + r], [x0 + r, y0]], 1))
        if paths: stats["edges"] += 1
        else: stats["none"] += 1
        res.setdefault(k, []).append({"i": zi, "label": z.get("label", ""), "paths": paths})
with open(out, "w") as f:
    f.write("{\n" + ",\n".join(f"{json.dumps(k)}: {json.dumps(v, separators=(',', ':'))}" for k, v in res.items()) + "\n}\n")
print(stats)
