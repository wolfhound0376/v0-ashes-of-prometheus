import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { after } from "next/server"
import { rememberAllDue } from "@/lib/npc-agents-store"

// /api/walk-log — THE REVIEW LOG (Sam, 2026-11-15: "Some of these comments we don't need for the player but the info is
// important for review. Some of it should be in a log you can access but is minimized.").
//
//   POST {lines: [{at, kind, text, plate, mode}], run?, hero?}   a map screen sends what it showed or kept back, in
//        batches (every few seconds, and once more as the page goes away). The DM, or a seated player with their own
//        claim (characterId + claimToken in the body), may write; the screen is recorded as "dm" or their character id.
//   GET  ?run=&screen=&kind=&since=&limit=                         DM only: the lines, newest first.
//
// The table (walk_log) has RLS on and no policies: only this route's service role reads or writes it.

export const dynamic = "force-dynamic"

const KINDS = new Set(["story", "review", "sync", "system"])
const MAX_LINES = 120
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Db = ReturnType<typeof createAdminClient>

// A verified claim is good for ten minutes in this instance (the same rule as /api/walk-world): a screen posts its log
// every few seconds and must not cost a lookup each time.
const claimCache = new Map<string, { token: string; until: number }>()
async function screenOf(req: NextRequest, db: Db, body: Record<string, unknown>): Promise<string | null> {
  if (isDmRequest(req, normalizeCode, safeEquals)) return "dm"
  const id = typeof body.characterId === "string" ? body.characterId : ""
  const token = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!id || !token) return null
  const hit = claimCache.get(id)
  if (hit && hit.token === token && hit.until > Date.now()) return id
  const { data } = await db.from("character_secrets").select("claim_token").eq("character_id", id).maybeSingle()
  if (!data || data.claim_token !== token) return null
  claimCache.set(id, { token, until: Date.now() + 10 * 60 * 1000 })
  return id
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const db = createAdminClient()
    const screen = await screenOf(req, db, body)
    if (!screen) return NextResponse.json({ error: "DM key or your own claim required" }, { status: 403 })
    const raw = Array.isArray(body.lines) ? body.lines.slice(0, MAX_LINES) : []
    const run = typeof body.run === "string" && UUID.test(body.run) ? body.run : null
    const hero = clip(body.hero, 48) || null
    const rows = raw
      .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
      .filter((l) => KINDS.has(String(l.kind)) && clip(l.text, 600))
      .map((l) => {
        const at = typeof l.at === "number" && Number.isFinite(l.at) ? new Date(l.at) : null
        return {
          at: at && Math.abs(at.getTime() - Date.now()) < 864e5 ? at.toISOString() : null,
          run,
          screen,
          hero,
          plate: clip(l.plate, 40) || null,
          mode: clip(l.mode, 24) || null,
          kind: String(l.kind),
          text: clip(l.text, 600),
        }
      })
    if (!rows.length) return NextResponse.json({ ok: true, saved: 0 })
    const { error } = await db.from("walk_log").insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // Story lines from a real run (not a rehearsal) may hold something the cast will remember: a fight, a death, a
    // gift. The Rememberer decides, after the reply, at most once a minute (lib/npc-agents-store.ts).
    if (rows.some((r) => r.kind === "story" && !/^rehearsal/i.test(r.mode ?? ""))) {
      after(async () => { try { await rememberAllDue(db, { throttle: true }) } catch (e) { console.error("[rememberer] after walk-log:", e) } })
    }
    return NextResponse.json({ ok: true, saved: rows.length })
  } catch (e) {
    return NextResponse.json({ error: String(e instanceof Error ? e.message : e) }, { status: 503 })
  }
}

export async function GET(req: NextRequest) {
  if (!isDmRequest(req, normalizeCode, safeEquals)) return NextResponse.json({ error: "DM only" }, { status: 403 })
  const p = req.nextUrl.searchParams
  const limit = Math.max(1, Math.min(1000, Number(p.get("limit")) || 300))
  let q = createAdminClient().from("walk_log").select("*").order("created_at", { ascending: false }).limit(limit)
  const run = p.get("run"), screen = p.get("screen"), kind = p.get("kind"), since = p.get("since")
  if (run && UUID.test(run)) q = q.eq("run", run)
  if (screen) q = q.eq("screen", screen)
  if (kind && KINDS.has(kind)) q = q.eq("kind", kind)
  if (since && !Number.isNaN(Date.parse(since))) q = q.gte("created_at", new Date(since).toISOString())
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ lines: data ?? [] })
}
