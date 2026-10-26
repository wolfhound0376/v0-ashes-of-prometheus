import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { spendInspiration, type SpendDb } from "@/lib/heroic-inspiration"

// /api/inspiration/spend — spend one Heroic Inspiration (lib/heroic-inspiration.ts).
//
//   POST { characterId, claimToken? } → { ok: true } | { error } with 403 / 409
//
// The reroll itself happens in the browser on the shared 3D dice, like every roll; this route only
// spends the Inspiration, once. Who may spend it: the player holding that character's claim (checked
// exactly as /api/chat and /api/fortune-roll check it), or the DM. The update matches only a row that
// still holds Inspiration, so a double press spends it once and the second press gets 409.

export const dynamic = "force-dynamic"

export async function POST(req: Request) {
  let body: { characterId?: string; claimToken?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }) }
  const characterId = typeof body.characterId === "string" ? body.characterId : ""
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })

  let db
  try { db = createAdminClient() } catch { return NextResponse.json({ error: "server" }, { status: 500 }) }

  let authorised = isDmRequest(req, normalizeCode, safeEquals)
  if (!authorised && claimToken) {
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
    authorised = Boolean(secret && secret.claim_token === claimToken)
  }

  const r = await spendInspiration(db as unknown as SpendDb, characterId, authorised)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true })
}
