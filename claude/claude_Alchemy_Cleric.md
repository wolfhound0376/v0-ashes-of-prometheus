# Alchemy: clerical help

A cleric does not brew. A cleric **consecrates the base** before the brew, or **purifies the potion** after it. Status: **built, 2026-10-01.** Rules in `lib/alchemy-cleric.ts`. Routes: `app/api/alchemy/consecrate`, `app/api/alchemy/purify`. Sam said "Yes" to the brief's clerical section.

| | Who | Cost | Effect | Source |
|---|---|---|---|---|
| **Blessed water** | cleric | one glass vial and the camp action | brewing base: impurity can't rise above 1 | HOMEBREW (the brief gave the cleric and the cap; Claude set the cost) |
| **Holy water** | cleric | one glass vial, one 25 gp measure of powdered silver, one 1st-level slot | brewing base: impurity capped at 1 | PHB p.151 ritual |
| **Purification** | cleric with *Purify Food and Drink* **prepared** | camp action, no slot (ritual) | impurity → 0, potency −1 tier (floor I) | spell SRD; the tier cost HOMEBREW |

- **Two new catalogue rows** (migration `20261001110000_cleric_bases.sql`, data only, applied live): `blessed-water` and `powdered-silver`, with Sam's approved art. `holy-water` already existed.
- **The brew route now checks the base.** Before this, `base: "holy-water"` was taken on the caller's word and never used up. Now the base must be in the pack, and one is consumed with the ingredients whatever the outcome.
- **Slots** are spent the way `/api/combat` spends them: `sheet_spellcasting.slots[level].used += 1`.
- **Purify works on a flask in the cleric's own pack only.** A party member hands the flask over first. The route never reaches into another pack (AGENTS.md §5). A stack of identical flasks is split, and only the one purified changes.
- **The order of writes is load-bearing:** what is made goes in first, then the costs are taken. A refused write never costs anything.

## Today, at the table

Samson is the party's only cleric. His two 1st-level slots are **both used** and he does **not** have *Purify Food and Drink* prepared. So tonight he can bless water (if someone has a glass vial), but not make holy water or purify. The bench says exactly that.
