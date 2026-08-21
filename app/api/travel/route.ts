import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { resolveArrival, rollDie, type EncounterRow, type EncounterTable, type NodeEvent } from "@/lib/travel/arrival"

// /api/travel — Malachar's hands on the travel graph.
//
//   GET               → the FULL graph (all nodes/edges + party), DM eyes only.
//                       Players never call this; their view is anon + RLS.
//   POST {action, node_key}
//     action "reveal"      → set discovered_at: the party can now SEE it.
//     action "reveal_name" → set name_known_at: the party now KNOWS what it is
//                            called. Deliberately separate — a shape on the
//                            horizon is not a name, and players read a view
//                            that withholds the name until this is set.
//     action "move"   → set party_position to the node (never a region), then
//                       reveal it. Layer 3 never calls this; it is the DM's.
//     action "arrive"  → the party has just stepped onto a node mid-march.
//                       Resolves what happens there (authored event, or the
//                       published encounter check once a day's march is behind
//                       them) and says whether the march STOPS. See
//                       lib/travel/arrival.ts for the order of precedence.
//     action "continue"→ clear the open halt so the party walks on. The DM's
//                       hand, always: nothing resumes a stopped march by itself.
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
    db.from("travel_nodes").select("id,node_key,name,node_type,edge_id,edge_position,description,metadata,discovered_at,name_known_at"),
    db.from("travel_edges").select("id,edge_key,from_node_id,to_node_id,distance_miles,danger_level,metadata,discovered_at"),
    db.from("party_position").select("campaign_run_id,node_id,arrived_at").limit(1),
  ])
  const err = n.error || e.error || p.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  // A halt survives a reload: the march is stopped in the database, not in a
  // browser tab. Refreshing the page must not walk the party past an ambush.
  const { data: open } = await db
    .from("travel_arrivals")
    .select("id,node_id,outcome,arrived_at")
    .eq("halted", true)
    .is("resolved_at", null)
    .limit(1)
    .maybeSingle()
  return NextResponse.json({ nodes: n.data, edges: e.data, party: p.data?.[0] ?? null, halt: open ?? null })
}

/** Every road node and segment the party crossed becomes known. */
async function revealRoute(db: ReturnType<typeof createAdminClient>, nodeIds: string[], edgeIds: string[]) {
  const now = new Date().toISOString()
  if (nodeIds.length) await db.from("travel_nodes").update({ discovered_at: now }).in("id", nodeIds).is("discovered_at", null)
  if (edgeIds.length) await db.from("travel_edges").update({ discovered_at: now }).in("id", edgeIds).is("discovered_at", null)
}

