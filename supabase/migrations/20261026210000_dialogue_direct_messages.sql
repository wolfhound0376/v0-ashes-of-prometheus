-- Player-to-player messages (Sam, 2026-10-26: "the dashboard UI should have a way (button) to communicate
-- with another player. This button should also be present on the pixel dashboard.")
--
-- A direct message is a `dialogue` row on its own channel, 'direct', addressed to one hero by name in the new
-- `recipient` column. It never reaches Malachar or the world: every reader of `dialogue` in the app filters to
-- channel 'dm' (or 'party' for the party pane), so a 'direct' row is invisible to them by construction.
--
-- NOT APPLIED. Run only on Sam's word ("run the message migration"). Safe to re-run.
-- Pre-check (2026-10-26): every live row is channel 'dm' (12 rows), so the widened CHECK accepts all of them.

alter table public.dialogue add column if not exists recipient text;

alter table public.dialogue drop constraint if exists dialogue_channel_check;
alter table public.dialogue
  add constraint dialogue_channel_check check (channel = any (array['dm'::text, 'party'::text, 'direct'::text]));

alter table public.dialogue drop constraint if exists dialogue_direct_has_recipient;
alter table public.dialogue
  add constraint dialogue_direct_has_recipient check (channel <> 'direct' or (recipient is not null and length(btrim(recipient)) > 0));

-- The thread lookup: messages to me, newest first.
create index if not exists dialogue_direct_recipient_idx
  on public.dialogue (recipient, created_at desc) where channel = 'direct';
