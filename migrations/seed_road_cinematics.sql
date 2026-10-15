-- Road check cinematics (Sam approved 2026-10-14, Road Clips Review).
--
-- Three GENERIC clips, one per road check that lib/check-cue.ts can emit. They
-- sit at location 'generic' on purpose: resolve_cinematic falls back there when
-- a node has no clip of its own, so every marker on the Underdark road is
-- covered by these three without a row per node.
--
-- No faces in any of them, so they fit whatever party is walking. Silent — the
-- house rule, Tabletop Audio owns sound.
--
-- Paste into Supabase -> SQL Editor. Does not run on deploy.
-- Before this is applied the checks still fire their cues; the catalogue simply
-- answers "nothing filmed here" and the march stays silent.

insert into public.cinematic_clips (location, state, scope, kind, video_url)
values
  ('generic', 'notice-success',    'party', 'action',
   'https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/cinematics/road-notice-success.mp4'),
  ('generic', 'navigation-fail',   'party', 'action',
   'https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/cinematics/road-navigation-fail.mp4'),
  ('generic', 'forced-march-fail', 'party', 'action',
   'https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/cinematics/road-forced-march-fail.mp4');

-- Check it took:
--   select location, state, scope, kind, video_url from public.cinematic_clips
--   where location = 'generic' order by state;
