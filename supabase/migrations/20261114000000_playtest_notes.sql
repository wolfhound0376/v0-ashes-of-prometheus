-- PLAYTEST NOTES (Sam, 2026-11-13): the DM's one-line notes to Claude, written while playing (F9 on the map).
-- Read and written only through /api/playtest-notes (service role): RLS on, no policies. Additive; nothing else changes.
create table if not exists public.playtest_notes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  note        text not null,
  plate       text,
  area        text,
  shot_path   text,                       -- vtt-assets/playtest/<id>.jpg
  state       jsonb,                      -- the game at the moment F9 was pressed
  status      text not null default 'open' check (status in ('open', 'done')),
  resolution  text                        -- what fixed it (a PR), written when it is marked done
);
create index if not exists playtest_notes_status_created on public.playtest_notes (status, created_at desc);
alter table public.playtest_notes enable row level security;
