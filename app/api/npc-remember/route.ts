import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { rememberAllDue, rememberDue } from "@/lib/npc-agents-store"

// /api/npc-remember — THE REMEMBERER's door (lib/npc-agents-store.ts; Sam, 2026-11-23, NPC agents).
//
//   POST {agent?: "<key>", force?: true}   DM only. One NPC (force = remember even a short stretch now, the
//                                          "Remember now" button in The Cast), or every card that is due.
//        → {results: [{key, ok, reason, written?}]}
//
// It also runs by itself: after an NPC talk turn on the Parley (/api/chat) and when a map screen posts story lines
// (/api/walk-log). This door is for the DM to make it run now and see why it did or did not.

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  if (!isDmRequest(req, normalizeCode, safeEquals)) return NextResponse.json({ error: "DM only" }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  let db: ReturnType<typeof createAdminClient>
  try { db = createAdminClient() } catch { return NextResponse.json({ error: "no database" }, { status: 503 }) }
  const agent = typeof body.agent === "string" ? body.agent.trim().slice(0, 32) : ""
  const results = agent ? [await rememberDue(db, agent, { force: body.force === true })] : await rememberAllDue(db)
  return NextResponse.json({ results })
}
