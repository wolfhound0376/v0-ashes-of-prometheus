# Alchemy, Runes and Drink

Design spec for the camp-side crafting system. Status: **approved in conversation 2026-09-29, shelved behind exploration mode.** Nothing here is built.

Sam's rulings are recorded inline and marked. Everything not marked "SOURCED" is homebrew.

---

## Why this shape

The system is built from Skyrim's interaction cost, not Potion Craft's. Potion Craft is a spatial puzzle on a fogged parchment map where the player physically grinds, stirs and heats; a good brew takes minutes. That does not survive a live table with three other players and a lich waiting. Skyrim's alchemy is a three-click menu where skill, not player precision, sets potency — which is already the shape of 5e crafting and needs no rules homebrew to sit on.

What Potion Craft keeps: discovery as the real progression, and a failure that gives you something rather than nothing.

**Design rule this whole spec obeys: the puzzle never replaces the d20.** Same discipline as the HD-2D pivot — borrow the structure, keep 5e in charge.

---

## The two numbers

Every potion off the bench carries **Potency** (I / II / III) and **Impurity** (0–3).

- The Grid decides *what* the potion does.
- Proficiency, runes and bases decide *how strong*.
- Proficiency, ignorance and bad recipes decide *how dirty*.

Impurity is the skill ladder. At level 1 untrained everything is impurity 2–3 and every potion is a small compromise; once earned proficiency lands, 0–1 is the baseline. **Alchemy skill is measured in how little your potions cost you.**

---

## 1. The Grid — what the potion does

Every ingredient carries **four effects in a fixed order**. Pick 2–3 ingredients; any effect shared by two or more becomes the potion. No shared effect, no potion, and the ingredients are consumed.

Schema: `items.alchemy_effects` as an ordered jsonb array of four slugs into a new `alchemy_effects` table. jsonb rather than four columns so the ordering is explicit and the per-character reveal state is a cheap diff.

**Effect markers are catalog slugs, never generated.** Every reachable effect is a row that already exists. This is a hidden-catalog reveal, not emergent content — it satisfies the standing rule that the AI invents no game data.

## 2. Eat It And See — how the Grid is learned

- **Column 1** is revealed by tasting the ingredient. Free action at camp.
- **Columns 2–4** are revealed by a successful brew that actually used that effect, by an NPC teaching you, or by a recipe that names it.
- Knowledge is **per character**. Kenta learning what bluecap does teaches Fifi nothing.
- Tasting an unknown: **DC 10 Constitution save, or column 1 happens to you at tier I.** Timmask spores do what timmask spores do.

Table: `character_known_effects (character_id, item_slug, column_index, learned_via)`.

This is the cheapest content in the system. Four players at camp, a bag of unidentified Underdark fungi, and a DM with no incentive to warn anyone.

## 3. Arcane runes — advantage, not potency

**Sam's ruling:** runes mostly provide advantage or buffs to *rolls*. They take arcane mastery or knowledge that is **found**. **Only magic users can add runes.**

Runes are consumable catalog items — drow sigil-wax, rune-chalk, a carved knucklebone — inscribed on the vessel before sealing.

