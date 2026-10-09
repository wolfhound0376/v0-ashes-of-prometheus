-- Voice changes of 2026-10-09. DATA ONLY, no schema change. Already applied to
-- the live project by the session that wrote it; kept as the record.
--
-- The day's switch of the whole cast to the VO library voices was REVERTED at
-- Sam's request ("they were fine"). Net change against the morning:
--   Topsy  — unchanged (w03vWgAq1QMOM3DaeWzB, "Topsy the Gnome")
--   Turvy  — 21m00Tcm4TlvDq8ikWAM (Rachel, the generic fallback) →
--            YewO1hdC7MZ2oDF0K8hX ("Turvey Clone": an Instant Voice Clone of
--            Sam's "Turvey the Deep Gnome V2.0" design preview. Earlier the
--            same day: EC7ildPUimiMSKpYBrXY, then PpLQnDiYSGWjjPKTRC4C.)
update npc_encounters set voice_id = 'YewO1hdC7MZ2oDF0K8hX' where name = 'Turvy';

-- ROLLBACK
-- update npc_encounters set voice_id = '21m00Tcm4TlvDq8ikWAM' where name = 'Turvy';
