import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/world-flags - the durable facts of the world.
//
//   GET               → every flag currently set (anyone may ask; players are
//                       allowed to know the door is open, they can see it)
//   POST {key, value} → set one. DM only (x-dm-key, same gate as /api/combat).
//   DELETE {key}      → unset one, for when a ruling is reversed at the table.
//
// A flag is present or absent. There is no stored false, so nothing has to be
// seeded and no screen can read a stale "not yet" that was never written.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"

function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function GET() {
  const db = createAdminClient()
  const { data } = await db
    .from("world_flags")
    .select("key,value,set_at,set_by,note")
    .eq("campaign_id", CAMPAIGN)
  return NextResponse.json({ flags: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const key = typeof body.key === "string" ? body.key.trim() : ""
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 })

  const db = createAdminClient()
  const { error } = await db.from("world_flags").upsert(
    {
      campaign_id: CAMPAIGN,
      key,
      value: body.value ?? true,
      set_by: typeof body.setBy === "string" ? body.setBy : "dm",
      note: typeof body.note === "string" ? body.note : null,
    },
    { onConflict: "campaign_id,key" },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, key })
}

export async function DELETE(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "DM only" }, { status: 403 })

  const key = req.nextUrl.searchParams.get("key")?.trim()
  if (!key) return NextResponse.json({ error: "key is required" }, { status: 400 })

  const db = createAdminClient()
  const { error } = await db
    .from("world_flags")
    .delete()
    .eq("campaign_id", CAMPAIGN)
    .eq("key", key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, key })
}
