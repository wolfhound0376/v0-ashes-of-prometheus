-- Voice changes of 2026-10-09. DATA ONLY, no schema change. Already applied to
-- the live project by the session that wrote it; kept as the record.
--
-- The day's switch of the whole cast to the VO library voices was REVERTED at
-- Sam's request ("they were fine"). Net change against the morning:
--   Topsy  — unchanged (w03vWgAq1QMOM3DaeWzB, "Topsy the Gnome")
--   Turvy  — 21m00Tcm4TlvDq8ikWAM (Rachel, the generic fallback) →
--            EC7ildPUimiMSKpYBrXY ("Turvey the Dark Gnome", Sam's design)
update npc_encounters set voice_id = 'EC7ildPUimiMSKpYBrXY' where name = 'Turvy';

-- ROLLBACK
-- update npc_encounters set voice_id = '21m00Tcm4TlvDq8ikWAM' where name = 'Turvy';
