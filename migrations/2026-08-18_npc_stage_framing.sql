-- Per-NPC framing for the head window beside the DM narration.
--
-- Companion to 2026-08-18_character_stage_framing.sql. Same problem, second
-- window: an NPC whose idle loop is a face close-up fills the box, and one
-- whose loop is a whole goblin standing in a cavern renders as a speck. The
-- window is filled edge-to-edge (`inset-0 object-contain object-top`), so here
-- the knobs drive a transform scaled about TOP CENTRE — zooming into the face
-- and pushing the body out of the bottom of the frame.
--
-- NPC identity is by NAME (every row sharing a name is the same character), so
-- the DM panel writes these to every row with that name, exactly like face_url
-- and voice_id.

alter table public.npc_encounters
  add column if not exists stage_scale numeric not null default 1,
  add column if not exists stage_offset_y numeric not null default 0;

comment on column public.npc_encounters.stage_scale is
  'Head-window zoom, applied as a CSS transform about top centre. 1 = untouched. Clamped to 0.2-3 in the app.';
comment on column public.npc_encounters.stage_offset_y is
  'Percent of the element height to translate vertically in the head window; negative lifts the subject. Clamped to -50..50 in the app.';

-- Measured on 2026-08-18 against the live loops in the real 190x177 window.
-- Face close-ups (Buppido, Ront, Shuushar) already fill it and stay at 1.
--   Jimjar          480x720 — letterboxed left/right, face in the top half
--   Malachar        720x404 — a full figure adrift in a wide dark frame
--   Prince Derendil 720x404 — wide face shot with an empty band beneath
--   Turvy           720x404 — same wide framing as Prince Derendil
update public.npc_encounters set stage_scale = 1.6  where name = 'Jimjar';
update public.npc_encounters set stage_scale = 1.9  where name = 'Malachar';
update public.npc_encounters set stage_scale = 1.66 where name = 'Prince Derendil';
update public.npc_encounters set stage_scale = 1.66 where name = 'Turvy';
