-- Cinematic character binding + state-aware generic tier.
--
-- WHY. Every clip in the catalogue was addressable only by (location, state,
-- scope, kind). That is enough for scenery -- a waterfall looks the same to
-- everyone -- but not for a character's own moment. Fifi picking her manacles
-- is hers; the bard's first song belongs to whoever is carrying the lute. With
-- no way to say so, a solo clip would resolve for whichever player happened to
-- ask first.
--
-- Two columns, in deliberate precedence order:
--   character_id    -- this clip belongs to exactly this character.
--   character_class -- this clip belongs to whoever is playing this class.
-- The class column is what keeps the catalogue alive across a death and a
-- reroll: bind the bard's song to "Bard" and the next bard inherits it.
-- Both null means the clip is not character-specific and behaves as before.
--
-- Sam's ruling, 21 Aug 2026: character_id wins when set, class is the
-- fallback, null is everyone.

begin;

-- ---------------------------------------------------------------------------
-- 1. Character binding columns
-- ---------------------------------------------------------------------------

alter table public.cinematic_clips
  add column if not exists character_id uuid
    references public.characters(id) on delete set null,
  add column if not exists character_class text;

comment on column public.cinematic_clips.character_id is
  'Binds a clip to one specific character. Beats character_class. Null = not bound to an individual.';
comment on column public.cinematic_clips.character_class is
  'Binds a clip to a class (e.g. Rogue). Used when character_id is null, so the clip survives a reroll. Null = any class.';

create index if not exists cinematic_clips_character_idx
  on public.cinematic_clips (character_id, character_class);

-- ---------------------------------------------------------------------------
-- 2. Make once-per-character enforceable by the database, not just by code
-- ---------------------------------------------------------------------------
--
-- The route already checks cinematic_views before handing a clip over, but
-- nothing stopped two concurrent requests from both passing the check and both
-- inserting. The index closes that race. recordView() already swallows insert
-- errors, so a duplicate now fails harmlessly instead of double-logging.
--
-- Verified clean against live data before adding: no (character_id, clip_id)
-- pair currently appears twice.

create unique index if not exists cinematic_views_character_clip_uniq
  on public.cinematic_views (character_id, clip_id);

-- ---------------------------------------------------------------------------
-- 3. Resolver
-- ---------------------------------------------------------------------------
--
-- DROP then CREATE, not CREATE OR REPLACE. Postgres identifies a function by
-- name *and* argument types, so adding parameters would leave the old 4-arg
-- version in place as an overload and make the PostgREST rpc() call ambiguous.
-- The new parameters are defaulted, so an un-migrated caller still resolves to
-- this function and behaves exactly as before.

drop function if exists public.resolve_cinematic(text, text, text, text);

create function public.resolve_cinematic(
  p_location        text,
  p_state           text default null,
  p_scope           text default 'party',
  p_kind            text default 'environment',
  p_character_id    uuid default null,
  p_character_class text default null
)
returns table(clip_id uuid, video_url text, resolution text)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with req as (select public.scene_key(p_location) as k),

  -- Character gate. A bound clip is invisible to anyone it is not bound to.
  -- Note the null-safety: when p_character_id is null, `c.character_id =
  -- p_character_id` is NULL rather than false, so the `is null` branch is what
  -- carries -- an anonymous seat can only ever see unbound clips. That is the
  -- behaviour we want and it is why this is written as two OR'd predicates
  -- rather than an IS NOT DISTINCT FROM.
  eligible as (
    select c.*, req.k as req_key
    from public.cinematic_clips c, req
    where c.kind = p_kind
      and c.video_url is not null
      and c.weight > 0
      and (c.scene_key = req.k or c.location = 'generic')
      and (c.character_id is null or c.character_id = p_character_id)
      and (c.character_class is null
           or lower(c.character_class) = lower(coalesce(p_character_class, '')))
  ),

  -- Four tiers now, not three. The old generic tier matched on location alone,
  -- which meant a generic clip carrying a state would fire for *any* state.
  -- Splitting it lets a state-keyed clip live at 'generic' and still be matched
  -- on its state -- needed for moments that are not tied to one room, like a
  -- rogue being overheard while sneaking.
  tiers as (
    select
      e.id, e.video_url, e.weight,
      case
        when e.scene_key = e.req_key and p_state is not null
             and e.state is not distinct from p_state       then 'exact'
        when e.scene_key = e.req_key and e.state is null     then 'location_fallback'
        when e.location = 'generic' and p_state is not null
             and e.state is not distinct from p_state       then 'generic_fallback'
        when e.location = 'generic' and e.state is null      then 'generic_fallback'
      end as res,
      case
        when e.scene_key = e.req_key and p_state is not null
             and e.state is not distinct from p_state       then 1
        when e.scene_key = e.req_key and e.state is null     then 2
        when e.location = 'generic' and p_state is not null
             and e.state is not distinct from p_state       then 3
        when e.location = 'generic' and e.state is null      then 4
      end as tier,
      -- Specificity ranking: the clip written for this person beats the one
      -- written for their class, which beats the one written for anybody.
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
    from tiers
    where tier is not null
    order by tier, char_rank, scope_rank
    limit 1
  )

  select t.id, t.video_url, t.res
  from tiers t, best
  where t.tier = best.t
    and t.char_rank = best.cr
    and t.scope_rank = best.sr
  -- Weighted random among the equally-good remainder, unchanged.
  order by random() / greatest(t.weight, 1)
  limit 1;
$function$;

-- Same lockdown as the function this replaces: service_role only. The route
-- runs it on the admin client precisely because players must not be able to
-- enumerate the catalogue.
revoke all on function public.resolve_cinematic(text, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_cinematic(text, text, text, text, uuid, text) to service_role;

commit;
