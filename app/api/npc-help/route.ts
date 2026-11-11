import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { npcCharacterId, npcKnowsName } from "@/lib/npc-acquaintance"
import { NO_STANDING, addressFor, askerFor, type Standing } from "@/lib/npc-asks"
import { HELP_KINDS, helpLine, helperFor, offersHelp, type HelpKind } from "@/lib/npc-help"

// /api/npc-help — does this NPC step in to help a hero with a check on the map? (lib/npc-help.ts has the rule and
// Sam's words.)
//
//   POST {npcName, characterId, kind: lock|trap-find|trap-disarm}
//        → {help: null} or {help: {kind, line, address}}
//
// Reads character_relationships (how the NPC stands with this hero) and whether they know the hero's name. WRITES
// NOTHING: a hand with a lock does not yet move the relationship. The map does not call this in a rehearsal.

export const dynamic = "force-dynamic"

const DIMS = ["trust", "fear", "respect", "affection", "debt", "resentment"] as const

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
  const npcName = clip(body?.npcName, 60), characterId = clip(body?.characterId, 40), kind = clip(body?.kind, 20) as HelpKind
  const helper = helperFor(npcName)
  if (!npcName || !characterId || !helper || !HELP_KINDS.includes(kind)) return NextResponse.json({ help: null })
  let db: ReturnType<typeof createAdminClient>
  try { db = createAdminClient() } catch { return NextResponse.json({ help: null, error: "no database" }) }
  const [{ data: hero }, subject] = await Promise.all([
    db.from("characters").select("id,name,class,sheet_species").eq("id", characterId).eq("is_player", true).maybeSingle(),
    npcCharacterId(db, npcName),
  ])
  if (!hero || !subject) return NextResponse.json({ help: null })
  const { data } = await db.from("character_relationships").select(DIMS.join(", ")).eq("subject_id", subject).eq("object_id", hero.id).maybeSingle()
  const row = (data ?? {}) as unknown as Record<string, unknown>
  const standing = (data ? Object.fromEntries(DIMS.map((d) => [d, Number(row[d] ?? 0)])) : { ...NO_STANDING }) as unknown as Standing
  if (!offersHelp(helper, kind, standing, Math.random())) return NextResponse.json({ help: null })
  const knowsName = await npcKnowsName(db, npcName, hero.id)
  const temper = askerFor(npcName)?.temper ?? "wheedling"
  const address = addressFor({ temper, knowsName, standing, hero: { name: hero.name, species: hero.sheet_species, cls: hero.class } })
  return NextResponse.json({ help: { kind, address, line: helpLine(kind, address, Math.random()) } })
}
