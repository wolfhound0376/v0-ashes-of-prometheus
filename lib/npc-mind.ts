/**
 * NPC MINDS — the named-NPC combat tier (Sam, 2026-11-10: "Named characters should use AI to use AI bubbles, how
 * they fight, cast spells, call for help, retreat, negotiate, etc. Characters that have status should be able to
 * control the other NPCs under them accordingly.")
 *
 * The map offers a named NPC only what the page can actually do this turn (the legal options), the model picks one
 * and says one line, and this file is the gate between the two: anything the model returns that was not offered is
 * thrown away, and the map falls back to its own algorithm. The model never invents an attack, a target or an order.
 *
 * Pure functions only, so they can be tested without the network (lib/npc-mind.test.ts).
 */

export type MindAction = "attack" | "cast" | "call_for_help" | "retreat" | "negotiate" | "surrender"
export type OrderKind = "focus" | "protect" | "fall_back" | "hold"

export const MIND_ACTIONS: MindAction[] = ["attack", "cast", "call_for_help", "retreat", "negotiate", "surrender"]
/** who a spell may be aimed at: a hero (or the ground under one), one of the NPC's own side, or only the caster */
export type SpellOn = "hero" | "ally" | "self"
export interface MindSpell { name: string; on: SpellOn }
export const ORDER_KINDS: OrderKind[] = ["focus", "protect", "fall_back", "hold"]

/** What the map offers for this one turn. */
export interface MindOffer {
  actions: MindAction[]
  /** hero keys the NPC can see and go for */
  targets: string[]
  /** attack names on the NPC's own block */
  attacks: string[]
  /** spells the NPC can cast right now (slot or use left, the page can resolve it) */
  spells: MindSpell[]
  /** keys of the NPC's own side it may heal or ward (itself included) */
  allies: string[]
  /** only the commander of the fight may give orders */
  canOrder: boolean
}

export interface MindChoice {
  action: MindAction
  target: string | null
  attack: string | null
  spell: string | null
  line: string | null
  order: { kind: OrderKind; target: string | null } | null
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "")

/** The model's text → a choice that is inside the offer, or null (the map then runs its algorithm). */
export function parseMindReply(text: string, offer: MindOffer): MindChoice | null {
  const m = String(text || "").match(/\{[\s\S]*\}/)
  if (!m) return null
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(m[0])
  } catch {
    return null
  }
  const action = str(raw.action) as MindAction
  if (!offer.actions.includes(action)) return null
  let target: string | null = str(raw.target) || null
  let attack: string | null = str(raw.attack) || null
  let spell: string | null = null
  if (action === "cast") {
    const sp = offer.spells.find((x) => x.name === str(raw.spell))
    if (!sp) return null
    spell = sp.name
    attack = null
    if (sp.on === "self") target = null
    else if (!target || !(sp.on === "hero" ? offer.targets : offer.allies).includes(target)) return null
  } else if (action === "attack") {
    if (!target || !offer.targets.includes(target)) return null
    if (attack && !offer.attacks.includes(attack)) attack = null // a weapon it does not have: the map picks one
  } else {
    target = null
    attack = null
  }
  let line = str(raw.line).replace(/^["“]|["”]$/g, "")
  if (line) line = line.split(/\s+/).slice(0, 18).join(" ").slice(0, 140)
  let order: MindChoice["order"] = null
  const o = raw.order as Record<string, unknown> | null | undefined
  if (offer.canOrder && o && typeof o === "object") {
    const kind = str(o.kind) as OrderKind
    const ot = str(o.target) || null
    if (ORDER_KINDS.includes(kind)) {
      if (kind === "focus") order = ot && offer.targets.includes(ot) ? { kind, target: ot } : null
      else order = { kind, target: null }
    }
  }
  return { action, target, attack, spell, line: line || null, order }
}

/** The offer, cleaned: unknown actions dropped, lists capped. */
export function cleanOffer(o: unknown): MindOffer {
  const x = (o && typeof o === "object" ? o : {}) as Record<string, unknown>
  const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, n) : [])
  const actions = list(x.actions, 8).filter((a): a is MindAction => (MIND_ACTIONS as string[]).includes(a))
  const targets = list(x.targets, 8)
  const allies = list(x.allies, 12)
  const spells: MindSpell[] = (Array.isArray(x.spells) ? x.spells : [])
    .map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {}))
    .map((v) => ({ name: str(v.name), on: str(v.on) as SpellOn }))
    .filter((v) => v.name && ["hero", "ally", "self"].includes(v.on) && (v.on !== "hero" || targets.length) && (v.on !== "ally" || allies.length))
    .slice(0, 10)
  return {
    actions: actions.filter((a) => (a !== "attack" || targets.length) && (a !== "cast" || spells.length)),
    targets,
    attacks: list(x.attacks, 6),
    spells,
    allies,
    canOrder: x.canOrder === true,
  }
}
