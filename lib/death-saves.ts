// Dropping to 0 hit points, as SRD 5.1 writes it ("Dropping to 0 Hit
// Points"), and nothing the SRD does not write.
//
// Pure. Numbers and words in, numbers and words out. The combat route owns the
// rows; this file owns the rule, so the rule can be read in one place and
// tested without a database. lib/__tests__/death-saves.test.mjs walks every
// branch below against the SRD text.
//
// The state lives in three places a player already looks at:
//   characters.hp_current   0 while down
//   characters.death_saves  { successes, failures } — this file's shape
//   characters.conditions   "Unconscious", "Stable", "Dead" — words the card
//                           and the rail already know how to show
//
// What this deliberately does NOT do: monsters. SRD: "Most DMs have a monster
// die the instant it drops to 0 hit points." The board already draws that
// with a body on the floor; nothing here touches a creature without a sheet.

export interface DeathSaves {
  successes: number
  failures: number
}

export const NO_SAVES: DeathSaves = { successes: 0, failures: 0 }

/** Where a character stands, in the SRD's own four states. */
export type Vitality = "up" | "dying" | "stable" | "dead"

export const UNCONSCIOUS = "Unconscious"
export const STABLE = "Stable"
export const DEAD = "Dead"

/** Coerce whatever jsonb holds into the shape above, clamped to 0..3. */
export function normaliseSaves(raw: unknown): DeathSaves {
  const r = (raw ?? {}) as { successes?: unknown; failures?: unknown }
  const clamp = (v: unknown) => Math.max(0, Math.min(3, Math.trunc(Number(v) || 0)))
  return { successes: clamp(r.successes), failures: clamp(r.failures) }
}

const has = (conditions: string[], word: string) =>
  conditions.some((c) => c.trim().toLowerCase() === word.toLowerCase())

/**
 * Read the state back from the two things that are stored. Hit points say
 * up or not; the conditions say which kind of not. A character at 0 with no
 * word on them is dying — that is the SRD default, and it is what a fresh
 * drop looks like before this file has written anything.
 */
export function vitalityOf(hp: number | null | undefined, conditions: string[]): Vitality {
  if (has(conditions, DEAD)) return "dead"
  if ((hp ?? 1) > 0) return "up"
  if (has(conditions, STABLE)) return "stable"
  return "dying"
}

/**
 * The three words, kept honest against the state. Everything else in the
 * list is left exactly as it was — Poisoned does not end because you fell.
 */
export function conditionsFor(existing: string[], vitality: Vitality): string[] {
  const kept = existing.filter((c) => !has([c], UNCONSCIOUS) && !has([c], STABLE) && !has([c], DEAD))
  switch (vitality) {
    case "up": return kept
    case "dying": return [...kept, UNCONSCIOUS]
    case "stable": return [...kept, UNCONSCIOUS, STABLE]
    case "dead": return [...kept, DEAD]
  }
}

export interface Outcome {
  hp: number
  saves: DeathSaves
  vitality: Vitality
  /** The sentence the log adds after the hit itself. Null when there is nothing to add. */
  note: string | null
}

/**
 * Damage to a player character.
 *
 * SRD: "When damage reduces you to 0 hit points and there is damage remaining,
 * you die if the remaining damage equals or exceeds your hit point maximum."
 * Otherwise you fall unconscious and start dying.
 *
 * SRD: "If you take any damage while you have 0 hit points, you suffer a death
 * saving throw failure. If the damage is from a critical hit, you suffer two
 * failures instead." And a stable creature that takes damage "must start
 * making death saving throws again."
 */
export function takeDamage(a: {
  label: string
  hp: number
  max: number
  amount: number
  crit?: boolean
  saves: DeathSaves
  vitality: Vitality
}): Outcome {
  if (a.amount <= 0) return { hp: a.hp, saves: a.saves, vitality: a.vitality, note: null }
  if (a.vitality === "dead") {
    return { hp: 0, saves: a.saves, vitality: "dead", note: null }
  }
  if (a.vitality === "up") {
    const next = Math.max(0, a.hp - a.amount)
    if (next > 0) return { hp: next, saves: a.saves, vitality: "up", note: null }
    const remaining = a.amount - a.hp
    if (a.max > 0 && remaining >= a.max) {
      return { hp: 0, saves: NO_SAVES, vitality: "dead", note: `${a.label} is killed outright.` }
    }
    return { hp: 0, saves: NO_SAVES, vitality: "dying", note: `${a.label} goes down.` }
  }
  // Dying or stable: the hit does not lower a number, it costs a save.
  const failures = Math.min(3, a.saves.failures + (a.crit ? 2 : 1))
  const saves = { successes: a.saves.successes, failures }
  if (failures >= 3) {
    return { hp: 0, saves, vitality: "dead", note: `${a.label} fails a death save and dies.` }
  }
  const lost = a.crit ? "two death saves" : "a death save"
  const again = a.vitality === "stable" ? " and is no longer stable" : ""
  return { hp: 0, saves, vitality: "dying", note: `${a.label} fails ${lost}${again} (${failures} of 3).` }
}

/**
 * Healing a player character.
 *
 * SRD: "If you have 0 hit points, regaining any hit points ... makes you
 * conscious." Death saves reset when you regain hit points. Healing does
 * nothing for the dead.
 */
export function heal(a: { hp: number; max: number; amount: number; vitality: Vitality; saves: DeathSaves }): Outcome {
  if (a.vitality === "dead") return { hp: 0, saves: a.saves, vitality: "dead", note: null }
  const next = Math.min(a.max, Math.max(0, a.hp) + Math.max(0, a.amount))
  if (next <= 0) return { hp: next, saves: a.saves, vitality: a.vitality, note: null }
  return { hp: next, saves: NO_SAVES, vitality: "up", note: null }
}

/**
 * The death saving throw itself. SRD: "Roll a d20. If the roll is 10 or
 * higher, you succeed. Otherwise, you fail." Three successes: stable. Three
 * failures: dead. A 1 counts as two failures. A 20: regain 1 hit point.
 *
 * The caller rolls the die — the route does, where the dice cannot be
 * argued with — and passes the number in, so this can be tested on every
 * face.
 */
export function rollDeathSave(a: { label: string; roll: number; saves: DeathSaves }): Outcome {
  if (a.roll === 20) {
    return { hp: 1, saves: NO_SAVES, vitality: "up", note: `${a.label} rolls a 20 on a death save and comes to with 1 hit point.` }
  }
  let { successes, failures } = a.saves
  if (a.roll === 1) failures = Math.min(3, failures + 2)
  else if (a.roll >= 10) successes = Math.min(3, successes + 1)
  else failures = Math.min(3, failures + 1)
  const saves = { successes, failures }
  const face = a.roll === 1 ? "a 1 — two failures" : a.roll >= 10 ? `${a.roll} — success` : `${a.roll} — failure`
  if (failures >= 3) {
    return { hp: 0, saves, vitality: "dead", note: `${a.label} rolls ${face}. Three failures. ${a.label} dies.` }
  }
  if (successes >= 3) {
    return { hp: 0, saves, vitality: "stable", note: `${a.label} rolls ${face}. Three successes: ${a.label} is stable, still unconscious.` }
  }
  return { hp: 0, saves, vitality: "dying", note: `${a.label} rolls ${face} (${successes} success${successes === 1 ? "" : "es"}, ${failures} failure${failures === 1 ? "" : "s"}).` }
}
