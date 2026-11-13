import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { readSeated } from "@/lib/seats"
import { hpAfterWardShock } from "@/lib/ward-shock"

// /api/walk-ward — the pen ward bites a hero who botched the cut (Sam, 2026-11-12: "If it shocks you after you fail
// … you blackout and your HP drops to one").
//
//   POST {characterId, claimToken?}
//
// The painted map rolls the cut and plays the blackout, but it does not own hit points: the walk only READS hp, and
// the sheet is where the dashboard, the camp and Malachar keep it. So the drop to 1 is written here, on the
// character's row, by the rule in lib/ward-shock (never heals, never kills).
//
// Who may call it: the DM screen (x-dm-key) or a browser holding the claim of a seated player, the same two doors
// /api/walk-rest uses. The hero bitten must be a player character at the table.

export const dynamic = "force-dynamic"

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const characterId = typeof body.characterId === "string" ? body.characterId : ""
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })

  const db = createAdminClient()
  const seated = (await readSeated(db)).filter((s) => !s.away)
  const seatedIds = seated.map((s) => s.id)

  if (!isDm(req)) {
    if (!claimToken || !seatedIds.length) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    const { data: secrets } = await db.from("character_secrets").select("character_id, claim_token").in("character_id", seatedIds)
    const ok = (secrets ?? []).some((s) => s.claim_token && safeEquals(String(s.claim_token), claimToken))
    if (!ok) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
  }

  const { data: row, error: readErr } = await db.from("characters").select("id,name,hp_current,is_player").eq("id", characterId).limit(1).maybeSingle()
  if (readErr) return NextResponse.json({ error: "could not read the character" }, { status: 500 })
  if (!row || !row.is_player) return NextResponse.json({ error: "no such hero" }, { status: 404 })
  if (seatedIds.length && !seatedIds.includes(String(row.id))) return NextResponse.json({ error: "that hero is not at the table" }, { status: 400 })

  const before = Math.max(0, Number(row.hp_current ?? 0))
  const after = hpAfterWardShock(before)
  if (after !== before) {
    const { error } = await db.from("characters").update({ hp_current: after, updated_at: new Date().toISOString() }).eq("id", row.id)
    if (error) return NextResponse.json({ error: "could not write hit points" }, { status: 500 })
  }
  await db.from("dialogue").insert({ speaker: "System", speaker_type: "system", channel: "dm", text: `*The pen ward bites ${String(row.name)}: out cold, ${after} hit point${after === 1 ? "" : "s"} left (was ${before}).*` }).then(() => {}, () => {})
  return NextResponse.json({ ok: true, hpBefore: before, hp: after })
}
