#!/usr/bin/env python3
"""
Bake a WARD — an upright dome of light that settles over a creature and
stays — from one animated source, as TWO sheets: the rise and the hold.

    python scripts/vfx/bake_ward_sheet.py <source.gif> sanctuary --dry-run
    python scripts/vfx/bake_ward_sheet.py <source.gif> sanctuary

Produces public/vfx/<key>Rise.webp (one-shot) and <key>Hold.webp (looping)
and registers both in the manifest, plus a `floor` field on each: the row of
the cell, as a fraction from the TOP, where the drawn floor ring's centre
sits. The renderer stands that row on the creature's feet.

WHY TWO SHEETS
--------------
Sam's Sanctuary source (2026-10-15) is 16 frames at 100 ms: frames 0-7 are
the ward ARRIVING (embers on the floor -> ring -> wisps -> crown) and frames
8-15 are the ward HOLDING, a cycle whose last frame runs back into frame 8 as
cleanly as any two neighbours do (mean abs diff 15->8 = 11.7, neighbours
10-12). The kit's Flip plays a sheet one-shot or loops the WHOLE sheet; it
cannot loop a tail. Splitting at the seam uses Flip exactly as it stands
instead of widening a class other branches are editing.

WHY IT IS NOT A SIGIL
---------------------
A target sigil is laid FLAT and spun, because the renderer owns the spin and
the art must be a true circle (see bake_school_sigil.py). A ward is the
opposite shape: a dome drawn FROM the board's viewpoint, its floor ring
already an ellipse, nothing in it turning. So it is a camera-facing quad and
the art is kept exactly as drawn — no un-squash, no ring/plume split.

THE KEY
-------
The source is not black: it sits on a haze (frame 15: p5 = 8, median 22 of
255). Keyed naively that haze becomes a soft grey plate over the board — the
"coverage" failure bake_school_sigil.py warns about. The floor is measured
per bake from the source's own dark pixels and subtracted before the alpha
ramp, and the script prints coverage so a bad key is caught before it ships.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "vfx"


def frames_of(src: Path) -> list[np.ndarray]:
    im = Image.open(src)
    out = []
    for i in range(getattr(im, "n_frames", 1)):
        im.seek(i)
        out.append(np.asarray(im.convert("RGB")).astype(np.float32))
    return out


def luma(a: np.ndarray) -> np.ndarray:
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def floor_row(frames: list[np.ndarray], start: int) -> int:
    """The drawn floor ring's centre: the brightest row of the held frames,
    searched in the lower half where the ring is (the crown is the other
    bright band, and it is in the upper half)."""
    prof = np.mean([luma(f).mean(axis=1) for f in frames[start:]], axis=0)
    h = len(prof)
    return int(h // 2 + np.argmax(prof[h // 2:]))


def key(rgb: np.ndarray, floor: float, knee: float, gamma: float) -> np.ndarray:
    """RGBA: colour as drawn, alpha from how far above the haze a pixel is."""
    lum = rgb.max(axis=2)
    a = np.clip((lum - floor) / knee, 0, 1) ** gamma
    return np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8)


def coverage(sheet: Image.Image) -> float:
    return 100.0 * float((np.asarray(sheet)[..., 3] > 8).mean())


def column_balance(cells: list[Image.Image]) -> float:
    """Left-half alpha mean over right-half. ~1 for a symmetric dome; the
    (H,1) mask bug in bake_target_sigil.py would have shown as ~0 or huge."""
    a = np.mean([np.asarray(c)[..., 3].astype(np.float32) for c in cells], axis=0)
    w = a.shape[1] // 2
    return float(a[:, :w].mean() / max(1e-6, a[:, w:].mean()))


def sheet_of(cells: list[Image.Image], cols: int) -> Image.Image:
    cw, ch = cells[0].size
    rows = (len(cells) + cols - 1) // cols
    out = Image.new("RGBA", (cw * cols, ch * rows), (0, 0, 0, 0))
    for i, c in enumerate(cells):
        out.paste(c, ((i % cols) * cw, (i // cols) * ch))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path)
    ap.add_argument("key", help="manifest stem, e.g. sanctuary -> sanctuaryRise / sanctuaryHold")
    ap.add_argument("--split", type=int, default=8, help="first frame of the held loop")
    ap.add_argument("--cell", type=int, default=256, help="output cell width and height, px")
    ap.add_argument("--knee", type=float, default=70.0, help="luminance above the haze that reaches full alpha")
    ap.add_argument("--gamma", type=float, default=1.6, help=">1 pushes the faint haze further down")
    ap.add_argument("--fps", type=int, default=10)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    frames = frames_of(a.src)
    n = len(frames)
    if not 0 < a.split < n:
        raise SystemExit(f"--split {a.split} is outside a {n}-frame source")
    h, w = frames[0].shape[:2]

    # The haze: the 30th percentile of the brightest channel across the held
    # frames, which is background on every frame of this art.
    held = np.stack([f.max(axis=2) for f in frames[a.split:]])
    haze = float(np.percentile(held, 30))
    fr = floor_row(frames, a.split)

    # Square crop centred on the art, full height. The source is already
    # square; this keeps the floor fraction honest if a later one is not.
    side = min(w, h)
    x0 = (w - side) // 2
    y0 = (h - side) // 2
    cells = []
    for f in frames:
        rgba = key(f[y0:y0 + side, x0:x0 + side], haze, a.knee, a.gamma)
        cells.append(Image.fromarray(rgba, "RGBA").resize((a.cell, a.cell), Image.LANCZOS))
    floor_frac = round((fr - y0) / side, 4)

    rise, hold = cells[:a.split], cells[a.split:]
    cols = 4
    out = {
        f"{a.key}Rise": (sheet_of(rise, cols), {"frames": len(rise), "loop": False}),
        f"{a.key}Hold": (sheet_of(hold, cols), {"frames": len(hold), "loop": True}),
    }

    print(f"  source      {w}x{h}, {n} frames; rise 0-{a.split - 1}, hold {a.split}-{n - 1}")
    print(f"  haze floor  {haze:.1f} / 255     floor ring row {fr} -> {floor_frac:.3f} of the cell")
    print(f"  balance L/R {column_balance(hold):.2f} (want ~1)")
    for k, (im, _) in out.items():
        cov = coverage(im)
        flag = "  <-- over 70%: this will read as a plate, not as light" if cov > 70 else ""
        print(f"  {k:16} {im.size[0]}x{im.size[1]}  coverage {cov:4.1f}%{flag}")
    if a.dry_run:
        return

    entries = {}
    for k, (im, meta) in out.items():
        dest = OUT / f"{k}.webp"
        im.save(dest, "WEBP", quality=88, method=6)
        rows = (meta["frames"] + cols - 1) // cols
        entries[k] = {"bytes": dest.stat().st_size, "cols": cols, "file": dest.name,
                      "floor": floor_frac, "fps": a.fps, "frames": meta["frames"],
                      "loop": meta["loop"], "rows": rows}
        print(f"  wrote {k:16} {dest.stat().st_size:>7,} B")

    mf = OUT / "manifest.json"
    man = json.loads(mf.read_text())
    man.update(entries)
    # Written exactly as the file already is (indent 2, sorted keys, no
    # trailing newline) so a bake's diff is its own entries and nothing else.
    mf.write_text(json.dumps(dict(sorted(man.items())), indent=2))
    print(f"  manifest updated with {len(entries)} keys")


if __name__ == "__main__":
    main()
