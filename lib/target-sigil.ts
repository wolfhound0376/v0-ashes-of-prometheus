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

import { SCHOOL_RAMP, type MagicSchool } from "./spell-school"
import { SPELL_SAVE_ABILITY } from "./spell-save-data"

/** The one shared mote sheet, drawn white and tinted per school. */
const MOTES = "pxPlumeMotes"

/** The one shared hit-spark sheet, likewise. */
const BURST = "pxSigilBurst"

/** How long the hit spark lasts, seconds. Six frames at 20 fps. */
export const BURST_LIFE = 0.3

/** How the target fared. Mirrors the kit's own `outcome`. */
export type SigilOutcome = "taken" | "warded"

export type SigilAct = "form" | "hold" | "resolve" | "done"

/**
 * Sheets by school. One entry today; the registry shape is the point, so
 * giving abjuration or enchantment its own sigil later is one line and no
 * new logic.
 */
export const SCHOOL_SIGIL: Partial<Record<MagicSchool, SigilArt>> = {
  necromancy:  { ring: "sigilNecroticRing",    plume: "sigilNecroticPlume",
                 motes: MOTES, burst: BURST, tint: SCHOOL_RAMP.necromancy.glow },
  enchantment: { ring: "sigilEnchantmentRing", plume: "sigilEnchantmentPlume",
                 motes: MOTES, burst: BURST, tint: SCHOOL_RAMP.enchantment.glow },
  illusion:    { ring: "sigilIllusionRing",    plume: "sigilIllusionPlume",
                 motes: MOTES, burst: BURST, tint: SCHOOL_RAMP.illusion.glow },
  // Evocation's plume is PIXEL art where the other three are painted (Sam,
  // 2026-09-28: "add pixels for flames ... paint it the same way with
  // pixels"). The ring stays painted, so the two layers sit at different
  // levels of detail on purpose. scripts/vfx/bake_school_sigil.py builds both
  // from one source and samples the flame ramp out of that source's own fire.
  // Evocation is the one school with its own hit spark rather than the
  // shared white one: Sam drew a fire blast for it (2026-09-29) and asked
  // for sparks thrown off it. It fires on the same frame BURST always has —
  // the moment the save fails, which is the middle of the effect — so this
  // is new art in an existing slot, not new timing.
  evocation:   { ring: "sigilEvocationRing",   plume: "sigilEvocationPlume",
                 motes: MOTES, burst: "sigilEvocationBurst",
                 tint: SCHOOL_RAMP.evocation.glow },
  // Transmutation's plume is DRAWN, not separated out of its ring art. That
  // source never ignites — its frames differ only by a shimmer — so there is
  // no second layer hiding in it. Sam asked for "a whirlwind of rocks and
  // wind" instead of fire, which suits the school better anyway: matter
  // lifted and turned rather than burned.
  // Conjuration has NO RING (Sam, 2026-09-29: "just remove the sigil"). Every
  // attempt to seat the tentacles on their spiral read as a sticker on the
  // floor with something pasted over it, whatever the plume sat at — the two
  // pieces of art never agreed on where the ground was. What arrives simply
  // arrives, with nothing drawn under it, which is what conjuration is.
  // The ring sheet stays baked in public/vfx; it is just not referenced.
  conjuration: { plume: "sigilConjurationPlume",
                 motes: MOTES, burst: BURST, tint: SCHOOL_RAMP.conjuration.glow },
  // Divination has NO RING either, and for a different reason from
  // conjuration: there was never a ring in the art. Sam sent a hooded seer
  // ringed by scrying eyes and asked for the figure cut out of the middle
  // (2026-09-29: "remove the character from the middle of this GIF and
  // replace it with whatever pixel art character is using the magic") — so
  // the hole IS the effect, and whoever is standing there fills it.
  //
  // SQUARE, not the default tall column: the eyes surround a figure rather
  // than rising out of a circle. 3.2 squares clears a one-square sprite on
  // every side. Kept in its own blues rather than remapped to the school's
  // purple, the way transmutation keeps its whirlwind's colours.
  divination:  { plume: "sigilDivinationPlume", plumeSize: [3.2, 3.2],
                 motes: MOTES, burst: BURST, tint: SCHOOL_RAMP.divination.glow },
  transmutation: { ring: "sigilTransmutationRing", plume: "sigilTransmutationPlume",
                 motes: MOTES, burst: BURST, tint: SCHOOL_RAMP.transmutation.glow,
                 still: true },
}

