-- travel_march: who leads the march (Sam, 2026-10-14).
--
-- "DM selects it but the group technically votes to determine the leader from
-- the main players. That can change if they lose confidence."
--
-- leader_votes      {voter character id: candidate character id}; votes stand
--                   until changed, so losing confidence is voting again.
-- leader_character_id  the character who may move the party. Set by the tally
--                   (more than half of the players) or by the DM outright.
--
-- Paste into Supabase → SQL Editor. Does not run on deploy. The route reads
-- these best-effort, so the map keeps working before this is applied — only
-- the vote and the leader-led march stay off until then.

alter table public.travel_march
  add column if not exists leader_character_id uuid references public.characters(id) on delete set null,
  add column if not exists leader_votes jsonb not null default '{}'::jsonb;
