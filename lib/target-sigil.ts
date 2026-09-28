// ============================================================================
// THE TARGET SIGIL — a rune that lands ON the creature and resolves there.
//
// Sam, 2026-09-28, with the necrotic art: "a rune that should land on the
// target creature and animate for a necrotic spell that relies on a save."
//
// ── why this is a different thing from the arm ring ────────────────────────
//
// lib/spell-school-vfx.ts governs the ring around the CASTER'S forearm, which
// says what school is being cast. This says what is happening to the VICTIM,
// and it exists because a save-based spell has a beat the board has never
// drawn: the moment between the magic arriving and the target either throwing
// it off or not. A bolt resolves on contact and there is nothing to show. A
// Toll the Dead hangs over someone while they roll.
//
// So the sigil has three acts, and the middle one is the point:
//
//   FORM     the sigil blooms under the target as the spell arrives
//   HOLD     it sits at its brightest while the save is rolled
//   RESOLVE  it either TAKES them or is WARDED off
//
// ── the art is a one-shot, and it dictated the shape of this file ──────────
//
// Sam's source is four keys running 18.5 -> 35.2 -> 48.1 -> 14.9 mean
// luminance: an ignite, a peak, a fade. It is not a loop, though it reads like
// one. Baked as a loop the sigil guttered out and relit under the target every
// 940 ms. So the SHEET supplies FORM and RESOLVE, and HOLD is this file parking
// the playhead on the peak frame for as long as the roll takes. That is also
// why `hold` is allowed to be zero: a replay that already knows the outcome
// has nothing to wait for.
//
// No THREE import, so the timing is asserted rather than eyeballed.
// components/tactical/target-sigil.ts does the drawing.
// ============================================================================

import type { MagicSchool } from "./spell-school"

/** How the target fared. Mirrors the kit's own `outcome`. */
export type SigilOutcome = "taken" | "warded"

export type SigilAct = "form" | "hold" | "resolve" | "done"

/**
 * Sheets by school. One entry today; the registry shape is the point, so
 * giving abjuration or enchantment its own sigil later is one line and no
 * new logic.
 */
export const SCHOOL_SIGIL: Partial<Record<MagicSchool, string>> = {
  necromancy: "sigilNecrotic",
}

/** Sheets by damage type, for spells whose school is unknown. */
export const DAMAGE_SIGIL: Record<string, string> = {
  necrotic: "sigilNecrotic",
}

export interface SigilPlan {
  sheet: string
  /** Seconds for the bloom. */
  form: number
  /** Seconds parked at the peak while the save is rolled. */
  hold: number
  /** Seconds for the flare-and-fade, or the warded shatter. */
  resolve: number
}

export const DEFAULT_PLAN = { form: 0.45, hold: 0.40, resolve: 0.55 } as const

/**
 * Whether this spell draws a target sigil, and which sheet.
 *
 * Three things must all hold, and each one is load-bearing:
 *
 *   - it RESOLVES BY A SAVE. An attack-roll spell has no hanging moment — it
 *     hits or it misses and the answer is already known when it lands.
 *   - it is NECROMANTIC, by 5e school or by damage type. The art is a
 *     necrotic sigil and nothing else may wear it.
 *   - it PICKS A CREATURE. An area spell lands on ground, and the splash
 *     system already draws every body inside the shape; stacking a sigil on
 *     each of them would be the same beat drawn twice.
 *
 * Null means the spell keeps whatever it does today.
 */
export function targetSigilFor(opts: {
  resolve?: string | null
  school?: MagicSchool | null
  damage?: string | null
  /** True when the spell covers ground rather than naming a creature. */
  isArea?: boolean
}): SigilPlan | null {
  if (opts.resolve !== "save") return null
  if (opts.isArea) return null
  const sheet =
    (opts.school ? SCHOOL_SIGIL[opts.school] : undefined) ??
    (opts.damage ? DAMAGE_SIGIL[opts.damage] : undefined)
  if (!sheet) return null
  return { sheet, ...DEFAULT_PLAN }
}

