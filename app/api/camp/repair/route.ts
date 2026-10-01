// Repair, Mend & Upgrade — the route (docs/claude_Repair_Mend_Upgrade.md §8).
//
// The rules live in lib/repair, pure and tested. This route only gathers rows,
// asks that module, and writes what it says. It is the ONLY thing that writes
// `inventory_items.condition` or inserts into `item_events`.
//
//   GET  ?characterId=<uuid>   → what this character carries and what each
//                                piece would take to put right
//   POST { characterId, inventoryItemId, action, ... }
//                              → maintain | mend | repair | salvage | degrade
//
// Service role, because inventory is not anon-writable and never will be: the
// learnings rule is that write access is never granted by an RLS policy.
//
// A repair is several checks, as crafting is. Rather than add a projects table
// for it, banked progress is counted off `item_events` itself — the successful
// `repair` rows since the instance last changed condition. The event log is
// already the item's history (Layer 1); this makes it load-bearing as well as
// narrative, and it is what `item_events_item_idx` is for.

import { createAdminClient } from "@/lib/supabase/admin"
import { settleCraftRoll, craftModifier } from "@/lib/camp"
import {
  canMend,
  cleanSlugFor,
  conditionEffect,
  conditionOf,
  degrade,
  hasTool,
  isDegradeCause,
  isRepairableFrom,
  bankedSuccesses,
  maintain,
  repairSpec,
  repairToPristineGp,
  salvage,
  type Condition,
  type DegradeCause,
} from "@/lib/repair"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CatalogRow = {
  slug: string | null
  name: string | null
  rarity: string | null
  item_type: string | null
  value: number | null
  weight: number | null
  properties: Record<string, unknown> | null
}

type PackRow = {
  id: string
  name: string
  condition: string | null
  maintained_at: string | null
  upgrades: unknown
  item_id: string | null
  items: CatalogRow | CatalogRow[] | null
}

/** The catalog row behind an instance, or the instance's own thin copy. */
function catalogOf(row: PackRow): CatalogRow & { name: string } {
  const linked = Array.isArray(row.items) ? row.items[0] : row.items
  return {
    slug: linked?.slug ?? null,
    name: linked?.name ?? row.name,
    rarity: linked?.rarity ?? null,
    item_type: linked?.item_type ?? null,
    value: linked?.value ?? null,
    weight: linked?.weight ?? null,
    properties: linked?.properties ?? null,
  }
}

async function facilitiesHere(admin: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const { data: pos } = await admin
    .from("party_position").select("node_id").order("updated_at", { ascending: false }).limit(1).maybeSingle()
  if (!pos?.node_id) return []
  const { data: node } = await admin.from("travel_nodes").select("metadata").eq("id", pos.node_id).maybeSingle()
  const f = (node?.metadata as { facilities?: unknown } | null)?.facilities
  return Array.isArray(f) ? f.filter((x): x is string => typeof x === "string") : []
}

const PACK_SELECT =
  "id, name, condition, maintained_at, upgrades, item_id, items(slug, name, rarity, item_type, value, weight, properties)"

// ---------------------------------------------------------------------------
// GET — the bench
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const characterId = new URL(req.url).searchParams.get("characterId")
  if (!characterId || !UUID.test(characterId)) {
    return Response.json({ error: "characterId required" }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error("[repair] admin client unavailable:", error)
    return Response.json({ error: "server_unavailable" }, { status: 500 })
  }

  const { data: character, error: charError } = await admin
    .from("characters").select("id, name, sheet_proficiencies").eq("id", characterId).is("archived_at", null).maybeSingle()
  if (charError) {
    console.error("[repair] character:", charError.message)
    return Response.json({ error: "read_failed" }, { status: 500 })
  }
  if (!character) return Response.json({ error: "not_found" }, { status: 404 })

  const [{ data: pack, error: packError }, facilities] = await Promise.all([
    admin.from("inventory_items").select(PACK_SELECT).eq("character_id", characterId),
    facilitiesHere(admin),
  ])
  if (packError) {
    console.error("[repair] pack:", packError.message)
    return Response.json({ error: "read_failed" }, { status: 500 })
  }

  const tools = toolList(character.sheet_proficiencies)

  const rows = (pack ?? []).map((raw) => {
    const row = raw as PackRow
    const item = catalogOf(row)
    const condition = conditionOf(row)
    const { spec, reason } = repairSpec(item, condition, { facilities })
    const mend = canMend(item, condition)
    return {
      inventoryItemId: row.id,
      name: item.name,
      slug: item.slug,
      condition,
      effect: conditionEffect(condition, item.item_type),
      maintainable: condition === "worn" || condition === "pristine",
      mend: { ok: mend.ok, to: mend.to, reason: mend.reason, flags: mend.flags },
      repair: spec
        ? { ...spec, haveTool: hasTool(tools, spec.tool), toPristineGp: repairToPristineGp(item.value, condition) }
        : null,
      repairReason: reason,
      becomesOnRepair: cleanSlugFor(item.slug),
    }
  })

  return Response.json({ character: { id: character.id, name: character.name }, facilities, tools, items: rows })
}

