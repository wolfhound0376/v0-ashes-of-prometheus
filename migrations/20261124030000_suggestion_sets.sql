-- OPTION SETS (Sam, 2026-11-23: Malachar's options "MUST all be Germaine or misleading in some way but ON PURPOSE").
-- One set of option chips per (beat, hero): the cache that stops a reload or a second screen paying for the same
-- options twice, and the DM's audit of which options were bait (The Cast shows them; players never see the tags).
-- Design of record: project doc claude/Malachar_Options_2026-11-23.md. Additive; no existing table touched.
create table if not exists public.suggestion_sets (
  id            uuid primary key default gen_random_uuid(),
  beat_key      text not null,
  character_id  uuid not null,
  author        text not null default 'Malachar',   -- whose options: Malachar, or the NPC being talked to
  moment        jsonb not null default '{}'::jsonb,  -- what the writer was told (lib/moment.ts)
  suggestions   jsonb not null default '[]'::jsonb,  -- [{text, skill, kind, intent: germane|bait}]
  picked        text,                                -- the chip the player took, when they took one
  created_at    timestamptz not null default now(),
  unique (beat_key, character_id)
);
create index if not exists suggestion_sets_author_idx on public.suggestion_sets (author, created_at desc);
alter table public.suggestion_sets enable row level security;  -- service role only: the intent tags are DM eyes only
