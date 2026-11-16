-- THE REVIEW LOG (Sam, 2026-11-15: "Some of these comments we don't need for the player but the info is important for
-- review. Some of it should be in a log you can access but is minimized."). Every line a map screen shows or keeps back
-- (story, the stage director's review lines, the sync light's changes) lands here, tagged with the screen that saw it,
-- so a playtest can be read afterwards and two screens' accounts compared line by line.
-- Written and read only through /api/walk-log (service role): RLS on, no policies. Additive; nothing else changes.
create table if not exists public.walk_log (
  id            bigserial primary key,
  created_at    timestamptz not null default now(),
  at            timestamptz,                -- when the screen saw it (its own clock, corrected to the server's)
  run           uuid,                       -- campaign_runs.id the screen was playing
  screen        text not null,              -- 'dm' or the seated hero's character id: whose screen saw it
  hero          text,                       -- the hero that screen was moving (slug)
  plate         text,
  mode          text,                       -- explore / talk / combat / travel ...
  kind          text not null check (kind in ('story', 'review', 'sync', 'system')),
  text          text not null
);
create index if not exists walk_log_created on public.walk_log (created_at desc);
create index if not exists walk_log_run_created on public.walk_log (run, created_at desc);
alter table public.walk_log enable row level security;
