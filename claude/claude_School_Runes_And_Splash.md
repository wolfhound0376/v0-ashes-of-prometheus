# Spell School Runes & Area Splash

Canon doc for the school-colour/motion system and the area-splash effect.
Status: PR open, awaiting Sam's approval of the eight colours and motions.
The colours and motions are HOMEBREW and Sam's call; the eight schools are SRD 5.1.

---

Two things you asked for on 28 Sep: **runes around the casting arm that carry the school of magic**, and **explosive splash that lands on the targets**.

Preview of all eight schools, drawn from this branch's real code and your own rune art: https://claude.ai/artifact/EjBrokXFewnBFWQZZ9sNQ1

---

## 1. The rune was one disc

`lib/spell-school.ts` already picked the right rune *sheet* per school. The kit then drew it as a single 1.1×1.1 quad on the palm, tinted white, turning at 1.5 rad/s — **the same performance for all eight schools**. The glyph art differed; nothing else did. At board distance you could not tell an abjuration from a necromancy without pausing.

Now: five to seven small glyphs orbiting the caster's **forearm**, in the school's own colour, moving in the school's own way.

The ring's axis is the forearm, taken from the hand bone to its parent in the skeleton. That's why `RuneRing` takes a bone and not a position — a position gives you a point and no direction, and a ring needs an axis or it's a disc again. It also means the follow-through *throws* the ring, where the old disc just slid.

| School | Colour | Motion | Reads as |
|---|---|---|---|
| Evocation | `#FF4A12` | accelerating spin, flares white | power winding up |
| Transmutation | `#FFD24A` | glyphs **step** into each other's slots | one thing becoming another |
| Necromancy | `#9FCF3A` | ring sinks down the arm, glyphs inverted, guttering | something guttering |
| Conjuration | `#22D3A0` | glyphs arrive one at a time, ring opens | something arriving |
| Abjuration | `#4EA8FF` | two counter-rotating rings contract and lock | a barrier closing |
| Illusion | `#B37DFF` | every glyph has a drifting twin that flickers | not quite there |
| Enchantment | `#FF6FB5` | slow hypnotic sway, glyphs breathing out of phase | a slow persuasion |
| Divination | `#E8F2FF` | **does not turn at all**; glyphs light in sequence | a thing being read |

**Colour and motion, not just colour.** Colour alone fails twice — for ~8% of men with red-green deficiency, and in peripheral vision, which is where you actually are while reading the damage number. Motion survives both, so either one alone names the school.

**This is homebrew and it's your call.** The eight schools are SRD 5.1. The colours, glyph counts and motions are invented for this board; 5e assigns no colour to any school.

Spells with no known school — a monster's innate ability, a homebrew, a typo — keep the flat white disc exactly as before. Nothing that looked right changes.

## 2. The blast never touched anyone

An area cast already did three of four things right: bloomed at the aim point, laid the floor decal, and in `flinch()` applied hit points and reactions to everyone in the shape. It drew **nothing on any of them**. A Fireball in four drow was one bloom in the middle and four damage numbers with no visible connection.

Each body now takes the type's own impact art, **timed by when the front actually reaches its square** (`lib/splash-timing`), so the blast expands instead of going off as four simultaneous poofs. Because the board already passes the caster's own square as `centre` for a self-centred shape, a cone's front correctly runs outward *along the cone*.

A body that **made its save** takes a smaller, cooler, sparkless flare — the blast reached them and they turned it. That's a different picture from a full hit and from a miss alike. A body that saved for zero damage still splashes: drawing nothing would say the shape missed them, which is a lie about the roll.

Explosive types (fire, thunder, lightning, force, radiant) stagger. Clouds and rimes (poison, acid, cold, fog…) have no front to travel and draw together — correct and cheaper.

One handle for the whole shape, not one effect per victim: the sheet loads once and there's a single spark pool, so a Fireball in eight bodies costs one quad each rather than eight full cast effects.

## What the tests caught

All four were fixed in the code, not in the assertion:

- **conjuration and necromancy were two greens 16° apart.** Repaletted so the seven coloured schools sit ≥30° apart on the hue wheel, divination deliberately achromatic.
- **abjuration's counter-rotation made the glyphs pair up.** Alternating direction glyph-by-glyph in one ring means neighbours converge — it spent 42% of the charge looking like three clumps of two. Now two concentric counter-rotating rings, which can't collide and is the better picture of a ward anyway.
- **necromancy's gutter could sit at its trough exactly on the release frame**, firing the spell off an invisible ring. Floor raised from 0.44 to 0.60; it still gutters over a 0.40 range.
- **splash falloff divided by the furthest distance rather than by the spread**, so a ring of equidistant victims all drew as edge hits and none as a full one.

Two assertions were themselves wrong and were corrected: enchantment *should* sit off its slots (that's the sway), and abjuration's rings *should* cross (different radii, so it isn't a collision).

## Not addressed here

- The **two AoE floor-decal systems** on main are still unreconciled. This adds nothing to that argument — splash draws on bodies, never on the floor.
- The **five unPR'd impact sheets** are still unPR'd. Splash reuses whatever sheet the type already resolves to, so it gains automatically when they land.
- Rune art is unchanged: these are your existing eight `rune*.webp` sheets, re-coloured and re-choreographed. No new art needed.

## Checks

- **57 new tests** (35 for the school motions, 22 for splash timing). Full suite **418 passing across 22 files**.
- `tsc --noEmit` shows the **same 14 errors as main** — verified by stashing, re-running on main, and diffing with line numbers stripped. Zero new.
- Collision check run before editing. `feat/martial-arts-strikes` also touches `spell-vfx-kit.ts` but is already merged (PR #541, this branch's base). **`feat/loot-ceremony` is live on `combat-board-3d.tsx`** — this branch's hunk there is one insertion inside `flinch()`, well away from the loot work, but it's the one file to watch on merge.
