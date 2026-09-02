-- HIDDEN, as one flag.
--
-- 5e hides you from PARTICULAR creatures: your Stealth total is compared with
-- each observer's passive Perception, so you can be hidden from the drow and
-- plainly visible to the priestess standing beside it. A boolean cannot hold
-- that, and it was chosen deliberately over an observer array.
--
-- The flattening is therefore resolved the CONSERVATIVE way in lib/hiding.ts:
-- you are hidden only if your check beat the HIGHEST passive Perception among
-- the creatures who might notice you. Erring toward "not hidden" is the right
-- direction, because the failure mode is a rogue who has to hide again rather
-- than one who is invisible to something looking straight at her.
alter table public.vtt_tokens
  add column if not exists is_hidden boolean not null default false;

comment on column public.vtt_tokens.is_hidden is
  'Took the Hide action and beat every onlooker''s passive Perception. Cleared when the creature attacks, is found, or combat ends. Not per-observer: see lib/hiding.ts for how the contest is flattened.';
