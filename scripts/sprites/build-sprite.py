#!/usr/bin/env python3
"""
Turn a PixelLab character into a battle-board sprite.

    python scripts/sprites/build-sprite.py <pixellab-character-id> <slug> --name "Display Name"
    python scripts/sprites/build-sprite.py path/to/download.zip <slug>

Writes public/sprites/<slug>/:
    sprite.json   the manifest the board reads (lib/sprite-token.ts)
    <state>.png   one sheet per animation: 8 rows (directions), one column per frame

Point a token at it by setting vtt_tokens.model_url (or bestiary.model_url) to
    /sprites/<slug>/sprite.json

Needs Pillow:  pip install pillow
The character id form downloads from api.pixellab.ai, which only answers once
every animation on the character has finished generating (HTTP 423 before).
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

# Row order of every sheet. Must match SPRITE_DIRECTIONS in lib/sprite-token.ts.
DIRECTIONS = ["south", "south-east", "east", "north-east", "north", "north-west", "west", "south-west"]

# PixelLab animation names (our own display names first, then its template ids)
# to the board's states. First match wins.
STATE_PATTERNS = [
    ("idle", r"^idle$|breathing-idle|fight-stance-idle"),
    ("walk", r"^walk$|^walk(ing)?(-\d+)?(-\d+-frames)?$|crouched-walking|scary-walk|sad-walk"),
    ("attack", r"^attack$|slash|swing|cross-punch|lead-jab|punch$|kick"),
    ("cast", r"^cast$|fireball|spell"),
    ("hurt", r"^hurt$|taking-punch|hit"),
    ("dodge", r"^dodge$|dodg|evade|sidestep"),
    ("dead", r"^dead$|death"),
]

# How each state plays. fps is the pixel artist's rate, not the screen's;
# hit is the fraction of the animation where the blow lands.
PLAYBACK = {
    "idle": {"fps": 5, "loop": True},
    "walk": {"fps": 10, "loop": True},
    "attack": {"fps": 12, "loop": False, "hit": 0.75},
    "cast": {"fps": 10, "loop": False, "hit": 0.6},
    "hurt": {"fps": 10, "loop": False},
    "dodge": {"fps": 12, "loop": False},
    "dead": {"fps": 8, "loop": False},
}


def state_for(name: str) -> str | None:
    key = name.lower()
    for state, pat in STATE_PATTERNS:
        if re.search(pat, key):
            return state
    return None


def open_zip(source: str) -> zipfile.ZipFile:
    if Path(source).is_file():
        return zipfile.ZipFile(source)
    url = f"https://api.pixellab.ai/mcp/characters/{source}/download"
    try:
        with urllib.request.urlopen(url) as r:
            return zipfile.ZipFile(io.BytesIO(r.read()))
    except urllib.error.HTTPError as e:
        if e.code == 423:
            sys.exit("PixelLab is still generating animations for this character - try again in a few minutes.")
        raise


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="PixelLab character id, or a downloaded .zip")
    ap.add_argument("slug", help="folder name under public/sprites, e.g. freia")
    ap.add_argument("--name", help="display name (defaults to the slug)")
    ap.add_argument("--ppu", type=int, default=100, help="pixels per board square (default 100: a 128px figure is ~1.2 squares tall, about 6 ft; use 200 for a Small creature such as a halfling, about 3 ft)")
    ap.add_argument("--out", help="output folder (default public/sprites/<slug>)")
    ap.add_argument(
        "--shift-facings", type=int, default=0,
        help="relabel every direction this many steps anticlockwise. PixelLab's v3 reference "
        "rotation files a 3/4-turned reference one step off (the front view saved as "
        "'south-east'); --shift-facings 1 puts each picture back under the facing it shows",
    )
    ap.add_argument(
        "--use", action="append", default=[], metavar="STATE=ANIMATION",
        help="build STATE from the named PixelLab animation, e.g. --use walk=walk-steady, when "
        "a character carries more than one animation for it (an old one kept for comparison). "
        "Without it the first animation matching the state wins",
    )
    args = ap.parse_args()
    chosen = dict(u.split("=", 1) for u in args.use)

    repo = Path(__file__).resolve().parents[2]
    out = Path(args.out) if args.out else repo / "public" / "sprites" / args.slug
    out.mkdir(parents=True, exist_ok=True)

    z = open_zip(args.source)
    meta = json.loads(z.read("metadata.json"))
    state_meta = meta["states"][0]
    frames = state_meta["frames"]
    load = lambda p: Image.open(io.BytesIO(z.read(p))).convert("RGBA")

    def facing(d: str) -> str:
        if not args.shift_facings or d not in DIRECTIONS:
            return d
        return DIRECTIONS[(DIRECTIONS.index(d) - args.shift_facings) % len(DIRECTIONS)]

    rotations = {facing(d): load(p) for d, p in frames.get("rotations", {}).items()}
    cw, ch = next(iter(rotations.values())).size

    # Gather each state's frames per direction.
    found: dict[str, dict[str, list[Image.Image]]] = {}
    for anim_name, dirs in frames.get("animations", {}).items():
        state = next((st for st, name in chosen.items() if name == anim_name), None) or state_for(anim_name)
        if state in chosen and chosen[state] != anim_name:
            print(f"  skipping animation '{anim_name}' ('{state}' comes from '{chosen[state]}')")
            continue
        if not state:
            print(f"  skipping animation '{anim_name}' (no board state for it)")
            continue
        if state in found:
            print(f"  skipping animation '{anim_name}' ('{state}' already taken)")
            continue
        found[state] = {facing(d): [load(p) for p in paths] for d, paths in dirs.items()}
    if "idle" not in found and rotations:
        # No breathing drawn: stand still on the rotation images.
        found["idle"] = {d: [im] for d, im in rotations.items()}

    manifest = {
        "version": 1,
        "name": args.name or args.slug,
        "cell": [cw, ch],
        # Feet: horizontal centre, two pixels above the bottom of the canvas.
        # PixelLab stands every figure on the same line of its canvas.
        "pivot": [cw // 2, ch - 2],
        "ppu": args.ppu,
        "animations": {},
    }

    for state, by_dir in found.items():
        n = max(len(v) for v in by_dir.values())
        sheet = Image.new("RGBA", (cw * n, ch * len(DIRECTIONS)), (0, 0, 0, 0))
        for row, d in enumerate(DIRECTIONS):
            seq = by_dir.get(d)
            if not seq:
                # A direction that was never animated holds its still pose, so
                # the figure never vanishes when it turns that way.
                still = rotations.get(d)
                seq = [still] if still else []
                print(f"  {state}: no '{d}' frames, using the still rotation")
            for col in range(n):
                if not seq:
                    break
                im = seq[min(col, len(seq) - 1)]
                if im.size != (cw, ch):
                    # PixelLab grows an animation's canvas evenly on every side
                    # (a 128 px figure animated on 192 px sits 32 px in from each
                    # edge), so cut the centre back out. Pinning the grown frame
                    # to a corner instead would shift the figure off its feet.
                    x = (im.width - cw) // 2
                    y = (im.height - ch) // 2
                    if x >= 0 and y >= 0:
                        im = im.crop((x, y, x + cw, y + ch))
                    else:
                        cell = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
                        cell.alpha_composite(im, (max(0, -x), max(0, -y)))
                        im = cell
                sheet.alpha_composite(im, (col * cw, row * ch))
        name = f"{state}.png"
        sheet.save(out / name, optimize=True)
        manifest["animations"][state] = {"sheet": name, "frames": n, **PLAYBACK[state]}
        print(f"  {state}: {n} frames -> {name}")

    (out / "sprite.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"wrote {out / 'sprite.json'}")
    print(f"token model_url: /sprites/{args.slug}/sprite.json")


if __name__ == "__main__":
    main()
