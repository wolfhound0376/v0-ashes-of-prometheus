-- Bead of Nourishment in the catalog (docs/claude_Camp_Module.md §10).
--
-- Sam, 2026-09-27: "Beads of nourishment can go in the catalog and count
-- towards rations." Source: Xanathar's Guide to Everything, common magic
-- items (p. 136) — one bead is as much food as one day of rations. The book
-- gives no weight or price; both stay null, like the other XGE commons.
--
-- `properties.rations = 1` is what the rest code reads: every bead carried
-- by a player counts as one ration, spent only after `party_supplies` runs
-- dry (lib/camp.ts `spendRations`).
--
-- Data only, no schema change. APPLIED to Supabase 2026-09-27.
-- Idempotent: re-running updates the same row.

insert into public.items
  (slug, item_key, name, aliases, item_type, rarity, description, source,
   campaign_slug, stackable, attunement, cursed, sentient, properties)
values
  ('bead-of-nourishment', 'bead-of-nourishment', 'Bead of Nourishment',
   array['bead of nourishment', 'nourishment bead'],
   'consumable', 'common',
   'A spongy, tasteless bead that melts on the tongue and feeds you as well as a full day of rations.',
   'campaign', 'out-of-the-abyss', true, false, false, false,
   '{"book": "XGE", "page": 136, "rations": 1, "icon_hint": "pearl"}'::jsonb)
on conflict (slug) do update
  set properties = excluded.properties,
      description = excluded.description,
      updated_at = now();
