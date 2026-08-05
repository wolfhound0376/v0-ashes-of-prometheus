import { timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"

// Code-entry access gate (/join).
//
// A player types a three-word code instead of opening a claim link. This route
// trades that code for the character's real claim_token, which is what the rest
// of the app already uses to prove a browser owns a sheet. Nothing downstream
// changes: /api/chat still re-verifies (characterId, claimToken) on every message.
//
// WHY THE CODE IS NOT THE CREDENTIAL: claim_code is short enough to say out loud,
// so it is only ever an exchange ticket. The uuid claim_token stays the thing that
// actually authorises writes, and it never appears in a URL under this flow.
//
// The DM code lives in the DM_ACCESS_CODE env var, not the database — so rotating
// it is a Vercel env change with no migration, and it is never sitting in a table
// that a misconfigured RLS policy could expose.
//
// FAIL-OPEN ON PURPOSE: if DM_ACCESS_CODE is unset, the DM gate is reported as
// disabled and the dashboard behaves exactly as it does today. Sam can never lock
// himself out of his own game by forgetting to set an env var.

export const dynamic = "force-dynamic"

/** Normalise anything a human might type into the canonical stored form.
 *  "  Gloom Tallow  Hush 193 " and "GLOOM_TALLOW-HUSH-193" both become
 *  "gloom-tallow-hush-193". */
function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// Per-IP attempt limiting. Serverless instances don't share memory, so this is a
// speed bump rather than a wall — but paired with a ~60 million code space and the
// failure delay below, guessing is not a realistic path in.
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 8
const attempts = new Map<string, { count: number; resetAt: number }>()

function tooManyAttempts(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Tells the dashboard whether the DM gate is armed. No secrets in the response. */
export async function GET() {
  return Response.json({ dmGate: Boolean(process.env.DM_ACCESS_CODE) }, { status: 200 })
}

export async function POST(req: Request) {
  let code = ""
  try {
    const body = await req.json()
    code = normalizeCode(body?.code)
  } catch {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 })
  }

  if (!code || code.length < 6) {
    return Response.json({ ok: false, reason: "invalid" }, { status: 200 })
  }

  const ip = clientIp(req)
  if (tooManyAttempts(ip)) {
    return Response.json({ ok: false, reason: "rate_limited" }, { status: 429 })
  }

  // DM code first — it never touches the database.
  const dmCode = process.env.DM_ACCESS_CODE
  if (dmCode && safeEquals(code, normalizeCode(dmCode))) {
    return Response.json({ ok: true, role: "dm" }, { status: 200 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[v0] claim-code: admin client unavailable:", e)
    return Response.json({ ok: false, reason: "server" }, { status: 500 })
  }

  // character_secrets has RLS on with NO policies, so the public anon key cannot
  // read it at all. That is what makes this a real gate rather than a formality —
  // if the codes lived on `characters` any player could read every other player's.
  const { data: secretRow, error } = await admin
    .from("character_secrets")
    .select("character_id, claim_token")
    // Case-insensitive so a code typed or pasted into Supabase by hand with
    // capitals still resolves. Safe against wildcards: normalizeCode() has already
    // stripped everything outside [a-z0-9-], so no % or _ can reach this.
    .ilike("claim_code", code)
    .maybeSingle()

  if (error) {
    console.error("[v0] claim-code: lookup error:", error)
    return Response.json({ ok: false, reason: "server" }, { status: 500 })
  }

  if (!secretRow || !secretRow.claim_token) {
    await sleep(500) // blunt the guessing rate without punishing honest typists much
    return Response.json({ ok: false, reason: "invalid" }, { status: 200 })
  }

  const { data: character } = await admin
    .from("characters")
    .select("id, name")
    .eq("id", secretRow.character_id)
    .maybeSingle()

  if (!character) {
    return Response.json({ ok: false, reason: "invalid" }, { status: 200 })
  }

  return Response.json(
    {
      ok: true,
      role: "player",
      character: { id: character.id, name: character.name },
      claimToken: secretRow.claim_token,
    },
    { status: 200 },
  )
}

