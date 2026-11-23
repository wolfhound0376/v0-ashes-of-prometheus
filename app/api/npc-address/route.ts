import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { npcCharacterId, npcKnowsName } from "@/lib/npc-acquaintance"
import { NO_STANDING, addressFor, askerFor, type Standing } from "@/lib/npc-asks"

// /api/npc-address — what does each of these NPCs call this hero? "Hey shorty / hey Fifi / hey dwarf / Bard."
// (Sam, 2026-11-23, on the pixel road: 'Don't forget the bubbles, "Hey Kenta, hey elf, hey sorcerer, etc"'.)
//
// The rule is lib/npc-asks.ts addressFor, the one the item asks, the advice and the openers already use: how the
// NPC stands with the hero (character_relationships) and whether they have learned the name (lib/npc-acquaintance.ts).
//
//   POST {npcNames: [...], characterId}  →  {addresses: {<npcName>: "Kenta" | "elf" | "Sorcerer" | "shorty" ...}}
//
// READS ONLY. An NPC with no row of their own is addressed as a stranger would (what they can see).

export const dynamic = "force-dynamic"

const DIMS = ["trust", "fear", "respect", "affection", "debt", "resentment"] as const

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
  const characterId = clip(body?.characterId, 40)
  const names: string[] = [...new Set<string>((Array.isArray(body?.npcNames) ? body.npcNames : []).map((n: unknown) => clip(n, 60)).filter(Boolean))].slice(0, 12)
  if (!characterId || !names.length) return NextResponse.json({ addresses: {} })
  let db: ReturnType<typeof createAdminClient>
  try { db = createAdminClient() } catch { return NextResponse.json({ addresses: {}, error: "no database" }) }
  const { data: hero } = await db.from("characters").select("id,name,class,sheet_species").eq("id", characterId).eq("is_player", true).maybeSingle()
  if (!hero) return NextResponse.json({ addresses: {} })
  const addresses: Record<string, string> = {}
  for (const npcName of names) {
    let standing: Standing = { ...NO_STANDING }
    let knowsName = false
    try {
      const subject = await npcCharacterId(db, npcName)
      if (subject) {
        const { data } = await db.from("character_relationships").select(DIMS.join(", ")).eq("subject_id", subject).eq("object_id", hero.id).maybeSingle()
        const row = (data ?? {}) as unknown as Record<string, unknown>
        if (data) standing = Object.fromEntries(DIMS.map((d) => [d, Number(row[d] ?? 0)])) as unknown as Standing
      }
      knowsName = await npcKnowsName(db, npcName, hero.id)
    } catch { /* a stranger's address, then */ }
    addresses[npcName] = addressFor({ temper: askerFor(npcName)?.temper ?? "gruff", knowsName, standing, hero: { name: hero.name, species: hero.sheet_species, cls: hero.class } })
  }
  return NextResponse.json({ addresses })
}
