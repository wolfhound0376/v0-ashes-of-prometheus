# Alchemy: runes at the bench

Status: **built, 2026-10-01.** Gate and riders in `lib/alchemy-runes.ts`; brewing in `app/api/alchemy/brew`; marks in `app/api/alchemy/runes`. Where the eight marks are found: `claude_Alchemy_Rune_Marks.md`.

## At the bench

A brewer who knows a mark can **seal the vessel with one rune**. To do that:
- **The mark must be known** (`character_known_runes`).
- **The brewer must be an arcane caster** (sorcerer, wizard, bard, warlock), **or** a non-caster trained in **Arcana** holding a mark that was **taught** (the "second door", e.g. Fifi).
- **Divine casters never inscribe.** Clerics and paladins consecrate; they don't inscribe (ruling in the brief).
- **One rune material is used up**: drow sigil-wax, rune-chalk or a carved knucklebone. "One stick, one rune." It goes whatever the outcome, and a natural 1 takes the rune with the vessel.

## What each rune does

| School | At the bench | When drunk (named condition, never saved against) |
|---|---|---|
| Abjuration | −1 impurity | advantage on the next saving throw |
| Conjuration | — | the effects last twice as long |
| Divination | — | advantage on the next attack roll |
| Enchantment | — | advantage on the next Charisma check |
| **Evocation** | **+1 potency tier** | nothing more (the tier *is* the rune) |
| Illusion | — | advantage on Stealth and Deception |
| Necromancy | **+1 impurity** | advantage on the next roll |
| Transmutation | — | advantage on the next ability check of your choice |

The bench arithmetic for the three schools that touch the numbers was already in `lib/alchemy-bench.ts`. This piece adds the gate, the material, the record on the flask (`brew.rune`), and the rider on drinking.

**Conjuration: Claude's pick.** The brief offers "double duration, *or* split into two doses". This build takes **double duration**. Splitting means minting a second flask, and that is worth Sam's yes first.

## Learning a mark

**Never from the bench.** Marks are found or taught in the world. The DM records one with `POST /api/alchemy/runes` (x-dm-key; `{characterId, school, learnedVia: found|taught|dm}`). Players can read their own with `GET`.

## Today

No character knows a mark yet (`character_known_runes` is empty), so the rune picker doesn't show for anyone until the table earns one.
