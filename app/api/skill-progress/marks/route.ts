// The learning mark — docs/claude_Earned_Proficiency.md §6.
//
//   GET ?characterId=<uuid>  → { skills: ["animal_handling", "stealth"] }
//
// Which skills have ANY progress on the earned-proficiency ledger and are not
// yet awarded. That is all the sheet is allowed to know: a presence, not a
// meter. No count, no path, no "3 of 8" - the tally stays hidden exactly as
// gravity does. Sam, 2026-09-26: the mark is visible; the numbers are not.
//
// Read-only. The ledger is service-role only (RLS on, no policies), so the
// sheet cannot read it directly; this route reads it and hands back only the
// skill names. Not claim-gated: the mark says nothing a player at the table
// would not already have seen happen.

import { createAdminClient } from "@/lib/supabase/admin"
import { skillsInProgress, type LedgerRow } from "@/lib/skill-progress"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(req: Request) {
  const characterId = new URL(req.url).searchParams.get("characterId")
  if (!characterId || !UUID.test(characterId)) {
    return Response.json({ error: "characterId required" }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error("[skill-marks] admin client unavailable:", error)
    return Response.json({ error: "server_unavailable" }, { status: 500 })
  }

  // Only the columns skillsInProgress needs. Amounts, DCs, days and teachers
  // never leave the server.
  const { data, error } = await admin
    .from("skill_progress")
    .select("character_id, skill, kind")
    .eq("character_id", characterId)
  if (error) {
    console.error("[skill-marks] ledger read failed:", error.message)
    return Response.json({ error: "ledger_unavailable" }, { status: 500 })
  }

  const rows = ((data ?? []) as Pick<LedgerRow, "character_id" | "skill" | "kind">[]).map((r) => ({
    ...r,
    amount: 1,
    dc: null,
    stake_key: null,
    teacher_id: null,
    campaign_day: 0,
    roll_request_id: null,
  })) as LedgerRow[]

  return Response.json({ skills: skillsInProgress(rows, characterId) })
}
