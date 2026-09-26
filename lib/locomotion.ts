// lib/locomotion.ts
//
// How a creature gets around, read from its stat block rather than guessed
// per sprite. `bestiary.speed` is the printed 5e speed line ("30 ft., fly
// 60 ft. (hover)", "0 ft., fly 50 ft. (hover)", "10 ft., climb 10 ft."), and
// the teleport flag comes from the traits and actions text. Pure: no
// database, no three.js, so the board and the tests share one reading.
//
// Nothing here invents movement. A creature with no fly speed printed does
// not fly on the board, whatever its sprite looks like.

export interface Locomotion {
  /** Walking speed in feet. 0 for a creature that cannot walk (a specter). */
  walk: number
  fly: number
  /** Printed "(hover)": it stays aloft with no effort and never falls when stopped. */
  hover: boolean
  climb: number
  burrow: number
  swim: number
  /**
   * The block carries a teleport, blink, misty step, dimension door or
   * ethereal jaunt: a move can cross the board as a blink rather than a walk.
   */
  teleport: boolean
}

const MODES = ["fly", "climb", "burrow", "swim"] as const

/**
 * Parse the printed speed line. The first bare number is the walking speed;
 * each "<mode> N ft." adds that mode; "(hover)" after a fly speed marks it.
 * Anything unparseable reads as a 30 ft. walker, the 5e default for a
 * Medium humanoid, so a blank row still moves rather than freezes.
 */
export function parseSpeed(speed: string | null | undefined): Omit<Locomotion, "teleport"> {
  const out = { walk: 30, fly: 0, hover: false, climb: 0, burrow: 0, swim: 0 }
  const s = String(speed ?? "").toLowerCase()
  if (!s.trim()) return out
  // The walking speed is the first number not preceded by a mode word.
  const walk = /(?:^|[,;]\s*)(\d+)\s*ft/.exec(s)
  out.walk = walk ? Number(walk[1]) : 0
  for (const mode of MODES) {
    const m = new RegExp(`${mode}\\s+(\\d+)\\s*ft`).exec(s)
    if (m) out[mode] = Number(m[1])
  }
  out.hover = out.fly > 0 && /hover/.test(s)
  return out
}

const TELEPORT = /\b(teleport|misty step|dimension door|blink|ethereal jaunt|plane shift|shadow step)\b/i

/** True when the traits or actions text carries a teleport of any kind. */
export function hasTeleport(...texts: unknown[]): boolean {
  return texts.some((t) => t != null && TELEPORT.test(typeof t === "string" ? t : JSON.stringify(t)))
}

export function locomotionOf(row: { speed?: string | null; traits?: unknown; actions?: unknown } | null | undefined): Locomotion {
  return { ...parseSpeed(row?.speed), teleport: hasTeleport(row?.traits, row?.actions) }
}

/** A creature that moves through the air rather than over the floor. */
export const isFlier = (l: Locomotion) => l.fly > 0
/** One that cannot walk at all, so it is airborne even when standing still. */
export const isAlwaysAirborne = (l: Locomotion) => l.fly > 0 && l.walk === 0
