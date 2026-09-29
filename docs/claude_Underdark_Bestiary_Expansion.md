# Underdark Bestiary Expansion — build order & wiring plan

**Date:** 2026-09-26 · **Author:** Claude (session with Sam)
**Files:** `supabase/migrations/20260926204556_add_bestiary_habitat_sprite_columns.sql` (schema, record only) · `underdark_bestiary_inserts.sql` (36 rows, data — not kept in the repo)

## As built (checked against the live DB, 2026-09-29)

The plan below was written as "drafted, SQL not yet run". It has since run, and gone further:

- **Schema:** applied 2026-09-26 as migration `20260926204556`. The file in `supabase/migrations/` is copied verbatim from `schema_migrations`.
- **Rows:** `bestiary` holds 123 rows. Every creature in §0 is in, plus the OotA random-table monsters §5 said were out of scope (carrion crawler, chuul, giant fire beetle, grick, ochre jelly, grell, piercer, umber hulk, orog), gas spore and the ancient deep dragon.
- **Sprites:** every row in the §2 build order is `wired` (live `model_url`) except `grick`, which is `generated`.
- **Necromancer** is no longer a placeholder: filled from Volo's p. 217 (Sam's photo), CR 9.
- **Still `needs_stats` (12):** ancient-deep-dragon, beholder, carrion-crawler, death-knight, deep-rothe, gas-spore, grell, intellect-devourer, piercer, poltergeist, troglodyte, umber-hulk. None of these blocks is in SRD 5.1 or any ingested book (`campaign_chunks` searched 2026-09-29), so none can be filled without a page from Sam.
- **The "never reaches the board" rule is now enforced in code**, not just by the flag: `lib/bestiary-stats.ts` `hasPlayableStats()`. The sandbox hides and refuses placeholder rows; `/api/chat` `resolveNpcStats` falls through to its flagged-improvised tier instead of presenting blank stats as bestiary canon. Before this, the sandbox would spawn a hit-point-less beholder that combat then gave AC 10.

To field a placeholder: fill its stats from the book, set `source`, and flip `stats_status` to `sourced`. It appears in the sandbox on the next open.

---

## 0. What this is

Sam's list of new Underdark threats, mapped to real 5E stat blocks, staged for `bestiary`, and ordered for PixelLab sprite creation and board wiring. Every number in the insert file was transcribed from the SRD 5.1 chunks already in `campaign_chunks`. Nothing was invented. Where no ingested book has the block, the row exists with **every stat NULL** and `stats_status = 'needs_stats'` — it must never reach the board until Sam fills it from Roll20.

### Sam's list → what it became

| Sam said | Row(s) | Source | Note |
|---|---|---|---|
| Vampires (lesser/greater) | `vampire-spawn` (CR 5), `vampire` (CR 13) | SRD | Underdark has no sun — Sunlight Hypersensitivity never fires below ground. Design consequence, not a bug. |
| Intellect devourer | `intellect-devourer` | **NEEDS STATS** | MM only. |
| Goblinoid | `goblin`, `hobgoblin`, `bugbear` | SRD | Three sprites. |
| Roper | `roper` (CR 5) | SRD | |
| Troglodyte | `troglodyte` | **NEEDS STATS** | Named in OotA (Skriss) but no block ingested. |
| Elementals fire/water | `fire-elemental`, `water-elemental` (CR 5) | SRD | |
| Bats | `swarm-of-bats`, `giant-bat` | SRD | Plain bat (CR 0) skipped — not worth a token. |
| Rabid rats | `diseased-giant-rat` | SRD variant | Same sprite as `giant-rat`, tinted. |
| Rothé | `deep-rothe` | **NEEDS STATS** | OotA Expanded p.269 has one but the OCR is garbage. |
| Brigands/thieves | `bandit`, `thug`, `bandit-captain` | SRD | Reskin as escaped slaves / Mantol-Derith cutpurses. |
| Necromancers | `necromancer` (+ `mage` as chassis) | ~~NEEDS STATS~~ Volo's p.217 / SRD | Filled since — see "As built". |
| Phase spider | `phase-spider` (CR 3) | SRD | Needs a fade state on the board. |
| Beholders | `beholder` | **NEEDS STATS** | Product identity, never SRD. |
| Shriekers | `shrieker` (CR 0) | SRD | Already on the OotA Fungi sub-table. Alarm, not a fight. |
| Dryder | `drider` (CR 6) | SRD | Spelling corrected. |
| Ghouls | `ghoul`, `ghast` | SRD | Ghast = ghoul recolour. Drow are immune to ghoul paralysis (elves). |
| Necroknight | `wight` (CR 3) now; `death-knight` later | SRD / **NEEDS STATS** | Wight is the honest low-tier version. |
| Poltergeist | `poltergeist` (+ `specter` as base) | **NEEDS STATS** / SRD | |
| Occultist | `cultist`, `cult-fanatic` | SRD | Fanatic is also the low-tier "warlock" NPC. |
| Succubus | `succubus` (CR 4) | SRD | Two sprites: fiend form + disguise. |
| Attractive females (witches/warlocks) | `green-hag` (CR 3), `night-hag` (CR 5) | SRD | Illusory Appearance / Change Shape are the canon mechanic. |

