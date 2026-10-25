#!/usr/bin/env python3
"""
Bake Sam's Chromatic Orb pack into three sheets per element (form, flight, impact).

    python scripts/vfx/bake_chromatic_orb.py <Chromatic-Orb-Pack folder>

Sam supplied the pack on 2026-10-25 (Chromatic-Orb-Animations.zip): for each of the six elements a 2048x2048 RGBA
atlas, 4x4 cells of 512, 16 frames, with animation.json saying frames 3-6 are the flight and 7 starts the impact.
Frames 0-2 are the ball forming. Laid out once on a contact sheet, all five atlases share that structure.

THE THUNDER ATLAS DID NOT SURVIVE THE UPLOAD -- the zip was cut off partway through the thunder files. Its 4K video
did come through (3840x2160, 25 fps, 49 frames, opaque dark matte, the same form/fly/burst sequence), so thunder is
rebuilt from it: sixteen frames picked to match the atlases' phases, cropped square around the effect's extent over
the whole clip, scaled to 512 and alpha keyed from luminance (the matte is near-black, as with every other clip).

Out, per element E in acid/cold/fire/lightning/poison/thunder (cells CELL px):
  orb<E>Form  frames 0-2   the ball forming in the hand; the map holds it pulsing on the last two
  orb<E>Fly   frames 3-6   the thrown ball, head at +X (the kit turns it to face its flight), loops
  orb<E>Hit   frames 7-15  the burst on a hit, one-shot
"""
import json, os, sys, subprocess, tempfile, glob
import numpy as np
from PIL import Image

CELL = 192
ELEMENTS = ["acid", "cold", "fire", "lightning", "poison", "thunder"]
PARTS = {"Form": (range(0, 3), 10), "Fly": (range(3, 7), 14), "Hit": (range(7, 16), 14)}
# Video frames (of 49) standing in for the 16 atlas frames: 3 forming, 4 flying, 9 bursting -- read off a contact sheet.
THUNDER_PICK = [0, 2, 3, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 27, 30, 34]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "public", "vfx")


def atlas_frames(path):
    a = Image.open(path).convert("RGBA")
    return [a.crop(((i % 4) * 512, (i // 4) * 512, (i % 4) * 512 + 512, (i // 4) * 512 + 512)) for i in range(16)]


def thunder_frames(mp4):
    # Decoded at 1080p: 49 frames of 4K as floats is ~5 GB, and the atlas cells are 512 px anyway.
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp4, "-vf", "scale=1920:1080", os.path.join(d, "f%03d.png")], check=True)
        paths = sorted(glob.glob(os.path.join(d, "*.png")))
        lum = None
        for pth in paths:                                          # the effect's extent over the whole clip
            m = np.asarray(Image.open(pth).convert("RGB")).max(axis=2)
            lum = m if lum is None else np.maximum(lum, m)
        ys, xs = np.where(lum > 28)
        cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
        side = int(max(xs.max() - xs.min(), ys.max() - ys.min()) * 1.12)
        box = (int(cx - side / 2), int(cy - side / 2), int(cx + side / 2), int(cy + side / 2))
        out = []
        for i in THUNDER_PICK:
            a = np.asarray(Image.open(paths[min(i, len(paths) - 1)]).convert("RGB").crop(box).resize((512, 512), Image.LANCZOS)).astype(np.float32)
            raw = np.clip((a.max(axis=2, keepdims=True) - 10) / 70.0, 0, 1)
            col = np.clip(a / np.maximum(raw, 1e-3), 0, 255)
            out.append(Image.fromarray(np.concatenate([col, raw * 255], axis=2).astype(np.uint8), "RGBA"))
    return out


def main():
    pack = sys.argv[1]
    man = json.load(open(os.path.join(OUT, "manifest.json")))
    for e in ELEMENTS:
        atlas = os.path.join(pack, f"chromatic-orb-{e}-atlas.png")
        frames = atlas_frames(atlas) if os.path.exists(atlas) else thunder_frames(os.path.join(pack, f"chromatic-orb-{e}-4K-upscaled.mp4"))
        for part, (idx, fps) in PARTS.items():
            idx = list(idx)
            sheet = Image.new("RGBA", (CELL * len(idx), CELL), (0, 0, 0, 0))
            for j, i in enumerate(idx):
                sheet.paste(frames[i].resize((CELL, CELL), Image.LANCZOS), (j * CELL, 0))
            key = f"orb{e.capitalize()}{part}"
            path = os.path.join(OUT, key + ".webp")
            sheet.save(path, "WEBP", quality=82, alpha_quality=80, method=6)
            A = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3]
            corners = float(np.mean([A[:3, :3].mean(), A[-3:, -3:].mean()]))
            man[key] = {"bytes": os.path.getsize(path), "cols": len(idx), "file": key + ".webp", "fps": fps,
                        "frames": len(idx), "rows": 1, **({"loop": True} if part == "Fly" else {})}
            print(f"{key:18s} {sheet.size} {os.path.getsize(path):7d} B  corners {corners:.1f}  alpha max {A.max()}")
    with open(os.path.join(OUT, "manifest.json"), "w") as fh:
        json.dump(dict(sorted(man.items())), fh, indent=2, sort_keys=True)
        fh.write("\n")


if __name__ == "__main__":
    main()
