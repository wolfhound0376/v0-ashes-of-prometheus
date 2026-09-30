# Alchemy: absolute failure

Sam supplied the animation on 2026-09-30: an alchemist's bench, a green brew, the glow building, the flask going up. This is what fires it.

Rules: `claude/claude_Alchemy_Minigame.md`. Grid: `claude_Alchemy_Grid.md`.

---

## The asset

| | |
|---|---|
| File | `vtt-assets/cinematics/Alchemy_CriticalFailure.mp4` |
| Source | Sam, 2026-09-30 |
| Format | 1920×1080, h264 + aac, 24 fps, 120 frames, **5.00 s** |
| Size | 5.6 MB — in range with the existing clips (5.9–25.7 MB) |

Two things were done to it before upload, both measured rather than assumed:

**Renamed** to `Alchemy_CriticalFailure.mp4`, matching the bucket's existing `Velkynvelve_Fifi_StealthFail.mp4` convention.

**Remuxed with `-movflags +faststart`** (stream copy, no re-encode, no quality loss). The original had `moov` *after* `mdat`, meaning a player had to download all 5.6 MB before showing frame one — a stutter immediately before the most dramatic beat in the system. `moov` now sits at byte 36.

### What the clip actually does

Measured, because it decides how the UI should cut around it:

| | mean luma | audio peak |
|---|---|---|
| 0–1 s | 63.5 | 1,398 |
| 1–2 s | 69.8 | 2,577 |
| 2–3 s | 75.9 | 10,060 |
| 3–4 s | 106.3 | 12,399 |
| 4–5 s | **189.3** | **16,840** |

Picture and sound climb together — this needs no sound design, and it should not be muted.

**It ends at its brightest frame (233 of 255) and does not resolve.** The clip stops mid-blast. That is a gift, not a defect: it wants a **hard cut** back to the bench, not a fade. Fading out a whiteout throws away the only edit the footage is asking for.

## What counts as absolute failure

**This is not impurity 3.** The spec's load-bearing rule is that *impurity never stops the potion working* — a corrupt healing potion still heals, it just also leaves you reeking in a slave pen. That rule has to survive, or impurity stops being a cost and becomes a punishment.

So absolute failure is the separate, rarer thing:

> **A natural 1 on the brewing check.**

| | Impurity 3 (Corruption) | Absolute failure (nat 1) |
|---|---|---|
| Do you get a potion? | Yes, and it works | **No. Nothing.** |
| Ingredients | consumed | consumed |
| Does it hurt? | a condition until cleared | **yes, immediately** |
| How often | common while untrained | 5% of brews, always |
| Cinematic | none | this one |

**Proposed consequences**, homebrew and Sam's to overrule:

- The brew is destroyed. No potion, no partial, no salvage — the only outcome in the whole system that gives you nothing.
- The vessel is destroyed. If it was a rune-sealed vessel, **the rune is spent too** — which is what makes a nat 1 hurt a caster as well as a brewer.
- Everyone within 5 ft: DC 13 Dexterity save or 2d6 fire damage, half on a success.
- The brewer has disadvantage on their next brewing check this rest. Once you've blown up the bench, you're rattled.

A nat 1 is not modified by proficiency, so **this is the one part of alchemy Fifi's Alchemist's Supplies proficiency cannot protect her from.** That is the right shape: skill lowers impurity, and skill never makes you immune to catastrophe.

## Wiring

Registered in `cinematic_clips` (id `8d80491d-e63e-490d-bd41-d47a69fab62b`):

| column | value |
|---|---|
| `scene_key` | `generic` |
| `location` | `generic` |
| `state` | `alchemy-critical-failure` |
| `scope` | `solo` — it happens to the brewer |
| `kind` | `action` |
| `weight` | 1 |

`generic` rather than a Velkynvelve location, because alchemy happens at camp wherever camp is. It follows the existing `generic` / `sneak-heard-alone` row.

**The row is staged, not live.** It points at a file that has to be uploaded to the bucket by hand. Nothing requests this state yet, so a staged row cannot resolve into a broken player.

### What is still owed

1. **Upload the file** to `vtt-assets/cinematics/`.
2. **Brewing does not exist.** Only Eat It And See is built (`lib/eat-it-and-see.ts`, `/api/alchemy/taste`). Nothing can roll a brewing check, so nothing can roll a 1, so nothing can fire this. The asset is ahead of the mechanic — worth saying plainly rather than letting it look wired.
3. When brewing lands, it emits `[CINEMATIC: alchemy-critical-failure]` and the existing resolver does the rest. **The cue vocabulary is closed** — `app/api/chat/route.ts` whitelists cues from `cinematic_clips` at the party's location and discards anything else, so this row existing is what makes the cue legal.

## Sourced vs homebrew

**SOURCED:** natural 1 as an automatic failure, the Dexterity save, fire damage, disadvantage (SRD).

**HOMEBREW — all invented here and all Sam's to overrule:** nat 1 as the absolute-failure trigger, the destroyed vessel, the spent rune, DC 13, 2d6, the 5-ft radius, and the disadvantage rider.
