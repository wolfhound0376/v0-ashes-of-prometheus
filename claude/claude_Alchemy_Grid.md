# Alchemy Ingredient Grid

The four-effect table every brew resolves against. Status: **draft for Sam's approval 2026-09-29. Nothing written to the catalog.**

Rules: `claude/claude_Alchemy_Minigame.md`. Drinks: `claude/claude_Underdark_Drinks.md`.
Validator: `scripts/alchemy/grid_check.py` — run it after any hand-edit.

---

## How to read it

Every ingredient carries four effects in a fixed order. A brew takes 2–3 ingredients; **any effect shared by two or more of them becomes the potion.** No shared effect, no potion.

- **Column 1 is what tasting reveals** (bolded below). It is always the ingredient's most self-evident property, taken from its own catalog description — so a player who eats something and pays attention learns something true.
- Columns 2–4 are revealed by a successful brew that used that effect, by an NPC teaching it, or by a recipe that names it.
- `*` marks an ingredient you have to loot, harvest or buy rather than forage.

Column 1 is **not always the good one.** `bluecap` tastes of `sicken` because its own row says it is inedible raw. That is the lesson the mechanic teaches.

## The grid

| slug | tasting reveals | col 2 | col 3 | col 4 | why column 1 is that |
|---|---|---|---|---|---|
| `barrelstalk` | **purge-disease** | resist-poison | restore-health | iron-stomach | tapped for fresh water |
| `blind-cave-fish` | **darksight** | resist-poison | soft-step | mind-link | it has no eyes and does not need them |
| `bluecap` | **sicken** | long-march | purge-disease | steady-nerve | inedible raw, as its row says |
| `cave-cricket-skewer` | **wakefulness** | soft-step | steady-nerve | iron-stomach | pure protein; you do not sleep |
| `cavern-lizard-meat` | **soft-step** | long-march | wakefulness | keen-scent | a wall-runner |
| `deep-rothe-jerky` | **long-march** | purge-disease | wakefulness | iron-stomach | keeps forever, travels forever |
| `deep-rothe-milk` | **restore-health** | iron-stomach | sicken | steady-nerve | rich enough to mend you |
| `edible-mushrooms` | **sicken** | rot | confuse | restore-health | edible if you are certain, and you are not |
| `fire-lichen` | **burning-blood** | steady-nerve | resist-poison | wakefulness | a ferocious burn |
| `fried-grubs` | **iron-stomach** | rot | long-march | sicken | fried in their own fat |
| `nightlight-fungus` | **inner-light** | keen-scent | steady-nerve | darksight | bright light, 15-foot radius |
| `nilhoggs-nose` | **keen-scent** | confuse | darksight | soft-step | sharpens the nose |
| `ormu-moss` | **inner-light** | resist-poison | restore-health | burning-blood | bioluminescent |
| `ripplebark` | **restore-health** | rot | long-march | purge-disease | genuinely good roasted |
| `sporebread-loaf` | **long-march** | steady-nerve | restore-health | wakefulness | civilizations run on it |
| `timmask` | **confuse** | sicken | shrink | seize | a cloud of intoxicating spores |
| `torchstalk` | **burning-blood** | wakefulness | inner-light | corrode | a combustible cap |
| `trillimac` | **soft-step** | resist-poison | purge-disease | long-march | the cap cures into leather |
| `waterorb` | **purge-disease** | shrink | soft-step | iron-stomach | squeeze it, it gives up a gallon |
| `zurkhwood` | **swell** | steady-nerve | resist-poison | restore-health | towering |
| `bigwig` \* | **swell** | iron-stomach | burning-blood | confuse | you get very large |
| `carrion-crawler-mucus` \* | **seize** | keen-scent | rot | numbing-venom | paralytic on contact |
| `gray-ooze-residue` \* | **corrode** | numbing-venom | rot | sicken | eats metal |
| `ormu-ink-vial` \* | **inner-light** | silver-tongue | mind-link | wakefulness | readable in total darkness |
| `pygmywort` \* | **shrink** | confuse | silver-tongue | keen-scent | the world gets large, so you got small |
| `tainted-spores-pouch` \* | **rot** | seize | mind-link | swell | humming with Zuggtmoy's corruption |
| `tongue-of-madness` \* | **silver-tongue** | mind-link | sicken | confuse | you say what you are thinking |
| `vial-of-rapport-spores` \* | **mind-link** | soft-step | silver-tongue | keen-scent | a brief telepathic link |
`*` = looted, harvested or bought.

