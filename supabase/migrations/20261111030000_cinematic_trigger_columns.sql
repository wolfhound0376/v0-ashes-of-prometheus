-- Cinematic triggers: one row is the whole trigger (Sam, 2026-11-10: "go on the pipeline").
-- Design of record: project doc claude/Cinematic_Triggers_Revamp_2026-11-10.md, section 3.
--
-- ADDITIVE. Four new columns on cinematic_clips, a backfill of the 27 live rows, and one extra line in
-- resolve_cinematic() so a retired film can never be served. Nothing is dropped or deleted.
--
--   moment    one plain sentence: WHEN this film fires. Malachar reads it beside the cue name.
--   fired_by  who may fire it: malachar | engine | map | look | system | dm
--   plate     the Underwalk plate it belongs to (party_situation.sub_location, e.g. node-11-slave-pen);
--             null = anywhere in the scene
--   retired   true = kept on file, never offered and never served
--
-- "Awaiting film" is NOT stored: it is simply video_url is null, so it can never disagree with the upload.

alter table public.cinematic_clips
  add column if not exists moment   text,
  add column if not exists fired_by text    not null default 'malachar',
  add column if not exists plate    text,
  add column if not exists retired  boolean not null default false;

alter table public.cinematic_clips drop constraint if exists cinematic_clips_fired_by_check;
alter table public.cinematic_clips add constraint cinematic_clips_fired_by_check
  check (fired_by in ('malachar', 'engine', 'map', 'look', 'system', 'dm'));

-- ── who fires what (mirrors lib/cinematic-doors.ts as merged in PR #1252) ──
update public.cinematic_clips set fired_by = 'engine'
 where state in ('notice-success', 'navigation-fail', 'forced-march-fail', 'alchemy-critical-failure');
update public.cinematic_clips set fired_by = 'map', plate = 'node-11-slave-pen'
 where state in ('count-guards', 'ward-sigil', 'fungus-ormu-moss', 'fungus-timmask', 'fungus-waterorb');
update public.cinematic_clips set fired_by = 'look'   where kind = 'environment';
update public.cinematic_clips set fired_by = 'system' where location = 'hero-intro';

-- ── the moment, in a sentence (Claude's wording from the cue and file names; Sam edits in DM Assets) ──
update public.cinematic_clips set moment = 'The party''s passive Perception finds something at a road node.' where state = 'notice-success';
update public.cinematic_clips set moment = 'The navigator loses the way on the road and the party wanders.' where state = 'navigation-fail';
update public.cinematic_clips set moment = 'Someone gains a level of exhaustion marching past eight hours.' where state = 'forced-march-fail';
update public.cinematic_clips set moment = 'A brew at the alchemy bench fails critically.' where state = 'alchemy-critical-failure';
update public.cinematic_clips set moment = 'A hero at the pen gate counts the guards and the Investigation roll is good enough.' where state = 'count-guards';
update public.cinematic_clips set moment = 'A caster successfully reads the ward sigil in the pen (Arcana, rolled on the map).' where state = 'ward-sigil';
update public.cinematic_clips set moment = 'A hero identifies this pen mushroom for the first time.' where state like 'fungus-%';
update public.cinematic_clips set moment = 'A player looks around this place for the first time.' where kind = 'environment';
update public.cinematic_clips set moment = 'This hero enters the story for the first time in a run.' where location = 'hero-intro';
update public.cinematic_clips set moment = 'The bard performs a song and it lands: the performance succeeded.' where state = 'bard-song-success';
update public.cinematic_clips set moment = 'A gray ooze comes into the slave pen where the party is.', plate = 'node-11-slave-pen' where state = 'gray-ooze-arrives';
update public.cinematic_clips set moment = 'Fifi picks a lock and it opens: the check succeeded.' where state = 'lockpick-success';
update public.cinematic_clips set moment = 'Fifi sits and grinds a shard into a makeshift blade.' where state = 'sharpen-shard';
update public.cinematic_clips set moment = 'Fifi falls asleep and you narrate her nightmare.' where state = 'sleep-nightmare';
update public.cinematic_clips set moment = 'Fifi sneaks off alone, fails the Stealth check and is noticed.' where state = 'stealth-fail-solo';

-- ── a retired film is never served: the live function, unchanged but for the one marked line ──
create or replace function public.resolve_cinematic(
  p_location text, p_state text default null, p_scope text default 'party', p_kind text default 'environment',
  p_character_id uuid default null, p_character_class text default null)
 returns table(clip_id uuid, video_url text, resolution text)
 language sql stable security definer
 set search_path to 'public'
as $function$
  with req as (select public.scene_key(p_location) as k),
  eligible as (
    select c.*, req.k as req_key
    from public.cinematic_clips c, req
    where c.kind = p_kind
      and c.video_url is not null
      and c.weight > 0
      and not c.retired                                   -- NEW 2026-11-10
      and (c.scene_key = req.k or c.location = 'generic')
      and (c.character_id is null or c.character_id = p_character_id)
      and (c.character_class is null
           or lower(c.character_class) = lower(coalesce(p_character_class, '')))
  ),
  tiers as (
    select
      e.id, e.video_url, e.weight,
      case
        when e.scene_key = e.req_key
             and e.state is not distinct from p_state    then 'exact'
        when e.scene_key = e.req_key and e.state is null then 'location_fallback'
        when e.location = 'generic'
             and e.state is not distinct from p_state    then 'generic_fallback'
        when e.location = 'generic' and e.state is null   then 'generic_fallback'
      end as res,
      case
        when e.scene_key = e.req_key
             and e.state is not distinct from p_state    then 1
        when e.scene_key = e.req_key and e.state is null then 2
        when e.location = 'generic'
             and e.state is not distinct from p_state    then 3
        when e.location = 'generic' and e.state is null   then 4
      end as tier,
      case
        when e.character_id is not null    then 0
        when e.character_class is not null then 1
        else 2
      end as char_rank,
      case when e.scope = p_scope then 0 else 1 end as scope_rank
    from eligible e
  ),
  best as (
    select tier as t, char_rank as cr, scope_rank as sr
    from tiers where tier is not null
    order by tier, char_rank, scope_rank limit 1
  )
  select t.id, t.video_url, t.res
  from tiers t, best
  where t.tier = best.t and t.char_rank = best.cr and t.scope_rank = best.sr
  order by random() / greatest(t.weight, 1)
  limit 1;
$function$;
