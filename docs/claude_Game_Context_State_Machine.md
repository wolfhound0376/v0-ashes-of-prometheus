# Ashes of Prometheus — Game Context State Machine (decision of record, 2026-09-25)

**Status:** Sam's call, 2026-09-25: "Build what works for our project and delete the rest. Keep it 5E."
**Authority:** sits under `claude_Architecture_Canon.md` (Layer 1 / Layer 3) and `claude_HD2D_Pivot.md` §3 (exploration mode). Fills the gap the Playable Layer doc left open at §568 ("free-movement exploration … untethered from turn order") and §582 (node graph). Nothing here changes the four layers, the Claude-only stack, the 5-ft square grid, or the dice roller.
**Source of the idea:** a third-party Python "homage architecture" blueprint pasted 2026-09-25 (Octopath-styled). Its one good idea is kept below. Everything else is deleted, with reasons, in §6 — so no future session re-imports it.

---

## 0. The one line

**The engine is always in exactly one of four contexts — Overworld, Exploration, Combat, Camp — and every transition between them is a named, validated, 5e-governed event.** Nothing hidden, nothing implied. If initiative rolls, the engine says why; if someone is surprised, the SRD surprise rule said so, not the scene.

## 1. The four contexts

| Context | What the player sees | Where the truth lives (existing tables) |
|---|---|---|
| `overworld` | Node map of the region — travel is a sequence of decisions (Playable Layer §6) | `travel_nodes` (`region` / `location` / `waypoint`), `party_position` |
| `exploration` | HD-2D diorama of one node, free movement, one party sprite (HD2D §3) | `party_position.node_id` where the node has `vtt_map_id` or `scene_environment_id` |
| `combat` | 5-ft square grid, snap-on-initiative, turn-order strip | `combat_state` (`status = 'active'`, `turn_order`, `turn_state`) |
| `camp` | Menu of time — rest, watch, relationship scenes (Playable Layer §7) | a `travel_nodes` row flagged in `metadata` as `camp: true`; rest bookkeeping on `characters.rest_actions_remaining`, `hit_dice_remaining`, `unfed_rest_streak` |

"Camp" is a node type in the Playable Layer sense (safe, allows rest), not a new enum value — `travel_nodes.node_type` stays `region | location | tactical_map | waypoint`. No schema change in this doc.

## 2. Transitions (the whole machine)

```
overworld ──arrive(node with a map)──▶ exploration
exploration ──depart──▶ overworld
exploration ──initiative(encounter)──▶ combat
combat ──combat_state.status = 'ended'──▶ exploration
exploration ──make_camp──▶ camp          camp ──break_camp──▶ exploration
overworld ──ambush(encounter)──▶ combat  (travel encounters skip the diorama; snap straight to the tactical map)
```

Rules of the machine:
- **Reachability is discovery, not unlocking.** A node the party can travel to is one with `travel_nodes.discovered_at` set. There is no "Mario unlocked-nodes list"; that was a duplicate of a column that already exists.
- **Every transition carries a `reason` string** and is logged. Same discipline as the Scene Composer's per-placement rationale: a mode change that feels arbitrary must be auditable afterwards.
- **`combat` can only be entered by rolling initiative.** No transition puts the party in combat without an initiative record in `combat_state.turn_order`.
- **`combat` can only be exited by the engine ending it** (`status = 'ended'`). Players do not "leave" combat; they win, flee (Dash + distance, resolved on the grid), or die.

## 3. Entering combat — surprise and initiative, by the book

Playable Layer §2.1 hard constraint 4 already says surprise "goes through 5E surprise rules and gets rolled, not assumed." This is that rule, implemented.

**Surprise (SRD 5.1, Combat: Surprise).** The GM decides who *might* be surprised. If neither side is being stealthy, nobody is. Otherwise each hider's Dexterity (Stealth) check is compared to each opposing creature's passive Wisdom (Perception). A creature that notices no hider is **surprised**: it cannot move or take an action on its first turn of the combat, and cannot take a reaction until that turn ends. Surprise is per-creature, not per-side — a party can be half-surprised.

- Passive Perception = 10 + WIS mod + proficiency if proficient in Perception (SRD, Using Ability Scores: Passive Checks). `characters.passive_perception` is used when set; recomputed otherwise.
- The Stealth check is a real skill check (§4) — expertise counts, disadvantage from medium/heavy armour counts if the sheet says so.
- `surprised` is written into `characters.conditions` (jsonb) and cleared by the engine at the end of that creature's first turn. Malachar is *told* who is surprised; he never decides it.

**Initiative (SRD 5.1, Combat: Initiative).** d20 + DEX modifier. Nothing else — proficiency does not apply. Ties: the engine breaks PC/monster ties by DEX score, then by a re-roll; ties between PCs are the players' choice, which the UI should offer rather than decide. Result is written to `combat_state.turn_order`; snap-to-grid fires (HD2D §2).

## 4. Exploration interactions — skill checks, not "puzzles"

The blueprint's "Zelda puzzle handler" survives as a plain **exploration interaction**: a thing in the diorama that asks for one ability check against one DC. It's the same mechanic as the Velkynvelve manacles and it must use the same maths.

