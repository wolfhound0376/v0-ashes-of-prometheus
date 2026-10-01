# Alchemy: drinks, built

Status: **built, 2026-10-01.** Ladder in `lib/inebriation.ts`; making in `lib/drink-making.ts`. Routes: `app/api/alchemy/quaff` (drink a drink) and `app/api/alchemy/make-drink`. A brewed *potion* is still `app/api/alchemy/drink`. Content: `claude_Underdark_Drinks.md`. Rules: `claude_Alchemy_Minigame.md` §7.

## Drinking (Sam's ladder)

One **CON save per drink** at the drink's DC: beer 10, wine 12, liquor 14.
- **Fail** and you climb the drink's steps: 1, or 2 for high-proof liquor.
- **Pass** and you hold where you are.
- **Sporebread Small Beer** can never take you past Warm.

| Level | On the sheet | Also |
|---|---|---|
| 1 Warm | advantage on saves vs. fear, disadvantage on Dexterity checks | |
| 2 Drunk | disadvantage on Dexterity checks and attack rolls, advantage on Charisma checks | |
| 3 Soused | disadvantage on everything | **Poisoned** |
| 4 Ruined | hangover through the next long rest | **Unconscious**, Poisoned |

The level rides as a named condition, e.g. `Drunk (inebriated 2)`. That is how every named state rides; there is no duration tracking anywhere in the codebase. Soused and Ruined also carry the real SRD conditions, so the board sees them. Sobering up only clears the Poisoned and Unconscious this ladder added. A Poisoned that came from somewhere else stays (tested).

## Making

| Class | Who | Needs |
|---|---|---|
| Beer | any brewer | what `made_from` lists, **prepared** |
| Liquor | any brewer | the same, plus a **still** in the pack (except Nightlight Cordial, whose row says any brewer) |
| Wine | **cleric only** | the same |

- **No roll.** The spec gives classes, makers and needs, and no check, so none is invented.
- **Ingredients must be prepared**, because extraction applies here too: a mash is ground bluecap. Another drink in the recipe (communion wine ← mushroom wine) is used as it is.
- The drink goes in first, then what it was made from is taken.

**Data.** The three drinks that predate the drinks list (Darklake Stout, Fire Lichen Liquor, Mushroom Wine) had no `properties.drink`, so nothing could drink or make them. Migration `20261001120000_drink_data.sql` (data only, applied live) gives them the approved ladder numbers, with `made_from` taken from the drinks doc's existing-rows table.

## Open, for Sam

1. **"Days."** The spec says beer takes days. This build makes a drink ready at once. Fermenting time needs the game clock wired in.
2. **Sobering up.** Nothing lowers the level yet. A long rest should clear it, and Ruined should leave a hangover. That belongs in the long-rest path of `lib/camp.ts`.
3. **Mushroom Wine is "cleric only" to make**, which means the party makes wine only through Samson. It is still a drow and duergar staple to *drink*. (This was flagged in the drinks doc on 2026-09-29 and is still open.)
