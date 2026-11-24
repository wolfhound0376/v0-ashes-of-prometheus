import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { partyInOutpost } from "@/lib/ruins-door"

// /api/party/position — where the party stands on the travel map, and nothing else.
//
//   GET  → { nodeKey, nodeType, inOutpost }
//
// The walk page's Ruins door asks before it moves anyone (lib/ruins-door.ts: the door opens only from the road).
// party_position holds the march's one row (app/api/travel reads it the same way); its node is the outpost
// itself until the party marches out. Read-only and cheap: one row and its node's key. On any failure the
// answer is { nodeKey: null, inOutpost: false } with the error, so a caller that cannot learn the position
// is never told the party is somewhere it may not be.

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const db = createAdminClient()
    const { data: pos, error } = await db.from("party_position").select("node_id,node_type").limit(1).maybeSingle()
    if (error) throw new Error(error.message)
    if (!pos?.node_id) return NextResponse.json({ nodeKey: null, nodeType: null, inOutpost: false })
    const { data: node } = await db.from("travel_nodes").select("node_key").eq("id", pos.node_id).maybeSingle()
    const nodeKey = (node?.node_key as string | undefined) ?? null
    return NextResponse.json({ nodeKey, nodeType: (pos.node_type as string | null) ?? null, inOutpost: partyInOutpost(nodeKey) })
  } catch (e) {
    return NextResponse.json({ nodeKey: null, nodeType: null, inOutpost: false, error: String(e) }, { status: 500 })
  }
}
