-- walk_crossings: a record of every plate crossing on the Underwalk, so a game night's moves can be read afterwards
-- (Sam, 2026-11-15: "party left behind, hard to find the exit, slow or jumpy change, screens out of step" — and
-- walk_world keeps only the latest state, so nothing of the night's crossings survived).
--   kind 'leave'   written by /api/walk-world when the party's travel is patched: from, to, and where every hero stood
--   kind 'arrive'  a screen landed on the plate: how (walked with the party / pulled after it / entered on its own)
--                  and how late, in ms after the party left
--   kind 'waiting' a screen was held back from following (mid-fight, a card open, loading), and why
-- Service role only (RLS on, no policies): written and read through the server.
create table if not exists public.walk_crossings (
  id bigserial primary key,
  campaign_run_id uuid not null,
  at timestamptz not null default now(),
  kind text not null check (kind in ('leave', 'arrive', 'waiting')),
  by_key text,
  slug text,
  from_plate text,
  to_plate text,
  seq bigint,
  lag_ms integer,
  how text,
  heroes jsonb,
  note text
);
create index if not exists walk_crossings_run_at on public.walk_crossings (campaign_run_id, at);
alter table public.walk_crossings enable row level security;
