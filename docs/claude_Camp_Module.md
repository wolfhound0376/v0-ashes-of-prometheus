# Ashes of Prometheus — Camp Module (decision of record, 2026-09-26)

**Status:** delivered as `lib/camp.ts` + `lib/camp.test.ts` (24 seeded tests pass, `tsc --strict` clean). Not yet in the repo — wiring is a repo-attached PR (§8).
**Authority:** sits under `claude_Architecture_Canon.md` (Layer 1) and `claude_Game_Context_State_Machine.md` §1 (the camp context). Expands `claude_Playable_Layer_Design.md` §7 ("Camp — a menu of time") into rules and tables. Nothing here changes the four layers, the Claude-only stack, the 5-ft grid, or the dice roller. Rules stay 5E. Every number below is SRD 5.1, Out of the Abyss (D&D Encounters), DMG p.111 (flagged — not SRD), or a dated house rule of Sam's. Nothing is improvised; where a rule is missing the code returns a `flags` entry instead of a guess.

---

## 0. The one line

**Camp is where time is spent on purpose.** The night itself (long rest, food, exhaustion) already exists and runs — `lib/long-rest.ts`, `lib/exhaustion.ts`, the `[TIME:long_rest]` handler in `app/api/chat/route.ts`, `rest_events`, `party_supplies`. This module adds what the party does *around* that night: the short rest, the watch, foraging, levelling, crafting, and the talk that moves relationships. One action per character per rest, and the choices compete.

## 1. What already exists (verified live 2026-09-26)

