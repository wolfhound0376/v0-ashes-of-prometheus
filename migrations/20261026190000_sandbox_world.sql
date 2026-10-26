-- ============================================================================
-- The rehearsal world: a full, throwaway copy of the game in schema `sandbox`.
--
-- Sam, 2026-10-26: "I'm not sure anything saves temporarily during a sandbox
-- testing so rolls events don't move well. I think we should have another
-- database that gets wiped out when we leave the sandbox automatically."
--
-- Until now a rehearsal swallowed every write (lib/dry-run.ts), so nothing
-- carried from one turn to the next — and only one of the 53 writing routes
-- honoured it at all. This migration gives rehearsal a real world to write to:
--
--   sandbox_begin(by) → wipes `sandbox` and rebuilds it as a copy of `public`:
--                       every table with its rows, keys, defaults, checks, RLS
--                       policies, grants, foreign keys and triggers; every
--                       view; every SQL/plpgsql function. Anything that said
--                       `public.x` now says `sandbox.x`, and every copied
--                       function runs with search_path = sandbox first — so a
--                       trigger that writes the history, the secrets row or
--                       the game clock writes the SANDBOX one, never the live.
--   sandbox_end()     → drops it all. The empty schema stays, so the Data API
--                       setting that exposes it keeps working.
--
-- Three exceptions, all on purpose:
--   * campaign_chunks (24 MB of rulebook + embeddings) is a READ-ONLY view of
--     the live table. Rehearsal can search the books; nothing can write them.
--   * characters_history (22 MB audit log) is copied EMPTY — same shape, no
--     rows. Rehearsal edits log there and vanish with it.
--   * *_backup_* tables are skipped. Nothing in the game reads them.
--
-- What this cannot fence: storage buckets (uploads), outside services (model
-- calls, ElevenLabs, Runway). Those are gated in the app, not here.
--
-- One world at a time: a second sandbox_begin wipes the first.
--
-- Callable only with the service-role key (the app's server routes), never by
-- a browser: execute is revoked from public/anon/authenticated below.
-- ============================================================================

create schema if not exists sandbox;
grant usage on schema sandbox to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Swap every `public.<name>` for `sandbox.<name>`, for exactly the names the
-- sandbox has. Whole-word, so `public.items` never touches `public.items_x`.
-- ---------------------------------------------------------------------------
create or replace function public.sandbox_rewrite_refs(src text, names text[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  nm text;
  out_src text := src;
begin
  if out_src is null then return null; end if;
  foreach nm in array names loop
    out_src := regexp_replace(out_src, '\mpublic\.' || nm || '\M', 'sandbox.' || nm, 'g');
    out_src := regexp_replace(out_src, '\mpublic\."' || nm || '"', 'sandbox."' || nm || '"', 'g');
  end loop;
  return out_src;
end $$;

-- ---------------------------------------------------------------------------
-- Copy the grants of a live object onto its sandbox twin.
-- kind: 'TABLE' | 'SEQUENCE' | 'FUNCTION'. target is already qualified.
-- ---------------------------------------------------------------------------
create or replace function public.sandbox_copy_grants(acl aclitem[], kind text, target text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  g record;
begin
  if acl is null then return; end if;
  for g in
    select a.grantee, a.privilege_type
    from aclexplode(acl) a
    where a.grantee <> (select oid from pg_catalog.pg_roles where rolname = current_user)
  loop
    execute format('grant %s on %s %s to %s',
      g.privilege_type, kind, target,
      case when g.grantee = 0 then 'public' else quote_ident(pg_catalog.pg_get_userbyid(g.grantee)) end);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Leave the rehearsal: the world is gone, the empty schema stays.
-- ---------------------------------------------------------------------------
create or replace function public.sandbox_end()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('aop_sandbox_world'));
  drop schema if exists sandbox cascade;
  create schema sandbox;
  grant usage on schema sandbox to anon, authenticated, service_role;
  perform pg_catalog.pg_notify('pgrst', 'reload schema');
  return jsonb_build_object('ok', true, 'ended_at', now());
end $$;

-- ---------------------------------------------------------------------------
-- Enter the rehearsal: a fresh copy of the live game, every time.
-- ---------------------------------------------------------------------------
create or replace function public.sandbox_begin(p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  shared_ro  constant text[] := array['campaign_chunks'];      -- read through, never written
  empty_copy constant text[] := array['characters_history'];  -- same shape, no rows
  t0 timestamptz := clock_timestamp();
  names text[];
  r record;
  c record;
  p record;
  cols text;
  n bigint;
  live_seq text;
  seq_name text;
  lv bigint;
  ic boolean;
  roles text;
  pending text[];       -- 'v:<oid>' views and 'f:<oid>' functions not yet created
  still text[];
  item text;
  def text;
  last_err text;
  progressed boolean;
  n_tables int := 0;
  n_rows bigint := 0;
  n_views int := 0;
  n_funcs int := 0;
  n_trig int := 0;
  n_fk int := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('aop_sandbox_world'));
  -- SQL function bodies may name views/functions that are created later in this
  -- same build; validate them when they run, not when they are copied.
  perform pg_catalog.set_config('check_function_bodies', 'off', true);

  -- 1. A clean slate.
  drop schema if exists sandbox cascade;
  create schema sandbox;
  grant usage on schema sandbox to anon, authenticated, service_role;

  -- Every name the sandbox will hold: live tables (not backups), views, and
  -- the SQL/plpgsql functions we copy. Rewrites use exactly this list.
  select coalesce(array_agg(x.nm order by length(x.nm) desc), '{}') into names from (
    select cl.relname::text nm from pg_catalog.pg_class cl
     where cl.relnamespace = 'public'::regnamespace and cl.relkind in ('r','p','v','m')
       and cl.relname !~ 'backup'
    union
    select pr.proname::text from pg_catalog.pg_proc pr
      join pg_catalog.pg_language l on l.oid = pr.prolang
     where pr.pronamespace = 'public'::regnamespace and l.lanname in ('sql','plpgsql')
       and pr.proname !~ '^sandbox_'
       and not exists (select 1 from pg_catalog.pg_depend d
                        where d.classid = 'pg_proc'::regclass and d.objid = pr.oid and d.deptype = 'e')
  ) x;

  -- 2. Tables.
  for r in
    select cl.oid, cl.relname::text relname, cl.relrowsecurity, cl.relforcerowsecurity,
           cl.relreplident, cl.relacl
      from pg_catalog.pg_class cl
     where cl.relnamespace = 'public'::regnamespace and cl.relkind in ('r','p')
       and cl.relname !~ 'backup'
     order by cl.relname
  loop
    if r.relname = any(shared_ro) then
      execute format('create view sandbox.%I with (security_invoker = true) as select * from public.%I',
                     r.relname, r.relname);
      execute format('revoke all on sandbox.%I from public, anon, authenticated, service_role', r.relname);
      execute format('grant select on sandbox.%I to anon, authenticated, service_role', r.relname);
      continue;
    end if;

    execute format('create table sandbox.%I (like public.%I including all)', r.relname, r.relname);
    n_tables := n_tables + 1;

    -- Own counters: a default that says nextval('public.x_seq') would advance
    -- the LIVE sequence on every rehearsal insert.
    for c in
      select a.attname::text attname, pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) expr
        from pg_catalog.pg_attrdef ad
        join pg_catalog.pg_attribute a on a.attrelid = ad.adrelid and a.attnum = ad.adnum
       where ad.adrelid = r.oid and pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) ~ '^nextval\('
    loop
      live_seq := substring(c.expr from $re$nextval\('([^']+)'$re$);
      seq_name := regexp_replace(live_seq, '^.*\.', '');
      seq_name := trim(both '"' from seq_name);
      execute format('create sequence if not exists sandbox.%I', seq_name);
      execute format('select last_value, is_called from %s', live_seq) into lv, ic;
      perform pg_catalog.setval(format('sandbox.%I', seq_name)::regclass, lv, ic);
      execute format('alter table sandbox.%I alter column %I set default nextval(%L::regclass)',
                     r.relname, c.attname, format('sandbox.%I', seq_name));
      execute format('alter sequence sandbox.%I owned by sandbox.%I.%I', seq_name, r.relname, c.attname);
      perform public.sandbox_copy_grants(
        (select s.relacl from pg_catalog.pg_class s where s.oid = live_seq::regclass),
        'SEQUENCE', format('sandbox.%I', seq_name));
    end loop;

    -- Rows (except the logs that start empty). Triggers are not attached yet,
    -- so the copy itself fires nothing.
    if not (r.relname = any(empty_copy)) then
      select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
        from pg_catalog.pg_attribute a
       where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
      execute format('insert into sandbox.%I (%s) overriding system value select %s from public.%I',
                     r.relname, cols, cols, r.relname);
      get diagnostics n = row_count;
      n_rows := n_rows + n;
    end if;

    -- Identity counters continue from the live ones.
    for c in
      select a.attname::text attname from pg_catalog.pg_attribute a
       where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped and a.attidentity <> ''
    loop
      live_seq := pg_catalog.pg_get_serial_sequence(format('public.%I', r.relname), c.attname);
      execute format('select last_value, is_called from %s', live_seq) into lv, ic;
      perform pg_catalog.setval(
        pg_catalog.pg_get_serial_sequence(format('sandbox.%I', r.relname), c.attname)::regclass, lv, ic);
    end loop;

    -- Row security, exactly as live.
    if r.relrowsecurity then
      execute format('alter table sandbox.%I enable row level security', r.relname);
    end if;
    if r.relforcerowsecurity then
      execute format('alter table sandbox.%I force row level security', r.relname);
    end if;
    for p in select * from pg_catalog.pg_policy po where po.polrelid = r.oid loop
      select case when p.polroles = '{0}'::oid[] then 'public'
                  else string_agg(quote_ident(pg_catalog.pg_get_userbyid(x)), ', ') end
        into roles from unnest(p.polroles) x;
      execute format('create policy %I on sandbox.%I as %s for %s to %s%s%s',
        p.polname, r.relname,
        case when p.polpermissive then 'permissive' else 'restrictive' end,
        case p.polcmd when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
                      when 'd' then 'delete' else 'all' end,
        roles,
        case when p.polqual is null then ''
             else ' using (' || public.sandbox_rewrite_refs(pg_catalog.pg_get_expr(p.polqual, p.polrelid), names) || ')' end,
        case when p.polwithcheck is null then ''
             else ' with check (' || public.sandbox_rewrite_refs(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), names) || ')' end);
    end loop;

    perform public.sandbox_copy_grants(r.relacl, 'TABLE', format('sandbox.%I', r.relname));

    if r.relreplident = 'f' then
      execute format('alter table sandbox.%I replica identity full', r.relname);
    end if;
  end loop;

  -- 3. Foreign keys between copied tables (cascades behave as they do live).
  for c in
    select cl.relname::text relname, co.conname::text conname, pg_catalog.pg_get_constraintdef(co.oid) condef
      from pg_catalog.pg_constraint co
      join pg_catalog.pg_class cl on cl.oid = co.conrelid
      join pg_catalog.pg_class rf on rf.oid = co.confrelid
     where co.contype = 'f'
       and cl.relnamespace = 'public'::regnamespace and rf.relnamespace = 'public'::regnamespace
       and cl.relname !~ 'backup' and rf.relname !~ 'backup'
       and not (cl.relname::text = any(shared_ro)) and not (rf.relname::text = any(shared_ro))
  loop
    execute format('alter table sandbox.%I add constraint %I %s not valid',
                   c.relname, c.conname, public.sandbox_rewrite_refs(c.condef, names));
    n_fk := n_fk + 1;
  end loop;

  -- 4. Views and functions. They can depend on each other in either direction
  --    (a view calling a function, a function returning a view's row type), so
  --    build whatever can be built and go round again until nothing is left.
  select coalesce(array_agg('v:' || cl.oid), '{}') into pending
    from pg_catalog.pg_class cl
   where cl.relnamespace = 'public'::regnamespace and cl.relkind = 'v' and cl.relname !~ 'backup';
  select pending || coalesce(array_agg('f:' || pr.oid), '{}') into pending
    from pg_catalog.pg_proc pr
    join pg_catalog.pg_language l on l.oid = pr.prolang
   where pr.pronamespace = 'public'::regnamespace and l.lanname in ('sql','plpgsql')
     and pr.proname !~ '^sandbox_'
     and not exists (select 1 from pg_catalog.pg_depend d
                      where d.classid = 'pg_proc'::regclass and d.objid = pr.oid and d.deptype = 'e');

  loop
    still := '{}';
    progressed := false;
    foreach item in array pending loop
      begin
        if left(item, 2) = 'v:' then
          select cl.relname::text relname, cl.reloptions, cl.relacl,
                 pg_catalog.pg_get_viewdef(cl.oid, true) vdef
            into r from pg_catalog.pg_class cl where cl.oid = substr(item, 3)::oid;
          execute format('create view sandbox.%I%s as %s',
            r.relname,
            case when r.reloptions is null then '' else ' with (' || array_to_string(r.reloptions, ', ') || ')' end,
            public.sandbox_rewrite_refs(r.vdef, names));
          perform public.sandbox_copy_grants(r.relacl, 'TABLE', format('sandbox.%I', r.relname));
          n_views := n_views + 1;
        else
          select pr.proname::text proname, pr.proacl,
                 public.sandbox_rewrite_refs(pg_catalog.pg_get_function_identity_arguments(pr.oid), names) args,
                 pg_catalog.pg_get_functiondef(pr.oid) fdef
            into r from pg_catalog.pg_proc pr where pr.oid = substr(item, 3)::oid;
          def := regexp_replace(r.fdef, '^CREATE OR REPLACE (FUNCTION|PROCEDURE) public\.',
                                'CREATE OR REPLACE \1 sandbox.');
          def := public.sandbox_rewrite_refs(def, names);
          execute def;
          execute format('alter function sandbox.%I(%s) set search_path = sandbox, extensions, public',
                         r.proname, r.args);
          if r.proacl is not null then
            execute format('revoke all on function sandbox.%I(%s) from public', r.proname, r.args);
            perform public.sandbox_copy_grants(r.proacl, 'FUNCTION',
                                               format('sandbox.%I(%s)', r.proname, r.args));
          end if;
          n_funcs := n_funcs + 1;
        end if;
        progressed := true;
      exception when others then
        still := still || item;
        last_err := item || ': ' || sqlerrm;
      end;
    end loop;
    pending := still;
    exit when cardinality(pending) = 0;
    if not progressed then
      raise exception 'sandbox_begin: could not copy % object(s); last error %', cardinality(pending), last_err;
    end if;
  end loop;

  -- 5. Triggers, attached after the rows went in, pointed at sandbox functions.
  for c in
    select cl.relname::text relname, tg.tgname::text tgname, tg.tgenabled,
           pg_catalog.pg_get_triggerdef(tg.oid) tdef
      from pg_catalog.pg_trigger tg
      join pg_catalog.pg_class cl on cl.oid = tg.tgrelid
     where cl.relnamespace = 'public'::regnamespace and cl.relkind in ('r','p')
       and not tg.tgisinternal
       and cl.relname !~ 'backup' and not (cl.relname::text = any(shared_ro))
  loop
    execute public.sandbox_rewrite_refs(c.tdef, names);
    if c.tgenabled = 'D' then
      execute format('alter table sandbox.%I disable trigger %I', c.relname, c.tgname);
    end if;
    n_trig := n_trig + 1;
  end loop;

  -- 6. Live updates: every table the dashboard listens to, the sandbox twin too.
  for c in
    select pt.tablename::text tablename from pg_catalog.pg_publication_tables pt
     where pt.pubname = 'supabase_realtime' and pt.schemaname = 'public'
       and pt.tablename !~ 'backup' and not (pt.tablename::text = any(shared_ro))
  loop
    execute format('alter publication supabase_realtime add table sandbox.%I', c.tablename);
  end loop;

  -- 7. A label on the door, so the app can tell a built world from an empty one.
  create table sandbox._meta (
    began_at  timestamptz not null default now(),
    began_by  text,
    tables    int,
    rows      bigint,
    views     int,
    functions int,
    triggers  int
  );
  insert into sandbox._meta (began_by, tables, rows, views, functions, triggers)
  values (p_by, n_tables, n_rows, n_views, n_funcs, n_trig);
  grant select on sandbox._meta to anon, authenticated, service_role;

  perform pg_catalog.pg_notify('pgrst', 'reload schema');

  return jsonb_build_object(
    'ok', true, 'tables', n_tables, 'rows', n_rows, 'views', n_views,
    'functions', n_funcs, 'triggers', n_trig, 'foreign_keys', n_fk,
    'ms', round(extract(epoch from clock_timestamp() - t0) * 1000));
end $$;

-- Server only. A browser holding the anon key can neither build nor wipe it.
revoke all on function public.sandbox_begin(text) from public, anon, authenticated;
revoke all on function public.sandbox_end() from public, anon, authenticated;
revoke all on function public.sandbox_rewrite_refs(text, text[]) from public, anon, authenticated;
revoke all on function public.sandbox_copy_grants(aclitem[], text, text) from public, anon, authenticated;
grant execute on function public.sandbox_begin(text) to service_role;
grant execute on function public.sandbox_end() to service_role;
