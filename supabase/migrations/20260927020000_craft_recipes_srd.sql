-- Crafting recipes the SRD itself supports (docs/claude_Camp_Module.md §16).
--
-- Sam: "run the recipes" (2026-09-27). APPLIED to Supabase that day and
-- verified: exactly these four items carry `properties.craft`, and every
-- property they already had was kept (the jsonb `||` merge only adds `craft`).
--
-- SRD 5.1 Equipment: Tools names the tool outright for each:
--   Herbalism Kit  — "proficiency with this kit is required to create
--                     antitoxin and potions of healing"
--   Poisoner's Kit — "the equipment necessary for the creation of poisons"
-- Tab: Alchemy, read from the tool (lib/camp.ts TOOL_CATEGORY). No named
-- materials: the SRD prices raw materials in gold (half the market value),
-- and "spider venom gland feeds drow poison" is homebrew — Sam's call.
--
-- Idempotent: re-running rewrites the same `craft` object.

update public.items
   set properties = coalesce(properties, '{}'::jsonb)
     || '{"craft": {"tools": "Herbalism Kit", "source": "SRD 5.1 Equipment: Tools — Herbalism Kit"}}'::jsonb,
       updated_at = now()
 where slug in ('potion-of-healing', 'antitoxin');

update public.items
   set properties = coalesce(properties, '{}'::jsonb)
     || '{"craft": {"tools": "Poisoner''s Kit", "source": "SRD 5.1 Equipment: Tools — Poisoner''s Kit"}}'::jsonb,
       updated_at = now()
 where slug in ('basic-poison-vial', 'drow-poison');
