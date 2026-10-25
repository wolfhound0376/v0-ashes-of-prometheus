import { createAdminClient } from "@/lib/supabase/admin"
import { generateClaimCode, normalizeCode, safeEquals } from "@/lib/access-code"
import { cleanName, validateSubmission, MAX_SUBMISSION_BYTES, type ForgeAssets } from "@/lib/forge-submission"

// POST /api/forge/submit — a hero handed in at the Forge. NO CODE REQUIRED.
//
// Sam, 2026-10-24: "Start New Game and then route you immediately into character creation …
// You will be assigned a code but will be unable to be seated unless your account is activated
// by the DM." So this route is the open door the title screen promises: anyone may forge, and
// the hero waits in forge_submissions until the DM presses Activate (app/api/forge/activate,
// the DM lane). Nothing here touches `characters` — a pending hero is invisible to the game.
//
//   POST { playerName, heroName, payload, assets } → { ok, code, submissionId }
//   GET  ?code=…                                   → { ok, status, heroName, characterId? }
//
// The three words are issued here, once, in the same shape as every other claim code
// (lib/access-code.ts), checked against character_secrets, forge_submissions and the env gate
// codes so they can never collide. On activation they are copied into character_secrets, so the
// door at /join opens for them without learning anything new.

export const dynamic = "force-dynamic"

// Same speed bump as /api/claim-code: per-instance, so a wall it is not, but a stranger cannot
// fill the queue in a loop either.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 6
const attempts = new Map<string, { count: number; resetAt: number }>()

function tooMany(ip: string): boolean {
  const now = Date.now()
  const e = attempts.get(ip)
  if (!e || now > e.resetAt) { attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false }
  e.count += 1
  return e.count > MAX_PER_WINDOW
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return req.headers.get("x-real-ip") ?? "unknown"
}

async function freshCode(admin: ReturnType<typeof createAdminClient>): Promise<string | null> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = generateClaimCode()
    if (process.env.DM_ACCESS_CODE && safeEquals(candidate, normalizeCode(process.env.DM_ACCESS_CODE))) continue
    if (process.env.FORGE_ACCESS_CODE && safeEquals(candidate, normalizeCode(process.env.FORGE_ACCESS_CODE))) continue
    const [{ data: a, error: ea }, { data: b, error: eb }] = await Promise.all([
      admin.from("character_secrets").select("character_id").ilike("claim_code", candidate).limit(1).maybeSingle(),
      admin.from("forge_submissions").select("id").eq("claim_code", candidate).limit(1).maybeSingle(),
    ])
    if (ea || eb) { console.error("[forge/submit] code check failed:", ea?.message ?? eb?.message); return null }
    if (a || b) continue
    return candidate
  }
  return null
}

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "")
  if (raw.length > MAX_SUBMISSION_BYTES) return Response.json({ ok: false, error: "That hero is too large to hand in." }, { status: 413 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 }) }

  const problem = validateSubmission(body)
  if (problem) return Response.json({ ok: false, error: problem }, { status: 400 })

  if (tooMany(clientIp(req))) return Response.json({ ok: false, error: "Too many heroes from one place. Wait a few minutes." }, { status: 429 })

  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch (e) {
    console.error("[forge/submit] admin client unavailable:", e)
    return Response.json({ ok: false, error: "The Forge is cold (server not configured)." }, { status: 500 })
  }

  const b = body as { playerName: string; heroName: string; payload: { format: string; character: Record<string, unknown>; inventory?: unknown[] }; assets: ForgeAssets }
  const playerName = cleanName(b.playerName)
  const heroName = cleanName(b.heroName)
  // The sheet's own name follows the Forge's Identity step — one name, no drift.
  const payload = { ...b.payload, character: { ...b.payload.character, name: heroName, sheet_player_name: playerName } }

  const code = await freshCode(admin)
  if (!code) return Response.json({ ok: false, error: "Could not issue your words. Try again." }, { status: 500 })

  const { data, error } = await admin
    .from("forge_submissions")
    .insert({ claim_code: code, player_name: playerName, hero_name: heroName, payload, assets: b.assets ?? {}, status: "pending" })
    .select("id")
    .single()
  if (error || !data) {
    console.error("[forge/submit] insert failed:", error?.message)
    // The commonest cause on a fresh database is the table not existing yet — say so plainly.
    const hint = error?.message?.includes("forge_submissions") ? " (the forge_submissions table is not there yet — ask the DM to run the forge migration)" : ""
    return Response.json({ ok: false, error: `The Forge could not keep your hero${hint}.` }, { status: 500 })
  }
  return Response.json({ ok: true, code, submissionId: data.id }, { status: 200 })
}

/** The waiting screen asks this every few seconds: has the DM opened my cell? */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const code = normalizeCode(url.searchParams.get("code"))
  if (!code || code.length < 6) return Response.json({ ok: false, reason: "invalid" }, { status: 200 })
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return Response.json({ ok: false, reason: "server" }, { status: 500 }) }
  const { data, error } = await admin
    .from("forge_submissions")
    .select("status, hero_name, character_id, note")
    .eq("claim_code", code)
    .maybeSingle()
  if (error) { console.error("[forge/submit] status lookup failed:", error.message); return Response.json({ ok: false, reason: "server" }, { status: 500 }) }
  if (!data) return Response.json({ ok: false, reason: "unknown" }, { status: 200 })
  return Response.json({ ok: true, status: data.status, heroName: data.hero_name, characterId: data.character_id ?? null, note: data.status === "rejected" ? data.note ?? null : null }, { status: 200 })
}
