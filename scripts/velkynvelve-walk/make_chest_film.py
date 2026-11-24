"""Turn a filmed chest opening into the sprite sheet a painted prop plays on the walk (story.json prop `film`).

Sam, 2026-11-23: "we need a better solution to painted art chests and opening them. It should look neat and open up
realistically." The old open was the lid cut out of the painting and skewed on its hinge (drawProps in template.html):
on a deep or domed lid that is a dark slab sweeping across the wall. This script makes the replacement.

HOW A CHEST FILM IS MADE (all from the plate itself, so it matches the painting):
  1. Crop the chest from the plate with room above it for the lid (`--box x y w h`, plate px), upscale x3 and use it
     as the CLOSED frame.
  2. Image-edit that crop into the OPEN chest (same camera, lid back on its hinges, contents lit from inside).
  3. Video model, start = closed, end = open, locked camera, ~4 s, no audio.
  4. This script: every video frame is scaled to the box, registered onto the plate crop (ECC, affine), colour-matched
     to the plate on the pixels the lid never touches, and given an alpha that is the frame's difference from the
     painting (thresholded, grown, feathered) inside the region the lid sweeps. Frame 0 is therefore the plate itself
     (alpha 0) and only the lid, its shadow and the light from inside are ever drawn over the painting.

Python only (Sam's machine has no Node). Needs numpy, pillow, opencv-python (pip install opencv-python) and ffmpeg.
  python scripts/velkynvelve-walk/make_chest_film.py --plate node-08-shoor-quarters.jpg --video shoor.mp4 \
      --box 1200 200 420 315 --out public/velkynvelve-walk/img/props/shoor-chest-open.webp --frames 24 --cols 6
It prints the story.json `film` block to paste onto the prop (add `secs` and `glow` by eye).
"""
import argparse, json, os, subprocess, tempfile
import numpy as np
import cv2
from PIL import Image


def read_frames(video):
    d = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-loglevel", "error", "-i", video, os.path.join(d, "f%04d.png")], check=True)
    names = sorted(n for n in os.listdir(d) if n.endswith(".png"))
    return [np.asarray(Image.open(os.path.join(d, n)).convert("RGB")) for n in names]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--plate", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--box", type=int, nargs=4, required=True, metavar=("X", "Y", "W", "H"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--frames", type=int, default=24)
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--scale", type=float, default=1.0, help="frame size relative to plate px (1 = native)")
    ap.add_argument("--settle", type=float, default=.97, help="the film ends at the first frame this close to the final change (lower it if the lid stops early and the clip holds)")
    ap.add_argument("--preview", help="optional PNG strip of every 4th frame composited on the plate")
    a = ap.parse_args()

    x, y, w, h = a.box
    plate = Image.open(a.plate).convert("RGB")
    k = plate.width / 2400.0                      # plates are authored at NAT_W = 2400
    fw, fh = int(round(w * a.scale)), int(round(h * a.scale))
    closed = np.asarray(plate.crop((int(x * k), int(y * k), int((x + w) * k), int((y + h) * k))).resize((fw, fh), Image.LANCZOS)).astype(np.float32)

    raw = [cv2.resize(f, (fw, fh), interpolation=cv2.INTER_AREA).astype(np.float32) for f in read_frames(a.video)]
    n_all = len(raw)

    # 1. register: one affine from video frame 0 onto the plate crop (the camera is locked; per-frame ECC would chase the lid)
    g0 = cv2.cvtColor(closed.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    g1 = cv2.cvtColor(raw[0].astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
    warp = np.eye(2, 3, dtype=np.float32)
    try:
        _, warp = cv2.findTransformECC(g0, g1, warp, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-5), None, 5)
    except cv2.error:
        pass
    reg = [cv2.warpAffine(f, warp, (fw, fh), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE) for f in raw]

    # 2. where the lid goes: the open frame against the painting, grown generously
    def diff(f, ref):
        return cv2.GaussianBlur(np.abs(f - ref).max(axis=2), (0, 0), 2.0)
    act = (diff(reg[-1], closed) > 22).astype(np.uint8)
    for f in reg[::6]:
        act |= (diff(f, closed) > 22).astype(np.uint8)
    act = cv2.morphologyEx(act, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    act = cv2.dilate(act, np.ones((15, 15), np.uint8))
    bg = cv2.erode(1 - act, np.ones((9, 9), np.uint8)).astype(bool)
    if bg.sum() < 500:
        bg = np.ones_like(bg)

    # 3. pick the frames: from the first that moves to the first that has settled
    motion = [float(diff(f, reg[0])[act > 0].mean()) for f in reg]
    total = motion[-1] or 1.0
    start = next((i for i, m in enumerate(motion) if m > .04 * total), 0)
    end = next((i for i, m in enumerate(motion) if m > a.settle * total), n_all - 1)
    end = min(max(end, start + a.frames - 1), n_all - 1)
    picks = [0] + [int(round(start + (end - start) * i / (a.frames - 2))) for i in range(a.frames - 1)]
    picks = [min(p, n_all - 1) for p in picks]

    out = []
    for j, p in enumerate(picks):
        f = reg[p].copy()
        for c in range(3):                         # 4. colour-match to the painting on untouched pixels
            src, dst = f[..., c][bg], closed[..., c][bg]
            s = dst.std() / max(src.std(), 1e-3)
            f[..., c] = (f[..., c] - src.mean()) * s + dst.mean()
        f = np.clip(f, 0, 255)
        if j == 0:
            alpha = np.zeros((fh, fw), np.float32)
        else:                                      # 5. alpha: where this frame is not the painting, inside the lid's sweep
            d = diff(f, closed)
            alpha = np.clip((d - 10) / 22, 0, 1) * act
            alpha = cv2.dilate(alpha, np.ones((7, 7), np.uint8))
            alpha = cv2.GaussianBlur(alpha, (0, 0), 3.0)
            alpha = np.clip(alpha * 1.25, 0, 1) * cv2.GaussianBlur(act.astype(np.float32), (0, 0), 6.0)
        out.append(np.dstack([f, alpha * 255]).astype(np.uint8))

    rows = -(-len(out) // a.cols)
    sheet = Image.new("RGBA", (fw * a.cols, fh * rows), (0, 0, 0, 0))
    for i, fr in enumerate(out):
        sheet.paste(Image.fromarray(fr, "RGBA"), ((i % a.cols) * fw, (i // a.cols) * fh))
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    sheet.save(a.out, "WEBP", quality=88, method=6)

    if a.preview:
        strip = Image.new("RGB", (fw * len(out[::4]), fh))
        base = Image.fromarray(closed.astype(np.uint8))
        for i, fr in enumerate(out[::4]):
            im = base.copy(); im.paste(Image.fromarray(fr, "RGBA"), (0, 0), Image.fromarray(fr, "RGBA")); strip.paste(im, (i * fw, 0))
        strip.save(a.preview)

    print(json.dumps({"src": "props/" + os.path.basename(a.out), "box": [x, y, w, h], "frames": len(out), "cols": a.cols,
                      "_motion": [start, end, n_all], "_bytes": os.path.getsize(a.out)}))


if __name__ == "__main__":
    main()
