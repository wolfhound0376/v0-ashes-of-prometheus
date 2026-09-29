# Alchemy schema

Migration notes for `supabase/migrations/20260929120000_alchemy_schema.sql` and `…120100_alchemy_seed.sql`.

**Status: drafted, NOT applied.** Migrations do not run on deploy in this project — Sam pastes them into the Supabase SQL editor by hand. Nothing below has touched the live database.

---

## What it adds

| Object | Kind | Why |
|---|---|---|
| `alchemy_effects` | new table, 22 rows | The effect vocabulary. Reference data. |
| `items.alchemy_effects` | new jsonb column | The grid: four ordered effects per ingredient. |
| `character_known_effects` | new table | Per-character discovery state. |
| `character_known_runes` | new table | Which arcane marks a character holds. |
| `inventory_items.brew` | new jsonb column | Potency, impurity and rune on one brewed potion. |

**Everything is additive.** No existing column changes type, no existing row is touched, every new column is nullable. The live dashboard keeps working untouched until code reads them.

## Four decisions worth arguing with

**1. The grid is a jsonb array, not four columns.** Order carries meaning — index 0 is what tasting reveals — and the per-character reveal state is then a cheap integer index into it rather than a column name. The cost is that Postgres cannot foreign-key into a jsonb array, so referential integrity falls to `scripts/alchemy/grid_check.py` and the verification queries at the foot of the seed file. A `CHECK` still enforces shape: exactly four, all distinct, all non-empty strings.

**2. `brew` goes on `inventory_items`, not a side table.** A brewed potion *is* an inventory item, and potency/impurity/rune belong to that one instance — two potions off the same recipe can differ. `inventory_items` has no jsonb column today, so this adds one nullable column that will be null for almost every row. A side table keyed to `inventory_items.id` would be more normalised and would buy an orphan-row problem and a join on every inventory read.

**3. Recipes get no table.** The Poisoned Cookbook's recipes are catalog items with a `reliability` value in the existing `items.properties` jsonb. That keeps the standing rule intact — everything the party can hold resolves against `items` — and a `sabotaged` recipe stays a physical object someone can steal, burn or plant.

**4. No anon write policies, deliberately.** Read is public, matching `items`. Writes go through a service-role route. That is the same conclusion the `cinematic_views` telemetry problem reached: an anon INSERT policy is not the fix, a service-role route is.

## The RLS trap this file avoids

A new table defaults to **no policies**. If RLS is enabled with none, the table is invisible to the anon key and the UI renders empty rather than erroring. If RLS is left off, the table is world-writable with the public key. Both failure modes are already on this repo's security list — `scene_effects` has an anon write policy that needs dropping, and `cinematic_clips_backup_scenekey_20260818` has RLS disabled entirely.

So the RLS block sits **outside the transaction**, after the commit, and is not optional. Run it.

## Verified before writing

The 28 ingredient slugs in the seed were checked against the live `items` table: **28 matched, 0 missing.** The seed will not silently no-op on a typo.

## Apply order

1. `20260929120000_alchemy_schema.sql` — DDL, then the RLS block after the commit
2. `20260929120100_alchemy_seed.sql` — 22 effects and the 28-row grid
3. Run the three verification queries commented at the foot of the seed file

Both files are idempotent and safe to run twice.

## What this does not do

No code reads any of it yet. Schema and data only. The build order in `claude/claude_Alchemy_Minigame.md` puts Eat It And See next, and that needs a service-role route to write `character_known_effects` — nothing in this migration creates one.

`items.alchemy_effects` and the new `alchemy_effects` table share a name. That is deliberate and reads fine in context (`items.alchemy_effects` is a column, `alchemy_effects` is a table), but it is the sort of thing that bites in a query six months from now. Flagged rather than renamed, because every doc already calls both of them that.
