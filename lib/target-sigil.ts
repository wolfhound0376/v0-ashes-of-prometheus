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
import { SPELL_SAVE_ABILITY } from "./spell-save-data"

/** How the target fared. Mirrors the kit's own `outcome`. */
export type SigilOutcome = "taken" | "warded"

export type SigilAct = "form" | "hold" | "resolve" | "done"

/**
 * Sheets by school. One entry today; the registry shape is the point, so
 * giving abjuration or enchantment its own sigil later is one line and no
 * new logic.
 */
export const SCHOOL_SIGIL: Partial<Record<MagicSchool, SigilArt>> = {
  necromancy:  { ring: "sigilNecroticRing",    plume: "sigilNecroticPlume" },
  enchantment: { ring: "sigilEnchantmentRing", plume: "sigilEnchantmentPlume" },
}

/** Sheets by damage type, for spells whose school is unknown. */
export const DAMAGE_SIGIL: Record<string, SigilArt> = {
  necrotic: { ring: "sigilNecroticRing", plume: "sigilNecroticPlume" },
}

/**
 * TWO LAYERS, because Sam's direction requires it (2026-09-28): "the ring
 * should stay horizontal and the magic should radiate and permeate while the
 * ring rotates clockwise."
 *
 * A billboarded quad cannot rotate about the vertical axis — turn it and the
 * whole plate visibly tips over. A ring that lies flat and spins has to be a
 * real horizontal plane in the world, and the rising plume cannot be on that
 * same plane or it would be painted onto the floor. So the source art is split
 * along the ring band:
 *
 *   ring    the sigil circle, laid FLAT on the ground and turning clockwise.
 *           Baked UN-SQUASHED: Sam drew it as a 2.04:1 ellipse because that is
 *           what the board's dimetric camera does to a circle, so the bake
 *           stretches it back and the camera puts the ellipse back itself.
 *   plume   the rising energy, standing upright and facing the camera, growing
 *           outward and through the body.
 */
export interface SigilArt {
  ring: string
  plume: string
}

export interface SigilPlan {
  art: SigilArt
  /** Seconds for the bloom. */
  form: number
  /** Seconds parked at the peak while the save is rolled. */
  hold: number
  /** Seconds for the flare-and-fade, or the warded shatter. */
  resolve: number
}

export const DEFAULT_PLAN = { form: 0.45, hold: 0.40, resolve: 0.55 } as const

/**
 * Does this spell call for a saving throw?
 *
 * lib/spellbook.ts hand-writes about sixty spells and carries `resolve` for
 * them, and that was enough while only DAMAGING spells were drawn. Enchantment
 * broke it: 45 of the 57 enchantment spells call for a save, most deal no
 * damage at all, and the spellbook has never heard of Hold Person, Charm
 * Person or Command. Asking it alone would silently draw nothing for the
 * majority of the school.
 *
 * So the spellbook is consulted first — it is hand-checked and it knows about
 * homebrew — and lib/spell-save-data.ts (generated from all 556 spells in
 * lib/data/spells.json) answers for everything else.
 */
