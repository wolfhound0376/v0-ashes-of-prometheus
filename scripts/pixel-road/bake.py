"""Bake one stretch of the pixel road from a PixelLab map into public/pixel-road/<id>/.

Usage (see README.md for where each input comes from):
  python3 scripts/pixel-road/bake.py <id> <config.json>

config.json:
  { "name": "...", "pixellabMapId": "...", "rows": 24, "cols": 64,
    "crops": ["a.png", "b.png", ...],          view_map crops, left to right, each 16 cells wide at full size
    "grid": "grid.txt",                        the rows get_map prints for the same cells
    "export": "x/",                            the unzipped PixelLab export (objects/manifest.json + PNGs)
    "kinds": {"name prefix": "kind", ...},     PixelLab object name -> short kind used for the file name
    "foreground": {"ceiling": "art/ceiling.webp", "shelf": "art/shelf.webp"},
    "entry": {...}, "exit": {...}, "landmarks": [...],
    "glow": {"kind": "#colour"},               which kinds of prop give off light, and its colour
    "shine": {"kind": 0..1} }                  how strongly: 1 is a crystal, 0.3 a patch of fungus

What it writes:
  ground.png   the stitched picture, props painted in
  shade.png    depth, as one see-through layer: the dark at the foot of every rock face, the shadow each prop
               throws across the floor, and rock sinking into black away from the floor. Over the ground, under
               the figures.
  front.png    the lip of the rock that stands south of the floor, drawn in front of the figures
  objects/     one PNG per kind of prop
  fg/          foreground pieces the page hangs in front of everything
  road.json    the grid, the props, the way in and out
"""
import json, os, shutil, sys
import numpy as np
from PIL import Image, ImageFilter

T = 32
FLOOR = set("wrs")       # ground a shadow can fall on
ROCK = set("da")