| Piece | Where | State |
|---|---|---|
| Long rest (HP, half Hit Dice, slots, 24 h cooldown, stable-at-0 rule) | `lib/long-rest.ts`, chat route `[TIME:long_rest]` | Live and wired |
| Food / starvation / exhaustion ladder | `lib/exhaustion.ts`, `characters.exhaustion`, `unfed_rest_streak`, `party_supplies` (1 row, `supplies = 0`) | Live and wired |
| Rest record | `rest_events` (0 rows — nothing has rested yet), `bard_character_id` / `bard_spent_die` columns waiting for Song of Rest | Schema ready |
| Game clock | `game_clock`, `time_log`, `time_advancement_rules` (9 rows: `short_rest` 60 min, `long_rest` 480 min) | Live |
| Camp context | `lib/game-context.ts` — `make_camp` / `break_camp` transitions (merged, PR #438/#439) | Live |
| Encounter tables | `encounter_tables` (5 keys, OotA-Enc ch.2) + `encounter_table_rows` (50 rows) | Loaded, never read by any code |
| Camp action budget | `characters.rest_actions_remaining` | Column exists, read by nothing, all zeros |
| Relationship deltas | `relationship_events` (`subject_id`, `object_id`, `kind`, `gravity`, `deltas`, `note`, `source`) | Schema ready, 0 rows |
| XP award | chat route ~L2280: adds the whole `xp_value` to one character on kill, plays `ui/level_up`, never increments `level` | Half-built (see §7) |
| Short rest, foraging, levelling, crafting | — | Did not exist |

## 2. The menu

Per character, per long rest: **one camp action** besides sleeping. `characters.rest_actions_remaining` is set to 1 when the party makes camp and decremented per action. `sleep` is never an action.

| Action | Rule | Source | Function |
|---|---|---|---|
| `watch` | One d20 on the node's encounter table at the end of the rest | OotA-Enc p.30/32 | `resolveWatch` |
| `forage` | WIS (Survival) DC 15 (up to 20); yield 1d6 + WIS person-days → `party_supplies` | OotA-Enc p.25; yield DMG p.111 (not SRD) | `forage` |
| `tend` | The short rest, with Hit Dice spent; Song of Rest if a bard sings | SRD Resting; SRD Bard | `shortRest` |
| `talk` | A relationship scene → one `relationship_events` row, palliation-weighted | Sam's gravity system | `weightRelationshipEvent` |
| `perform` | One CHA (Performance) check read as a band (flat / warm / moving); DM sets deltas | House rule (Sam 2026-08-20) | `perform` |
| `craft` | 5 gp/day progress, materials = half value, tool proficiency + location required, catalog items only | SRD Downtime: Crafting | `craftProgress` |
| `level_up` | Gated to camp (or a node with `allows_level_up`); one level at a time | SRD Beyond 1st Level + house rule | `levelUp`, `levelUpAllowedHere` |

House rules, stated so they cannot be accidental:

- **One camp action per character per rest** (the SRD has no budget). Sam, Playable Layer §7.
- **Level-ups happen at camp**; exceptions are location-gated (school of magic, temple, patron/deity) via `travel_nodes.metadata.allows_level_up = true`. Sam, 2026-08-20.
- **Bard performance is a camp action with no mechanical buff** — a Performance check the DM reads. Sam, 2026-08-20.
- **Slow-pace "improved foraging" = advantage.** The book doesn't quantify it. Needs Sam's yes.
- **Minimum 1 hp per level gained** (PHB wording; SRD 5.1 omits it). Applied. Needs Sam's yes.

## 3. The watch — interruption is a property of the node

- `travel_nodes.metadata.safe = true` → no roll. `metadata.encounter_table` names the table (default `underdark_random`). No new enum, no schema change.
- The roll uses the rows from the database, passed into the function. A missing table returns `"NO ROW — DM rules it"`, never an invented result.
- The OotA table already carries Sam's positive tail: `underdark_creature` 17 = Society of Brilliance, 19–20 = Traders. No homebrew table needed. "If you trust them" is the scene, not the roll.
- Palliation weighting applies to the *gravity* of what the visitor does (§5), not to the encounter roll.
- A creature result hands off to the existing surprise/initiative path in `lib/game-context.ts` (`resolveSurprise` — the watcher's passive Perception vs the creature's Stealth — then initiative). Nothing new to build there.

## 4. Levelling

`levelUp` writes: `level`, `hp_max` (+roll or fixed average, + CON, min 1), `proficiency_bonus`, `sheet_hit_dice` (`"2d6"`), `hit_dice_remaining` (+1, the new die is unspent), `xp_to_next`, and the next row of the SRD full-caster slot table (levels 1–10; beyond that flagged). It returns `pendingChoices` — ASI, class features, spells known — for the players to make at the fire, where Malachar gets his monologue. It **refuses multiclassed sheets** (Freía la Fey is Rogue 3 / Warlock 2) because which class takes the level is a player choice with SRD prerequisites.

The "roll" method must go through the Three.js dice roller (never lose it); the module takes the `rng` so the route can feed it the physical result.

## 5. Talk — the payload

Camp is where the six hidden dimensions move (Trust, Fear, Respect, Affection, Debt, Resentment). Layer 1 scores the scene 0–100; `weightRelationshipEvent` applies Sam's rule — positive events land at 65% (midpoint of 60–70%), negatives at full — and writes `source = 'camp:talk'` on the `relationship_events` row. Relief without erasure.

## 6. Crafting — catalog only

The AI cannot invent items (Layer 2B). An item is craftable only if `items.properties.craft` exists: `{ "tools": "Smith's Tools", "materials": [{"slug":"zurkhwood","qty":2}], "requires": "forge" }`. No block → "not craftable". The catalog already has crafting materials (zurkhwood, deep-rothe-leather, spider-venom-gland → drow poison) with no recipes attached — that is data work, not code (§8). Tool proficiency comes from `sheet_proficiencies.tools` (Freía: Alchemist's Supplies, Thieves' Tools; Samson: Calligrapher's Supplies; Kenta: Navigator's Tools).

## 7. Things found while verifying — not fixed, reported

- **Fifi is gone from `characters`.** The UUID canon calls Fifi (`d00aa5b8-…`) is now named **Freía la Fey**, L5 Rogue 3 / Warlock 2, `is_player = true`, run `06f6d1e0`. No row matches "Fifi" or "Copperas". Either Stephanie's character was rebuilt/renamed on purpose (then project memory is stale) or a sheet import overwrote it. Sam decides which.
- **Freía `xp_to_next = 300` at level 5.** SRD says 14,000. Fix (shown, not run): `update characters set xp_to_next = 14000 where id = 'd00aa5b8-ced1-477d-9ec8-0861cca55498' and level = 5;`
- **Bastet** (L5 Barbarian, `is_player = true`) has `run_id = null` and `hit_dice_remaining = null` — she'll be skipped by Hit-Dice logic and may not belong to the active run.
- **XP award splits nothing.** The chat route gives the full `xp_value` to the killing character (SRD: divide among the party) and never writes `level`. `lib/camp.ts` `levelForXp` / `xpToNext` are the one place for the table now; the route's inline array should go.
- **`party_supplies.supplies = 0`** — correct for prisoners; the first camp after the escape will be hungry unless someone forages. That is the design working.
- **Scott's `sheet_spellcasting.rules_source` says "SRD 5.2.1"** (2024 rules) while `claude/Forge2014_Character_Model.md` is 2014. Rest/slot maths is identical either way; class-feature text is not. Worth one ruling, not urgent.

## 8. Wiring plan — repo-attached session, one idea per PR

Collision check run 2026-09-26 (`who-else.mjs --days 14`): `lib/camp.ts`, `lib/long-rest.ts`, `app/api/chat/route.ts` all clear.

- **PR 1** — `lib/camp.ts` + `lib/camp.test.ts` + this doc. No schema change.
- **PR 2** — `[TIME:short_rest]` handler in the chat route: call `shortRest`, write `hp_current` / `hit_dice_remaining` / pact slots, insert `rest_events` with `rest_type = 'short'`, `bard_character_id`, `bard_spent_die`. No schema change.
- **PR 3** — `make_camp` sets `rest_actions_remaining = 1`; the watch roll at `[TIME:long_rest]` from `encounter_table_rows`; a creature result opens the existing surprise → initiative path. No schema change.
- **PR 4** — Level-up at camp: `levelUp` + the gate, replacing the inline XP array; `pendingChoices` surfaced on the character card. No schema change.
- **PR 5** — Foraging and crafting actions; `items.properties.craft` recipes for the existing materials (data migration, shown before run).

Deferred: a camp UI ("one still scene, a fire, tap a character") is HD-2D work after the Fifi sprite anchor lands.

## 9. Provenance

- **Sam-originated:** camp as a menu of time; level-ups gated to camp with location exceptions; positive-tail visitors; palliation 60–70%; bard performance as a camp action; "keep it 5E".
- **Claude-originated, for Sam's yes:** one-action-per-rest budget using the existing column; slow pace = advantage; PHB minimum-1-hp reading; `items.properties.craft` as the recipe convention; `travel_nodes.metadata.safe` / `encounter_table` / `allows_level_up` conventions.
- **Books:** SRD 5.1 (Resting, Beyond 1st Level, Crafting, Bard, Warlock); OotA D&D Encounters ch.2 pp.24–32; DMG p.111 (foraging yield — the only non-SRD number, flagged in code).
