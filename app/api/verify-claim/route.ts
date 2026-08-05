import { createAdminClient } from "@/lib/supabase/admin"

// Verify a character claim link (/?c=<characterId>&k=<claimToken>) SERVER-SIDE.
// The anon client must never be able to read characters.claim_token, so this
// route uses the service-role client to check the pair and returns only the
// character's public identity (id + name) on success. It never echoes the
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

  const { data: character } = await admin
    .from("characters")
    .select("id, name")
    .eq("id", characterId)
    .maybeSingle()

  if (!character) {
    return Response.json({ valid: false }, { status: 200 })
  }

  return Response.json({ valid: true, character: { id: character.id, name: character.name } }, { status: 200 })
}
