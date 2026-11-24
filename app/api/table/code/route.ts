import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readHost, readTable } from "@/lib/table-store"
import { codeOpens, normalizeRoomCode } from "@/lib/room-code"

// /api/table/code?c=VKRT — does this room code open the table right now? (lib/room-code.ts)
//
// For the /t/<code> landing page, before the visitor has said who they are. It answers yes or no, the table's
// status and the host's name, and nothing else: it never says what the right code is.

export const dynamic = "force-dynamic"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function GET(req: NextRequest) {
  const given = normalizeRoomCode(req.nextUrl.searchParams.get("c"))
  try {
    const db = createAdminClient()
    const [t, host] = await Promise.all([readTable(db), readHost(db)])
    const open = codeOpens(t.code, t.status, given)
    if (!open) await sleep(400) // guessing codes stays slow; a real link pays this only when it is stale
    return NextResponse.json(
      { open, status: open ? t.status : t.status === "closed" ? "closed" : "changed", host: open && host ? host.name : null },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
