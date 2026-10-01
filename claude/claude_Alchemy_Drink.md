# Drinking a brew

The half that makes potency and impurity felt. Status: **built, 2026-09-30.** Rules in `lib/drink-brew.ts`, route at `app/api/alchemy/drink`.

Bench: `claude/claude_Alchemy_Bench.md`. Effects: `claude/claude_Alchemy_Grid.md`. Rider ladder: `claude_Alchemy_Minigame.md` §5.

---

## What this unblocks

The bench wrote potency, impurity and a list of effects into `inventory_items.brew` and **nothing read that column.** A tier III clean potion and a tier I corrupt one were the same object with different labels. Now they are not.

## The vocabulary is not new

Every durational effect is expressed with the `SpellEffect` shapes already in `lib/spell-effects.ts`, because that file solved this exact problem for spells and its central rule carries over word for word:

> **An effect the engine cannot mechanise is never silent.** It falls through to `dm` — named, with its description — and Malachar rules it.

So a brew carrying an effect with no row still reaches the table as a ruling rather than as nothing. `unknownEffects` is that path, and a test asserts nothing is ever dropped.

Named states (Resist Poison, Soft Step, Inner Light) ride as **conditions** — free text, shown on the sheet — exactly as "Faerie Fire" and "Disguised" already do. There is no duration tracking anywhere in this codebase, so `rounds` is what Malachar and the sheet read, not something a timer enforces. That is true of every spell too; this does not make it worse.

## Two orderings that are load-bearing

**Healing applies before harm.** The grid genuinely produces potions that heal *and* rot the same drinker — `ripplebark + edible-mushrooms` shares `restore-health` and `rot`. Applied the other way round, a drinker at 1 hp drops unconscious before the healing lands, and an interesting potion becomes a coin flip.

**A save turns aside the gated conditions only, never the rider.** Impurity is the price of the brew, not an effect of it, and it is never saved against. That is the whole bargain of the ladder.

## The numbers, and where each came from

| | Tier I | Tier II | Tier III | Source |
|---|---|---|---|---|
| Healing | 2d4+2 | 4d4+4 | 6d4+6 | **SRD** at I and II (potion of healing, greater). **HOMEBREW** at III. |
| Harmful dice | 1d6 | 2d6 | 3d6 | HOMEBREW |
| Duration | 10 rounds | 100 rounds | 600 rounds | HOMEBREW — a minute, ten minutes, an hour |

**Tier III healing is deliberately NOT the SRD superior potion's 8d4+8.** A superior potion is three workweeks of XGE downtime crafting; one good roll at a camp bench must not match it, or `lib/alchemy.ts`'s whole crafting ladder stops mattering. There is a test pinning this so a later session does not "fix" it upward.

**The save DC scales: 10 / 12 / 14** (Sam's ruling, 2026-09-30 — a stronger brew should be harder to shrug off). Tier I is not a number of its own: it IS `TASTE_SAVE_DC`, imported rather than copied, because he ruled DC 10 for "column 1 happens to you" and a brew doing the same thing to the same throat is the same event. A test holds the two together, so changing the tasting DC moves tier I with it.

The +2 a tier lands the ladder *inside* the published poison band rather than beside it: SRD basic poison is DC 10, serpent venom 11, drow poison 13, wyvern 15. Tier III at 14 sits between the drow and the wyvern — about right for the worst thing a camp bench can make. Tiers II and III are homebrew.

**The twenty-two effect rows are all homebrew.** The grid doc gives each effect one line of intent; this turns that line into something the engine can apply. Each is one object — the easiest possible redline, one row at a time.

## A rule that was invented and has been removed

An earlier draft gave `sicken` both the poisoned condition **and** poison damage. The grid doc gives it the condition and nothing else; `numbing-venom` is the row that deals poison damage. Caught by writing the table out against the doc rather than from memory, and there is now a test holding it.

## The two-step, and why

`GET` previews and `POST` drinks. The caller cannot know what to roll until the flask is resolved, because the dice depend on the instance's potency, which is not on the label. `POST` refuses with `needs_dice` rather than guessing — a dose drunk without its dice would silently heal nothing and the flask would be gone.

## Rulings, 2026-09-30

**Tier III healing stays 6d4+6.** The bench does not reach the SRD superior potion. The test pinning it stands.

**The save DC scales with potency**, 10 / 12 / 14 — see above.

## Open questions

1. **The duration ladder** (1 min / 10 min / 1 hour) — a decade per tier is clean but arbitrary, and it is the last untouched homebrew number in the drink path.
2. **Nothing clears a rider.** Residue should lapse in an hour and Taint and Corruption should survive to a long rest, but conditions carry no duration in this schema, so clearing them is the DM's, by hand. The long-rest path in `lib/camp.ts` is where that would live. This is unfinished work rather than an open design question.
3. **`inner-light` is the only effect with a built-in drawback.** The grid doc asks whether it should keep it or hand the drawback to the impurity system. Kept for now, both halves always, because it is the only reason a light source is ever a decision.
