-- ============================================================================
-- SAVED GAMES, PART 2 — checkpoints, Mortal Mode, and what the Load Game book shows.
--
-- Sam, 2026-11-23: "PR4"; "Continue takes the latest save unless we are playing on Mortal Mode"; "yes on mortal
-- mode" (Claude's reading he confirmed: chosen when the campaign starts, like Baldur's Gate 3's Honour Mode — one
-- save that keeps overwriting itself, no going back). Research of record: project doc
-- claude/Tables_Invites_Saves_Research_2026-11-23.md, section D.
--
-- THE MODEL. A campaign is still ONE row of campaign_saves — its HEAD (kind 'head'), the world as it stood when it
-- was last saved; End overwrites it, Continue and Load put it into play, exactly as before (part 1:
-- 20261110230000_campaign_saves.sql). New: CHECKPOINTS, extra rows that share the head's campaign_id and are never
-- overwritten:
--   auto   written at every End (the newest 5 per campaign are kept) and just before a Rewind
--   named  the host's "Save now", with a name, kept until deleted
-- REWIND puts a checkpoint's world back into the head and plays it. A Mortal campaign has no checkpoints and no Rewind.
--
-- Additive only: five new columns (defaults fill the old rows; every existing save becomes the head of its own
-- campaign), two replaced functions (same names and arguments, so their grants stand) and three new ones. No row is
-- deleted or overwritten by this file.
-- ============================================================================

alter table public.campaign_saves add column if not exists campaign_id uuid;
alter table public.campaign_saves add column if not exists kind text not null default 'head';
alter table public.campaign_saves add column if not exists mortal boolean not null default false;
alter table public.campaign_saves add column if not exists plate text;
alter table public.campaign_saves add column if not exists play_seconds integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'campaign_saves_kind_check') then
    alter table public.campaign_saves add constraint campaign_saves_kind_check check (kind in ('head', 'auto', 'named'));
  end if;
end $$;
update public.campaign_saves set campaign_id = id where campaign_id is null;
create index if not exists campaign_saves_campaign on public.campaign_saves (campaign_id, saved_at desc);

-- What the book shows about the world in play. Part 1's version plus `plate`: the painted plate the party stands on
-- in the live run (walk_world), which is where the picture on the card comes from.
create or replace function public.campaign_save_meta() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'session_no', (select (value ->> 'session')::int from public.world_flags where campaign_id = 'ashes-of-prometheus' and key = 'table'),
    'host', (select value from public.world_flags where campaign_id = 'ashes-of-prometheus' and key = 'host'),
    'party', coalesce((select jsonb_agg(value ->> 'name' order by key) from public.world_flags
                        where campaign_id = 'ashes-of-prometheus' and key like 'seated:%'), '[]'::jsonb),
    'place', (select coalesce(ps.area_name, ps.place) from public.party_situation ps
                join public.campaign_runs r on r.id = ps.campaign_run_id
               where r.status <> 'ended' order by r.run_number desc limit 1),
    'plate', (select w.plate from public.walk_world w
                join public.campaign_runs r on r.id = w.campaign_run_id
               where r.status <> 'ended' order by r.run_number desc limit 1)
  )
$$;

-- Part 1's campaign_save, now also writing `plate`, and making every NEW save the head of its own campaign.
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
    insert into public.campaign_saves (name, snapshot, session_no, place, plate, host, party, kind)
    values (coalesce(nullif(trim(p_name), ''), 'Out of the Abyss'), snap, (m ->> 'session_no')::int, m ->> 'place', m ->> 'plate', v_host, coalesce(v_party, '[]'::jsonb), 'head')
    returning id into sid;
    update public.campaign_saves set campaign_id = sid where id = sid;
  else
    update public.campaign_saves
       set snapshot = snap, saved_at = now(),
           session_no = coalesce((m ->> 'session_no')::int, session_no),
           place = coalesce(m ->> 'place', place),
           plate = coalesce(m ->> 'plate', plate),
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

