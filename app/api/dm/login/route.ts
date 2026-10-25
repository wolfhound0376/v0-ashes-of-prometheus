import { normalizeCode, safeEquals } from "@/lib/access-code"
import { dmCookieHeader, mintDmToken } from "@/lib/dm-session"

// POST /api/dm/login { code } — the DM door (/dm). The code is checked once, server-side, and the
// browser is handed a signed httpOnly cookie (lib/dm-session.ts). The code never comes back in the
// response and never needs to sit in a URL. FAILS CLOSED when DM_ACCESS_CODE is unset.
//
// Same speed bump as /api/claim-code: a wrong code costs half a second and eight wrong codes in ten
// minutes from one address costs a wait.

export const dynamic = "force-dynamic"

const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 8
const attempts = new Map<string, { count: number; resetAt: number }>()
function tooMany(ip: string): boolean {
  const now = Date.now()
  const e = attempts.get(ip)
  if (!e || now > e.resetAt) { attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false }
  e.count += 1
  return e.count > MAX_ATTEMPTS
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? req.headers.get("x-real-ip") ?? "unknown"
  if (tooMany(ip)) return Response.json({ ok: false, reason: "rate_limited" }, { status: 429 })
  let code = ""
  try { code = normalizeCode((await req.json())?.code) } catch { return Response.json({ ok: false, reason: "bad_request" }, { status: 400 }) }
  const required = process.env.DM_ACCESS_CODE
  if (!required) return Response.json({ ok: false, reason: "no_gate" }, { status: 503 })
  if (!code || !safeEquals(code, normalizeCode(required))) {
    await new Promise((r) => setTimeout(r, 500))
    return Response.json({ ok: false, reason: "invalid" }, { status: 200 })
  }
  const token = mintDmToken()
  if (!token) return Response.json({ ok: false, reason: "server" }, { status: 500 })
  return Response.json({ ok: true }, { status: 200, headers: { "Set-Cookie": dmCookieHeader(token) } })
}
