-- bent_wire_catalog.sql — one catalogue row: the wire Jimjar found.
-- Sam, 2026-11-12: "Jimjar approaches Fifi and offers to help but for a price. He offers a small metal wire he found
-- which she can attempt once per short rest on her manacles." HOMEBREW, not from Out of the Abyss.
-- Used by lib/walk-loot.ts (PRISONER_EXTRAS) and the walk. Additive only: nothing is changed or removed, and a re-run
-- does nothing. It is NOT thieves' tools (Sam, 2026-11-12: manacles only, never the pen gate's lock).
-- No art yet: pixel_icon_url is null, so the bag shows the neutral tile until Sam approves an icon.

insert into public.items (slug, name, item_type, equippable_slot, rarity, weight, value, description, source, campaign_slug, stackable, properties)
values
  ('bent-wire', 'Bent wire', 'misc', null, 'common', 0, 0,
   'A short length of stiff metal wire, bent to a hook at one end. Jimjar found it. It might turn the lock of a manacle; it is no use on a real lock.',
   'campaign', 'out-of-the-abyss', false,
   '{"homebrew":true,"ruling_by":"Sam 2026-11-12","opens":"manacles","not_thieves_tools":true,"icon_hint":"lockpick"}')
on conflict (slug) do nothing;
