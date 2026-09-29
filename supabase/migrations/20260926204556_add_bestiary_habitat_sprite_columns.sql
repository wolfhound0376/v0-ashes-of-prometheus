-- ============================================================================
-- RECORD ONLY — ALREADY APPLIED TO PRODUCTION. DO NOT PASTE.
--
-- Applied 2026-09-26 through the Supabase MCP (schema_migrations version
-- 20260926204556, name add_bestiary_habitat_sprite_columns). The statements
-- below are copied verbatim from supabase_migrations.schema_migrations on
-- 2026-09-29, so this file is what actually ran, not a reconstruction.
--
-- It lives here so the repo can rebuild the bestiary schema. Every statement is
-- idempotent (add column if not exists, backfills guarded on 'none', create
-- index if not exists), so running it twice is harmless — but there is no need.
--
-- The 2026-09-26 row inserts (underdark_bestiary_inserts.sql) are data, not
-- schema, and are not reproduced: the rows are in the live table, and later
-- sessions have edited them since.
--
-- What it does: adds sprite-pipeline and encounter columns to bestiary, and
-- stats_status, whose 'needs_stats' value marks a placeholder row with every
-- stat NULL. lib/bestiary-stats.ts keeps those rows off the board.
-- ============================================================================

alter table public.bestiary
  add column if not exists habitat              text[]   not null default '{}',
  add column if not exists encounter_rarity     text
      check (encounter_rarity in ('common','uncommon','rare','very_rare','unique')),
  add column if not exists sprite_priority      integer,
  add column if not exists sprite_size          integer  default 128,
  add column if not exists sprite_status        text     not null default 'none',
  add column if not exists stats_status         text     not null default 'sourced'
      check (stats_status in ('sourced','needs_stats','homebrew')),
  add column if not exists pixellab_character_id uuid;

comment on column public.bestiary.habitat is
  'Underdark placement tags (slug-style). Canon where the book places it; otherwise Sam''s call — see docs/claude_Underdark_Bestiary_Expansion.md';
comment on column public.bestiary.encounter_rarity is
  'How often the party should meet it on a random roll. Drives the sprite build order together with cr.';
comment on column public.bestiary.sprite_status is
  'PixelLab sprite pipeline state: none | queued | generating | generated | wired | needs_stats | reuse:<slug> (tint that slug''s sprite instead of generating).';
comment on column public.bestiary.stats_status is
  'sourced = transcribed from an ingested book; needs_stats = row exists but every number is NULL — never field it until filled from Roll20.';

update public.bestiary set sprite_status = 'wired'     where model_url is not null and sprite_status = 'none';
update public.bestiary set sprite_status = 'generated' where model_url is null and portrait_url is not null and sprite_status = 'none';
update public.bestiary set stats_status  = 'homebrew'  where source ilike 'homebrew%';

create index if not exists bestiary_sprite_queue_idx on public.bestiary (sprite_status, sprite_priority);
