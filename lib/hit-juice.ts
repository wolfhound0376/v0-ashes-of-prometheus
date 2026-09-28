// ============================================================================
// HIT JUICE — the Street Fighter layer. (Sam, 2026-09-28: "effects like
// street fighter?")
//
// Almost none of what makes a fighting game hit hard is artwork. Capcom's
// punch lands in FOUR channels, and three of them are pure timing:
//
//   hitstop   both figures stop dead for a few frames at the moment of
//             contact. This is the big one. It is the difference between a
//             sprite passing through another sprite and two bodies colliding.
//   shake     a short, fast, mostly VERTICAL camera rattle that decays out.
//   flash     one or two frames of white over the whole screen.
//   zoom      on the heavy stuff, the camera shoves in a couple of percent
//             and eases back.
//
// So this costs zero PixelLab generations. It is arithmetic.
//
// TWO CLOCKS, AND THIS IS THE WHOLE TRICK. During hitstop the GAME freezes:
// the sim, the sprite flipbooks, the projectile. The PRESENTATION does not:
// the hit spark keeps animating, the screen keeps shaking, the flash keeps
// fading. Freeze both and it does not read as impact, it reads as the tab
// hanging. So `step()` hands back a scaled dt for the game and a `juice`
// block that advanced on real time regardless.
//
// DETERMINISTIC, for the same reason ImpactBurst is: every seat is watching
// the same fight, so the shake is seeded, never Math.random(). Two players on
// two browsers see the board kick the same way.
//
// PURE. No THREE, no DOM, no timers — which is why it can be unit-tested and
// why it could be written while another session held combat-board-3d.tsx.
// The board applies the numbers; it does not compute them.
// ============================================================================

/**
 * How hard the thing that just landed hit. These are presentation weights,
 * not damage: a rogue's Sneak Attack and a dragon's bite can both be "heavy".
 * The board decides the mapping; this file decides what each one feels like.
 */
export type HitWeight = "light" | "medium" | "heavy" | "crit" | "ko"

interface WeightSpec {
  /** Freeze length in seconds. Quoted in frames at 60fps, as fighting games do. */
  freeze: number
  /** Peak camera offset, in board units (one square is 1). */
  shake: number
  /**
   * How long the rattle runs. ALWAYS LONGER THAN THE FREEZE, and that is the
   * correction that matters most in this file. The first cut decayed shake
   * and zoom proportionally to their own size, which collapsed them to zero
   * about a third of the way into the freeze: a KO then held twenty frames
   * with the game stopped and nothing whatsoever moving, which is precisely
   * the "reads as a hang" failure the header warns about. The camera has to
   * still be settling when the game starts again.
   */
  shakeFor: number
  /** Peak white-out, 0..1. */
  flash: number
  /** Peak zoom-in, as a fraction: 0.02 is two percent closer. */
  zoom: number
  /** How long the zoom takes to drift back out. Also longer than the freeze. */
  zoomFor: number
  /** Post-freeze slow motion rate, and how long it lasts. 1 means none. */
  slowRate: number
  slowFor: number
}

/**
 * The ladder. Freeze times are in the range fighting games actually use —
 * roughly 6 frames for a jab and 16-20 for a heavy — because the window where
 * this reads as impact rather than as lag is narrow and well explored.
 *
 * Only a KO gets slow motion. Slow-mo on ordinary hits is the single fastest
 * way to make a fight feel sluggish instead of weighty.
 */
const WEIGHTS: Record<HitWeight, WeightSpec> = {
  light:  { freeze: 6 / 60,  shake: 0.020, shakeFor: 0.18, flash: 0.25, zoom: 0.000, zoomFor: 0.00, slowRate: 1,   slowFor: 0   },
  medium: { freeze: 10 / 60, shake: 0.045, shakeFor: 0.26, flash: 0.40, zoom: 0.010, zoomFor: 0.34, slowRate: 1,   slowFor: 0   },
  heavy:  { freeze: 14 / 60, shake: 0.080, shakeFor: 0.36, flash: 0.60, zoom: 0.020, zoomFor: 0.46, slowRate: 1,   slowFor: 0   },
  crit:   { freeze: 18 / 60, shake: 0.120, shakeFor: 0.46, flash: 0.85, zoom: 0.035, zoomFor: 0.60, slowRate: 1,   slowFor: 0   },
  ko:     { freeze: 20 / 60, shake: 0.140, shakeFor: 0.70, flash: 1.00, zoom: 0.050, zoomFor: 1.10, slowRate: 0.3, slowFor: 0.9 },
}

