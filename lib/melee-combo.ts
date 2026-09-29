// ============================================================================
// THE COMBO CHAIN — why the second swing does not look like the first.
//
// Sam: "subsequent attacks prompt different styles of attacks."
//
// Until now a swing was a lone event. `pickClip` gave a model with three
// Attack clips a RANDOM one each time, which fixed "always the same clip" and
// introduced a quieter problem in its place: random repeats. Roll the same
// clip twice and Extra Attack looks like a stutter, not a combo — and random
// has no shape. A fighter's two swings in one turn should read as one
// sequence: cut, recover, cut back the other way.
//
// So the swing now knows WHICH swing it is. Every attacker carries a step
// that advances on each blow and resets when they stop attacking for a while.
// Step 0 is an opening cut, step 1 answers it from the other side, step 2 is
// the finisher — and then it starts over.
//
// Two things read the step:
//
//   the CLIP, rotated rather than rolled, so a model with more than one
//   attack animation walks through them in order and never repeats back to
//   back; and
//
//   the ARC, the streak the blade leaves behind it (components/tactical/
//   weapon-arc). The step decides which way the arc sweeps, how wide it is
//   and how bright — which is what makes the sequence legible even on a
//   creature rigged with exactly one attack clip. Ront has one Attack. He
//   still cuts down, then back up, then overhead, because the ARC changed
//   even though the animation could not.
//
// This file is pure: no three.js, no DOM, no clock of its own. That is what
// makes it testable, and lib/melee-combo.test.ts tests it.
// ============================================================================

import type { Archetype } from "./equipment"

/** Which blow of the sequence this is. Wraps at 3. */
export type ComboStep = 0 | 1 | 2

/** How long a chain survives with nothing happening, in milliseconds.
 *
 *  Long enough to hold across Extra Attack and across the beat between a
 *  player's two clicks; short enough that when the round comes back to this
 *  fighter half a minute later, they open with an opening cut rather than
 *  landing mid-combo on a finisher nobody saw the setup for.
 *
 *  Eight seconds is roughly the longest gap between two blows that still
 *  reads as the same exchange. */
export const COMBO_WINDOW_MS = 8000

/**
 * Remembers where each attacker is in their chain.
 *
 * Keyed by TOKEN id, not character id: two drow with the same stat block are
 * two fighters, and they should not share a rhythm — that is the unison
 * problem the idle loops already had to solve.
 */
export class MeleeCombo {
  private readonly last = new Map<string, { step: ComboStep; at: number }>()

  /**
   * Advance this attacker's chain and return the step this blow is.
   *
   * `now` is passed in rather than read from Date.now() so a test can drive
   * the clock, and so a replay could drive it from the event's own timestamp.
   */
  next(attackerId: string, now: number): ComboStep {
    const prev = this.last.get(attackerId)
    const step: ComboStep =
      !prev || now - prev.at > COMBO_WINDOW_MS
        ? 0
        : (((prev.step + 1) % 3) as ComboStep)
    this.last.set(attackerId, { step, at: now })
    return step
  }

  /** What step they are on without advancing it. Null if they have no chain running. */
  peek(attackerId: string, now: number): ComboStep | null {
    const prev = this.last.get(attackerId)
    if (!prev || now - prev.at > COMBO_WINDOW_MS) return null
    return prev.step
  }

  /** Drop a chain — a creature that died, or a board being torn down. */
  forget(attackerId: string): void {
    this.last.delete(attackerId)
  }

  clear(): void {
    this.last.clear()
  }
}

// ────────────────────────────────────────────────────────────────────────────
// THE SHAPE OF EACH SWING
// ────────────────────────────────────────────────────────────────────────────

/**
 * One swing's arc, described in the attacker's own frame.
 *
 * Angles are radians, measured in the plane the blade sweeps through, and the
 * plane itself is tilted by `tilt`. Zero is the attacker's right; angles run
 * anticlockwise seen from behind them. So a cut that starts high on the right
 * and finishes low on the left runs from about +1.2 to about -2.0.
 *
 * None of these numbers are the animation. The clip does what the clip does;
 * this is the streak the blade leaves in the air, and it is drawn to match.
 */
