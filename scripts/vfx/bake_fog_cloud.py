#!/usr/bin/env python3
"""
Bake the billowing-fog loop from Sam's "Poison and Fog 4K" pack into the standing fog-cloud sheet (aoeFogCloud).

    python scripts/vfx/bake_fog_cloud.py <Fog-Billowing-4K.webp> [opacity]

Sam supplied the pack on 2026-10-25 and ruled: Fog Cloud should billow on the pixel map the way the poison
cloud does. The pack's README: 16 frames, 160 ms each, 3840x2160 WebP with real alpha, neutral silver-white
mist, no skulls. The source is ~20 MB, so it is not committed.

WHAT THE SOURCE IS, MEASURED. A TRUE LOOP, unlike the poison cloud: consecutive frames differ by 6.8 in alpha
(mean abs, 0-255) and the last frame differs from the first by only 4.6 -- the seam is smaller than an
ordinary step. So it is NOT played grow-then-ping-pong (that runs wisps backwards); the manifest says
`loop: true` and lib/area-cloud.mjs cycles it. `grow` still sets how long the puffs take to spread to fill
the area (grow / fps seconds), exactly as for the poison.

FRAME RATE. 16 frames at 6.25 fps steps visibly on a big puff. Each gap is cross-faded once (including
15 -> 0, which is seamless), giving 32 frames at 12.5 fps -- the same 2.56 s loop.

CROP. The cloud occupies only the middle of the 16:9 canvas (alpha > 20 spans x 1115-2828, y 204-1950 over
all 16 frames). Left wide, the renderer would size the puff to the area's diameter and the visible mist
would cover under half of it. Cropped to that box with a margin, then squashed slightly (1800x1800 ->
320x256) so it sits as a low bank on the floor rather than a tower. Its base stays at the cell bottom, where
the renderer plants a puff's feet.

ALPHA. The source alpha is used as is (it is clean in the 4K WebP; the speckled fringe is only in the pack's
source sheet), capped at OPACITY like the poison so figures inside still read. The renderer lowers it again
per puff. Every cell is feathered to zero on all four sides; the mask is shape (H, W, 1) -- never (H, 1).

VERIFY NUMERICALLY, NOT BY EYE: the script prints alpha max (must equal the cap), corners and edge rows
(must be 0), and the loop seam against an ordinary step.
"""
import json, os, sys
import numpy as np
from PIL import Image

KEY, CW, CH, COLS = "aoeFogCloud", 320, 256, 8
BOX = (1070, 170, 2870, 1970)          # x0, y0, x1, y1 in the 3840x2160 source
SRC_FPS = 6.25
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "vfx")


def ramp(n, frac):
    r = np.ones(n, np.float32)
    k = int(n * frac)
    t = np.linspace(0, 1, k, endpoint=False)
    r[:k] = t * t * (3 - 2 * t)
    r[n - k:] = r[:k][::-1]
    return r


def main():
    src = sys.argv[1]
    opacity = float(sys.argv[2]) if len(sys.argv) > 2 else 0.72
    im = Image.open(src)
    raw = []
    for i in range(im.n_frames):
        im.seek(i)
        f = im.convert("RGBA").crop(BOX).resize((CW, CH), Image.LANCZOS)
        a = np.asarray(f).astype(np.float32)
        # un-premultiplied colour; blend the in-betweens in premultiplied space so edges do not darken
        raw.append(np.concatenate([a[:, :, :3] * (a[:, :, 3:] / 255.0), a[:, :, 3:]], axis=2))
    frames = []
    for i, p in enumerate(raw):
        q = raw[(i + 1) % len(raw)]
        frames += [p, (p + q) / 2]
    n = len(frames)
    rows = (n + COLS - 1) // COLS
    feather = (ramp(CH, 0.10)[:, None] * ramp(CW, 0.10)[None, :])[:, :, None]
    sheet = Image.new("RGBA", (CW * COLS, CH * rows), (0, 0, 0, 0))
    for i, pm in enumerate(frames):
        al = pm[:, :, 3:] / 255.0
        col = np.clip(pm[:, :, :3] / np.maximum(al, 1e-3), 0, 255)
        rgba = np.concatenate([col, al * opacity * feather * 255], axis=2).astype(np.uint8)
        sheet.paste(Image.fromarray(rgba, "RGBA"), ((i % COLS) * CW, (i // COLS) * CH))
    path = os.path.join(OUT, KEY + ".webp")
    sheet.save(path, "WEBP", quality=72, alpha_quality=60, method=6)

    A = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3].astype(float)
    cell = lambda i: A[(i // COLS) * CH:(i // COLS + 1) * CH, (i % COLS) * CW:(i % COLS + 1) * CW]
    for i in (0, n // 2, n - 1):
        c = cell(i)
        print(f"frame {i:3d}: alpha max {c.max():.0f} (cap {opacity * 255:.0f})  corners "
              f"{c[:6, :6].mean():.1f} {c[-6:, -6:].mean():.1f}  edge rows {c[0].mean():.1f} {c[-1].mean():.1f}"
              f"  edge cols {c[:, 0].mean():.1f} {c[:, -1].mean():.1f}")
    steps = [np.abs(cell(i + 1) - cell(i)).mean() for i in range(n - 1)]
    print(f"loop seam {np.abs(cell(0) - cell(n - 1)).mean():.2f} vs mean step {np.mean(steps):.2f}")

    mpath = os.path.join(OUT, "manifest.json")
    man = json.load(open(mpath))
    man[KEY] = {"bytes": os.path.getsize(path), "cols": COLS, "file": KEY + ".webp", "fps": SRC_FPS * 2,
                "frames": n, "grow": n, "loop": True, "rows": rows, "skulls": False}
    with open(mpath, "w") as fh:
        json.dump(dict(sorted(man.items())), fh, indent=2, sort_keys=True)
        fh.write("\n")
    print("wrote", path, man[KEY])


if __name__ == "__main__":
    main()
