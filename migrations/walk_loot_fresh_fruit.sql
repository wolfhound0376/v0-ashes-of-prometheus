-- walk_loot_fresh_fruit.sql — fresh fruit, catalogued as rations (Sam, 2026-10-28: "create an icon for fresh fruit and
-- add it to the catalogue as rations"). Additive only; a re-run does nothing.
--
-- Why now: the snagged sack under the lift (lib/walk-loot.ts BOOK_CONTAINERS "cliff-top-sack", OotA Expanded p.45,
-- Lift Trouble: "a container of fresh fruit") pointed at slug `fresh-fruit`, which had no row, so it showed as "not in
-- the catalogue yet" and could not be taken.
--
-- As rations: the same shape as `rations-1-day` (consumable, stackable, common, 2 lb, one day's food), with
-- `counts_as: rations-1-day` so anything that looks for rations can count it. Fresh fruit is rare and precious in the
-- Underdark; its value is left at 0 like the dried rations (no price is invented here).
-- Icon: public/item-pixels/fresh-fruit.png (PixelLab, styled on the rations icon).

insert into public.items (slug, name, item_type, equippable_slot, rarity, weight, value, description, source, campaign_slug, stackable, pixel_icon_url, properties)
values
  ('fresh-fruit', 'Fresh fruit (rations, 1 day)', 'consumable', null, 'common', 2, 0,
   'A container of fresh surface fruit — apples, pears, grapes — fallen off the lift. A day''s food, and a rare luxury this far down. It will not keep the way dried rations do.',
   'campaign', 'out-of-the-abyss', true, '/item-pixels/fresh-fruit.png',
   '{"counts_as":"rations-1-day","ration_days":1,"perishable":true,"book":"OotA Expanded p.45 (Lift Trouble)","icon_hint":"fruit-basket","approved_by":"Sam 2026-10-28"}')
on conflict (slug) do nothing;
