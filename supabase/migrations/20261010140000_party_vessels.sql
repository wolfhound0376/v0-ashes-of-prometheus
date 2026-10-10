-- The party's boats on the Darklake.
--
-- Out of the Abyss ch.3: "The adventurers need to find a way to cross the
-- Darklake" - hire passage or a boat in Sloobludop (zurkhwood vessels,
-- "equivalent to keelboats"), or hollow out a zurkhwood cap into a coracle
-- ("equivalent to a rowboat, but with half a rowboat's hit points", one day's
-- work each), or ride a barrel. "A sizable party might need multiple boats",
-- so this is a table of boats, not a flag.
--
-- A row with lost_at null is a boat the party has now. Losing one (sunk,
-- stolen, left behind) sets lost_at; rows are never deleted, so the boat's
-- history stays canon. Stats are copied onto the row when it is acquired, so
-- damage to one boat never touches another. The stat sources are in
-- lib/travel/vessels.ts.
--
-- Everyone may read (players see whether they have a boat); only the
-- service-role server route writes.

create table if not exists public.party_vessels (
  id uuid primary key default gen_random_uuid(),
  campaign_run_id uuid references public.campaign_runs(id),
  kind text not null check (kind in ('keelboat', 'coracle', 'barrel')),
  name text,
  ac smallint not null,
  hp_max integer not null,
  hp_current integer not null,
  damage_threshold smallint not null default 0,
  crew smallint not null,
  passengers smallint not null,
  speed_mph numeric(4, 2) not null,
  source text not null,
  acquired_at timestamptz not null default now(),
  lost_at timestamptz,
  lost_reason text,
  created_at timestamptz not null default now()
);

create index if not exists party_vessels_afloat on public.party_vessels (campaign_run_id) where lost_at is null;

alter table public.party_vessels enable row level security;

create policy party_vessels_read on public.party_vessels for select using (true);

alter publication supabase_realtime add table public.party_vessels;

-- Hours rowed since the last Darklake encounter check (one every 4 hours on
-- the water), kept beside the land march's miles so short crossings add up.
alter table public.travel_march add column if not exists water_hours_since_check numeric not null default 0;
