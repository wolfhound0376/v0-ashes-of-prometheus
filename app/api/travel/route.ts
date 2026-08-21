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
// WAYPOINT GENERATION happens here, on the first move along an edge: a
// deterministic count (from the edge's days at normal pace, clamped 2..6) of
// waypoint nodes is inserted with edge_position 1..n, then the edge is frozen
// via freeze_edge_waypoints(). The DB triggers make that set permanent, so a
// route travelled twice yields the identical waypoints — the whole point of
// the schema. Already-frozen edges just get their existing waypoints revealed.

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

/** Deterministic per-edge PRNG so a regenerated set would be identical. */
function fnv(str: string) {
  let h = 2166136261
  for (const c of str) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

async function ensureWaypoints(
  db: ReturnType<typeof createAdminClient>,
  edge: { id: string; edge_key: string; metadata: Record<string, any> | null; waypoints_generated_at: string | null },
) {
  const now = new Date().toISOString()
  if (edge.waypoints_generated_at) {
    // Frozen already: the set is permanent, just make sure players can see it.
    await db.from("travel_nodes").update({ discovered_at: now }).eq("edge_id", edge.id).is("discovered_at", null)
    return
  }
  const days = Number(edge.metadata?.days_normal_pace) || 6
  const n = Math.max(2, Math.min(6, Math.round(days / 6)))
  const { data: region } = await db.from("travel_nodes").select("id").eq("node_key", "underdark").single()
  const rows = Array.from({ length: n }, (_, i) => ({
    node_key: `wp--${edge.edge_key}--${String(i + 1).padStart(2, "0")}`,
    name: `Waypoint ${i + 1}`,
    node_type: "waypoint" as const,
    parent_id: region?.id ?? null,
    parent_type: region ? ("region" as const) : null,
    is_generated: true,
    edge_id: edge.id,
    edge_position: i + 1,
    discovered_at: now,
    description: "A resting place on the road, marked on the first crossing.",
    metadata: { seed: fnv("wp:" + edge.edge_key), of: n },
  }))
  const { error } = await db.from("travel_nodes").upsert(rows, { onConflict: "node_key" })
  if (error) return
  // Freeze in the same request: from here the DB refuses to add, move or
  // delete waypoints on this edge, forever.
  await db.rpc("freeze_edge_waypoints", { p_edge_id: edge.id })
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
  let prevNodeId: string | null = null
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
    const { data: before } = await db.from("party_position").select("node_id").limit(1).maybeSingle()
    prevNodeId = before?.node_id ?? null
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

    // The road travelled: generate-and-freeze (or reveal) its waypoints.
    if (prevNodeId && prevNodeId !== node.id) {
      const { data: edge } = await db
        .from("travel_edges")
        .select("id,edge_key,metadata,waypoints_generated_at")
        .or(
          `and(from_node_id.eq.${prevNodeId},to_node_id.eq.${node.id}),and(from_node_id.eq.${node.id},to_node_id.eq.${prevNodeId})`,
        )
        .limit(1)
        .maybeSingle()
      if (edge) {
        await ensureWaypoints(db, edge as any)
        await db.from("travel_edges").update({ discovered_at: new Date().toISOString() }).eq("id", edge.id).is("discovered_at", null)
      }
    }
  }
  await revealNode(db, node.id)
  return NextResponse.json({ ok: true, action, node_key: node.node_key })
}