export interface SigilPose {
  act: SigilAct
  /** 0..1 through the SHEET. Parks at `peakP` for the whole hold. */
  frame: number
  /** 0..1 */
  opacity: number
  /** Multiplier on the sigil's resting size. */
  scale: number
  /**
   * Radians of SCREEN-SPACE roll — a small torque, not a spin.
   *
   * The sigil cannot spin about its own vertical axis: the 2.04:1 ellipse is
   * baked into Sam's art rather than produced by the camera, so the quad is
   * billboarded and a vertical-axis rotation has nowhere to happen. Rolling a
   * billboard far would read as the whole plate tipping over. So these stay
   * small, and what they buy is a sense of torque — the ring wrenching one way
   * as it closes, the other as it is thrown off.
   */
  spin: number
  /** True once the damage and the flinch should land. */
  struck: boolean
}

const TAU = Math.PI * 2

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v }
function ease(p: number): number { const k = clamp01(p); return k * k * (3 - 2 * k) }

/**
 * Where the sigil is at `t` seconds after it begins.
 *
 * `peakP` is the sheet's peak frame as a fraction, from the manifest — the
 * renderer passes it rather than this file assuming it, because it is a
 * property of the baked art and changes when the art is rebaked.
 *
 * The two resolutions are deliberately opposite motions, so a player reads the
 * result without waiting for the number:
 *
 *   TAKEN   the ring CONTRACTS and brightens — it closes on them and goes in.
 *   WARDED  the ring EXPANDS and thins — it breaks outward off them.
 */
export function sigilPoseAt(
  t: number,
  plan: SigilPlan,
  outcome: SigilOutcome,
  peakP: number,
): SigilPose {
  const { form, hold, resolve } = plan
  if (t < form) {
    const p = clamp01(t / form)
    return {
      act: "form",
      frame: peakP * p,
      opacity: ease(clamp01(t / (form * 0.45))),
      // Drops onto them from slightly large, which reads as landing rather
      // than as growing out of the floor.
      scale: 1.35 - 0.35 * ease(p),
      spin: TAU * 0.06 * (1 - ease(p)),
      struck: false,
    }
  }
  if (t < form + hold) {
    const p = hold > 0 ? clamp01((t - form) / hold) : 1
    return {
      act: "hold",
      frame: peakP,                       // parked: the sheet does not advance
      opacity: 1,
      // A slow breath so the hold is alive rather than a freeze-frame.
      scale: 1 + 0.03 * Math.sin(p * TAU * 1.5),
      spin: 0,
      struck: false,
    }
  }
  const u = t - form - hold
  if (u < resolve) {
    const p = clamp01(u / resolve)
    const taken = outcome === "taken"
    return {
      act: "resolve",
      frame: peakP + (1 - peakP) * ease(p),
      // Taken flares before it fades; warded just thins out.
      opacity: taken ? Math.min(1, 1.25 - p) : 1 - ease(p),
      scale: taken ? 1 - 0.30 * ease(p) : 1 + 0.85 * ease(p),
      spin: taken ? -TAU * 0.05 * ease(p) : TAU * 0.03 * ease(p),
      struck: true,
    }
  }
  return { act: "done", frame: 1, opacity: 0, scale: taken_scale(outcome), spin: 0, struck: true }
}

function taken_scale(outcome: SigilOutcome): number {
  return outcome === "taken" ? 0.70 : 1.85
}

/** Total seconds the sigil occupies, for the caller's lifetime bookkeeping. */
export function sigilDuration(plan: SigilPlan): number {
  return plan.form + plan.hold + plan.resolve
}

/**
 * The moment the hit lands, measured from the sigil's start.
 *
 * The board hangs the damage number, the flinch and the impact sound off this
 * rather than off a guessed delay, exactly as it does for a cast's onImpact:
 * the sigil is what knows when the spell actually takes, and it takes when the
 * hold ends, not when the sigil first appears.
 */
export function sigilStrikeAt(plan: SigilPlan): number {
  return plan.form + plan.hold
}
