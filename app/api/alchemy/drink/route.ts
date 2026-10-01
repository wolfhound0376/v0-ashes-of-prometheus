// Drinking a brew.
//
//   GET  ?characterId=…&inventoryItemId=…
//        → what this flask will do, and which dice to roll. Changes nothing.
//   POST {characterId, inventoryItemId, heal?, harm?, save?}
//        → drink it: consumes the flask, applies hp, exhaustion and conditions
//   POST {…, sandbox: true}
//        → rehearsal: resolve it, write NOTHING
//
// Rules live in lib/drink-brew.ts. This route reads the row, applies what the
// module returns, and rolls nothing.
//
// THE TWO-STEP IS THE POINT. The board owns the dice, so the caller cannot
// know what to roll until the flask has been resolved — the dice depend on the
// brew's potency, which is written on the instance and not on the label. GET
// answers "what do I roll", POST takes the totals. Same discipline as
// /api/alchemy/taste, which takes the save the player already rolled.
//
// HEALING IS APPLIED BEFORE HARM, and that ordering is load-bearing rather
// than tidy. The grid genuinely produces potions that heal AND rot the same
// drinker (ripplebark + edible-mushrooms share restore-health and rot).
// Applied the other way round a drinker at 1 hp drops unconscious before the
// healing lands, which turns an interesting potion into a coin flip.
//
// THE SAVE DC IS SAM'S OWN NUMBER, NOT A NEW ONE. Harmful effects use
// TASTE_SAVE_DC — he ruled DC 10 for "column 1 happens to you", and a brew
// doing the same thing to the same throat is the same event. Potency does not
// raise it; see claude/claude_Alchemy_Drink.md for why that is flagged rather
// than silently laddered.
//
// A PLAYER VERB, fenced like /api/alchemy/taste and /api/ground-items: the
// characterId comes from the caller and is never read off
// sessions.active_character_id (AGENTS.md §5) — here that bug would pour one
// player's potion down another player's throat.
//
// Service role, because inventory_items and characters are public-read with no
// anon write policy by design.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { drinkBrew, type Dose } from "@/lib/drink-brew"
import { TASTE_SAVE_DC } from "@/lib/eat-it-and-see"
import { addCondition, normalizeConditions } from "@/lib/conditions"
import { normaliseExhaustion } from "@/lib/exhaustion"

export const dynamic = "force-dynamic"

type Db = ReturnType<typeof createAdminClient>

/** The board's log is the dialogue feed; the HUD is already subscribed. */
async function narrate(db: Db, text: string) {
  await db.from("dialogue").insert({ speaker: "Malachar", text, channel: "dm" })
}

/** Which effects in this dose are gated behind a saving throw. */
function savedEffects(dose: Dose): string[] {
  return dose.effects
    .filter((e): e is Extract<typeof e, { kind: "condition" }> => e.kind === "condition" && "save" in e && Boolean(e.save))
    .map((e) => `${e.condition} (${e.save})`)
}

async function loadFlask(db: Db, characterId: string, inventoryItemId: string) {
  const { data: character } = await db
    .from("characters")
    .select("id, name, hp_current, hp_max, conditions, exhaustion")
    .eq("id", characterId)
    .maybeSingle()
  if (!character) return { error: "no such character", status: 404 as const }

  // Scoped to the character: you cannot drink out of someone else's pack.
  const { data: row } = await db
    .from("inventory_items")
    .select("id, name, quantity, brew")
    .eq("id", inventoryItemId)
    .eq("character_id", characterId)
    .maybeSingle()
  if (!row) return { error: "that is not in this character's pack", status: 404 as const }

  const result = drinkBrew(row.brew)
  if (!result.ok) {
    return {
      error: result.reason === "no_effects"
        ? `${row.name} is a flask of sludge — it carries no effects`
        : `${row.name} is not a brewed potion`,
      status: 422 as const,
    }
  }
  return { character, row, dose: result }
}

export async function GET(req: NextRequest) {
  const characterId = req.nextUrl.searchParams.get("characterId")
  const inventoryItemId = req.nextUrl.searchParams.get("inventoryItemId")
  if (!characterId || !inventoryItemId) {
    return NextResponse.json({ error: "characterId and inventoryItemId required" }, { status: 400 })
  }

  const db = createAdminClient()
  const loaded = await loadFlask(db, characterId, inventoryItemId)
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const { character, row, dose } = loaded

  const needsSave = savedEffects(dose)
  return NextResponse.json({
    preview: true,
    character: character.name,
    item: row.name,
    potency: dose.potency,
    impurity: dose.impurity,
    roll: {
      heal: dose.heal,
      harm: dose.harm,
      // One save covers the whole dose; see the header note on the DC.
      save: needsSave.length > 0 ? { ability: "CON", dc: TASTE_SAVE_DC, gates: needsSave } : null,
    },
    conditions: dose.conditions,
    exhaustionDelta: dose.exhaustionDelta,
    rider: dose.rider,
    unknownEffects: dose.unknownEffects,
    effects: dose.effects,
    summary: dose.summary,
    flags: dose.flags,
  })
}

