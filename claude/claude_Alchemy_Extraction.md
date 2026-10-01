# Alchemy: extraction

A raw ingredient must be **prepared** before it can go into a brew. Status: **built, 2026-10-01.** Rules in `lib/extraction.ts`, route at `app/api/alchemy/extract`, migration `20261001100000_extraction.sql` (applied live).

Sam, 2026-10-01: "We do need an extraction step." Then "Yes" to the rule as written in the Alchemy Bench brief.

---

## The rule (all HOMEBREW)

| Roll (INT + tool proficiency, DC 10) | Result |
|---|---|
| beat by 5 or more | prepared, **and learn the ingredient's second effect** (tasting gives the first) |
| meet or beat | prepared |
| miss by 1–4 | prepared but **bruised**: +1 impurity in any brew it goes into |
| miss by 5 or more, or a natural 1 | ruined and consumed |

- **It costs a camp action** (Sam, 2026-10-01: "Yes"). One **sitting** prepares up to **three** raw ingredients for one camp action, the "brew" slot on the camp menu (`lib/camp.ts`). Each ingredient is still its own roll. Why three and not one each: a rest gives two camp actions, so one action per ingredient would make a two-ingredient brew cost the whole rest before the brew itself. One sitting of three, then the brew, fits in a single rest.
- The action is spent only if at least one ingredient in the sitting actually went on the bench. If every one is refused (none held raw, no method), nothing is spent.
- `POST /api/alchemy/extract` takes `items: [{itemSlug, check, die}]` (1–3). The old single-ingredient body still works and still answers in the old shape.
- Same tools and same DC as brewing (alchemist's supplies or an herbalism kit). One bench, one number.
- The bench uses **clean** prepared ingredients before bruised ones, so a brewer who has a good one never pays for a bad one.
- Bruising, like every other impurity, never denies the potion. A test holds that.

## Methods

The tool decides the method; each ingredient has exactly one. The tools are bench scenery (they are in the painting), not inventory.

| Method | Tool | Ingredients |
|---|---|---|
| Grind | mortar and pestle | bluecap, fire lichen, zurkhwood, tainted spores, pygmywort, bigwig, Nilhogg's nose, timmask, wind spores, cave cricket skewer, fried grubs, sporebread loaf |
| Cut | knife | barrelstalk, torchstalk, trillimac, nightlight, ripplebark, tongue of madness, blind cave fish, cavern lizard meat, deep rothé jerky, edible mushrooms, glowcap, bonecap, tessadyle |
| Press | the bench press | waterorb, ormu, nimergan |
| Decant | flask and funnel | deep rothé milk, carrion crawler mucus, gray ooze residue, ormu ink, rapport spores |

**Claude's assignment.** Where the catalogue description already says how the thing is worked ("ground into a paste", "squeeze for water", "carved for pulp"), that decided it. Each is one line in `EXTRACTION_METHOD` and one row in the migration, and a test holds the two lists together. `items.properties.extraction` overrides the code table, so a single ingredient can be changed in the admin without a deploy.

## Data

- **`inventory_items.prep`** (new, nullable jsonb): `{method, bruised, prepared_by, prepared_at}`. A prepared bluecap is still the catalogue's bluecap. Nothing new is minted, so the "AI cannot invent items" rule holds. Same pattern as `inventory_items.brew`.
- A prepared ingredient lives on **its own row**, named `Bluecap (ground)` or `Bluecap (ground, bruised)`, so it can never stack back onto raw ones.
- **`character_known_effects.learned_via`** now also accepts `'extract'`.
- The prepared row is written **before** the raw one is consumed, so a refused write never costs the ingredient. This is the same lesson as the brew-save bug.

## What changed elsewhere

- **`/api/alchemy/brew`** now only counts prepared rows. If you hold raw but none prepared, it says `prepare it first: Bluecap` (422 `not_prepared`).
- **`/api/alchemy/pack`** reports `raw`, `prepared`, `bruised`, `method` and `tool` per ingredient.
- **The bench screen** lets a player tick up to three raw ingredients ("✓ Grind it") and press **Prepare (1 camp action)**; each is rolled on the shared dice. It also shows the counts. It offers "Grind it — mortar and pestle (INT +3 vs DC 10)" when there are raw ones, and only lets you pick ingredients you have prepared.

## Art

The bluecap flour sample (approved, round 1b) is the prepared look for bluecap. The other 32 prepared forms were generated as 8 sheets on 2026-10-01 and **wait on Sam's review**. Until he approves them, a prepared ingredient shows its raw cut-out.

## Not handled

- **Dropping a prepared ingredient on the battle board** goes through `/api/ground-items`, which knows nothing about `prep`. Picked back up, it comes back raw. Rare, and noted rather than fixed.
- **Tasting** works on raw or prepared alike and does not consume the ingredient. That is unchanged from the existing Eat It And See behaviour.
