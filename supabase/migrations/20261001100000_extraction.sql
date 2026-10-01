-- Extraction: a raw ingredient must be prepared before it can be brewed.
--
-- Sam, 2026-10-01: "We do need an extraction step", then "Yes" to the rule
-- in the Alchemy Bench brief. Rules in lib/extraction.ts; doc in
-- claude/claude_Alchemy_Extraction.md. Applied live on Sam's "go ahead".
--
-- 1. inventory_items.prep — the instance data of a PREPARED ingredient:
--    {"method":"grind"|"cut"|"press"|"decant","bruised":bool,
--      "prepared_by":"<uuid>","prepared_at":"<iso>"}. Null for everything
--    raw, which is almost everything. Same pattern as inventory_items.brew:
--    a prepared bluecap is still the catalogue's bluecap, not a new item.
alter table inventory_items add column if not exists prep jsonb;

alter table inventory_items drop constraint if exists inventory_items_prep_shape;
alter table inventory_items add constraint inventory_items_prep_shape check (
  prep is null
  or (
    jsonb_typeof(prep) = 'object'
    and prep->>'method' in ('grind', 'cut', 'press', 'decant')
    and jsonb_typeof(prep->'bruised') = 'boolean'
  )
);

comment on column inventory_items.prep is
  'Prepared-ingredient record: {"method":"grind|cut|press|decant","bruised":bool,"prepared_by":"<uuid>","prepared_at":"<iso>"}. Written by app/api/alchemy/extract, required by app/api/alchemy/brew.';

-- 2. A careful extraction teaches column 2, so 'extract' is a way to learn.
alter table character_known_effects drop constraint if exists character_known_effects_learned_via_check;
alter table character_known_effects add constraint character_known_effects_learned_via_check
  check (learned_via = any (array['taste', 'brew', 'taught', 'recipe', 'dm', 'extract']));

-- 3. Each ingredient's one method, mirrored from lib/extraction.ts
--    EXTRACTION_METHOD (a test holds the two lists together).
update items i
set properties = coalesce(i.properties, '{}'::jsonb) || jsonb_build_object('extraction', m.method)
from (values
  ('bluecap', 'grind'),
  ('fire-lichen', 'grind'),
  ('zurkhwood', 'grind'),
  ('tainted-spores-pouch', 'grind'),
  ('pygmywort', 'grind'),
  ('bigwig', 'grind'),
  ('nilhoggs-nose', 'grind'),
  ('timmask', 'grind'),
  ('wind-spores', 'grind'),
  ('cave-cricket-skewer', 'grind'),
  ('fried-grubs', 'grind'),
  ('sporebread-loaf', 'grind'),
  ('barrelstalk', 'cut'),
  ('torchstalk', 'cut'),
  ('trillimac', 'cut'),
  ('nightlight-fungus', 'cut'),
  ('ripplebark', 'cut'),
  ('tongue-of-madness', 'cut'),
  ('blind-cave-fish', 'cut'),
  ('cavern-lizard-meat', 'cut'),
  ('deep-rothe-jerky', 'cut'),
  ('edible-mushrooms', 'cut'),
  ('glowcap', 'cut'),
  ('bonecap', 'cut'),
  ('tessadyle', 'cut'),
  ('waterorb', 'press'),
  ('ormu-moss', 'press'),
  ('nimergan', 'press'),
  ('deep-rothe-milk', 'decant'),
  ('carrion-crawler-mucus', 'decant'),
  ('gray-ooze-residue', 'decant'),
  ('ormu-ink-vial', 'decant'),
  ('vial-of-rapport-spores', 'decant')
) as m(slug, method)
where i.slug = m.slug;
