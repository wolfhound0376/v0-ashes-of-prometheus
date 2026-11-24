import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { activeRun } from "@/lib/situation-store"
import { MALACHAR_PERSONA } from "@/lib/malachar-persona"
import { MALACHAR_LORE_CORE } from "@/lib/malachar-lore"
import { malacharBrief } from "@/lib/npc-brief"
import { offerPrompt, parseOffer, storyFor } from "@/lib/malachar-offer"

// /api/malachar-offer — MALACHAR'S BARGAIN (Sam, 2026-11-23): the words he speaks when he steps out of his portal on the
// painted map, and the two answers. The map asks at the end of an Act; the DM can ask for a draft from DM tools.
//   POST {act, actLabel?, where?, heroes?, others?, run?, characterId?, claimToken?}  ->  {offer: {words, accept, refuse}} | {offer: null}
// The DM, or a seated player with their own claim, may ask (one model call each, so not anyone). The story is the run's
// own map log (walk_log story lines, rehearsals left out). The rules on what he may say are lib/malachar-offer.ts.
// Failure is HTTP 200 with offer null: the map then simply lets the moment pass (or the DM writes the offer).

export const dynamic = "force-dynamic"

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "")
const names = (v: unknown) => (Array.isArray(v) ? v.map((x) => clip(x, 40)).filter(Boolean).slice(0, 12) : [])
type Db = ReturnType<typeof createAdminClient>

async function allowed(req: NextRequest, db: Db, body: Record<string, unknown>): Promise<boolean> {
  if (isDmRequest(req, normalizeCode, safeEquals)) return true
  const id = typeof body.characterId === "string" ? body.characterId : ""
  const token = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!id || !token) return false
  const { data } = await db.from("character_secrets").select("claim_token").eq("character_id", id).maybeSingle()
  return !!data && data.claim_token === token
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    const db = createAdminClient()
    if (!(await allowed(req, db, body))) return NextResponse.json({ error: "DM key or your own claim required" }, { status: 403 })
    const act = Number.isInteger(body.act) && (body.act as number) >= 0 && (body.act as number) <= 9 ? (body.act as number) : 0
    const run = typeof body.run === "string" && UUID.test(body.run) ? body.run : await activeRun(db)
    let story: string[] = []
    try {
      let q = db.from("walk_log").select("text").eq("kind", "story").or("mode.is.null,mode.not.ilike.rehearsal*").order("created_at", { ascending: false }).limit(80)
      if (run) q = q.eq("run", run)
      const { data } = await q
      story = storyFor(((data ?? []) as { text: string }[]).map((r) => r.text).reverse())
    } catch (e) { console.error("[malachar-offer] story", e) }
    const brief = await malacharBrief(db)
    const task = offerPrompt({ act, actLabel: clip(body.actLabel, 60), where: clip(body.where, 60), heroes: names(body.heroes), others: names(body.others), story, brief })
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      system: `${MALACHAR_PERSONA}\n\n${MALACHAR_LORE_CORE}`,
      messages: [{ role: "user", content: task }],
    })
    const offer = parseOffer(result.text)
    if (!offer) console.warn("[malachar-offer] unusable reply:", result.text.slice(0, 300))
    return NextResponse.json({ offer })
  } catch (error) {
    console.error("[malachar-offer] failed:", error)
    return NextResponse.json({ offer: null })
  }
}