export function callsForSave(opts: {
  resolve?: string | null
  spellName?: string | null
}): boolean {
  if (opts.resolve === "save") return true
  // An explicit non-save resolution from the spellbook WINS over the dataset:
  // a spell hand-written as an attack roll is an attack roll.
  if (opts.resolve && opts.resolve !== "save") return false
  const key = opts.spellName?.trim().toLowerCase()
  return key ? key in SPELL_SAVE_ABILITY : false
}

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
  /** The spell's name, so the save can be looked up for spells the spellbook lacks. */
  spellName?: string | null
  /** True when the spell covers ground rather than naming a creature. */
  isArea?: boolean
}): SigilPlan | null {
  if (!callsForSave({ resolve: opts.resolve, spellName: opts.spellName })) return null
  if (opts.isArea) return null
  const art =
    (opts.school ? SCHOOL_SIGIL[opts.school] : undefined) ??
    (opts.damage ? DAMAGE_SIGIL[opts.damage] : undefined)
  if (!art) return null
  return { art, ...DEFAULT_PLAN }
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
   * Cumulative rotation of the FLAT ring about the vertical axis, radians.
   *
   * Always NEGATIVE and always decreasing: negative is clockwise seen from
   * above in three.js's right-handed frame, and Sam's direction is that the
   * ring turns clockwise throughout. The two outcomes differ in SPEED, not in
   * direction — taken accelerates as it closes, warded stalls as it breaks.
   */
  spin: number
  /**
   * Scale of the upright PLUME — the magic radiating outward. Grows past 1 as
   * it spreads, independently of the ring's own scale.
   */
  radiate: number
  /** 0..1 — how much the magic has soaked into the body. Drives the inner glow. */
  permeate: number
  /**
   * 0..1 — the FLAME's own visibility, separate from the ring's opacity.
   *
   * Sam, 2026-09-28: "Making the save means the sigil rotates but no flames of
   * magic." So on a warded cast this is zero for the whole effect: the sigil
   * still forms, still turns, still resolves — the necrotic fire simply never
   * catches. The ring's `opacity` is untouched by this, which is what keeps
   * the two results reading as the same spell with different endings.
   */
  flame: number
  /** True once the damage and the flinch should land. */
  struck: boolean
}

const TAU = Math.PI * 2

/**
 * Turn rate of the ring in radians per second, per act. Integrated below so
 * the angle is continuous — a rate that jumps is fine, an ANGLE that jumps
 * makes the glyphs visibly teleport.
 */
const RATE = {
  formStart: 3.4, formEnd: 1.25,
  hold: 1.25,
  takenEnd: 4.2,      // winds up as it closes on them
  wardedEnd: 0.15,    // stalls as it is thrown off
} as const

/** Angle swept during the form act, up to `p` of the way through it. */
function formSweep(form: number, p: number): number {
  const k = clamp01(p)
  return form * k * (RATE.formStart + (RATE.formEnd - RATE.formStart) * k / 2)
}

function holdSweep(hold: number, p: number): number {
  return hold * clamp01(p) * RATE.hold
}

function resolveSweep(resolve: number, p: number, taken: boolean): number {
  const k = clamp01(p)
  const end = taken ? RATE.takenEnd : RATE.wardedEnd
  return resolve * k * (RATE.hold + (end - RATE.hold) * k / 2)
}

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
      spin: -formSweep(form, p),
      // The plume is still gathering: it rises but has not spread yet.
      radiate: 0.55 + 0.45 * ease(p),
      permeate: 0,
      flame: outcome === "taken" ? ease(p) : 0,
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
      spin: -(formSweep(form, 1) + holdSweep(hold, p)),
      // Breathing outward and soaking in while they roll.
      radiate: 1 + 0.10 * Math.sin(p * TAU),
      permeate: outcome === "taken" ? 0.35 + 0.15 * Math.sin(p * TAU * 1.5) : 0,
      flame: outcome === "taken" ? 1 : 0,
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
      spin: -(formSweep(form, 1) + holdSweep(hold, 1) + resolveSweep(resolve, p, taken)),
      // TAKEN drives inward and through them; WARDED blows outward off them.
      radiate: taken ? 1 - 0.35 * ease(p) : 1 + 1.5 * ease(p),
      permeate: taken ? Math.min(1, 0.5 + ease(p)) : 0,
      flame: taken ? Math.min(1, 1.3 - p) : 0,
      struck: true,
    }
  }
  const taken = outcome === "taken"
  return {
    act: "done",
    frame: 1,
    opacity: 0,
    scale: taken ? 0.70 : 1.85,
    spin: -(formSweep(form, 1) + holdSweep(hold, 1) + resolveSweep(resolve, 1, taken)),
    radiate: taken ? 0.65 : 2.5,
    permeate: taken ? 1 : 0,
    flame: 0,
    struck: true,
  }
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