/** Sheets by damage type, for spells whose school is unknown. */
export const DAMAGE_SIGIL: Record<string, SigilArt> = {
  necrotic: { ring: "sigilNecroticRing", plume: "sigilNecroticPlume",
              motes: MOTES, burst: BURST, tint: SCHOOL_RAMP.necromancy.glow },
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
  /**
   * The flat turning circle. OPTIONAL: a school may have none, and then
   * nothing is drawn on the floor and the plume stands on its own (Sam,
   * 2026-09-29, of conjuration: "just remove the sigil"). The renderer skips
   * the load entirely rather than drawing an empty quad, so a ringless school
   * costs one fetch less, and `peak` is then read off the plume.
   */
  ring?: string
  plume: string
  /**
   * Drawn pixel embers rising through the plume. Sam, 2026-09-28: "add pixels
   * to enhance the plumes."
   *
   * The sigil sheets are painted art and everything else the kit draws is
   * pixel art; the plume was the one place the two met with nothing between
   * them. One shared white sheet (public/vfx/pxPlumeMotes) serves every
   * school, tinted below — the same trick pxFlash, pxRing and pxGlow already
   * use, so a new sigil costs no new mote art.
   */
  motes?: string
  /**
   * The fighting-game hit spark thrown on the frame the spell TAKES.
   *
   * Sam, 2026-09-28: "the sprites should look like the explosions from Street
   * Fighter." The strike frame — the end of the hold, the moment the save
   * fails — was the dramatic peak of the whole effect and had nothing punchy
   * on it; the sigil simply began to fade. This is what makes the spell land.
   *
   * White, like the motes, so one sheet serves every school.
   */
  burst?: string
  /**
   * The colour the motes and the hit spark are tinted.
   *
   * Read from SCHOOL_RAMP in lib/spell-school.ts, which is the single source
   * of truth for a school's colour on main — Sam's own school-verify.png
   * palette, adopted verbatim. An earlier draft of this file hardcoded the
   * same hexes; they matched, but a second copy of a palette is a second
   * thing to forget to update.
   */
  tint?: number
  /**
   * The ring does NOT turn: it fades up, glows, and holds still while the
   * plume rises out of it (Sam, 2026-09-29, of transmutation: "it just goes
   * from being transparent to slowly visible and glowing and then the
   * whirlwind shows. No spinning arcane sigil").
   *
   * Two things follow, and both are in sigilPoseAt rather than the renderer:
   * the spin is held at zero, and the plume is held back until the ring is
   * lit, so the two read as a sequence rather than arriving together. Without
   * the delay the whirlwind rises through a ring that is still fading in, and
   * the ring never gets its moment.
   *
   * Defaults to turning, because that is what every other school does.
   */
  still?: boolean
  /**
   * Override the plume quad's size in board squares, when the school's art is
   * not the tall 1:2 column the default FLAME_W x FLAME_H assumes.
   *
   * Divination's art is SQUARE — a ring of scrying eyes that surrounds the
   * caster rather than a flame that rises out of a circle — so forcing it
   * into the default frame stretches every eye to twice its height. The
   * quad's aspect has to follow the art, not the other way round.
   *
   * Given in squares so it reads against the board's own grid: [2.4, 4.8] is
   * the default, and divination's [3.2, 3.2] is a square that comfortably
   * clears a one-square sprite standing in the middle of it.
   */
  plumeSize?: readonly [w: number, h: number]
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
 * A STILL sigil runs twice as long, and the extra time nearly all goes to
 * FORM (Sam, 2026-09-29: "the sigil needs to last twice as long").
 *
 * Reweighting matters more than the doubling. On the default plan the ring
 * was up in 0.45s and then spent 0.95s holding and fading — so it read as
 * appearing and then going transparent, which is backwards. A still sigil has
 * no rotation to carry it, so the slow RISE is the performance: form is now
 * two thirds of the effect instead of a third of it.
 *
 * 1.50 + 0.75 + 0.55 = 2.80, exactly twice DEFAULT_PLAN's 1.40.
 */
export const STILL_PLAN = { form: 1.50, hold: 0.75, resolve: 0.55 } as const

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
  return { art, ...(art.still ? STILL_PLAN : DEFAULT_PLAN) }
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
   * The hit spark's progress: NEGATIVE while it is not playing, then 0..1
   * across BURST_LIFE from the strike frame.
   *
   * Negative rather than 0 for "not playing", because 0 is a real value — the
   * spark's own first frame — and the two must never be confused.
   *
   * Stays negative for the whole of a warded cast: the save turned the spell
   * aside, so there is nothing to detonate. Same rule as the flame.
   */
  burst: number
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
      // A still sigil takes the WHOLE form act to come up, instead of being
      // there by the 45% mark: with no rotation to watch, the fade IS the
      // entrance, so it gets the full beat.
      opacity: ease(clamp01(plan.art.still ? p : t / (form * 0.45))),
      // Drops onto them from slightly large, which reads as landing rather
      // than as growing out of the floor.
      scale: 1.35 - 0.35 * ease(p),
      spin: plan.art.still ? 0 : -formSweep(form, p),
      // The plume is still gathering: it rises but has not spread yet.
      radiate: 0.55 + 0.45 * ease(p),
      permeate: 0,
      // The plume waits for a still ring: nothing until the ring is most of
      // the way up, then it climbs through the rest of the act.
      // THE GLOW BRINGS THE WHIRLWIND, so the plume waits for the ring to be
      // nearly full. At 0.6 it began while the ring was still visibly coming
      // up and the two overlapped; at 0.75 the ring has its moment, reaches
      // its glow, and the whirlwind follows it.
      flame: outcome === "taken"
        ? ease(plan.art.still ? clamp01((p - 0.75) / 0.25) : p)
        : 0,
      burst: -1,
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
      spin: plan.art.still ? 0 : -(formSweep(form, 1) + holdSweep(hold, p)),
      // Breathing outward and soaking in while they roll.
      radiate: 1 + 0.10 * Math.sin(p * TAU),
      permeate: outcome === "taken" ? 0.35 + 0.15 * Math.sin(p * TAU * 1.5) : 0,
      flame: outcome === "taken" ? 1 : 0,
      burst: -1,
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
      spin: plan.art.still ? 0 : -(formSweep(form, 1) + holdSweep(hold, 1) + resolveSweep(resolve, p, taken)),
      // TAKEN drives inward and through them; WARDED blows outward off them.
      radiate: taken ? 1 - 0.35 * ease(p) : 1 + 1.5 * ease(p),
      permeate: taken ? Math.min(1, 0.5 + ease(p)) : 0,
      flame: taken ? Math.min(1, 1.3 - p) : 0,
      // The spark fires ON the strike frame, which is where this act begins.
      burst: taken ? clamp01(u / BURST_LIFE) : -1,
      struck: true,
    }
  }
  const taken = outcome === "taken"
  return {
    act: "done",
    frame: 1,
    opacity: 0,
    scale: taken ? 0.70 : 1.85,
    spin: plan.art.still ? 0 : -(formSweep(form, 1) + holdSweep(hold, 1) + resolveSweep(resolve, 1, taken)),
    radiate: taken ? 0.65 : 2.5,
    permeate: taken ? 1 : 0,
    flame: 0,
    burst: -1,
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