### Who can inscribe
Arcane spellcasting, or Arcana proficiency plus a taught mark. **Divine is not arcane (Sam's ruling)** — clerics are excluded from the rune path and have their own, below.

Gate per mark, not per character: `character_known_runes (character_id, school, learned_via)`. Knowing evocation teaches nothing about illusion. Marks are found — drow sigil-plates, a dead wizard's field notes, an NPC who owes you, something carved in the Velkynvelve stone.

### What each school does to the drinker

| School | Effect |
|---|---|
| Transmutation | advantage on the next ability check of a chosen type |
| Abjuration | advantage on the next saving throw, or +1 AC for the duration |
| Divination | advantage on the next attack roll |
| Enchantment | advantage on the next Charisma check |
| Illusion | advantage on Stealth and Deception for the duration |
| Conjuration | double duration, or split into two doses |
| Evocation | fortify — raises the potion's own numbers. The one true potency rune. |
| Necromancy | advantage on the roll, **+1 impurity.** Power with a bill. |

Only evocation and necromancy touch potency. Everything else buys a better *chance*, which is both a better 5e fit and much harder to break.

**One rune per potion.** Two would stack advantage into nothing (5e does not stack advantage) and invites the Skyrim alchemy/enchanting feedback loop. Scarcity of the wax does the rest.

### Art
Zero new art. The eight school colours, ring motions and baked `rune<School>.webp` sheets carry this whole system; the rune flashes on the vessel when the potion is drunk.

**All of it is already on `main`** (verified 2026-09-29). Colour comes from `SCHOOL_RAMP` in `lib/spell-school.ts`, measured off Sam's own eight-emblem reference sheet and signed off 2026-09-28. `lib/spell-school-vfx.ts` maps each school to a ring motion on top of it. Nothing blocks this section.

The reference sheet does not separate the eight hues evenly — abjuration and illusion are both blue about 4 degrees apart, and divination is violet rather than achromatic — so **motion, not colour, is what distinguishes a school**, and there is a test on `main` asserting that any two schools close in hue must differ in motion. Any rune UI built for alchemy must show the motion, not a static colour swatch, or it loses the distinction the board relies on.

## 4. Divine bases — the cleric's half

**Sam's ruling: only clerics can make holy water. Only clerics can make wine.** Wine is sacramental, cleric-gated, and closer to holy water than to beer.

A cleric does not inscribe — they **consecrate the liquid the potion is built on**, before the brew rather than after it. Two SRD spells already do the work:

- **Purify Food and Drink** (1st, ritual) — renders nonmagical food and drink free of poison and disease. *SOURCED.*
- **Holy water** — one hour, 25 gp of powdered silver, a 1st-level slot, a flask of water. *SOURCED.*

| Base | Effect on the potion |
|---|---|
| Water | default, nothing |
| Blessed water | impurity capped at 1 — it cannot get truly foul |
| Holy water | the potion also damages fiends and undead on contact; throwable |
| Underdark bases | fungal wines, darklake water — shifts which effects are reachable |

Blessed water works **preventively**: the cleric blesses a flask tonight, the brewer uses it tomorrow, the potion never gets dirty. That is a cleric doing cleric things — prevention, not repair.

### Balance fix on Purify Food and Drink
Read literally, a 5-ft-radius ritual deletes the entire impurity ladder the moment the party has a cleric. **Homebrew ruling: purification costs a tier.** Impurity to 0, potency down one. One potion per casting, and it spends the cleric's camp action.

That keeps the real choice live — dirty and strong, or clean and weak — and a brewer good enough to hit impurity 0 unaided never has to pay the tier.

Holy water balances itself: 25 gp of powdered silver is its own quest in the Underdark.

## 5. Impurity — the buff with a little debuff

Computed at brew time, starting at 0:

- **+1** not proficient with alchemist's supplies / herbalism kit
- **+1** per ingredient whose effect you used but have not discovered — you got lucky, not skilled
- **+1** the recipe you followed is sabotaged *(the player is not told)*
- **−1** per abjuration rune
- **−1** at the earned-proficiency milestone
- Floor 0, cap 3

| Impurity | What you also get |
|---|---|
| 0 | Clean. Nothing extra. |
| 1 | **Residue** — disadvantage on your next check of one type, or −1d4 on your next save, or an hour of sluggishness |
| 2 | **Taint** — the residue, plus you are marked. It smells. NPCs clock it. Drow definitely clock it. |
| 3 | **Corruption** — the above plus a condition that needs a long rest or a remedy to clear |

**Load-bearing rule: impurity never stops the potion from working.** A corrupt healing potion still heals. It also leaves you reeking of spoiled fungus in a slave pen. The downside is narrative, not numerical denial — the difference between a cost and a punishment.

## 6. The Poisoned Cookbook

Recipes are catalog items with a `reliability` field, roughly 80 / 15 / 5:

| Value | Effect |
|---|---|
| `true` | works, and following it waives the unknown-ingredient impurity penalty — this is what makes recipes worth having |
| `drifted` | a bad copy or an honest error. +1 impurity. Spottable on a moderate Intelligence (Nature) check when read. |
| `sabotaged` | written by a drow who did not have your health in mind. +2 impurity and one ingredient is wrong in a way that swaps the effect. Hard check, or you would need to know the author. |

A bad recipe inflates impurity **silently**. Nothing goes wrong at the bench. You find out three hours later, in the dark. A trap that needs no saving throw — only trust.

Hangs off loot ceremony and the journal system. Keep the liars rare or players stop trusting any recipe.

## 7. Drink

**Sam's ruling:** alchemy also makes beer, wine and liquor, to be drunk, sold, or consumed for inebriation.

| Class | Who makes it | Needs |
|---|---|---|
| Beer | any brewer | grain or fungal mash, days |
| Liquor | any brewer | a still; higher proof, higher value |
| **Wine** | **cleric only** | fruit or fungal must, and the blessing |

Full beverage list: `claude/claude_Underdark_Drinks.md`.

### Inebriation ladder

**Sam's ruling: level 1 affects Dexterity.**

| Level | Effect |
|---|---|
| 1 — Warm | advantage on saves vs. fear, **disadvantage on Dexterity checks** |
| 2 — Drunk | disadvantage on Dexterity checks *and* attack rolls, advantage on Charisma checks |
| 3 — Soused | poisoned condition, disadvantage on everything |
| 4 — Ruined | unconscious, hangover through the next long rest |

Constitution save to resist each step, DC rising with proof. Beer is a slow climb; liquor takes two steps at a time.

Level 1 is the one that matters: **a drink before a fight is a real trade** — fear resistance against Underdark horror, paid for in your hands. Dexterity rather than Perception makes it bite on initiative, AC-relevant checks, Stealth and thieves' tools, which is a sharper price than losing your eyes and stops the level-1 sip from being free for a melee party.

### Why drink earns its place
- **Economy.** Liquor is dense, durable and universally wanted — the trade good that makes the camp merchant worth showing up for.
- **Social.** Drink turns the camp TALK action into a scene. Drunk characters say things sober ones do not.
- **Free overlap.** Inebriation and impurity are the same shape — a thing you took on purpose that costs you something. One condition system covers both.

---

## The cleric convergence, and its risk

The cleric is now the only source of wine, the only source of holy water, and the only one who can purify a dirty brew — and wine is holy water's base. He ferments it, he blesses it, one becomes the other. The cleric is the supply line rather than the heal-bot, which is a better role in a campaign about escaping.

**Risk worth naming:** that is three systems on one character. If Samson is down or not at camp, all three stall. That may be exactly the pressure wanted, but it should be a decision rather than a discovery at the table.

Likewise the arcane gate: a party with no available arcane caster gets mundane potions only. Thematic and correct, but a real constraint on solo camp actions.

## What this trades away

Cutting the push-your-luck brewing variant removes the loud thirty-second table moment. What is left is a **preparation** system — satisfying at camp, paying off later, but with the drama deferred rather than live. Fair trade for 5e legality and for reusing shipped art; naming it so it is not a surprise in play.

---

## Build order

1. Grid schema + `alchemy_effects` table — invisible, everything sits on it
2. Eat It And See — first visible thing, cheapest, best content-per-hour
3. Impurity — makes brewing matter
4. Runes — reuses the school art, which is already on `main`; no blocker
5. Poisoned Cookbook — hangs off loot ceremony

## Sourced vs homebrew

**SOURCED:** the eight schools (SRD 5.1); Purify Food and Drink; the holy water ritual; the poisoned condition; advantage/disadvantage; kit proficiency and downtime crafting; the OotA fungi and their canon properties.

**HOMEBREW (all of it invented for this campaign):** the four-effect grid and every per-ingredient assignment; the impurity ladder and its table; the tier cost on purification; rune-school assignments and the marks-as-loot system; the arcane/divine gate; recipe sabotage; the inebriation ladder; cleric-gated wine; base-liquid effects.

## Open questions

1. **Does a cleric get the arcane path on Arcana proficiency, or is divine locked out entirely?** Currently written as locked out. Decides whether one of four PCs is structurally excluded from a whole system.
2. **Paladins** — Scott is a Bard so it does not bite today, but if a paladin joins: divine path, arcane path, or both?
3. **Is impurity 3 clearing on a long rest too cheap?** Not yet ruled on.
4. **Per-ingredient grid assignments need approval before any row is written.** Nothing touches the catalog until Sam signs the grid.
