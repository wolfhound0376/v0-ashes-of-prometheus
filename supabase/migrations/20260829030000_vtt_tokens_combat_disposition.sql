-- Fight or flee, per INDIVIDUAL token.
--
-- Sam's ruling: the twins, Stool, Jimjar, Shuushar and Buppido never fight.
-- They run for the edge of the map and are never rolled into initiative,
-- though they stay targetable and hittable where they stand.
--
-- This lives on the TOKEN, not the bestiary stat block, because disposition
-- is a property of the person and not the species -- one myconid sprout may
-- cower while another swings, and Buppido in particular is a murderer wearing
-- a prisoner's face: the night he turns, the DM flips this one row.
--
-- Nullable with a default, so every existing row keeps working untouched.
alter table vtt_tokens
  add column if not exists combat_disposition text not null default 'fights';

alter table vtt_tokens
  drop constraint if exists vtt_tokens_combat_disposition_check;

alter table vtt_tokens
  add constraint vtt_tokens_combat_disposition_check
  check (combat_disposition in ('fights', 'flees'));

comment on column vtt_tokens.combat_disposition is
  'fights = rolls initiative and acts; flees = skipped by initiative, runs for the map edge at end of round, still targetable.';

-- The Act 1 non-combatants, per canon and Sam's ruling.
update vtt_tokens
set combat_disposition = 'flees'
where label in ('Topsy','Turvy','Stool','Jimjar','Shuushar','Shuushar the Awakened','Buppido');
