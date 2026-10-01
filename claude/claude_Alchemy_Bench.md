# The alchemy bench — the Grid brew

Step 3 of the build order in `claude/claude_Alchemy_Minigame.md`. Status: **built, 2026-09-30.** Rules in `lib/alchemy-bench.ts`, route at `app/api/alchemy/brew`.

Grid: `claude/claude_Alchemy_Grid.md`. Absolute failure: `claude/claude_Alchemy_Critical_Failure.md`. Schema: `claude/claude_Alchemy_Schema.md`.

---

## What this unblocks

Before this, alchemy could **taste** and could not **brew**. That meant no brewing check existed, which meant nothing could roll a 1, which meant the critical-failure cinematic Sam supplied on 30 Sep could never fire. The asset was ahead of the mechanic. It no longer is — a natural 1 emits `[CINEMATIC: alchemy-critical-failure]` into the dialogue feed and the existing resolver takes it from there.

## The three outcomes

Only two things in the entire system give you nothing:

| Outcome | When | Potion | Ingredients | Teaches |
|---|---|---|---|---|
| `potion` | an effect is shared | yes, always | consumed | the columns it used |
| `inert` | nothing shared | **no** | consumed | nothing |
| `critical_failure` | **natural 1** | **no** | consumed | nothing |

Everything else — a missed check, impurity 3, a sabotaged recipe — still hands you a flask of something. That is the spec's load-bearing rule, and the tests assert it directly: *impurity never denies the potion.* The moment it can, impurity stops being a cost and becomes a punishment.

A natural 1 is decided by the **face**, not the total. A +14 brewer still blows up the bench. Skill lowers impurity; skill never buys immunity.

## Impurity is scored before the reveal

"+1 per ingredient whose effect you used but have not discovered" is charged against what the character knew when they **started**. Score it after and the brew that teaches you an effect retroactively counts you as having known it, and the penalty for brewing blind can never be charged at all. There is a test on the ordering, because this is the kind of thing a later refactor quietly reverses.

## What is Sam's spec and what is Claude's proposal

**Straight from the spec, unchanged:** the 2–3 ingredient rule and the shared-effect threshold; no shared effect means no potion; impurity +1 unproficient, +1 per blind ingredient, +1 drifted recipe, −1 abjuration, −1 milestone, floor 0, cap 3; blessed water caps impurity at 1; one rune per potion; the natural 1 and every number in the critical-failure table.

**Claude's proposals, all one-line changes:**

1. **Brew DC 10.** Reused from `HOUSE_RULES.brewDc` in `lib/alchemy.ts` rather than inventing a second brewing number.
2. **A missed check costs +1 impurity and pins potency at tier I** — it does not destroy the brew. This is how the roll is made to matter without breaking the load-bearing rule.
3. **Potency ladder:** tier I base, +1 proficient, +1 for beating the DC by 5, +1 evocation rune, cap III. The spec says proficiency, runes and bases decide how strong and fixes no arithmetic.
4. **All shared effects land, not just one.** "Any effect shared by two or more becomes the potion" reads as plural, and it is the Skyrim behaviour the spec is built from — which means a brew can carry a benefit and a harm at once. That is a feature, but it is a ruling.
5. **Holy water caps impurity at 1**, same as blessed water. The spec's table gives holy water its fiend damage and is silent on the cap.
6. **The same ingredient twice is refused.** Two of one mushroom share all four effects with themselves and would brew a guaranteed four-effect potion out of a single ingredient.

## A conflict in the spec, flagged rather than guessed

`claude_Alchemy_Minigame.md` §5 says a sabotaged recipe is **+1** impurity. §6's Poisoned Cookbook table says **+2**. The code uses **+2**, on the grounds that the dedicated table is the more specific statement — but it is a real contradiction and Sam's to settle.

## The product row

A brewed potion is an instance, not a new catalogue entry per effect. Twenty-two effects would mean twenty-two homebrew potion rows and twenty-two icons; instead there is **one** catalogue row, an unlabelled flask, and what the flask does lives in `inventory_items.brew` — which is exactly what that column was added for.

**That row does not exist yet.** The route refuses with `no_product_row` rather than minting an item the catalogue has never heard of, which keeps the standing rule intact: nothing the party can hold is invented. The SQL is one additive insert and is in the PR body for Sam to approve.

## Not in this piece, deliberately

- **Runes.** `lib/alchemy-bench.ts` already does the arithmetic for the three schools that touch the two numbers (evocation +1 potency, necromancy +1 impurity, abjuration −1 impurity), and the other five schools' rider effects, the arcane-only gate and the found-marks system are step 4. The route **rejects** a rune with a 400: a rune accepted before the gate exists is a rune anyone can claim.
- **The camp action budget.** `lib/camp.ts` already knows `brew` spends an action; nothing wires it to this route.
- **Drinking the potion.** Nothing reads `inventory_items.brew` yet, so impurity's residue/taint/corruption riders and the potency tiers are recorded and not yet applied.
- **Poisoner's kit** is not accepted as a bench proficiency. Spec §5 names alchemist's supplies and the herbalism kit; the DMG puts poisons on the poisoner's kit. Probably wants adding for the harmful half of the grid — Sam's call.

## Verification

40 new tests in `lib/alchemy-bench.test.ts`; full suite **996 passing across 40 files**. `tsc --noEmit` shows **14 errors on the branch and 14 on `main`** — the same pre-existing set, confirmed by stashing and re-counting rather than assumed.

Tool-proficiency matching is case- and punctuation-insensitive, because the live sheets are inconsistent: Bastet has "Light Armor" and Scott has "Light armor", and apostrophes vary. Fifi's "Alchemist's Supplies" is the only live bench proficiency in the party.

## Open questions

1. **Sabotaged recipe: +1 or +2?** The spec says both.
2. **Should a missed check cost impurity at all**, or should the roll only gate potency?
3. **Poisoner's kit as a bench tool** — in or out?
4. **Approve the one-row `brewed-potion` catalogue insert**, and whether its icon comes from the existing art or waits for a new one.
5. **Can a brew carry a benefit and a harm at once?** It can today, and that is the most interesting thing in the system or the first thing to cut.
