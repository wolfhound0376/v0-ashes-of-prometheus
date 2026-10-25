import { dmCookieHeader } from "@/lib/dm-session"

// POST /api/dm/logout — drop the DM cookie. The browser's older localStorage copy of the code
// (lib/dm-key.ts) is the client's to clear; /dm does both.
export const dynamic = "force-dynamic"

export async function POST() {
  return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": dmCookieHeader(null) } })
}