/**
 * Rattle frequency, Hz. Fast enough to read as a jolt, not as a wobble — but
 * the ceiling here is NYQUIST, not taste. The first cut used 34 Hz, which at
 * 60fps is under two samples per cycle: the sine was aliased so badly that a
 * heavy hit specified at 0.080 peaked at 0.010 on screen, and a 120 Hz
 * monitor would have aliased it differently, so two seats watching one fight
 * would have seen two different camera kicks. 13 Hz gives ~4.6 samples per
 * cycle at 60fps and about five oscillations across a heavy's 0.36s tail.
 */
const SHAKE_HZ = 13
/** A flash is two or three frames, not a fade. */
const FLASH_FOR = 0.05
/** The zoom shoves in over this, then eases back over the weight's zoomFor. */
const ZOOM_IN = 0.045
/**
 * A flurry must not be able to freeze the board solid. Six 10-frame hits in a
 * round would otherwise stack to a full second of nothing moving.
 */
const MAX_FREEZE = 0.34

/** Ease the tail of an envelope out rather than cutting it. */
const outCubic = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u)

/** What the board should apply this frame. All zero when nothing is happening. */
export interface Juice {
  /** Add to the camera's x. Board units. */
  shakeX: number
  /** Add to the camera's y. Board units. Bigger than x on purpose. */
  shakeY: number
  /** White overlay opacity, 0..1. */
  flash: number
  /** Zoom in by this fraction: multiply an ortho zoom, or subtract from fov. */
  zoom: number
  /** True while the game clock is held. Useful for suppressing input. */
  frozen: boolean
}

const IDLE: Juice = { shakeX: 0, shakeY: 0, flash: 0, zoom: 0, frozen: false }

export interface HitJuice {
  /**
   * Something landed. `seed` picks the rattle direction and must be the same
   * on every seat — the attack's id, or the round and target, never a random.
   */
  hit: (weight: HitWeight, seed?: number) => void
  /**
   * Advance one frame. Give it the raw dt; use the dt it hands back for the
   * game, and the juice for the camera.
   */
  step: (rawDt: number) => { dt: number; juice: Juice }
  /** Nothing pending, nothing shaking. */
  idle: () => boolean
  reset: () => void
}

