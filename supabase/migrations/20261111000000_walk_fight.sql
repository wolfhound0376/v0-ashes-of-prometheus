-- walk_fight — ONE FIGHT for the Underwalk (Sam, 2026-11-10: "fight MUST be synced and wait for other players actions,
-- and have complete parity. Make sure of this.").
--
-- One screen runs a fight (the AUTHORITY: the screen that opened it). It writes a `tick` every quarter second: what
-- changed (actors, the turn, the menu of the hero whose turn it is) and what happened (log lines, sounds, effects).
-- Every other screen at the table reads the ticks and shows that same fight; a player whose hero's turn it is writes
-- `in` messages (a menu row, a click on the map, a dialog answer), which the authority plays as if clicked there.
-- Writes go only through /api/walk-fight (service role). No browser reads these tables directly.
--
-- One live fight per campaign run (the partial unique index); a second plate's fight runs on its own screen as before.

create table if not exists public.walk_fights (
  id uuid primary key default gen_random_uuid(),
  campaign_run_id uuid not null,
  plate text not null,
  auth_key text not null,                         -- "dm" or the authority's character id (the One World key)
  auth_seen timestamptz not null default now(),   -- the authority's last tick: a fight gone quiet is let go
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create unique index if not exists walk_fights_one_live on public.walk_fights (campaign_run_id) where ended_at is null;

create table if not exists public.walk_fight_msgs (
  id bigserial primary key,
  fight_id uuid not null references public.walk_fights (id) on delete cascade,
  kind text not null check (kind in ('tick', 'in', 'end')),
  by_key text not null,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists walk_fight_msgs_fight_id on public.walk_fight_msgs (fight_id, id);

alter table public.walk_fights enable row level security;
alter table public.walk_fight_msgs enable row level security;
-- no policies: only the service role (the API) reads or writes

comment on table public.walk_fights is 'The Underwalk''s shared fight: one live per campaign run, run on one screen (auth_key), shown on every screen.';
comment on table public.walk_fight_msgs is 'A shared fight''s stream: authority ticks (state + effects), players'' inputs, the end.';
