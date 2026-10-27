#!/usr/bin/env python3
"""
Add the Hard Labor poses to a hero's battle sprite: `scrub`, `heave` and `carry`.

    python scripts/sprites/add-labor-poses.py <slug> <frames-root> [--fps 10]

<frames-root> holds one folder per pose, each with PixelLab v3 frames named <direction>/frame_<nnn>.png for all
eight directions (the layout PixelLab's character download uses):

    <frames-root>/scrub/south/frame_000.png ... <frames-root>/carry/north-west/frame_008.png

Writes public/sprites/<slug>/{scrub,heave,carry}.png and adds the three animations to sprite.json.

WHAT EACH POSE IS (Hard Labor module, Sam 2026-10-26: "Start on props, poses, speech, and music"):
  scrub  kneels and works the floor. PixelLab draws the kneel-down first, so only the kneeling frames (SCRUB_FROM
         on) go in the sheet, and it loops: barracks, pots, kitchen, dishes, laundry, braiding.
  heave  hoists a sack onto the shoulder, once (loop false): what plays when a carrying task starts.
  carry  trudges with the sack on the shoulder, looping: the walk while carrying. Drawn FROM heave's last frame, so
         the sack is already up on frame 0 and stays there.
Only the five main players have them (Sam, 2026-10-26: "we can do it for samson, scott, and lynkes. We may need to reuse
pixel art for some other people"); anyone else works in their idle and walk.

Scaling and anchoring are add-ward-pose.py's, for the same reasons (one scale per row, legs anchor, the renderer's row
order). The scale is taken from heave's frame 0 for heave and carry alike, because carry's frame 0 is already bent
under the sack and would come out taller than the hero standing; scrub takes its own frame 0, which stands.

CLEAN-UP, two things PixelLab leaves in a few frames:
  - specks: motion swooshes and stray pixels floating free of the figure (Samson west, Fifi's north heave). Any
    connected blob under SPECK of the largest one's size, not touching it, is dropped. Relative, not a pixel count:
    a swoosh can be 150px, while the sack Fifi has not picked up yet lies apart from her and must stay.
  - a cyan glint on Fifi's sack (north-west): a saturated cyan pixel is nothing anyone wears down here, so it takes the
    average of its non-cyan neighbours.
"""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ROWS = ["south", "south-east", "east", "north-east",
        "north", "north-west", "west", "south-west"]
SCRUB_FROM = 5       # frames 0-4 kneel down from standing; 5-8 are the scrub itself
SPECK = 0.08


def legs_anchor(a: np.ndarray) -> tuple[int, int, float]:
    al = a[..., 3]
    ys, xs = np.nonzero(al > 24)
    if not len(ys):
        raise SystemExit("a frame is empty")
    y0, y1 = int(ys.min()), int(ys.max())
    lo = y1 - int((y1 - y0) * 0.33)
    legs = np.nonzero(al[lo:y1 + 1].max(axis=0) > 24)[0]
    return y0, y1, float((legs.min() + legs.max()) / 2)


def components(mask: np.ndarray) -> list[np.ndarray]:
    """4-connected blobs of a boolean mask, as index arrays (pure numpy/python; no scipy on Sam's machine)."""
    seen = np.zeros_like(mask, bool)
    h, w = mask.shape
    out = []
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        stack, blob = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            blob.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        out.append(np.array(blob))
    return out


def clean(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGBA")).copy()
    blobs = sorted(components(a[..., 3] > 24), key=len, reverse=True)
    for b in blobs[1:]:
        if len(b) < SPECK * len(blobs[0]):
            a[b[:, 0], b[:, 1], 3] = 0
    r, g, b_, al = [a[..., i].astype(int) for i in range(4)]
    cyan = (al > 24) & (b_ > 150) & (g > 150) & (r < 120)
    for y, x in zip(*np.nonzero(cyan)):
        y0, y1, x0, x1 = max(0, y - 2), y + 3, max(0, x - 2), x + 3
        win = a[y0:y1, x0:x1].reshape(-1, 4).astype(int)
        keep = win[(win[:, 3] > 24) & ~((win[:, 2] > 150) & (win[:, 1] > 150) & (win[:, 0] < 120))]
        if len(keep):
            a[y, x, :3] = keep[:, :3].mean(axis=0).astype(np.uint8)
    return Image.fromarray(a)


def frames(src: Path, pose: str, direction: str) -> list[Image.Image]:
    d = src / pose / direction
    files = sorted(d.glob("frame_*.png"))
    if len(files) < 4:
        raise SystemExit(f"only {len(files)} frames in {d}")
    return [clean(Image.open(f)) for f in files]


def sheet(sprite_dir: Path, cell: int, rows: list[tuple[list[Image.Image], float]]) -> Image.Image:
    idle = np.asarray(Image.open(sprite_dir / "idle.png").convert("RGBA"))[0:cell, 0:cell]
    _, ry1, rcx = legs_anchor(idle)
    n = len(rows[0][0])
    out = Image.new("RGBA", (n * cell, len(ROWS) * cell), (0, 0, 0, 0))
    for r, (fr, scale) in enumerate(rows):
        for i, im in enumerate(fr):
            w, h = im.size
            im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.NEAREST)
            _, fy1, fcx = legs_anchor(np.asarray(im))
            out.alpha_composite(im, (i * cell + round(rcx - fcx), r * cell + round(ry1 - fy1)))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("frames_root")
    ap.add_argument("--fps", type=int, default=10)
    a = ap.parse_args()

    sprite_dir = ROOT / "public" / "sprites" / a.slug
    manifest = sprite_dir / "sprite.json"
    d = json.loads(manifest.read_text(), object_pairs_hook=collections.OrderedDict)
    cell = int(d["cell"][0])
    src = Path(a.frames_root)
    idle = np.asarray(Image.open(sprite_dir / "idle.png").convert("RGBA"))[0:cell, 0:cell]
    ry0, ry1, _ = legs_anchor(idle)
    target_h = ry1 - ry0 + 1

    def scale_of(f0: Image.Image) -> float:
        y0, y1, _ = legs_anchor(np.asarray(f0))
        return target_h / (y1 - y0 + 1)

    scrub, heave, carry = [], [], []
    for direction in ROWS:
        s = frames(src, "scrub", direction)
        scrub.append((s[SCRUB_FROM:], scale_of(s[0])))
        h = frames(src, "heave", direction)
        k = scale_of(h[0])
        heave.append((h, k))
        carry.append((frames(src, "carry", direction), k))

    for name, rows, loop in (("scrub", scrub, True), ("heave", heave, False), ("carry", carry, True)):
        img = sheet(sprite_dir, cell, rows)
        img.save(sprite_dir / f"{name}.png", optimize=True)
        d["animations"][name] = {"sheet": f"{name}.png", "frames": len(rows[0][0]), "fps": a.fps, "loop": loop}
        print(f"{a.slug}: {name}.png {img.size}, {len(rows[0][0])} frames, loop={loop}")
    manifest.write_text(json.dumps(d, indent=1) + "\n")


if __name__ == "__main__":
    main()