## Effect vocabulary

Twenty-two effects. Potency tier (I/II/III) scales duration and magnitude; the spec's impurity rules are unchanged.

**Restorative and protective**

| effect | what a potion of it does |
|---|---|
| `restore-health` | hit points back. The prize, deliberately scarce. |
| `purge-disease` | ends one disease |
| `resist-poison` | advantage on saves against poison |
| `iron-stomach` | advantage on Constitution saves against anything swallowed |
| `steady-nerve` | advantage on saves against being frightened |
| `long-march` | removes one level of exhaustion, or ignores a day's travel fatigue |
| `wakefulness` | no sleep needed; advantage against magical sleep |

**Sensory and social**

| effect | what a potion of it does |
|---|---|
| `darksight` | darkvision, or extends existing darkvision |
| `keen-scent` | advantage on Perception and tracking by smell |
| `inner-light` | the drinker sheds light. Also disadvantage on Stealth — this one cuts both ways. |
| `soft-step` | advantage on Stealth |
| `silver-tongue` | advantage on Charisma checks |
| `mind-link` | brief telepathy with one willing creature |

**Harmful**

| effect | what a potion of it does |
|---|---|
| `sicken` | the poisoned condition on a failed save |
| `numbing-venom` | poison damage |
| `burning-blood` | fire damage |
| `corrode` | acid damage; damages metal |
| `rot` | necrotic damage |
| `seize` | restrained, then paralyzed, on successive failed saves |
| `confuse` | as the confusion effect, briefly |

**Strange**

| effect | what a potion of it does |
|---|---|
| `swell` | as *enlarge* (SRD) |
| `shrink` | as *reduce* (SRD) |

## What the validator enforces, and why

Two earlier drafts of this grid failed, both in the same way, and the checks exist because of it.

**Draft 1 — 40 near-duplicate pairs.** Every food row had been given "it is nourishing" as an effect, so fifteen of twenty-eight ingredients shared `restore-vigor` and thirteen shared `restore-health`. Half the pantry was interchangeable, which destroys the discovery layer: learning the second ingredient teaches you nothing about the first. **Nourishment is what rations do. It is not an alchemical effect** — that is the fix, and `restore-vigor` was deleted outright.

**Draft 2 — 11 pairs, then 3 that would not sit still.** Hand-tuning moved conflicts around rather than removing them, because the staple foods genuinely do resemble one another. The final assignment was solved rather than written: each ingredient got a pool of thematically defensible effects, and a constraint search picked the four.

The constraints, all in `grid_check.py`:

1. **Four distinct effects per ingredient.**
2. **No effect on fewer than two ingredients** — a brew needs a *shared* effect, so a unique one can never be made.
3. **No two ingredients share three or more effects** — that is the interchangeability failure above.
4. **No effect on more than seven ingredients** — otherwise it is the default outcome of any brew rather than a discovery.

Current state: **all four hold.** 28 ingredients, 22 effects, 198 of 378 possible pairs brew something, and 132 of those yield exactly one clean effect.

Six effects need at least one looted ingredient and cannot be brewed from foraged stock alone: `numbing-venom`, `corrode`, `seize`, `swell`, `silver-tongue`, `mind-link`. That is intentional — the nastier and stranger half of the table is gated behind going somewhere and taking something.

## Sourced vs homebrew

**SOURCED:** every ingredient row, its name and its described properties, already in the `items` catalog and drawn from Out of the Abyss and Underdark canon; *enlarge/reduce*, the poisoned condition, exhaustion, advantage and disadvantage, darkvision (SRD).

**HOMEBREW — all of it invented for this campaign, and all of it Sam's to overrule:** the four-effect structure, every per-ingredient assignment, the effect vocabulary and what each effect does, the common/looted split, and the four constraints above.

## Open questions

1. **Approve or redline the grid per ingredient.** Nothing goes near the catalog until this is signed. The easiest redline is per row: name the ingredient and the effect you would swap.
2. **Is `restore-health` on eight ingredients still too many?** It is the most valuable effect in the table and the easiest to trivialize. Tightening it to four or five is a one-line change to the pool and a re-solve.
3. **`inner-light` giving disadvantage on Stealth** makes it the only effect with a built-in drawback. Keep, or move that to the impurity system where drawbacks otherwise live?
4. **28 ingredients is the starting set.** Monster-harvest reagents, drow-made components and anything the bestiary expansion adds would extend it; each new ingredient must re-pass `grid_check.py`.
