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

The faces were first a reading of "rare" and "common"; Sam gave his own numbers the same evening — **§11 has them and is the table.** The OotA random-encounter table (§3) is untouched and still rolls through `resolveWatch` wherever the route wants it.

**Still needs Sam's yes** (§11 settled the rest): slow pace = advantage (§2); minimum 1 hp per level (§2); stable-at-0 spending Hit Dice on a partial rest.

---

## 11. Rulings of 2026-09-26 (late) — confirmed

Sam, verbatim, answering the four readings in §10:

> 1. Yes. 2. Yes. 3. Talk stays. 4. Nobody 85%, 5% Brigands, 5% Villians, 2.5% merchant, 2.5% a wandering person (deep gnome/drueggar/human/Kuo-toa/crazy dwarf/crazy drow/or hag/witch). 25% malicious, 80% neutral, 5% divine (50:50 Good / Evil).

So, now Sam's and no longer flagged: the partial rest costs **half** the full rest at every party size; the bard's success is **warm or better**; **`talk` stays** on the menu.

**The visitor tables.** A d40 gives the 2.5% steps exactly. All four tables are in `encounter_tables` / `encounter_table_rows` shape (`CAMP_VISITOR_TABLES`, `CAMP_VISITOR_ROWS`) and can be loaded into the database as they are.

| d40 `camp_visitors` | | d7 `camp_visitor_kind` | | d20 `camp_visitor_person` | | d2 `camp_visitor_divine` |
|---|---|---|---|---|---|---|
| 1–34 no one (85%) | | 1 deep gnome | | 1–5 malicious (25%) | | 1 good |
| 35–36 brigands (5%) | | 2 duergar | | 6–19 neutral (70%) | | 2 evil |
| 37–38 villains (5%) | | 3 human | | 20 divine (5%) → d2 | | |
| 39 a wandering merchant (2.5%) | | 4 kuo-toa | | | | |
| 40 a wandering person (2.5%) → d7, d20 | | 5 crazy dwarf | | | | |
| | | 6 crazy drow | | | | |
| | | 7 hag or witch | | | | |

Brigands and villains come to fight; no row names a stat block, so the DM picks one from the bestiary and the code says so. A merchant sets `merchantPresent`, which `trade` reads.

Sam's 25 + 80 + 5 summed to 110; he confirmed **25 / 70 / 5** ("70 is fine", 2026-09-26). **One reading remains,** flagged on every wandering-person result: the seven kinds of person carry no weights, so they are equal odds on a d7.

---

## 12. PR 2 as shipped — the short rest in the chat route (2026-09-26, PR #471)

`[TIME:short_rest]` was already in Malachar's tag vocabulary and already moved the clock 60 minutes (`time_advancement_rules`); it did nothing else. The route now resolves the rest through `shortRest` when the tag lands, writes `hp_current`, `hit_dice_remaining` and Pact Magic slots (the rest of `sheet_spellcasting` kept intact), lifts Unconscious/Stable and resets death saves for a stable character who rises above 0, and inserts one `rest_events` row with `rest_type = 'short'`, `bard_character_id`, `bard_spent_die`, and the faces rolled in `detail`.

**Nobody spends unless Malachar names them — Sam's ruling, 2026-09-26.** Spending Hit Dice is the player's choice in the SRD, so the route never decides it. Malachar carries what the players said into the tag:

```
[TIME:short_rest|spend=Kenta:1,Samson:max|song=Scott]
```

- `spend=` lists each character who chooses to spend and how many; `max` rolls one die at a time and stops at full or when the dice run out, which is how the SRD plays it at the table. A character not named spends nothing. A bare `[TIME:short_rest]` is a rest where nobody spends — pact slots still refill.
- `song=` names the bard who performs Song of Rest; `song=none` means no bard sings; nothing said lets a bard who is up sing. `shortRest` itself says so if the bard is below 2nd.
- A `[TIME:long_rest]` in the same turn wins; the hour is inside the night, and resolving both would spend Hit Dice the long rest then hands back.
- Nobody eats on a short rest. The ration charge for a partial rest (§10) belongs to PR 3 with `make_camp` (§13).

