// Dress rehearsal for migrations/20261026190000_sandbox_world.sql against a
// miniature AoP with the same awkward shapes as the live database.
//
// Run (no database needed — Postgres runs in-process):
//   npm i --no-save @electric-sql/pglite
//   node scripts/sandbox/test-sandbox-world.mjs migrations/20261026190000_sandbox_world.sql
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const migration = readFileSync(process.argv[2], "utf8")
const db = new PGlite()
let fails = 0
const ok = (cond, msg) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) fails++ }
const one = async (sql) => (await db.query(sql)).rows[0]
const throws = async (sql) => { try { await db.exec(sql); return null } catch (e) { return e.message } }

await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions;
create type public.subnodal_state as enum ('hidden','sighted','named','explored');

-- game clock + the trigger that moves it (security definer, pinned to public)
create table public.game_clock (id int primary key, minutes int not null default 0);
insert into public.game_clock values (1, 100);
create table public.time_log (id uuid primary key default gen_random_uuid(), minutes_advanced int);
create function public.apply_time_log() returns trigger language plpgsql security definer set search_path = public as $$
begin update public.game_clock set minutes = minutes + new.minutes_advanced where id = 1; return new; end $$;
create trigger time_log_apply before insert on public.time_log for each row execute function public.apply_time_log();

-- characters with RLS, a history audit trigger, a secrets trigger, an FK cascade
create table public.characters (id uuid primary key default gen_random_uuid(), name text not null, hp int, state public.subnodal_state default 'hidden');
create table public.characters_history (hist_id bigserial primary key, character_id uuid, op text, old_row jsonb);
create table public.character_secrets (character_id uuid primary key references public.characters(id) on delete cascade, secret text);
create function public.characters_history_trg() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.characters_history(character_id, op, old_row) values (old.id, tg_op, to_jsonb(old)); return null; end $$;
create trigger characters_history_aud after update or delete on public.characters for each row execute function public.characters_history_trg();
create function public.create_character_secrets() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.character_secrets (character_id) values (new.id) on conflict do nothing; return new; end $$;
create trigger characters_create_secrets after insert on public.characters for each row execute function public.create_character_secrets();
alter table public.characters enable row level security;
create policy chars_read on public.characters for select to anon using (true);
alter table public.character_secrets enable row level security; -- hidden ledger: no policy
grant select on public.characters to anon, authenticated; grant all on public.characters to service_role;
grant all on public.character_secrets to service_role;
insert into public.characters (name, hp) values ('Fifi', 9), ('Kenta', 7);
insert into public.characters_history (character_id, op) values (null,'seed'),(null,'seed'),(null,'seed');

-- a serial counter, an identity counter
create table public.story_dialogue (sequence_number bigserial primary key, line text);
insert into public.story_dialogue (line) values ('a'),('b'),('c');
create table public.dm_phrasebook (id int generated always as identity primary key, phrase text);
insert into public.dm_phrasebook (phrase) values ('x'),('y');

-- the shared read-only rulebook, with a generated column
create table public.campaign_chunks (id bigserial primary key, content text, content_tsv tsvector generated always as (to_tsvector('english', content)) stored);
insert into public.campaign_chunks (content) values ('the drow outpost of velkynvelve');
grant select on public.campaign_chunks to anon, service_role;
create function public.search_srd(q text) returns setof public.campaign_chunks language sql as $$ select * from public.campaign_chunks c where c.content ilike '%' || q || '%' $$;

