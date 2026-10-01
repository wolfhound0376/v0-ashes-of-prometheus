// Applying time to a character's inebriation, server-side. Shared by the pack
// read (which sobers you lazily, on look) and the quaff write.
import type { createAdminClient } from "@/lib/supabase/admin"
import { normalizeConditions } from "@/lib/conditions"
import { gameNowMinutes } from "@/lib/game-now"
import { conditionsFor, currentLevel, isInebriationRecord, sober, type InebriationRecord } from "@/lib/inebriation"

type Db = ReturnType<typeof createAdminClient>

export interface NowState {
  record: InebriationRecord
  conditions: string[]
  gameNow: number | null
}

/** The record as it stands now. A sheet that shows a level with no record
 *  (set by hand, or before the clock existed) starts its clock now. */
export async function inebriationNow(
  db: Db,
  character: { conditions?: unknown; inebriation?: unknown },
): Promise<NowState> {
  const gameNow = await gameNowMinutes(db)
  const conditions = normalizeConditions(character.conditions)
  const nowIso = new Date().toISOString()
  const rec: InebriationRecord = isInebriationRecord(character.inebriation)
    ? character.inebriation
    : { level: currentLevel(conditions), since: nowIso, since_game: gameNow }
  const now = sober(rec, new Date(), gameNow)
  return { record: now, conditions: conditionsFor(conditions, now), gameNow }
}

/** Write the sobered state back when time has changed it. Best-effort. */
export async function persistIfChanged(
  db: Db,
  characterId: string,
  before: { conditions?: unknown; inebriation?: unknown },
  now: NowState,
): Promise<void> {
  const prev = normalizeConditions(before.conditions)
  const changedConditions = JSON.stringify(prev) !== JSON.stringify(now.conditions)
  const changedRecord = JSON.stringify(before.inebriation ?? null) !== JSON.stringify(now.record)
  const idle = now.record.level === 0 && !now.record.hangover_until && !before.inebriation
  if (idle || (!changedConditions && !changedRecord)) return
  await db
    .from("characters")
    .update({ conditions: now.conditions, inebriation: now.record.level === 0 && !now.record.hangover_until ? null : now.record })
    .eq("id", characterId)
}