def main():
    rid, cfgp = sys.argv[1], sys.argv[2]
    here = os.path.dirname(os.path.abspath(cfgp))
    cfg = json.load(open(cfgp))
    p = lambda f: f if os.path.isabs(f) else os.path.join(here, f)
    out = os.path.join("public", "pixel-road", rid)
    if os.path.isdir(os.path.join(out, "objects")): shutil.rmtree(os.path.join(out, "objects"))
    os.makedirs(os.path.join(out, "objects"), exist_ok=True)
    if os.path.isdir(os.path.join(out, "fg")): shutil.rmtree(os.path.join(out, "fg"))
    os.makedirs(os.path.join(out, "fg"), exist_ok=True)
    rows, cols = cfg["rows"], cfg["cols"]
    W, H = cols * T, rows * T

    ground = Image.new("RGB", (W, H))
    x = 0
    for c in cfg["crops"]:
        im = Image.open(p(c)).convert("RGB")
        assert im.size[1] == H, (c, im.size)
        ground.paste(im, (x, 0)); x += im.size[0]
    assert x == W, x
    # PAVING (art: Sam, 2026-11-23, his 64px Underdark ruin ground tiles). A patch of his tiles laid into the floor,
    # e.g. the forecourt of a ruin. "rows" are lists of tile names ("" leaves the cave floor; a trailing "h" mirrors
    # the tile). The outer edge is eaten away in ragged 4px bites so the floor shows through and it reads as old
    # paving breaking up, not a rug; "solid" names the sides that butt against something and stay straight.
    for pv in cfg.get("paving", []):
        rs = pv["rows"]; S = pv.get("size", 64); pw, ph = S * len(rs[0]), S * len(rs)
        patch = Image.new("RGB", (pw, ph)); have = np.zeros((ph, pw), bool)
        for r, row in enumerate(rs):
            for c, n in enumerate(row):
                if not n: continue
                t = Image.open(p(os.path.join(pv["tiles"], n.rstrip("h") + ".png"))).convert("RGB")
                if n.endswith("h"): t = t.transpose(Image.FLIP_LEFT_RIGHT)
                patch.paste(t, (c * S, r * S)); have[r * S:(r + 1) * S, c * S:(c + 1) * S] = True
        yy, xx = np.mgrid[0:ph, 0:pw]; solid = pv.get("solid", "")
        d = np.full((ph, pw), 999.0)
        if "l" not in solid: d = np.minimum(d, xx)
        if "r" not in solid: d = np.minimum(d, pw - 1 - xx)
        if "t" not in solid: d = np.minimum(d, yy)
        if "b" not in solid: d = np.minimum(d, ph - 1 - yy)
        rng = np.random.default_rng(pv.get("seed", 7))
        bite = np.kron(rng.random((ph // 4 + 1, pw // 4 + 1)), np.ones((4, 4)))[:ph, :pw]
        big = np.kron(rng.random((ph // 16 + 1, pw // 16 + 1)), np.ones((16, 16)))[:ph, :pw]
        keep = have & (d > pv.get("ragged", 22) * (0.25 + 0.75 * big) * (0.4 + 0.6 * bite))
        g = np.array(ground); x0, y0 = pv["x"], pv["y"]
        sub = g[y0:y0 + ph, x0:x0 + pw]; pa = np.array(patch)
        dark = keep & ~np.roll(keep, -1, axis=0)             # a thin dark lip under each broken edge
        sub[keep] = pa[keep]; sub[dark] = (sub[dark] * 0.55).astype(np.uint8)
        ground = Image.fromarray(g)
    ground.save(os.path.join(out, "ground.png"), optimize=True)

    grid = [l.strip() for l in open(p(cfg["grid"])) if l.strip()]
    assert len(grid) == rows and all(len(r) == cols for r in grid)
    at = lambda cx, cy: grid[cy][cx] if 0 <= cy < rows and 0 <= cx < cols else "d"

    man = json.load(open(os.path.join(p(cfg["export"]), "objects", "manifest.json")))["objects"]
    objs, seen = [], {}
    for o in man:
        kind = next(v for k, v in cfg["kinds"].items() if o["name"].startswith(k))
        src = os.path.join(p(cfg["export"]), "objects", o["filename"])
        if kind not in seen:
            shutil.copy(src, os.path.join(out, "objects", kind + ".png")); seen[kind] = Image.open(src).convert("RGBA")
        b, g = o["boundingBox"], o["groundBounds"]
        objs.append({"kind": kind, "x": b["x"], "y": b["y"], "w": b["width"], "h": b["height"],
                     "ground": [round(g["x"]), round(g["y"]), round(g["width"]), round(g["height"])]})
    objs.sort(key=lambda o: (o["x"], o["y"]))

    # ---- shade.png -------------------------------------------------------------------------------------
    a = np.zeros((H, W), np.float32)
    ramp = lambda n, top: np.linspace(top, 0, n, dtype=np.float32)
    for cy in range(rows):
        for cx in range(cols):
            if at(cx, cy) not in FLOOR: continue
            y0, x0 = cy * T, cx * T
            if at(cx, cy - 1) in ROCK:   # the foot of a rock face: the deepest dark, reaching well out
                # The face is painted half a cell lower than its cell (tiles sit on the grid's corners), so the
                # dark starts half a cell down, where the face meets the floor, not on the face itself.
                ya, yb = y0 + T // 2, min(H, y0 + T // 2 + T)
                a[ya:yb, x0:x0 + T] = np.maximum(a[ya:yb, x0:x0 + T], ramp(T, 150)[:yb - ya, None])
            if at(cx - 1, cy) in ROCK: a[y0:y0 + T, x0:x0 + 16] = np.maximum(a[y0:y0 + T, x0:x0 + 16], ramp(16, 85)[None, :])
            if at(cx + 1, cy) in ROCK: a[y0:y0 + T, x0 + 16:x0 + T] = np.maximum(a[y0:y0 + T, x0 + 16:x0 + T], ramp(16, 85)[::-1][None, :])
            if at(cx, cy + 1) in ROCK: a[y0 + 20:y0 + T, x0:x0 + T] = np.maximum(a[y0 + 20:y0 + T, x0:x0 + T], ramp(12, 70)[::-1][:, None])
    # Each prop's shadow: its own outline laid down across the floor, away from the light (up and to the left).
    SX, SY = 0.55, 0.30
    s = np.zeros((H, W), np.float32)
    for o in objs:
        al = np.asarray(seen[o["kind"]])[:, :, 3].astype(np.float32)
        by = o["ground"][1] + o["ground"][3] - 3
        for r in range(al.shape[0]):
            hgt = by - (o["y"] + r)
            if hgt < 0: continue
            dy, dx = int(round(by + hgt * SY)), int(round(o["x"] + hgt * SX))
            if not (0 <= dy < H): continue
            x1, x2 = max(0, dx), min(W, dx + al.shape[1])
            if x2 > x1: s[dy, x1:x2] = np.maximum(s[dy, x1:x2], al[r, x1 - dx:x2 - dx])
    s = np.asarray(Image.fromarray(np.clip(s, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6)), np.float32) * (105 / 255)
    floor = np.zeros((H, W), bool)
    for cy in range(rows):
        for cx in range(cols):
            if at(cx, cy) in FLOOR: floor[cy * T:(cy + 1) * T, cx * T:(cx + 1) * T] = True
    s[~floor] = 0                      # a shadow lies on the floor; it does not climb the rock
    alpha = np.clip(255 - (255 - a) * (255 - s) / 255, 0, 255).astype(np.uint8)
    shade = np.zeros((H, W, 4), np.uint8); shade[..., 0] = 6; shade[..., 1] = 4; shade[..., 2] = 14; shade[..., 3] = alpha
    Image.fromarray(shade, "RGBA").save(os.path.join(out, "shade.png"), optimize=True)

    # ---- rock that reads as rock, not as a flat pattern (Sam, 2026-11-22: "the inferior walls look 2d") -------
    # The tiles give a rock face only where rock stands NORTH of floor. Rock south of the floor is seen from above,
    # so it comes out as a flat carpet of pattern. Two things fix that, both made here from the picture itself:
    #   1. The rock sinks into darkness away from the floor (in shade.png): one cell in, it is still stone; three or
    #      four cells in, it is the black of solid ground. A carpet has no depth; a mass that swallows light does.
    #   2. A lip (front.png, drawn IN FRONT of the figures): the rock south of the floor is raised LIP pixels up over
    #      the floor's edge, with a lit rim along its top. A figure walking that edge has its feet behind the lip,
    #      which is what tells the eye the rock stands between it and us.
    rockc = np.array([[at(cx, cy) == "d" for cx in range(cols)] for cy in range(rows)])
    dist = np.where(rockc, 99, 0).astype(np.float32)
    for _ in range(8):                                   # cells from the nearest ground that is not rock
        pad = np.pad(dist, 1, constant_values=99)
        near = np.minimum.reduce([pad[1 + dy:1 + dy + rows, 1 + dx:1 + dx + cols] + (1.0 if dx == 0 or dy == 0 else 1.4)
                                  for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy])
        dist = np.where(rockc, np.minimum(dist, near), 0)
    dpx = np.asarray(Image.fromarray(np.clip(dist * 40, 0, 255).astype(np.uint8)).resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(10)), np.float32) / 40
    deep = np.clip((dpx - 0.75) / 2.6, 0, 1) ** 0.8 * 238
    alpha = np.maximum(alpha, deep.astype(np.uint8))
    shade[..., 3] = alpha
    Image.fromarray(shade, "RGBA").save(os.path.join(out, "shade.png"), optimize=True)

    LIP = 18
    g = np.asarray(ground).astype(np.float32)
    # Where the rock really is, to the pixel. The tiles are painted half a cell lower than the grid, so the grid
    # alone puts the edge in the wrong place; inside the rock's own cells, stone is whatever is blue and not brown.
    rockpx = np.kron(rockc, np.ones((T, T), bool)) & (g[..., 2] - g[..., 0] > 10)
    up = np.zeros_like(rockpx); up[:-LIP] = rockpx[LIP:]              # the rock, moved up by LIP
    lip = up & ~rockpx                                               # the strip of floor it now covers
    lip &= ~np.kron(np.array([[at(cx, cy) == "a" for cx in range(cols)] for cy in range(rows)]), np.ones((T, T), bool))
    for o in objs:                                                   # a prop standing at the edge stays whole:
        al = np.asarray(seen[o["kind"]])[:, :, 3] > 0                 # no lip where the prop itself is drawn
        y1, y2, x1, x2 = max(0, o["y"]), min(H, o["y"] + o["h"]), max(0, o["x"]), min(W, o["x"] + o["w"])
        lip[y1:y2, x1:x2] &= ~al[y1 - o["y"]:y2 - o["y"], x1 - o["x"]:x2 - o["x"]]
    front = np.zeros((H, W, 4), np.float32)
    src = np.zeros_like(g); src[:-LIP] = g[LIP:]                      # the rock's own stone, from just below
    front[..., :3] = src * 0.78; front[..., 3] = lip * 255
    top = lip & ~np.roll(lip, 1, axis=0)                              # the lip's top edge: catches the light
    for i, gain in enumerate((1.7, 1.4, 1.12)):
        m = np.roll(top, i, axis=0) & lip
        front[m, :3] = np.clip(src[m] * gain + (24 - 8 * i), 0, 255)
    Image.fromarray(front.astype(np.uint8), "RGBA").save(os.path.join(out, "front.png"), optimize=True)

    fg = {}
    for k, f in (cfg.get("foreground") or {}).items():
        ext = os.path.splitext(f)[1] or ".png"
        shutil.copy(p(f), os.path.join(out, "fg", k + ext)); fg[k] = "fg/" + k + ext

    marks = []
    for m in cfg.get("landmarks", []):            # a landmark may open a painted plate: {"plate": "art/plates/x.png"}
        m = dict(m)
        if m.get("plate"):
            os.makedirs(os.path.join(out, "plates"), exist_ok=True)
            name = m["kind"] + (os.path.splitext(m["plate"])[1] or ".png")
            shutil.copy(p(m["plate"]), os.path.join(out, "plates", name)); m["plate"] = "plates/" + name
        marks.append(m)

    road = {"_": "Baked by scripts/pixel-road/bake.py from the PixelLab map below; do not edit by hand. ground.png has the props painted in; objects/ holds the same props again so a figure can stand behind one.",
            "id": rid, "name": cfg["name"], "pixellabMapId": cfg["pixellabMapId"], "tile": T, "cols": cols, "rows": rows,
            "ground": "ground.png", "shade": "shade.png", "front": "front.png", "foreground": fg,
            "legend": {"w": "floor", "r": "damp floor", "d": "rock", "a": "rock face", "s": "stream"}, "walkable": "wr",
            "grid": grid, "objects": objs, "entry": cfg["entry"], "exit": cfg["exit"],
            "landmarks": marks, "glow": cfg.get("glow", {}), "shine": cfg.get("shine", {})}
    json.dump(road, open(os.path.join(out, "road.json"), "w"), indent=1)
    print(rid, len(objs), "props,", sorted(seen), "->", out)

main()
