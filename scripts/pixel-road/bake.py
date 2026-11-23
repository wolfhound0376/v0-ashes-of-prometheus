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
  shade.png    depth, as one see-through layer: the dark at the foot of every rock face, and the shadow each
               prop throws across the floor. Drawn over the ground and under the figures.
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

    fg = {}
    for k, f in (cfg.get("foreground") or {}).items():
        ext = os.path.splitext(f)[1] or ".png"
        shutil.copy(p(f), os.path.join(out, "fg", k + ext)); fg[k] = "fg/" + k + ext

    road = {"_": "Baked by scripts/pixel-road/bake.py from the PixelLab map below; do not edit by hand. ground.png has the props painted in; objects/ holds the same props again so a figure can stand behind one.",
            "id": rid, "name": cfg["name"], "pixellabMapId": cfg["pixellabMapId"], "tile": T, "cols": cols, "rows": rows,
            "ground": "ground.png", "shade": "shade.png", "foreground": fg,
            "legend": {"w": "floor", "r": "damp floor", "d": "rock", "a": "rock face", "s": "stream"}, "walkable": "wr",
            "grid": grid, "objects": objs, "entry": cfg["entry"], "exit": cfg["exit"],
            "landmarks": cfg.get("landmarks", []), "glow": cfg.get("glow", {}), "shine": cfg.get("shine", {})}
    json.dump(road, open(os.path.join(out, "road.json"), "w"), indent=1)
    print(rid, len(objs), "props,", sorted(seen), "->", out)

main()
