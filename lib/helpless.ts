// What a target's condition does to the attack roll against it.
//
// SRD 5.1, Appendix PH-A "Conditions", the sentences that speak about
// attack rolls made AGAINST the creature:
//
//   Blinded      "Attack rolls against the creature have advantage."
//   Invisible    "Attack rolls against the creature have disadvantage."
//   Paralyzed    "Attack rolls against the creature have advantage. Any
//                 attack that hits the creature is a critical hit if the
//                 attacker is within 5 feet of the creature."
//   Petrified    "Attack rolls against the creature have advantage."
//   Prone        "An attack roll against the creature has advantage if the
//                 attacker is within 5 feet of the creature. Otherwise, the
//                 attack roll has disadvantage."
//   Restrained   "Attack rolls against the creature have advantage."
//   Stunned      "Attack rolls against the creature have advantage."
//   Unconscious  "Attack rolls against the creature have advantage. Any
//                 attack that hits the creature is a critical hit if the
//                 attacker is within 5 feet of the creature."
//
// And the rule for both at once: "If circumstances cause a roll to have both
// advantage and disadvantage, you are considered to have neither of them."
//
// This is why a downed character matters: #367 made Kenta Unconscious at 0,
// and a critical against him costs two death saves. Until now the drow
// standing over him rolled as if he were on his feet.
//
// Pure. The route and the NPC AI both call it; the tests walk every line.

export interface AttackContext {
  advantage: boolean
  disadvantage: boolean
  /** A hit becomes a critical: Paralyzed or Unconscious, attacker within 5 ft. */
  autoCrit: boolean
  /** The words for the log, e.g. "advantage — unconscious". Null when nothing applies. */
  note: string | null
}

const ADVANTAGE = ["blinded", "paralyzed", "petrified", "restrained", "stunned", "unconscious"]
const HELPLESS = ["paralyzed", "unconscious"]

const norm = (c: string) => c.trim().toLowerCase()

/**
 * Every source of advantage or disadvantage on this roll, NAMED and NOT yet
 * cancelled.
 *
 * Gathering before cancelling is the whole point, and it is the bug that
 * appears the moment a second source is bolted on afterwards. SRD: "If
 * circumstances cause a roll to have both advantage and disadvantage, you are
 * considered to have neither of them" — that is one judgement over ALL
 * sources, not a running total.
 *
 * Concretely: a Restrained target (advantage) that is also Prone and out of
 * reach (disadvantage) already cancels to neither. If an exhausted attacker
 * then had disadvantage ADDED to that result, the roll would come out at
 * disadvantage — when by the rule it is still neither, because an advantage
 * source was present all along. Cancelling once, at the end, is the only
 * arrangement that survives a third source being added later.
 */
export interface RollSources {
  advantage: string[]
  disadvantage: string[]
  autoCrit: boolean
}

/** The target's conditions, as sources rather than as a verdict. */
export function attackSources(targetConditions: string[], distanceFt: number): RollSources {
  const has = (word: string) => targetConditions.some((c) => norm(c) === word)
  const close = distanceFt <= 5
  const advantage = ADVANTAGE.filter(has)
  const disadvantage: string[] = []
  if (has("invisible")) disadvantage.push("invisible")
  if (has("prone")) {
    if (close) advantage.push("prone")
    else disadvantage.push("prone, out of reach")
  }
  return { advantage, disadvantage, autoCrit: close && HELPLESS.some(has) }
}

/** Apply the cancel rule ONCE, over everything gathered, and word it. */
export function resolveSources(s: RollSources): AttackContext {
  const hasAdv = s.advantage.length > 0
  const hasDis = s.disadvantage.length > 0
  const both = hasAdv && hasDis
  const advantage = hasAdv && !both
  const disadvantage = hasDis && !both
  const parts: string[] = []
  if (advantage) parts.push(`advantage — ${s.advantage.join(", ")}`)
  else if (disadvantage) parts.push(`disadvantage — ${s.disadvantage.join(", ")}`)
  else if (both) parts.push(`advantage and disadvantage cancel (${s.advantage.join(", ")} vs ${s.disadvantage.join(", ")})`)
  if (s.autoCrit) parts.push("critical — helpless within 5 ft")
  return { advantage, disadvantage, autoCrit: s.autoCrit, note: parts.length ? parts.join("; ") : null }
}

/**
 * The full picture for one attack: what the TARGET's condition does to it, and
 * what the ATTACKER's own state does.
 *
 * The attacker half is new. Until now this file only ever asked about the
 * creature being hit, so a character at exhaustion 3 — "disadvantage on attack
 * rolls and saving throws" — swung exactly as well as a rested one.
 */
export function attackContext(a: {
  targetConditions: string[]
  distanceFt: number
  /** SRD exhaustion level of the ATTACKER. 3+ is disadvantage on attacks. */
  attackerExhaustion?: number
  /** Anything the caller already knows, e.g. a rogue's own advantage. */
  extraAdvantage?: string[]
  extraDisadvantage?: string[]
}): AttackContext {
  const s = attackSources(a.targetConditions, a.distanceFt)
  if ((a.attackerExhaustion ?? 0) >= 3) s.disadvantage.push("exhausted")
  if (a.extraAdvantage?.length) s.advantage.push(...a.extraAdvantage)
  if (a.extraDisadvantage?.length) s.disadvantage.push(...a.extraDisadvantage)
  return resolveSources(s)
}

/**
 * A saving throw or an ability check made BY a character.
 *
 * SRD exhaustion: level 1 is disadvantage on ability CHECKS, level 3 is
 * disadvantage on attack rolls and SAVING THROWS. Two different thresholds,
 * which is why `kind` is not optional — defaulting it would silently give a
 * level-1 character disadvantage on their saves, which the SRD does not.
 */
export function rollerContext(a: {
  kind: "check" | "save"
  exhaustion?: number
  extraAdvantage?: string[]
  extraDisadvantage?: string[]
}): AttackContext {
  const level = a.exhaustion ?? 0
  const s: RollSources = { advantage: a.extraAdvantage?.slice() ?? [], disadvantage: a.extraDisadvantage?.slice() ?? [], autoCrit: false }
  const threshold = a.kind === "check" ? 1 : 3
  if (level >= threshold) s.disadvantage.push("exhausted")
  return resolveSources(s)
}

/**
 * Kept at its original signature because the NPC AI and the route both call
 * it. Now expressed through the gather-then-cancel pair above, so there is one
 * implementation of the rule rather than two that can drift.
 */
export function attackAgainst(targetConditions: string[], distanceFt: number): AttackContext {
  return resolveSources(attackSources(targetConditions, distanceFt))
}

/**
 * Roll the d20 the way the context says. Returns the roll that counts and
 * both dice when two were thrown, so the log can show the one that was
 * discarded — a table trusts a roll it can see.
 */
export function rollD20(ctx: { advantage: boolean; disadvantage: boolean }, d20: () => number): { roll: number; dice: number[] } {
  const a = d20()
  if (!ctx.advantage && !ctx.disadvantage) return { roll: a, dice: [a] }
  const b = d20()
  return { roll: ctx.advantage ? Math.max(a, b) : Math.min(a, b), dice: [a, b] }
}

/** "17 (17, 4)" when two dice were thrown, "17" when one was. */
export const showDice = (r: { roll: number; dice: number[] }) =>
  r.dice.length > 1 ? `${r.roll} (${r.dice.join(", ")})` : String(r.roll)
