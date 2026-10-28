# Emberforged Inventory — design of record (2026-10-27)

**What it is.** The Underwalk's inventory (`I` key, `scripts/velkynvelve-walk/template.html` → built `public/velkynvelve-walk/index.html`) restyled to Sam's approved Emberforged concept, from his handoff pack (`Emberforged_Claude_Handoff.zip`: `CLAUDE_START_HERE.md`, `DESIGN_SPEC.md`, `tokens.css`, the ruined-castle backdrop, the 1586×992 reference). The pack's own rules were followed: the reference is the visual target, not inspiration; real sprites and real item art, never the flattened concept's reinterpretations; every number live; no power score, stars or equipment levels; no new rules edition inferred.

**Where it came from.** Sam asked (2026-10-27) to elevate Kenta's inventory toward Top Heroes' hero screen without abandoning the paper doll. Three concepts went on a canvas (A Reliquary / B Hero Hall / C Hall of Ashes, https://claude.ai/artifact/54D5Ewe8k1WRsJonxTvt1o); Sam took concept A out to an image tool and came back with "01 · Emberforged" (the pack) and "03 · Arcane Reliquary" (the same layout, violet accents, inline Inspect/Equip). The build is Emberforged; Arcane Reliquary is a `--ef-*` token swap plus a backdrop if Sam prefers it.

## Decisions (built in PR 1, branch `feat/emberforged-inventory`)

- **Level Up is a state, never a purchase.** Top Heroes levels with gold; AoP levels by XP (SRD table) and takes the level at camp or a node flagged `allows_level_up` (camp house rules, 2026-09-26). The panel reads the row's `xp` and `level`; readiness = `levelForXp(xp) > level`. States: *locked* ("300 XP to level 2"), *earned* (bar full gold and breathing; "level 2 earned · take it at camp"; pressing it says so in a dialog). It writes nothing. After a fight, `/api/walk-xp`'s payout updates the open sheet so the bar moves without a reload.
- **Chips are HP / AC / Speed** (the reference's three), off the sheet: `hp_current` when the row has it (live `c.hp` mid-fight), AC as the dashboard already computes it (worn armour counted there), speed. Nothing derived.
- **Nine slots, not eight.** The reference drew eight tiles; the doll has two rings, so the right column carries the second ring (the pack's rule: expose every real slot). Columns: cloak / torso / main hand / ring left; head / neck / legs / off hand / ring right. Labels under the tiles, green dot = equipped, thin gold outline = selected, rarity as a separate accent (the loot fountain's `RARITY_COL`).
- **The hero is Sam's sprite at a whole-number scale** (`heroStage()`, feet on the pedestal), replacing the CSS-scaled 256 canvas; the stage sizes by the height it has (`--ef-stage-h`), so the level panel and the card stay on screen at 1080p, 1600×1000 and 1280×800.
- **Backpack card.** Clicking a row (its name is a real button for the keyboard) opens the selected-item card: kind, where it goes, count, rarity, the weapon's real attack line from `attackFromItem()` (so Kenta's shortsword reads +1 to hit, no proficiency), the catalogue description, and the same Equip / Take off buttons the row has — under the same mid-fight gear-cost rules. Rows keep only the short line.
- **Nothing underneath changed:** `DOLL_SLOTS` ids, `fitsSlot`, drag on/off the body, `equipTo` / `removeFrom`, `/api/equipment`, the party tabs, `I` / `Esc`.
- `lib/walk-sheet.ts` gained `hpNow` and `xp` (both null when the row has none — a preview or an unseated hero shows a quiet bar, no guessed number). Tests added; type gate clean (11 errors before and after, none new).

## Owed

1. **PR 2 — the level-up ceremony at camp** (`lib/camp.ts levelUp()` exists; the camp page has no Level Up control yet): automatic gains → required choices only (HP roll on the physics dice, min 1 per level; spells known for a sorcerer; the class trial from `lib/level-trial.ts`) → confirm once, idempotent.
2. Backpack weight in the header (the walk's catalogue select carries no `weight`; one column added to `/api/walk-items?catalog=1` does it).
3. Arcane Reliquary variant, if Sam wants it: tokens + backdrop + inline Inspect/Equip.
4. The "Rehearsal · own world" pill now sits under the dialog (dialog z 7); if the DM wants it visible while the bag is open, move the pill.

## Verification

Headless Chromium at 1920×1080, 1600×1000 and 1280×800 with a six-item bag injected (the live route is unreachable from the session); no page errors; equip/take-off buttons render under the existing `bagCan` rules. Not verified from the session: the live `/api/map-stage` sheet carrying `xp`/`hp_current` end to end (code path read, not run), and the drow guards' walk behaviour around the taller dialog.