export async function POST(req: NextRequest) {
  let body: {
    characterId?: string
    inventoryItemId?: string
    heal?: number
    harm?: number
    save?: number
    sandbox?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 })
  }

  const { characterId, inventoryItemId } = body
  const sandbox = body.sandbox === true
  if (!characterId || !inventoryItemId) {
    return NextResponse.json({ error: "characterId and inventoryItemId required" }, { status: 400 })
  }

  const db = createAdminClient()
  const loaded = await loadFlask(db, characterId, inventoryItemId)
  if ("error" in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const { character, row, dose } = loaded

  // Refuse rather than guess. A dose drunk without its dice would silently
  // heal nothing, and the flask would be gone.
  const missing: string[] = []
  if (dose.heal && !Number.isFinite(Number(body.heal))) missing.push(`heal (${dose.heal})`)
  if (dose.harm && !Number.isFinite(Number(body.harm))) missing.push(`harm (${dose.harm} ${dose.harm.type})`)
  const needsSave = savedEffects(dose)
  if (needsSave.length > 0 && !Number.isFinite(Number(body.save))) missing.push(`save (CON vs DC ${TASTE_SAVE_DC})`)
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `roll these first and send the totals: ${missing.join(", ")}`, reason: "needs_dice", roll: { heal: dose.heal, harm: dose.harm, save: needsSave.length > 0 ? { ability: "CON", dc: TASTE_SAVE_DC } : null } },
      { status: 400 },
    )
  }

  const healed = dose.heal ? Math.max(0, Math.trunc(Number(body.heal))) : 0
  const harmed = dose.harm ? Math.max(0, Math.trunc(Number(body.harm))) : 0
  const resisted = needsSave.length > 0 ? Number(body.save) >= TASTE_SAVE_DC : true

  const hpMax = Number(character.hp_max ?? 0)
  const before = Number(character.hp_current ?? 0)
  // Heal first, clamped to max, THEN take the harm. See the header note.
  const afterHeal = hpMax > 0 ? Math.min(hpMax, before + healed) : before + healed
  const after = Math.max(0, afterHeal - harmed)

  const exhaustionBefore = normaliseExhaustion(character.exhaustion)
  const exhaustionAfter = normaliseExhaustion(exhaustionBefore + dose.exhaustionDelta)

  // A save turns aside the save-gated conditions ONLY. The rider is impurity,
  // not an effect, and impurity is never saved against — that is the whole
  // bargain of the ladder.
  const gated = new Set(
    dose.effects
      .filter((e) => e.kind === "condition" && "save" in e && Boolean(e.save))
      .map((e) => (e as { condition: string }).condition),
  )
  const landing = dose.conditions.filter((c) => (resisted ? !gated.has(c) : true))

  let conditions = normalizeConditions(character.conditions)
  for (const c of landing) conditions = addCondition(conditions, c)

  if (!sandbox) {
    const left = (row.quantity ?? 1) - 1
    if (left <= 0) await db.from("inventory_items").delete().eq("id", row.id)
    else await db.from("inventory_items").update({ quantity: left }).eq("id", row.id)

    const { error } = await db
      .from("characters")
      .update({ hp_current: after, conditions, exhaustion: exhaustionAfter })
      .eq("id", characterId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const bits: string[] = []
    if (healed) bits.push(`+${healed} hp`)
    if (harmed) bits.push(`-${harmed} ${dose.harm!.type}`)
    if (exhaustionAfter !== exhaustionBefore) bits.push(`exhaustion ${exhaustionBefore} → ${exhaustionAfter}`)
    if (landing.length) bits.push(landing.join(", "))
    await narrate(
      db,
      `${character.name} drinks ${row.name}. ${dose.summary}` +
        (bits.length ? ` (${bits.join("; ")}, ${before} → ${after} hp)` : ""),
    )
  }

  return NextResponse.json({
    sandbox,
    character: character.name,
    item: row.name,
    potency: dose.potency,
    impurity: dose.impurity,
    hp: { before, after, max: hpMax, healed, harmed },
    exhaustion: { before: exhaustionBefore, after: exhaustionAfter },
    save: needsSave.length > 0 ? { total: Number(body.save), dc: TASTE_SAVE_DC, resisted, turnedAside: resisted ? [...gated] : [] } : null,
    conditionsApplied: landing,
    conditions,
    rider: dose.rider,
    unknownEffects: dose.unknownEffects,
    effects: dose.effects,
    summary: dose.summary,
    flags: dose.flags,
  })
}
