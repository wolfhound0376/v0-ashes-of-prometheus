import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { npcCharacterId, npcKnowsName } from "@/lib/npc-acquaintance"
import {
  FOUGHT_BESIDE, NO_STANDING, addressFor, applyDeltas, askLine, askNote, askOutcome, askerFor, chooseAsk,
  importantSituation, isImportant, replyLine, theftNote, theftOutcome, THEFT_OUTCOMES, type AskKind, type Offer, type Outcome, type Standing, type TheftOutcome,
} from "@/lib/npc-asks"

// /api/npc-ask — a prisoner asks a hero for something they carry (lib/npc-asks.ts has the rules and Sam's words).
//
//   POST {action:"ask", npcName, characterId, offers:[{kind,itemName}]}
//        The map says what the hero carries that this NPC has SEEN. This decides whether they ask, for which
//        thing, and what they call the hero (the name only if they know it; warmth from character_relationships).
//        → {ask: null} or {ask: {kind, itemName, line, address, important, situation, replies}}
//        Writes nothing.
//   POST {action:"resolve", npcName, characterId, kind, itemName, outcome: gave|refused|ignored}
//        What the hero did about it. One row in relationship_events (the ledger) and the pair's row in
//        character_relationships moved by the same deltas. THIS IS THE FIRST THING THAT WRITES EITHER TABLE:
//        both were empty on 2026-11-10 although two prompts already read them.
//   POST {action:"earned", npcNames:[...], characterIds:[...]}
//        The NPCs fought beside these heroes and feel owed. It is what makes "gold if they feel they've
//        earned it" reachable at all.
//
// No migration: both tables exist (supabase/migrations/20260902040000_character_relationships.sql), writes are
// service-role only, which is this route. The map does not call this in a rehearsal (?sandbox=1).
//
// Like the other walk routes this trusts the map about what happened on it. The damage a forged call can do is
// bounded: one small, fixed delta per call, and the same outcome for the same pair is refused for a minute.

export const dynamic = "force-dynamic"

const DIMS = ["trust", "fear", "respect", "affection", "debt", "resentment"] as const
const KINDS = new Set<AskKind>(["food", "weapon", "gold"])
const OUTCOMES = new Set<Outcome>(["gave", "refused", "ignored"])
type Db = ReturnType<typeof createAdminClient>

async function standingOf(db: Db, subject: string, object: string): Promise<Standing> {
  const { data } = await db.from("character_relationships").select(DIMS.join(", ")).eq("subject_id", subject).eq("object_id", object).maybeSingle()
  if (!data) return { ...NO_STANDING }
  const row = data as unknown as Record<string, unknown>
  return Object.fromEntries(DIMS.map((d) => [d, Number(row[d] ?? 0)])) as unknown as Standing
}

