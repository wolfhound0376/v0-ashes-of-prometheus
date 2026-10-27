-- walk_world.plate becomes TEXT — letter plates (10b, 10c, 3k, 5c) and the biome plates (tunnels, crystal, …).
--
-- Sam, 2026-10-26: he climbed the ladder 10 -> 10b and was snapped back to 10 ("The party has moved on — you are
-- with them"). The plate column was an integer and lib/walk-world.ts checked plates with int(0..999), so every write
-- naming a letter plate was refused whole; the page dropped its plate, took the server's (10) and walked him back.
-- The labor plates for rocks, rope, supplies, kitchen, dishes and lift-trouble are all letter plates.
--
-- SCHEMA CHANGE. NOT applied by deploy — this repo's .sql files do not run on push. Apply via the Supabase MCP
-- (apply_migration) on Sam's "run the plate migration", and ONLY AFTER the code from the same PR is live: the old
-- code fingerprints a text "10" differently from the number 10 and would keep snapping screens. The new code works on
-- either column type.
--
-- Precheck (2026-10-27): select plate, count(*) from walk_world group by plate;  ->  10 | 1
-- Every stored value is an integer, so the cast cannot fail. Heroes and travel are jsonb and need nothing.
--
-- Both statements run in one transaction: the merge function cast the plate to integer, and a text column with an
-- integer CASE branch would fail every write between the two.

alter table public.walk_world alter column plate type text using plate::text;

comment on column public.walk_world.plate is 'The plate the party is on: its key in the walk SPEC ("10", "10b", "5c", "tunnels"); null = not yet placed.';

-- walk_world_apply, unchanged except that the plate is stored as text (was (p_patch ->> 'plate')::integer)
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
    plate  = case when p_patch ? 'plate' then (p_patch ->> 'plate') else w.plate end,
    travel = case when p_patch ? 'travel' then p_patch -> 'travel' else w.travel end,
    version = case when (p_patch - 'seats') <> '{}'::jsonb then w.version + 1 else w.version end,
    updated_by = case when (p_patch - 'seats') <> '{}'::jsonb then p_by else w.updated_by end,
    updated_at = now()
  where w.campaign_run_id = p_run
  returning * into r;

  return r;
end;
$$;

-- only the service role (the route) may call it (create or replace keeps the grants; restated so the file stands alone)
revoke all on function public.walk_world_apply(uuid, jsonb, text) from public, anon, authenticated;
