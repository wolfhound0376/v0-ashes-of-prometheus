-- Applied to production 2026-08-27. Recorded here so the schema has a history.
--
-- World flags: the small durable facts the whole table has to agree on. A row
-- exists only once the thing has happened; absence means it has not. There is
-- no stored false, so nothing has to be seeded and no screen can read a stale
-- "not yet" that was never written.
create table if not exists public.world_flags (
  campaign_id text not null default 'ashes-of-prometheus',
  key         text not null,
  value       jsonb not null default 'true'::jsonb,
  set_at      timestamptz not null default now(),
  set_by      text,
  note        text,
  primary key (campaign_id, key)
);

alter table public.world_flags enable row level security;

-- Same shape as combat_state: everyone reads, only the server writes.
drop policy if exists world_flags_read on public.world_flags;
create policy world_flags_read on public.world_flags
  for select to anon, authenticated using (true);

-- A door opening is a moment. Every screen should change at once, not on
-- whoever refreshes first.
do $$
begin
  alter publication supabase_realtime add table public.world_flags;
exception when duplicate_object then null;
end $$;

-- The NPC window's backdrop, per scene and per state of that scene.
alter table public.environments
  add column if not exists npc_backdrop_url text,
  add column if not exists npc_backdrop_open_url text;

-- The default is the door SHUT. The open painting shows only once the flag
-- is set, and nothing sets it at install time.
--
-- The first cut of this had the two backdrops swapped, because the source art
-- is named "Bamboo Cell Background" (door open) and "Bamboo Cell Open
-- Background" (door shut) - inverted. These URLs were checked by opening the
-- images, not by reading their filenames.
update public.environments
set npc_backdrop_url      = 'https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/scenes/pen-door-closed-v2.webp',
    npc_backdrop_open_url = 'https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/scenes/pen-door-open-v2.webp'
where scene_key = 'velkynvelve-slave-pen';