export interface SwingStyle {
  /** Shown in the log and the console, so a swing can be named when it looks wrong. */
  readonly name: string
  /** Where the arc begins and ends, radians in the sweep plane. */
  readonly from: number
  readonly to: number
  /**
   * Tilt of the sweep plane off horizontal, radians. 0 is a flat horizontal
   * cut at waist height; positive tips the far end of the arc downward, which
   * is what makes a downward cut read as downward from the camera's angle.
   */
  readonly tilt: number
  /** How far the arc reaches, as a multiple of the weapon's own length. */
  readonly reach: number
  /** Ribbon width as a fraction of reach. A finisher is fatter than a jab. */
  readonly width: number
  /** Brightness multiplier on the streak. The finisher is the bright one. */
  readonly glow: number
  /**
   * Clip-name fragments this step would PREFER, best first.
   *
   * A hint, never a filter: `rotateClip` only consults it to break ties when
   * a model happens to carry clips that name themselves. A model with three
   * clips called Attack, Attack_2, Attack_3 tells us nothing, and the plain
   * rotation handles it.
   */
  readonly prefers: readonly string[]
}

/** A thrust rather than a cut — the shape a spear wants for its finisher. */
const THRUST: Omit<SwingStyle, "name"> = {
  from: 0.25, to: -0.25, tilt: 0.06, reach: 1.25, width: 0.1, glow: 1.15,
  prefers: ["stab", "thrust", "lunge", "pierce"],
}

/**
 * The default chain: cut down across the body, answer it coming back up,
 * finish over the top.
 *
 * This is the sword chain and it is also the fallback, because it is the one
 * that reads correctly on ANY weapon — a mace swung along a sword's path
 * still looks like a mace being swung.
 */
const BLADE_CHAIN: readonly SwingStyle[] = [
  {
    name: "Downward cut",
    from: 1.35, to: -1.75, tilt: 0.55, reach: 1.0, width: 0.16, glow: 1.0,
    prefers: ["slash", "attack", "cut"],
  },
  {
    name: "Rising backhand",
    from: -1.9, to: 1.15, tilt: -0.42, reach: 0.95, width: 0.15, glow: 1.05,
    prefers: ["left_slash", "backhand", "counterstrike", "attack_2"],
  },
  {
    name: "Overhead finish",
    from: 2.5, to: -0.35, tilt: 0.95, reach: 1.15, width: 0.22, glow: 1.45,
    prefers: ["charged_slash", "charged", "overhead", "attack_3", "spin"],
  },
]

/**
 * Per-archetype chains. Anything not named here uses BLADE_CHAIN.
 *
 * The differences are the ones a player would actually notice across a table:
 * a dagger's arcs are SHORT and quick and stay close to the body, an axe or a
 * maul swings WIDE and heavy and finishes overhead, a spear ends in a thrust
 * rather than a cut, and a fist has no blade so its streaks are stubby.
 */