Ability check = d20 + ability modifier + proficiency bonus **only if proficient** in that skill (double for expertise). Natural 20 is *not* an automatic success on an ability check; natural 1 is not an automatic failure. (SRD 5.1, Using Ability Scores.) Bard's Jack of All Trades adds half proficiency (rounded down) to non-proficient checks from Bard level 2 — Scott is L1 today, so it's a flag, not a default.

Full skill → ability map (the blueprint's map silently defaulted four skills to Strength):

| STR | DEX | INT | WIS | CHA |
|---|---|---|---|---|
| Athletics | Acrobatics, Sleight of Hand, Stealth | Arcana, History, Investigation, Nature, Religion | Animal Handling, Insight, Medicine, Perception, Survival | Deception, Intimidation, Performance, Persuasion |

`characters.sheet_skill_proficiencies` currently mixes key styles (`"Sleight of Hand"` vs `"sleight_of_hand"`, `"Stealth"` vs `"stealth"`). The module normalises keys; a later data-hygiene PR should pick one form.

**Failure consequences come from a closed vocabulary**, authored per interaction — never improvised by the model:
- `none` — nothing happens, try again
- `locked_until_long_rest` — the Velkynvelve manacle rule (skill doc: "on a failure the character can't retry until after a long rest")
- `trigger: <encounter_key | scene_key>` — a real encounter or cinematic already in the database

There is no generic "environmental backlash/trap" fallback. If the author didn't say what failing does, failing does nothing.

## 5. Time — a clock, not a day/night toggle

The active campaign is in the **Underdark. There is no day and no night at Velkynvelve.** Out of the Abyss tracks time in days (Scavenged Possessions rolls "days imprisoned"; long rests are once per 24 hours). A DAY/NIGHT flag is wrong for the current game and too thin for any other.

Kept instead: **a campaign clock in hours.** Combat advances it by rounds (6 s), travel by edge distance, rest by 1 h / 8 h. Day/night is a *derived* property, computed only where the node's environment has a sky. This passes the generic-engine test (Curse of Strahd needs day/night; the Underdark needs elapsed days), and it is what the rest rules already need: one long-rest benefit per 24 h (skill doc §Rests), which `rest_actions_remaining` and `unfed_rest_streak` are tracking today without a clock to hang off.

## 6. Deleted from the blueprint, and why

| Blueprint item | Verdict | Reason |
|---|---|---|
| The eight "characters" | **Deleted** | They are Octopath Traveler II's protagonists (Square Enix). The party is `characters where is_player`. Never invent game data. |
| "Desert Behemoth" | **Deleted** | Fabricated stat block. Monsters come from `bestiary`. |
| Shield pool / weakness / Break (−5 AC, damage ×2) | **Deleted** | Octopath mechanic, not 5e. Would trivialise `calc_character_ac` and turn every fight into a break-race. HD-2D borrowed the *look*, not the rules. |
| Day/night "path actions" (Steal / Bribe / Mug…) | **Deleted** | Octopath mechanic. Social approaches are ordinary ability checks plus Malachar's affordances feeding the six relationship dimensions — no new verbs. |
| Surprise = "−2 shield points" | **Replaced** | SRD surprise, §3. |
| Initiative = d20 + DEX + proficiency | **Replaced** | d20 + DEX only, §3. |
| Proficiency on every skill check | **Replaced** | Only if proficient, §4. |
| Attack bonus = STR + 3 for everything | **Not adopted** | The live rules engine (`app/api/combat/route.ts`, verdict payload) already does this correctly per weapon/spell. Not this module's job. |
| Sneak Attack on every hit; Smite without spending a slot | **Not adopted** | Same — rules engine territory, and both are wrong (Sneak Attack is once per turn; Smite consumes the slot). |
| `unlocked_nodes` list | **Replaced** | `travel_nodes.discovered_at`, §2. |
| Standalone Python engine with embedded JSON | **Deleted** | A second brain. The rules engine is TypeScript in the repo; the data is in Supabase. The module below is one file, no framework, reads sheet shapes as they exist. |

## 7. The module

`lib/game-context.ts` (delivered alongside this doc). Pure functions, no imports, deterministic when given a seeded RNG (required by Playable Layer §2.1 "deterministic seed"). Exports:

- `GameContext`, `TransitionEvent`, `applyTransition(ctx, event) → { next, reason } | { error }`
- `abilityMod`, `proficiencyForLevel`, `skillAbility`, `normaliseSkill`
- `resolveSkillCheck(sheet, skill, dc, opts)` → roll, total, success, and the arithmetic
- `passivePerception(sheet)`
- `resolveSurprise(hiders, observers, rng)` → per-creature `surprised` flags with the comparisons that decided them
- `rollInitiative(combatants, rng)` → ordered list with ties flagged
- `advanceClock(clock, {rounds | hours})`, `isNight(clock, environment)`

It does not touch the database and does not name an animation — same split the verdict-payload patch argues for. Wiring it into `/battle` and the exploration route is PR work for a repo-attached session (one idea per PR; `combat-board-3d.tsx` needs the who-else check first).

## 8. Provenance

- **Sam-originated:** "keep it 5E"; delete the rest.
- **Claude-originated, for Sam's approval:** four contexts rather than three (camp added per Playable Layer §7); the clock replacing day/night; closed failure vocabulary for interactions; discovery-as-reachability.
- **Third-party blueprint:** the explicit context state machine and "exploration interaction = one skill check". Nothing else survives.