-- Keep the newest five autosaves of a campaign; named checkpoints are never pruned.
create or replace function public.campaign_prune_autos(p_campaign uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.campaign_saves
   where id in (select id from public.campaign_saves
                 where campaign_id = p_campaign and kind = 'auto'
                 order by saved_at desc offset 5)
$$;

-- A checkpoint of the world in play, in the campaign in play. p_kind 'auto' (End) or 'named' (the host's Save now).
-- Refused for a Mortal campaign: it keeps one save.
create or replace function public.campaign_checkpoint(p_kind text, p_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  head public.campaign_saves;
  m jsonb := public.campaign_save_meta();
  cid uuid;
  sid uuid;
begin
  if p_kind not in ('auto', 'named') then raise exception 'A checkpoint is auto or named.'; end if;
  select * into head from public.campaign_saves where is_loaded;
  if head.id is null then raise exception 'No saved game is in play.'; end if;
  if head.mortal then raise exception 'Mortal Mode keeps one save. There are no checkpoints.'; end if;
  cid := coalesce(head.campaign_id, head.id);
  insert into public.campaign_saves (name, snapshot, session_no, place, plate, host, party, campaign_id, kind, mortal, play_seconds)
  values (coalesce(nullif(trim(p_name), ''), 'Checkpoint'), public.campaign_snapshot(),
          coalesce((m ->> 'session_no')::int, head.session_no), coalesce(m ->> 'place', head.place), coalesce(m ->> 'plate', head.plate),
          coalesce(nullif(m -> 'host', 'null'::jsonb), head.host), coalesce(nullif(m -> 'party', '[]'::jsonb), head.party),
          cid, p_kind, false, head.play_seconds)
  returning id into sid;
  perform public.campaign_prune_autos(cid);
  return sid;
end $$;

-- REWIND: put a checkpoint's world back into its campaign and play it. The campaign as it stood is kept first as an
-- autosave "Before the rewind", so a rewind can itself be undone. Refused for a Mortal campaign and while the table
-- is open. campaign_load does the swap (and, if ANOTHER campaign is in play, shelves that one first).
create or replace function public.campaign_rewind(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c public.campaign_saves;
  head public.campaign_saves;
begin
  select * into c from public.campaign_saves where id = p_id;
  if c.id is null then raise exception 'There is no save with that id.'; end if;
  if c.kind = 'head' then raise exception 'That is the campaign itself, not a checkpoint.'; end if;
  select * into head from public.campaign_saves where kind = 'head' and coalesce(campaign_id, id) = c.campaign_id;
  if head.id is null then raise exception 'That checkpoint has lost its campaign.'; end if;
  if head.mortal then raise exception 'Mortal Mode: there is no going back.'; end if;
  if exists (select 1 from public.world_flags where campaign_id = 'ashes-of-prometheus' and key = 'table'
               and value ->> 'status' in ('lobby', 'live')) then
    raise exception 'End the session and close the table before rewinding.';
  end if;

  if head.is_loaded then
    perform public.campaign_save(head.id, null, false);
    select * into head from public.campaign_saves where id = head.id;
  end if;
  insert into public.campaign_saves (name, snapshot, session_no, place, plate, host, party, campaign_id, kind, mortal, play_seconds)
  values ('Before the rewind', head.snapshot, head.session_no, head.place, head.plate, head.host, head.party, c.campaign_id, 'auto', false, head.play_seconds);

  update public.campaign_saves
     set snapshot = c.snapshot, session_no = c.session_no, place = c.place, plate = c.plate,
         host = coalesce(c.host, host), party = c.party, saved_at = now()
   where id = head.id;
  perform public.campaign_prune_autos(c.campaign_id);
  return public.campaign_load(head.id);
end $$;

revoke all on function public.campaign_prune_autos(uuid) from public, anon, authenticated;
revoke all on function public.campaign_checkpoint(text, text) from public, anon, authenticated;
revoke all on function public.campaign_rewind(uuid) from public, anon, authenticated;
grant execute on function public.campaign_checkpoint(text, text) to service_role;
grant execute on function public.campaign_rewind(uuid) to service_role;
