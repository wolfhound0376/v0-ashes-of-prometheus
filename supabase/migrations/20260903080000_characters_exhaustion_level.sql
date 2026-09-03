-- SRD 5.1 Appendix A: exhaustion is measured in six levels, and every effect
-- depends on which level you are at. The codebase only had the WORD
-- "Exhaustion" in lib/conditions - a binary that cannot express the rule and
-- gave starvation no teeth.
--
-- This is what unblocked food. Starvation's ONLY consequence in the SRD is
-- exhaustion, which is why characters.unfed_rest_streak sat in the schema
-- unread since the rest_supplies_starving migration on 2026-08-20.
--
-- Additive: new column, default 0, nothing dropped and nothing rewritten.
alter table public.characters
  add column if not exists exhaustion smallint not null default 0;

-- 0 is "not exhausted"; 6 is dead. Anything outside that is a bug, and a
-- constraint is how it announces itself instead of silently halving somebody's
-- hit points forever.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'characters_exhaustion_range'
  ) then
    alter table public.characters
      add constraint characters_exhaustion_range check (exhaustion between 0 and 6);
  end if;
end $$;

comment on column public.characters.exhaustion is
  'SRD 5.1 exhaustion level, 0-6. 1 disadvantage on ability checks; 2 speed halved; 3 disadvantage on attacks and saves; 4 hit point maximum halved; 5 speed 0; 6 death. Reduced by 1 on a long rest, but only if the character has eaten (see characters.unfed_rest_streak and party_supplies).';
