// lib/travel/options.ts — what the party may DO at a node, and what it costs.
//
// Sam (2026-10-14): "If there are any options at the node, a screen should pop up
// offering you options and their relative costs."
//
// An option is authored per node in `travel_node_events.payload.options` — never
// invented at runtime. A node with no authored options has none, and the march
// simply walks on; that is the ordinary case, not a gap to fill.
//
// Everything here is pure. The route (app/api/travel/route.ts, action "choose")
// applies the costs it returns: hours to the day, exhaustion to the sheet,
// supplies to the pool. The skill check is rolled here so the arithmetic and the
// source can be shown, the same discipline as the navigation check.

import type { Rng } from "./march"
import { abilityMod, proficiency, skillBonus, type SheetSlice, type Skill } from "../game-context"

export const OPTION_SOURCE = "Node options are homebrew, authored per node (travel_node_events.payload)"

/** What an option costs the party. Every field optional: an option may be free. */
export interface OptionCost {
  /** In-game hours spent. Charged to the day like a leg of road. */
  hours?: number
  /** Levels of exhaustion, applied to everyone (SRD 5.1 Exhaustion). */
  exhaustion?: number
  /** Forces the published encounter check for this stop, whatever the miles say. */
  encounter_check?: boolean
  /** Rations or water used, by the pool's own units. */
  supplies?: number
}

/** An authored option, as it sits in the node event's payload. */
export interface NodeOption {
  key: string
  label: string
  /** One line under the label. */
  detail?: string | null
  cost?: OptionCost
  /** Things the party must have: "boat", "light", "rope"… shown, never enforced silently. */
  requires?: string[]
  /** The check this option asks for, if any. */
  check?: { skill: Skill; dc: number; ability?: string }
  /** Only offered once the passive roll noticed something here. */
  hidden_until_noticed?: boolean
  /** What the DM authored as the result. Free text plus optional tags the route understands. */
  outcome?: { success?: string; failure?: string; reveals?: string | null }
}

export interface OfferedOption extends NodeOption {
  /** False when `requires` names something the party does not have. */
  available: boolean
  /** Why not, in words, when unavailable. */
  blocked_by: string[]
}

/** Read the authored options out of a node event's payload. Anything malformed is skipped, never guessed. */
export function readOptions(payload: Record<string, unknown> | null | undefined): NodeOption[] {
  const raw = (payload ?? {}).options
  if (!Array.isArray(raw)) return []
  const out: NodeOption[] = []
  for (const o of raw) {
    if (!o || typeof o !== "object") continue
    const r = o as Record<string, unknown>
    const key = typeof r.key === "string" ? r.key.trim() : ""
    const label = typeof r.label === "string" ? r.label.trim() : ""
    if (!key || !label) continue
    const cost = (r.cost && typeof r.cost === "object" ? r.cost : {}) as Record<string, unknown>
    const check = r.check && typeof r.check === "object" ? (r.check as Record<string, unknown>) : null
    out.push({
      key,
      label,
      detail: typeof r.detail === "string" ? r.detail : null,
      cost: {
        ...(Number.isFinite(Number(cost.hours)) ? { hours: Math.max(0, Number(cost.hours)) } : {}),
        ...(Number.isFinite(Number(cost.exhaustion)) ? { exhaustion: Math.max(0, Math.trunc(Number(cost.exhaustion))) } : {}),
        ...(cost.encounter_check === true ? { encounter_check: true } : {}),
        ...(Number.isFinite(Number(cost.supplies)) ? { supplies: Math.max(0, Number(cost.supplies)) } : {}),
      },
      requires: Array.isArray(r.requires) ? r.requires.map((x) => String(x)) : [],
      ...(check && typeof check.skill === "string" && Number.isFinite(Number(check.dc))
        ? { check: { skill: check.skill as Skill, dc: Math.trunc(Number(check.dc)) } }
        : {}),
      hidden_until_noticed: r.hidden_until_noticed === true,
      outcome: (r.outcome && typeof r.outcome === "object" ? (r.outcome as NodeOption["outcome"]) : {}) ?? {},
    })
  }
  return out
}

