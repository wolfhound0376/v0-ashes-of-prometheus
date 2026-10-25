import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isWalkPatch, mergeSituation, parsePatch, sameSituation, startingSituation, type Situation, type Writer } from "@/lib/situation"
import { plateToNodeNumber } from "@/lib/situation-nodes"

// /api/party/situation — where the party is and what state it is in (lib/situation.ts, table party_situation).
//
//   GET                    the row for the active run (seeds the captive-in-the-pen row if none exists yet).
//   POST {…patch, characterId?, claimToken?, by?}
//                          merges a patch into it. Two callers:
//                            - the DM (x-dm-key): any field, `by` defaults to "dm";
//                            - a player's browser on the painted map (its own characterId + claimToken):
//                              only sub_location / sub_label / party_present and the three events
//                              (step_outside, gate_open, gate_broken) — the rules for what an event
//                              changes live in lib/situation.ts, never in the browser.
//                          Writes nothing when the merge changes nothing.
//
//   A patch that carries a plate (sub_location) also moves the party on the DM's node map
//   (subnodal_party_position), server-side, so party_location_label(), the NPC window's backdrop and
//   the camp verdict follow the walk (Sam, 2026-10-25). Position only: the fog (subnodal_visibility)
//   is not touched, so what the players can see stays the DM's call. Plates that are not on the node
//   map (the caverns) move nothing. Best-effort: a failure here never fails the situation write.
//
// This is the row the chat route reads for the NPCs' sense of place (PR B). Until this existed, walking the
// painted map changed only the browser's sessionStorage, so Eldeth went on treating the party as prisoners
// three rooms past the gate. Sam, 2026-10-24.

export const dynamic = "force-dynamic"

const CAMPAIGN_ID = "abyss"

function isDm(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  return !!required && safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

type Db = ReturnType<typeof createAdminClient>

/** The active run's id: campaign_runs(status=active), else the run the party_position row sits on. */
async function activeRunId(db: Db): Promise<string | null> {
  const { data: run } = await db.from("campaign_runs").select("id").eq("campaign_id", CAMPAIGN_ID).eq("status", "active").order("run_number", { ascending: false }).limit(1).maybeSingle()
  if (run?.id) return run.id as string
  const { data: pos } = await db.from("party_position").select("campaign_run_id").limit(1).maybeSingle()
  return (pos?.campaign_run_id as string | undefined) ?? null
}

/**
 * Put the party on the node-map node the plate names, for the place the situation says they are in.
 * The DM's own move (dm_move_party_subnodal) also marks the node explored and sights its neighbours;
 * this does neither. Returns what it did, for the response and the log.
 */
async function followPlateOnNodeMap(db: Db, s: Situation): Promise<{ moved: boolean; node?: number; reason?: string }> {
  const node = plateToNodeNumber(s.sub_location)
  if (node == null) return { moved: false, reason: "plate is not on the node map" }
  try {
    // The node map for the place the party is in: travel_nodes.node_key → subnodal_maps.location_node_id.
    // Two plain reads rather than an embed, so this never leans on PostgREST finding the relationship.
    const { data: place } = await db.from("travel_nodes").select("id").eq("node_key", s.node_key).limit(1).maybeSingle()
    if (!place) return { moved: false, reason: `no travel node ${s.node_key}` }
    const { data: map } = await db.from("subnodal_maps").select("id, slug").eq("location_node_id", place.id).limit(1).maybeSingle()
    if (!map) return { moved: false, reason: `no node map for ${s.node_key}` }
    const { data: target } = await db.from("subnodal_nodes").select("id").eq("map_id", map.id).eq("node_number", node).maybeSingle()
    if (!target) return { moved: false, reason: `node ${node} is not on ${map.slug}` }
    const { data: here } = await db.from("subnodal_party_position").select("node_id").eq("campaign_run_id", s.campaign_run_id).eq("map_id", map.id).maybeSingle()
    if (here?.node_id === target.id) return { moved: false, node, reason: "already there" }
    const { error } = await db.from("subnodal_party_position").upsert(
      { campaign_run_id: s.campaign_run_id, map_id: map.id, node_id: target.id, updated_at: new Date().toISOString() },
      { onConflict: "campaign_run_id,map_id" },
    )
    if (error) return { moved: false, node, reason: error.message }
    return { moved: true, node }
  } catch (e) {
    return { moved: false, node, reason: String(e) }
  }
}

async function readOrSeed(db: Db, runId: string): Promise<Situation> {
  const { data } = await db.from("party_situation").select("*").eq("campaign_run_id", runId).maybeSingle()
  if (data) return { ...(data as Situation), party_present: Array.isArray((data as Situation).party_present) ? (data as Situation).party_present : [] }
  const seed = startingSituation(runId)
  await db.from("party_situation").upsert(seed, { onConflict: "campaign_run_id" })
  return seed
}

export async function GET() {
  try {
    const db = createAdminClient()
    const runId = await activeRunId(db)
    if (!runId) return NextResponse.json({ error: "no active run" }, { status: 404 })
    return NextResponse.json({ situation: await readOrSeed(db, runId) })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const patch = parsePatch(body)
  if (!Object.keys(patch).length) return NextResponse.json({ error: "nothing to change" }, { status: 400 })

  const db = createAdminClient()
  let by: Writer
  if (isDm(req)) {
    by = typeof body.by === "string" && ["walk", "travel", "camp", "combat", "dm", "restart"].includes(body.by) ? (body.by as Writer) : "dm"
  } else {
    // a player's own seat may report where the walk took the party, nothing more
    const characterId = typeof body.characterId === "string" ? body.characterId : ""
    const claimToken = typeof body.claimToken === "string" ? body.claimToken : ""
    if (!characterId || !claimToken) return NextResponse.json({ error: "DM key or your own claim required" }, { status: 403 })
    const { data: secret } = await db.from("character_secrets").select("claim_token").eq("character_id", characterId).maybeSingle()
    if (!secret || secret.claim_token !== claimToken) return NextResponse.json({ error: "not your character" }, { status: 403 })
    if (!isWalkPatch(patch)) return NextResponse.json({ error: "only the DM may set that" }, { status: 403 })
    by = "walk"
  }

  try {
    const runId = await activeRunId(db)
    if (!runId) return NextResponse.json({ error: "no active run" }, { status: 404 })
    const prev = await readOrSeed(db, runId)
    const next = mergeSituation(prev, patch, by)
    if (sameSituation(prev, next)) return NextResponse.json({ situation: prev, changed: false })
    const { error } = await db.from("party_situation").upsert(next, { onConflict: "campaign_run_id" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    // The node map follows the plate. Only when the patch named one: a gate event alone moves nobody.
    let subnodal: { moved: boolean; node?: number; reason?: string } | undefined
    if (patch.sub_location !== undefined) {
      subnodal = await followPlateOnNodeMap(db, next)
      if (!subnodal.moved && subnodal.reason && subnodal.reason !== "already there" && subnodal.reason !== "plate is not on the node map") {
        console.warn("[situation] node map not moved:", subnodal.reason)
      }
    }
    return NextResponse.json({ situation: next, changed: true, subnodal })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
