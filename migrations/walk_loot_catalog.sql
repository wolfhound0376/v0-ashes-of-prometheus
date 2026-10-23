-- walk_loot_catalog.sql — five catalogue rows the book names for Velkynvelve's loot that `items` did not have.
-- Used by lib/walk-loot.ts and /api/walk-loot. Until this runs, the walk shows them as "not in the catalogue yet"
-- and nobody can take them. Additive only: nothing is changed or removed, and a re-run does nothing.
--
-- Sources (Out of the Abyss, ch.1, Velkynvelve):
--   area 7, Ilvara's chest: "a silver chain headdress set with small onyx stones, worth 50 gp ... A small leather
--     purse contains 24 gp, 30 sp, and a small moonstone worth 20 gp"
--   area 2, barracks chests: "Each chest also contains two sets of clothing"
--   Acquisitions: "or even lift a key to the slave pen from a guard"
-- Common clothes: SRD 5.1 Adventuring Gear, 5 sp, 3 lb. `value` is whole gp, so silver-priced things carry 0 and
-- say their silver price in properties.

insert into public.items (slug, name, item_type, equippable_slot, rarity, weight, value, description, source, campaign_slug, stackable, properties)
values
  ('silver-chain-headdress', 'Silver chain headdress', 'accessory', null, 'common', 0.5, 50,
   'A headdress of fine silver chain set with small onyx stones. Ilvara''s, from her chest.',
   'campaign', 'out-of-the-abyss', false, '{"book":"OotA ch.1 area 7","icon_hint":"gem"}'),
  ('moonstone', 'Moonstone', 'misc', null, 'common', 0, 20,
   'A small, milky moonstone.',
   'campaign', 'out-of-the-abyss', true, '{"book":"OotA ch.1 area 7","icon_hint":"gem"}'),
  ('silver-coin', 'Silver coin', 'currency', null, 'common', 0.02, 0,
   'A silver piece. Ten make a gold piece.',
   'campaign', 'out-of-the-abyss', true, '{"value_sp":1,"icon_hint":"coin"}'),
  ('common-clothes', 'Common Clothes', 'gear', 'torso', 'common', 3, 0,
   'Plain clothing. Drow cut, from a barracks chest.',
   'campaign', 'out-of-the-abyss', false, '{"srd":true,"ac_bonus":0,"clothing":true,"value_sp":5,"icon_hint":"clothes"}'),
  ('slave-pen-key', 'Slave pen key', 'misc', null, 'common', 0.1, 0,
   'The key to the gate of Velkynvelve''s slave pen, lifted from a guard.',
   'campaign', 'out-of-the-abyss', false, '{"opens":"velkynvelve-slave-pen","book":"OotA ch.1 Acquisitions","icon_hint":"key"}')
on conflict (slug) do nothing;
