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
| Turn-order strip | **Built** — see the correction below |

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

### 2. Reactions that fire — DEFER, and not because it is hard

**Correction, 2026-10-09, after building tiers 1, 3 and 4.** This was ranked
second. It should be last, and the reason is a fact about the party rather
than about the work.

Measured against the live database:

| Character | Class / level | Reaction spells known |
|---|---|---|
| Fifi | Rogue 1 | none (Uncanny Dodge is Rogue 5) |
| Kenta | Sorcerer 1 | none |
| Samson | Cleric 1 | none — the `shield` match is **Shield of Faith**, already shipped as a ward |
| Scott | Bard 1 | none |
| Bastet | Barbarian 5 | none |

**Nobody in the party holds a single reaction spell.** Counterspell is 5th
level. Uncanny Dodge is Rogue 5. *Shield* is wizard/sorcerer only and Kenta
does not know it.

So the party's entire reaction economy at these levels **is** the opportunity
attack — which tier 1 now delivers. Building the async interrupt flow today
means building a prompt that fires for nothing.

On the monster side 11 of 126 bestiary rows carry a `reactions` blob, so there
is *some* fuel, but an interrupt that only ever serves monsters is a system
that takes agency away from players rather than giving it to them, which is the
opposite of the BG3 feel this plan is chasing.

**The trigger to build it:** the first character to reach level 5, or a
sorcerer/wizard who learns *Shield*. At that point it is worth doing properly,
including the one question that is genuinely Sam's to answer — whether combat
PAUSES for a player's reaction prompt. For a live-play show, stopping the fight
on every incoming attack to ask "Shield?" may cost more in pacing than the
tactics are worth, and that is a show decision, not an engineering one.

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

### 5. ~~Turn-order strip~~ — ALREADY BUILT

**Correction, 2026-10-09, same day this plan was written.** The first draft
called this missing. It is not. The rail is in `combat-hud.tsx`, top centre:
the whole initiative order, `active={i === activeIndex}`, portraits, hit
points, conditions, and allegiance colours, with a pinned card for a summoned
hand.

The error came from looking for a FILE named for it — `ls components/tactical/`
shows `turn-banner.tsx` and no strip — rather than for the behaviour, which
lives inside the HUD. A component is not missing because it lacks its own file.

Nothing to build. **Every Octopath-side item on this plan is done.**

## What is deliberately NOT here

- **Break/boost, path actions** — rejected 2026-09-25, and nothing about this
  plan reopens it.
- **Surfaces** (BG3 grease fires, water conducting lightning). Genuinely great,
  genuinely not 5E, and a large system. Worth its own ruling later; not smuggled
  in here.
- **Companion approval.** BG3's other half, and it belongs to Malachar and the
  relationship system, not the battle board.

## The honest summary

**Built in one sitting, 2026-10-09: tiers 1, 3 and 4.** Tier 5 turned out to
exist already. Tier 1 — opportunity attacks — was worth more than the rest
together, because until movement has a cost the grid is scenery.

Tier 2 is deferred on evidence rather than effort: nobody in the party holds a
reaction spell, so the interrupt flow would fire for nothing. It becomes worth
building at level 5.

That the audit over-counted the gap three times in one day — the stale SFX and
hit-feedback entries, the turn-order strip, and then tier 2's whole premise —
is itself the finding: **this project is consistently further along than its
own notes say, and a plan is worth re-checking against the data before it is
worth executing.** Check `main`, and check the live rows, before believing a
backlog — including this document.

None of it needs homebrew. None of it needs a schema change that is not already
implied by `turn_state`. The project spent months making a hit feel good; this
is the list that makes *where you stand* matter as much as whether you connect.