function toolList(sheetProficiencies: unknown): string[] {
  const t = (sheetProficiencies as { tools?: unknown } | null)?.tools
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string")
  return []
}

// ---------------------------------------------------------------------------
// POST — the work
// ---------------------------------------------------------------------------

type Body = {
  characterId?: string
  inventoryItemId?: string
  action?: string
  /** The d20 the table actually rolled, from the Three.js roller. Repair only. */
  face?: number
  /** Degrade only, and only a cause on the closed list. */
  cause?: string
  tool?: string
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 })
  }

  const { characterId, inventoryItemId, action } = body
  if (!characterId || !UUID.test(characterId)) return Response.json({ error: "characterId required" }, { status: 400 })
  if (!inventoryItemId || !UUID.test(inventoryItemId)) return Response.json({ error: "inventoryItemId required" }, { status: 400 })
  if (!action) return Response.json({ error: "action required" }, { status: 400 })

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error("[repair] admin client unavailable:", error)
    return Response.json({ error: "server_unavailable" }, { status: 500 })
  }

  const { data: character } = await admin
    .from("characters")
    .select("id, name, sheet_proficiencies, proficiency_bonus, level, str_score, dex_score, con_score, int_score, wis_score, cha_score")
    .eq("id", characterId).is("archived_at", null).maybeSingle()
  if (!character) return Response.json({ error: "character_not_found" }, { status: 404 })

  const { data: raw } = await admin.from("inventory_items").select(PACK_SELECT).eq("id", inventoryItemId).maybeSingle()
  if (!raw) return Response.json({ error: "item_not_found" }, { status: 404 })
  const row = raw as PackRow
  const item = catalogOf(row)
  const from = conditionOf(row)
  const tools = toolList(character.sheet_proficiencies)

  switch (action) {
    case "maintain": {
      const out = maintain(item, from, { name: character.name, tools }, body.tool ?? null)
      if (!out.ok) return Response.json({ ok: false, reason: out.reason }, { status: 409 })
      await admin.from("inventory_items")
        .update({ condition: out.to, maintained_at: new Date().toISOString() })
        .eq("id", inventoryItemId)
      await log(admin, { inventoryItemId, characterId, kind: "maintain", from, to: out.to, detail: { tool: body.tool ?? null } })
      return Response.json({ ok: true, from, to: out.to, note: out.note })
    }

    case "mend": {
      const out = canMend(item, from)
      if (!out.ok) return Response.json({ ok: false, reason: out.reason }, { status: 409 })
      await admin.from("inventory_items").update({ condition: out.to, condition_note: out.note }).eq("id", inventoryItemId)
      await log(admin, { inventoryItemId, characterId, kind: "mend", from, to: out.to, detail: { flags: out.flags } })
      return Response.json({ ok: true, from, to: out.to, note: out.note, flags: out.flags })
    }

    case "salvage": {
      const out = salvage(item, from)
      if (!out.ok) return Response.json({ ok: false, reason: out.reason }, { status: 409 })
      await log(admin, { inventoryItemId, characterId, kind: "salvage", from, to: from, detail: { materials: out.materials, scrapGp: out.scrapGp } })
      return Response.json({ ok: true, materials: out.materials, scrapGp: out.scrapGp, note: out.note })
    }

    case "degrade": {
      const cause = body.cause
      if (!isDegradeCause(cause)) {
        return Response.json({ ok: false, reason: `"${cause}" is not a cause on the closed list.` }, { status: 400 })
      }
      const out = degrade(item, from, cause as DegradeCause)
      if (!out.ok) return Response.json({ ok: false, reason: out.reason }, { status: 409 })
      await admin.from("inventory_items").update({ condition: out.to, condition_note: out.note }).eq("id", inventoryItemId)
      await log(admin, { inventoryItemId, characterId, kind: out.to === "destroyed" ? "destroy" : "degrade", from, to: out.to, detail: { cause } })
      return Response.json({ ok: true, from, to: out.to, note: out.note })
    }

    case "repair": {
      if (!isRepairableFrom(from)) {
        return Response.json({ ok: false, reason: repairSpec(item, from).reason }, { status: 409 })
      }
      const face = Number(body.face)
      if (!Number.isInteger(face) || face < 1 || face > 20) {
        return Response.json({ error: "face must be the d20 the table rolled, 1-20" }, { status: 400 })
      }

      const facilities = await facilitiesHere(admin)
      const { spec, reason } = repairSpec(item, from, { tool: body.tool ?? null, facilities })
      if (!spec) return Response.json({ ok: false, reason }, { status: 409 })
      if (!hasTool(tools, spec.tool)) {
        return Response.json({ ok: false, reason: `${character.name} is not proficient with ${spec.tool}.` }, { status: 409 })
      }

      // Banked progress: successful repair checks since the condition last moved.
      const { data: history } = await admin
        .from("item_events")
        .select("kind, detail, occurred_at, to_condition")
        .eq("inventory_item_id", inventoryItemId)
        .order("occurred_at", { ascending: false })
        .limit(50)
      const banked = bankedSuccesses(history ?? [])

      const pb = Number(character.proficiency_bonus ?? 0)
      const { modifier } = craftModifier(character as Record<string, number | null>, spec.abilities, pb)
      const out = settleCraftRoll({
        crafter: character.name, item: item.name, face, modifier, spec,
        successes: banked.successes, attempts: banked.attempts,
      })

      const patch: Record<string, unknown> = {}
      let to: Condition = from
      let swappedTo: string | null = null
      if (out.done) {
        to = spec.to
        patch.condition = to
        patch.condition_note = conditionEffect(to, item.item_type).note
        // Sam's ruling 5: a rusted weapon repaired past `damaged` becomes the
        // clean catalog row. Catalog-validated — the swap only happens if that
        // row actually exists.
        const clean = cleanSlugFor(item.slug)
        if (clean && from === "damaged") {
          const { data: cleanRow } = await admin.from("items").select("id, name").eq("slug", clean).maybeSingle()
          if (cleanRow) {
            patch.item_id = cleanRow.id
            patch.name = cleanRow.name
            swappedTo = clean
          }
        }
      }
      if (Object.keys(patch).length) await admin.from("inventory_items").update(patch).eq("id", inventoryItemId)

      await log(admin, {
        inventoryItemId, characterId, kind: "repair", from, to,
        detail: {
          success: out.success, total: out.total, face, modifier, dc: spec.dc,
          successes: out.successes, checks: spec.checks, done: out.done,
          materialsGp: spec.materialsGp, tool: spec.tool, swappedTo, flags: spec.flags,
        },
      })

      return Response.json({
        ok: true, success: out.success, total: out.total, dc: spec.dc,
        successes: out.successes, checks: spec.checks, done: out.done,
        from, to, swappedTo, note: out.note, flags: spec.flags,
      })
    }

    default:
      return Response.json({ error: `unknown action "${action}"` }, { status: 400 })
  }
}

async function log(
  admin: ReturnType<typeof createAdminClient>,
  e: { inventoryItemId: string; characterId: string; kind: string; from: Condition; to: Condition; detail: Record<string, unknown> },
) {
  const { error } = await admin.from("item_events").insert({
    inventory_item_id: e.inventoryItemId,
    character_id: e.characterId,
    kind: e.kind,
    from_condition: e.from,
    to_condition: e.to,
    detail: e.detail,
  })
  if (error) console.error("[repair] item_events insert:", error.message)
}
