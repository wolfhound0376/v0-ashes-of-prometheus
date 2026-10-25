#!/usr/bin/env python3
"""
Bake Sam's green skull-cloud GIF into the standing poison-cloud sheet (aoePoisonSkulls).

    python scripts/vfx/bake_skull_cloud.py <skull-cloud.gif> [opacity]

Sam supplied the art on 2026-10-25 ("use it and preserve the animation. Have the transparency adjusted
slightly so you can see the pixel character(s) it is affecting. It should grow and fill the area of
effect."). The source is 17 MB, so it is not committed; it is the GIF from that chat, 960x540,
100 frames at 50 ms, opaque on black.

WHAT THE SOURCE IS, MEASURED. A ONE-SHOT, not a loop: consecutive frames differ by 2.2 (mean abs, 0-255)
and the last frame differs from the first by 39.9. The cloud swells and pushes in for five seconds; the
skulls fade out by about frame 37. So nothing here cross-fades it into a loop (that would smear the
skulls into the hold). Every frame is kept and the manifest records `grow`: frames before it play once,
the rest ping-pong (lib/area-cloud.mjs). A swell run backwards is a settle, so the hold has no seam.

ALPHA. Normal-blend alpha, not the additive luminance key the impact sheets use: the body of this smoke
is DARK green (max channel 30-60), and added to the plate it would all but vanish -- the cloud has to
veil the figures in it, not glow over them. Alpha rises from 0 at black to 1 by a max channel of ~50,
colour is un-premultiplied so it composites like the art over black, and the whole thing is capped at
OPACITY (Sam: "so you can see the pixel character(s)"). The renderer lowers it again per puff.

EDGES. Late frames are cropped by the source frame: the smoke runs off the top and sides, which would
draw as a hard straight edge across the plate. Every cell is feathered to zero on all four sides.
The feather mask is shape (H, W, 1) -- never (H, 1), which numpy would broadcast across columns
(the bake landmine of 2026-09-28).

VERIFY NUMERICALLY, NOT BY EYE: the script prints alpha max (must equal the cap), the four corners and
the edge rows (must be 0).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageSequence

KEY, CW, CH, COLS, GROW = "aoePoisonSkulls", 320, 180, 10, 50
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
    frames = [f.convert("RGB").resize((CW, CH), Image.LANCZOS) for f in ImageSequence.Iterator(Image.open(src))]
    n = len(frames)
    rows = (n + COLS - 1) // COLS
    feather = (ramp(CH, 0.16)[:, None] * ramp(CW, 0.12)[None, :])[:, :, None]
    sheet = Image.new("RGBA", (CW * COLS, CH * rows), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        a = np.asarray(f).astype(np.float32)
        raw = np.clip((a.max(axis=2, keepdims=True) - 6) / 44.0, 0, 1) ** 0.8
        col = np.clip(a / np.maximum(raw, 1e-3), 0, 255)
        rgba = np.concatenate([col, raw * opacity * feather * 255], axis=2).astype(np.uint8)
        sheet.paste(Image.fromarray(rgba, "RGBA"), ((i % COLS) * CW, (i // COLS) * CH))
    path = os.path.join(OUT, KEY + ".webp")
    sheet.save(path, "WEBP", quality=70, alpha_quality=50, method=6)

    A = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3].astype(float)
    for i in (0, n // 2, n - 1):
        c = A[(i // COLS) * CH:(i // COLS + 1) * CH, (i % COLS) * CW:(i % COLS + 1) * CW]
        print(f"frame {i:3d}: alpha max {c.max():.0f} (cap {opacity * 255:.0f})  corners "
              f"{c[:6, :6].mean():.1f} {c[-6:, -6:].mean():.1f}  edge rows {c[0].mean():.1f} {c[-1].mean():.1f}")

    mpath = os.path.join(OUT, "manifest.json")
    man = json.load(open(mpath))
    man[KEY] = {"bytes": os.path.getsize(path), "cols": COLS, "file": KEY + ".webp", "fps": 20,
                "frames": n, "grow": GROW, "rows": rows}
    with open(mpath, "w") as fh:
        json.dump(dict(sorted(man.items())), fh, indent=2, sort_keys=True)
        fh.write("\n")
    print("wrote", path, man[KEY])


if __name__ == "__main__":
    main()
