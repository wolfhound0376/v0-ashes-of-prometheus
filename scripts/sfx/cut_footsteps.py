#!/usr/bin/env python3
"""
Cut single footfalls out of footstep recordings, one set per surface, for the painted map's walking sounds.

    python scripts/sfx/cut_footsteps.py

Sam, 2026-10-25: "walking in the game should have a very subtle sounds and a little louder for heavier creatures",
then "footsteps sound different depending where you are at." The map plays one footfall per stride of the walk
animation, picking from the set for the ground under the walker, so it needs single steps rather than a loop.

SOURCES, per surface:
  stone    the bank's footsteps_wet_stone.ogg     (vtt-assets/sfx/movement/)
  gravel   the bank's footsteps_gravel.ogg        (dirt, gravel, bone-strewn floors)
  water    the bank's footsteps_water.ogg         (wading, wet shore)
  bridge   the bank's rope_bridge.ogg             (rope bridges and rope walkways)
  wood     scripts/sfx/sources/footsteps-wood.mp3     generated 2026-10-25 (Runway sound effects): plank floors
  moss     scripts/sfx/sources/footsteps-moss.mp3     generated 2026-10-25: the fungus grove
  crystal  scripts/sfx/sources/footsteps-crystal.mp3  generated 2026-10-25: the crystal cave

HOW A CLIP IS CHOSEN. Onsets are found where energy rises sharply out of a quieter floor. Each is cut from just
before its onset to ~180 ms after, the tail faded, and the set levelled to the same peak. The four CLEANEST per
recording are kept: ranked by how loud the clip still is after its first 60 ms against its peak, so a clip that
catches a second footfall (a bump in the tail) loses. Ranking by distance to the neighbouring onset, the first
attempt, still let two gravel clips carry a second step -- found by drawing each clip's loudness over time.

Writes public/sfx/walk/step-<surface>-1..4.mp3 (mono, 64 kbps). They are levelled, not quiet: the map's gain per
creature weight and per surface is the only volume knob.
"""
import os, subprocess, tempfile, urllib.request
import numpy as np

BANK = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/sfx/movement/"
HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = {
    "stone": BANK + "footsteps_wet_stone.ogg",
    "gravel": BANK + "footsteps_gravel.ogg",
    "water": BANK + "footsteps_water.ogg",
    "bridge": BANK + "rope_bridge.ogg",
    "wood": os.path.join(HERE, "sources", "footsteps-wood.mp3"),
    "moss": os.path.join(HERE, "sources", "footsteps-moss.mp3"),
    "crystal": os.path.join(HERE, "sources", "footsteps-crystal.mp3"),
}
PER_SOURCE, SR, PRE, LEN = 4, 44100, 0.012, 0.18
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "public", "sfx", "walk")


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onsets(x):
    hop = 256
    env = np.sqrt(np.convolve(x * x, np.ones(hop) / hop, mode="same"))[::hop]
    floor = np.convolve(env, np.ones(40) / 40, mode="same")
    rise = np.diff(env, prepend=env[0])
    cand = np.where((env > floor * 1.8) & (rise > env.max() * 0.04))[0]
    picks, last = [], -1e9
    for c in cand:
        if c - last > int(0.18 * SR / hop):
            picks.append(c * hop); last = c
    return picks


def tail_ratio(x, at):
    a, b = max(0, at - int(PRE * SR)), min(len(x), at + int(LEN * SR))
    c, f = x[a:b], int(0.01 * SR)
    e = np.array([np.sqrt((c[i:i + f] ** 2).mean()) for i in range(0, len(c) - f, f)])
    if not len(e) or e.max() <= 0:
        return 9.0
    pk = int(e.argmax())
    if pk > 3:                                   # the loudest moment must be the onset itself
        return 9.0
    return float(e[pk + 6:].max() / e.max()) if len(e) > pk + 6 else 9.0


def main():
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as d:
        for surface, src in SOURCES.items():
            p = src
            if src.startswith("http"):
                p = os.path.join(d, surface + os.path.splitext(src)[1])
                urllib.request.urlretrieve(src, p)
            x = decode(p)
            best = sorted(onsets(x), key=lambda at: tail_ratio(x, at))[:PER_SOURCE]
            for n, s in enumerate(sorted(best), 1):
                a, b = max(0, s - int(PRE * SR)), min(len(x), s + int(LEN * SR))
                clip = x[a:b].copy()
                fade = int(0.09 * SR)
                clip[-fade:] *= np.linspace(1, 0, fade) ** 2
                clip *= 0.7 / max(1e-6, np.abs(clip).max())
                wav = os.path.join(d, f"{surface}{n}.wav")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", wav],
                               input=clip.astype(np.float32).tobytes(), check=True)
                dst = os.path.join(OUT, f"step-{surface}-{n}.mp3")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-b:a", "64k", dst], check=True)
                print(f"step-{surface}-{n}.mp3  at {s / SR:.2f}s  tail {tail_ratio(x, s):.2f}")


if __name__ == "__main__":
    main()
