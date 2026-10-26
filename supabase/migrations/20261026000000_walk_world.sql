-- walk_world — ONE WORLD for the Underwalk (the painted Velkynvelve map).
--
-- Sam, 2026-10-25: Fifi (Stephanie's browser) and Gandalf (Sam's computer) "were not synced well". Cause, from
-- the night's own records: after the session went live at 21:26 the server heard nothing from the map — every
-- browser kept its own private copy of the world in sessionStorage (plate, hero positions, gate, room dice).
-- This row is the one shared copy; lib/walk-world.ts holds the rules both sides apply.
--
-- One row per campaign run. A New Game opens a new run, so a new game starts with an empty world and the old
-- row goes with its run (on delete cascade).
--
-- NEW TABLE + NEW FUNCTION. NOT applied by deploy — this repo's .sql files do not run on push. Apply via the
-- Supabase MCP (apply_migration) on Sam's "run the one world migration".

create table if not exists public.walk_world (
  campaign_run_id uuid primary key references public.campaign_runs (id) on delete cascade,
  version     bigint      not null default 0,          -- +1 on every change to plate/state/heroes/travel (not heartbeats)
  plate       integer,                                 -- the plate the party is on (SPEC number on the map); null = not yet placed
  state       jsonb       not null default '{}'::jsonb, -- the map's `state` object, merged key by key
  heroes      jsonb       not null default '{}'::jsonb, -- slug -> {x,y,tx,ty,face,plate,seq,by,cid}
  travel      jsonb,                                   -- the last plate change {seq,from,to,zone,by,at}
  seats       jsonb       not null default '{}'::jsonb, -- client key -> heartbeat {at,slug,cid,dm,seat,digest,version,status}
  updated_by  text,
  updated_at  timestamptz not null default now()
);

comment on table public.walk_world is 'The Underwalk''s one shared world per campaign run: plate, hero positions, map state, heartbeats. Written only by /api/walk-world (service role); read live by every map.';

alter table public.walk_world enable row level security;

-- every map reads it live; writes go only through the service-role route
drop policy if exists walk_world_read on public.walk_world;
create policy walk_world_read on public.walk_world for select using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'walk_world'
  ) then
    alter publication supabase_realtime add table public.walk_world;
  end if;
end $$;

-- One atomic merge, so two browsers writing at the same moment can never half-overwrite each other:
--   state  : top-level keys of the patch replace the stored ones (others untouched)
--   heroes : a hero entry is taken only if its seq is newer than the stored one (a late packet never wins)
--   seats  : heartbeats, merged by client key; a heartbeat alone does not bump the version
--   plate / travel : replaced when present
create or replace function public.walk_world_apply(p_run uuid, p_patch jsonb, p_by text)
returns public.walk_world
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.walk_world;
begin
  insert into public.walk_world (campaign_run_id) values (p_run) on conflict (campaign_run_id) do nothing;

  update public.walk_world w set
    state  = case when p_patch ? 'state' then w.state || (p_patch -> 'state') else w.state end,
    heroes = case when p_patch ? 'heroes' then w.heroes || coalesce((
               select jsonb_object_agg(e.key, e.value)
               from jsonb_each(p_patch -> 'heroes') e
               where coalesce((e.value ->> 'seq')::numeric, 0) > coalesce((w.heroes -> e.key ->> 'seq')::numeric, -1)
             ), '{}'::jsonb) else w.heroes end,
    seats  = case when p_patch ? 'seats' then w.seats || (p_patch -> 'seats') else w.seats end,
    plate  = case when p_patch ? 'plate' then (p_patch ->> 'plate')::integer else w.plate end,
    travel = case when p_patch ? 'travel' then p_patch -> 'travel' else w.travel end,
    version = case when (p_patch - 'seats') <> '{}'::jsonb then w.version + 1 else w.version end,
    updated_by = case when (p_patch - 'seats') <> '{}'::jsonb then p_by else w.updated_by end,
    updated_at = now()
  where w.campaign_run_id = p_run
  returning * into r;

  return r;
end;
$$;

-- only the service role (the route) may call it
revoke all on function public.walk_world_apply(uuid, jsonb, text) from public, anon, authenticated;
