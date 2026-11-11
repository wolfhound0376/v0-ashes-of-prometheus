-- ============================================================================
-- SAVED GAMES — several saved campaigns on a shelf, one played at a time.
--
-- Sam, 2026-11-10: "several saved games, one played at a time for right now. Host should be able to select from
-- a variety of saved games with NPC dialogues and battle logs, game states, etc unique to that save."
-- His rulings the same evening ("1. Yes. 2. Yes. 3. Yes."):
--   1. New Game keeps the old world on the shelf instead of destroying it.
--   2. A hero's level, HP and gear belong to the save; their art and voice are shared by every save.
--   3. Each save has its own host and party.
-- Design of record: project doc claude/Saved_Games_Design_2026-11-10.md.
--
-- A SAVE is one row of campaign_saves holding a JSON copy of the game's STATE: every row of the state tables
-- below, plus the state columns of five tables that also hold art and canon (characters, npc_encounters,
-- vtt_tokens, travel_nodes, vtt_maps). The LIBRARY — items, bestiary, maps, films, art, voices, the rulebooks,
-- hero baselines, claims — is never saved and never rolled back. Measured live 2026-11-10: the whole state is
-- a few MB, so one row per save is fine.
--
--   campaign_snapshot()             the state of the world in play, as jsonb
--   campaign_save(id, name, load)   write the world in play into save `id` (null = a new save); `load` marks it
--                                   the save in play
--   campaign_load(id)               put save `id` into play: the world in play is saved first (into the save in
--                                   play, if there is one), then replaced. ONE TRANSACTION: it loads fully or
--                                   changes nothing. Refuses while the table is open or live.
--
-- Restore order: parents before children (campaign_runs, then environments, then the state tables in the order of
-- campaign_save_whole_tables()). User triggers on the restored tables are switched off for the restore and back on
-- at the end (same transaction; an error undoes both): the character lock guard and the history log would refuse
-- or flood on a restore, time_log's insert trigger would re-apply every logged minute to the clock, and the token
-- no-stack guard can refuse a valid saved square. Foreign keys stay checked.
--
-- Callable only with the service-role key (server routes), never by a browser. NOT a migration that runs on
-- deploy: apply it by hand (SQL editor) or on Sam's "run the saves migration".
-- ============================================================================

create table if not exists public.campaign_saves (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  saved_at timestamptz not null default now(),
  session_no int,
  place text,
  host jsonb,
  party jsonb not null default '[]'::jsonb,
  is_loaded boolean not null default false,
  snapshot jsonb not null
);
create unique index if not exists campaign_saves_one_loaded on public.campaign_saves (is_loaded) where is_loaded;
alter table public.campaign_saves enable row level security;
-- No policies: server routes only (service role), like character_secrets.
revoke all on public.campaign_saves from anon, authenticated;

-- The state tables saved whole, parents first. Mirrored in lib/saves.ts (WHOLE_TABLES); a test keeps them equal.
create or replace function public.campaign_save_whole_tables() returns text[]
language sql immutable as $$
  select array[
    'sessions', 'game_clock', 'time_log', 'world_flags',
    'party_position', 'party_situation', 'party_vessels', 'party_supplies',
    'subnodal_party_position', 'subnodal_visibility', 'travel_march', 'travel_arrivals',
    'walk_world', 'walk_events', 'work_details',
    'dialogue', 'session_beats', 'session_telemetry', 'story_dialogue', 'cinematic_views',
    'journal_entries', 'journal_offers',
    'character_known_recipes', 'character_known_runes', 'character_known_effects', 'character_known_weaknesses',
    'inventory_items', 'item_events', 'equipment_items', 'vtt_ground_items', 'combat_state',
    'roll_requests', 'roll_attempts', 'skill_progress',
    'relationship_events', 'character_relationships', 'npc_knowledge',
    'character_faith', 'faith_events', 'prayers', 'rest_events', 'crafting_projects', 'magical_resources'
  ]::text[]
$$;