## 1. Schema change

`bestiary` gains: `habitat text[]`, `encounter_rarity`, `sprite_priority`, `sprite_size`, `sprite_status`, `stats_status`, `pixellab_character_id`. All additive; no drops; existing rows backfilled (`model_url` set → `wired`, portrait only → `generated`, Homebrew source → `homebrew`). One index on `(sprite_status, sprite_priority)`.

The sprite queue is a query, not a doc:

```sql
select sprite_priority, name, slug, cr, encounter_rarity, sprite_size, sprite_status
from bestiary
where sprite_status in ('queued','needs_stats') or sprite_status like 'reuse:%'
order by sprite_priority;
```

## 2. Build order

Priority = **rarity first**, then **CR ascending inside a rarity band**, then **region proximity to the current arc** (Velkynvelve → wilds → Darklake).

- **Tier 1 — common, low CR:** giant rat (+ diseased tint), swarm of rats, swarm of bats, giant bat, shrieker, goblin, bandit, thug, cultist.
- **Tier 2 — uncommon, CR 1–3:** ghoul, hobgoblin, bugbear, bandit captain, cult fanatic, ghast (reuse:ghoul), specter, wight, phase spider, green hag (needs a disguised 2nd sprite), troglodyte (needs_stats), deep rothé (needs_stats).
- **Tier 3 — rare, CR 4–6:** roper, vampire spawn, drider, succubus (2 sprites), night hag, water elemental, fire elemental, mage, intellect devourer (needs_stats), necromancer, poltergeist (needs_stats).
- **Tier 4 — very rare:** vampire (CR 13, legendary), death knight (needs_stats), beholder (needs_stats, 192 px).

## 3. PixelLab conventions

- Canvas: 128 for Small/Medium, 160 for Large, 192 for Huge. 8-direction.
- Tags: `Monster` + creature type + one distinguishing tag.
- Style anchor is Fifi; every monster is style-transferred from her per the HD-2D pivot.
- Recolours (`reuse:<slug>`) are done on the exported sheet, not regenerated.
- Write the PixelLab character id to `bestiary.pixellab_character_id` on generation and flip `sprite_status` → `generated`; flip to `wired` only when `model_url` points at a live `/sprites/<slug>/sprite.json`.

## 4. Wiring abilities (Layer 1 / board) — each a separate PR

1. **Swarm rules** (bats, rats): half-damage below half HP; occupies another creature's square.
2. **Incorporeal movement** (specter, poltergeist): through walls/tokens as difficult terrain.
3. **Ethereal Jaunt / Etherealness** (phase spider, succubus, night hag): hidden-token state.
4. **Reel / forced movement** (roper, water elemental Whelm).
5. **HP-max reduction** (vampire, spawn, wight, specter, succubus): mutable per combat, restored on long rest.
6. **Paralysis on failed save** (ghoul/ghast): verify "hits within 5 ft are crits".
7. **Legendary actions + Legendary Resistance** (vampire only). Deliberately last.
8. **Disguise / Illusory Appearance** (hags, succubus): `bestiary.alt_sprite_url` when needed, not before.
9. **Shriek as an alarm**: roll `underdark_creature` from `encounter_tables` via the camp watch hook.

Not checked against the code as of 2026-09-29.

## 5. Malachar

The DM reads `bestiary` at runtime, so sourced rows need no prompt edit. `needs_stats` rows are kept out of his stat lookup in code (see "As built").
