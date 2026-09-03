-- `miss` on cinematic_requests.resolution is supposed to mean exactly one
-- thing: the catalogue had nothing for this cue. PR #381 split `seen` and
-- `unrendered` out of it, and left one exception on purpose: when the
-- resolve_cinematic RPC itself fails, the route still wrote `miss`, because
-- the check constraint had no honest word for an outage and writing one early
-- would have thrown on insert and turned a failed cinematic into a failed
-- request.
--
-- This is that word. `error` is an infrastructure fact, not a catalogue fact,
-- so cinematic_gaps must not count it: an outage is not something to film.
--
-- The constraint is rebuilt with the full live vocabulary. `seen` and
-- `unrendered` reached the database on 2026-09-02 (cinematics_honest_resolution_labels)
-- without a file in this directory, so this migration is also the first place
-- the repo records them.

alter table public.cinematic_requests
  drop constraint if exists cinematic_requests_resolution_chk;

alter table public.cinematic_requests
  add constraint cinematic_requests_resolution_chk
  check (resolution = any (array[
    'exact'::text,
    'location_fallback'::text,
    'generic_fallback'::text,
    'miss'::text,
    'rejected'::text,
    'seen'::text,
    'unrendered'::text,
    'error'::text
  ]));

comment on column public.cinematic_requests.resolution is
  'exact | location_fallback | generic_fallback = a clip played, at that tier. miss = the catalogue has nothing for this cue (the only value cinematic_gaps ranks on). unrendered = the row exists but has no film yet. seen = suppressed by the once-per-character rule. rejected = the request was refused. error = resolve_cinematic itself failed; an outage, never a gap.';

-- The gaps view is dropped and recreated rather than replaced: its live column
-- list (times_awaiting_film, times_used_scene_default) is not an append onto
-- the baseline_schema definition, and CREATE OR REPLACE refuses to reorder.
-- The WHERE list is unchanged and is the point: `error` and `seen` are absent,
-- so neither an outage nor a working repeat-suppression can look like a hole.
drop view if exists public.cinematic_gaps;

create view public.cinematic_gaps as
 select req_location as location,
    req_state as state,
    req_scope as scope,
    req_kind as kind,
    count(*) as times_requested,
    count(*) filter (where resolution = 'miss'::text) as times_nothing_played,
    count(*) filter (where resolution = 'unrendered'::text) as times_awaiting_film,
    count(*) filter (where resolution = 'generic_fallback'::text) as times_fell_to_generic,
    count(*) filter (where resolution = 'location_fallback'::text) as times_used_scene_default,
    max(created_at) as last_requested
   from public.cinematic_requests
  where resolution = any (array['location_fallback'::text, 'generic_fallback'::text, 'miss'::text, 'unrendered'::text])
  group by req_location, req_state, req_scope, req_kind
  order by (count(*) filter (where resolution = 'miss'::text)) desc,
           (count(*) filter (where resolution = 'unrendered'::text)) desc,
           (count(*)) desc;

-- DROP VIEW discards the grants; restore exactly what was live before it.
-- The view stays owner-run (postgres), as it was: cinematic_requests has RLS
-- on with no policies, so a security_invoker view would read as empty.
grant select on public.cinematic_gaps to anon, authenticated, service_role;

comment on view public.cinematic_gaps is
  'Cues the catalogue could not fully answer, ranked by genuine misses. Excludes seen (repeat-suppression working) and error (resolve_cinematic outage): neither is a gap.';