/**
 * Which options the party is actually offered, and which are greyed out.
 * A hidden option stays hidden until the passive roll found something here —
 * that is what the roll is FOR (lib/travel/notice.ts).
 */
export function offerOptions(options: readonly NodeOption[], ctx: { noticed: boolean; has: readonly string[] }): OfferedOption[] {
  const have = new Set(ctx.has.map((h) => h.toLowerCase()));
  return options
    .filter((o) => !o.hidden_until_noticed || ctx.noticed)
    .map((o) => {
      const blocked = (o.requires ?? []).filter((r) => !have.has(r.toLowerCase()))
      return { ...o, available: blocked.length === 0, blocked_by: blocked }
    })
}

/** A line for the card: "3 h · 1 exhaustion · needs a boat". Costs the party can read before choosing. */
export function costLine(o: NodeOption): string {
  const bits: string[] = []
  const c = o.cost ?? {}
  if (c.hours) bits.push(`${Math.round(c.hours * 10) / 10} h`)
  if (c.exhaustion) bits.push(`${c.exhaustion} level${c.exhaustion === 1 ? "" : "s"} of exhaustion`)
  if (c.supplies) bits.push(`${c.supplies} supplies`)
  if (c.encounter_check) bits.push("rolls for an encounter")
  if (o.check) bits.push(`${o.check.skill} DC ${o.check.dc}`)
  if (o.requires?.length) bits.push(`needs ${o.requires.join(", ")}`)
  return bits.length ? bits.join(" · ") : "free"
}

export interface ChoiceRoll {
  characterId: string
  name: string
  skill: Skill
  dc: number
  roll: number
  bonus: number
  total: number
  success: boolean
  arithmetic: string
}

export interface ChoiceOutcome {
  option: NodeOption
  /** Null when the option asks for no check. */
  roll: ChoiceRoll | null
  /** True when there is no check, or the check beat its DC. */
  success: boolean
  /** The authored line for what happened. */
  text: string | null
  /** A node_key the success revealed, if the author named one. */
  reveals: string | null
  /** The costs to apply. Charged whether the check passed or failed — the hours were spent either way. */
  cost: OptionCost
  source: string
}

/**
 * Resolve one chosen option. The best-suited character makes the check (the party
 * sends who is good at it, the way a real table does); ties go to the first.
 * Costs are charged regardless of the roll — an hour spent searching is spent.
 */
export function resolveChoice(
  option: NodeOption,
  party: readonly SheetSlice[],
  rng: Rng,
): ChoiceOutcome {
  const base = { option, cost: option.cost ?? {}, source: OPTION_SOURCE }
  if (!option.check || party.length === 0) {
    return { ...base, roll: null, success: true, text: option.outcome?.success ?? null, reveals: option.outcome?.reveals ?? null }
  }
  const skill = option.check.skill
  let best: { sheet: SheetSlice; bonus: number } | null = null
  for (const sheet of party) {
    const { mod, prof } = skillBonus(sheet, skill)
    const bonus = mod + prof
    if (!best || bonus > best.bonus) best = { sheet, bonus }
  }
  const who = best!
  const roll = 1 + Math.floor(rng() * 20)
  const total = roll + who.bonus
  const success = total >= option.check.dc
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
  return {
    ...base,
    roll: {
      characterId: who.sheet.id,
      name: who.sheet.name,
      skill,
      dc: option.check.dc,
      roll,
      bonus: who.bonus,
      total,
      success,
      arithmetic: `d20(${roll}) ${sign(who.bonus)} = ${total} vs DC ${option.check.dc}`,
    },
    success,
    text: (success ? option.outcome?.success : option.outcome?.failure) ?? null,
    reveals: success ? option.outcome?.reveals ?? null : null,
  }
}
