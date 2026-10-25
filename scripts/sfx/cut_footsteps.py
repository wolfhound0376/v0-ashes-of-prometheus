#!/usr/bin/env python3
"""
Cut single footfalls out of the sound bank's footstep recordings, for the painted map's walking sounds.

    python scripts/sfx/cut_footsteps.py

Sam, 2026-10-25: "walking in the game should have a very subtle sounds and a little louder for heavier creatures."
The bank (vtt-assets/sfx/movement/) has footsteps_wet_stone.ogg and footsteps_gravel.ogg, each ~6 s of someone walking.
The map plays one footfall per stride of the walk animation, so it needs single steps, not a loop: this finds the
onsets (energy rising sharply out of a quieter floor), cuts each from just before its onset to ~180 ms after, fades
the tail, levels them all to the same peak, and keeps the four CLEANEST from each recording: ranked by how loud the
clip still is after its first 60 ms against its peak, so a clip that catches a second footfall (a bump in the tail)
loses. The first pass ranked by distance to the neighbouring onset, and two of the eight gravel clips still carried a
second step -- measured by drawing each clip's loudness over time, not by ear.

Writes public/sfx/walk/step-1.mp3 .. step-8.mp3 (mono, 64 kbps). The map sets the loudness per creature; these are
levelled, not quiet, so the map's gain is the only volume knob.
"""
import os, subprocess, tempfile, urllib.request
import numpy as np

BANK = "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/sfx/movement/"
SOURCES = ["footsteps_wet_stone.ogg", "footsteps_gravel.ogg"]
PER_SOURCE, SR, PRE, LEN = 4, 44100, 0.012, 0.18
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
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


def main():
    os.makedirs(OUT, exist_ok=True)
    n = 0
    with tempfile.TemporaryDirectory() as d:
        for name in SOURCES:
            p = os.path.join(d, name)
            urllib.request.urlretrieve(BANK + name, p)
            x = decode(p)
            on = onsets(x)
            def tail_ratio(on_at):
                a, b = max(0, on_at - int(PRE * SR)), min(len(x), on_at + int(LEN * SR))
                c, f = x[a:b], int(0.01 * SR)
                e = np.array([np.sqrt((c[i:i + f] ** 2).mean()) for i in range(0, len(c) - f, f)])
                if not len(e) or e.max() <= 0: return 9.0
                pk = int(e.argmax())
                if pk > 3: return 9.0                                   # the loudest moment must be the onset itself
                return float(e[pk + 6:].max() / e.max()) if len(e) > pk + 6 else 9.0
            best = sorted(on, key=tail_ratio)[:PER_SOURCE]
            for s in sorted(best):
                a, b = max(0, s - int(PRE * SR)), min(len(x), s + int(LEN * SR))
                clip = x[a:b].copy()
                fade = int(0.09 * SR)
                clip[-fade:] *= np.linspace(1, 0, fade) ** 2
                clip *= 0.7 / max(1e-6, np.abs(clip).max())
                n += 1
                wav = os.path.join(d, f"s{n}.wav")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", wav],
                               input=clip.astype(np.float32).tobytes(), check=True)
                dst = os.path.join(OUT, f"step-{n}.mp3")
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-ac", "1", "-b:a", "64k", dst], check=True)
                print(f"step-{n}.mp3  from {name} at {s / SR:.2f}s  {os.path.getsize(dst)} B")
    print("clips:", n)


if __name__ == "__main__":
    main()
