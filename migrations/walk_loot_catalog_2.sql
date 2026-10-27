-- walk_loot_catalog_2.sql — one more catalogue row the book names for Velkynvelve that `items` did not have
-- (Sam, 2026-10-27: NPCs should have something to steal). Additive only; a re-run does nothing.
--
-- Source: Out of the Abyss ch.1, Velkynvelve area 7: "The chest is locked, and Ilvara keeps the key in a hidden pocket
-- on the inside of her belt." Lifted from her (lib/walk-loot.ts POCKETS.ilvara), it opens her chest without the
-- poison needle. Shoor's wand is already catalogued (wand-of-viscid-globs).

insert into public.items (slug, name, item_type, equippable_slot, rarity, weight, value, description, source, campaign_slug, stackable, properties)
values
  ('ilvara-chest-key', 'Ilvara''s chest key', 'misc', null, 'common', 0.1, 0,
   'A small, finely made key from a hidden pocket inside Ilvara''s belt. It opens the chest in her quarters.',
   'campaign', 'out-of-the-abyss', false, '{"opens":"ilvara-chest","book":"OotA ch.1 area 7","icon_hint":"key"}')
on conflict (slug) do nothing;
