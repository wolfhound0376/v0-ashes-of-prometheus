\set ON_ERROR_STOP 1
-- Part 2 (migrations/20261123230000_save_checkpoints.sql): checkpoints, Rewind, Mortal Mode.
-- Runs AFTER roundtrip.sql on the same database (Game B is in play, the table is closed):
--   psql -d t -f stub_schema.sql -f ../../migrations/20261110230000_campaign_saves.sql -f roundtrip.sql \
--        -f ../../migrations/20261123230000_save_checkpoints.sql -f checkpoints.sql

create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAIL: %', what; end if; raise notice 'ok: %', what; end $$;

-- Every old save is now the head of its own campaign.
select pg_temp.check((select bool_and(kind = 'head' and campaign_id = id) from campaign_saves), 'old saves became heads of their own campaigns');

-- The party stands on the pen plate (walk_world of the live run).
set session_replication_role = replica;
insert into walk_world (campaign_run_id, version, state, plate) values ('00000000-0000-0000-0000-0000000000a2', 1, '{}', '11')
  on conflict (campaign_run_id) do update set plate = '11';
update characters set level = 4;
set session_replication_role = origin;
select (select id from campaign_saves where is_loaded) as head_b \gset

-- A named checkpoint ("Save now") at level 4.
select public.campaign_checkpoint('named', 'Before the falls') as named_cp \gset
select pg_temp.check((select kind = 'named' and campaign_id = :'head_b'::uuid and plate = '11' and not is_loaded from campaign_saves where id = :'named_cp'), 'named checkpoint belongs to the campaign in play, with its plate');

-- Play on to level 9, then six Ends: only the newest five autosaves stay.
set session_replication_role = replica; update characters set level = 9; set session_replication_role = origin;
select public.campaign_checkpoint('auto', 'Session ended ' || g) from generate_series(1, 6) g;
select pg_temp.check((select count(*) = 5 from campaign_saves where campaign_id = :'head_b' and kind = 'auto'), 'five autosaves kept');
select pg_temp.check((select count(*) = 1 from campaign_saves where campaign_id = :'head_b' and kind = 'named'), 'the named checkpoint is never pruned');

-- Rewind refused while the table is open.
update world_flags set value = '{"status":"lobby","session":1}' where key = 'table';
do $$ begin
  perform public.campaign_rewind((select id from campaign_saves where name = 'Before the falls'));
  raise exception 'FAIL: rewind while open was allowed';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: rewind refused while the table is open (%)', sqlerrm; end $$;
update world_flags set value = '{"status":"closed","session":1}' where key = 'table';

-- REWIND to "Before the falls": the world comes back to level 4, the campaign keeps its id, and the level-9 world
-- is kept as "Before the rewind".
select public.campaign_rewind(:'named_cp') -> 'ok' as rewound;
select pg_temp.check((select level = 4 from characters), 'rewind brought the world back (level 4)');
select pg_temp.check((select is_loaded and kind = 'head' from campaign_saves where id = :'head_b'), 'the campaign head is still the one in play');
select pg_temp.check(exists (select 1 from campaign_saves where campaign_id = :'head_b' and name = 'Before the rewind'), 'the world before the rewind was kept');
select pg_temp.check((select (snapshot -> 'characters' -> 0 ->> 'level') = '9' from campaign_saves where campaign_id = :'head_b' and name = 'Before the rewind'), '"Before the rewind" holds the level-9 world');

-- Rewinding into a campaign that is NOT in play shelves the one in play first (Game A in play, rewind B).
select public.campaign_load((select id from campaign_saves where name = 'Game A' and kind = 'head')) -> 'ok' as a_loaded;
select pg_temp.check((select level = 3 from characters), 'Game A in play again (level 3)');
select public.campaign_rewind((select id from campaign_saves where name = 'Before the rewind')) -> 'ok' as rewound_back;
select pg_temp.check((select level = 9 from characters), 'rewind from another campaign: B at level 9');
select pg_temp.check((select is_loaded from campaign_saves where id = :'head_b'), 'B is in play');

-- MORTAL MODE: no checkpoints, no rewind.
update campaign_saves set mortal = true where id = :'head_b';
do $$ begin
  perform public.campaign_checkpoint('named', 'cheat');
  raise exception 'FAIL: checkpoint in Mortal Mode was allowed';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: no checkpoint in Mortal Mode (%)', sqlerrm; end $$;
do $$ begin
  perform public.campaign_rewind((select id from campaign_saves where name = 'Before the falls'));
  raise exception 'FAIL: rewind in Mortal Mode was allowed';
exception when others then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok: no rewind in Mortal Mode (%)', sqlerrm; end $$;

-- A brand-new save is the head of its own campaign, with the plate.
select public.campaign_save(null, 'Game C', false) as save_c \gset
select pg_temp.check((select kind = 'head' and campaign_id = id and plate = '11' from campaign_saves where id = :'save_c'), 'a new save heads its own campaign');

-- Triggers are back on.
select pg_temp.check((select bool_and(tgenabled = 'O') from pg_trigger where not tgisinternal), 'user triggers are on again');
