-- Things lying on the floor of the board.
--
-- Sam (2 Sep 2026): "We need a way to be able to pick up items (to put in
-- inventory, throw, interact with) on our player UI. If we need to put an
-- item on the ground in the pen to be able to interact we can do that; maybe
-- an obsidian shard that can also be used as a weapon."
--
-- Until now the board knew two kinds of thing: a creature (vtt_tokens) and a
-- stain (vtt_maps.meta.marks). An item on the floor was neither, so there was
-- nothing to click. This table is that third kind. One row is one pile on one
-- square of one map. It always points at the canonical catalogue - a floor
-- item is a catalogue item lying down, never a name somebody typed - which is
-- the same invariant the AI is held to: nothing is invented, everything
-- resolves against public.items.
--
-- Rows are never deleted by play. Picking a thing up stamps picked_up_by /
-- picked_up_at, the way confiscation moves gear rather than destroying it, so
-- the floor keeps its history and a wrong click can be undone by hand.

create table if not exists public.vtt_ground_items (
  id            uuid primary key default gen_random_uuid(),
  map_id        uuid not null references public.vtt_maps (id) on delete cascade,
  item_id       uuid not null references public.items (id),
  -- The display name, copied from the catalogue at the moment it hit the
  -- floor, so a later catalogue rename does not rewrite what the table saw.
  name          text not null,
  quantity      integer not null default 1 check (quantity > 0),
  grid_x        integer not null,
  grid_y        integer not null,
  -- Provenance. Null dropped_by means the world put it there (a seed, the DM).
  dropped_by    uuid references public.characters (id),
  picked_up_by  uuid references public.characters (id),
  picked_up_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.vtt_ground_items is
  'Catalogue items lying on a square of a battle map. picked_up_at null = still on the floor. Written by /api/ground-items; read by the board.';

create index if not exists vtt_ground_items_floor_idx
  on public.vtt_ground_items (map_id) where picked_up_at is null;

-- Same shape as vtt_tokens: the board reads with the anon key, the routes
-- write with the service role.
alter table public.vtt_ground_items enable row level security;

drop policy if exists vtt_ground_items_read on public.vtt_ground_items;
create policy vtt_ground_items_read on public.vtt_ground_items
  for select using (true);

-- Realtime, so a pickup on one browser vanishes from every board at the table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'vtt_ground_items'
  ) then
    alter publication supabase_realtime add table public.vtt_ground_items;
  end if;
end $$;

-- THE SHARD. A catalogue entry, because the invariant says so: nothing lies
-- on the floor that the catalogue does not know. Distinct from the drow
-- "Obsidian flake dagger" (a made weapon, worth coin) - this is a broken
-- piece of volcanic glass, an improvised blade, worth nothing, and the first
-- thing a prisoner in the pen might close a hand around.
insert into public.items
  (slug, name, aliases, item_type, equippable_slot, rarity, weight, value, description,
   source, campaign_slug, stackable, properties)
select
  'obsidian-shard', 'Obsidian Shard',
  array['obsidian shard', 'shard of obsidian', 'glass shard', 'obsidian splinter'],
  'weapon', 'main_hand', 'common', 0.5, 0,
  'A fist-length flake of black volcanic glass, edged sharper than any forged blade and about as fragile. Improvised: 1d4 slashing, finesse, light, can be thrown (20/60).',
  'homebrew', 'ashes-of-prometheus', false,
  '{"damage": "1d4", "damage_type": "slashing", "range": "20/60", "weapon_properties": ["finesse", "light", "thrown"], "improvised": true, "icon_hint": "shard", "homebrew": true}'::jsonb
where not exists (select 1 from public.items where slug = 'obsidian-shard');

-- ONE ON THE FLOOR OF THE PEN. Square (3,7) of the V5 node-11 tile: open
-- floor, nobody standing on it, one diagonal step from where Scott's token
-- stands today - so the first click can be tried without a walk. Keyed by
-- the node rather than an id, and only once.
insert into public.vtt_ground_items (map_id, item_id, name, quantity, grid_x, grid_y)
select m.id, i.id, i.name, 1, 3, 7
from public.vtt_maps m
join public.items i on i.slug = 'obsidian-shard'
where m.is_active = true and m.meta->>'node' = '11'
  and not exists (
    select 1 from public.vtt_ground_items g
    where g.map_id = m.id and g.item_id = i.id and g.picked_up_at is null
  )
limit 1;
