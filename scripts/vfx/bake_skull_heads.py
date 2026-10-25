#!/usr/bin/env python3
"""
Cut the skull heads out of frame 0 of Sam's skull-cloud GIF into a small sheet (aoePoisonSkullHeads).

    python scripts/vfx/bake_skull_heads.py <skull-cloud.gif>

Sam, 2026-10-25: "have the option of skeleton heads showing up in the gas (in and out) depending on the spell."
The cloud sheet's own skulls live only in its first ~37 frames (gone by frame 38, checked by eye on a contact sheet),
so once the cloud is in its hold they would never be seen again. These are the same skulls, lifted out of the same
painting, so the map can fade them in and out of the held cloud (lib/area-cloud.mjs `skullsAt`).

Each head is cut as a soft disc around the skull, keeping the smoke right around it, so it sits back into the gas
rather than floating on top of it. Alpha is keyed the way bake_skull_cloud.py keys the cloud (normal blend,
un-premultiplied), times the disc. Verify numerically: corners must print 0.
"""
import json, os, sys
import numpy as np
from PIL import Image

KEY, CELL = "aoePoisonSkullHeads", 128
# (centre x, centre y, skull height) in the 960x540 source, frame 0 -- read off a 60-px grid laid over it
HEADS = [(575, 365, 110), (377, 268, 70), (635, 200, 56), (250, 235, 50), (515, 235, 50), (735, 340, 52)]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "vfx")


def main():
    f0 = Image.open(sys.argv[1]).convert("RGB")
    sheet = Image.new("RGBA", (CELL * len(HEADS), CELL), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:CELL, 0:CELL]
    r = np.hypot(xx - CELL / 2 + .5, yy - CELL / 2 + .5) / (CELL / 2)
    disc = np.clip((1 - r) / .35, 0, 1)
    disc = (disc * disc * (3 - 2 * disc))[:, :, None]          # (H, W, 1): never (H, 1)
    for i, (cx, cy, h) in enumerate(HEADS):
        s = int(h * 1.5)
        crop = f0.crop((cx - s // 2, cy - s // 2, cx + s // 2, cy + s // 2)).resize((CELL, CELL), Image.LANCZOS)
        a = np.asarray(crop).astype(np.float32)
        raw = np.clip((a.max(axis=2, keepdims=True) - 6) / 44.0, 0, 1) ** 0.8
        col = np.clip(a / np.maximum(raw, 1e-3), 0, 255)
        rgba = np.concatenate([col, raw * disc * 255], axis=2).astype(np.uint8)
        sheet.paste(Image.fromarray(rgba, "RGBA"), (i * CELL, 0))
    path = os.path.join(OUT, KEY + ".webp")
    sheet.save(path, "WEBP", quality=80, alpha_quality=70, method=6)
    A = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3].astype(float)
    print("corners", A[:4, :4].mean(), A[-4:, -4:].mean(), "max", A.max())
    mpath = os.path.join(OUT, "manifest.json")
    man = json.load(open(mpath))
    man[KEY] = {"bytes": os.path.getsize(path), "cols": len(HEADS), "file": KEY + ".webp", "fps": 1,
                "frames": len(HEADS), "rows": 1}
    with open(mpath, "w") as fh:
        json.dump(dict(sorted(man.items())), fh, indent=2, sort_keys=True)
        fh.write("\n")
    print("wrote", path, man[KEY])


if __name__ == "__main__":
    main()
