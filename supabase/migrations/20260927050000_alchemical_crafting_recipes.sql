-- Alchemical Crafting recipes (docs/claude_Camp_Module.md §18).
--
-- Sam, 2026-09-27: "ADD THE ALCHEMY RECIPES TO THE CATALOG". APPLIED to
-- Supabase that day and verified: eight catalog rows now carry
-- `properties.craft`.
--
-- Xanathar's Guide to Everything, Tool Proficiencies — Alchemical Crafting
-- (p. 79): a character proficient with alchemist's supplies can make acid,
-- alchemist's fire, antitoxin, oil, perfume or soap. The catalog has no soap
-- row, so soap is not a recipe (nothing is invented). Antitoxin keeps the
-- SRD's Herbalism Kit and gains alchemist's supplies as an alternative.
-- Data only, no schema change. Idempotent: the jsonb merge only adds `craft`.

update public.items
   set properties = coalesce(properties, '{}'::jsonb)
     || '{"craft": {"tools": "Alchemist''s Supplies", "source": "Xanathar''s Guide to Everything, Tool Proficiencies — Alchemical Crafting (p. 79)"}}'::jsonb,
       updated_at = now()
 where slug in ('acid-vial', 'alchemists-fire', 'lamp-oil', 'perfume-vial');

update public.items
   set properties = jsonb_set(properties, '{craft,alt_tools}', '["Alchemist''s Supplies"]'::jsonb),
       updated_at = now()
 where slug = 'antitoxin' and properties ? 'craft';
