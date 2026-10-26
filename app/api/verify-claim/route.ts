import { createAdminClient } from "@/lib/supabase/admin"
import { WALK_SHEET_COLUMNS, walkSheetFromRow, type WalkSheet } from "@/lib/walk-sheet"

// Verify a character claim link (/?c=<characterId>&k=<claimToken>) SERVER-SIDE.
// The anon client must never be able to read characters.claim_token, so this
// route uses the service-role client to check the pair and returns only the
// character's public identity (id + name) on success, plus their walk sheet for
// the painted map (built from public `characters` columns). It never echoes the
// token back to the client.
export async function POST(req: Request) {
  let characterId: string | null = null
  let claimToken: string | null = null
  try {
    const body = await req.json()
    characterId = body.characterId ?? null
    claimToken = body.claimToken ?? null
  } catch {
    return Response.json({ valid: false }, { status: 400 })
  }

  if (!characterId || !claimToken) {
    return Response.json({ valid: false }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[v0] verify-claim: admin client unavailable:", e)
    return Response.json({ valid: false }, { status: 500 })
  }

  // Credentials live in character_secrets (RLS on, no policies) rather than on
  // characters, which the public anon key can read every column of.
  const { data: secretRow, error } = await admin
    .from("character_secrets")
    .select("character_id, claim_token")
    .eq("character_id", characterId)
    .maybeSingle()

  if (error) {
    console.error("[v0] verify-claim: lookup error:", error)
    return Response.json({ valid: false }, { status: 500 })
  }

  if (!secretRow || secretRow.claim_token !== claimToken) {
    return Response.json({ valid: false }, { status: 200 })
  }

  const { data: row } = await admin
    .from("characters")
    .select(WALK_SHEET_COLUMNS)
    .eq("id", characterId)
    .maybeSingle()
  const character = row as unknown as Record<string, unknown> | null

  if (!character) {
    return Response.json({ valid: false }, { status: 200 })
  }

  // The hero's own walk sheet (lib/walk-sheet.ts), the same one /api/map-stage hands the painted map for
  // a SEATED hero. A DM rehearsal (?sandbox=1) seats nobody, so a Forge hero claimed in this browser
  // walked onto the map with no sheet at all and the first thing that read its hit points threw — the
  // fade never lifted and the Underwalk stayed black (Sam's rehearsal, 2026-10-26, Gandalf's claim
  // still in his browser). Who you are now brings what you are with it. Best-effort: a sheet that
  // cannot be built leaves it off, and the map falls back as before.
  let sheet: WalkSheet | null = null
  try { sheet = walkSheetFromRow(character) } catch { sheet = null }

  // This route used to seat the character too, on every dashboard load and at /awaken, which is how
  // heroes walked into a game already under way (Sam's playtest, 2026-10-25). Seats are now taken
  // only at the staging table, while the DM has it open (/api/table, lib/table.ts). Verifying a code
  // says who you are; it no longer puts you in the game.

  return Response.json({ valid: true, character: { id: String(character.id), name: String(character.name ?? ""), sheet } }, { status: 200 })
}
