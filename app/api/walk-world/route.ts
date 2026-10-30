import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { readSeated } from "@/lib/seats"
import { cleanPatch, emptyWorld, mayWriteHero, worldDigest, type Hero, type Seat, type SyncStatus, type WorldRow } from "@/lib/walk-world"

// /api/walk-world — ONE WORLD for the Underwalk (lib/walk-world.ts, table walk_world).
//
//   GET                      the active run's world, its fingerprint, the server clock, and the public realtime
//                            settings the map uses to hear changes the moment they land.
//   POST {op:"patch", patch} a change from a map: hero moves, a plate change, map state. The DM (x-dm-key or the
//                            DM cookie) may change anything; a player (their own characterId + claimToken) may
//                            change the shared state and the plate, and move only the heroes they drive
//                            (lib/walk-world.ts driverOf) — never another connected player's hero.
//   POST {op:"beat", digest, version, slug, status}
//                            the heartbeat. Records this screen as connected and what it believes, and answers with
//                            the server's fingerprint — plus the whole world when this screen is behind. This is the
//                            failsafe: a screen that disagrees twice running snaps to what comes back here.
//
// Why: Sam, 2026-10-25 — Fifi and Gandalf at the same table were walking two different Velkynvelves, because the
// map kept its world in each tab. Writes go only through here (service role); browsers read the row directly.

export const dynamic = "force-dynamic"

const CAMPAIGN_ID = "abyss"
type Db = ReturnType<typeof createAdminClient>

// A verified claim is good for ten minutes in this instance, so a walking hero does not cost a lookup per step.
const claimCache = new Map<string, { token: string; until: number }>()

async function caller(req: NextRequest, db: Db, body: Record<string, unknown>): Promise<{ key: string; dm: boolean } | null> {
  if (isDmRequest(req, normalizeCode, safeEquals)) return { key: "dm", dm: true }
  const id = typeof body.characterId === "string" ? body.characterId : ""
  const token = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!id || !token) return null
  const hit = claimCache.get(id)
  if (hit && hit.token === token && hit.until > Date.now()) return { key: id, dm: false }
  const { data } = await db.from("character_secrets").select("claim_token").eq("character_id", id).maybeSingle()
  if (!data || data.claim_token !== token) return null
  claimCache.set(id, { token, until: Date.now() + 10 * 60 * 1000 })
  return { key: id, dm: false }
}

// Which chair each hero sits in (decides who drives an empty chair's hero). Read at most every 20 s per instance:
// a heartbeat arrives every 2.5 s from every screen.
let seatCache: { at: number; seats: Map<string, number | null> } | null = null
async function seatNumberOf(db: Db, characterId: string): Promise<number | null> {
  if (!seatCache || Date.now() - seatCache.at > 20000) {
    const seated = await readSeated(db).catch(() => [])
    seatCache = { at: Date.now(), seats: new Map(seated.map((s) => [s.id, typeof s.seat === "number" ? s.seat : null])) }
  }
  return seatCache.seats.get(characterId) ?? null
}

async function activeRunId(db: Db): Promise<string | null> {
  const { data } = await db.from("campaign_runs").select("id").eq("campaign_id", CAMPAIGN_ID).neq("status", "ended")
    .order("run_number", { ascending: false }).limit(1).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function readWorld(db: Db, runId: string): Promise<WorldRow> {
  const { data, error } = await db.from("walk_world").select("*").eq("campaign_run_id", runId).maybeSingle()
  if (error) throw new Error(error.message)
  return (data as WorldRow | null) ?? emptyWorld(runId)
}

async function apply(db: Db, runId: string, patch: Record<string, unknown>, by: string): Promise<WorldRow> {
  const { data, error } = await db.rpc("walk_world_apply", { p_run: runId, p_patch: patch, p_by: by })
  if (error) throw new Error(error.message)
  return data as WorldRow
}

function answer(w: WorldRow, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ version: Number(w.version) || 0, digest: worldDigest(w.plate, w.state), now: Date.now(), seats: w.seats || {}, ...extra })
}

export async function GET() {
  try {
    const db = createAdminClient()
    const runId = await activeRunId(db)
    if (!runId) return NextResponse.json({ error: "no active run" }, { status: 404 })
    const w = await readWorld(db, runId)
    return answer(w, {
      // WHICH RUN THIS IS. A restart opens a new campaign_run (lib/restart-campaign.ts) and every screen must leave
      // the world that just ended behind: the painted map already reloads on a run change (/api/map-stage), and the
      // dashboard now follows the same signal from here rather than carrying a wiped campaign on screen.
      run: runId,
      world: w,
      realtime: { url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null },
    })
  } catch (e) {
    // the table not being there yet (migration unapplied) lands here: the map stays on its old single-screen
    // behaviour and its sync light says so, rather than breaking the game
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 })
  }
}

const STATUSES: SyncStatus[] = ["in-step", "catching-up", "out-of-touch", "fight-unshared"]

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const db = createAdminClient()
    const who = await caller(req, db, body)
    if (!who) return NextResponse.json({ error: "DM key or your own claim required" }, { status: 403 })
    const runId = await activeRunId(db)
    if (!runId) return NextResponse.json({ error: "no active run" }, { status: 404 })

    if (body.op === "beat") {
      let seatNo: number | null = null
      if (!who.dm) seatNo = await seatNumberOf(db, who.key)
      const seat: Seat = {
        at: Date.now(),
        slug: typeof body.slug === "string" ? body.slug.slice(0, 48) : null,
        cid: who.dm ? null : who.key,
        dm: who.dm,
        seat: seatNo,
        digest: typeof body.digest === "string" ? body.digest.slice(0, 16) : "",
        version: typeof body.version === "number" ? body.version : 0,
        status: STATUSES.includes(body.status as SyncStatus) ? (body.status as SyncStatus) : "in-step",
      }
      const w = await apply(db, runId, { seats: { [who.key]: seat } }, who.key)
      const behind = (Number(body.version) || 0) < (Number(w.version) || 0) || body.full === true
      return answer(w, behind ? { world: w } : {})
    }

    if (body.op === "patch") {
      const clean = cleanPatch(body.patch, who.key)
      if ("error" in clean) return NextResponse.json({ error: clean.error }, { status: 400 })
      const patch = clean.patch as Record<string, unknown> & { heroes?: Record<string, Hero> }
      const refused: string[] = []
      if (patch.heroes && !who.dm) {
        const cur = await readWorld(db, runId)
        const now = Date.now()
        for (const [slug, h] of Object.entries(patch.heroes)) {
          if (!mayWriteHero(h, who.key, false, cur.seats, now)) { refused.push(slug); delete patch.heroes[slug] }
        }
        if (!Object.keys(patch.heroes).length) delete patch.heroes
      }
      if (!Object.keys(patch).length) return NextResponse.json({ error: "not yours to move", refused }, { status: 403 })
      const w = await apply(db, runId, patch, who.key)
      return answer(w, refused.length ? { refused } : {})
    }

    return NextResponse.json({ error: "op must be patch or beat" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 })
  }
}
