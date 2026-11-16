-- What Camp at the Fire's SLEEP bought last night (Sam, 2026-11-16: "fix gap"): 'full', 'partial' or 'none'.
-- The chat route's long rest at camp obeys it instead of always giving a full rest. Cleared when that rest uses it.
alter table public.party_supplies
  add column if not exists last_camp_rest text check (last_camp_rest in ('full', 'partial', 'none')),
  add column if not exists last_camp_rest_at timestamptz;
