-- Migration: Shared, single-truth NPC encounters
-- ============================================================================
-- IMPORTANT: Migrations do NOT run automatically on deploy. Apply this manually
-- in the Supabase SQL Editor.
-- ============================================================================
--
-- BUG A fix (server-side): the chat route now UPSERTS an encounter by name
-- (case-insensitive) onto a single SHARED row instead of inserting one row per
-- character. This index enforces that invariant at the database level so two
-- active rows can never again exist for the same NPC name.
--
-- A partial UNIQUE index on lower(name) restricted to active rows guarantees at
-- most one active encounter per creature name across the whole table, while
-- still allowing historical/inactive rows to accumulate harmlessly.

CREATE UNIQUE INDEX IF NOT EXISTS npc_encounters_active_name_unique
  ON npc_encounters (lower(name))
  WHERE is_active = true;

-- OPTIONAL (session-scoped variant): if you later want encounters partitioned
-- per game session rather than globally, add a session_id column and swap the
-- index above for a composite one. Left commented out; the global index above
-- matches the current "one shared world" behaviour.
--
-- ALTER TABLE npc_encounters ADD COLUMN IF NOT EXISTS session_id uuid;
-- DROP INDEX IF EXISTS npc_encounters_active_name_unique;
-- CREATE UNIQUE INDEX IF NOT EXISTS npc_encounters_active_session_name_unique
--   ON npc_encounters (session_id, lower(name))
--   WHERE is_active = true;

-- ============================================================================
-- DESTRUCTIVE CLEANUP (run separately, and only with explicit sign-off):
-- purge the pre-existing duplicate rows created before this fix. Keeps the most
-- recently updated row per name and deletes the rest. Review before running.
-- ============================================================================
--
-- WITH ranked AS (
--   SELECT id,
--          row_number() OVER (
--            PARTITION BY lower(name)
--            ORDER BY is_active DESC, updated_at DESC NULLS LAST, created_at DESC
--          ) AS rn
--   FROM npc_encounters
-- )
-- DELETE FROM npc_encounters
-- WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
