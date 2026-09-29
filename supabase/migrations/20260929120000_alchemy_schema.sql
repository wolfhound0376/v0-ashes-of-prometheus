-- =====================================================================
-- Alchemy: schema only. No data. Seed is a separate file.
--
--   Spec   claude/claude_Alchemy_Minigame.md
--   Grid   claude/claude_Alchemy_Grid.md  +  scripts/alchemy/grid_check.py
--   Marks  claude/claude_Alchemy_Rune_Marks.md
--
-- MIGRATIONS DO NOT RUN ON DEPLOY in this project. Paste this into the
-- Supabase SQL editor by hand, in this order, then the seed file.
--
-- APPLIED to project ppadxmvvvxmnnejeaoer on 2026-09-29, as migrations
-- alchemy_schema / alchemy_rls / alchemy_seed. Re-running is safe.
--
-- Everything here is additive. No existing column changes type, no
-- existing row is touched, and every new column is nullable, so the
-- live dashboard keeps working untouched until code reads them.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. The effect vocabulary. 22 rows, reference data, seeded separately.
-- ---------------------------------------------------------------------
create table if not exists alchemy_effects (
  slug        text primary key,
  name        text not null,
  category    text not null check (category in ('restorative','sensory','harmful','strange')),
  summary     text not null,                 -- what a potion of it does, one line
  is_harmful  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table alchemy_effects is
  'Canonical alchemy effect vocabulary. An effect a brew can produce. '
  'Homebrew; see claude/claude_Alchemy_Grid.md.';

-- ---------------------------------------------------------------------
-- 2. The grid itself: four effects per ingredient, ORDER MATTERS.
--    Column 1 is what tasting reveals.
--
--    This is a jsonb array rather than four columns so the ordering is
--    explicit and the per-character reveal state is a cheap index into
--    it. Postgres cannot foreign-key into a jsonb array, so the CHECK
--    below enforces shape only -- referential integrity against
--    alchemy_effects is enforced by the optional trigger in section 6
--    and by scripts/alchemy/grid_check.py.
-- ---------------------------------------------------------------------
alter table items
  add column if not exists alchemy_effects jsonb;

-- Postgres FORBIDS subqueries in a CHECK constraint ("cannot use subquery in
-- check constraint", SQLSTATE 0A000). The first version of this file inlined
-- the distinctness test and failed on apply. The test therefore lives in an
-- IMMUTABLE function, which a CHECK is allowed to call.
create or replace function alchemy_grid_is_valid(v jsonb)
returns boolean
language sql
immutable
as $fn$
  select v is null
      or (
        jsonb_typeof(v) = 'array'
        and jsonb_array_length(v) = 4
        -- all four distinct
        and (select count(distinct e) from jsonb_array_elements_text(v) e) = 4
        -- all four are non-empty strings
        and not exists (
          select 1 from jsonb_array_elements(v) x
          where jsonb_typeof(x) <> 'string' or length(x #>> '{}') = 0
        )
      )
$fn$;

comment on function alchemy_grid_is_valid(jsonb) is
  'True when the value is null or an array of exactly 4 distinct non-empty strings. Used by items_alchemy_effects_shape.';

alter table items drop constraint if exists items_alchemy_effects_shape;
alter table items add constraint items_alchemy_effects_shape
  check (alchemy_grid_is_valid(alchemy_effects));

comment on column items.alchemy_effects is
  'Ordered array of exactly 4 distinct alchemy_effects.slug. Index 0 is '
  'what TASTING reveals. Null = not an alchemy ingredient.';

create index if not exists items_alchemy_effects_gin
  on items using gin (alchemy_effects);

-- ---------------------------------------------------------------------
-- 3. Per-character discovery. Knowledge is per character by design --
--    Kenta learning what bluecap does teaches Fifi nothing.
-- ---------------------------------------------------------------------
create table if not exists character_known_effects (
  character_id  uuid not null references characters(id) on delete cascade,
  item_slug     text not null,               -- items.slug, the ingredient
  column_index  smallint not null check (column_index between 1 and 4),
  learned_via   text not null default 'brew'
                  check (learned_via in ('taste','brew','taught','recipe','dm')),
  learned_at    timestamptz not null default now(),
  primary key (character_id, item_slug, column_index)
);

create index if not exists character_known_effects_char
  on character_known_effects (character_id);

comment on table character_known_effects is
  'Which of an ingredient''s four effects a given character has discovered. '
  'column_index is 1-based and maps to items.alchemy_effects[index-1].';

-- ---------------------------------------------------------------------
-- 4. Arcane rune marks. Sam's ruling: only magic users inscribe, the
--    knowledge is found rather than bought, and it is gated per school.
-- ---------------------------------------------------------------------
create table if not exists character_known_runes (
  character_id  uuid not null references characters(id) on delete cascade,
  school        text not null check (school in (
                    'abjuration','conjuration','divination','enchantment',
                    'evocation','illusion','necromancy','transmutation')),
  learned_via   text not null default 'found'
                  check (learned_via in ('found','taught','dm')),
  learned_at    timestamptz not null default now(),
  primary key (character_id, school)
);

comment on table character_known_runes is
  'Arcane rune marks a character knows. School names match the eight SRD '
  'schools already used by lib/spell-school.ts.';

-- ---------------------------------------------------------------------
-- 5. What a brewed potion carries.
--
--    A brewed potion IS an inventory item, and potency/impurity/rune are
--    intrinsic to that one instance rather than to the catalog row -- two
--    potions off the same recipe can differ. inventory_items has no jsonb
--    column today, so one nullable column is added. Null for everything
--    that was not brewed, which is almost everything.
-- ---------------------------------------------------------------------
alter table inventory_items
  add column if not exists brew jsonb;

alter table inventory_items drop constraint if exists inventory_items_brew_shape;
alter table inventory_items add constraint inventory_items_brew_shape check (
  brew is null
  or (
    jsonb_typeof(brew) = 'object'
    and brew ? 'effect'
    and (brew->>'potency')::int between 1 and 3
    and (brew->>'impurity')::int between 0 and 3
  )
);

comment on column inventory_items.brew is
  'Brew record for a crafted potion: {"effect":"restore-health","potency":2,'
  '"impurity":1,"rune":"abjuration"|null,"base":"blessed-water"|null,'
  '"brewer":"<uuid>","ingredients":["bluecap","ripplebark"]}. '
  'Null = not brewed. potency 1-3, impurity 0-3.';

commit;

-- =====================================================================
-- 6. RLS. Run this block too -- new tables default to NO policies, and
--    a table with RLS on and no policies is invisible to the anon key,
--    while a table with RLS OFF is world-writable with the public key.
--    Both failure modes are already on the security list for this repo.
--
--    Pattern matches `items`: public read, server write. Nothing here is
--    anon-writable; the camp craft route writes with the service role.
-- =====================================================================

alter table alchemy_effects         enable row level security;
alter table character_known_effects enable row level security;
alter table character_known_runes   enable row level security;

drop policy if exists alchemy_effects_read on alchemy_effects;
create policy alchemy_effects_read on alchemy_effects
  for select to public using (true);

drop policy if exists character_known_effects_read on character_known_effects;
create policy character_known_effects_read on character_known_effects
  for select to public using (true);

drop policy if exists character_known_runes_read on character_known_runes;
create policy character_known_runes_read on character_known_runes
  for select to public using (true);

-- No INSERT/UPDATE/DELETE policies by design. Writes go through a
-- service-role route, the same conclusion the cinematic_views telemetry
-- fix reached: the answer is a service-role route, not an anon policy.
