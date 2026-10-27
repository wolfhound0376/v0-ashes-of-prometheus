import { type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { HERO_FILM_LOCATION, canonById } from "@/lib/canon-heroes"

// GET /api/hero-film?characterId=<uuid> — a FORGED hero's own intro film, for /awaken.
//
// Canon heroes (Kenta, Fifi, Scott, Samson) already watch theirs on /choose, so this answers null
// for them and /awaken never plays a film twice. Anyone else gets the cinematic_clips row with
// location 'hero-intro' and their character_id (Lynkes was the first, 2026-10-27). No film → null,
// and /awaken goes on exactly as before.
//
//   → { film: "/videos/heroes/<slug>.mp4" | null }
//
// Nothing secret here: the file is public under /public, and the id is the caller's own.

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("characterId") ?? ""
  if (!UUID.test(id) || canonById(id)) return Response.json({ film: null })

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
  return Response.json({ film: (data?.[0]?.video_url as string | undefined) ?? null })
}
