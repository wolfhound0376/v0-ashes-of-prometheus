import { createAdminClient } from "@/lib/supabase/admin"
import { readSeated } from "@/lib/seats"
import { cleanName } from "@/lib/forge-submission"
import { freshClaimCode } from "@/lib/forge-code"
import { availability, canonBySlug, canonPayload, type ClaimLike } from "@/lib/canon-heroes"

// POST /api/forge/claim-canon — a new player asks to walk in as one of the canon heroes
// (lib/canon-heroes.ts — the original four, plus Lynkes and Gandalf since 2026-10-29).
// NO CODE REQUIRED, same as the Forge's own door.
//
//   POST { slug, playerName } → { ok, code, heroName }   |   { ok: false, error, availability? }
//
// The claim waits in forge_submissions exactly like a Forge hero (status "pending", three words
// issued here), with canon_character_id set and no sheet — the hero's row already exists. The DM
// opens the cell at /dm (app/api/forge/activate), which hands that row to these words instead of
// importing a new one. Until then the hero shows as "claimed" on the chooser, so two strangers
// cannot both wait for Fifi.

export const dynamic = "force-dynamic"

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

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const hero = canonBySlug(body?.slug)
  if (!hero) return Response.json({ ok: false, error: "No such hero." }, { status: 400 })
  const playerName = cleanName(body?.playerName)
  if (!playerName) return Response.json({ ok: false, error: "Tell us your name (the player)." }, { status: 400 })
  if (tooMany(clientIp(req))) return Response.json({ ok: false, error: "Too many claims from one place. Wait a few minutes." }, { status: 429 })

  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch (e) {
    console.error("[forge/claim-canon] admin client unavailable:", e)
    return Response.json({ ok: false, error: "The door is stuck (server not configured)." }, { status: 500 })
  }

  const [seats, claimsRes] = await Promise.all([
    readSeated(admin),
    admin.from("forge_submissions").select("canon_character_id, status").eq("canon_character_id", hero.id).eq("status", "pending"),
  ])
  if (claimsRes.error) {
    console.error("[forge/claim-canon] claim check failed:", claimsRes.error.message)
    return Response.json({ ok: false, error: "Could not check who else is waiting. Try again." }, { status: 500 })
  }
  const state = availability(hero, seats, (claimsRes.data ?? []) as ClaimLike[])
  if (state !== "free") {
    const why = state === "seated" ? `${hero.name} already walks the Underdark this run.` : `Someone is already waiting to be ${hero.name}.`
    return Response.json({ ok: false, error: why, availability: state }, { status: 409 })
  }

  const code = await freshClaimCode(admin, "forge/claim-canon")
  if (!code) return Response.json({ ok: false, error: "Could not issue your words. Try again." }, { status: 500 })

  const { error } = await admin.from("forge_submissions").insert({
    claim_code: code, player_name: playerName, hero_name: hero.name,
    payload: canonPayload(hero), assets: {}, status: "pending", canon_character_id: hero.id,
  })
  if (error) {
    console.error("[forge/claim-canon] insert failed:", error.message)
    return Response.json({ ok: false, error: "The door could not keep your claim." }, { status: 500 })
  }
  return Response.json({ ok: true, code, heroName: hero.name }, { status: 200 })
}
