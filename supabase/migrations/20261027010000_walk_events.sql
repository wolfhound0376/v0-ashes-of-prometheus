-- walk_events: one row per map event that has been told to Malachar (Sam, 2026-10-27: "Build all of it").
--
-- The painted map runs in every browser at the table, so an automatic event — a guard spots a sneak, combat opens,
-- Jorlan speaks at the bars — happens on every screen at once. /api/walk-event lets the first screen to report an event
-- claim it; only that screen sends it to Malachar. `sig` is the map's fingerprint of the event (plate + text);
-- `bucket` is the server's 30-second window, so the same thing happening again later is a new event.
--
-- Service role only: RLS on, no policies. Nothing reads it but the route.

create table if not exists public.walk_events (
  sig        text        not null,
  bucket     bigint      not null,
  text       text,
  created_at timestamptz not null default now(),
  primary key (sig, bucket)
);

alter table public.walk_events enable row level security;

comment on table public.walk_events is
  'Map events claimed for Malachar, one per (sig, 30 s bucket). Written by /api/walk-event with the service role.';