/** Shortest road route (by derived miles) between two nodes, over is_road edges. */
async function roadRoute(db: ReturnType<typeof createAdminClient>, fromId: string, toId: string) {
  const { data: roads } = await db
    .from("travel_edges")
    .select("id,from_node_id,to_node_id,distance_miles,metadata")
  const road = (roads ?? []).filter((e) => e.metadata?.is_road)
  const adj = new Map<string, { to: string; id: string; w: number }[]>()
  for (const e of road) {
    if (!adj.has(e.from_node_id)) adj.set(e.from_node_id, [])
    if (!adj.has(e.to_node_id)) adj.set(e.to_node_id, [])
    adj.get(e.from_node_id)!.push({ to: e.to_node_id, id: e.id, w: Number(e.distance_miles) })
    adj.get(e.to_node_id)!.push({ to: e.from_node_id, id: e.id, w: Number(e.distance_miles) })
  }
  const dist = new Map<string, number>([[fromId, 0]])
  const prev = new Map<string, { node: string; edge: string }>()
  const seen = new Set<string>()
  while (true) {
    let cur: string | null = null
    let best = Infinity
    for (const [k, v] of dist) if (!seen.has(k) && v < best) ((best = v), (cur = k))
    if (!cur || cur === toId) break
    seen.add(cur)
    for (const nx of adj.get(cur) ?? []) {
      const nd = best + nx.w
      if (nd < (dist.get(nx.to) ?? Infinity)) {
        dist.set(nx.to, nd)
        prev.set(nx.to, { node: cur, edge: nx.id })
      }
    }
  }
  if (!dist.has(toId)) return { nodes: [] as string[], edges: [] as string[] }
  const nodesOut = [toId]
  const edgesOut: string[] = []
  while (nodesOut[0] !== fromId) {
    const p = prev.get(nodesOut[0])
    if (!p) break
    edgesOut.push(p.edge)
    nodesOut.unshift(p.node)
  }
  return { nodes: nodesOut, edges: edgesOut }
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


/**
 * How far the party walked on the leg that just ended.
 *
 * Waypoints are not joined by travel_edges — they are stones ON an edge — so a
 * hop between two of them is the edge's length divided by the number of gaps
 * its stones create. Asking the client for the distance would let a browser
 * decide how tired the party is; the server works it out from the graph.
 */
async function legMiles(
  db: ReturnType<typeof createAdminClient>,
  fromKey: string | null,
  toId: string,
  toEdgeId: string | null,
): Promise<number> {
  const edgeId = toEdgeId ?? (fromKey ? (await db.from("travel_nodes").select("edge_id").eq("node_key", fromKey).maybeSingle()).data?.edge_id ?? null : null)

  if (edgeId) {
    const [{ data: edge }, { count }] = await Promise.all([
      db.from("travel_edges").select("distance_miles").eq("id", edgeId).maybeSingle(),
      db.from("travel_nodes").select("id", { count: "exact", head: true }).eq("edge_id", edgeId),
    ])
    const gaps = (count ?? 0) + 1
    return edge ? Number(edge.distance_miles) / gaps : 0
  }

  if (!fromKey) return 0
  const { data: from } = await db.from("travel_nodes").select("id").eq("node_key", fromKey).maybeSingle()
  if (!from) return 0
  const { data: edge } = await db
    .from("travel_edges")
    .select("distance_miles")
    .or(`and(from_node_id.eq.${from.id},to_node_id.eq.${toId}),and(from_node_id.eq.${toId},to_node_id.eq.${from.id})`)
    .limit(1)
    .maybeSingle()
  return edge ? Number(edge.distance_miles) : 0
}

async function activeRunId(db: ReturnType<typeof createAdminClient>): Promise<string | null> {
  const { data } = await db
    .from("campaign_runs")
    .select("id")
    .eq("campaign_id", "abyss")
    .in("status", ["setup", "active"])
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  const body = await req.json().catch(() => null)
  const action = body?.action
  const nodeKey = typeof body?.node_key === "string" ? body.node_key : ""
  const KNOWN = ["reveal", "reveal_name", "move", "arrive", "continue"]
  if (!KNOWN.includes(action) || (!nodeKey && action !== "continue")) {
    return NextResponse.json({ error: `expected { action: ${KNOWN.join("|")}, node_key }` }, { status: 400 })
  }

  if (action === "continue") {
    // The DM lets them walk on. Only ever closes an OPEN halt, so a stray
    // second click cannot reach back and reopen settled history.
    const db0 = createAdminClient()
    const { data: open } = await db0
      .from("travel_arrivals")
      .select("id")
      .eq("halted", true)
      .is("resolved_at", null)
      .limit(1)
      .maybeSingle()
    if (!open) return NextResponse.json({ ok: true, action, nothing_to_resume: true })
    await db0.from("travel_arrivals").update({ resolved_at: new Date().toISOString() }).eq("id", open.id)
    return NextResponse.json({ ok: true, action, resumed: open.id })
  }
  const db = createAdminClient()
  let prevNodeId: string | null = null
  const { data: node, error } = await db
    .from("travel_nodes")
    .select("id,node_key,node_type")
    .eq("node_key", nodeKey)
    .single()
  if (error || !node) return NextResponse.json({ error: "unknown node_key" }, { status: 404 })

  if (action === "arrive") {
    // Everything this needs, in one round trip.
    const fromKey = typeof body?.from_node_key === "string" ? body.from_node_key : null
    const runId = await activeRunId(db)
    if (!runId) return NextResponse.json({ error: "no active campaign run" }, { status: 409 })

    const { data: full } = await db
      .from("travel_nodes")
      .select("id,node_key,name,edge_id")
      .eq("id", node.id)
      .single()

    const [tablesRes, rowsRes, eventsRes, firedRes, marchRes, miles] = await Promise.all([
      db.from("encounter_tables").select("table_key,die,title,source"),
      db.from("encounter_table_rows").select("table_key,roll_min,roll_max,result,detail"),
      db.from("travel_node_events").select("id,kind,title,body,payload,fires_once,priority").eq("node_id", node.id),
      db.from("travel_arrivals").select("event_id").not("event_id", "is", null),
      db.from("travel_march").select("miles_since_check,day_miles,checks_made").eq("campaign_run_id", runId).maybeSingle(),
      legMiles(db, fromKey, node.id, full?.edge_id ?? null),
    ])

    // An event that fires once and already has an arrival against it is spent.
    const spent = new Set((firedRes.data ?? []).map((r: { event_id: string | null }) => r.event_id))
    const events = ((eventsRes.data ?? []) as NodeEvent[]).filter((e) => !(e.fires_once && spent.has(e.id)))

    const outcome = resolveArrival({
      nodeName: full?.name ?? node.node_key,
      milesWalked: miles,
      march: marchRes.data ?? { miles_since_check: 0, day_miles: 7, checks_made: 0 },
      events,
      tables: (tablesRes.data ?? []) as EncounterTable[],
      rows: (rowsRes.data ?? []) as EncounterRow[],
      roll: rollDie,
    })

    await db.from("travel_march").upsert({
      campaign_run_id: runId,
      miles_since_check: outcome.march.miles_since_check,
      day_miles: outcome.march.day_miles,
      checks_made: outcome.march.checks_made,
      last_check_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    // Quiet nodes are not written to the log. Fifty-one rows saying "nothing
    // happened" would bury the two that matter.
    let arrivalId: string | null = null
    if (outcome.halt) {
      const { data: row, error: aerr } = await db
        .from("travel_arrivals")
        .insert({
          node_id: node.id,
          event_id: outcome.eventId,
          halted: true,
          outcome: {
            kind: outcome.kind,
            title: outcome.title,
            body: outcome.body,
            rolls: outcome.rolls,
            source: outcome.source,
            miles_walked: miles,
          },
        })
        .select("id")
        .single()
      // A unique index allows only one open halt. Losing that race is not an
      // error: something already stopped the march, which is the outcome we
      // wanted anyway.
      if (aerr && !/duplicate key/i.test(aerr.message)) {
        return NextResponse.json({ error: aerr.message }, { status: 500 })
      }
      arrivalId = row?.id ?? null
    }

    await revealNode(db, node.id)
    return NextResponse.json({ ok: true, action, node_key: node.node_key, arrival_id: arrivalId, ...outcome })
  }

  if (action === "reveal_name") {
    // Learning the name also means they have at least seen it.
    const now = new Date().toISOString()
    await db.from("travel_nodes").update({ name_known_at: now }).eq("id", node.id).is("name_known_at", null)
    await revealNode(db, node.id)
    return NextResponse.json({ ok: true, action, node_key: node.node_key })
  }

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

    // The road travelled becomes known, marker by marker.
    if (prevNodeId && prevNodeId !== node.id) {
      const r = await roadRoute(db, prevNodeId, node.id)
      await revealRoute(db, r.nodes, r.edges)
    }

    // The summary edge travelled: generate-and-freeze (or reveal) its waypoints.
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
