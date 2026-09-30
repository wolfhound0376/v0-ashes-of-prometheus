// The alchemy bench — everything the rehearsal page needs, in one read.
//
//   GET /api/alchemy/bench        → ingredients, effect vocabulary, players
//
// DM-GATED, and that gate is the point rather than paperwork. This returns
// the FULL four-effect grid for every ingredient, which is the entire thing
// players are supposed to discover one column at a time. Handing it to an
// unauthenticated caller would end the discovery layer for the whole
// campaign in one request.
//
// Same gate as /api/ground-items and /api/combat: x-dm-key must equal
// DM_ACCESS_CODE, and an open table with no code set stays open.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isGrid } from "@/lib/eat-it-and-see"

export const dynamic = "force-dynamic"

function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "the bench shows every grid; DM only" }, { status: 403 })
  }

  const db = createAdminClient()

  const [{ data: items }, { data: effects }, { data: characters }] = await Promise.all([
    db.from("items")
      .select("slug, name, icon_url, pixel_icon_url, description, alchemy_effects")
      .not("alchemy_effects", "is", null)
      .order("name"),
    db.from("alchemy_effects").select("slug, name, category, summary, is_harmful").order("slug"),
    db.from("characters").select("id, name, class, level, con_modifier, proficiency_bonus")
      .eq("is_player", true).order("name"),
  ])

  // A row whose grid is malformed is reported, not silently dropped: a
  // missing ingredient on this page would read as "not seeded yet" and send
  // someone looking in the wrong place.
  const ingredients = (items ?? []).map((i) => ({
    slug: i.slug as string,
    name: i.name as string,
    icon: (i.pixel_icon_url ?? i.icon_url ?? null) as string | null,
    description: (i.description ?? "") as string,
    // Spread rather than cast: Grid is a readonly 4-tuple and a cast to
    // string[] is the kind of lie tsc is right to reject.
    grid: isGrid(i.alchemy_effects) ? [...i.alchemy_effects] : null,
    malformed: !isGrid(i.alchemy_effects),
  }))

  return NextResponse.json({
    ingredients,
    effects: effects ?? [],
    characters: characters ?? [],
    counts: {
      ingredients: ingredients.length,
      malformed: ingredients.filter((i) => i.malformed).length,
      effects: (effects ?? []).length,
    },
  })
}
