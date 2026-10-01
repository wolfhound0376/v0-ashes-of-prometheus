# Repair, Mend & Upgrade — module spec

Status: **rules approved by Sam 2026-10-01 (§9 items 1-5 YES).** `lib/repair.ts` and
its tests are PR 1. The migration in §7 is NOT applied — it is applied by hand.
Author: Claude, 2026-10-01. Verified against live `main` (`e77d0ab`) and the live
Supabase project `ppadxmvvvxmnnejeaoer` on the day of writing.

This is the third door behind **Craft** in the Camp Actions window
(`claude_Camp_Scene.md` §1c: *Craft → Alchemy / Repair & Upgrade / Artifice*),
the one marked "Not built yet."

---

## 0. What is already there (verified, not remembered)

| Thing | State on `main` / in the DB |
|---|---|
| `mend` as a camp action | **Already declared** in `CAMP_ACTIONS`. `CAMP_ACTION_RULES.mend` routes to `dmScene()` with the note "Mending cantrip repairs one break up to 1 ft; otherwise a tool check." It has no resolver. This module is that resolver. |
| Crafting engine | Mature. `CRAFT_BY_RARITY` (DC + hours), `craftSpec()`, `craftModifier()` (better of the tool's two abilities + proficiency), `settleCraftRoll()` (one check per hour, failure wastes the hour and never undoes banked work), `CRAFT_TAKE10_ACTIONS`, `craftMaterialsGp()`, `payFromPurse()`, `craftMenu()`. Source: Two-Parts Crafting, adopted by Sam 2026-09-27. |
| `CRAFT_TOOL_ABILITIES` | Already lists every tool this module needs: smith's, leatherworker's, woodcarver's, weaver's, tinker's, jeweler's, glassblower's. Nothing new to add. |
| `crafting_projects` table | Exists, **0 rows**. Columns: `character_id, item_id, progress_gp, materials_gp_paid, attempts, successes, copies, started_at, finished_at`. |
| Item condition | **Does not exist anywhere.** No column on `inventory_items`, none on `items`. This module's only real schema cost. |
| The rusted weapons | 7 catalog rows (`rusted-longsword`, `-battleaxe`, `-morningstar`, `-pike`, `-scimitar`, `-war-pick`, `-warhammer`) carrying `properties.rusted_rule` = "−1 to attack and damage rolls; breaks on a natural 1 on the attack roll" and `properties.breaks_on_nat_1: true`. **That is already this system's `damaged` rung, written by hand.** The ladder below generalises it rather than competing with it. |
| `items.properties` | Already carries `craft` (10 rows), `rune_material` (3 rows), `crafting_material` (1), `harvest_from` (11). The upgrade paths below reuse these rather than inventing new vocabulary. |

**Nothing in the repo or the DB touches repair.** No parallel session has started
this. A fresh `scripts/who-else.mjs --days 14` run is still step 1 of the build PR.

---

## 1. The design rule this module lives under

> **Degradation is event-driven. There is no per-swing durability counter.**

A counter that ticks on every attack turns the sheet into bookkeeping and turns
Malachar into an accountant. Every rung below is reached by a *named event the
table will remember* — a natural 1, a rust monster, a drow deliberately snapping
Fifi's dagger, or a week of neglect. That is the same principle as the gravity
system: the number exists so the story has a spine, and the player sees the story.

The second rule follows from Layer 2B: **the AI cannot invent items.** Every
upgrade consumes a catalog row and grants that row's own effect. There is no
"the DM makes up a bonus" path anywhere in this spec.

---

## 2. The condition ladder — five rungs

On the **instance** (`inventory_items`), never the catalog.

| Rung | Mechanical effect | Value |
|---|---|---|
| `pristine` | none | full |
| `worn` | **none** | −25% |
| `damaged` | weapon: −1 attack and damage · armour/shield: −1 AC · tool/instrument/focus: disadvantage on its own checks | −50% |
| `broken` | unusable. Weapon = improvised (1d4, no proficiency) · armour = no AC benefit (10 + Dex) · tool = cannot be used at all. **Still on the sheet.** | −90% |
| `destroyed` | off the sheet; salvage only (§6) | 0 |

**Why `worn` earns no penalty.** It is the warning light, not a tax. A player who
sees *worn* on their blade and spends five minutes at the whetstone has had a
small, cheap, entirely in-character interaction with the world. A player who
ignores it pays real gold later. Delete this rung and the system becomes a
treadmill; keep it and the system becomes care.

**Continuity with the rusted weapons.** A `rusted-longsword` instance starts at
`damaged`, which is exactly what its hand-written `rusted_rule` already says. Its
`breaks_on_nat_1` flag is rung-1 of §3. And the ruling that makes it sing:
**repairing a rusted weapon past `damaged` swaps the instance to the clean catalog
row** — `rusted-longsword` becomes `longsword`. Catalog-validated, nothing
invented, and the drow's cast-off junk becomes a real sword by someone's labour.

---

## 3. What degrades an item — a closed list

Nothing outside this list may move an item down a rung. The engine never improvises one.

1. **Natural 1 on an attack roll** with a weapon that is already `damaged`, or whose
   catalog row carries `breaks_on_nat_1` → one rung down. *(Generalises the live rule.)*
2. **A named monster or hazard effect** — rust monster, ooze and acid, fire, the
   Darklake, a corrosive pool. The effect's own text says so; the bestiary row carries it.
3. **A deliberate sunder** by an NPC — a Layer 1 directive, gravity-scored. Malachar
   breaking something a player loves is a high-gravity event and should be logged as one.
4. **Neglect.** An *equipped* weapon or armour that goes **7 long rests** with no
   `maintain` slides one rung. Neglect alone never goes past `damaged` — a blade left
   dull gets dull, it does not shatter in the scabbard.
5. **Confiscation and captivity** — DM-set, scripted. (Velkynvelve already has the
   mechanism: `inventory_items.confiscated_from`. Gear thrown in a heap by drow
   jailers comes back worse, and that is a scene.)

---

## 4. The three verbs

### MAINTAIN — free, every long rest
Not a camp action. **This is what the `sharpen` camp animation already in
`claude_Camp_Scene.md` §4 actually does.** With the right tool in hand: resets the
neglect clock and lifts `worn → pristine`. No roll, no materials, no token cost,
once per character per long rest. It is five minutes of fiction with a real effect.

### MEND — the cantrip (SRD 5.1)
1 minute, no tools, no materials. SRD: *repairs a single break or tear no larger
than 1 foot in any dimension*, and — the load-bearing clause — *can physically
repair a magic item, but cannot restore magic to it.*

Ruling: lifts `broken → damaged` **only** for items where a one-foot break is the
whole injury — weight ≤ 5 lb, or `item_type` in (`accessory`, `tool`, `focus`,
`gear`). Never a suit of armour. Never `destroyed`. Never the enchantment. One
casting per break — it cannot be spammed up the ladder.

### REPAIR — one camp action, the existing hour-check loop
Reuses `craftSpec` / `craftModifier` / `settleCraftRoll` **verbatim**. One camp
action = one hour = one check. Take-10 costs two actions, as crafting does.

**Repair climbs exactly one rung per completed project.**

| From → to | Checks needed | DC | Materials |
|---|---|---|---|
| `damaged` → `worn` | ⌈rarity hours ÷ 2⌉ | rarity DC | 25% of value |
| `broken` → `damaged` | rarity hours | rarity DC **+3** | 50% of value |
| `worn` → `pristine` | — | — | free, via **maintain** |

Rarity DC and hours come straight from `CRAFT_BY_RARITY`. Failure wastes the hour
and holds the banked successes, identical to crafting. A natural 1 wastes that
check's materials and does **not** degrade the item further *(Claude's call — say
if you want it crueller)*.

