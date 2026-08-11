-- Velkynvelve confiscation and prisoner cleanup, 2026-08-10.
-- MANUAL DATA MIGRATION: deploy the derived-AC code first, back up the affected
-- tables, then paste this entire transaction into the Supabase SQL Editor.

begin;

-- A non-player character row gives the recoverable stash a stable owner using
-- the existing inventory_items.character_id foreign key.
insert into public.characters (
  name, class, level, hp_current, hp_max, ac, initiative,
  proficiency_bonus, passive_perception,
  str_score, str_modifier, dex_score, dex_modifier, con_score, con_modifier,
  int_score, int_modifier, wis_score, wis_modifier, cha_score, cha_modifier,
  xp, xp_to_next, weight_current, weight_max, is_player, character_type
)
select
  'Velkynvelve Equipment Stash', 'Storage', 0, 1, 1, 10, 0,
  0, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0, 10, 0,
  0, 0, 0, 10000, false, 'npc'
where not exists (
  select 1 from public.characters where name = 'Velkynvelve Equipment Stash'
);

-- Campaign-specific catalog entry. The icon is intentionally null until the
-- supplied Rags_Icon.png is uploaded through admin.
insert into public.items (
  name, slug, item_type, equippable_slot, rarity, weight, value, condition,
  description, icon_url
)
values (
  'Rags', 'rags', 'armor', 'torso', 'common', 2, 0, 'damaged',
  'Damaged prison rags issued to captives at Velkynvelve.', null
)
on conflict (slug) do nothing;

-- Confiscate, do not destroy, everything presently held by player rows.
update public.inventory_items
set character_id = (
  select id from public.characters
  where name = 'Velkynvelve Equipment Stash'
  order by created_at limit 1
)
where character_id in (select id from public.characters where is_player = true);

delete from public.equipment_items
where character_id in (select id from public.characters where is_player = true);

-- One carried copy and one worn paper-doll entry per player. Rags have no AC
-- bonus; the deployed application therefore derives 10 + Dexterity.
insert into public.inventory_items (
  character_id, item_id, name, quantity, icon_url, icon_type, preset_icon,
  description, weight, value, item_type, equippable_slot
)
select c.id, i.id, i.name, 1, i.icon_url, 'preset', 'shirt',
       i.description, i.weight, i.value, i.item_type, i.equippable_slot
from public.characters c cross join public.items i
where c.is_player = true and i.slug = 'rags';

insert into public.equipment_items (
  character_id, slot, name, icon_url, equipped, description, stats_bonus
)
select c.id, 'torso', 'Rags', i.icon_url, true, i.description, '{"ac": 0}'::jsonb
from public.characters c cross join public.items i
where c.is_player = true and i.slug = 'rags';

-- Remove the abandoned Samson import and John's retired seat. Cascading FKs
-- clean their dependent inventory and secrets rows.
delete from public.characters where id = '77724f03-4aad-44ba-83d7-6f0d022766ec';
delete from public.characters where id = 'd4cd6575-becb-4d69-9265-7447fe1475fb';

update public.characters set ac = 10 where is_player = true;

commit;
