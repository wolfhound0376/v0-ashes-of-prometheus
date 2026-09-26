# Ashes of Prometheus — Camp Module (decision of record, 2026-09-26)

**Status:** delivered as `lib/camp.ts` + `lib/camp.test.ts` (32 seeded tests pass, `tsc --strict` clean). In PR #463. Wiring is PRs 2–5 (§8).
**Amended the same evening by §10** — Sam's rulings on the two-tier budget, rations, the bard's exception, the full menu, and the passive visitor roll. Where §10 and §2–§3 disagree, §10 wins.
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

---

## 10. Rulings of 2026-09-26 (evening) — the budget, the rations, the passive roll

Sam, verbatim:

> Each person for each full Rest gets two camp actions. Partial rest is one unless the bard inspires and plays for the group successfully. Attuning to magical items, investigation of magical items, deciphering arcana, building / artificing, foraging, mending items, combining ingredients/building potions/elixirs, praying for guidance, leveling up, trading with merchants, hunting, exploring in the nearby area, playing music/entertaining all take actions. Once all characters have used up their actions they rest according to their rations available. Full rest takes 20 rations, partial 10, larger parties (6-8+ take 30). More than 8 is 40. There should be a passive roll to determine if randomly they encounter brigands, villains, wandering merchants (rare), mysterious person (may be malicious, hidden god/fey spirit (rare), or neutral (common).

How the code reads it:

**The rest is bought with rations.** A *full* rest is the long rest (`lib/long-rest.ts`); a *partial* rest is the short rest (`shortRest`). `fullRestRations(partySize)` is 20 for up to five, 30 for six to eight, 40 past eight — Sam's numbers verbatim. `partialRestRations` is 10 for a normal party as Sam said; for larger parties he gave only the full cost, so **half** is the reading and `affordableRest` flags it. `affordableRest(supplies, partySize)` returns the best rest the rations buy, or `null` (the party goes hungry — `lib/exhaustion.ts` takes over). The route must charge this cost at camp and **not also** `suppliesForParty` (one per mouth) — two economies would double-charge.

**The budget follows the rest.** `makeCampBudget("full")` = 2, `("partial")` = 1, `(null)` = 0. It is decided when camp is made, from the rations then on hand; foraging or hunting during the actions may raise the rations, and the rest that resolves at the end is bought with what is on hand *then*. (So a party that forages its way from partial to full gets the full rest but had the partial budget — a consequence, not a bug. Sam can rule otherwise.)

**The bard's exception.** `perform()` now returns `inspires` — true at *warm* or better, the same SRD Typical-DC reading as the bands, needs Sam's yes. On a partial rest, `bardUpgrade(remaining, "partial", inspires)` adds one action to every character, the bard included, once. The bard's own performance still costs their action. On a full rest it does nothing. This supersedes the 2026-08-20 "no mechanical buff" — the buff is exactly one action and nothing else.

**The menu is Sam's list.** `CAMP_ACTIONS` = attune, investigate, decipher, artifice, forage, mend, brew, pray, level_up, trade, hunt, explore, perform, talk. `CAMP_ACTION_RULES` names how each resolves and its source. `watch` and `tend` left the menu: the encounter roll is passive (below) and the short rest *is* the partial rest. **`talk` is kept from §5 — Sam's list did not name it. Needs his yes.**

| Action | Resolves as | Source |
|---|---|---|
| attune | `attune` — one item per rest, three at a time; a curse stays silent | SRD Attunement |
| investigate | `identifyItem` — a rest's handling reveals properties, never the curse; potions need a taste | SRD Identifying a Magic Item |
| decipher | `decipher` — INT (Arcana) vs the DM's DC | SRD Typical DCs |
| artifice, brew | `craftProgress` — catalog items with a `craft` block only (§6) | SRD Crafting |
| forage | `forage` (§2) | OotA-Enc p.25; DMG p.111 |
| hunt | `hunt` — the foraging rule; neither the SRD nor the DMG has a separate one, and the code says so | DMG p.111 |
| mend | `dmScene` — SRD Mending repairs one break up to a foot; anything larger is a tool check the DM sets | SRD Mending |
| pray, explore | `dmScene` — no rule; the DM's scene, flagged as such | Sam, 2026-09-26 |
| level_up | `levelUp` (§4) | SRD; Sam 2026-08-20 |
| trade | `trade` — refused unless the passive roll brought a merchant | Sam, 2026-09-26 |
| perform | `perform` — a band, and the partial-rest exception | Sam, 2026-08-20 / 09-26 |
| talk | `weightRelationshipEvent` (§5) | Sam's gravity system |

**The passive roll.** Not an action; the route draws it server-side when the rest resolves. `passiveCampEncounter(node, rng)` rolls `CAMP_VISITOR_ROWS`, which are in the exact shape of `encounter_table_rows` (`camp_visitors` → `camp_visitor_person`) so they can move into the database without a code change. A safe node gets no visitor. Brigands and villains are `hostile` and the DM picks the stat block from the bestiary (no row names one). A merchant sets `merchantPresent`, which `trade` reads. A mysterious person is rolled again: malicious, a hidden god or fey spirit (rare), or neutral (common).

**The faces are Claude's reading of "rare" and "common", not Sam's numbers:**

| d20 | Visitor | | d20 | The person is… |
|---|---|---|---|---|
| 1–12 | No one comes (60%) | | 1–5 | malicious (25%) |
| 13–15 | Brigands (15%) | | 6 | a hidden god or fey spirit (5%, rare) |
| 16 | Villains (5%) | | 7–20 | neutral (70%, common) |
| 17 | A wandering merchant (5%, rare) | | | |
| 18–20 | A mysterious person (15%) | | | |

Every result carries the flag until Sam says yes or gives his own faces. The OotA random-encounter table (§3) is untouched and still rolls through `resolveWatch` wherever the route wants it.

**Still needs Sam's yes, in one place:** partial-rest cost for parties over five (half); `inspires` = warm; `talk` staying on the menu; the visitor faces above; slow pace = advantage (§2); minimum 1 hp per level (§2); stable-at-0 spending Hit Dice on a partial rest.
