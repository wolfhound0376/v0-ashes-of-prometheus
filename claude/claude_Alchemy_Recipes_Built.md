# Alchemy: recipes at the bench

Status: **built, 2026-10-01. Five starter recipes live; they come with the kit.** Spec: `claude_Alchemy_Minigame.md` §6 (the Poisoned Cookbook).

## What works now

- **A recipe is a catalogue row** with `properties.recipe = {ingredients: [slugs], claims: "…"}` and `properties.reliability = true | drifted | sabotaged`. A character learns one into `character_known_recipes`, for example when a journal page is shared (`/api/journal/share` already does that).
- **The bench lists the recipes you know** and offers *Follow*. Follow puts the recipe's ingredients on the bench. Picking an ingredient by hand stops following.
- **Following means brewing what the page says.** If the ingredients on the bench don't match it, the brew route refuses (`not_the_recipe`).
- **A true recipe waives the unknown-ingredient penalty.** This is new, and it is what makes recipes worth having (spec §6, now in `lib/alchemy-bench.ts`, tested).
- **Drifted and sabotaged copies don't waive it,** and they add +1 and +2. The brewer believes they're covered and isn't. Silent, as specified.
- **Reliability is never sent to the browser** by the bench routes.

## Not done, on purpose

- **Sabotage's effect swap** ("one ingredient is wrong in a way that swaps the effect") is not modelled. Only the +2 is.
- **Spotting a drifted copy** (moderate Intelligence (Nature) when read) is not modelled.
- **Leak:** `items` is public-read, so a determined player with the anon key could read `properties.reliability`. Moving reliability to a service-role table would close it.

## The starter recipes — approved ("the five starter recipes that go with the kit", Sam 2026-10-01)

Live as catalog rows (`20261001140000_kit_recipes.sql`). Each carries `properties.recipe.kit = "alchemists-supplies"`: **anyone carrying Alchemist's Supplies knows all five.** Nobody in the party carries the kit today (Fifi has the proficiency but not the tools), so they appear the moment a kit is found or bought.

Worked out from the live `alchemy_effects` grid, 2026-10-01. Each pair shares exactly what the recipe claims and nothing harmful.

| Recipe | Ingredients | Makes |
|---|---|---|
| Field Dressing | barrelstalk + sporebread loaf | Restore Health |
| Deep Eyes | glowcap + blind cave fish | Darksight |
| Antivenom Broth | trillimac + fire lichen | Resist Poison |
| Iron Will | fire lichen + deep rothé milk | Steady Nerve |
| March Ration | cavern lizard meat + fried grubs | Long March |

Per spec, roughly 80 / 15 / 5 true / drifted / sabotaged should come out of loot. The liars are a loot-ceremony decision, not a bench one.
