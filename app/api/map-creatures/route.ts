import { NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

// /api/map-creatures — the creatures that are on stage right now, for the painted map.
//
// Narration and the map must agree (Sam, 2026-10-12). Malachar registers every creature he brings in
// (app/api/chat/route.ts writes npc_encounters, from the bestiary); the map polls this and walks each
// one in, keeps it while it is active, and takes it off when Malachar sends it away or it dies.
// Monsters only: the prisoners are placed by the map's own story. Anyone may read it — the players
// can see the creature.

export const dynamic = "force-dynamic"

type Row = {
  id: string
  name: string
  is_active: boolean
  hp_current: number | null
  hp_max: number | null
  challenge_rating: string | number | null
  monster_type: string | null
  bestiary_id: string | null
  updated_at: string | null
}

const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

export async function GET() {
  const db = createAdminClient()
  const { data, error } = await db
    .from("npc_encounters")
    .select("id, name, is_active, hp_current, hp_max, challenge_rating, monster_type, bestiary_id, updated_at")
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
  if (error) return NextResponse.json({ creatures: [], error: error.message }, { status: 200 })
  const rows = (data ?? []) as Row[]
  // A monster: from the bestiary, or carrying a combat CR. Named prisoners have CR 0 / no bestiary row.
  const isMonster = (r: Row) => {
    if (r.bestiary_id) return true
    const cr = typeof r.challenge_rating === "string" && r.challenge_rating.includes("/")
      ? Number(r.challenge_rating.split("/")[0]) / Number(r.challenge_rating.split("/")[1])
      : Number(r.challenge_rating ?? 0)
    return Number.isFinite(cr) && cr > 0
  }
  const seen = new Set<string>()
  const creatures = rows.filter(isMonster).filter((r) => { const k = r.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
    .map((r) => ({ id: r.id, name: r.name, slug: slugOf(r.name), hp: r.hp_current, hpMax: r.hp_max, type: r.monster_type, since: r.updated_at }))
  return NextResponse.json({ creatures })
}
