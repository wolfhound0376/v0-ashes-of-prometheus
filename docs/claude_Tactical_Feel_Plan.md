# Getting the gameplay to Octopath and BG3

Sam, 2026-10-09: *"how do we get the gameplay close to octopath and BG3"*

## The short answer

**Take the tactics from BG3 and the presentation from Octopath — and that split
is forced, not chosen.**

BG3 *is* 5E. Almost everything that makes it feel good — opportunity attacks,
shove, jump, cover, reactions — is in the SRD already. So "play more like BG3"
costs no homebrew and collides with no ruling.

Octopath's gameplay is a different game. Break/boost and the day-night path
actions were reviewed and **rejected 2026-09-25**; the HD-2D pivot borrows the
look only, and rules stay 5E. That ruling stands here. What Octopath still has
to teach is *presentation*: legible turn order, a hit that lands with weight,
numbers you can read from across the room.

So: **BG3 tells us what the player may DO. Octopath tells us what it LOOKS and
FEELS like when they do it.**

## Where the project actually stands (verified 2026-10-09, not from notes)

The backlog was stale in the project's favour. Measured against `main`:

| Octopath side — presentation | State |
|---|---|
| Hitstop, camera shake, weapon hold | **Built** (`lib/hit-juice.ts`, `lib/viewmodel.ts`) |
| Damage numbers, outcome words | **Built** (`damage-numbers.ts`, `outcome-word.ts`) |
| Impact bursts, blood, death VFX, tombstones | **Built** |
| Spell VFX: school runes, splash, target sigils | **Built** |
| SFX in combat | **Built** (`lib/sfx.ts`, `lib/sfx-cues.ts`, referenced by the board) |
| Turn-order strip | **Missing** — `turn-banner.tsx` announces one turn; nothing shows the queue |

The old note "hit feedback mostly plumbed but unwired" and "the live bundle
contains zero SFX references" are both **out of date**. Both landed.

| BG3 side — tactics | State |
|---|---|
| Move, attack, cast, hide, stabilize, summon | **Built** |
| **Opportunity attacks** | **Missing.** An icon, a blurb and a panel row — no engine |
| **Reactions actually firing** (Shield, Counterspell, Uncanny Dodge) | **Missing.** `reactions-panel.tsx` has no `fetch` — display only |
| **Shove / jump** | **Missing** |
| **Cover from scenery** | **Data only.** Props carry `provides_cover`; the board never reads `blockedBy`/`difficultBy` |

The pattern is clear and worth saying plainly: **the look is nearly there; the
tactics are thin.** Months of work went into making a hit feel good. Very
little has gone into making a *position* matter.

## The one that matters most

**Opportunity attacks.**

Right now movement is free. Nothing punishes walking away from a drow, so there
is no cost to being anywhere, so the grid is decoration — a pretty surface that
the fight happens on top of rather than in. Every other tactical verb below is
worth less until this exists, because each of them is ultimately about
*position*, and position is currently free.

It is also the most prepared: `turn_state` already carries a `reaction: false`
that nothing spends, and the movement overlay already computes reach geometry.
The parts are cut; nothing has assembled them.

One rule, and the board stops being a diagram.

## Build order

Each tier is worth shipping alone. Ordered by felt-change per unit of work.

### 1. Opportunity attacks
Leaving a hostile's reach without Disengaging provokes. Spends the defender's
reaction; one per round. Needs: a provoke check on `action: "move"`, the
reaction spent on `turn_state`, and a prompt when it is a PC's reaction to
spend. Pure SRD.

**Changes:** the whole meaning of movement.

### 2. Reactions that fire
The panel lists Shield, Counterspell, Uncanny Dodge and does nothing. Make the
list live: when an attack would hit and the target holds an eligible reaction,
offer it before damage resolves.

**Changes:** the board stops being dead on other people's turns. This is most of
what "BG3 feel" actually is — a fight where everyone is present the whole time,
not a queue of solo turns.

### 3. Shove and jump
Shove: Athletics vs Athletics/Acrobatics, 5 ft back or prone. Jump: distance off
Strength, costs movement. Both pure SRD, both cheap.

**Changes:** the "can I just…?" surface. Shoving a drow into the rapids on the
sandbox map — which are already difficult terrain by Sam's ruling — is exactly
the BG3 moment, and the map is already built for it.

### 4. Cover from the scenery
The 191 props already carry half/three-quarters/full cover and `blocks_movement`.
The board draws them and ignores them. Make the movement overlay consult
`blockedBy`/`difficultBy`, and apply the AC bonus on attacks through cover.

**Changes:** scenery stops being wallpaper. Cheapest real tactics on the list —
the data is sitting there already, which is also why this one is embarrassing.

### 5. Turn-order strip
The only Octopath item. A persistent strip of who acts next, in order, with
portraits. Everything else on that side is done.

**Changes:** lets a player plan two turns ahead instead of one — which is the
actual mechanism behind why Octopath combat feels readable.

## What is deliberately NOT here

- **Break/boost, path actions** — rejected 2026-09-25, and nothing about this
  plan reopens it.
- **Surfaces** (BG3 grease fires, water conducting lightning). Genuinely great,
  genuinely not 5E, and a large system. Worth its own ruling later; not smuggled
  in here.
- **Companion approval.** BG3's other half, and it belongs to Malachar and the
  relationship system, not the battle board.

## The honest summary

Five items. One of them — opportunity attacks — is worth more than the other
four together, because until movement has a cost the grid is scenery. Two more
(reactions, shove/jump) are pure SRD. One (cover) is wiring data that already
exists. One (turn strip) is the only Octopath item left standing.

None of it needs homebrew. None of it needs a schema change that is not already
implied by `turn_state`. The project spent months making a hit feel good; this
is the list that makes *where you stand* matter as much as whether you connect.
