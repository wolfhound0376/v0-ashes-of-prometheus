/**
 * NOTHING ON THIS BOARD STANDS PERFECTLY STILL.
 *
 * Sam: "make it so all the tokens on the map have more idle movement ... it
 * still doesn't have a dynamic feel."
 *
 * Desyncing the stance clips (#419) fixed a room breathing in unison, but it
 * could only help models that HAVE a stance clip. Four of the rigs in this
 * project — the drow elite, the quaggoth, the hook horror and the giant
 * spider — ship with ZERO animation clips. They are statues, and no amount of
 * clip scheduling will ever move them. They are also, between them, most of
 * what the party fights.
 *
 * So the motion is generated instead of played. Three slow sine waves at
 * incommensurate periods, seeded per token, applied to the model's transform:
 * a breath that lifts the chest, a weight shift from foot to foot, and a
 * drift of the shoulders. None of them loop together, so the eye never finds
 * the repeat.
 *
 * WHY SO SMALL. The animation literature is unanimous that a breathing idle
 * is one to two centimetres of travel on a human — call it 1.5% of height —
 * and that a big idle reads as a character doing something rather than a
 * character existing. These amplitudes are deliberately at the bottom of what
 * is perceptible: enough that the figure is alive, not enough to look like it
 * is dancing. A creature at rest should be noticed only when it STOPS.
 */

/** One token's motion, in model-local units, to add to its base transform. */
export interface IdleOffset {
  /** Vertical, in world units where 1 unit is a five-foot square. */
  bob: number
  /** Side to side, the weight shift. */
  sway: number
  /** Shoulder drift, radians about the vertical. */
  yaw: number
}

export const STILL: IdleOffset = { bob: 0, sway: 0, yaw: 0 }

/**
 * Periods chosen to share no common multiple, so the three waves never line
 * up and the whole cycle has no audible repeat. Roughly a four-second breath,
 * a seven-second weight shift and an eleven-second drift — a resting adult
 * breathes 15-20 times a minute, which is this.
 */
const BREATH_PERIOD = 4.1
const SHIFT_PERIOD = 6.9
const DRIFT_PERIOD = 11.3

/**
 * Amplitudes, scaled by the creature's height so an ogre does not breathe
 * like a myconid. `scale` is the model's world height in units.
 */
const BREATH = 0.014
const SWAY = 0.010
const YAW = 0.022

/** Stable per-token phase, so two drow are never in step. */
export function phaseOf(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/**
 * Where this token should sit, this frame.
 *
 * `alive` is the whole reason this is a function and not an animation: a body
 * at zero hit points must lie ABSOLUTELY still. A corpse that keeps breathing
 * is worse than a statue, because the statue was never claiming anything.
 */
export function idleOffset(opts: {
  id: string
  time: number
  alive: boolean
  /** The model's height in world units; 1.2 is a six-foot humanoid. */
  height?: number
}): IdleOffset {
  if (!opts.alive) return STILL
  const p = phaseOf(opts.id)
  const t = opts.time
  // Scaled off a six-foot humanoid, and never below a third or above triple —
  // a spider should still twitch and a giant should not heave.
  const k = Math.min(3, Math.max(0.33, (opts.height ?? 1.2) / 1.2))
  const turn = Math.PI * 2
  return {
    bob: Math.sin((t / BREATH_PERIOD + p) * turn) * BREATH * k,
    sway: Math.sin((t / SHIFT_PERIOD + p * 1.7) * turn) * SWAY * k,
    yaw: Math.sin((t / DRIFT_PERIOD + p * 2.3) * turn) * YAW,
  }
}
