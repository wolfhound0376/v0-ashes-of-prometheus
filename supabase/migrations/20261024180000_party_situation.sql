-- party_situation — the one row that says where the party is and what state it is in.
--
-- Sam, 2026-10-24: NPCs talked to outside the pen still acted as if the party was in it, because
-- nothing on the painted map told the server the party had moved; the chat route fell back to a
-- hardcoded "Velkynvelve (slave pen)". This row is written by whoever moves the party (the walk
-- page, /api/travel, camp, combat, the DM, a restart) and is the ONLY thing the chat route will
-- read for "where are they and what is their situation" (PR B).
--
-- Ruling (Sam, 2026-10-24): `captive` -> `escaping` fires when the characters STEP OUTSIDE the pen,
-- not when the gate opens. Opening the gate only sets gate_state.
--
-- Design doc: claude/Talk_Situation_And_Sandbox_Mode_2026-10-24.md
-- NOT applied by deploy — this repo's .sql files do not run on push. Apply via the Supabase MCP
-- (apply_migration) on Sam's "run the situation migration".

create table if not exists public.party_situation (
  campaign_run_id uuid primary key references public.campaign_runs (id) on delete cascade,
  node_key        text not null,                               -- travel_nodes.node_key
  sub_location    text,                                        -- plate slug / sub-node name inside the place
  sub_label       text,                                        -- human name of that plate ("Slave Pen")
  stance          text not null default 'captive'
                  check (stance in ('captive','escaping','free','camped','travelling','combat')),
  ward_active     boolean not null default true,               -- the pen's anti-magic sigil still binds them
  gate_state      text not null default 'locked'
                  check (gate_state in ('locked','open','broken')),
  party_present   text[] not null default '{}',                -- names physically here (PCs + companions)
  updated_by      text not null default 'restart',             -- 'walk' | 'travel' | 'camp' | 'combat' | 'dm' | 'restart'
  updated_at      timestamptz not null default now()
);

comment on table public.party_situation is 'Where the party is and what state it is in — one row per campaign run; written by whoever moves the party, read by the chat route.';

alter table public.party_situation enable row level security;

-- the dashboard and the map read it live; writes go only through service-role routes
drop policy if exists party_situation_read on public.party_situation;
create policy party_situation_read on public.party_situation for select using (true);

-- realtime so the dashboard caption and the map follow a move without polling
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'party_situation'
  ) then
    alter publication supabase_realtime add table public.party_situation;
  end if;
end $$;

-- seed: the active run starts captive in the pen (matches /api/restart-campaign's start node)
insert into public.party_situation (campaign_run_id, node_key, sub_location, sub_label, stance, ward_active, gate_state, updated_by)
select r.id, 'velkynvelve', 'node-11-slave-pen', 'Slave Pen', 'captive', true, 'locked', 'restart'
from public.campaign_runs r
where r.status = 'active'
order by r.run_number desc
limit 1
on conflict (campaign_run_id) do nothing;
