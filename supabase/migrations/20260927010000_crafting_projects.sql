-- Crafting projects — the camp module's crafting ledger (docs/claude_Camp_Module.md §14).
--
-- Sam approved running this on 2026-09-26 ("Run it"). Crafting follows the SRD
-- (tool proficiency required, raw materials worth half the market value), with
-- Sam's house rule that crafting advances by a roll for success per camp action,
-- not by the day. What a single success is worth is still his to rule, so both
-- measures are kept: `progress_gp` (the SRD's 5 gp increments) and
-- `successes` / `attempts` (the per-action rolls).
--
-- The raw materials' gold is paid from the crafter's `characters.sheet_currency`
-- when work starts and recorded here in `materials_gp_paid`, so the purse and
-- the project always agree.
--
-- Row security is ON with NO policies: only the service role (server routes)
-- can read or write it, the same posture as time_log and rest_events.
-- Additive and safe to re-run.

create table if not exists public.crafting_projects (
  id                 uuid primary key default gen_random_uuid(),
  character_id       uuid not null references public.characters(id) on delete cascade,
  item_id            uuid not null references public.items(id),
  progress_gp        integer not null default 0 check (progress_gp >= 0),
  successes          integer not null default 0 check (successes >= 0),
  attempts           integer not null default 0 check (attempts >= 0 and attempts >= successes),
  materials_gp_paid  integer not null default 0 check (materials_gp_paid >= 0),
  started_at         timestamptz not null default now(),
  finished_at        timestamptz,
  updated_at         timestamptz not null default now()
);

-- One open project per character per item: finishing one frees the slot.
create unique index if not exists crafting_projects_one_open
  on public.crafting_projects (character_id, item_id) where finished_at is null;

create index if not exists crafting_projects_character
  on public.crafting_projects (character_id);

alter table public.crafting_projects enable row level security;