/** The ledger row and the current-state row, moved by the same weighted deltas. */
async function record(db: Db, subject: string, object: string, kind: string, gravity: number, deltas: Partial<Standing>, note: string) {
  const since = new Date(Date.now() - 60_000).toISOString()
  const dup = await db.from("relationship_events").select("id").eq("subject_id", subject).eq("object_id", object).eq("kind", kind).gte("created_at", since).limit(1)
  if (dup.data?.[0]) return { ok: true, duplicate: true }
  const before = await standingOf(db, subject, object), after = applyDeltas(before, deltas)
  const ev = await db.from("relationship_events").insert({ subject_id: subject, object_id: object, kind, gravity, deltas, note, source: "walk-ask" })
  if (ev.error) return { ok: false, error: ev.error.message }
  const up = await db.from("character_relationships").upsert(
    { subject_id: subject, object_id: object, ...after, last_reason: note, updated_at: new Date().toISOString() },
    { onConflict: "subject_id,object_id" },
  )
  if (up.error) return { ok: false, error: up.error.message }
  return { ok: true, standing: after }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = String(body?.action ?? "")
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
  let db: Db
  try { db = createAdminClient() } catch { return NextResponse.json({ ask: null, ok: false, error: "no database" }) }

  if (action === "earned") {
    const names: string[] = (Array.isArray(body?.npcNames) ? body.npcNames : []).map((n: unknown) => clip(n, 60)).filter(Boolean).slice(0, 8)
    const ids: string[] = (Array.isArray(body?.characterIds) ? body.characterIds : []).map((n: unknown) => clip(n, 40)).filter(Boolean).slice(0, 8)
    const { data: heroes } = await db.from("characters").select("id,name").eq("is_player", true).in("id", ids.length ? ids : ["-"])
    let wrote = 0
    for (const name of names) {
      if (!askerFor(name)) continue
      const subject = await npcCharacterId(db, name)
      if (!subject) continue
      for (const h of heroes ?? []) {
        const r = await record(db, subject, h.id, "fought-beside", FOUGHT_BESIDE.gravity, FOUGHT_BESIDE.deltas, `${name} fought beside ${h.name}.`)
        if (r.ok && !r.duplicate) wrote++
      }
    }
    return NextResponse.json({ ok: true, wrote })
  }

  const npcName = clip(body?.npcName, 60), characterId = clip(body?.characterId, 40)
  const asker = askerFor(npcName)
  if (!npcName || !characterId || !asker) return NextResponse.json({ ask: null, ok: false })
  const [{ data: hero }, subject] = await Promise.all([
    db.from("characters").select("id,name,class,sheet_species").eq("id", characterId).eq("is_player", true).maybeSingle(),
    npcCharacterId(db, npcName),
  ])
  if (!hero || !subject) return NextResponse.json({ ask: null, ok: false })

  if (action === "ask") {
    const raw: Offer[] = (Array.isArray(body?.offers) ? body.offers : []).slice(0, 24)
      .map((o: Record<string, unknown>) => ({ kind: String(o?.kind ?? "") as AskKind, itemName: clip(o?.itemName, 80) }))
      .filter((o: Offer) => KINDS.has(o.kind) && o.itemName)
    if (!raw.length) return NextResponse.json({ ask: null })
    // Only what the hero really carries, and what the catalogue says about it (rarity; whether it opens something).
    const { data: carried } = await db.from("inventory_items").select("name,item_id,quantity").eq("character_id", hero.id)
    const have = new Map((carried ?? []).map((r) => [String(r.name).toLowerCase(), r]))
    const itemIds = (carried ?? []).map((r) => r.item_id).filter(Boolean)
    const { data: cat } = itemIds.length ? await db.from("items").select("id,rarity,properties").in("id", itemIds) : { data: [] as { id: string; rarity: string | null; properties: Record<string, unknown> | null }[] }
    const catById = new Map((cat ?? []).map((c) => [c.id, c]))
    const offers = raw.filter((o) => have.has(o.itemName.toLowerCase())).map((o) => {
      const c = catById.get(have.get(o.itemName.toLowerCase())!.item_id)
      return { ...o, rarity: c?.rarity ?? null, opens: !!(c?.properties as Record<string, unknown> | null)?.opens }
    })
    const standing = await standingOf(db, subject, hero.id)
    const pick = chooseAsk(asker, standing, offers)
    if (!pick) return NextResponse.json({ ask: null })
    const knowsName = await npcKnowsName(db, npcName, hero.id)
    const address = addressFor({ temper: asker.temper, knowsName, standing, hero: { name: hero.name, species: hero.sheet_species, cls: hero.class } })
    const important = isImportant(pick)
    return NextResponse.json({
      ask: {
        kind: pick.kind, itemName: pick.itemName, address, important,
        line: askLine(asker.temper, pick.kind, address, pick.itemName, Math.random()),
        situation: important ? importantSituation(npcName, hero.name, pick.kind, pick.itemName) : null,
        replies: { gave: replyLine(asker.temper, "gave"), refused: replyLine(asker.temper, "refused"), ignored: replyLine(asker.temper, "ignored") },
      },
    })
  }

  // CAUGHT WITH A HAND IN THEIR POCKET (Sam, 2026-11-13; lib/npc-asks.ts THEFT): what the catch did to how they feel.
  if (action === "theft") {
    const outcome = String(body?.outcome ?? "") as TheftOutcome
    const itemName = clip(body?.itemName, 80)
    if (!THEFT_OUTCOMES.includes(outcome) || !itemName) return NextResponse.json({ ok: false, error: "outcome and itemName required" }, { status: 400 })
    const o = theftOutcome(outcome)
    const r = await record(db, subject, hero.id, `theft-${outcome}`, o.gravity, o.deltas, theftNote(npcName, hero.name, outcome, itemName))
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  }

  if (action === "resolve") {
    const kind = String(body?.kind ?? "") as AskKind, outcome = String(body?.outcome ?? "") as Outcome
    const itemName = clip(body?.itemName, 80)
    if (!KINDS.has(kind) || !OUTCOMES.has(outcome) || !itemName) return NextResponse.json({ ok: false, error: "kind, outcome and itemName required" }, { status: 400 })
    const o = askOutcome(kind, outcome)
    const r = await record(db, subject, hero.id, `ask-${kind}-${outcome}`, o.gravity, o.deltas, askNote(npcName, hero.name, kind, outcome, itemName))
    return NextResponse.json(r, { status: r.ok ? 200 : 500 })
  }

  return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 })
}