-- A hero's state columns: lib/hero-baseline.ts BASELINE_COLUMNS plus what a session changes. Identity, art,
-- voice, seat and claim are not here (ruling 2). Mirrored in lib/saves.ts (CHARACTER_STATE_COLUMNS).
create or replace function public.campaign_save_character_columns() returns text[]
language sql immutable as $$
  select array[
    'level', 'xp', 'xp_to_next', 'proficiency_bonus',
    'hp_max', 'hp_current', 'sheet_hp_temp', 'sheet_hit_dice', 'hit_dice_remaining',
    'str_score', 'str_modifier', 'dex_score', 'dex_modifier', 'con_score', 'con_modifier',
    'int_score', 'int_modifier', 'wis_score', 'wis_modifier', 'cha_score', 'cha_modifier',
    'ac', 'initiative', 'passive_perception', 'sheet_passive_insight', 'sheet_passive_investigation',
    'skills', 'languages', 'speed',
    'sheet_save_proficiencies', 'sheet_skill_proficiencies', 'sheet_proficiencies',
    'sheet_features', 'sheet_attacks', 'sheet_spellcasting', 'sheet_currency',
    'conditions', 'sheet_heroic_inspiration', 'death_saves', 'exhaustion', 'inebriation',
    'rest_actions_remaining', 'unfed_rest_streak', 'weight_current', 'in_party', 'run_id'
  ]::text[]
$$;

-- The state of the world in play.
create or replace function public.campaign_snapshot() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t text;
  whole jsonb := '{}'::jsonb;
  r jsonb;
  cols text;
begin
  foreach t in array public.campaign_save_whole_tables() loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;   -- a table since dropped
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t) into r;
    whole := whole || jsonb_build_object(t, r);
  end loop;

  select string_agg(format('%I', c), ', ') into cols
    from unnest(public.campaign_save_character_columns()) c
   where exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = 'characters' and k.column_name = c);
  execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from (select id, %s from public.characters) x', cols) into r;

  return jsonb_build_object(
    'v', 1,
    'taken_at', now(),
    'whole', whole,
    'campaign_runs', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.campaign_runs x),
    'characters', r,
    'npc_encounters', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'is_active', is_active, 'hp_current', hp_current, 'conditions', conditions, 'disposition', disposition)), '[]'::jsonb)
      from public.npc_encounters),
    'vtt_tokens', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.vtt_tokens x),
    'travel_nodes', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'discovered_at', discovered_at, 'name_known_at', name_known_at)), '[]'::jsonb)
      from public.travel_nodes),
    'vtt_maps', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'is_active', is_active, 'marks', meta -> 'marks')), '[]'::jsonb)
      from public.vtt_maps),
    'environments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from public.environments x)
  );
end $$;

-- What the shelf shows about the world in play: session number, where the party stands, the host, the party.
create or replace function public.campaign_save_meta() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'session_no', (select (value ->> 'session')::int from public.world_flags where campaign_id = 'ashes-of-prometheus' and key = 'table'),
    'host', (select value from public.world_flags where campaign_id = 'ashes-of-prometheus' and key = 'host'),
    'party', coalesce((select jsonb_agg(value ->> 'name' order by key) from public.world_flags
                        where campaign_id = 'ashes-of-prometheus' and key like 'seated:%'), '[]'::jsonb),
    'place', (select coalesce(ps.area_name, ps.place) from public.party_situation ps
                join public.campaign_runs r on r.id = ps.campaign_run_id
               where r.status <> 'ended' order by r.run_number desc limit 1)
  )
$$;

