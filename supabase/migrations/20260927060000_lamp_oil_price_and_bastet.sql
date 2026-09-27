-- Two data fixes, Sam 2026-09-27. APPLIED to Supabase that day and verified.
-- Data only, no schema change.

-- 1. "fix the lamp oil price to 1 sp." items.value is whole gold pieces and
--    cannot hold 1 sp, so this follows the Rations (1 day) convention: value 0,
--    the real price in properties.price, and the crafting materials set
--    explicitly — the SRD's half of 1 sp is 5 cp (camp doc §18).
update public.items
   set value = 0,
       properties = jsonb_set(coalesce(properties, '{}'::jsonb) || '{"price": "1 sp"}'::jsonb, '{craft,cost_gp}', '0.05'::jsonb),
       updated_at = now()
 where slug = 'lamp-oil' and properties ? 'craft';

-- 2. "We can remove Bastet's player." Archived the way the DM panel's Archive
--    does it (app/api/dm/characters, action "archive"): a soft delete. The
--    row, sheet and gear survive; the DM panel's Restore brings her back.
update public.characters
   set archived_at = now(), in_party = false, updated_at = now()
 where id = 'edfb8bcc-27c3-4e8f-b77e-b66e71cc31bc' and name = 'Bastet';