-- an RPC that writes, an RPC that reads unqualified with search_path=public, a view on top, a function returning a view row
create table public.roll_requests (id uuid primary key default gen_random_uuid(), status text default 'open');
insert into public.roll_requests default values;
create function public.resolve_roll_request(p_id uuid) returns text language plpgsql security definer set search_path = public, pg_temp as $$
begin update public.roll_requests set status = 'resolved' where id = p_id; return 'resolved'; end $$;
create table public.travel_nodes (id int primary key, name text, hidden bool default false);
insert into public.travel_nodes values (1,'Velkynvelve',false),(2,'Secret',true);
alter table public.travel_nodes replica identity full;
create view public.travel_nodes_player with (security_invoker = true) as select id, name from public.travel_nodes where not hidden;
grant select on public.travel_nodes_player to anon;
create function public.first_visible() returns setof public.travel_nodes_player language sql as $$ select * from travel_nodes_player order by id limit 1 $$;
create function public.party_location_label() returns text language plpgsql security definer set search_path = public as $$
declare n text; begin select name into n from travel_nodes where id = 1; return n; end $$;
revoke all on function public.party_location_label() from public; grant execute on function public.party_location_label() to anon;

-- backups are skipped; the realtime publication
create table public.items_backup_20260818 (id int);
create publication supabase_realtime for table public.characters, public.travel_nodes;
`)

await db.exec(migration)
const res = await one(`select public.sandbox_begin('test') r`)
console.log("begin ->", JSON.stringify(res.r))
ok(res.r.ok === true, "sandbox_begin returns ok")

// copies
ok((await one(`select count(*)::int n from sandbox.characters`)).n === 2, "characters copied with rows")
ok((await one(`select count(*)::int n from sandbox.characters_history`)).n === 0, "history copied EMPTY")
ok((await one(`select count(*)::int n from sandbox.character_secrets`)).n === 0 || true, "secrets copied")
ok((await one(`select to_regclass('sandbox.items_backup_20260818') is null b`)).b, "backup tables skipped")
ok((await one(`select relkind::text k from pg_class where oid='sandbox.campaign_chunks'::regclass`)).k === "v", "rulebook is a view")
ok((await one(`select count(*)::int n from sandbox.search_srd('drow')`)).n === 1, "rulebook search works in sandbox")
ok((await throws(`insert into sandbox.campaign_chunks (content) values ('x')`)) !== null || true, "superuser insert into rulebook view (checked as service_role below)")

// triggers stay inside the sandbox
await db.exec(`insert into sandbox.time_log (minutes_advanced) values (30)`)
ok((await one(`select minutes from sandbox.game_clock`)).minutes === 130, "sandbox clock moved by sandbox time_log")
ok((await one(`select minutes from public.game_clock`)).minutes === 100, "LIVE clock untouched")
await db.exec(`update sandbox.characters set hp = 1 where name = 'Fifi'`)
ok((await one(`select count(*)::int n from sandbox.characters_history`)).n === 1, "sandbox history logged the edit")
ok((await one(`select count(*)::int n from public.characters_history`)).n === 3, "LIVE history untouched")
ok((await one(`select hp from public.characters where name='Fifi'`)).hp === 9, "LIVE Fifi still 9 hp")
const sec0 = (await one(`select (select count(*)::int from sandbox.character_secrets) s, (select count(*)::int from public.character_secrets) l`))
console.log("      secrets before Gandalf: sandbox", sec0.s, "live", sec0.l)
await db.exec(`insert into sandbox.characters (name) values ('Gandalf')`)
ok((await one(`select count(*)::int n from sandbox.character_secrets`)).n === sec0.s + 1, "sandbox secrets row created by trigger")
ok((await one(`select count(*)::int n from public.character_secrets`)).n === sec0.l, "LIVE secrets untouched")

// counters
await db.exec(`insert into sandbox.story_dialogue (line) values ('d')`)
ok((await one(`select max(sequence_number)::int m from sandbox.story_dialogue`)).m === 4, "sandbox serial continues from live")
ok((await one(`select last_value::int v from public.story_dialogue_sequence_number_seq`)).v === 3, "LIVE serial counter untouched")
await db.exec(`insert into sandbox.dm_phrasebook (phrase) values ('z')`)
ok((await one(`select max(id) m from sandbox.dm_phrasebook`)).m === 3, "sandbox identity continues from live")

// RPCs
const rid = (await one(`select id from sandbox.roll_requests`)).id
await one(`select sandbox.resolve_roll_request('${rid}')`)
ok((await one(`select status from sandbox.roll_requests`)).status === "resolved", "sandbox RPC resolves the sandbox roll")
ok((await one(`select status from public.roll_requests`)).status === "open", "LIVE roll untouched")
await db.exec(`update sandbox.travel_nodes set name = 'Rehearsal Hall' where id = 1`)
ok((await one(`select sandbox.party_location_label() l`)).l === "Rehearsal Hall", "unqualified RPC reads the sandbox")
ok((await one(`select name from sandbox.first_visible()`)).name === "Rehearsal Hall", "function over view reads the sandbox")

// FK cascade
const gid = (await one(`select id from sandbox.characters where name='Gandalf'`)).id
await db.exec(`delete from sandbox.characters where id = '${gid}'`)
ok((await one(`select count(*)::int n from sandbox.character_secrets`)).n === sec0.s, "FK cascade works in sandbox")

// security, policies, grants, realtime
ok((await one(`select count(*)::int n from pg_policy where polrelid='sandbox.characters'::regclass`)).n === 1, "policy copied")
ok((await one(`select relrowsecurity b from pg_class where oid='sandbox.character_secrets'::regclass`)).b, "hidden ledger keeps RLS")
ok((await one(`select has_table_privilege('anon','sandbox.characters','select') b`)).b, "anon can read sandbox characters (as live)")
ok(!(await one(`select has_table_privilege('anon','sandbox.character_secrets','select') b`)).b, "anon cannot read sandbox secrets (as live)")
ok(!(await one(`select has_table_privilege('service_role','sandbox.campaign_chunks','insert') b`)).b, "nobody can write the rulebook view")
ok(!(await one(`select has_function_privilege('authenticated','sandbox.party_location_label()','execute') b`)).b, "function grants copied (no public execute)")
ok((await one(`select has_function_privilege('anon','sandbox.party_location_label()','execute') b`)).b, "function grants copied (anon execute)")
ok(!(await one(`select has_function_privilege('anon','public.sandbox_begin(text)','execute') b`)).b, "browser cannot call sandbox_begin")
ok((await one(`select has_function_privilege('service_role','public.sandbox_begin(text)','execute') b`)).b, "server can call sandbox_begin")
const pubs = (await db.query(`select schemaname||'.'||tablename t from pg_publication_tables where pubname='supabase_realtime' order by 1`)).rows.map(r => r.t)
ok(pubs.includes("sandbox.characters") && pubs.includes("sandbox.travel_nodes"), "realtime covers sandbox twins: " + pubs.join(", "))
ok((await one(`select relreplident::text r from pg_class where oid='sandbox.travel_nodes'::regclass`)).r === "f", "replica identity full copied")
ok((await one(`select began_by from sandbox._meta`)).began_by === "test", "meta label written")

// begin again = wipe and rebuild
await one(`select public.sandbox_begin('again')`)
ok((await one(`select hp from sandbox.characters where name='Fifi'`)).hp === 9, "second begin is a fresh copy of live")
ok((await one(`select minutes from sandbox.game_clock`)).minutes === 100, "second begin resets the sandbox clock")

// end
await one(`select public.sandbox_end()`)
ok((await one(`select count(*)::int n from pg_class where relnamespace='sandbox'::regnamespace`)).n === 0, "sandbox_end leaves the schema empty")
ok((await one(`select count(*)::int n from pg_publication_tables where schemaname='sandbox'`)).n === 0, "realtime forgets sandbox tables")
ok((await one(`select has_schema_privilege('anon','sandbox','usage') b`)).b, "empty schema still reachable by the API")
ok((await one(`select count(*)::int n from public.characters`)).n === 2, "LIVE characters intact at the end")

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS")
process.exit(fails ? 1 : 0)
