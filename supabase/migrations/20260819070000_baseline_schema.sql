-- ============================================================================
-- Baseline schema of the public schema of Supabase project ppadxmvvvxmnnejeaoer
-- As of applied migration: 20260819065757_enable_rls_on_backup_tables
-- Extracted: 2026-08-19T07:32:22Z (UTC)
-- Idempotent: safe to run against a live database (no-op) and against an
-- empty database (full rebuild). Generated from pg_catalog by Claude;
-- verified against live object counts.
-- ============================================================================


-- ===== EXTENSIONS =====

create extension if not exists "http" with schema extensions;
create extension if not exists "pg_stat_statements" with schema extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "supabase_vault" with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "vector" with schema extensions;


-- ===== ENUM TYPES =====

-- no enum types in schema public


-- ===== SEQUENCES =====

create sequence if not exists public.campaign_chunks_id_seq increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
create sequence if not exists public.characters_history_hist_id_seq increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
create sequence if not exists public.story_dialogue_sequence_number_seq as integer increment by 1 minvalue 1 maxvalue 2147483647 start with 1 cache 1;


-- ===== TABLES =====

create table if not exists public.abilities (
  id uuid default uuid_generate_v4() not null,
  character_id uuid,
  name text not null,
  icon_url text,
  icon_type text default 'preset'::text,
  preset_icon text,
  unlocked boolean default true,
  unlock_level integer,
  description text,
  spell_level integer default 0,
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.actions (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  description text,
  icon_url text,
  icon_type text default 'preset'::text,
  preset_icon text,
  action_type text default 'action'::text,
  color_scheme text default 'green'::text,
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.avatar_url_backup_20260817 (
  id uuid,
  name text,
  avatar_image_url text,
  backed_up_at timestamp with time zone
);

create table if not exists public.bestiary (
  id uuid default gen_random_uuid() not null,
  name text not null,
  slug text,
  size text,
  creature_type text,
  alignment text,
  role text,
  ac integer,
  ac_note text,
  hp integer,
  hp_formula text,
  speed text,
  str integer,
  dex integer,
  con integer,
  "int" integer,
  wis integer,
  cha integer,
  saving_throws text,
  skills text,
  senses text,
  languages text,
  damage_resistances text,
  damage_immunities text,
  condition_immunities text,
  cr text,
  xp integer,
  proficiency_bonus integer,
  traits jsonb default '[]'::jsonb,
  actions jsonb default '[]'::jsonb,
  legendary_actions jsonb default '[]'::jsonb,
  reactions jsonb default '[]'::jsonb,
  source text,
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.campaign_books (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  title text not null,
  author text,
  source_file text,
  page_count integer,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.campaign_chunks (
  id bigint default nextval('campaign_chunks_id_seq'::regclass) not null,
  book_id uuid not null,
  campaign_slug text not null,
  chapter text,
  section text,
  page integer,
  chunk_index integer not null,
  content text not null,
  word_count integer,
  embedding vector(384),
  created_at timestamp with time zone default now() not null,
  content_tsv tsvector generated always as (((setweight(to_tsvector('english'::regconfig, COALESCE(section, ''::text)), 'A'::"char") || setweight(to_tsvector('english'::regconfig, COALESCE(chapter, ''::text)), 'B'::"char")) || setweight(to_tsvector('english'::regconfig, COALESCE(content, ''::text)), 'C'::"char"))) stored
);

create table if not exists public.campaign_runs (
  id uuid default gen_random_uuid() not null,
  campaign_id text not null,
  run_number integer not null,
  status text default 'setup'::text not null,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.character_secrets (
  character_id uuid not null,
  claim_token uuid default gen_random_uuid() not null,
  claim_code text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.characters (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  level integer default 1 not null,
  class text default 'Wizard'::text not null,
  xp integer default 0,
  xp_to_next integer default 300,
  avatar_image_url text,
  portrait_image_url text,
  hp_current integer default 10,
  hp_max integer default 10,
  ac integer default 10,
  initiative integer default 0,
  proficiency_bonus integer default 2,
  passive_perception integer default 10,
  str_score integer default 10,
  str_modifier integer default 0,
  dex_score integer default 10,
  dex_modifier integer default 0,
  con_score integer default 10,
  con_modifier integer default 0,
  int_score integer default 10,
  int_modifier integer default 0,
  wis_score integer default 10,
  wis_modifier integer default 0,
  cha_score integer default 10,
  cha_modifier integer default 0,
  weight_current numeric default 0,
  weight_max numeric default 150,
  is_player boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  conditions jsonb default '[]'::jsonb,
  character_type text default 'npc'::text not null,
  speed text,
  senses text,
  skills text,
  size text,
  cr text,
  languages text,
  damage_resistances text,
  damage_immunities text,
  condition_immunities text,
  sheet_species text,
  sheet_background text,
  sheet_alignment text,
  sheet_player_name text,
  sheet_hp_temp integer default 0,
  sheet_hit_dice text,
  sheet_heroic_inspiration boolean default false,
  sheet_passive_insight integer,
  sheet_passive_investigation integer,
  sheet_save_proficiencies jsonb default '[]'::jsonb,
  sheet_skill_proficiencies jsonb default '{}'::jsonb,
  sheet_defenses text,
  sheet_proficiencies jsonb default '{}'::jsonb,
  sheet_features jsonb default '[]'::jsonb,
  sheet_attacks jsonb default '[]'::jsonb,
  sheet_currency jsonb default '{"cp": 0, "ep": 0, "gp": 0, "pp": 0, "sp": 0}'::jsonb,
  sheet_appearance jsonb default '{}'::jsonb,
  sheet_personality jsonb default '{}'::jsonb,
  sheet_backstory text,
  sheet_allies_organizations text,
  sheet_additional_notes text,
  sheet_spellcasting jsonb default '{}'::jsonb,
  in_party boolean default false not null,
  idle_url text,
  talking_url text,
  archived_at timestamp with time zone,
  voice_id text,
  voice_description text,
  seat_id uuid,
  run_id uuid,
  locked_at timestamp with time zone,
  stage_scale numeric default 1 not null,
  stage_offset_y numeric default 0 not null
);

create table if not exists public.characters_history (
  hist_id bigint default nextval('characters_history_hist_id_seq'::regclass) not null,
  character_id uuid,
  op text not null,
  changed_at timestamp with time zone default now() not null,
  old_row jsonb not null
);

create table if not exists public.characters_loop_url_backup_20260818 (
  id uuid,
  name text,
  idle_url text,
  talking_url text,
  backed_up_at timestamp with time zone
);

create table if not exists public.cinematic_clips (
  id uuid default gen_random_uuid() not null,
  location text not null,
  state text,
  scope text default 'party'::text not null,
  kind text default 'environment'::text not null,
  video_url text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  weight integer default 1 not null,
  scene_key text
);

create table if not exists public.cinematic_clips_backup_scenekey_20260818 (
  id uuid,
  location text,
  state text,
  scope text,
  kind text,
  video_url text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  weight integer
);

create table if not exists public.cinematic_clips_backup_scopefix_20260819 (
  id uuid,
  location text,
  state text,
  scope text,
  kind text,
  video_url text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  weight integer,
  scene_key text
);

create table if not exists public.cinematic_requests (
  id uuid default gen_random_uuid() not null,
  req_location text,
  req_state text,
  req_scope text default 'party'::text not null,
  req_kind text default 'environment'::text not null,
  trigger_type text,
  session_id uuid,
  character_id uuid,
  resolution text not null,
  resolved_clip_id uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.cinematic_views (
  id uuid default gen_random_uuid() not null,
  character_id uuid not null,
  clip_id uuid not null,
  location text,
  trigger_type text,
  session_id uuid,
  viewed_at timestamp with time zone default now() not null
);

create table if not exists public.class_spellcasting_progression (
  class text not null,
  level integer not null,
  cantrips integer default 0 not null,
  prepared integer not null,
  slots jsonb not null,
  swap_cadence text not null,
  pool text not null,
  srd_page integer,
  source text default 'SRD 5.2.1 (2025)'::text not null
);

create table if not exists public.confiscation_backup (
  id uuid default gen_random_uuid() not null,
  taken_at timestamp with time zone default now() not null,
  label text,
  payload jsonb not null
);

create table if not exists public.dashboard_assets (
  id uuid default uuid_generate_v4() not null,
  asset_type text not null,
  panel_type text,
  name text not null,
  file_url text,
  thumbnail_url text,
  animation_css text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  item_key text
);

create table if not exists public.dashboard_assets_backup_itemkey_20260818 (
  id uuid,
  asset_type text,
  panel_type text,
  name text,
  file_url text,
  thumbnail_url text,
  animation_css text,
  metadata jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

create table if not exists public.dialogue (
  id uuid default uuid_generate_v4() not null,
  environment_id uuid,
  speaker text not null,
  speaker_type text default 'npc'::text,
  text text not null,
  portrait_url text,
  sort_order integer default 0,
  created_at timestamp with time zone default now(),
  speech_segments jsonb,
  channel text default 'dm'::text not null,
  run_id uuid
);

create table if not exists public.dm_phrasebook (
  id bigint generated always as identity not null,
  opening text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.environments (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  time_of_day text default 'Afternoon'::text not null,
  background_image_url text,
  fog_overlay_url text,
  ambient_animation text,
  description text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  scene_key text
);

create table if not exists public.environments_backup_20260817 (
  id uuid,
  name text,
  time_of_day text,
  background_image_url text,
  fog_overlay_url text,
  ambient_animation text,
  description text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

create table if not exists public.environments_backup_scenekey_20260818 (
  id uuid,
  name text,
  time_of_day text,
  background_image_url text,
  fog_overlay_url text,
  ambient_animation text,
  description text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

create table if not exists public.environments_quarantine_scenekey (
  id uuid,
  name text,
  time_of_day text,
  background_image_url text,
  fog_overlay_url text,
  ambient_animation text,
  description text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  scene_key text
);

create table if not exists public.equipment_items (
  id uuid default uuid_generate_v4() not null,
  character_id uuid,
  slot text not null,
  name text not null,
  icon_url text,
  equipped boolean default true,
  description text,
  stats_bonus jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  item_key text
);

create table if not exists public.equipment_items_backup_itemkey_20260818 (
  id uuid,
  character_id uuid,
  slot text,
  name text,
  icon_url text,
  equipped boolean,
  description text,
  stats_bonus jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone
);

create table if not exists public.game_clock (
  session_id uuid not null,
  game_day integer default 1 not null,
  minutes_of_day integer default 0 not null,
  exchanges_since_advance integer default 0 not null,
  advance_threshold integer default 8 not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.inventory_items (
  id uuid default uuid_generate_v4() not null,
  character_id uuid,
  name text not null,
  quantity integer default 1,
  icon_url text,
  icon_type text default 'custom'::text,
  preset_icon text,
  description text,
  weight numeric default 0,
  value numeric default 0,
  item_type text default 'misc'::text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  equippable_slot text,
  item_id uuid,
  confiscated_from uuid,
  item_key text
);

create table if not exists public.inventory_items_backup_itemkey_20260818 (
  id uuid,
  character_id uuid,
  name text,
  quantity integer,
  icon_url text,
  icon_type text,
  preset_icon text,
  description text,
  weight numeric,
  value numeric,
  item_type text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  equippable_slot text,
  item_id uuid,
  confiscated_from uuid
);

create table if not exists public.items (
  id uuid default gen_random_uuid() not null,
  slug text not null,
  name text not null,
  aliases text[] default '{}'::text[] not null,
  item_type text default 'misc'::text not null,
  equippable_slot text,
  rarity text default 'common'::text not null,
  weight numeric,
  value integer,
  description text,
  icon_url text,
  asset_name text,
  source text default 'homebrew'::text not null,
  campaign_slug text,
  stackable boolean default true not null,
  properties jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  item_code text,
  attunement boolean default false not null,
  cursed boolean default false not null,
  sentient boolean default false not null,
  music_theme text,
  item_key text
);

create table if not exists public.items_backup_itemkey_20260818 (
  id uuid,
  slug text,
  name text,
  aliases text[],
  item_type text,
  equippable_slot text,
  rarity text,
  weight numeric,
  value integer,
  description text,
  icon_url text,
  asset_name text,
  source text,
  campaign_slug text,
  stackable boolean,
  properties jsonb,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  item_code text,
  attunement boolean,
  cursed boolean,
  sentient boolean,
  music_theme text
);

create table if not exists public.journal_entries (
  id uuid default gen_random_uuid() not null,
  character_id uuid not null,
  session_id uuid,
  author text default 'player'::text not null,
  title text,
  in_world_date text,
  body text not null,
  visibility text default 'private'::text not null,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.lich_animations (
  id uuid default gen_random_uuid() not null,
  state text not null,
  video_url text not null,
  prompt text,
  duration integer default 5,
  created_at timestamp with time zone default now()
);

create table if not exists public.lich_environments (
  id uuid default gen_random_uuid() not null,
  environment text not null,
  video_url text not null,
  prompt text,
  created_at timestamp with time zone default now()
);

create table if not exists public.lich_personality (
  id uuid default gen_random_uuid() not null,
  snark integer default 5 not null,
  crassness integer default 3 not null,
  cruelty integer default 4 not null,
  roast_target text default 'even'::text not null,
  swearing text default 'mild'::text not null,
  fourth_wall text default 'occasionally'::text not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.magical_resources (
  id uuid default uuid_generate_v4() not null,
  character_id uuid,
  resource_type text not null,
  current_value integer default 0,
  max_value integer default 0,
  icon_url text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.npc_asset_url_backup_20260818 (
  id uuid,
  name text,
  idle_url text,
  talking_url text,
  backed_up_at timestamp with time zone
);

create table if not exists public.npc_encounters (
  id uuid default gen_random_uuid() not null,
  character_id uuid,
  name text not null,
  description text,
  portrait_url text,
  is_active boolean default true,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  hp_current integer,
  hp_max integer,
  ac integer,
  attack_bonus integer,
  damage_dice text,
  conditions jsonb default '[]'::jsonb,
  xp_value integer,
  challenge_rating text,
  monster_type text,
  face_url text,
  voice_id text,
  voice_description text,
  idle_url text,
  talking_url text,
  aliases text[] default '{}'::text[] not null,
  disposition text,
  stage_scale numeric default 1 not null,
  stage_offset_y numeric default 0 not null
);

create table if not exists public.player_seats (
  id uuid default gen_random_uuid() not null,
  seat_number integer not null,
  is_substitute boolean default false not null,
  claim_code text not null,
  claim_token uuid default gen_random_uuid() not null,
  occupant_name text,
  benched_at timestamp with time zone,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.scene_effects (
  id uuid default gen_random_uuid() not null,
  name text not null,
  description text,
  asset_url text,
  blend_mode text default 'screen'::text not null,
  trigger_type text default 'manual'::text not null,
  trigger_value text,
  z_index integer default 0 not null,
  opacity real default 1.0 not null,
  active boolean default true not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.session_beats (
  id uuid default gen_random_uuid() not null,
  session_id uuid,
  beat_type text not null,
  priority integer default 5 not null,
  character_id uuid,
  subject text,
  summary text,
  dice_value integer,
  image_ref text,
  narration text,
  shot_recipe text,
  source_dialogue_id uuid,
  created_at timestamp with time zone default now() not null,
  shots jsonb,
  run_id uuid
);

create table if not exists public.session_telemetry (
  id uuid default gen_random_uuid() not null,
  character_id uuid,
  campaign_id text default 'default'::text not null,
  encounter_id text,
  hp integer,
  max_hp integer,
  "position" jsonb default '{"x": 0, "y": 0}'::jsonb,
  action_type text,
  intent_vector text,
  last_roll integer,
  roll_type text,
  environment text,
  environment_description text,
  action_available boolean default true,
  bonus_action_available boolean default true,
  reaction_available boolean default true,
  created_at timestamp with time zone default now(),
  session_timestamp timestamp with time zone default now()
);

create table if not exists public.sessions (
  id uuid default gen_random_uuid() not null,
  campaign_id text,
  title text,
  status text default 'active'::text not null,
  started_at timestamp with time zone default now() not null,
  ended_at timestamp with time zone,
  active_character_id uuid
);

create table if not exists public.story_dialogue (
  id uuid default gen_random_uuid() not null,
  character_id uuid,
  campaign_id text default 'ashes_of_prometheus'::text not null,
  encounter_id text,
  speaker text not null,
  speaker_type text default 'dm'::text not null,
  message text not null,
  emotion text,
  requires_response boolean default false,
  response_type text,
  created_at timestamp with time zone default now(),
  sequence_number integer default nextval('story_dialogue_sequence_number_seq'::regclass) not null
);

create table if not exists public.time_advancement_rules (
  event_type text not null,
  minutes integer not null,
  source text not null
);

create table if not exists public.time_log (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  event_type text not null,
  minutes_advanced integer,
  game_day_after integer,
  minutes_of_day_after integer,
  hidden_roll jsonb,
  note text,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.vtt_maps (
  id uuid default gen_random_uuid() not null,
  name text not null,
  environment_id uuid,
  grid_width integer default 30 not null,
  grid_height integer default 30 not null,
  cell_size numeric default 1 not null,
  terrain jsonb default '{}'::jsonb not null,
  ground_texture_url text,
  ambient_preset text default 'day'::text,
  is_active boolean default false not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table if not exists public.vtt_tokens (
  id uuid default gen_random_uuid() not null,
  map_id uuid not null,
  character_id uuid,
  bestiary_id uuid,
  label text not null,
  model_url text,
  model_scale numeric default 1 not null,
  model_y_offset numeric default 0 not null,
  grid_x integer default 0 not null,
  grid_y integer default 0 not null,
  elevation numeric default 0 not null,
  rotation_y numeric default 0 not null,
  token_size text default 'medium'::text not null,
  tint_color text,
  is_visible boolean default true not null,
  updated_by text,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  hp_current integer,
  hp_max integer
);


-- ===== PRIMARY KEY / UNIQUE / CHECK CONSTRAINTS =====

DO $do$ begin if not exists (select 1 from pg_constraint where conname='abilities_pkey' and conrelid='public.abilities'::regclass) then
  alter table public.abilities add constraint abilities_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='actions_pkey' and conrelid='public.actions'::regclass) then
  alter table public.actions add constraint actions_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='bestiary_pkey' and conrelid='public.bestiary'::regclass) then
  alter table public.bestiary add constraint bestiary_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='campaign_books_pkey' and conrelid='public.campaign_books'::regclass) then
  alter table public.campaign_books add constraint campaign_books_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='campaign_chunks_pkey' and conrelid='public.campaign_chunks'::regclass) then
  alter table public.campaign_chunks add constraint campaign_chunks_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='campaign_runs_pkey' and conrelid='public.campaign_runs'::regclass) then
  alter table public.campaign_runs add constraint campaign_runs_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='character_secrets_pkey' and conrelid='public.character_secrets'::regclass) then
  alter table public.character_secrets add constraint character_secrets_pkey PRIMARY KEY (character_id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='characters_pkey' and conrelid='public.characters'::regclass) then
  alter table public.characters add constraint characters_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='characters_history_pkey' and conrelid='public.characters_history'::regclass) then
  alter table public.characters_history add constraint characters_history_pkey PRIMARY KEY (hist_id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_clips_pkey' and conrelid='public.cinematic_clips'::regclass) then
  alter table public.cinematic_clips add constraint cinematic_clips_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_requests_pkey' and conrelid='public.cinematic_requests'::regclass) then
  alter table public.cinematic_requests add constraint cinematic_requests_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_views_pkey' and conrelid='public.cinematic_views'::regclass) then
  alter table public.cinematic_views add constraint cinematic_views_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='class_spellcasting_progression_pkey' and conrelid='public.class_spellcasting_progression'::regclass) then
  alter table public.class_spellcasting_progression add constraint class_spellcasting_progression_pkey PRIMARY KEY (class, level);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='confiscation_backup_pkey' and conrelid='public.confiscation_backup'::regclass) then
  alter table public.confiscation_backup add constraint confiscation_backup_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='dashboard_assets_pkey' and conrelid='public.dashboard_assets'::regclass) then
  alter table public.dashboard_assets add constraint dashboard_assets_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='dialogues_pkey' and conrelid='public.dialogue'::regclass) then
  alter table public.dialogue add constraint dialogues_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='dm_phrasebook_pkey' and conrelid='public.dm_phrasebook'::regclass) then
  alter table public.dm_phrasebook add constraint dm_phrasebook_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='environments_pkey' and conrelid='public.environments'::regclass) then
  alter table public.environments add constraint environments_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='equipment_items_pkey' and conrelid='public.equipment_items'::regclass) then
  alter table public.equipment_items add constraint equipment_items_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='game_clock_pkey' and conrelid='public.game_clock'::regclass) then
  alter table public.game_clock add constraint game_clock_pkey PRIMARY KEY (session_id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='inventory_items_pkey' and conrelid='public.inventory_items'::regclass) then
  alter table public.inventory_items add constraint inventory_items_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='items_pkey' and conrelid='public.items'::regclass) then
  alter table public.items add constraint items_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='journal_entries_pkey' and conrelid='public.journal_entries'::regclass) then
  alter table public.journal_entries add constraint journal_entries_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_animations_pkey' and conrelid='public.lich_animations'::regclass) then
  alter table public.lich_animations add constraint lich_animations_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_environments_pkey' and conrelid='public.lich_environments'::regclass) then
  alter table public.lich_environments add constraint lich_environments_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_personality_pkey' and conrelid='public.lich_personality'::regclass) then
  alter table public.lich_personality add constraint lich_personality_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='magical_resources_pkey' and conrelid='public.magical_resources'::regclass) then
  alter table public.magical_resources add constraint magical_resources_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='npc_encounters_pkey' and conrelid='public.npc_encounters'::regclass) then
  alter table public.npc_encounters add constraint npc_encounters_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='player_seats_pkey' and conrelid='public.player_seats'::regclass) then
  alter table public.player_seats add constraint player_seats_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='scene_effects_pkey' and conrelid='public.scene_effects'::regclass) then
  alter table public.scene_effects add constraint scene_effects_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='session_beats_pkey' and conrelid='public.session_beats'::regclass) then
  alter table public.session_beats add constraint session_beats_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='session_telemetry_pkey' and conrelid='public.session_telemetry'::regclass) then
  alter table public.session_telemetry add constraint session_telemetry_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='sessions_pkey' and conrelid='public.sessions'::regclass) then
  alter table public.sessions add constraint sessions_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='story_dialogue_pkey' and conrelid='public.story_dialogue'::regclass) then
  alter table public.story_dialogue add constraint story_dialogue_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='time_advancement_rules_pkey' and conrelid='public.time_advancement_rules'::regclass) then
  alter table public.time_advancement_rules add constraint time_advancement_rules_pkey PRIMARY KEY (event_type);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='time_log_pkey' and conrelid='public.time_log'::regclass) then
  alter table public.time_log add constraint time_log_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='vtt_maps_pkey' and conrelid='public.vtt_maps'::regclass) then
  alter table public.vtt_maps add constraint vtt_maps_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='vtt_tokens_pkey' and conrelid='public.vtt_tokens'::regclass) then
  alter table public.vtt_tokens add constraint vtt_tokens_pkey PRIMARY KEY (id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='bestiary_slug_key' and conrelid='public.bestiary'::regclass) then
  alter table public.bestiary add constraint bestiary_slug_key UNIQUE (slug);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='campaign_books_slug_key' and conrelid='public.campaign_books'::regclass) then
  alter table public.campaign_books add constraint campaign_books_slug_key UNIQUE (slug);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='campaign_chunks_book_id_chunk_index_key' and conrelid='public.campaign_chunks'::regclass) then
  alter table public.campaign_chunks add constraint campaign_chunks_book_id_chunk_index_key UNIQUE (book_id, chunk_index);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='campaign_runs_campaign_id_run_number_key' and conrelid='public.campaign_runs'::regclass) then
  alter table public.campaign_runs add constraint campaign_runs_campaign_id_run_number_key UNIQUE (campaign_id, run_number);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='items_item_code_key' and conrelid='public.items'::regclass) then
  alter table public.items add constraint items_item_code_key UNIQUE (item_code);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='items_slug_key' and conrelid='public.items'::regclass) then
  alter table public.items add constraint items_slug_key UNIQUE (slug);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_environments_environment_key' and conrelid='public.lich_environments'::regclass) then
  alter table public.lich_environments add constraint lich_environments_environment_key UNIQUE (environment);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='player_seats_claim_code_key' and conrelid='public.player_seats'::regclass) then
  alter table public.player_seats add constraint player_seats_claim_code_key UNIQUE (claim_code);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='player_seats_seat_number_key' and conrelid='public.player_seats'::regclass) then
  alter table public.player_seats add constraint player_seats_seat_number_key UNIQUE (seat_number);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='campaign_runs_status_check' and conrelid='public.campaign_runs'::regclass) then
  alter table public.campaign_runs add constraint campaign_runs_status_check CHECK ((status = ANY (ARRAY['setup'::text, 'active'::text, 'ended'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='characters_character_type_check' and conrelid='public.characters'::regclass) then
  alter table public.characters add constraint characters_character_type_check CHECK ((character_type = ANY (ARRAY['player'::text, 'npc'::text, 'monster'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_clips_kind_check' and conrelid='public.cinematic_clips'::regclass) then
  alter table public.cinematic_clips add constraint cinematic_clips_kind_check CHECK ((kind = ANY (ARRAY['environment'::text, 'action'::text, 'filler'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_clips_scope_check' and conrelid='public.cinematic_clips'::regclass) then
  alter table public.cinematic_clips add constraint cinematic_clips_scope_check CHECK ((scope = ANY (ARRAY['solo'::text, 'party'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_requests_kind_chk' and conrelid='public.cinematic_requests'::regclass) then
  alter table public.cinematic_requests add constraint cinematic_requests_kind_chk CHECK ((req_kind = ANY (ARRAY['environment'::text, 'action'::text, 'filler'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_requests_resolution_chk' and conrelid='public.cinematic_requests'::regclass) then
  alter table public.cinematic_requests add constraint cinematic_requests_resolution_chk CHECK ((resolution = ANY (ARRAY['exact'::text, 'location_fallback'::text, 'generic_fallback'::text, 'miss'::text, 'rejected'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_requests_scope_chk' and conrelid='public.cinematic_requests'::regclass) then
  alter table public.cinematic_requests add constraint cinematic_requests_scope_chk CHECK ((req_scope = ANY (ARRAY['solo'::text, 'party'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='class_spellcasting_progression_level_check' and conrelid='public.class_spellcasting_progression'::regclass) then
  alter table public.class_spellcasting_progression add constraint class_spellcasting_progression_level_check CHECK (((level >= 1) AND (level <= 20)));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='class_spellcasting_progression_pool_check' and conrelid='public.class_spellcasting_progression'::regclass) then
  alter table public.class_spellcasting_progression add constraint class_spellcasting_progression_pool_check CHECK ((pool = ANY (ARRAY['class_list'::text, 'spellbook'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='class_spellcasting_progression_swap_cadence_check' and conrelid='public.class_spellcasting_progression'::regclass) then
  alter table public.class_spellcasting_progression add constraint class_spellcasting_progression_swap_cadence_check CHECK ((swap_cadence = ANY (ARRAY['long_rest_any'::text, 'long_rest_one'::text, 'level_up_one'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='dialogue_channel_check' and conrelid='public.dialogue'::regclass) then
  alter table public.dialogue add constraint dialogue_channel_check CHECK ((channel = ANY (ARRAY['dm'::text, 'party'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='game_clock_minutes_of_day_check' and conrelid='public.game_clock'::regclass) then
  alter table public.game_clock add constraint game_clock_minutes_of_day_check CHECK (((minutes_of_day >= 0) AND (minutes_of_day <= 1439)));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='journal_entries_author_check' and conrelid='public.journal_entries'::regclass) then
  alter table public.journal_entries add constraint journal_entries_author_check CHECK ((author = ANY (ARRAY['player'::text, 'malachar'::text, 'import'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='journal_entries_body_check' and conrelid='public.journal_entries'::regclass) then
  alter table public.journal_entries add constraint journal_entries_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 20000)));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='journal_entries_visibility_check' and conrelid='public.journal_entries'::regclass) then
  alter table public.journal_entries add constraint journal_entries_visibility_check CHECK ((visibility = ANY (ARRAY['private'::text, 'dm'::text, 'party'::text, 'found'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_personality_crassness_check' and conrelid='public.lich_personality'::regclass) then
  alter table public.lich_personality add constraint lich_personality_crassness_check CHECK (((crassness >= 0) AND (crassness <= 10)));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_personality_cruelty_check' and conrelid='public.lich_personality'::regclass) then
  alter table public.lich_personality add constraint lich_personality_cruelty_check CHECK (((cruelty >= 0) AND (cruelty <= 10)));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_personality_fourth_wall_check' and conrelid='public.lich_personality'::regclass) then
  alter table public.lich_personality add constraint lich_personality_fourth_wall_check CHECK ((fourth_wall = ANY (ARRAY['off'::text, 'occasionally'::text, 'often'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_personality_roast_target_check' and conrelid='public.lich_personality'::regclass) then
  alter table public.lich_personality add constraint lich_personality_roast_target_check CHECK ((roast_target = ANY (ARRAY['sam'::text, 'kenta'::text, 'fifi'::text, 'scott'::text, 'even'::text, 'off'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_personality_snark_check' and conrelid='public.lich_personality'::regclass) then
  alter table public.lich_personality add constraint lich_personality_snark_check CHECK (((snark >= 0) AND (snark <= 10)));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='lich_personality_swearing_check' and conrelid='public.lich_personality'::regclass) then
  alter table public.lich_personality add constraint lich_personality_swearing_check CHECK ((swearing = ANY (ARRAY['off'::text, 'mild'::text, 'unrestricted'::text])));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='npc_encounters_disposition_check' and conrelid='public.npc_encounters'::regclass) then
  alter table public.npc_encounters add constraint npc_encounters_disposition_check CHECK (((disposition IS NULL) OR (disposition = ANY (ARRAY['hostile'::text, 'wary'::text, 'neutral'::text, 'warm'::text, 'devoted'::text]))));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='player_seats_seat_number_check' and conrelid='public.player_seats'::regclass) then
  alter table public.player_seats add constraint player_seats_seat_number_check CHECK (((seat_number >= 1) AND (seat_number <= 5)));
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='substitute_is_seat_5' and conrelid='public.player_seats'::regclass) then
  alter table public.player_seats add constraint substitute_is_seat_5 CHECK ((is_substitute = (seat_number = 5)));
end if; end $do$;


-- ===== FOREIGN KEYS =====

DO $do$ begin if not exists (select 1 from pg_constraint where conname='abilities_character_id_fkey' and conrelid='public.abilities'::regclass) then
  alter table public.abilities add constraint abilities_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='campaign_chunks_book_id_fkey' and conrelid='public.campaign_chunks'::regclass) then
  alter table public.campaign_chunks add constraint campaign_chunks_book_id_fkey FOREIGN KEY (book_id) REFERENCES campaign_books(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='character_secrets_character_id_fkey' and conrelid='public.character_secrets'::regclass) then
  alter table public.character_secrets add constraint character_secrets_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='characters_run_id_fkey' and conrelid='public.characters'::regclass) then
  alter table public.characters add constraint characters_run_id_fkey FOREIGN KEY (run_id) REFERENCES campaign_runs(id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='characters_seat_id_fkey' and conrelid='public.characters'::regclass) then
  alter table public.characters add constraint characters_seat_id_fkey FOREIGN KEY (seat_id) REFERENCES player_seats(id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_requests_character_id_fkey' and conrelid='public.cinematic_requests'::regclass) then
  alter table public.cinematic_requests add constraint cinematic_requests_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_requests_resolved_clip_id_fkey' and conrelid='public.cinematic_requests'::regclass) then
  alter table public.cinematic_requests add constraint cinematic_requests_resolved_clip_id_fkey FOREIGN KEY (resolved_clip_id) REFERENCES cinematic_clips(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_requests_session_id_fkey' and conrelid='public.cinematic_requests'::regclass) then
  alter table public.cinematic_requests add constraint cinematic_requests_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_views_character_id_fkey' and conrelid='public.cinematic_views'::regclass) then
  alter table public.cinematic_views add constraint cinematic_views_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='cinematic_views_clip_id_fkey' and conrelid='public.cinematic_views'::regclass) then
  alter table public.cinematic_views add constraint cinematic_views_clip_id_fkey FOREIGN KEY (clip_id) REFERENCES cinematic_clips(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='dialogue_run_id_fkey' and conrelid='public.dialogue'::regclass) then
  alter table public.dialogue add constraint dialogue_run_id_fkey FOREIGN KEY (run_id) REFERENCES campaign_runs(id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='dialogues_environment_id_fkey' and conrelid='public.dialogue'::regclass) then
  alter table public.dialogue add constraint dialogues_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='equipment_items_character_id_fkey' and conrelid='public.equipment_items'::regclass) then
  alter table public.equipment_items add constraint equipment_items_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='game_clock_session_id_fkey' and conrelid='public.game_clock'::regclass) then
  alter table public.game_clock add constraint game_clock_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='inventory_items_character_id_fkey' and conrelid='public.inventory_items'::regclass) then
  alter table public.inventory_items add constraint inventory_items_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='inventory_items_confiscated_from_fkey' and conrelid='public.inventory_items'::regclass) then
  alter table public.inventory_items add constraint inventory_items_confiscated_from_fkey FOREIGN KEY (confiscated_from) REFERENCES characters(id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='inventory_items_item_id_fkey' and conrelid='public.inventory_items'::regclass) then
  alter table public.inventory_items add constraint inventory_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='journal_entries_character_id_fkey' and conrelid='public.journal_entries'::regclass) then
  alter table public.journal_entries add constraint journal_entries_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='journal_entries_session_id_fkey' and conrelid='public.journal_entries'::regclass) then
  alter table public.journal_entries add constraint journal_entries_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='magical_resources_character_id_fkey' and conrelid='public.magical_resources'::regclass) then
  alter table public.magical_resources add constraint magical_resources_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='npc_encounters_character_id_fkey' and conrelid='public.npc_encounters'::regclass) then
  alter table public.npc_encounters add constraint npc_encounters_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='session_beats_character_id_fkey' and conrelid='public.session_beats'::regclass) then
  alter table public.session_beats add constraint session_beats_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='session_beats_run_id_fkey' and conrelid='public.session_beats'::regclass) then
  alter table public.session_beats add constraint session_beats_run_id_fkey FOREIGN KEY (run_id) REFERENCES campaign_runs(id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='session_beats_session_id_fkey' and conrelid='public.session_beats'::regclass) then
  alter table public.session_beats add constraint session_beats_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='session_telemetry_character_id_fkey' and conrelid='public.session_telemetry'::regclass) then
  alter table public.session_telemetry add constraint session_telemetry_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='sessions_active_character_id_fkey' and conrelid='public.sessions'::regclass) then
  alter table public.sessions add constraint sessions_active_character_id_fkey FOREIGN KEY (active_character_id) REFERENCES characters(id);
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='story_dialogue_character_id_fkey' and conrelid='public.story_dialogue'::regclass) then
  alter table public.story_dialogue add constraint story_dialogue_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='time_log_session_id_fkey' and conrelid='public.time_log'::regclass) then
  alter table public.time_log add constraint time_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='vtt_maps_environment_id_fkey' and conrelid='public.vtt_maps'::regclass) then
  alter table public.vtt_maps add constraint vtt_maps_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES environments(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='vtt_tokens_bestiary_id_fkey' and conrelid='public.vtt_tokens'::regclass) then
  alter table public.vtt_tokens add constraint vtt_tokens_bestiary_id_fkey FOREIGN KEY (bestiary_id) REFERENCES bestiary(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='vtt_tokens_character_id_fkey' and conrelid='public.vtt_tokens'::regclass) then
  alter table public.vtt_tokens add constraint vtt_tokens_character_id_fkey FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_constraint where conname='vtt_tokens_map_id_fkey' and conrelid='public.vtt_tokens'::regclass) then
  alter table public.vtt_tokens add constraint vtt_tokens_map_id_fkey FOREIGN KEY (map_id) REFERENCES vtt_maps(id) ON DELETE CASCADE;
end if; end $do$;


-- ===== INDEXES =====

CREATE INDEX IF NOT EXISTS idx_abilities_character ON public.abilities USING btree (character_id);
CREATE INDEX IF NOT EXISTS campaign_chunks_book_idx ON public.campaign_chunks USING btree (book_id);
CREATE INDEX IF NOT EXISTS campaign_chunks_campaign_idx ON public.campaign_chunks USING btree (campaign_slug);
CREATE INDEX IF NOT EXISTS campaign_chunks_embedding_idx ON public.campaign_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS campaign_chunks_tsv_idx ON public.campaign_chunks USING gin (content_tsv);
CREATE UNIQUE INDEX IF NOT EXISTS one_live_run_per_campaign ON public.campaign_runs USING btree (campaign_id) WHERE (status <> 'ended'::text);
CREATE UNIQUE INDEX IF NOT EXISTS character_secrets_claim_code_unique ON public.character_secrets USING btree (lower(claim_code)) WHERE (claim_code IS NOT NULL);
CREATE INDEX IF NOT EXISTS characters_archived_at_idx ON public.characters USING btree (archived_at);
CREATE INDEX IF NOT EXISTS cinematic_clips_cell_idx ON public.cinematic_clips USING btree (location, COALESCE(state, ''::text), scope, kind) WHERE (video_url IS NOT NULL);
CREATE INDEX IF NOT EXISTS cinematic_clips_lookup ON public.cinematic_clips USING btree (location, state, kind);
CREATE INDEX IF NOT EXISTS cinematic_clips_scene_key_idx ON public.cinematic_clips USING btree (scene_key);
CREATE INDEX IF NOT EXISTS cinematic_requests_created_idx ON public.cinematic_requests USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS cinematic_requests_gap_idx ON public.cinematic_requests USING btree (req_location, req_state, req_scope, req_kind) WHERE (resolution <> 'exact'::text);
CREATE INDEX IF NOT EXISTS cinematic_views_character_location ON public.cinematic_views USING btree (character_id, location);
CREATE UNIQUE INDEX IF NOT EXISTS cinematic_views_once_per_character ON public.cinematic_views USING btree (character_id, clip_id);
CREATE INDEX IF NOT EXISTS dashboard_assets_item_key_idx ON public.dashboard_assets USING btree (item_key);
CREATE INDEX IF NOT EXISTS idx_dashboard_assets_type ON public.dashboard_assets USING btree (asset_type, panel_type);
CREATE INDEX IF NOT EXISTS dialogue_channel_created_at_idx ON public.dialogue USING btree (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dialogues_environment ON public.dialogue USING btree (environment_id);
CREATE INDEX IF NOT EXISTS dm_phrasebook_created_at_idx ON public.dm_phrasebook USING btree (created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS environments_scene_key_uidx ON public.environments USING btree (scene_key);
CREATE INDEX IF NOT EXISTS equipment_items_item_key_idx ON public.equipment_items USING btree (item_key);
CREATE INDEX IF NOT EXISTS idx_equipment_character ON public.equipment_items USING btree (character_id);
CREATE INDEX IF NOT EXISTS idx_inventory_character ON public.inventory_items USING btree (character_id);
CREATE INDEX IF NOT EXISTS inventory_items_item_id_idx ON public.inventory_items USING btree (item_id);
CREATE INDEX IF NOT EXISTS inventory_items_item_key_idx ON public.inventory_items USING btree (item_key);
CREATE INDEX IF NOT EXISTS items_aliases_idx ON public.items USING gin (aliases);
CREATE INDEX IF NOT EXISTS items_item_code_idx ON public.items USING btree (item_code);
CREATE INDEX IF NOT EXISTS items_item_key_idx ON public.items USING btree (item_key);
CREATE INDEX IF NOT EXISTS items_name_lower_idx ON public.items USING btree (lower(name));
CREATE INDEX IF NOT EXISTS items_type_idx ON public.items USING btree (item_type);
CREATE INDEX IF NOT EXISTS journal_entries_character_idx ON public.journal_entries USING btree (character_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lich_animations_created ON public.lich_animations USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lich_animations_state ON public.lich_animations USING btree (state);
CREATE INDEX IF NOT EXISTS idx_lich_environments_env ON public.lich_environments USING btree (environment);
CREATE INDEX IF NOT EXISTS idx_magical_resources_character ON public.magical_resources USING btree (character_id);
CREATE INDEX IF NOT EXISTS idx_npc_encounters_active ON public.npc_encounters USING btree (character_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS npc_encounters_one_active_per_name_per_char ON public.npc_encounters USING btree (lower(name), COALESCE(character_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE is_active;
CREATE INDEX IF NOT EXISTS scene_effects_trigger_idx ON public.scene_effects USING btree (trigger_type, trigger_value);
CREATE INDEX IF NOT EXISTS idx_session_beats_priority ON public.session_beats USING btree (session_id, priority DESC);
CREATE INDEX IF NOT EXISTS idx_session_beats_session ON public.session_beats USING btree (session_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_campaign ON public.session_telemetry USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_character ON public.session_telemetry USING btree (character_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON public.session_telemetry USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dialogue_campaign ON public.story_dialogue USING btree (campaign_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_character ON public.story_dialogue USING btree (character_id);
CREATE INDEX IF NOT EXISTS idx_dialogue_created ON public.story_dialogue USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dialogue_sequence ON public.story_dialogue USING btree (sequence_number);
CREATE INDEX IF NOT EXISTS vtt_tokens_map_idx ON public.vtt_tokens USING btree (map_id);


-- ===== FUNCTIONS =====

CREATE OR REPLACE FUNCTION public.apply_time_log()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  clk public.game_clock%rowtype;
  rule_minutes integer;
  total integer;
begin
  if new.minutes_advanced is null then
    select minutes into rule_minutes from public.time_advancement_rules where event_type = new.event_type;
    if rule_minutes is null then
      raise exception 'No advancement rule for event_type "%" and no explicit minutes_advanced given', new.event_type;
    end if;
    new.minutes_advanced := rule_minutes;
  end if;

  select * into clk from public.game_clock where session_id = new.session_id for update;
  if not found then
    insert into public.game_clock (session_id) values (new.session_id);
    select * into clk from public.game_clock where session_id = new.session_id for update;
  end if;

  total := (clk.game_day - 1) * 1440 + clk.minutes_of_day + new.minutes_advanced;
  if total < 0 then
    raise exception 'Time adjustment would move the clock before Day 1 00:00';
  end if;
  new.game_day_after := 1 + total / 1440;
  new.minutes_of_day_after := total % 1440;

  update public.game_clock set
    game_day = new.game_day_after,
    minutes_of_day = new.minutes_of_day_after,
    exchanges_since_advance = case
      when new.event_type = 'dialogue_exchange' then clk.exchanges_since_advance + 1
      when new.event_type in ('story_advance','cinematic_cut','combat_encounter','short_rest','long_rest','labor_shift') then 0
      else clk.exchanges_since_advance
    end,
    updated_at = now()
  where session_id = new.session_id;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.characters_history_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.characters_history(character_id, op, old_row) VALUES (OLD.id, TG_OP, to_jsonb(OLD));
  RETURN NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.cinematic_clips_set_scene_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.scene_key := public.scene_key(new.location);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.create_character_secrets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.character_secrets (character_id)
  values (new.id)
  on conflict (character_id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_time_of_day(p_minutes_of_day integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_minutes_of_day >=  360 and p_minutes_of_day < 720  then 'Morning'    -- 06:00-12:00
    when p_minutes_of_day >=  720 and p_minutes_of_day < 1080 then 'Afternoon'  -- 12:00-18:00
    when p_minutes_of_day >= 1080 and p_minutes_of_day < 1320 then 'Evening'    -- 18:00-22:00
    else 'Night'                                                                -- 22:00-06:00
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.dm_relock_character(p_character_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO characters_history (character_id, op, old_row)
  SELECT c.id, 'dm_relock', to_jsonb(c) || jsonb_build_object('_at', now())
  FROM characters c WHERE c.id = p_character_id AND c.is_player;
  IF NOT FOUND THEN RAISE EXCEPTION 'No player character with id %', p_character_id; END IF;
  PERFORM set_config('aop.dm_override', 'on', true);
  UPDATE characters SET locked_at = now() WHERE id = p_character_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.dm_unlock_character(p_character_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to unlock a sheet';
  END IF;
  INSERT INTO characters_history (character_id, op, old_row)
  SELECT c.id, 'dm_unlock',
         to_jsonb(c) || jsonb_build_object('_reason', p_reason, '_at', now())
  FROM characters c WHERE c.id = p_character_id AND c.is_player;
  IF NOT FOUND THEN RAISE EXCEPTION 'No player character with id %', p_character_id; END IF;
  PERFORM set_config('aop.dm_override', 'on', true);
  UPDATE characters SET locked_at = NULL WHERE id = p_character_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.enforce_character_lock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only player characters participate in the lock.
  IF NOT OLD.is_player THEN RETURN NEW; END IF;

  -- locked_at transitions require the DM override (or service functions below).
  IF NEW.locked_at IS DISTINCT FROM OLD.locked_at
     AND COALESCE(current_setting('aop.dm_override', true), '') <> 'on' THEN
    RAISE EXCEPTION 'locked_at can only be changed via start_campaign(), dm_unlock_character() or dm_relock_character()';
  END IF;

  IF OLD.locked_at IS NOT NULL THEN
    IF NEW.name IS DISTINCT FROM OLD.name
      OR NEW.class IS DISTINCT FROM OLD.class
      OR NEW.level IS DISTINCT FROM OLD.level
      OR NEW.sheet_species IS DISTINCT FROM OLD.sheet_species
      OR NEW.sheet_background IS DISTINCT FROM OLD.sheet_background
      OR NEW.str_score IS DISTINCT FROM OLD.str_score
      OR NEW.dex_score IS DISTINCT FROM OLD.dex_score
      OR NEW.con_score IS DISTINCT FROM OLD.con_score
      OR NEW.int_score IS DISTINCT FROM OLD.int_score
      OR NEW.wis_score IS DISTINCT FROM OLD.wis_score
      OR NEW.cha_score IS DISTINCT FROM OLD.cha_score
      OR NEW.str_modifier IS DISTINCT FROM OLD.str_modifier
      OR NEW.dex_modifier IS DISTINCT FROM OLD.dex_modifier
      OR NEW.con_modifier IS DISTINCT FROM OLD.con_modifier
      OR NEW.int_modifier IS DISTINCT FROM OLD.int_modifier
      OR NEW.wis_modifier IS DISTINCT FROM OLD.wis_modifier
      OR NEW.cha_modifier IS DISTINCT FROM OLD.cha_modifier
      OR NEW.proficiency_bonus IS DISTINCT FROM OLD.proficiency_bonus
      OR NEW.hp_max IS DISTINCT FROM OLD.hp_max
      OR NEW.sheet_save_proficiencies IS DISTINCT FROM OLD.sheet_save_proficiencies
      OR NEW.sheet_skill_proficiencies IS DISTINCT FROM OLD.sheet_skill_proficiencies
      OR NEW.sheet_features IS DISTINCT FROM OLD.sheet_features
      OR NEW.sheet_proficiencies IS DISTINCT FROM OLD.sheet_proficiencies
      OR NEW.sheet_spellcasting IS DISTINCT FROM OLD.sheet_spellcasting
      OR NEW.seat_id IS DISTINCT FROM OLD.seat_id
      OR NEW.run_id IS DISTINCT FROM OLD.run_id
      OR NEW.is_player IS DISTINCT FROM OLD.is_player
      OR NEW.character_type IS DISTINCT FROM OLD.character_type
    THEN
      RAISE EXCEPTION 'Character sheet "%" is locked (since %). DM must call dm_unlock_character() first.', OLD.name, OLD.locked_at;
    END IF;
  END IF;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.environments_set_scene_key()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.scene_key := public.scene_key(new.name);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.item_key(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(
    regexp_replace(
      regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g'
    ),
  '');
$function$
;

CREATE OR REPLACE FUNCTION public.match_campaign_chunks(query_embedding vector, match_count integer DEFAULT 8, filter_campaign text DEFAULT NULL::text, min_similarity double precision DEFAULT 0.0, filter_location text DEFAULT NULL::text, location_boost double precision DEFAULT 0.06)
 RETURNS TABLE(id bigint, chapter text, section text, page integer, content text, similarity double precision, boosted boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  with scored as (
    select
      c.id, c.chapter, c.section, c.page, c.content,
      1 - (c.embedding <=> query_embedding) as raw_sim,
      (filter_location is not null
        and length(trim(filter_location)) > 2
        and (
          c.section ilike '%' || split_part(trim(filter_location), ' (', 1) || '%'
          or c.chapter ilike '%' || split_part(trim(filter_location), ' (', 1) || '%'
        )
      ) as is_local
    from public.campaign_chunks c
    where c.embedding is not null
      and (filter_campaign is null or c.campaign_slug = filter_campaign)
  )
  select
    s.id, s.chapter, s.section, s.page, s.content,
    least(1.0, s.raw_sim + case when s.is_local then location_boost else 0 end) as similarity,
    s.is_local as boosted
  from scored s
  where s.raw_sim >= min_similarity
  order by (s.raw_sim + case when s.is_local then location_boost else 0 end) desc
  limit match_count;
$function$
;

CREATE OR REPLACE FUNCTION public.npc_encounter_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare b record; art text;
begin
  if new.is_active then
    update public.npc_encounters
      set is_active = false, updated_at = now()
      where is_active
        and lower(name) = lower(new.name)
        and coalesce(character_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = coalesce(new.character_id, '00000000-0000-0000-0000-000000000000'::uuid);
  end if;

  select hp, ac, cr, xp into b
    from public.bestiary
    where lower(name) = lower(new.name)
    limit 1;
  if found then
    new.hp_max := b.hp;
    new.hp_current := b.hp;
    new.ac := coalesce(b.ac, new.ac);
    new.challenge_rating := coalesce(b.cr, new.challenge_rating);
    new.xp_value := coalesce(b.xp, new.xp_value);
  end if;

  if new.portrait_url is null or new.portrait_url like '%fal.media%' then
    select avatar_image_url into art
      from public.characters
      where avatar_image_url is not null
        and (lower(name) = lower(new.name)
             or lower(new.name) like lower(name) || ' %')
      order by (lower(name) = lower(new.name)) desc, length(name) desc
      limit 1;
    if art is not null then
      new.portrait_url := art;
    end if;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.resolve_cinematic(p_location text, p_state text DEFAULT NULL::text, p_scope text DEFAULT 'party'::text, p_kind text DEFAULT 'environment'::text)
 RETURNS TABLE(clip_id uuid, video_url text, resolution text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with req as (select public.scene_key(p_location) as k),
  tiers as (
    select c.id, c.video_url, c.weight,
           case
             when c.scene_key = req.k and p_state is not null
              and c.state is not distinct from p_state then 'exact'
             when c.scene_key = req.k and c.state is null then 'location_fallback'
             when c.location = 'generic'                  then 'generic_fallback'
           end as res,
           case
             when c.scene_key = req.k and p_state is not null
              and c.state is not distinct from p_state then 1
             when c.scene_key = req.k and c.state is null then 2
             when c.location = 'generic'                  then 3
           end as tier,
           case when c.scope = p_scope then 0 else 1 end as scope_rank
    from public.cinematic_clips c, req
    where c.kind = p_kind
      and c.video_url is not null and c.weight > 0
      and (c.scene_key = req.k or c.location = 'generic')
  ),
  best as (
    select tier as t, scope_rank as sr
    from tiers where tier is not null
    order by tier, scope_rank
    limit 1
  )
  select t.id, t.video_url, t.res from tiers t, best
  where t.tier = best.t and t.scope_rank = best.sr
  order by random() / greatest(t.weight, 1) limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_environment(p_name text, p_minutes_of_day integer DEFAULT NULL::integer)
 RETURNS TABLE(environment_id uuid, name text, time_of_day text, matched text)
 LANGUAGE sql
 STABLE
AS $function$
  with want as (
    select case when p_minutes_of_day is null then null
                else public.current_time_of_day(p_minutes_of_day) end as tod
  ),
  candidates as (
    select e.id, e.name, e.time_of_day,
           case when w.tod is not null and e.time_of_day = w.tod
                then 'time_match' else 'any_variant' end as matched,
           case when w.tod is not null and e.time_of_day = w.tod
                then 1 else 2 end as tier
    from public.environments e, want w
    where e.name = p_name
  )
  select c.id, c.name, c.time_of_day, c.matched
  from candidates c
  where c.tier = (select min(tier) from candidates)
  order by random()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.scene_key(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(p_name, '')), '^scene[_\s-]*[0-9]+[_\s-]*', ''),
        '[^a-z0-9]+', '-', 'g'
      ),
      '(^-+|-+$)', '', 'g'
    ),
  '');
$function$
;

CREATE OR REPLACE FUNCTION public.search_srd(q text, n integer DEFAULT 8, filter_chapter text DEFAULT NULL::text, book_slug text DEFAULT 'srd-5-1'::text)
 RETURNS TABLE(id bigint, book text, chapter text, section text, chunk_index integer, word_count integer, rank real, content text)
 LANGUAGE sql
 STABLE
AS $function$
  select c.id, b.slug as book, c.chapter, c.section, c.chunk_index, c.word_count,
         (ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', q))
          + case when c.section ilike '%' || q || '%' then 5 else 0 end)::real as rank,
         c.content
  from public.campaign_chunks c
  join public.campaign_books b on b.id = c.book_id
  where b.slug = book_slug
    and (filter_chapter is null or c.chapter ilike filter_chapter)
    and (c.content_tsv @@ websearch_to_tsquery('english', q)
         or c.section ilike '%' || q || '%')
  order by rank desc, c.chunk_index
  limit n;
$function$
;

CREATE OR REPLACE FUNCTION public.set_item_key_from_name()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.item_key := public.item_key(new.name);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.start_campaign(p_campaign_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_run uuid;
BEGIN
  SELECT id INTO v_run FROM campaign_runs
  WHERE campaign_id = p_campaign_id AND status = 'setup';
  IF v_run IS NULL THEN
    RAISE EXCEPTION 'No run in setup for campaign %. A running campaign cannot be started again — restart it first.', p_campaign_id;
  END IF;
  UPDATE campaign_runs SET status = 'active', started_at = now() WHERE id = v_run;
  PERFORM set_config('aop.dm_override', 'on', true);
  UPDATE characters SET locked_at = now()
  WHERE is_player AND run_id = v_run AND archived_at IS NULL;
END $function$
;

CREATE OR REPLACE FUNCTION public.vtt_touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end $function$
;


-- ===== VIEWS =====

-- view: cinematic_gaps
create or replace view public.cinematic_gaps as
 SELECT req_location AS location,
    req_state AS state,
    req_scope AS scope,
    req_kind AS kind,
    count(*) AS times_requested,
    count(*) FILTER (WHERE resolution = 'miss'::text) AS times_nothing_played,
    count(*) FILTER (WHERE resolution = 'generic_fallback'::text) AS times_fell_to_generic,
    max(created_at) AS last_requested
   FROM cinematic_requests
  WHERE resolution = ANY (ARRAY['location_fallback'::text, 'generic_fallback'::text, 'miss'::text])
  GROUP BY req_location, req_state, req_scope, req_kind
  ORDER BY (count(*) FILTER (WHERE resolution = 'miss'::text)) DESC, (count(*)) DESC;

-- view: cinematic_rejections
create or replace view public.cinematic_rejections as
 SELECT date_trunc('hour'::text, created_at) AS hour,
    trigger_type,
    req_location AS location,
    session_id,
    count(*) AS rejections
   FROM cinematic_requests
  WHERE resolution = 'rejected'::text
  GROUP BY (date_trunc('hour'::text, created_at)), trigger_type, req_location, session_id
  ORDER BY (date_trunc('hour'::text, created_at)) DESC, (count(*)) DESC;

-- view: item_asset_lookup (dependency of *_resolved views)
create or replace view public.item_asset_lookup as
 SELECT DISTINCT ON (item_key) item_key,
    file_url AS asset_icon_url,
    name AS asset_name
   FROM dashboard_assets
  WHERE (asset_type = ANY (ARRAY['item_icon'::text, 'icon'::text])) AND file_url IS NOT NULL AND item_key IS NOT NULL
  ORDER BY item_key, updated_at DESC NULLS LAST, created_at DESC;

-- view: item_catalog_lookup (dependency of *_resolved views)
create or replace view public.item_catalog_lookup as
 SELECT DISTINCT ON (k.key) k.key AS item_key,
    i.id AS catalog_id,
    i.name AS catalog_name,
    i.icon_url AS catalog_icon_url,
    i.item_type AS catalog_item_type,
    i.equippable_slot AS catalog_equippable_slot
   FROM items i
     CROSS JOIN LATERAL ( SELECT item_key(i.name) AS key
        UNION
         SELECT item_key(i.asset_name) AS item_key
          WHERE i.asset_name IS NOT NULL
        UNION
         SELECT item_key(a.a) AS item_key
           FROM unnest(COALESCE(i.aliases, '{}'::text[])) a(a)) k
  WHERE k.key IS NOT NULL
  ORDER BY k.key, (i.icon_url IS NOT NULL) DESC, i.updated_at DESC NULLS LAST;

-- view: equipment_items_resolved (depends on item_catalog_lookup, item_asset_lookup)
create or replace view public.equipment_items_resolved as
 SELECT ei.id,
    ei.character_id,
    ei.slot,
    ei.name,
    ei.icon_url,
    ei.equipped,
    ei.description,
    ei.stats_bonus,
    ei.created_at,
    ei.updated_at,
    ei.item_key,
    COALESCE(ei.icon_url, cat.catalog_icon_url, ast.asset_icon_url) AS resolved_icon_url,
        CASE
            WHEN ei.icon_url IS NOT NULL THEN 'row'::text
            WHEN cat.catalog_icon_url IS NOT NULL THEN 'catalog_key'::text
            WHEN ast.asset_icon_url IS NOT NULL THEN 'asset_library'::text
            ELSE 'none'::text
        END AS icon_source,
    cat.catalog_item_type AS resolved_item_type
   FROM equipment_items ei
     LEFT JOIN item_catalog_lookup cat ON cat.item_key = ei.item_key
     LEFT JOIN item_asset_lookup ast ON ast.item_key = ei.item_key;

-- view: inventory_items_resolved (depends on item_catalog_lookup, item_asset_lookup)
create or replace view public.inventory_items_resolved as
 SELECT ii.id,
    ii.character_id,
    ii.name,
    ii.quantity,
    ii.icon_url,
    ii.icon_type,
    ii.preset_icon,
    ii.description,
    ii.weight,
    ii.value,
    ii.item_type,
    ii.created_at,
    ii.updated_at,
    ii.equippable_slot,
    ii.item_id,
    ii.confiscated_from,
    ii.item_key,
    COALESCE(ii.icon_url, direct.icon_url, cat.catalog_icon_url, ast.asset_icon_url) AS resolved_icon_url,
        CASE
            WHEN ii.icon_url IS NOT NULL THEN 'row'::text
            WHEN direct.icon_url IS NOT NULL THEN 'catalog_link'::text
            WHEN cat.catalog_icon_url IS NOT NULL THEN 'catalog_key'::text
            WHEN ast.asset_icon_url IS NOT NULL THEN 'asset_library'::text
            ELSE 'none'::text
        END AS icon_source,
    COALESCE(ii.item_type, direct.item_type, cat.catalog_item_type) AS resolved_item_type
   FROM inventory_items ii
     LEFT JOIN items direct ON direct.id = ii.item_id
     LEFT JOIN item_catalog_lookup cat ON cat.item_key = ii.item_key
     LEFT JOIN item_asset_lookup ast ON ast.item_key = ii.item_key;

-- view: item_icon_gaps (depends on inventory_items_resolved)
create or replace view public.item_icon_gaps as
 SELECT item_key,
    min(name) AS example_name,
    count(*) AS rows_wanting_icon
   FROM inventory_items_resolved
  WHERE resolved_icon_url IS NULL
  GROUP BY item_key
  ORDER BY (count(*)) DESC, (min(name));


-- ===== TRIGGERS =====

drop trigger if exists character_lock_guard on public.characters;
CREATE TRIGGER character_lock_guard BEFORE UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION enforce_character_lock();

drop trigger if exists characters_create_secrets on public.characters;
CREATE TRIGGER characters_create_secrets AFTER INSERT ON public.characters FOR EACH ROW EXECUTE FUNCTION create_character_secrets();

drop trigger if exists characters_history_aud on public.characters;
CREATE TRIGGER characters_history_aud AFTER DELETE OR UPDATE ON public.characters FOR EACH ROW EXECUTE FUNCTION characters_history_trg();

drop trigger if exists trg_cinematic_clips_scene_key on public.cinematic_clips;
CREATE TRIGGER trg_cinematic_clips_scene_key BEFORE INSERT OR UPDATE OF location ON public.cinematic_clips FOR EACH ROW EXECUTE FUNCTION cinematic_clips_set_scene_key();

drop trigger if exists trg_dashboard_assets_item_key on public.dashboard_assets;
CREATE TRIGGER trg_dashboard_assets_item_key BEFORE INSERT OR UPDATE OF name ON public.dashboard_assets FOR EACH ROW EXECUTE FUNCTION set_item_key_from_name();

drop trigger if exists trg_environments_scene_key on public.environments;
CREATE TRIGGER trg_environments_scene_key BEFORE INSERT OR UPDATE OF name ON public.environments FOR EACH ROW EXECUTE FUNCTION environments_set_scene_key();

drop trigger if exists trg_environments_updated_at on public.environments;
CREATE TRIGGER trg_environments_updated_at BEFORE UPDATE ON public.environments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

drop trigger if exists trg_equipment_items_item_key on public.equipment_items;
CREATE TRIGGER trg_equipment_items_item_key BEFORE INSERT OR UPDATE OF name ON public.equipment_items FOR EACH ROW EXECUTE FUNCTION set_item_key_from_name();

drop trigger if exists trg_inventory_items_item_key on public.inventory_items;
CREATE TRIGGER trg_inventory_items_item_key BEFORE INSERT OR UPDATE OF name ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION set_item_key_from_name();

drop trigger if exists trg_items_item_key on public.items;
CREATE TRIGGER trg_items_item_key BEFORE INSERT OR UPDATE OF name ON public.items FOR EACH ROW EXECUTE FUNCTION set_item_key_from_name();

drop trigger if exists npc_encounter_guard_trg on public.npc_encounters;
CREATE TRIGGER npc_encounter_guard_trg BEFORE INSERT ON public.npc_encounters FOR EACH ROW EXECUTE FUNCTION npc_encounter_guard();

drop trigger if exists time_log_apply on public.time_log;
CREATE TRIGGER time_log_apply BEFORE INSERT ON public.time_log FOR EACH ROW EXECUTE FUNCTION apply_time_log();

drop trigger if exists vtt_maps_touch on public.vtt_maps;
CREATE TRIGGER vtt_maps_touch BEFORE UPDATE ON public.vtt_maps FOR EACH ROW EXECUTE FUNCTION vtt_touch_updated_at();

drop trigger if exists vtt_tokens_touch on public.vtt_tokens;
CREATE TRIGGER vtt_tokens_touch BEFORE UPDATE ON public.vtt_tokens FOR EACH ROW EXECUTE FUNCTION vtt_touch_updated_at();


-- ===== ROW LEVEL SECURITY ENABLES =====

alter table public.abilities enable row level security;
alter table public.actions enable row level security;
alter table public.avatar_url_backup_20260817 enable row level security;
alter table public.bestiary enable row level security;
alter table public.campaign_books enable row level security;
alter table public.campaign_chunks enable row level security;
alter table public.campaign_runs enable row level security;
alter table public.character_secrets enable row level security;
alter table public.characters enable row level security;
alter table public.characters_history enable row level security;
alter table public.characters_loop_url_backup_20260818 enable row level security;
alter table public.cinematic_clips enable row level security;
alter table public.cinematic_clips_backup_scenekey_20260818 enable row level security;
alter table public.cinematic_clips_backup_scopefix_20260819 enable row level security;
alter table public.cinematic_requests enable row level security;
alter table public.cinematic_views enable row level security;
alter table public.class_spellcasting_progression enable row level security;
alter table public.confiscation_backup enable row level security;
alter table public.dashboard_assets enable row level security;
alter table public.dashboard_assets_backup_itemkey_20260818 enable row level security;
alter table public.dialogue enable row level security;
alter table public.dm_phrasebook enable row level security;
alter table public.environments enable row level security;
alter table public.environments_backup_20260817 enable row level security;
alter table public.environments_backup_scenekey_20260818 enable row level security;
alter table public.environments_quarantine_scenekey enable row level security;
alter table public.equipment_items enable row level security;
alter table public.equipment_items_backup_itemkey_20260818 enable row level security;
alter table public.game_clock enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_items_backup_itemkey_20260818 enable row level security;
alter table public.items enable row level security;
alter table public.items_backup_itemkey_20260818 enable row level security;
alter table public.journal_entries enable row level security;
alter table public.lich_animations enable row level security;
alter table public.lich_environments enable row level security;
alter table public.lich_personality enable row level security;
alter table public.magical_resources enable row level security;
alter table public.npc_asset_url_backup_20260818 enable row level security;
alter table public.npc_encounters enable row level security;
alter table public.player_seats enable row level security;
alter table public.scene_effects enable row level security;
alter table public.session_beats enable row level security;
alter table public.session_telemetry enable row level security;
alter table public.sessions enable row level security;
alter table public.story_dialogue enable row level security;
alter table public.time_advancement_rules enable row level security;
alter table public.time_log enable row level security;
alter table public.vtt_maps enable row level security;
alter table public.vtt_tokens enable row level security;


-- ===== POLICIES =====

drop policy if exists "Allow all access to abilities" on public.abilities;
create policy "Allow all access to abilities" on public.abilities for all to public
  using (true)
  with check (true);

drop policy if exists "Allow all access to actions" on public.actions;
create policy "Allow all access to actions" on public.actions for all to public
  using (true)
  with check (true);

drop policy if exists bestiary_read_all on public.bestiary;
create policy bestiary_read_all on public.bestiary for select to public
  using (true);

drop policy if exists bestiary_write_authenticated on public.bestiary;
create policy bestiary_write_authenticated on public.bestiary for all to public
  using ((auth.role() = 'authenticated'::text))
  with check ((auth.role() = 'authenticated'::text));

drop policy if exists campaign_runs_read on public.campaign_runs;
create policy campaign_runs_read on public.campaign_runs for select to public
  using (true);

drop policy if exists "Allow all access to characters" on public.characters;
create policy "Allow all access to characters" on public.characters for all to public
  using (true)
  with check (true);

drop policy if exists "anon can read characters" on public.characters;
create policy "anon can read characters" on public.characters for select to anon
  using (true);

drop policy if exists cinematic_clips_public_read on public.cinematic_clips;
create policy cinematic_clips_public_read on public.cinematic_clips for select to anon, authenticated
  using (true);

drop policy if exists cinematic_views_public_read on public.cinematic_views;
create policy cinematic_views_public_read on public.cinematic_views for select to anon, authenticated
  using (true);

drop policy if exists "progression is publicly readable" on public.class_spellcasting_progression;
create policy "progression is publicly readable" on public.class_spellcasting_progression for select to public
  using (true);

drop policy if exists "Allow all access to dashboard_assets" on public.dashboard_assets;
create policy "Allow all access to dashboard_assets" on public.dashboard_assets for all to public
  using (true)
  with check (true);

drop policy if exists "Allow all access to dialogues" on public.dialogue;
create policy "Allow all access to dialogues" on public.dialogue for all to public
  using (true)
  with check (true);

drop policy if exists "Allow all access to environments" on public.environments;
create policy "Allow all access to environments" on public.environments for all to public
  using (true)
  with check (true);

drop policy if exists "Allow all access to equipment_items" on public.equipment_items;
create policy "Allow all access to equipment_items" on public.equipment_items for all to public
  using (true)
  with check (true);

drop policy if exists "Allow all access to inventory_items" on public.inventory_items;
create policy "Allow all access to inventory_items" on public.inventory_items for all to public
  using (true)
  with check (true);

drop policy if exists "items are publicly readable" on public.items;
create policy "items are publicly readable" on public.items for select to anon, authenticated
  using (true);

drop policy if exists journal_player_insert on public.journal_entries;
create policy journal_player_insert on public.journal_entries for insert to anon, authenticated
  with check ((author = 'player'::text));

drop policy if exists journal_read on public.journal_entries;
create policy journal_read on public.journal_entries for select to anon, authenticated
  using (true);

drop policy if exists "Allow all lich animation operations" on public.lich_animations;
create policy "Allow all lich animation operations" on public.lich_animations for all to public
  using (true)
  with check (true);

drop policy if exists "Allow all lich environment operations" on public.lich_environments;
create policy "Allow all lich environment operations" on public.lich_environments for all to public
  using (true)
  with check (true);

drop policy if exists "Allow insert for all" on public.lich_personality;
create policy "Allow insert for all" on public.lich_personality for insert to public
  with check (true);

drop policy if exists "Allow select for all" on public.lich_personality;
create policy "Allow select for all" on public.lich_personality for select to public
  using (true);

drop policy if exists "Allow update for all" on public.lich_personality;
create policy "Allow update for all" on public.lich_personality for update to public
  using (true);

drop policy if exists "Allow all access to magical_resources" on public.magical_resources;
create policy "Allow all access to magical_resources" on public.magical_resources for all to public
  using (true)
  with check (true);

drop policy if exists "Allow all access to npc_encounters" on public.npc_encounters;
create policy "Allow all access to npc_encounters" on public.npc_encounters for all to public
  using (true)
  with check (true);

drop policy if exists "anon can read npc_encounters" on public.npc_encounters;
create policy "anon can read npc_encounters" on public.npc_encounters for select to anon
  using (true);

drop policy if exists scene_effects_read on public.scene_effects;
create policy scene_effects_read on public.scene_effects for select to public
  using (true);

drop policy if exists "anon can insert session_beats" on public.session_beats;
create policy "anon can insert session_beats" on public.session_beats for insert to anon, authenticated
  with check (true);

drop policy if exists "anon can read session_beats" on public.session_beats;
create policy "anon can read session_beats" on public.session_beats for select to anon, authenticated
  using (true);

drop policy if exists "Allow all telemetry operations" on public.session_telemetry;
create policy "Allow all telemetry operations" on public.session_telemetry for all to public
  using (true)
  with check (true);

drop policy if exists "anon can insert telemetry" on public.session_telemetry;
create policy "anon can insert telemetry" on public.session_telemetry for insert to anon
  with check (true);

drop policy if exists "anon can read telemetry" on public.session_telemetry;
create policy "anon can read telemetry" on public.session_telemetry for select to anon
  using (true);

drop policy if exists "anon can read sessions" on public.sessions;
create policy "anon can read sessions" on public.sessions for select to anon, authenticated
  using (true);

drop policy if exists "Allow all dialogue operations" on public.story_dialogue;
create policy "Allow all dialogue operations" on public.story_dialogue for all to public
  using (true)
  with check (true);

drop policy if exists vtt_maps_read on public.vtt_maps;
create policy vtt_maps_read on public.vtt_maps for select to public
  using (true);

drop policy if exists vtt_maps_write on public.vtt_maps;
create policy vtt_maps_write on public.vtt_maps for all to public
  using (true)
  with check (true);

drop policy if exists vtt_tokens_read on public.vtt_tokens;
create policy vtt_tokens_read on public.vtt_tokens for select to public
  using (true);

drop policy if exists vtt_tokens_write on public.vtt_tokens;
create policy vtt_tokens_write on public.vtt_tokens for all to public
  using (true)
  with check (true);


-- ===== COMMENTS =====

comment on table public.character_secrets is 'Per-character access credentials. RLS enabled with no policies: unreachable by the anon key. Only service-role server routes read this.';
comment on table public.cinematic_requests is 'Observation log for Layer 4 clip resolution. Rows where resolution <> ''exact'' are catalogue gaps ranked by real play frequency. Writing here never costs money.';
comment on table public.class_spellcasting_progression is 'SRD 5.2.1 spellcasting tables. prepared is a fixed count from the class table and does NOT depend on the spellcasting ability modifier (that was the 2014 rule).';
comment on table public.game_clock is 'DM-only in-game clock per session. RLS with no policies: invisible to anon/player clients; only service-role server routes touch it.';
comment on table public.player_seats is 'Exactly 5 rows forever: 4 regular seats + 1 substitute. Claim codes are seat identity, never rotated. RLS enabled with no policies: service-role only, like character_secrets.';
comment on table public.time_advancement_rules is 'Single source of truth for how many in-game minutes each event type advances. Sources cited per row; no invented numbers.';
comment on table public.time_log is 'Audit trail of in-game time advancement, including Malachar''s hidden rolls (hidden_roll jsonb: die, result, purpose, source). Service-role only.';
comment on column public.characters.is_player is 'True for player characters; false for NPCs';
comment on column public.characters.speed is 'Movement speeds, e.g. 30 ft., climb 30 ft.';
comment on column public.characters.senses is 'e.g. darkvision 120 ft., passive Perception 12';
comment on column public.characters.cr is 'Challenge rating for NPCs/monsters; null for players';
comment on column public.characters.in_party is 'Currently seated in the active party. Managed by the DM. Independent of is_player, which marks a human-controlled character rather than a monster.';
comment on column public.characters.stage_scale is 'Scene-stage figure height multiplier. 1 = the default 88% of the panel. Clamped to 0.2-3 in the app.';
comment on column public.characters.stage_offset_y is 'Percent of the figure''s own height to translate downward so the subject sits on the ground line. Clamped to -50..50 in the app.';
comment on column public.cinematic_clips.weight is 'Selection weight among variants in the same cell. 1 = ordinary. Raise for the clip that should appear most often; lower for a rare dramatic variant. 0 = built but benched.';
comment on column public.cinematic_requests.resolution is 'rejected = Malachar emitted a clip id or URL it invented. Per acceptance test #9 this must be refused, not played.';
comment on column public.inventory_items.equippable_slot is 'If set, the equipment slot this item can be equipped into. NULL = not equippable. Valid values mirror equipment_items.slot: head, neck, torso, legs, feet, main_hand, off_hand, ring1, ring2.';
comment on column public.npc_encounters.conditions is 'Active conditions, e.g. ["Manacled","Magical Barrier"] — DM-managed canon state the narrator must honor';
comment on column public.npc_encounters.face_url is 'Canon close-up face image for featured speaker view and future animation';
comment on column public.npc_encounters.voice_id is 'TTS voice ID for this NPC (provider voice identifier)';
comment on column public.npc_encounters.voice_description is 'Human-readable voice direction, e.g. low gravelly Scottish female';
comment on column public.npc_encounters.idle_url is 'Looping idle video (blink/breathe) of the canon face for the featured speaker panel';
comment on column public.npc_encounters.talking_url is 'Looping talking video of the canon face, played while TTS audio speaks';
comment on column public.npc_encounters.disposition is 'One-axis attitude toward the party: hostile < wary < neutral < warm < devoted. NULL = not yet established. Set by the [NPC_DISPOSITION:] tag from the DM AI; visible only in the DM/shared-TV view until players earn it via Insight.';
comment on column public.npc_encounters.stage_scale is 'Head-window zoom, applied as a CSS transform about top centre. 1 = untouched. Clamped to 0.2-3 in the app.';
comment on column public.npc_encounters.stage_offset_y is 'Percent of the element height to translate vertically in the head window; negative lifts the subject. Clamped to -50..50 in the app.';
comment on column public.sessions.active_character_id is 'The player character active in this session';


-- ===== PUBLICATIONS =====

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='characters') then
  alter publication supabase_realtime add table public.characters;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='dialogue') then
  alter publication supabase_realtime add table public.dialogue;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='environments') then
  alter publication supabase_realtime add table public.environments;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='equipment_items') then
  alter publication supabase_realtime add table public.equipment_items;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='inventory_items') then
  alter publication supabase_realtime add table public.inventory_items;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='lich_personality') then
  alter publication supabase_realtime add table public.lich_personality;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='npc_encounters') then
  alter publication supabase_realtime add table public.npc_encounters;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='session_beats') then
  alter publication supabase_realtime add table public.session_beats;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='session_telemetry') then
  alter publication supabase_realtime add table public.session_telemetry;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sessions') then
  alter publication supabase_realtime add table public.sessions;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vtt_maps') then
  alter publication supabase_realtime add table public.vtt_maps;
end if; end $do$;

DO $do$ begin if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='vtt_tokens') then
  alter publication supabase_realtime add table public.vtt_tokens;
end if; end $do$;


-- ===== STORAGE POLICIES =====

DO $do$ begin
  drop policy if exists models_anon_update on storage.objects;
  create policy models_anon_update on storage.objects for update to public using ((bucket_id = 'models'::text)) with check ((bucket_id = 'models'::text));
exception when insufficient_privilege then raise notice 'skipped storage policy (privileges)'; end $do$;

DO $do$ begin
  drop policy if exists models_anon_upload on storage.objects;
  create policy models_anon_upload on storage.objects for insert to public with check ((bucket_id = 'models'::text));
exception when insufficient_privilege then raise notice 'skipped storage policy (privileges)'; end $do$;

DO $do$ begin
  drop policy if exists models_public_read on storage.objects;
  create policy models_public_read on storage.objects for select to public using ((bucket_id = 'models'::text));
exception when insufficient_privilege then raise notice 'skipped storage policy (privileges)'; end $do$;

DO $do$ begin
  drop policy if exists vtt_assets_read on storage.objects;
  create policy vtt_assets_read on storage.objects for select to public using ((bucket_id = 'vtt-assets'::text));
exception when insufficient_privilege then raise notice 'skipped storage policy (privileges)'; end $do$;

DO $do$ begin
  drop policy if exists vtt_assets_update on storage.objects;
  create policy vtt_assets_update on storage.objects for update to public using ((bucket_id = 'vtt-assets'::text));
exception when insufficient_privilege then raise notice 'skipped storage policy (privileges)'; end $do$;

DO $do$ begin
  drop policy if exists vtt_assets_write on storage.objects;
  create policy vtt_assets_write on storage.objects for insert to public with check ((bucket_id = 'vtt-assets'::text));
exception when insufficient_privilege then raise notice 'skipped storage policy (privileges)'; end $do$;