**The economics come out right on their own.** Broken → pristine costs 75% of
market value. Nobody repairs a 15 gp longsword; everybody repairs the magic one.
That is the correct incentive and it falls out of the numbers rather than a rule.

**Tool by material**, all already in `CRAFT_TOOL_ABILITIES`:

| Tool | Repairs |
|---|---|
| Smith's | metal weapons, metal armour, shields with metal |
| Leatherworker's | leather and hide armour, straps, packs, boots |
| Woodcarver's | bows, crossbow stocks, hafts, staves, wooden shields |
| Weaver's | cloth, robes, cloaks, tents |
| Tinker's | mechanisms, locks, lanterns, manacles |
| Jeweler's | rings, amulets, settings |
| Glassblower's | vials, lenses, glass foci |

**A facility where the catalog asks for one** — `properties.repair.requires:
"forge"` — the same convention `craft.requires` already uses, read from
`travel_nodes.metadata.facilities`.

**Magic stays dormant.** Mundane repair restores the body, never the enchantment —
the SRD says exactly this for Mending and this module extends it to the forge
*(the extension is homebrew)*. A broken magic sword repaired at a forge is a
working sword whose magic sleeps until an arcane step wakes it. This is a feature:
it is the hook Dawnbringer's lost-fittings chain in the catalog is already waiting for.

---

## 5. UPGRADE — three kinds, all catalog-validated

Slots by rarity: **common 1 · uncommon and rare 2 · very rare and up 3.** A weapon
cannot become a Christmas tree, so the choice bites.

1. **Fitting / reforge** — consume a catalog item flagged `properties.fitting`
   (silvered edge, adamantine banding, drowcraft fittings, a zurkhwood haft). The
   effect **is that item's own effect text**. Tool + facility as §4. DC = rarity DC + 3.
2. **Rune** — consume an item carrying `properties.rune_material` (3 rows exist
   already). Needs a caster, or a node that permits the rite. The effect is the
   material's row. This is where the school-rune VFX work gets a second job.
3. **Mastercraft** — no new material; **earned by the item's own history.** An
   instance with ≥ 3 logged repairs or maintains by the same character, plus one
   check at DC rarity + 5 at a forge, becomes mastercraft: it **stops degrading
   from neglect**, gains +25% value, and **earns a name**.

   *Claude's call, and deliberately not a combat bonus:* "+1 to hit" is a magic
   weapon with the serial numbers filed off and it inflates the whole campaign. A
   blade that a character has kept for forty sessions and that no longer rusts is
   the same emotional payload with none of the inflation — and it is the earned-
   proficiency philosophy applied to objects instead of people. Say the word and
   it becomes +1 instead.

