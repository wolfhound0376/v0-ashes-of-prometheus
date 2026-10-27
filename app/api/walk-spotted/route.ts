import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { startCombatFlag, COMBAT_FLAG } from "@/lib/combat-flag"

// POST /api/walk-spotted — guards on the painted map have seen someone, and they attack.
//
// Sam, 2026-10-26: "If a guard spots you they attack you. If guards spot you on any plate they all attack you on the
// spot unless you are escorted." The map decides that a guard has seen a hero (view cone, line of sight, Stealth); in
// the game the map never opens a fight on its own — every screen opens the fight it finds on the shared combat flag
// (lib/combat-flag.ts, the same flag Malachar's [COMBAT_START:] writes). So the map asks this route to write it, and
// every seat at the table — not just the one whose hero was seen — rolls into the same fight.
//
// Who may call it: the DM screen (x-dm-key), or a browser holding a seated hero's claim. A fight already on the flag is
// never overwritten. The special characters (Ilvara, Jorlan, the surgeon) do not come here: they talk first, and
// Malachar decides from the conversation whether to call [COMBAT_START:].

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const MAX_FOES = 12

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const foes = (Array.isArray(body.foes) ? body.foes : [])
    .slice(0, MAX_FOES)
    .map((f: { name?: unknown; aliases?: unknown; hp?: unknown; hpMax?: unknown }) => ({
      name: clip(f?.name, 60),
      aliases: Array.isArray(f?.aliases) ? f.aliases.slice(0, 4).map((a: unknown) => clip(a, 60)).filter(Boolean) : [],
      hp: Number.isFinite(Number(f?.hp)) ? Math.trunc(Number(f.hp)) : null,
      hpMax: Number.isFinite(Number(f?.hpMax)) ? Math.trunc(Number(f.hpMax)) : null,
    }))
    .filter((f: { name: string }) => f.name)
  if (!foes.length) return NextResponse.json({ error: "foes are required" }, { status: 400 })

  const db = createAdminClient()

  if (!isDm(req)) {
    const claimId = clip(body.claimId, 64), claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
    if (!claimId || !claimToken) return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", claimId).maybeSingle()
    if (!secret?.claim_token || !safeEquals(String(secret.claim_token), claimToken)) {
      return NextResponse.json({ error: "DM or a seated player only" }, { status: 403 })
    }
  }

  // one fight at a time: a flag already up (Malachar's, or another seat's spotting a moment ago) stands
  const { data: existing } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", COMBAT_FLAG).maybeSingle()
  if (existing?.value && (existing.value as { status?: string }).status === "active") {
    return NextResponse.json({ ok: true, already: true, flag: existing.value })
  }

  await startCombatFlag(db, {
    foes,
    area: clip(body.area, 80) || null,
    startedBy: clip(body.seenHero, 60) || null,
    label: clip(body.label, 160) || "The guards have seen you.",
  })
  const { data: now } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", COMBAT_FLAG).maybeSingle()
  return NextResponse.json({ ok: !!now?.value, flag: now?.value ?? null })
}
