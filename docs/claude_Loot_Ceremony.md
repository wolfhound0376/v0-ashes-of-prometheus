# The Loot Ceremony

What happens when something comes off the floor of the battle board, and why
it is worth spending any code on at all.

Branch: `feat/loot-ceremony`. Touches `components/tactical/ground-item-props.ts`
and `components/tactical/combat-board-3d.tsx`. No schema change.

## The fact that decides everything

**Two of the three pieces already existed and were never connected.**

`sfx/ui/item_pickup.ogg` and `sfx/ui/coin_purse.ogg` were both recorded in the
93-clip SFX pass and uploaded to `vtt-assets/sfx/ui/`. Neither is referenced
anywhere in the codebase. The hover read-out that names a pile under the cursor
was already built, too.

So this is mostly wiring, and that is the honest shape of the work: the floor
was not missing a feature, it was missing three connections. Check what exists
before building — an earlier session's notes claimed both the tooltip and the
whole SFX layer were absent, and both claims were wrong.

## What was actually wrong

Taking something off the floor was a `fetch` and one line of text in the log.

No colour, no sound, no motion. The one moment the floor pays off — the moment
a player bends down and gets something — was the one moment in the whole board
with no feedback at all. A pile also vanished between two frames, which reads
as a dropped frame rather than as a reward.

## The three parts

### Rarity is the ring

Every pile drew the same gold ring regardless of what it was, so a Potion of
Greater Healing and a bedroll were visually identical from more than a square
away.

The ring now takes its colour from **`RARITY_TINT` in `lib/equipment.ts`** —
the same table the paper doll and the held-weapon glow already read. That
matters more than the colours themselves: this codebase has a documented
history of the same concept living in two places and drifting (see AGENTS.md
§8, "Two of several things"). There is now one answer to "what colour is rare".

| Tier | Ring | Live catalogue |
|---|---|---|
| common | gold `0xe0b45a` (the old default) | 168 |
| uncommon | green `0x4fbf6a` | 33 |
| rare | blue `0x4a86d8` | 21 |
| very_rare | purple `0xa45fd0` | 5 |
| legendary | amber `0xd99a2b` | 4 |
| artifact | amber `0xd99a2b` | 0 |

Rarer rings also breathe brighter — a gain of 1.0 at common rising to 2.1 at
legendary — **capped at 0.95 opacity**, because the ring is additively blended
and anything past 1.0 blows out to white, losing the colour that is the entire
point of the change.

Commons deliberately keep the old gold. `RARITY_TINT` maps `common` to `null`
on purpose, and tinting all 168 of them would make the signal mean nothing.

### The sound of taking it

- **Currency** → `ui/coin_purse`
- **Everything else** → `ui/item_pickup`
- **Rare and above** additionally → `ui/loot_rare`, scoped `party`

The scope split follows `lib/sfx-cues.ts`, which defines `self` as UI feedback
that is nobody else's business and `party` as "things the whole table is
watching happen". A legendary coming off the floor is the second kind; a rogue
pocketing a ration is not.

`ui/loot_rare` **has no audio file yet**. That is deliberate and safe: the cue
module states that an unknown slug is ignored by design, so cues can be wired
ahead of the audio existing. It stays silent until the clip is uploaded to
`vtt-assets/sfx/ui/`, with no code change needed then.

### Taken things leave

A claimed pile lifts, grows to 1.35×, and fades to nothing over **0.45s**,
then disposes.

Two details that are load-bearing:

- The row leaves the `drawn` map **immediately**, so TAKE and the click raycast
  stop offering a pile that is already in someone's pack. Only the drawing
  lingers.
- `alphaTest` is set to 0 on the way out. It clips rather than blends, so a
  fading icon would otherwise hold full opacity and then pop at the end.

A pile that merely *moves* square (a DM nudge) is redrawn instantly and does
not get the ceremony — only a genuine disappearance from the server's list
counts as someone taking it.

## Data

Nothing new. `items.rarity` and `items.item_type` already existed and are now
read alongside `pixel_icon_url` in the one query the board already made, rather
than in a second round trip.

Piles drawn before that query lands carry the default gold; `redraw()` is
called when it arrives so they pick up the colour they earned.

## Known compromises

- **Legendary and artifact share amber.** Inherited from `RARITY_TINT`, not
  introduced here. With 0 artifacts in the live catalogue it costs nothing
  today; it will need its own colour the first time one is placed.
- **All three piles currently on the live floor are common**, so the rarity
  colour is correct but invisible in play until non-common loot is dropped.
- **`ui/loot_rare` has no audio.** See above.
- **The board's hit-feedback pipeline is untouched.** Hitstop, damage numbers
  and impact bursts are a separate unwired system and do not belong in a loot
  change.

## Build order

1. ~~Rarity ring, pickup sound, lift-and-fade~~ — done, `feat/loot-ceremony`.
2. Record `ui/loot_rare` and upload it. No code change.
3. Give `artifact` its own colour in `RARITY_TINT` before the first one is
   placed. One line, but it changes the paper doll and held weapons too.
4. The item's own `description` in the hover read-out. The catalogue has real
   flavour text ("A blade knapped from volcanic glass. Wickedly sharp,
   alarmingly brittle.") and the tooltip currently shows only name, tier and
   the action line.
