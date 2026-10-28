-- walk_loot_coins.sql — the three coin rows a fallen creature's purse can hold that `items` did not have.
-- Used by lib/walk-loot.ts rollPurse (DMG ch.7 "Individual Treasure"). Until this runs, those coins show on a body
-- as "not in the catalogue yet" and cannot be taken; silver and gold already exist. Additive only; a re-run does nothing.
-- SRD 5.1 Equipment, Coinage: 1 gp = 10 sp = 100 cp; 1 ep = 5 sp; 1 pp = 10 gp; fifty coins weigh a pound.
-- `value` is whole gp, so the smaller coins carry 0 and say their silver or copper price in properties.

insert into public.items (slug, name, item_type, equippable_slot, rarity, weight, value, description, source, campaign_slug, stackable, properties)
values
  ('copper-coin', 'Copper coin', 'currency', null, 'common', 0.02, 0,
   'A copper piece. A hundred make a gold piece.',
   'srd', null, true, '{"srd":true,"value_cp":1,"icon_hint":"coin"}'),
  ('electrum-coin', 'Electrum coin', 'currency', null, 'common', 0.02, 0,
   'An electrum piece, worth five silver.',
   'srd', null, true, '{"srd":true,"value_sp":5,"icon_hint":"coin"}'),
  ('platinum-coin', 'Platinum coin', 'currency', null, 'common', 0.02, 10,
   'A platinum piece, worth ten gold.',
   'srd', null, true, '{"srd":true,"value_gp":10,"icon_hint":"coin"}')
on conflict (slug) do nothing;
