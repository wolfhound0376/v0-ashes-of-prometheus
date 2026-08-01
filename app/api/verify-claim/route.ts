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

  const { data, error } = await admin
    .from("characters")
    .select("id, name, claim_token")
    .eq("id", characterId)
    .maybeSingle()

  if (error) {
    console.error("[v0] verify-claim: lookup error:", error)
    return Response.json({ valid: false }, { status: 500 })
  }

  if (!data || data.claim_token !== claimToken) {
    return Response.json({ valid: false }, { status: 200 })
  }

  return Response.json({ valid: true, character: { id: data.id, name: data.name } }, { status: 200 })
}
