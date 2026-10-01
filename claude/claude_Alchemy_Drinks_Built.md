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

## Time sobers you up (Sam, 2026-10-01)

**5E has no core intoxication rules.** The PHB and DMG mention drinking contests as a Constitution check and go no further. The one published mechanic is *Lost Mine of Phandelver*'s dwarven brandy: two glasses within an hour and you are **poisoned for 1 hour**. That hour is the anchor:

- **Each level wears off after one hour without a drink.** Drinking again restarts the clock. The remainder carries over, so 90 minutes is one level with half an hour banked.
- **Coming round from Ruined leaves `Hungover` for 8 hours**, a long rest's length; that is Sam's "hangover through the next long rest", made time-based. What a hangover does is the DM's to rule.
- **Time is the game clock** (`game_clock`) when one is running, otherwise real time. `game_clock` is empty today, so the table runs on real time.
- **Where it lives:** `characters.inebriation` (migration `20261001130000_inebriation_record`, applied live), with `lib/inebriation.ts` holding `sober()`. It is applied whenever the bench or inventory reads the pack, and before every drink.

## Drink anywhere (Sam, 2026-10-01)

Drinks and brewed flasks have a **Drink** button in the inventory window (`components/alchemy/drink-button.tsx`, mounted in `v4-dashboard.tsx`'s EquipmentManager), so you don't need the camp bench.

## Open, for Sam

1. **"Days."** The spec says beer takes days. This build makes a drink ready at once.
2. **Mushroom Wine is "cleric only" to make.** It is still a drow and duergar staple to *drink*.
