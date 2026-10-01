// The alchemy bench, seen by ONE player.
//
//   GET ?characterId=…  → what this character can put on the bench, what
//                         they already know about it, the flasks they carry,
//                         and the modifiers for the two rolls the bench asks for.
//
// The player-facing twin of /api/alchemy/bench. That route is DM-gated
// because it returns every ingredient's full four-effect grid — the thing
// players are meant to discover one column at a time. This one never does:
// an unknown column leaves here as `null`, never as its effect slug, and the
// effect vocabulary returned is only the effects this character has learned
// or is carrying in a flask. A test holds that line (alchemy-pack.test.ts).
//
// A PLAYER READ, fenced like /api/alchemy/taste: the characterId comes from
// the caller and is never read off sessions.active_character_id (AGENTS.md §5).
//
// The roll modifiers are decided HERE, not in the browser, so every client
// rolls the same thing:
//   * brewing  = Intelligence + proficiency if the sheet has alchemist's
//                supplies or an herbalism kit (XGE tool check; the same two
//                tools /api/alchemy/brew accepts).
//   * tasting  = a Constitution save, + proficiency if proficient in CON saves.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isGrid } from "@/lib/eat-it-and-see"
import { BREW_DC } from "@/lib/alchemy-bench"
import { TASTE_SAVE_DC } from "@/lib/eat-it-and-see"
import { maskGrid, benchProficient } from "@/lib/alchemy-pack"
import { isPrep, methodOf, METHOD_TOOL, type ExtractionMethod } from "@/lib/extraction"
import { canBless, canMakeHolyWater, canPurify, isCleric } from "@/lib/alchemy-cleric"
import type { RiteSheet } from "@/lib/camp-rites"
import { canInscribe, RUNE_MATERIALS, type KnownRune } from "@/lib/alchemy-runes"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const characterId = req.nextUrl.searchParams.get("characterId")
  if (!characterId) return NextResponse.json({ error: "characterId required" }, { status: 400 })

  const db = createAdminClient()

  const { data: character } = await db
    .from("characters")
    .select("id, name, class, int_modifier, con_modifier, proficiency_bonus, sheet_proficiencies, sheet_save_proficiencies, sheet_spellcasting, sheet_skill_proficiencies")
    .eq("id", characterId)
    .maybeSingle()
  if (!character) return NextResponse.json({ error: "no such character" }, { status: 404 })

  const [{ data: pack }, { data: known }, { data: marks }] = await Promise.all([
    db.from("inventory_items").select("id, name, quantity, item_id, icon_url, brew, prep").eq("character_id", characterId),
    db.from("character_known_effects").select("item_slug, column_index").eq("character_id", characterId),
    db.from("character_known_runes").select("school, learned_via").eq("character_id", characterId),
  ])

  const itemIds = [...new Set((pack ?? []).map((p) => p.item_id).filter(Boolean) as string[])]
  const names = [...new Set((pack ?? []).filter((p) => !p.item_id).map((p) => p.name as string))]
  const [{ data: byId }, { data: byName }] = await Promise.all([
    itemIds.length
      ? db.from("items").select("id, slug, name, icon_url, alchemy_effects, properties").in("id", itemIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    names.length
      ? db.from("items").select("id, slug, name, icon_url, alchemy_effects, properties").in("name", names)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ])
  const catalogById = new Map((byId ?? []).map((r) => [r.id as string, r]))
  const catalogByName = new Map((byName ?? []).map((r) => [r.name as string, r]))

  const knownBySlug = new Map<string, number[]>()
  for (const k of known ?? []) {
    const s = k.item_slug as string
    knownBySlug.set(s, [...(knownBySlug.get(s) ?? []), k.column_index as number])
  }

  // Ingredients: anything in the pack whose catalogue row carries a grid.
  // `quantity` is everything held; only `prepared` can go into a brew
  // (extraction, Sam 2026-10-01). `bruised` is the part of `prepared` that
  // will cost a point of impurity — the bench uses clean ones first.
  const ingredients = new Map<string, {
    slug: string; name: string; icon: string | null; quantity: number
    raw: number; prepared: number; bruised: number
    method: ExtractionMethod | null; tool: string | null
    columns: (string | null)[]
  }>()
  let holyWater = 0
  let blessedWater = 0
  let vials = 0
  let silver = 0
  let runeMaterials = 0
  const flasks: Array<{ id: string; name: string; potency: number; impurity: number; effects: string[] }> = []

  for (const p of pack ?? []) {
    if (p.brew && typeof p.brew === "object") {
      const b = p.brew as { effects?: unknown; potency?: unknown; impurity?: unknown }
      flasks.push({
        id: p.id as string,
        name: p.name as string,
        potency: Number(b.potency) || 1,
        impurity: Number(b.impurity) || 0,
        effects: Array.isArray(b.effects) ? b.effects.filter((e): e is string => typeof e === "string") : [],
      })
      continue
    }
    const row = (p.item_id ? catalogById.get(p.item_id as string) : catalogByName.get(p.name as string)) as
      | { slug: string; name: string; icon_url: string | null; alchemy_effects: unknown; properties: unknown } | undefined
    if (!row) continue
    if (!p.prep) {
      const n = Number(p.quantity ?? 1)
      if (row.slug === "holy-water") holyWater += n
      if (row.slug === "blessed-water") blessedWater += n
      if (row.slug === "glass-vial") vials += n
      if (row.slug === "powdered-silver") silver += n
      if ((RUNE_MATERIALS as readonly string[]).includes(row.slug)) runeMaterials += n
    }
    if (!isGrid(row.alchemy_effects)) continue
    const prev = ingredients.get(row.slug)
    const q = Number(p.quantity ?? 1)
    const prep = isPrep(p.prep) ? p.prep : null
    const method = methodOf(row.slug, row.properties)
    ingredients.set(row.slug, {
      slug: row.slug,
      name: row.name,
      icon: prev?.icon ?? row.icon_url ?? (p.icon_url as string | null),
      quantity: (prev?.quantity ?? 0) + q,
      raw: (prev?.raw ?? 0) + (prep ? 0 : q),
      prepared: (prev?.prepared ?? 0) + (prep ? q : 0),
      bruised: (prev?.bruised ?? 0) + (prep?.bruised ? q : 0),
      method,
      tool: method ? METHOD_TOOL[method] : null,
      columns: maskGrid(row.alchemy_effects, knownBySlug.get(row.slug) ?? []),
    })
  }

  // The vocabulary: only effects this character can already see.
  const visible = new Set<string>()
  for (const i of ingredients.values()) for (const c of i.columns) if (c) visible.add(c)
  for (const f of flasks) for (const e of f.effects) visible.add(e)
  const { data: effects } = visible.size
    ? await db.from("alchemy_effects").select("slug, name, category, summary, is_harmful").in("slug", [...visible])
    : { data: [] }

  const prof = Number(character.proficiency_bonus ?? 2)
  const proficient = benchProficient(character.sheet_proficiencies)
  const conSave = Array.isArray(character.sheet_save_proficiencies) &&
    (character.sheet_save_proficiencies as unknown[]).some((s) => String(s).toLowerCase() === "con")

  return NextResponse.json({
    character: { id: character.id, name: character.name, class: character.class },
    ingredients: [...ingredients.values()].sort((a, b) => a.name.localeCompare(b.name)),
    flasks,
    bases: { water: true, holyWater, blessedWater },
    // What a cleric can do at the bench, each with the reason when they can't.
    cleric: isCleric(character)
      ? (() => {
          const sheet = character as unknown as RiteSheet
          const h = { vials, silver }
          const b = canBless(sheet, h), w = canMakeHolyWater(sheet, h), p = canPurify(sheet)
          return {
            vials, silver,
            bless: b.ok ? { ok: true } : { ok: false, reason: b.reason },
            holyWater: w.ok ? { ok: true } : { ok: false, reason: w.reason },
            purify: p.ok ? { ok: true } : { ok: false, reason: p.reason },
          }
        })()
      : null,
    effects: effects ?? [],
    // The marks this character knows, each with whether they can inscribe it
    // tonight. Learning a mark happens in the world, never here.
    runes: {
      materials: runeMaterials,
      marks: ((marks ?? []) as KnownRune[]).map((m) => {
        const g = canInscribe(character as { name: string; class?: string | null; sheet_skill_proficiencies?: unknown }, (marks ?? []) as KnownRune[], m.school, runeMaterials)
        return { school: m.school, learnedVia: m.learned_via, ok: g.ok, reason: g.ok ? null : g.reason }
      }),
    },
    rolls: {
      brew: { ability: "INT", modifier: Number(character.int_modifier ?? 0) + (proficient ? prof : 0), proficient, dc: BREW_DC },
      // Extraction is the same check against the same DC (lib/extraction.ts).
      extract: { ability: "INT", modifier: Number(character.int_modifier ?? 0) + (proficient ? prof : 0), proficient, dc: BREW_DC },
      taste: { ability: "CON", modifier: Number(character.con_modifier ?? 0) + (conSave ? prof : 0), dc: TASTE_SAVE_DC },
    },
  })
}
