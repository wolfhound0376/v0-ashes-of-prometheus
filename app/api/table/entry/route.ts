import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { readSeated } from "@/lib/seats"
import { readTable } from "@/lib/table-store"
import { ENTRY_PREFIX, entryGoKey, entryKey, expectedOf, gate } from "@/lib/entry"

// /api/table/entry — the gate everyone steps through onto the map together (lib/entry.ts has the rule and
// Sam's words).
//
//   GET                                      → { live, session, now, goAt, why, arrived: [names], waitingFor: [names] }
//   POST { action: "arrive", characterId, claimToken }   a player's /awaken is over: they are at the gate
//   POST { action: "go" }  (DM cookie or x-dm-key)        "Bring them in now"
//
// `now` is the server's clock: every screen counts down from it, so phones with wrong clocks still step through
// together. Nothing here is secret — names only.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
type Db = ReturnType<typeof createAdminClient>

async function state(db: Db) {
  const t = await readTable(db)
  const now = Date.now()
  if (t.status !== "live") return { live: false, session: t.session, now, goAt: null, why: null, arrived: [], waitingFor: [] }
  const [seats, flags] = await Promise.all([
    readSeated(db),
    // "entry%" covers both entry:<session>:<id> and entry-go:<session>; this session's are picked out below.
    db.from("world_flags").select("key, value").eq("campaign_id", CAMPAIGN).like("key", "entry%"),
  ])
  if (flags.error) throw new Error(flags.error.message)
  const mine = `${ENTRY_PREFIX}${t.session}:`
  const arrivedAt: Record<string, number> = {}
  let forcedAt: number | null = null
  for (const f of flags.data ?? []) {
    const at = Date.parse((f.value as { at?: string } | null)?.at ?? "")
    if (!Number.isFinite(at)) continue
    if (f.key === entryGoKey(t.session)) forcedAt = at
    else if (f.key.startsWith(mine)) arrivedAt[f.key.slice(mine.length)] = at
  }
  const startedAt = t.startedAt ? Date.parse(t.startedAt) : null
  const g = gate({ expected: expectedOf(seats), arrivedAt, forcedAt, startedAt: Number.isFinite(startedAt) ? startedAt : null, now })
  return { live: true, session: t.session, now, goAt: g.goAt, why: g.why, arrived: g.arrived.map((p) => p.name), waitingFor: g.waitingFor.map((p) => p.name) }
}

export async function GET() {
  try {
    return NextResponse.json(await state(createAdminClient()))
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : ""
  let db: Db
  try { db = createAdminClient() } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }

  try {
    const t = await readTable(db)
    if (t.status !== "live") return NextResponse.json(await state(db))
    const at = new Date().toISOString()

    if (action === "go") {
      if (!isDmRequest(req, normalizeCode, safeEquals)) return NextResponse.json({ error: "Only the Dungeon Master can do that." }, { status: 403 })
      const { error } = await db.from("world_flags").upsert(
        { campaign_id: CAMPAIGN, key: entryGoKey(t.session), value: { at }, set_by: "dm", note: "The DM brought everyone onto the map" },
        { onConflict: "campaign_id,key", ignoreDuplicates: true },
      )
      if (error) throw new Error(error.message)
      return NextResponse.json(await state(db))
    }

    if (action === "arrive") {
      const characterId = typeof body.characterId === "string" ? body.characterId : ""
      const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
      const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
      if (!characterId || !claimToken || !secret || secret.claim_token !== claimToken) {
        return NextResponse.json({ error: "Your door code did not check out." }, { status: 403 })
      }
      // First arrival wins: a refresh at the gate never pushes the opening later.
      const { error } = await db.from("world_flags").upsert(
        { campaign_id: CAMPAIGN, key: entryKey(t.session, characterId), value: { at }, set_by: "seat", note: "Reached the gate onto the map" },
        { onConflict: "campaign_id,key", ignoreDuplicates: true },
      )
      if (error) throw new Error(error.message)
      return NextResponse.json(await state(db))
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 })
  } catch (e) {
    console.error("[table/entry]", action, e)
    return NextResponse.json({ error: "The gate could not be reached." }, { status: 500 })
  }
}
