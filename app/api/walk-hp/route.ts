import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { woundsToWrite } from "@/lib/walk-hp"

// POST /api/walk-hp — the painted map writes a hero's hit points onto their sheet.
//
// Sam, 2026-11-25: "Stabilizing and getting picked up only returns you to 1HP. HP and your level should maintain it's
// state until you've rested (and used hit dice), healed yourself or been healed, or a level up that raises your HP
// according to DND 5E rules."
//
// What was wrong: the map kept a fight's hit points on the page only. Nothing wrote them to `characters.hp_current`,
// so the moment a fight ended the sheet still said what it said before it: a hero dropped to 0 and helped up "at 1 hit
// point" read 8/8 on their chips, short-rested from 8, levelled from 8, and began the next fight at full
// (fighterFor started every hero at their maximum). The walk log of 2026-11-25 shows it: 22:03 "Fifi is still on the
// floor", 22:06:34 the server's short rest answers "Fifi: 8/8", 22:06:39 "Kenta gets Fifi back on their feet. 1 hit
// point."
//
// Now the sheet is the one copy between fights. The map sends what a fight left each hero with when it ends, the
// 1 hit point of a hero helped up, and a potion drunk outside a fight; every fight starts a hero from the sheet.
//
// Body: {set: [{characterId, hp}], why?, claimId?, claimToken?}. Player characters only; hp is held to 0..hp_max; a row
// already at that number is not written. Who may call: the DM screen (x-dm-key) or a browser holding a seated hero's
// claim — the same two doors as /api/walk-hazard.

export const dynamic = "force-dynamic"

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

type Row = { id: string; name: string; hp_current: number | null; hp_max: number | null; is_player: boolean | null; character_type: string | null }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const asked = woundsToWrite(body?.set)
  if (!asked.length) return NextResponse.json({ ok: true, written: 0, characters: [] })

  const db = createAdminClient()
  if (!isDm(req)) {
    const claimId = String(body?.claimId ?? "").slice(0, 64), claimToken = typeof body?.claimToken === "string" ? body.claimToken : ""
    if (!claimId || !claimToken) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", claimId).maybeSingle()
    if (!secret?.claim_token || !safeEquals(String(secret.claim_token), claimToken)) {
      return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    }
  }

  const { data: rows, error } = await db.from("characters").select("id,name,hp_current,hp_max,is_player,character_type").in("id", asked.map((a) => a.id))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const out: { id: string; name: string; hp: number; hpMax: number; was: number | null }[] = []
  for (const r of (rows ?? []) as Row[]) {
    if (!(r.is_player === true || r.character_type === "player")) continue
    const want = asked.find((a) => a.id === r.id)
    if (!want) continue
    const max = Number(r.hp_max) || 0
    const hp = Math.max(0, max > 0 ? Math.min(max, want.hp) : want.hp)
    const was = r.hp_current == null ? null : Number(r.hp_current)
    if (was !== hp) {
      const { error: wErr } = await db.from("characters").update({ hp_current: hp, updated_at: new Date().toISOString() }).eq("id", r.id)
      if (wErr) continue
    }
    out.push({ id: r.id, name: r.name, hp, hpMax: max, was })
  }
  return NextResponse.json({ ok: true, written: out.filter((c) => c.was !== c.hp).length, characters: out })
}
