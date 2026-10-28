# Top Heroes Combat, Wave 2 — the lane (2026-10-27)

**Sam:** "lets make combat more fun, keeping the strategy of DND5E but having some game play (action/strikes/movement/bosses/loot/maps) like that of top heroes style."

The standing rule that frames every line below: **rules stay 5e** (Octopath's shield/break was reviewed and rejected 2026-09-25; HD-2D and now Top Heroes lend the *look and feel*, never a mechanic). Everything in this lane is presentation over the same rolls, or a 5e rule that already exists made visible.

## Where the six axes stand after wave 1 (2026-10-27)

| Axis | On main | Gap |
|---|---|---|
| Action | Top Heroes action bar — illustrated slabs, Sam's order (#1006, #1009, #1011) | — |
| Strikes | Street Fighter swipes, claw rakes, bites, hit-stop, shake, damage numbers, bursts, sparring misses (parry/duck/sway) | — |
| Movement | AFK Journey formation follow (#980), camera (#983), movement by initiative, opportunity attacks | — |
| **Bosses** | `boss: true` on Shoor and Ilvara — picked the music only | **everything — PR 1 of this lane** |
| Loot | loot fountain (#979), loot on kill (#995), Diablo-style item card (#1007/#1010), pixel chests (#1003) | boss loot; a real victory card |
| Maps | plates populated by the book's odds (#844), cover and line of sight, falls, ice, poison clouds | waves / arena interactables — later |

## PR 1 — Boss fights: the entrance, the bar, the Bloodied beat — **PR #1029**

https://github.com/wolfhound0376/v0-ashes-of-prometheus/pull/1029 (`feat/boss-fights`)

- **Entrance**: title slam over a dark band — face card, red BOSS kicker, the name, the book's epithet — camera on the boss for 2.6 s, the drow alarm gong for a drow boss (a beast's own call otherwise; nothing invented), the boss alone speaks, then the first turn.
- **Boss bar** under the turn strip in the action bar's slab: face, name, epithet, a wide HP bar with the half mark. **No number** — a DM describes a wound. The one word it says is **BLOODIED** at half.
- **Bloodied beat**: callout, burst, the bar flashes, a taunt, a log line. Once.
- **The fall**: longer hit-stop, harder shake, the bar drains and leaves.
- **Rules in one copy**: `lib/boss-fight.mjs` (pasted into the map like `gate-watch.mjs`). Who the boss is = the test `moodFor` already used for the music (flagged block, or one foe with ≥60% of the fight's XP and ≥ the party's Deadly budget), lifted out so the music and the bar read one answer. 13 tests.
- **5e**: nothing mechanical changed. Bloodied is narration (no such condition in SRD 5.1 or 5.2.1).
- **Epithets**: Shoor "Drow elite warrior" (OotA p.13), Ilvara "Priestess of Lolth". Both the book's.

## PR 2 — Telegraphs (proposed)

Top Heroes bosses *show* the big one coming. 5e already has the hooks; the map just doesn't draw them.

- **Recharge ready**: a pulsing badge over the head the turn a Recharge (5–6) ability comes back — today it is a text pop ("web ready") gone in a second. SRD rule, already rolled on the map.
- **The wind-up**: a half-second beat before a boss's Multiattack or ranged attack — the target's base flashes, the camera leans — pacing only, the roll is the same roll.
- **Bloodied → Malachar**: hand the beat to the DM core (`handOff`) so he can run the book's own script — OotA has Ilvara cast web / conjure animals / insect plague and *flee calling for help*. That is his, not the map's.
- **Sam's call**: whether a boss's *first* hit of the fight gets a slow-motion beat (pure presentation).

## PR 3 — Boss loot (proposed)

- A boss kill fountains bigger (more arc, more sparkle, a longer hold) — the fountain is #979's, only its size changes.
- Drops its **canonical kit**: what the `items` catalogue says it carries (Ilvara's gear per OotA; the bestiary / `npc_encounters` rows). **Nothing invented** — if the catalogue has no row for a piece, it does not drop, and the gap is reported, not filled.
- A boss chest only where the book puts one (Ilvara's chest already exists on the map).

## PR 4 — The victory card (proposed)

Top Heroes' stage-clear screen, over the fight's real numbers: XP per hero with the bar toward the next level (the SRD table), loot taken this fight, "ready to level up" (the level is still taken at camp or wherever `allows_level_up`), "nobody fell". Replaces the small `${xp} XP` banner; the triumphant sting stays. No stars, no grades — nothing the rules don't award.

## Later / not in this lane

- **Waves**: guards from the next room arrive on round N — the plate's own inhabitants, by the book's odds. A "reinforcements" strip is the Top Heroes read of a 5e thing that already happens ("one guard attacked is every guard in the room").
- **Arena interactables** (BG3): shove into the falls, drop a chandelier — Shove already exists; what's missing is painted objects that answer to it.

## Loose ends found on the way (not touched)

- `FOE_BLOCKS.jorlan` on the map is the plain Drow (13 hp, AC 15); the live `bestiary` row `jorlan-duskryn` is the Drow Elite Warrior (71 hp, AC 18, Black Pudding Scars) since 2026-10-26. The map's block is stale, so Jorlan can never be a boss there today.
- Shoor and Ilvara have no `TAUNTS` lines and no canon face in `velkynvelve-walk/cards/` — their lines are Sam's to write; the card falls back to the sprite's head and shoulders.
- Creatures Malachar brings in carry no XP/CR on the stage roster (`StageEntry`), so one of his is never the boss unless its slug has a block. The roster would need `xp` from the bestiary.
- Pre-existing failing test on main: `lib/chromatic-orb-art.test.ts › gives every area of the map a floor surface` — `node-05c-lift-cliffside` (the labor cliff plate) has no footstep surface.
- Four stale merged branches still on the remote showed in the collision check: `feat/ingredients-in-db` (#998), `fix/walk-loot-no-seat-and-class-bonuses` (#978), `feat/sneak-cones-and-gate-split` (#943), `fix/gate-watch-scans-everyone` (#937).
