-- ============================================================================
-- TAGS ON THE ARCHIVE — what a line was for, and whether it may be said again.
-- ============================================================================
--
-- Sam, 2026-10-30: "work on making it recyclable by making detailed tags...
-- recycling should only cover NPC barks, system flavors, and all audio not
-- Malachar."
--
-- Stacked on 20261030200000_dialogue_archive.sql. That migration keeps every
-- line; this one makes a line findable. The rules live in lib/dialogue-tags.ts
-- (pure, tested) rather than in SQL, because they are judgement calls that will
-- change — these columns are only where the verdict is written down.
--
--   kind      dm | npc | player | system | combat | direct
--   trigger   gate_warning | taunt | threat | greeting | refusal | arrival |
--             death | loot | rest | labor | flavour | unknown
--   reusable  may this exact line be said again
--   reason    why not, when it may not ('names Kenta', 'contains a number',
--             'Malachar is never recycled')
--   tags      free-form extras to filter on, incl. speaker:<name>
--   tagged_at null until a row has been through the tagger
--
-- `reusable` is false for everything Malachar ever said, for every player line
-- and direct message, for the combat log, and for any line carrying a hero's
-- name, a number or a roll — those were true once. What is left is the
-- standing stuff: a guard's "Step back", a prisoner's mutter, dripping water.

alter table public.dialogue_archive
  add column if not exists kind       text,
  add column if not exists trigger    text,
  add column if not exists reusable   boolean not null default false,
  add column if not exists reason     text,
  add column if not exists tags       text[] not null default '{}',
  add column if not exists tagged_at  timestamptz;

comment on column public.dialogue_archive.reusable is
  'May this exact line be spoken again. Never true for Malachar, players, direct messages or the combat log (Sam, 2026-10-30).';

-- The one query the recycler makes: give me a reusable line this speaker said
-- on this occasion.
create index if not exists dialogue_archive_canned_idx
  on public.dialogue_archive (speaker, trigger, kind)
  where reusable;

-- Finding what still needs tagging (the backfill script, and new batches).
create index if not exists dialogue_archive_untagged_idx
  on public.dialogue_archive (archived_at)
  where tagged_at is null;
