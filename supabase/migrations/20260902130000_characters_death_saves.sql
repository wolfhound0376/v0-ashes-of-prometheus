-- Death saving throws, SRD 5.1 "Dropping to 0 Hit Points".
--
-- A player character at 0 hit points is not dead; they are dying, and they
-- roll a d20 at the start of each of their turns until three successes make
-- them stable or three failures make them dead. That tally has to live
-- somewhere the whole table can see, and it has to survive a page reload
-- mid-fight. It is the character's own, not the fight's, so it sits on the
-- sheet beside the hit points it belongs to.
--
-- The words — Unconscious, Stable, Dead — go in `conditions`, which the card
-- and the rail already display. This column is only the count.
alter table public.characters
  add column if not exists death_saves jsonb not null
  default '{"successes": 0, "failures": 0}'::jsonb;

comment on column public.characters.death_saves is
  'SRD 5.1 death saving throws while at 0 HP: {successes, failures}, each 0..3. Reset whenever hit points rise above 0. Maintained by /api/combat.';