-- Write the world in play into a save. p_id null = a new save. p_load = make it the save in play.
create or replace function public.campaign_save(p_id uuid, p_name text default null, p_load boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  snap jsonb := public.campaign_snapshot();
  m jsonb := public.campaign_save_meta();
  sid uuid;
  v_party jsonb := nullif(m -> 'party', '[]'::jsonb);
  v_host jsonb := nullif(m -> 'host', 'null'::jsonb);
begin
  if p_id is null then
    insert into public.campaign_saves (name, snapshot, session_no, place, host, party)
    values (coalesce(nullif(trim(p_name), ''), 'Out of the Abyss'), snap, (m ->> 'session_no')::int, m ->> 'place', v_host, coalesce(v_party, '[]'::jsonb))
    returning id into sid;
  else
    update public.campaign_saves
       set snapshot = snap, saved_at = now(),
           session_no = coalesce((m ->> 'session_no')::int, session_no),
           place = coalesce(m ->> 'place', place),
           host = coalesce(v_host, campaign_saves.host),
           party = coalesce(v_party, campaign_saves.party),        -- an empty table keeps the party it had
           name = coalesce(nullif(trim(p_name), ''), name)
     where id = p_id
    returning id into sid;
    if sid is null then raise exception 'There is no save with that id.'; end if;
  end if;
  if p_load then
    update public.campaign_saves set is_loaded = false where is_loaded and id <> sid;
    update public.campaign_saves set is_loaded = true where id = sid;
  end if;
  return sid;
end $$;

-- Insert a table's saved rows, using only the columns both the save and today's table have (a column added since
-- the save takes its default; a column dropped since is ignored).
create or replace function public.campaign_restore_rows(p_table text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  cols text;
  n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then return 0; end if;
  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into cols
    from pg_attribute a
   where a.attrelid = format('public.%I', p_table)::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     and (p_rows -> 0) ? a.attname;
  if cols is null then return 0; end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict do nothing',
                 p_table, cols, cols, p_table) using p_rows;
  get diagnostics n = row_count;
  return n;
end $$;

-- Put a save into play.
create or replace function public.campaign_load(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  snap jsonb;
  cur uuid;
  tbls text[] := public.campaign_save_whole_tables();
  quiet text[];
  t text;
  i int;
  cols text;
  n int;
  report jsonb := '{}'::jsonb;
begin
  select snapshot into snap from public.campaign_saves where id = p_id;
  if snap is null then raise exception 'There is no save with that id.'; end if;
  if coalesce(snap ->> 'v', '') <> '1' then raise exception 'This save was written by a different version of the game (v%).', snap ->> 'v'; end if;
  if exists (select 1 from public.world_flags where campaign_id = 'ashes-of-prometheus' and key = 'table'
               and value ->> 'status' in ('lobby', 'live')) then
    raise exception 'End the session and close the table before loading a save.';
  end if;

  -- Nothing is lost: the world in play goes back on the shelf first (ruling 1).
  select id into cur from public.campaign_saves where is_loaded;
  if cur is not null and cur <> p_id then perform public.campaign_save(cur, null, false); end if;

  -- Quiet the user triggers on everything this touches (see the header).
  quiet := tbls || array['characters', 'npc_encounters', 'vtt_tokens', 'travel_nodes', 'vtt_maps', 'environments', 'campaign_runs'];
  foreach t in array quiet loop
    if to_regclass(format('public.%I', t)) is not null then execute format('alter table public.%I disable trigger user', t); end if;
  end loop;

  -- 1. Empty the state tables, children first.
  for i in reverse array_length(tbls, 1) .. 1 loop
    if to_regclass(format('public.%I', tbls[i])) is not null then execute format('delete from public.%I where true', tbls[i]); end if;
  end loop;

  -- 2. Campaign runs are never deleted (every save's runs live side by side); the save's runs take their saved
  --    status and every other run is ended, so exactly the save's run is live.
  update public.campaign_runs set status = 'ended', ended_at = coalesce(ended_at, now())
   where status <> 'ended'
     and id not in (select (r ->> 'id')::uuid from jsonb_array_elements(snap -> 'campaign_runs') r where r ->> 'status' <> 'ended');
  perform public.campaign_restore_rows('campaign_runs', snap -> 'campaign_runs');
  update public.campaign_runs c set status = s.status, ended_at = s.ended_at
    from jsonb_populate_recordset(null::public.campaign_runs, snap -> 'campaign_runs') s
   where s.id = c.id and (c.status is distinct from s.status or c.ended_at is distinct from s.ended_at);

  -- 3. Places the game made up while playing: put back any the save had that are gone. (Never deleted here.)
  report := report || jsonb_build_object('environments', public.campaign_restore_rows('environments', snap -> 'environments'));

  -- 4. The state tables, parents first.
  foreach t in array tbls loop
    if to_regclass(format('public.%I', t)) is null then continue; end if;
    n := public.campaign_restore_rows(t, snap -> 'whole' -> t);
    report := report || jsonb_build_object(t, n);
  end loop;

  -- 5. Heroes: the state columns only (ruling 2). A hero who did not exist when the save was taken is untouched.
  select string_agg(format('%1$I = s.%1$I', c), ', ') into cols
    from unnest(public.campaign_save_character_columns()) c
   where (snap -> 'characters' -> 0) ? c
     and exists (select 1 from information_schema.columns k where k.table_schema = 'public' and k.table_name = 'characters' and k.column_name = c);
  if cols is not null then
    execute format('update public.characters c set %s from jsonb_populate_recordset(null::public.characters, $1) s where s.id = c.id', cols)
      using snap -> 'characters';
  end if;

  -- 6. NPCs: never deleted (their faces and voices live on the row). Everyone stands down, then the save's state.
  update public.npc_encounters set is_active = false where is_active;
  update public.npc_encounters n
     set is_active = s.is_active, hp_current = s.hp_current, conditions = s.conditions, disposition = s.disposition
    from jsonb_populate_recordset(null::public.npc_encounters, snap -> 'npc_encounters') s
   where s.id = n.id;

  -- 7. Tokens: squares, health and visibility as saved; a saved token since deleted comes back; a summoned token
  --    the save never had goes.
  update public.vtt_tokens v
     set map_id = s.map_id, grid_x = s.grid_x, grid_y = s.grid_y, is_visible = s.is_visible, is_hidden = s.is_hidden,
         hp_current = s.hp_current, hp_max = s.hp_max, summon = s.summon, effects = s.effects
    from jsonb_populate_recordset(null::public.vtt_tokens, snap -> 'vtt_tokens') s
   where s.id = v.id;
  perform public.campaign_restore_rows('vtt_tokens', snap -> 'vtt_tokens');
  delete from public.vtt_tokens
   where summon is not null
     and id not in (select (r ->> 'id')::uuid from jsonb_array_elements(snap -> 'vtt_tokens') r);

  -- 8. The map: what the party has discovered, which board is up, the blood on it.
  update public.travel_nodes tn set discovered_at = s.discovered_at, name_known_at = s.name_known_at
    from jsonb_populate_recordset(null::public.travel_nodes, snap -> 'travel_nodes') s
   where s.id = tn.id and (tn.discovered_at is distinct from s.discovered_at or tn.name_known_at is distinct from s.name_known_at);
  update public.vtt_maps m
     set is_active = (s ->> 'is_active')::boolean,
         meta = case when s -> 'marks' is null or s -> 'marks' = 'null'::jsonb then m.meta - 'marks'
                     else jsonb_set(m.meta, '{marks}', s -> 'marks') end
    from jsonb_array_elements(snap -> 'vtt_maps') s
   where (s ->> 'id')::uuid = m.id;

  -- 9. Whatever the table was doing when the save was taken, it is dark now and nobody is seated or invited.
  update public.world_flags
     set value = value || '{"status":"closed","dmReady":false,"openedAt":null,"startedAt":null}'::jsonb
   where campaign_id = 'ashes-of-prometheus' and key = 'table';
  delete from public.world_flags where campaign_id = 'ashes-of-prometheus' and (key like 'seated:%' or key like 'invited:%');

  foreach t in array quiet loop
    if to_regclass(format('public.%I', t)) is not null then execute format('alter table public.%I enable trigger user', t); end if;
  end loop;

  update public.campaign_saves set is_loaded = false where is_loaded and id <> p_id;
  update public.campaign_saves set is_loaded = true where id = p_id;
  return jsonb_build_object('ok', true, 'saved_first', cur, 'rows', report);
end $$;

revoke all on function public.campaign_save_whole_tables() from public, anon, authenticated;
revoke all on function public.campaign_save_character_columns() from public, anon, authenticated;
revoke all on function public.campaign_snapshot() from public, anon, authenticated;
revoke all on function public.campaign_save_meta() from public, anon, authenticated;
revoke all on function public.campaign_save(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.campaign_restore_rows(text, jsonb) from public, anon, authenticated;
revoke all on function public.campaign_load(uuid) from public, anon, authenticated;
grant execute on function public.campaign_save(uuid, text, boolean) to service_role;
grant execute on function public.campaign_load(uuid) to service_role;
grant execute on function public.campaign_snapshot() to service_role;
