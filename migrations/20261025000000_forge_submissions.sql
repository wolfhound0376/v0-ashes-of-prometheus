-- forge_submissions — a hero forged at /forge, waiting for the Dungeon Master to open the cell.
--
-- Sam, 2026-10-24: "You will be assigned a code but will be unable to be seated unless your
-- account is activated by the DM." So a new hero is NOT a `characters` row yet. The whole
-- aop-character-v1 export, the player's look / voice / face choices and their three words live
-- here until the DM presses Activate; only then does the import run and the real character row
-- (plus its character_secrets, carrying THESE words) appear. Nothing in the game ever sees a
-- pending hero — no roster card, no map token, no seat.
--
-- RLS on, NO policies: service-role only, like character_secrets. The anon key cannot read a
-- submission (a player's words are in here), and all writes go through API routes.
--
-- Apply by hand in the Supabase SQL editor (migrations do not run on deploy):
--   https://supabase.com/dashboard/project/ppadxmvvvxmnnejeaoer/sql/new

create table if not exists public.forge_submissions (
  id            uuid primary key default gen_random_uuid(),
  -- The player's three words, normalised (word-word-word-nnn), the same shape and the same
  -- uniqueness as character_secrets.claim_code — on activation they are copied there verbatim,
  -- so the door at /join opens for them without learning anything new.
  claim_code    text not null unique,
  player_name   text not null,
  hero_name     text not null,
  -- Exactly what POST /api/forge/import accepts: { format, character, inventory }.
  payload       jsonb not null,
  -- look / voice / face / sprite choices and private blob paths (see lib/forge-submission.ts).
  assets        jsonb not null default '{}'::jsonb,
  status        text not null default 'pending' check (status in ('pending', 'activated', 'rejected')),
  character_id  uuid references public.characters(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  activated_at  timestamptz,
  activated_by  text
);

create index if not exists forge_submissions_status_idx on public.forge_submissions (status, created_at);

alter table public.forge_submissions enable row level security;
-- No policies on purpose. Service role bypasses RLS; anon gets nothing.
