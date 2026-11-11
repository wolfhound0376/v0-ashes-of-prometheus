import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { npcCharacterId, npcKnowsName } from "@/lib/npc-acquaintance"
import { NO_STANDING, addressFor, askerFor, type Standing } from "@/lib/npc-asks"
import { MAX_ADVICE, adviceChance, adviceLine, adviceNote, adviserFor, guideFor } from "@/lib/npc-advice"

// /api/npc-advice — which of the prisoners with the party speak up about where to go? (lib/npc-advice.ts has the
// rule and Sam's words; what each knows is the book's guide table in lib/travel/march.ts.)
//
//   POST {npcNames: [...], characterId}
//        → {advice: [{npc, line, address, note}]}   at most two voices, possibly none
//
// Reads character_relationships and whether they know the hero's name. WRITES NOTHING.

export const dynamic = "force-dynamic"

const DIMS = ["trust", "fear", "respect", "affection", "debt", "resentment"] as const

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
  const characterId = clip(body?.characterId, 40)
  const names: string[] = (Array.isArray(body?.npcNames) ? body.npcNames : []).map((n: unknown) => clip(n, 60)).filter((n: string) => n && adviserFor(n)).slice(0, 10)
  if (!characterId || !names.length) return NextResponse.json({ advice: [] })
  let db: ReturnType<typeof createAdminClient>
  try { db = createAdminClient() } catch { return NextResponse.json({ advice: [], error: "no database" }) }
  const { data: hero } = await db.from("characters").select("id,name,class,sheet_species").eq("id", characterId).eq("is_player", true).maybeSingle()
  if (!hero) return NextResponse.json({ advice: [] })
  const out: { npc: string; line: string; address: string; note: string | null }[] = []
  for (const npcName of names.sort(() => Math.random() - 0.5)) {
    if (out.length >= MAX_ADVICE) break
    const adviser = adviserFor(npcName)!
    const subject = await npcCharacterId(db, npcName)
    if (!subject) continue
    const { data } = await db.from("character_relationships").select(DIMS.join(", ")).eq("subject_id", subject).eq("object_id", hero.id).maybeSingle()
    const row = (data ?? {}) as unknown as Record<string, unknown>
    const standing = (data ? Object.fromEntries(DIMS.map((d) => [d, Number(row[d] ?? 0)])) : { ...NO_STANDING }) as unknown as Standing
    if (Math.random() >= adviceChance(adviser, standing)) continue
    const knowsName = await npcKnowsName(db, npcName, hero.id)
    const address = addressFor({ temper: askerFor(npcName)?.temper ?? "gruff", knowsName, standing, hero: { name: hero.name, species: hero.sheet_species, cls: hero.class } })
    out.push({ npc: npcName, address, line: adviceLine(adviser, address, Math.random()), note: adviceNote(guideFor(npcName)) })
  }
  return NextResponse.json({ advice: out })
}
