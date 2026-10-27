# Toll the Dead: the lantern (Sam, 2026-10-26)

What the map draws (scripts/velkynvelve-walk/template.html, `tollCast` / `drawTolls`):

| Sheet (public/vfx) | Made by | What |
|---|---|---|
| pxTollLantern.webp | draw_toll.py + build_lantern_painted.py | the 96px pixel lantern at 5x, Sam's painted skeleton behind the glass (hooded when dormant, glowing when awake), Sam's painted sphere (pack lantern image 3) bursting on the toll |
| tollStream0-2.webp | sim_toll_unified.py | one 2D gas simulation (stable fluids): victim -> twisting stream along the old pixel-wisps path -> lantern glass, three of Sam's painted souls riding in it. Emerald palette pushed from the tones of Sam's Archvillain "Dark Subclasses" reference. 108 frames at 24 fps, lantern pixels cut out (the map draws the lantern itself) |
| tollRings.webp | the pack's target-fumes strip | Sam's painted rings on the victim: pack images 4 and 5 breathing into each other, then 8 as it breaks up |

Sounds (public/sfx/walk): toll-bell (0.6 s), toll-extract (1.0 s), toll-absorb (each soul arriving), toll-tail (3.9 s).
Runway sound effects, loudness-matched.

Rebuild:
    python3 draw_toll.py                                     # pixel lantern frames -> out/lantern
    python3 build_lantern_painted.py <pack_dir> <out_dir>    # + Sam's painted skeleton and sphere
    python3 sim_toll_unified.py <pack_dir> out/lantern <out_dir>   # the 4K master; the stream sheets are its frames at 1020x340
<pack_dir> is Sam's Toll-the-Dead-Modular-Pack (lantern.png, target-fumes.png, traveling-soul.png); not committed.
The live tuner Sam signed off on: https://claude.ai/artifact/DXccq4vjB4JQHKH4pDWiJC
