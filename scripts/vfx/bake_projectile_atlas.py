"""Bake Sam's arrow / crossbow-bolt flight art into the board's two atlases.

Source: the "Arrow-and-Crossbow-Projectiles" pack (Sam, 2026-10-15). It ships
8 headings x (animated WebP + 2048 PNG atlas) per shot. Only the E heading is
needed: the pixel map (scripts/velkynvelve-walk/template.html, drawShaftArt)
rotates it to the shot's own angle, so one heading covers every direction.

Each 512px frame is mostly empty, so the frames are cropped to the union of
the drawn shot across all 16 frames (same crop for every frame, so the small
in-place jiggle the art carries survives) and packed 4x4.

    python3 -I scripts/vfx/bake_projectile_atlas.py <unzipped pack dir>

Writes public/vfx/projectiles/{arrow,crossbow-bolt}.webp and prints the crop
sizes that the walk's SHAFT_ART table carries.
"""
import sys
from pathlib import Path
from PIL import Image, ImageSequence

PAD = 4
COLS = ROWS = 4
OUT = Path(__file__).resolve().parents[2] / "public" / "vfx" / "projectiles"


def bake(src: Path, name: str) -> None:
    frames = [f.convert("RGBA") for f in ImageSequence.Iterator(Image.open(src / name / f"{name}-E.webp"))]
    assert len(frames) == COLS * ROWS, f"{name}: {len(frames)} frames"
    box = None
    for f in frames:
        b = f.split()[3].point(lambda v: 255 if v > 8 else 0).getbbox()
        box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    x0, y0, x1, y1 = box[0] - PAD, box[1] - PAD, box[2] + PAD, box[3] + PAD
    # Keep the frame's own centre line as the quad's centre line, so the shaft
    # sits on the flight path rather than above or below it.
    half = max(256 - y0, y1 - 256)
    y0, y1 = 256 - half, 256 + half
    w, h = x1 - x0, y1 - y0
    atlas = Image.new("RGBA", (w * COLS, h * ROWS), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        atlas.paste(f.crop((x0, y0, x1, y1)), ((i % COLS) * w, (i // COLS) * h))
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / f"{name}.webp"
    atlas.save(out, "WEBP", quality=88, method=6)
    # Drawn length, head to nock, for the world-size table.
    print(f"{name}: cell {w}x{h}, drawn length {box[2] - box[0]}px, {out.stat().st_size} bytes")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    for n in ("arrow", "crossbow-bolt"):
        bake(src, n)
