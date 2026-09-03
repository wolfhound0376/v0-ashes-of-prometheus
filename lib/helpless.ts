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

export function attackAgainst(targetConditions: string[], distanceFt: number): AttackContext {
  const has = (word: string) => targetConditions.some((c) => norm(c) === word)
  const close = distanceFt <= 5
  const advFrom = ADVANTAGE.filter(has)
  let advantage = advFrom.length > 0
  let disadvantage = has("invisible")
  const why: string[] = advFrom.slice()
  if (has("prone")) {
    if (close) { advantage = true; why.push("prone") }
    else disadvantage = true
  }
  const autoCrit = close && HELPLESS.some(has)
  // Both cancel to neither.
  if (advantage && disadvantage) { advantage = false; disadvantage = false }
  const parts: string[] = []
  if (advantage) parts.push(`advantage — ${why.join(", ")}`)
  else if (disadvantage) parts.push(has("invisible") ? "disadvantage — invisible" : "disadvantage — prone, out of reach")
  else if (why.length > 0 || has("invisible")) parts.push("advantage and disadvantage cancel")
  if (autoCrit) parts.push(`critical — ${HELPLESS.filter(has).join(", ")} within 5 ft`)
  return { advantage, disadvantage, autoCrit, note: parts.length ? parts.join("; ") : null }
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