export function createHitJuice(): HitJuice {
  let freeze = 0      // seconds of game time still held
  let slowLeft = 0    // seconds of slow motion still to run
  let slowRate = 1

  // ONE presentation clock, running on real time, restarted by each hit.
  // Every envelope below is a function of it and its own duration, so nothing
  // can decay at a rate that depends on its own current value — that was the
  // bug that made the heavy hit's zoom peak at 0.008 instead of 0.020.
  let t = Infinity
  let shakePeak = 0
  let shakeFor = 0
  let flashPeak = 0
  let zoomPeak = 0
  let zoomFor = 0
  let dirX = 0.45
  let dirY = 0.9
  let zoom = 0

  const shakeAmp = () => {
    if (shakePeak <= 0 || t >= shakeFor) return 0
    const u = 1 - t / shakeFor
    return shakePeak * u * u          // fast off the peak, long soft tail
  }
  const flashAmp = () => {
    if (flashPeak <= 0 || t >= FLASH_FOR) return 0
    return flashPeak * (1 - t / FLASH_FOR)
  }
  const zoomAmp = () => {
    if (zoomPeak <= 0) return 0
    if (t < ZOOM_IN) return zoomPeak * outCubic(t / ZOOM_IN)   // shove in
    if (t >= zoomFor) return 0
    const u = 1 - (t - ZOOM_IN) / Math.max(1e-6, zoomFor - ZOOM_IN)
    return zoomPeak * outCubic(Math.max(0, u))                 // drift out
  }

  return {
    hit(weight, seed = 0) {
      const w = WEIGHTS[weight]
      if (!w) return

      // Freeze takes the MAX rather than the sum. Two hits in the same frame
      // are one impact to the eye, and summing is how a flurry becomes a hang.
      freeze = Math.min(MAX_FREEZE, Math.max(freeze, w.freeze))

      // A later hit re-kicks the camera rather than landing inside the
      // previous fade and going unnoticed: the clock restarts and each peak
      // takes the max, so a jab during a heavy's tail does not shrink it.
      const carry = shakeAmp()
      shakePeak = Math.max(w.shake, carry)
      shakeFor = Math.max(w.shakeFor, shakeFor - t > 0 ? shakeFor - t : 0)
      flashPeak = Math.max(w.flash, flashAmp())
      const zCarry = zoomAmp()
      zoomPeak = Math.max(w.zoom, zCarry)
      zoomFor = Math.max(w.zoomFor, 0)
      t = 0

      if (w.slowRate < 1) {
        slowRate = w.slowRate
        slowLeft = Math.max(slowLeft, w.slowFor)
      }

      // Deterministic direction. Vertical is weighted about twice horizontal:
      // Street Fighter shakes the screen up and down, and a mostly-sideways
      // rattle reads as a rumble rather than a blow.
      // The vertical component is ALWAYS exactly 1 and only the horizontal
      // tilt and the sign vary. An earlier cut built the direction as
      // sin(a)*0.55 + (+/-0.6), whose magnitude swung between 0.05 and 1.15
      // depending on the seed, so the same "heavy" hit kicked the camera an
      // order of magnitude harder on one attack id than on the next. The
      // weight table is the only thing allowed to set how hard a hit lands.
      const h = (Math.imul((seed | 0) + 0x85eb, 0x9e3779b1) >>> 0) / 4294967296
      const g = (Math.imul((seed | 0) + 0x2f1b, 0x85ebca6b) >>> 0) / 4294967296
      dirY = g < 0.5 ? -1 : 1
      dirX = (h * 2 - 1) * 0.45
    },

    step(rawDt) {
      const real = Math.max(0, Math.min(rawDt, 0.1))

      // ── the game clock ──
      let dt = real
      let frozen = false
      if (freeze > 0) {
        freeze = Math.max(0, freeze - real)
        dt = 0
        frozen = true
      } else if (slowLeft > 0) {
        slowLeft = Math.max(0, slowLeft - real)
        dt = real * slowRate
        if (slowLeft === 0) slowRate = 1
      }

      // ── the presentation clock: real time, always, even mid-freeze ──
      if (t !== Infinity) t += real

      const amp = shakeAmp()
      const flash = flashAmp()
      zoom = zoomAmp()

      if (amp === 0 && flash === 0 && zoom === 0) {
        if (!frozen && slowLeft === 0) t = Infinity
        if (!frozen) return { dt, juice: IDLE }
        return { dt, juice: { ...IDLE, frozen: true } }
      }

      const osc = Math.sin(t * SHAKE_HZ * Math.PI * 2)
      return {
        dt,
        juice: {
          shakeX: osc * amp * dirX,
          shakeY: osc * amp * dirY,
          flash,
          zoom,
          frozen,
        },
      }
    },

    idle() {
      return freeze === 0 && slowLeft === 0 && shakeAmp() === 0 && flashAmp() === 0 && zoomAmp() === 0
    },

    reset() {
      freeze = 0
      slowLeft = 0
      slowRate = 1
      t = Infinity
      shakePeak = 0
      shakeFor = 0
      flashPeak = 0
      zoomPeak = 0
      zoomFor = 0
      zoom = 0
    },
  }
}

/**
 * A reasonable damage-to-weight mapping the board can use until Sam wants a
 * different one. Deliberately NOT based on absolute damage — a 12-point hit
 * means something different to a level 1 and a level 9 — but on the fraction
 * of the target's maximum it took off, which is how a fighting game's own
 * light/medium/heavy reads on a health bar.
 */
export function weightForHit(damage: number, targetMaxHp: number, opts?: {
  crit?: boolean
  killing?: boolean
}): HitWeight {
  if (opts?.killing) return "ko"
  if (opts?.crit) return "crit"
  const frac = targetMaxHp > 0 ? damage / targetMaxHp : 0
  if (frac >= 0.25) return "heavy"
  if (frac >= 0.10) return "medium"
  return "light"
}
