-- Per-character scene-stage framing (Layer 2).
--
-- The stage figure was sized purely off the source clip's frame: `h-[88%]` of
-- the scene panel, `object-contain`. That makes a character's apparent size an
-- accident of how their idle loop happened to be framed. Fifi's loop is a
-- waist-up crop that fills its frame, so she reads full-size; Samson's is a
-- full-body shot with ~9% empty padding under his feet inside a tall 404x720
-- frame, so he rendered small AND floating above the ground line.
--
-- These two numbers let the DM set each character's stage height and where
-- their feet sit, without re-cutting the art.
--
--   stage_scale     multiplier on the base stage height (1 = unchanged)
--   stage_offset_y  percent of the figure's own height to push DOWN, used to
--                   bury transparent padding below the bottom of the panel

alter table public.characters
  add column if not exists stage_scale numeric not null default 1,
  add column if not exists stage_offset_y numeric not null default 0;

comment on column public.characters.stage_scale is
  'Scene-stage figure height multiplier. 1 = the default 88% of the panel. Clamped to 0.2-3 in the app.';
comment on column public.characters.stage_offset_y is
  'Percent of the figure''s own height to translate downward so the subject sits on the ground line. Clamped to -50..50 in the app.';

-- Measured from the alpha bounding boxes of the live idle loops on 2026-08-18.
-- Fifi is the reference framing (waist-up, flush to frame edges).
update public.characters set stage_scale = 1.35, stage_offset_y = 9.2 where name = 'Samson';
update public.characters set stage_scale = 0.55, stage_offset_y = 0    where name = 'Kenta';