const CHAINS: Partial<Record<Archetype, readonly SwingStyle[]>> = {
  dagger: [
    { name: "Inside slash", from: 0.9, to: -0.8, tilt: 0.3, reach: 0.65, width: 0.2, glow: 0.95, prefers: ["left_slash", "slash", "knife"] },
    { name: "Reverse cut", from: -0.95, to: 0.75, tilt: -0.3, reach: 0.6, width: 0.19, glow: 1.0, prefers: ["slash", "attack_2", "knife"] },
    { name: "Stab", ...THRUST, reach: 0.7, width: 0.13, glow: 1.3 },
  ],
  axe: [
    { name: "Heavy chop", from: 1.6, to: -1.5, tilt: 0.8, reach: 1.1, width: 0.24, glow: 1.05, prefers: ["attack", "chop", "slash"] },
    { name: "Wide sweep", from: -2.2, to: 1.5, tilt: -0.1, reach: 1.2, width: 0.26, glow: 1.1, prefers: ["spin", "sweep", "attack_2"] },
    { name: "Overhead cleave", from: 2.7, to: -0.5, tilt: 1.05, reach: 1.3, width: 0.32, glow: 1.6, prefers: ["charged", "slam", "attack_3"] },
  ],
  mace: [
    { name: "Crushing swing", from: 1.5, to: -1.4, tilt: 0.7, reach: 1.0, width: 0.22, glow: 0.9, prefers: ["attack", "slam"] },
    { name: "Backswing", from: -1.8, to: 1.3, tilt: -0.25, reach: 1.0, width: 0.21, glow: 0.95, prefers: ["attack_2", "spin"] },
    { name: "Ground slam", from: 2.6, to: -0.2, tilt: 1.15, reach: 1.2, width: 0.3, glow: 1.5, prefers: ["ground_slam", "charged", "slam"] },
  ],
  spear: [
    { name: "Thrust", ...THRUST },
    { name: "Shaft sweep", from: -1.9, to: 1.6, tilt: -0.05, reach: 1.25, width: 0.14, glow: 1.0, prefers: ["sweep", "spin", "attack_2"] },
    { name: "Driving lunge", ...THRUST, reach: 1.6, width: 0.15, glow: 1.55 },
  ],
  staff: [
    { name: "Strike", from: 1.3, to: -1.3, tilt: 0.45, reach: 1.15, width: 0.13, glow: 0.85, prefers: ["attack", "strike"] },
    { name: "Reverse strike", from: -1.5, to: 1.2, tilt: -0.35, reach: 1.15, width: 0.13, glow: 0.9, prefers: ["attack_2", "spin"] },
    { name: "Spinning finish", from: 2.8, to: -0.6, tilt: 0.7, reach: 1.25, width: 0.18, glow: 1.35, prefers: ["spin", "charged", "attack_3"] },
  ],
  // NO WEAPON. A punch leaves a knuckle streak, not a blade arc: short,
  // tight, and it has to be wider to be visible at all, because there is no
  // half-metre of steel making the shape for us.
  empty: [
    { name: "Jab", ...THRUST, reach: 0.45, width: 0.3, glow: 0.9, prefers: ["high_kick", "punch", "attack"] },
    { name: "Hook", from: -1.2, to: 0.7, tilt: -0.15, reach: 0.5, width: 0.32, glow: 0.95, prefers: ["attack_2", "kick", "hook"] },
    { name: "Roundhouse", from: -2.4, to: 1.0, tilt: 0.25, reach: 0.6, width: 0.36, glow: 1.4, prefers: ["high_kick", "spin", "charged"] },
  ],
}

/** The arc this blow draws. */
export function styleFor(archetype: Archetype, step: ComboStep): SwingStyle {
  const chain = CHAINS[archetype] ?? BLADE_CHAIN
  return chain[step % chain.length]
}

/**
 * Which clip this step plays, from the pool the model actually carries.
 *
 * ROTATION, NOT A ROLL. `pickClip` rolls a die, so a model with two attack
 * clips plays the same one twice in a row half the time — and a combo whose
 * second blow repeats the first is not a combo. Walking the pool in order
 * guarantees consecutive blows differ whenever the model has the clips to
 * differ with, and costs nothing when it has one clip: `pool[step % 1]` is
 * always the same clip, which is the honest answer for a model with one
 * animation. The ARC still changes, and that is what carries the sequence.
 *
 * `prefers` gets first refusal. When a model names its clips meaningfully —
 * Left_Slash, Charged_Slash — the step takes the one that matches what it is
 * trying to be, so an overhead finisher plays the charged clip rather than
 * whatever index the rotation happened to land on.
 */
export function rotateClip(
  pool: readonly string[],
  step: ComboStep,
  style?: SwingStyle,
): string | null {
  if (!pool.length) return null
  if (pool.length === 1) return pool[0]
  if (style) {
    for (const want of style.prefers) {
      const hit = pool.find((n) => n.toLowerCase().includes(want))
      if (hit) return hit
    }
  }
  return pool[step % pool.length]
}

/**
 * How long the streak hangs in the air, in seconds.
 *
 * Tied to the clip so a slow overhead trails longer than a knife flick, but
 * clamped: a 2.8s Attack clip whose streak lasted 2.8s would still be hanging
 * there when the next blow starts, and two overlapping arcs read as smearing
 * rather than as two blows.
 */
export function arcSecondsFor(clipDuration: number, style: SwingStyle): number {
  const base = Math.max(0.28, Math.min(0.62, clipDuration * 0.3))
  return base * (0.85 + style.width)
}
