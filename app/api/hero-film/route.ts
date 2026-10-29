import { type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { HERO_FILM_LOCATION, canonById } from "@/lib/canon-heroes"
import { heroFilmSeenKey } from "@/lib/hero-film"

// GET /api/hero-film?characterId=<uuid> — a hero's own intro film, for /awaken and the in-game gate.
//
// The four original canon heroes (Kenta, Fifi, Scott, Samson) watch theirs once on /choose, so this
// answers null for them and /awaken never plays a film twice. Everyone else gets the cinematic_clips
// row with location 'hero-intro' and their character_id (Lynkes was the first, 2026-10-27) — that
// includes Lynkes and Gandalf now that they stand on /choose too (Sam, 2026-10-29), because their
// film replays after every campaign restart (`filmReplays` in lib/canon-heroes.ts) and /choose marks
// it seen when it plays there. No film → null, and /awaken goes on exactly as before.
//
//   → { film: "/videos/heroes/<slug>.mp4" | null, seen: boolean }
//
// `seen` (Sam, 2026-10-27: "make sure this plays whenever lynkes plays for the first time or restarts
// campaign"): whether this hero has already watched their film in THIS run — world_flags
// `hero_film_seen:<id>`, which a restart deletes with every other flag. lib/hero-film.ts has the rule.
//
// POST { characterId, claimToken } → { ok: true } marks it seen, once the film ends or is skipped.
//
// Nothing secret here: the file is public under /public, and the id is the caller's own.

export const dynamic = "force-dynamic"

const CAMPAIGN = "ashes-of-prometheus"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("characterId") ?? ""
  if (!UUID.test(id)) return Response.json({ film: null })
  const canon = canonById(id)
  if (canon && !canon.filmReplays) return Response.json({ film: null })

  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return Response.json({ film: null }) }

  const { data, error } = await admin
    .from("cinematic_clips")
    .select("video_url")
    .eq("location", HERO_FILM_LOCATION)
    .eq("character_id", id)
    .not("video_url", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
  if (error) console.error("[hero-film] read failed:", error.message)
  const film = (data?.[0]?.video_url as string | undefined) ?? null
  if (!film) return Response.json({ film: null, seen: false })

  const { data: flag, error: flagErr } = await admin
    .from("world_flags").select("key").eq("campaign_id", CAMPAIGN).eq("key", heroFilmSeenKey(id)).maybeSingle()
  // An unreadable flag answers "not seen": the film playing twice beats it never playing.
  if (flagErr) console.error("[hero-film] seen-flag read failed:", flagErr.message)
  return Response.json({ film, seen: !!flag })
}

export async function POST(req: NextRequest) {
  let body: { characterId?: unknown; claimToken?: unknown }
  try { body = await req.json() } catch { return Response.json({ error: "bad json" }, { status: 400 }) }
  const id = typeof body.characterId === "string" ? body.characterId : ""
  const token = typeof body.claimToken === "string" ? body.claimToken : ""
  if (!UUID.test(id) || !token) return Response.json({ error: "characterId and claimToken required" }, { status: 400 })

  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return Response.json({ error: "server" }, { status: 500 }) }

  // The claim, as /api/fortune-roll checks it: only the hero's own browser marks their film watched.
  const { data: secret } = await admin.from("character_secrets").select("claim_token").eq("character_id", id).maybeSingle()
  if (!secret || secret.claim_token !== token) return Response.json({ error: "Invalid character claim" }, { status: 403 })

  const { error } = await admin.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: heroFilmSeenKey(id), value: { at: new Date().toISOString() }, set_by: "hero-film", note: "watched their intro film this run" },
    { onConflict: "campaign_id,key" },
  )
  if (error) { console.error("[hero-film] mark seen failed:", error.message); return Response.json({ error: "write failed" }, { status: 500 }) }
  return Response.json({ ok: true })
}
