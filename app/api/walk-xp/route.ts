import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { levelForXp, xpToNext } from "@/lib/camp"

// /api/walk-xp — a fight won on the painted map pays its XP onto the sheets.
//
//   POST {fightId, slain: [{name, xp}], recipients: [characterId…], claimToken?}
//
// Until this route existed the map drew the "300 XP" banner, played the sting, and wrote nothing: every
// sheet stayed at 0 (Sam, 2026-10-24: "I just went up 300XP and didn't go up a level").
//
// Rules, each from a ruling already on the books:
//   - XP is shared across the active party except NPCs (Sam, 2026-09-27; lib/camp.ts `xpShares`). Only rows that
//     are player characters receive a share, and the award is split evenly and rounded down (SRD).
//   - Level-ups happen at camp, or at a node flagged `allows_level_up` (Sam, 2026-09-26 camp house rules). This
//     route never changes `level`; it reports who is now READY so the map can say so.
//
// Who may award: the DM screen (x-dm-key), or a browser holding the claim of one of the recipients — the same
// two doors /api/walk-cast uses. A fight pays once: `fightId` is written to world_flags as `xp-paid:<fightId>`
// before any sheet changes, so a retry or a double click finds it there and pays nothing.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const MAX_SLAIN = 40
const MAX_XP_EACH = 155000 // the largest single-creature XP in the SRD (CR 30); anything above is not a creature

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

type Row = { id: string; name: string; xp: number | null; level: number | null; is_player: boolean | null; character_type: string | null }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const fightId = typeof body.fightId === "string" ? body.fightId.trim().slice(0, 120) : ""
  const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
  const recipients: string[] = Array.isArray(body.recipients)
    ? [...new Set<string>(body.recipients.filter((x: unknown): x is string => typeof x === "string" && x.length > 0 && x.length < 64))].slice(0, 12)
    : []
  const slain: { name: string; xp: number }[] = Array.isArray(body.slain)
    ? body.slain.slice(0, MAX_SLAIN).map((s: { name?: unknown; xp?: unknown }) => ({
        name: String(s?.name ?? "").slice(0, 60),
        xp: Math.max(0, Math.min(MAX_XP_EACH, Math.trunc(Number(s?.xp) || 0))),
      }))
    : []
  if (!fightId || !recipients.length || !slain.length) {
    return NextResponse.json({ error: "fightId, recipients and slain are required" }, { status: 400 })
  }
  const total = slain.reduce((s, x) => s + x.xp, 0)

  const db = createAdminClient()

  // who may pay this out: the DM, or the claimed browser of someone who fought
  if (!isDm(req)) {
    if (!claimToken) return NextResponse.json({ error: "DM or a player in the fight only" }, { status: 403 })
    const { data: secrets } = await db.from("character_secrets").select("character_id, claim_token").in("character_id", recipients)
    const ok = (secrets ?? []).some((s) => s.claim_token && safeEquals(String(s.claim_token), claimToken))
    if (!ok) return NextResponse.json({ error: "DM or a player in the fight only" }, { status: 403 })
  }

  // the recipients that are player characters; NPC companions never get a share
  const { data: rowsRaw, error: readErr } = await db
    .from("characters")
    .select("id, name, xp, level, is_player, character_type")
    .in("id", recipients)
  if (readErr) return NextResponse.json({ error: "could not read the party" }, { status: 500 })
  const rows = ((rowsRaw ?? []) as Row[]).filter((r) => r.is_player === true || r.character_type === "player")
  if (!rows.length) return NextResponse.json({ ok: true, total, share: 0, paid: [], note: "no player characters in the fight" })
  const share = Math.floor(total / rows.length)

  // pay once: claim the fight before touching a sheet. An existing flag means it was already paid.
  const { data: claimed, error: flagErr } = await db
    .from("world_flags")
    .upsert(
      {
        campaign_id: CAMPAIGN,
        key: `xp-paid:${fightId}`,
        value: { total, share, recipients: rows.map((r) => r.id), slain },
        set_by: "walk-xp",
        note: `${total} XP for ${slain.map((s) => s.name).join(", ")}`,
      },
      { onConflict: "campaign_id,key", ignoreDuplicates: true },
    )
    .select("key")
  if (flagErr) return NextResponse.json({ error: "could not record the fight" }, { status: 500 })
  if (!claimed || claimed.length === 0) return NextResponse.json({ ok: true, already: true, total, share, paid: [] })

  const paid: { id: string; name: string; xp: number; level: number; ready: boolean; nextLevel: number | null }[] = []
  if (share > 0) {
    for (const r of rows) {
      const level = Math.max(1, Number(r.level) || 1)
      const xp = Math.max(0, Number(r.xp) || 0) + share
      // xp_to_next stays the bar for the CURRENT level: levelling (at camp) is what moves it
      const { error } = await db.from("characters").update({ xp, xp_to_next: xpToNext(level) }).eq("id", r.id)
      if (error) continue
      const earned = levelForXp(xp)
      paid.push({ id: r.id, name: r.name, xp, level, ready: earned > level, nextLevel: earned > level ? level + 1 : null })
    }
  }
  return NextResponse.json({ ok: true, total, share, paid })
}