---

## 6. Salvage
A `destroyed` item is not deleted. It yields its materials back — the slugs in
`properties.craft.materials` if it has them, otherwise scrap worth 10% of value —
and the `item_events` row survives it. The sword is gone; the fact that it broke
in the slave pens at Velkynvelve is permanent.

---

## 7. Schema — shown, not applied

This repo's tables were all made by hand in the Supabase UI and its `.sql` files do
**not** run on deploy, so this has to be applied deliberately. Say "run the repair
migration" and Claude applies it through `apply_migration`.

```sql
-- 1. Condition and upgrades live on the INSTANCE.
alter table inventory_items
  add column condition text not null default 'pristine'
    check (condition in ('pristine','worn','damaged','broken','destroyed')),
  add column condition_note text,
  add column upgrades jsonb not null default '[]'::jsonb,
  add column maintained_at timestamptz;

-- 2. Item history is a Layer 1 memory responsibility, so it is a table, not a
--    jsonb blob — it has to be queryable across the campaign.
create table item_events (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  character_id uuid references characters(id),
  kind text not null check (kind in
    ('degrade','maintain','mend','repair','upgrade','break','destroy','salvage')),
  from_condition text,
  to_condition text,
  detail jsonb not null default '{}'::jsonb,
  gravity smallint,
  occurred_at timestamptz not null default now()
);
create index item_events_item_idx on item_events (inventory_item_id, occurred_at desc);

-- 3. RLS and the read policy in the SAME block — enabling RLS without a policy
--    blacks out the dashboard (the scene_effects lesson). Writes go through a
--    service-role route only; no anon insert policy, ever.
alter table item_events enable row level security;
create policy item_events_read on item_events for select to anon using (true);
```

Non-destructive: every column is additive with a default, and the new table is
empty. No existing row changes meaning — `condition` defaults to `pristine`, which
is what every item in play is today.

**Catalog conventions** (data work, not code — same footing as Camp §8):
`items.properties.repair = { tools, requires?, materials?, dc?, hours?, cost_gp? }`,
mirroring `craft` exactly. Absent → derive from §4's table. And
`items.properties.fitting` for the upgrade rows, which no item carries yet.

---

## 8. Code shape

- **`lib/repair.ts`** — pure, no THREE, no Supabase, fully testable. Exports:
  `CONDITIONS`, `conditionEffect()`, `stepDown()` / `stepUp()`, `canMend()`,
  `repairSpec()` (delegates to `craftSpec`), `repairMaterialsGp()`,
  `neglectDue()`, `maintain()`, `upgradeSlots()`, `applyUpgrade()`, `salvage()`.
- **`lib/repair.test.ts`** — the ladder, every refusal path, the rusted-weapon swap,
  the 75%-of-value property asserted directly, neglect at exactly 7 long rests.
- **`app/api/camp/repair/route.ts`** — service-role; the only thing that writes
  `condition` and `item_events`.
- **UI** — the Alchemy window with its own tabs, per Camp Scene §1c.

**One idea per PR**: (1) `lib/repair.ts` + tests + this doc. (2) the route.
(3) the UI tile. The migration is applied by hand, between (1) and (2).

---

## 9. Rulings — all five approved (Sam, 2026-10-01)

1. **YES** — five rungs, `worn` carrying no mechanical penalty. → `CONDITIONS`, `conditionEffect()`
2. **YES** — event-driven degradation only, the closed list in §3. → `DEGRADE_CAUSES`, `degrade()`
3. **YES** — mundane repair restores the body but never the enchantment. → flagged by `repairSpec()`
4. **YES** — mastercraft is immunity to neglect + a name + value, not +1 to hit. → `planUpgrade()`, `neglectDue()`
5. **YES** — repairing a rusted weapon past `damaged` swaps it to the clean catalog row. → `cleanSlugFor()`

Each is asserted in `lib/repair.test.ts`, so a later session cannot quietly undo one.

## 10. Flagged as invented vs sourced

**SRD 5.1:** the Mending cantrip and its no-magic-restored clause; Objects
(AC/HP) as the anchor for what `broken` means; tool proficiency.
**Two-Parts Crafting (already adopted, Sam 2026-09-27):** `CRAFT_BY_RARITY` DCs and
hours, the hour-check loop, take-10.
**Homebrew — Claude's, needing Sam's yes:** the five rungs and their penalties; the
25%/50% materials fractions and the +3 DC on `broken`; the 7-long-rest neglect
clock; maintain being free; mastercraft; the upgrade slot caps; the rusted-weapon
swap; extending "magic stays dormant" from Mending to the forge.
**Not recalled from memory and deliberately not guessed:** Xanathar's tool-activity
DCs for Smith's and Leatherworker's tools. If you want those to drive repair instead
of the rarity table, read them off your XGE and they go in `properties.repair.dc`.