**Dice are rolled server-side** (`Math.random`) and every face is written to `rest_events.detail`. Routing them through the table's roller is a follow-up, not a decision.

A second session built the same PR in parallel (#468, closed unmerged, recoverable at `refs/pull/468/head`). Its `planHitDice` — spend the fewest dice whose average heal reaches full — was the auto-spend alternative; Sam chose the ruling above instead.

---

## 13. PR 3 — the camp in the chat route (2026-09-26)

**A note on PR 2 first.** Two sessions built it. Mine (#468) merged into the camp branch instead of `main` and never shipped. Another session's (#471) landed on `main` and is the one in play: Malachar writes which character spends how many Hit Dice from what the players said (`[TIME:short_rest|spend=Kenta:1,Samson:max|song=Scott]`), which is better than guessing. #468 is retired; its commits stay readable at `refs/pull/468/head`.

**Nothing called `make_camp` before this PR.** The transition existed in `lib/game-context.ts`, but no route used it. Now:

- **Making and breaking camp** are two new time tags, `[TIME:make_camp]` and `[TIME:break_camp]`, logged to `time_log` at zero minutes. The clock trigger accepts any event with an explicit minutes value, so no database change was needed. Every `[TIME:…]` tag is already stripped from narration and speech, so nothing new reaches players.
- **Whether the party is camping** is read from `time_log`, not stored. It's the latest of make_camp, break_camp, long_rest and short_rest. The rest that ends the evening ends the camp.
- **Making camp sets the budget.** Every player character's `rest_actions_remaining` becomes 2 if the rations on hand buy a full rest, 1 for a partial rest, 0 for none.
- **Rations price the rest at camp.** Sam's table replaces the SRD's one-supply-per-mouth meal at camp, never both. Outside a camp, the old SRD night runs exactly as before.

| Rations on hand | `[TIME:long_rest]` at camp | `[TIME:short_rest]` at camp |
|---|---|---|
| Full (20 / 30 / 40) | Full rest, full price, the party eats | Partial rest, half price |
| Partial only | **Refused.** Nothing charged, nobody starves, camp stays open for the short rest | Partial rest, half price |
| Less than partial | **No rest.** The night passes hungry and the camp ends | **Refused.** Camp stays open so food can be found |

- **The passive roll** happens after any rest that was actually given at camp, at the party's node (`party_position` → `travel_nodes`; `metadata.safe = true` means no one comes). The result is stored on the `rest_events` row.
- **Malachar hears about it on his next turn.** Rests resolve after his prose is written, so the route adds a CAMP section to his next prompt with who came, marked told once he has seen it. Brigands and villains come to fight: he introduces them from the bestiary with `[NPC_ENCOUNTER:…]`, and surprise and initiative are resolved on the board when the fight starts. That is the existing `/api/combat` start, not a new path.
- **While camped, the CAMP section** also tells him the rations, which rest they buy, each character's actions left, and the menu.
- **A bug on `main` fixed on the way.** #471's short-rest `rest_events` insert left out `fed` and the three supplies columns, which are required with no default, so every short-rest record was refused by the database. The insert now fills them.

**Not in PR 3.** Spending camp actions is PR 5: forage, hunt, trade and the rest aren't tracked yet, so the bard's partial-rest exception can't fire yet either. Malachar is told to hold each character to their count in the fiction until then.

**Sam's ruling, 2026-09-26: "No rest without enough rations."** A camp with fewer rations than a partial rest gives no rest at all. It bites today: the party has 0 rations, so a camp gives nothing until someone forages (PR 5). Resting outside a camp is untouched.

---

## 14. PR 5 — spending camp actions (2026-09-26)

**The tag.** `[CAMP_ACTION: <name> | <action>]` spends one of that character's camp actions (`rest_actions_remaining`). The name matches like the short rest's (exact, then prefix, so "Fifi" finds "Fifi of Copperas Cove"). The action reads loosely: "level-up", "foraging", "play music". The tag is stripped from the narration players see and from speech, like every other inline tag. Refusals never spend. A refusal comes when the party isn't camped, the action isn't on the menu, the count is already spent, or the action isn't wired yet.

**Three actions change the world, and the table's dice settle them, never a number Malachar writes.**

| Action | Roll | Outcome |
|---|---|---|
| forage | WIS (Survival), the DC Malachar stored on the request (OotA: 15, up to 20) | success adds 1d6 + WIS days of food to `party_supplies` |
| hunt | same, the foraging rule (neither SRD nor DMG has a separate one) | same |
| perform | CHA (Performance) | warm or better on a **partial** rest gives every character one more action, once per camp |

How the link works: Malachar puts the tag in the same reply as the acting player's roll request (`[CAMP_ACTION: Kenta | forage] … [[1d20-1 | survival | DC 15]]`). The route stamps that request's `purpose` with `camp:forage`. When the committed result comes back, the route reads the real total and the stored DC before Malachar speaks, and settles it. The request is claimed once (`camp:forage:done`) in the same update that checks it hadn't been, so a retried message can't bring the food back twice. Malachar gets the outcome as a fact in his CAMP section and narrates it.

Because roll requests belong to the player who is speaking, **a check action can only be taken by its own player**. Kenta's player can forage for Kenta, not for Scott. A check action with no compatible roll in the same reply spends nothing. One reply carries one roll, so it can settle one dice action; a second one in the same reply is refused without spending. The forage yield d6 is rolled server-side, like the short rest's Hit Dice, and flagged. The check itself is always the player's.

**The other actions** (attune, investigate, decipher, mend, pray, explore, talk, and trade when a merchant is present) spend the action and are the DM's scene. Attunement and identification already have SRD rules in `lib/camp.ts` (`attune`, `identifyItem`) for when an item-aware tag is wanted. **Trade** needs the last passive roll to have brought a merchant.

**Not yet, refused without spending:** `level_up` (PR 4, next), `artifice` and `brew` (crafting, below).

### Crafting — Sam's ruling, 2026-09-26: tool proficiency required, SRD rules

> "lets stick with tool proficiency to craft and use SRD rules."

This settles question 1 below. SRD 5.1, Downtime Activities — Crafting (verified in `campaign_chunks`, `srd-5-1`):

- **"You must be proficient with tools related to the object you are trying to create."** No proficiency, no crafting. `craftProgress` already refuses, so no code changed.
- **5 gp of progress per day**, and **"raw materials worth half the total market value"**. The SRD prices materials in gold, not in item counts. So a recipe needs no material quantities, and none will be invented.
- **Several proficient crafters** in the same place each add 5 gp a day.
- **The tool is sourced where the SRD names it.** The Poisoner's Kit is the SRD's tool for "the creation of poisons", so drow poison's recipe is `{ "tools": "Poisoner's Kit" }`. Named materials (a spider venom gland) are optional per recipe and only listed where Sam wants them held.

An earlier reading, "3 materials until proficient", was Sam's first answer the same evening. He replaced it with the SRD rule before it shipped. It was checked against the campaign data first: Xanathar's Guide is not among the five books in `campaign_books`, and no chunk mentions it.

**What still blocks wiring:** the progress table (question 2) and whether one camp action is one day of crafting. One new question comes with the ruling: are the raw materials' gold paid from the crafter's `sheet_currency` when work starts? The SRD says they must be "expended"; nothing tracks it today.

### Crafting — the original two questions

`craftProgress` (§6) is written and tested: 5 gp of work per day, materials at half the item's value, the right tool proficiency, the right place, catalog items only. Two things stop it being wired.

**1. The recipes are not in any source.** *(Settled above: SRD rules price materials in gold, so no counts are needed.)* The catalog says what feeds what, but never how much. Inventing the numbers would break "never invent game data", so they are Sam's:

| Material in the catalog | `feeds` (from the row) | Output in the catalog? | Tool (SRD where it says so) | Needs from Sam |
|---|---|---|---|---|
| Spider Venom Gland | drow poison | Drow poison, 200 gp | Poisoner's Kit (SRD: crafting poisons) | glands per dose |
| Hook Horror Claw | climbing picks; hooked shortspear | no | ? | output rows, qty, tool |
| Steeder Silk Spinneret | climbing line, net repair | no | ? | output rows, qty, tool |
| Ixitxachitl Hide | waterproof leather | no | ? | output row, qty, tool |
| Quaggoth Pelt | cold-weather lining | no | ? | output row, qty, tool |
| Grave-Brine (flask) | potion of water breathing | no | ? | output row, qty, tool |
| Zurkhwood | "crafting material" | — | ? | what it makes |
| Deep Rothé Leather | "crafting material" | — | ? | what it makes |

Each answer becomes `items.properties.craft = { "tools": "…", "materials": [{"slug": "…", "qty": N}], "requires": "…" }` on the **output** row. That is a data change, shown before it runs.

**2. Crafting takes days, and progress needs a home.** At the SRD's 5 gp a day, one dose of drow poison is 40 days of work. Nothing stores work in progress. The smallest honest home is a new table. **This is a schema change and has not been run.** It is here for Sam to read:

```sql
-- PROPOSAL — not applied. Paste into the Supabase SQL editor only after Sam says yes.
create table public.crafting_projects (
  id            uuid primary key default gen_random_uuid(),
  character_id  uuid not null references public.characters(id) on delete cascade,
  item_id       uuid not null references public.items(id),
  progress_gp   integer not null default 0 check (progress_gp >= 0),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  updated_at    timestamptz not null default now()
);
create unique index crafting_projects_one_open
  on public.crafting_projects (character_id, item_id) where finished_at is null;
alter table public.crafting_projects enable row level security;
-- No policies: service-role only, like the time and rest tables.
```

**A third question comes with it:** does one camp action equal one day of crafting (5 gp)? If so, a dose of drow poison is 40 camps.

### One more question the build raised

**When should the passive roll happen?** PR 3 rolls it after the rest, which ends the camp. So a merchant always arrives after the actions are spent, and **trade as a camp action can almost never happen**. Rolling it when camp is made instead would let merchants be traded with and brigands interrupt the evening. It's a one-line move either way, and Sam's call.

### Crafting — rulings of 2026-09-26 (late), and the table

Sam, answering the three questions above:

> 1. Run it. 2. One action does not equal one day of crafting. You can roll for success per each point of actions you have. 3. Lets find an equivalent to track.

- **The table is live.** `crafting_projects` was applied to Supabase on 2026-09-26 at Sam's word and verified afterwards: 10 columns, one open project per character per item, row security on, no policies, 0 rows. The SQL is `supabase/migrations/20260927010000_crafting_projects.sql`.
- **Crafting advances by a roll per camp action, not by the day.** Each camp action spent on crafting is one roll for success. The table keeps `attempts` and `successes` for this, beside the SRD's `progress_gp`, because what a single success is worth hasn't been ruled yet.
- **The equivalent that tracks the materials' gold is the coin purse.** `characters.sheet_currency` already holds cp / sp / ep / gp / pp for every character (Kenta 50 gp, Bastet 29, Samson 15, Scott and Fifi 0). The SRD's half-value materials come out of it when work starts, and `crafting_projects.materials_gp_paid` records what was paid, so the purse and the project agree.

**Still Sam's before crafting is wired, all three about the roll:**

1. **Which check.** An ability check with the recipe's tool, adding proficiency. Which ability? Commonly INT for a Poisoner's Kit or Alchemist's Supplies, DEX for Thieves' Tools, but the SRD doesn't fix one.
2. **What DC.** The SRD's Typical DCs are 10 easy, 15 medium, 20 hard. Fixed per recipe, or set by the item's value?
3. **What one success buys.** The finished item? Or a fixed step of progress, and if so how many successes finish drow poison?

---

## 15. PR 4 — levelling at camp (2026-09-26)

`[CAMP_ACTION: <name> | level up]` takes **one** level through `levelUp` (§4).

- **Refused before anything is spent** when `levelUp` would refuse: the XP hasn't earned the next level, the sheet is multiclassed, or it has no Hit Die. Every player character is level 1 with 0 XP today, so nobody can level yet. That's correct.
- **Where.** At camp it costs one camp action. Away from camp it needs a node with `travel_nodes.metadata.allows_level_up = true` (Sam, 2026-08-20) and costs nothing. Anywhere else it's refused.
- **Hit points, the SRD's two ways:**
  - **Rolled.** Malachar puts the tag in the same reply as the player's Hit Die roll (`[[1d8]]`, one die of the class's size). The request is stamped `camp:level_up`, and next turn the committed **face** from the table's dice is fed to `levelUp` (`faceRng`) before Malachar speaks. The server never rolls it.
  - **Fixed.** With no such roll in the reply, the SRD's fixed value (half the die + 1) applies at once.
- **What gets written:** `level`, `hp_max`, `hp_current`, `proficiency_bonus`, `sheet_hit_dice`, `hit_dice_remaining` (the new die unspent), `xp_to_next`, and the next full-caster slot row. The level-up sting plays.
- **The players' choices** (ASI, subclass, features, spells) become **one entry on `sheet_features`**, "Level N — choices to make", which the character card already shows. It's removed once settled. A retry can't stack a second entry.
- **The XP award uses the one table now.** The chat route's inline array is gone (`levelForXp` / `xpToNext`). It had a bug: past level 10 its lookup returned -1, so the level-up sting stopped playing. The award still doesn't write a level, because levels are taken at camp.

**Readings to know about — Sam's to overrule:**

- **Current hit points rise with the maximum.** The SRD is silent on current hit points when a level is gained. Raising them by the same amount is the common table reading.
- **Stored `passive_perception` isn't recomputed.** When the proficiency bonus rises (level 5, 9, 13, 17), a character proficient in Perception will show a stale passive score until it's corrected. It doesn't bite before level 5.
- **XP still goes to one character.** The award gives the whole `xp_value` to the killer, not divided among the party as the SRD does (§7). Out of scope here, unchanged.

---

## 16. The crafting menu (Sam, 2026-09-27)

> "2. Based on what is being done. When you choose crafting in camp there should be a list (Alchemy, Construct, Artifice). Options avaialable light up if you have the proficiency and items."

**The DC is set by what is being made.** It is not stored on the recipe. Malachar sets it when he calls for the roll, from the SRD's Typical Difficulty Classes (5 very easy, 10 easy, 15 medium, 20 hard, 25 very hard, 30 nearly impossible), for the thing actually being crafted.

**The menu.** On the camp screen (`components/dashboard/compact-dashboard.tsx`, Camp tab), Craft and Brew are now one **Craft** button. It opens three tabs: **Alchemy, Construct, Artifice**. Each tab lists every catalog item carrying a recipe (`items.properties.craft`), so the menu can never offer something the catalog does not hold. `lib/camp.ts` `craftMenu` decides each option; `/api/camp/craft-menu` gathers the rows. The screen fetches its own data, so `app/page.tsx` (another session's lane) was not touched.

An option **lights up** when the crafter has everything the SRD asks for:

| Requirement | Read from | SRD |
|---|---|---|
| Proficiency with the recipe's tools | `sheet_proficiencies.tools` | "You must be proficient with tools related to the object" |
| The tools themselves, carried | `inventory_items` | a kit you lack can't be used |
| Any materials the recipe names | `inventory_items` | "access to special materials" |
| Half the market value in gold | `sheet_currency` (pp/gp/ep/sp/cp at SRD rates) | "raw materials worth half the total market value" |
| The facility, when the recipe names one | the party node's `metadata.facilities` | "a forge in order to craft a sword" |

A **dimmed** option lists what's missing in plain words ("No Poisoner's Kit carried.", "Needs 50 gp of materials (30 gp in the purse)."). Lit options come first. Each tab shows a count of what's lit.

**Until the crafting roll is wired**, a lit option reads "Ready — the crafting roll is coming soon" instead of a button that would cost nothing and make nothing. Two answers still wire it: which ability the roll uses, and what one success buys (§14).

### The recipes — SRD-sourced, APPLIED 2026-09-27

Sam: "run the recipes." Applied to Supabase on 2026-09-27 and verified. Exactly these four items carry `properties.craft`, and every property they already had was kept. The file of record is `supabase/migrations/20260927020000_craft_recipes_srd.sql`.

Checked against live data the same day: all four appear on **Alchemy** for every character, **all dimmed**. Nobody is proficient with a Herbalism or Poisoner's Kit, nobody carries one, and the purses run 0–50 gp. Fifi's Alchemist's Supplies proficiency lights nothing yet, because no recipe uses those supplies. That's correct for escaped prisoners.

```sql
-- APPLIED 2026-09-27 (Sam: "run the recipes").
-- SRD 5.1 Equipment: Tools — "proficiency with this kit is required to create
-- antitoxin and potions of healing" (Herbalism Kit); "the creation of poisons"
-- (Poisoner's Kit). Tab: Alchemy (read from the tool).
update public.items
   set properties = coalesce(properties, '{}'::jsonb)
     || '{"craft": {"tools": "Herbalism Kit", "source": "SRD 5.1 Equipment: Tools — Herbalism Kit"}}'::jsonb
 where slug in ('potion-of-healing', 'antitoxin');

update public.items
   set properties = coalesce(properties, '{}'::jsonb)
     || '{"craft": {"tools": "Poisoner''s Kit", "source": "SRD 5.1 Equipment: Tools — Poisoner''s Kit"}}'::jsonb
 where slug in ('basic-poison-vial', 'drow-poison');
```

Named materials are left off. The catalog's "spider venom gland feeds drow poison" note is homebrew, so adding it as a required material is Sam's call.

**Construct and Artifice have no recipes a source supports.** The catalog has their tools (Building Hammer; Tinker's Tools), but nothing says what they make. Those tabs stay honest ("No recipes yet") until Sam names outputs. Alchemist's Fire and Acid are *not* tied to Alchemist's Supplies by the SRD text, so they're left out too.

### Needs Sam's yes

- **Which tools sit on which tab.** Claude's grouping of the SRD's tools under Sam's three names, in `TOOL_CATEGORY`:
  - **Alchemy:** Alchemist's Supplies, Herbalism Kit, Poisoner's Kit, Brewer's Supplies.
  - **Construct:** Building Hammer, and the smith's, carpenter's, mason's, leatherworker's, woodcarver's, weaver's, cobbler's, potter's and glassblower's tools.
  - **Artifice:** Tinker's Tools, Jeweler's Tools.

  A recipe's own `category` always overrides the grouping.

## 17. PR 6 — train: the teaching path of earned proficiency (2026-09-27)

Owned by `docs/claude_Earned_Proficiency.md` §1 path C and §4; the action lives here because hours accrue only at camp. Homebrew throughout.

**The tag.** `[CAMP_ACTION: <name> | train | <teacher> | <skill>]`. The two extra fields are order-free (the one that is a skill is the skill). The teacher is looked up by name among every character at the table — companions and NPCs alike. **The engine checks the teacher's sheet**: a companion's `sheet_skill_proficiencies`, or an NPC's stat-block `skills` line ("Perception +2, Stealth +4" lists exactly the proficient skills). Buppido can teach Stealth; he cannot teach Animal Handling, whatever Malachar says.

**Below the threshold** (40 hours, `skill_progress_rules.teaching`), an evening banks hours: one `skill_progress` row of `kind = training_hours` with the teacher's id, the action is spent, and a `training` row goes to `time_log` so the clock moves the same amount — honest downtime. Refusals (not camped, no skill named, no such teacher, teacher without the skill, teaching yourself, a student who already has or already earned the skill, no actions left) spend nothing.

**At the threshold** the evening is the test. Malachar's CAMP section lists who is ready ("READY FOR THE TEST"), never the hours. The tag goes in the same reply as the student's own roll, `[[1d20+X | <skill> | DC 12]]`; the request is stamped `camp:train:<teacherId>`. The dice ledger records the accepted roll against the teaching stake (`lib/skill-progress-apply`, `stakeKeyFromPurpose`), `evaluate` awards on a pass, and Malachar gets pass/fail as a camp fact plus the PROFICIENCY EARNED line. A failure keeps the hours: another camp, another try. Like forage, only the student's own player can take the test, and one reply settles one dice action.

**Dashboard.** The Camp tab's Train button picks the teacher (anyone at camp) then the skill, and sends "I spend my camp action training with Eldeth in animal handling."

**House rules, needs Sam's yes** (flagged on every decision that banks hours):

- **4 hours of lessons per camp evening.** SRD downtime counts 8 hours a day; a camp evening is not a day. Ten evenings to the test.
- **The teacher's evening is free.** Teaching costs the student's action, not the teacher's.

