-- travel_march_today_log: the day's ledger for the march fatigue gauge.
--
-- Sam (2026-11-12), on the pace and navigator sheet: "We don't need this. You can let us know how long we
-- actually marched and why. There should be some gauge like in Solasta 2 indicating fatigue and whether we
-- perform a forced march. Therefore we need a rest button that sends us the Camp."
--
-- One JSON line per leg walked today (lib/travel/march.ts MarchLogEntry: where it ended, hours walking,
-- hours lost wandering and why, hours on the water, forced or not). Cleared when camp starts a new day.
-- Additive and nullable-safe: the code reads it best-effort, so the map walks before this is applied
-- (the gauge then shows the hours without the breakdown).

alter table public.travel_march
  add column if not exists today_log jsonb not null default '[]'::jsonb;
