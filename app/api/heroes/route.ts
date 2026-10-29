import { createAdminClient } from "@/lib/supabase/admin"
import { readSeated } from "@/lib/seats"
import { CANON_HEROES, HERO_FILM_LOCATION, availability, type ClaimLike } from "@/lib/canon-heroes"

// GET /api/heroes — the canon heroes (lib/canon-heroes.ts: the original four plus Lynkes and Gandalf
// since 2026-10-29) for the chooser at /choose: who is free this run, and each one's intro film when
// it has been made (cinematic_clips: location 'hero-intro', state <slug>). No code required: nothing
// here is a secret (the cards show names, classes and canon art that are already public on the site).
//
//   → { heroes: [{ slug, name, clazz, origin, hook, powers, portrait, availability, film }] }
//
// availability: "free" | "seated" (a player sits as them this run) | "claimed" (a claim waits at
// the DM's door). One of each per run — lib/canon-heroes.ts says why.

export const dynamic = "force-dynamic"

export async function GET() {
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch {
    return Response.json({ error: "Server not configured", heroes: [] }, { status: 500 })
  }

  const ids = CANON_HEROES.map((h) => h.id)
  const slugs = CANON_HEROES.map((h) => h.slug)
  const [seats, claimsRes, filmsRes] = await Promise.all([
    readSeated(admin),
    admin.from("forge_submissions").select("canon_character_id, status").in("canon_character_id", ids).eq("status", "pending"),
    admin.from("cinematic_clips").select("state, video_url, updated_at").eq("location", HERO_FILM_LOCATION).in("state", slugs).order("updated_at", { ascending: false }),
  ])
  if (claimsRes.error) console.error("[heroes] claims read failed:", claimsRes.error.message)
  if (filmsRes.error) console.error("[heroes] films read failed:", filmsRes.error.message)
  const claims = (claimsRes.data ?? []) as ClaimLike[]
  const films = new Map<string, string>()
  for (const f of filmsRes.data ?? []) if (f.state && f.video_url && !films.has(f.state)) films.set(f.state, f.video_url)

  return Response.json({
    heroes: CANON_HEROES.map((h) => ({
      slug: h.slug, name: h.name, clazz: h.clazz, origin: h.origin, hook: h.hook, powers: h.powers, portrait: h.portrait,
      availability: availability(h, seats, claims),
      film: films.get(h.slug) ?? null,
    })),
  })
}
