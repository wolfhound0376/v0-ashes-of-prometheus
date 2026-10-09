-- Voice changes of 2026-10-09. DATA ONLY, no schema change. Already applied to
-- the live project by the session that wrote it; kept as the record.
--
-- The day's switch of the whole cast to the VO library voices was REVERTED at
-- Sam's request ("they were fine"). Net change against the morning:
--   Topsy  — unchanged (w03vWgAq1QMOM3DaeWzB, "Topsy the Gnome")
--   Turvy  — 21m00Tcm4TlvDq8ikWAM (Rachel, the generic fallback) →
--            PpLQnDiYSGWjjPKTRC4C ("Turvey the Deep Gnome V2.0", Sam's design;
--            replaced his first design, EC7ildPUimiMSKpYBrXY, the same day)
update npc_encounters set voice_id = 'PpLQnDiYSGWjjPKTRC4C' where name = 'Turvy';

-- ROLLBACK
-- update npc_encounters set voice_id = '21m00Tcm4TlvDq8ikWAM' where name = 'Turvy';
