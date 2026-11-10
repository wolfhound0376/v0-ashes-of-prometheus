-- Each hero's starting sheet, so a New Game can put them back on it.
--
-- Sam, 2026-11-10: "New game restarts EVERYTHING." A restart used to keep level and XP on purpose, and a
-- level-up cannot be undone by rule without guessing (which prepared spell came at level 2?), so the starting
-- sheet is kept instead of recomputed. lib/hero-baseline.ts says which columns are copied back;
-- lib/restart-campaign.ts step 3z does it. A hero with no row here who is still level 1 gets one at the next
-- restart.
--
-- NOT APPLIED BY DEPLOY. This repo's SQL does not run on its own; it is applied by hand on Sam's word.
-- The seven live heroes were reset to level 1 by hand on 2026-11-10 (backup:
-- characters_backup_levelreset_20261110), so the insert below snapshots clean level-1 sheets. It takes
-- level-1 heroes only: one who has levelled again before this runs is left for the restart to report.

create table if not exists public.character_baselines (
  character_id uuid primary key references public.characters(id) on delete cascade,
  sheet    jsonb not null,
  taken_at timestamptz not null default now(),
  taken_by text
);
comment on table public.character_baselines is
  'Each hero''s starting sheet (the whole characters row). A New Game copies level, XP, features, spells and purse back from here.';

-- Server only: read and written by the restart through the service role. No policies on purpose.
alter table public.character_baselines enable row level security;

insert into public.character_baselines (character_id, sheet, taken_by)
select c.id, to_jsonb(c) || jsonb_build_object('xp', 0), 'migration-2026-11-10'
from public.characters c
where c.is_player and c.archived_at is null and c.level = 1
on conflict (character_id) do nothing;
