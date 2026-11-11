\set ON_ERROR_STOP 1
-- Seed a world (triggers off while seeding; the stand-in triggers refuse everything).
set session_replication_role = replica;
insert into campaign_runs (id, campaign_id, run_number, status) values ('00000000-0000-0000-0000-0000000000a1', 'ashes-of-prometheus', 1, 'active');
insert into characters (id, name, level, hp_current, hp_max, xp, run_id, voice_id, portrait_image_url)
  values ('00000000-0000-0000-0000-0000000000c1', 'Fifi', 2, 9, 14, 300, '00000000-0000-0000-0000-0000000000a1', 'voice-A', 'art-A');
insert into items (id, slug, name) values ('00000000-0000-0000-0000-0000000000f1', 'dagger', 'Dagger');
insert into sessions (id, status) values ('00000000-0000-0000-0000-0000000000b1', 'active');
insert into game_clock (session_id, game_day, minutes_of_day) values ('00000000-0000-0000-0000-0000000000b1', 3, 600);
insert into time_log (session_id, event_type, minutes_advanced) values ('00000000-0000-0000-0000-0000000000b1', 'rest', 60);
insert into environments (id, name) values ('00000000-0000-0000-0000-0000000000e1', 'Pen');
insert into dialogue (speaker, text, run_id, environment_id) values ('Ilvara', 'Kneel.', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e1');
insert into inventory_items (id, character_id, name, item_id) values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', 'Dagger', '00000000-0000-0000-0000-0000000000f1');
insert into item_events (inventory_item_id, kind) values ('00000000-0000-0000-0000-0000000000d1', 'found');
insert into npc_encounters (id, name, is_active, hp_current, hp_max, face_url) values ('00000000-0000-0000-0000-000000000011', 'Jorlan', true, 40, 71, 'face-J');
insert into vtt_maps (id, name, is_active, meta) values ('00000000-0000-0000-0000-000000000021', 'Pen', true, '{"art":"keep","marks":[1,2]}');
insert into vtt_tokens (id, map_id, label, grid_x, grid_y) values ('00000000-0000-0000-0000-000000000031', '00000000-0000-0000-0000-000000000021', 'Fifi', 3, 4);
insert into travel_nodes (id, node_key, name, node_type, discovered_at) values ('00000000-0000-0000-0000-000000000041', 'velkynvelve', 'Velkynvelve', 'location', '2026-11-01');
insert into world_flags (campaign_id, key, value) values
  ('ashes-of-prometheus', 'table', '{"status":"closed","session":4}'),
  ('ashes-of-prometheus', 'host', '{"id":"00000000-0000-0000-0000-0000000000c1","name":"Fifi"}'),
  ('ashes-of-prometheus', 'pen-gate', '"open"');
insert into party_situation (campaign_run_id, node_key, area_name) values ('00000000-0000-0000-0000-0000000000a1', 'velkynvelve', 'The slave pen');
set session_replication_role = origin;

-- SAVE A (it becomes the save in play)
select public.campaign_save(null, 'Game A', true) as save_a \gset

-- Play on in A: things change.
set session_replication_role = replica;
update characters set level = 3, hp_current = 2, xp = 900 where name = 'Fifi';
delete from world_flags where key = 'pen-gate';
insert into dialogue (speaker, text, run_id) values ('Fifi', 'Run!', '00000000-0000-0000-0000-0000000000a1');
update npc_encounters set hp_current = 0, is_active = false;
update vtt_tokens set grid_x = 9;
insert into vtt_tokens (map_id, label, grid_x, grid_y, summon) values ('00000000-0000-0000-0000-000000000021', 'Spirit', 1, 1, '{"by":"Fifi"}');
update vtt_maps set meta = '{"art":"keep"}';
update travel_nodes set discovered_at = null;
update game_clock set game_day = 9;
delete from item_events;
set session_replication_role = origin;

-- NEW GAME (ruling 1): the world in play goes on the shelf first, then a fresh world starts in a new save.
select public.campaign_save(:'save_a', null, false);
set session_replication_role = replica;
update campaign_runs set status = 'ended';
insert into campaign_runs (id, campaign_id, run_number, status) values ('00000000-0000-0000-0000-0000000000a2', 'ashes-of-prometheus', 2, 'active');
update characters set level = 1, hp_current = 14, xp = 0, run_id = '00000000-0000-0000-0000-0000000000a2', voice_id = 'voice-B', portrait_image_url = 'art-B';
delete from dialogue; delete from world_flags where key <> 'table';
insert into world_flags (campaign_id, key, value) values ('ashes-of-prometheus', 'host', '{"id":"x","name":"Kenta"}');
set session_replication_role = origin;
select public.campaign_save(null, 'Game B', true) as save_b \gset

-- A table that is live must refuse a load.
update world_flags set value = '{"status":"live","session":1}' where key = 'table';
do $$ begin
  perform public.campaign_load((select id from campaign_saves where name = 'Game A'));
  raise exception 'FAIL: load while live was allowed';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'ok: refused while live (%)', sqlerrm;
end $$;
update world_flags set value = '{"status":"closed","session":1}' where key = 'table';

-- LOAD A. (Game B should be saved first, automatically.)
select public.campaign_load(:'save_a') -> 'saved_first' as saved_first;

-- What A looked like after its last save (the "play on" changes above).
select 'level' k, level::text v from characters union all
select 'xp', xp::text from characters union all
select 'voice (shared, must be B)', voice_id from characters union all
select 'art (shared, must be B)', portrait_image_url from characters union all
select 'run', run_id::text from characters union all
select 'live run', (select run_number::text from campaign_runs where status <> 'ended') union all
select 'dialogue lines', count(*)::text from dialogue union all
select 'pen-gate flag', coalesce((select value::text from world_flags where key = 'pen-gate'), 'gone') union all
select 'host', (select value ->> 'name' from world_flags where key = 'host') union all
select 'table', (select value ->> 'status' from world_flags where key = 'table') union all
select 'npc hp / active', (select hp_current || ' / ' || is_active from npc_encounters) union all
select 'npc face (kept)', (select face_url from npc_encounters) union all
select 'tokens', (select string_agg(label || '@' || grid_x, ',' order by label) from vtt_tokens) union all
select 'map meta', (select meta::text from vtt_maps) union all
select 'node discovered', (select coalesce(discovered_at::text, 'null') from travel_nodes) union all
select 'clock day', (select game_day::text from game_clock) union all
select 'time_log rows', count(*)::text from time_log union all
select 'item_events', count(*)::text from item_events union all
select 'loaded', (select name from campaign_saves where is_loaded) union all
select 'saves', (select string_agg(name || ':' || coalesce(place,'-') || ':' || coalesce(host->>'name','-'), ', ' order by name) from campaign_saves);

-- And back to B.
select public.campaign_load(:'save_b') -> 'saved_first' as saved_first_b;
select 'B level' k, level::text v from characters union all
select 'B host', (select value ->> 'name' from world_flags where key = 'host') union all
select 'B live run', (select run_number::text from campaign_runs where status <> 'ended') union all
select 'B dialogue', count(*)::text from dialogue union all
select 'B pen-gate', coalesce((select value::text from world_flags where key = 'pen-gate'), 'gone');

-- Triggers are back on.
select tgname, tgenabled from pg_trigger where not tgisinternal order by 1;
