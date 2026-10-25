-- SUPERSEDED: Sam chose the PR 832 vocabulary on 2026-10-25; migrations/20261025020000_party_situation_retire_819_columns.sql
-- removes the columns this added. Kept as the record of what the database held in between.
--
-- APPLIED 2026-10-25 ~01:08 UTC through the Supabase connector, on Sam's instruction ("apply the migration").
-- Recorded here because migrations do not run on deploy and the repo should say what the database holds.
--
-- What happened. Two lanes built a `party_situation` table on the same day, same name, same key, different columns:
--   * PR 819 (this file's sibling migrations/20261024000000_party_situation.sql) + aa9d21f (Malachar reads it):
--     source, place, area_key, area_no, area_name, activity, talking_to, leader, party, company, nearby, flags, note.
--     This is what main's code writes (/api/party/situation) and reads (app/api/chat/route.ts via lib/situation-store.ts).
--   * PR 832 (feat/party-situation -> feat/pen-walk-out, NOT on main): node_key, sub_location, sub_label, stance,
--     ward_active, gate_state, party_present, updated_by. Its migration (supabase/migrations/20261024180000_party_situation.sql
--     on that branch) is the one that was actually applied first, 2026-10-25 00:35 UTC, so the live table had THAT shape.
-- Result: main's writes failed in production ("column \"place\" does not exist", postgres log 2026-10-25 01:01:59 UTC) and
-- the chat route's read came back with none of the fields it summarises (caught; Malachar just lost the situation).
--
-- This reconciles by ADDING main's columns beside the other lane's. Nothing is dropped, so whichever vocabulary Sam
-- keeps, both codebases write and read without error until the fork is settled. Reversible: drop the added columns
-- and `alter column node_key drop default`.

alter table public.party_situation
  add column if not exists source     text        not null default 'walk',
  add column if not exists place      text,
  add column if not exists area_key   text,
  add column if not exists area_no    integer,
  add column if not exists area_name  text,
  add column if not exists activity   text        not null default 'exploring',
  add column if not exists talking_to text,
  add column if not exists leader     text,
  add column if not exists party      jsonb       not null default '[]'::jsonb,
  add column if not exists company    jsonb       not null default '[]'::jsonb,
  add column if not exists nearby     jsonb       not null default '[]'::jsonb,
  add column if not exists flags      jsonb       not null default '{}'::jsonb,
  add column if not exists note       text;

-- main's upsert never sends node_key; the other lane always does. Postgres checks NOT NULL before ON CONFLICT
-- resolves, so without a default main's write would fail even when the run's row already exists.
alter table public.party_situation alter column node_key set default 'velkynvelve';

-- RLS, the anon/authenticated SELECT policy and supabase_realtime membership were already in place from the first
-- migration and are unchanged.
