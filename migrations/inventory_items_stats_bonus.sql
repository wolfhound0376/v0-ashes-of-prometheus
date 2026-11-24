-- A carried item's own bonus (Sam, 2026-11-24: the Traveler's Cloak's knack).
--
-- Each Traveler's Cloak is +1 Dexterity or +1 Stealth, set per cloak by a passive 1d2. The roll has to live on the
-- CARRIED row (inventory_items), because the worn row (equipment_items) is deleted every time the cloak comes off;
-- without this column, taking a cloak off and putting it back on has nowhere to read its knack from.
--
--   null            = not rolled yet, or an item that has no knack
--   {"dex": 1}      = this cloak's knack, read by lib/worn-bonus.ts once it is worn
--
-- Additive and safe to run twice. Nothing depends on the column until it exists: lib/item-knack-rows.ts treats a
-- missing column as "no knacks" and the game carries on as before.
--
-- Run by hand in the Supabase SQL Editor (migrations do not run on deploy).

alter table public.inventory_items add column if not exists stats_bonus jsonb;

comment on column public.inventory_items.stats_bonus is
  'This item''s own worn bonus, e.g. {"dex": 1}. Set once from items.properties.benefit_roll (lib/item-knack.ts); copied onto equipment_items.stats_bonus when worn.';

-- Fifi's cloak was rolled by hand on 2026-11-24 (1d2 = 1, +1 Dexterity) and written to her worn row only.
-- Put the same result on the carried row, so it survives being taken off.
update public.inventory_items i
   set stats_bonus = e.stats_bonus
  from public.equipment_items e
 where e.character_id = i.character_id
   and e.item_key = i.item_key
   and i.item_key = 'traveler-s-cloak'
   and i.stats_bonus is null
   and e.stats_bonus is not null
   and e.stats_bonus <> '{}'::jsonb;
