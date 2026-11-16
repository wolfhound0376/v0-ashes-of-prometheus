-- Hunger brawls at camp (Sam, 2026-11-15: "Fights might break out if you guys are starving"): how many hungry nights in
-- a row the party has had. /api/camp/hunger counts it; New Game resets it (lib/restart-campaign.ts). Additive.
alter table public.party_supplies add column if not exists hungry_nights integer not null default 0;
