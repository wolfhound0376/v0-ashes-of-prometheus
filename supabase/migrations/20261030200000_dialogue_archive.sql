-- ============================================================================
-- ARCHIVE, NEVER DELETE.
-- ============================================================================
--
-- Sam, 2026-10-30: "archive never delete as a rule."
--
-- Every line anyone has ever spoken — Malachar, the NPCs, the system beats,
-- the combat log — lives in `dialogue`, and `lib/restart-campaign.ts` step 1
-- deletes the whole table on every New Game. Checked live the same day: the
-- table held 9 rows, all from that afternoon. Every session before it was
-- gone, with no copy anywhere.
--
-- This migration gives those lines somewhere to go. It changes nothing about
-- how the live table behaves: `dialogue` is still the transcript of the
-- current run and is still emptied by a restart. The restart just copies
-- first, in one statement, inside the same transaction as the delete.
--
-- WHAT THE ARCHIVE IS FOR
--   - Recaps and Layer 4 clip scripts: the record of what actually happened.
--   - Recycling NPC barks and system flavour (Sam's rule: NPC barks, system
--     flavour and all audio — never Malachar's prose, which the dm_phrasebook
--     ban list exists to keep unrepeated). The tags that make lines findable
--     come in a follow-up PR; this one is only about not losing them.
--
-- COLUMNS
--   Every column of `dialogue` is carried over with its own name and type, so
--   an archived row reads exactly like the live row it came from. `id` is kept
--   as `source_id` rather than as the primary key: two restarts cannot collide
--   on it today, but a restore-then-rewipe could, and an archive that can
--   refuse a row is not an archive.
--
--   archived_at    when the line was swept out of the live table
--   archive_batch  one uuid per restart — "everything from that run"
--
-- RLS: on, with no policies. Service role only, like the other ledgers in this
-- schema (character_faith, item_events). Nothing in the browser reads it.

create table if not exists public.dialogue_archive (
  id               uuid primary key default gen_random_uuid(),
  source_id        uuid        not null,
  environment_id   uuid,
  speaker          text,
  speaker_type     text,
  text             text,
  portrait_url     text,
  sort_order       integer,
  speech_segments  jsonb,
  channel          text,
  run_id           uuid,
  recipient        text,
  created_at       timestamptz not null,
  archived_at      timestamptz not null default now(),
  archive_batch    uuid        not null
);

comment on table public.dialogue_archive is
  'Every line ever spoken. Filled by archive_dialogue() at campaign restart; never deleted. Sam, 2026-10-30: archive, never delete.';

-- Reading the archive is always "this run", "this speaker" or "in order".
create index if not exists dialogue_archive_batch_idx   on public.dialogue_archive (archive_batch, created_at);
create index if not exists dialogue_archive_speaker_idx on public.dialogue_archive (speaker, created_at desc);
create index if not exists dialogue_archive_channel_idx on public.dialogue_archive (channel, created_at desc);

alter table public.dialogue_archive enable row level security;

-- ----------------------------------------------------------------------------
-- archive_dialogue() — the sweep, as one atomic statement.
-- ----------------------------------------------------------------------------
--
-- Returns the number of lines archived. Does NOT delete: the caller still runs
-- its own delete, so this function is safe to call on its own (a mid-campaign
-- snapshot, say) and the restart's report keeps meaning what it meant.
--
-- A line is archived once per batch. Calling this twice without a wipe in
-- between would duplicate the live rows under two batch ids — the restart
-- never does that, but say it plainly rather than imply it.
create or replace function public.archive_dialogue(batch uuid default gen_random_uuid())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  moved integer;
begin
  insert into public.dialogue_archive (
    source_id, environment_id, speaker, speaker_type, text, portrait_url,
    sort_order, speech_segments, channel, run_id, recipient, created_at, archive_batch
  )
  select
    d.id, d.environment_id, d.speaker, d.speaker_type, d.text, d.portrait_url,
    d.sort_order, d.speech_segments, d.channel, d.run_id, d.recipient, d.created_at, batch
  from public.dialogue d;

  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke all on function public.archive_dialogue(uuid) from public, anon, authenticated;
grant execute on function public.archive_dialogue(uuid) to service_role;
