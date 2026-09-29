// ============================================================================
// BREATH WEAPONS — the shape a monster exhales, read off its own stat block.
//
// A breath weapon is an area, exactly like a Burning Hands or a Lightning
// Bolt, and the board already knows how to draw one of those: lib/aoe decides
// the squares, components/tactical/aoe-decal paints them. What a breath does
// NOT have is a spellbook row. Its shape lives in prose, in bestiary.actions:
//
//   "The dragon exhales a cloud of spores in a 90-foot cone. Each creature in
//    that area must make a DC 19 Wisdom saving throw ..."
//
// So this reads the prose and hands back the same AreaSpec the spellbook
// would, and everything downstream is the spell pipeline unchanged. A new
// dragon is a new bestiary row, never new code — which is the point: the SRD
// states every breath the same few ways, and those few ways are all this
// parses.
//
// Same rule as aoe.ts: no Three.js, no React, no Supabase. Text in, grid
// facts out.
// ============================================================================

import type { AreaSpec } from "./spellbook"
import type { Cell } from "./aoe"

/**
 * Is this action a breath weapon?
 *
 * On the NAME, because that is where the SRD says it: "Fire Breath (Recharge
 * 5–6)", "Nightmare Breath (Recharge 5–6)", "Breath Weapons (Recharge 5–6)".
 * The word boundary is what keeps Water Breathing out of it.
 */
export function isBreathWeapon(name: string | null | undefined): boolean {
  return /\bbreath\b/i.test(String(name ?? ""))
}

const SHAPES = ["cone", "line", "cube", "sphere", "cylinder"] as const

/**
 * The area the action text names, or null when it names none.
 *
 * Reads the forms the SRD actually uses:
 *   "in a 90-foot cone"
 *   "in a 60-foot line that is 5 feet wide"
 *   "in a 30-foot cube"
 *   "in a 20-foot-radius sphere"
 * and the "ft." abbreviation some catalogues write instead.
 *
 * Every shape opens FROM the creature. A breath has no range to throw a point
 * to — it leaves the mouth — so even a sphere is anchored on the breather.
 *
 * Null is an honest answer. A block that says only "exhales" with no shape is
 * one the board will not draw, rather than one it draws a guessed cone for.
 */
export function breathArea(text: string | null | undefined): AreaSpec | null {
  const s = String(text ?? "")
  const m = s.match(
    /(\d+)\s*-?\s*(?:foot|feet|ft\.?)(?:\s*-?\s*radius)?\s+(cone|line|cube|sphere|cylinder)\b/i,
  )
  if (!m) return null
  const sizeFt = Number(m[1])
  const shape = m[2].toLowerCase() as (typeof SHAPES)[number]
  if (!Number.isFinite(sizeFt) || sizeFt <= 0) return null
  if (shape === "line") {
    // "that is 5 feet wide" — the width follows the line in the same sentence.
    // Absent, a line is one square wide, which is what the SRD's lines are.
    const w = s.slice(m.index ?? 0).match(/(\d+)\s*(?:foot|feet|ft\.?)\s+wide/i)
    return { shape, sizeFt, widthFt: w ? Number(w[1]) : 5, origin: "self" }
  }
  return { shape, sizeFt, origin: "self" }
}

const DAMAGE_WORDS = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const

/**
 * The damage word the breath deals — "psychic" for Nightmare Breath, "fire"
 * for a red dragon's. The FIRST one the text names, which is the breath's own;
 * anything later is usually a rider. Null when it names none (a Paralyzing
 * Breath deals no damage at all).
 */
export function breathDamageType(text: string | null | undefined): string | null {
  const m = String(text ?? "").match(new RegExp(`\\b(${DAMAGE_WORDS.join("|")})\\s+damage\\b`, "i"))
  return m ? m[1].toLowerCase() : null
}

/**
 * Is this breath a cloud of spores rather than a gout of something?
 *
 * The deep dragon's Nightmare Breath is psychic, and psychic on its own reads
 * as a bright arcane flash. What it IS is a billowing spore cloud, and the
 * text says so; this is how the look follows the text rather than the name.
 */
export function isSporeBreath(name: string | null | undefined, text: string | null | undefined): boolean {
  return /\bspores?\b/i.test(String(text ?? "")) || /\bnightmare breath\b/i.test(String(name ?? ""))
}

/**
 * The square the breath leaves from: the edge of the body, facing the aim.
 *
 * Every token on this board stands CENTRED on its square, however big it is —
 * a gargantuan dragon on (10,10) covers from about (8,8) to (12,12). A cone
 * measured from (10,10) would start inside its own chest and waste two
 * squares of its length on the dragon. So the origin steps out toward the aim
 * by the body's reach, and the cone opens from there.
 *
 * `sizeSquares` is the footprint on a side (lib/sandbox-spawn squaresFor):
 * 1 for Medium, 4 for Gargantuan. The step is ceil(n/2) - 1 — the last square
 * still under the body — because areaCells never includes its own origin, so
 * the first square of the breath is the first one outside the creature.
 *
 * Walked in Chebyshev steps, the same metric the grid's reach uses, so a
 * diagonal breath leaves from the corner of the body rather than the side.
 */
export function mouthCell(centre: Cell, aim: Cell, sizeSquares: number): Cell {
  const reach = Math.max(0, Math.ceil(Math.max(1, sizeSquares) / 2) - 1)
  const dx = aim.x - centre.x
  const dy = aim.y - centre.y
  const cheb = Math.max(Math.abs(dx), Math.abs(dy))
  if (reach === 0 || cheb === 0) return { x: centre.x, y: centre.y }
  const k = Math.min(reach, cheb) / cheb
  return { x: centre.x + Math.round(dx * k), y: centre.y + Math.round(dy * k) }
}

/** One stat-block action, as the bestiary stores it. */
export interface BreathActionRow {
  name?: string | null
  desc?: string | null
}

/** Everything the board needs to draw one breath. */
export interface BreathSpec {
  name: string
  area: AreaSpec
  damageType: string | null
  spores: boolean
}

/**
 * Find `actionName` in a creature's action list and read its breath, or null
 * when it is not a breath weapon or its text names no shape.
 *
 * Matched on the name exactly (case-folded), because that is the string the
 * turn reports; a fuzzy match could hand one dragon's breath to another
 * action on the same block.
 */
export function breathFor(actions: unknown, actionName: string): BreathSpec | null {
  if (!isBreathWeapon(actionName) || !Array.isArray(actions)) return null
  const want = actionName.trim().toLowerCase()
  const row = (actions as BreathActionRow[]).find(
    (a) => String(a?.name ?? "").trim().toLowerCase() === want,
  )
  if (!row) return null
  const area = breathArea(row.desc)
  if (!area) return null
  return {
    name: String(row.name),
    area,
    damageType: breathDamageType(row.desc),
    spores: isSporeBreath(row.name, row.desc),
  }
}
