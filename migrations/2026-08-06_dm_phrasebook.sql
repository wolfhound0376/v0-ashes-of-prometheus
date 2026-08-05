-- dm_phrasebook — Malachar's memory of his own phrasings, across restarts.
--
-- WHY: his anti-repetition rule could only see the current dialogue log, and
-- Restart Campaign deletes that log. Every restart therefore replayed the same
-- opening material ("let's see what you managed to hide...") because he had no
-- memory of ever saying it. This table records the opening line of each of his
-- responses; the chat route feeds the newest 30 back into his prompt as a ban
-- list and prunes the table to the newest 60 rows.
--
-- Service-role only, same pattern as character_secrets: RLS on with no
-- policies. The anon key gets zero rows; only the server reads and writes.

create table if not exists public.dm_phrasebook (
  id         bigint generated always as identity primary key,
  opening    text not null,
  created_at timestamptz not null default now()
);

alter table public.dm_phrasebook enable row level security;
revoke all on public.dm_phrasebook from anon, authenticated;

create index if not exists dm_phrasebook_created_at_idx
  on public.dm_phrasebook (created_at desc);
