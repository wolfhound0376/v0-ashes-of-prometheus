-- The travelling day (lib/travel/march.ts). Adds pace, hours and navigator to
-- the march accumulator, and registers the clock event the route logs.
--
-- OotA-Enc ch.2 p.24 (Travel Pace), p.25 (Becoming Lost); PHB ch.8 (8 hours of
-- travel a day). Additive only: every column has a default, so the existing
-- encounter accumulator and any live row are untouched. Safe to re-run.
--
-- The route survives without this (it warns and walks on without a day), so
-- deploy order does not matter; the day simply starts counting once applied.

alter table public.travel_march
  add column if not exists pace text not null default 'normal',
  add column if not exists hours_today numeric not null default 0,
  add column if not exists navigation_due boolean not null default true,
  add column if not exists lost_hours_total numeric not null default 0,
  add column if not exists days_marched integer not null default 0,
  add column if not exists navigator jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'travel_march_pace_check') then
    alter table public.travel_march
      add constraint travel_march_pace_check check (pace in ('fast', 'normal', 'slow'));
  end if;
end $$;

comment on column public.travel_march.pace is 'fast | normal | slow — OotA-Enc ch.2 p.24';
comment on column public.travel_march.hours_today is 'Hours walked and wandered since the party last set out; nightfall at 8 (PHB ch.8)';
comment on column public.travel_march.navigation_due is 'A DC 10 Survival check is owed before the next leg — p.25: each day, and after every rest';
comment on column public.travel_march.navigator is '{name, survivalBonus, familiar, hasMap} — who leads, as named at departure';

-- The clock event. Minutes are always explicit on insert (the leg decides), so
-- the rule row carries 0 and exists only so the event type is documented
-- alongside the others.
insert into public.time_advancement_rules (event_type, minutes, source)
values ('travel_march', 0, 'variable — minutes_advanced set per leg: miles at the chosen pace (OotA-Enc ch.2 p.24) plus hours lost (p.25)')
on conflict (event_type) do nothing;
