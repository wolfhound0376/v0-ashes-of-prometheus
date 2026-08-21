import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/travel — Malachar's hands on the travel graph.
//
//   GET               → the FULL graph (all nodes/edges + party), DM eyes only.
//                       Players never call this; their view is anon + RLS.
//   POST {action, node_key}
//     action "reveal" → set discovered_at on the node, then on any edge whose
//                       both endpoints are now discovered.
//     action "move"   → set party_position to the node (never a region), then
//                       reveal it. Layer 3 never calls this; it is the DM's.
//
// AUTHORIZATION mirrors /api/asset-media: x-dm-key must carry DM_ACCESS_CODE
// when that env var is set; with it unset the route stays open (fail-open,
// same rule as the /join gate).
//
// Waypoint generation on first travel is intentionally NOT here yet — that is
// Layer 1's job (deterministic generation + freeze_edge_waypoints in the same
// transaction). Reveal/move only touch discovered_at and party_position.

export const dynamic = "force-dynamic"

function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  const given = req.headers.get("x-dm-key") ?? ""
  return safeEquals(normalizeCode(given), normalizeCode(required))
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  const db = createAdminClient()
  const [n, e, p] = await Promise.all([
    db.from("travel_nodes").select("id,node_key,name,node_type,edge_id,edge_position,description,metadata,discovered_at"),
    db.from("travel_edges").select("id,edge_key,from_node_id,to_node_id,distance_miles,danger_level,metadata,discovered_at"),
    db.from("party_position").select("campaign_run_id,node_id,arrived_at").limit(1),
  ])
  const err = n.error || e.error || p.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  return NextResponse.json({ nodes: n.data, edges: e.data, party: p.data?.[0] ?? null })
}

async function revealNode(db: ReturnType<typeof createAdminClient>, nodeId: string) {
  const now = new Date().toISOString()
  await db.from("travel_nodes").update({ discovered_at: now }).eq("id", nodeId).is("discovered_at", null)
  const [{ data: edges }, { data: nodes }] = await Promise.all([
    db.from("travel_edges").select("id,from_node_id,to_node_id").is("discovered_at", null),
    db.from("travel_nodes").select("id").not("discovered_at", "is", null),
  ])
  const disc = new Set((nodes ?? []).map((x) => x.id))
  const ids = (edges ?? [])
    .filter((x) => disc.has(x.from_node_id) && disc.has(x.to_node_id))
    .map((x) => x.id)
  if (ids.length) await db.from("travel_edges").update({ discovered_at: now }).in("id", ids)
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  const body = await req.json().catch(() => null)
  const action = body?.action
  const nodeKey = typeof body?.node_key === "string" ? body.node_key : ""
  if (!nodeKey || (action !== "reveal" && action !== "move")) {
    return NextResponse.json({ error: "expected { action: 'reveal'|'move', node_key }" }, { status: 400 })
  }
  const db = createAdminClient()
  const { data: node, error } = await db
    .from("travel_nodes")
    .select("id,node_key,node_type")
    .eq("node_key", nodeKey)
    .single()
  if (error || !node) return NextResponse.json({ error: "unknown node_key" }, { status: 404 })

  if (action === "move") {
    if (node.node_type === "region") {
      return NextResponse.json({ error: "party position is always a concrete node, never a region" }, { status: 400 })
    }
    const { data: run } = await db
      .from("campaign_runs")
      .select("id")
      .eq("campaign_id", "abyss")
      .in("status", ["setup", "active"])
      .limit(1)
      .single()
    if (!run) return NextResponse.json({ error: "no active campaign run" }, { status: 409 })
    const { error: uerr } = await db.from("party_position").upsert({
      campaign_run_id: run.id,
      node_id: node.id,
      node_type: node.node_type,
      arrived_at: new Date().toISOString(),
    })
    if (uerr) return NextResponse.json({ error: uerr.message }, { status: 500 })
  }
  await revealNode(db, node.id)
  return NextResponse.json({ ok: true, action, node_key: node.node_key })
}
