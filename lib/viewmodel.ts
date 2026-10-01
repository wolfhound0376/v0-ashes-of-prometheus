// ============================================================================
// VIEWMODEL — the weapon in your hands, first person.
//
// Sam, 2026-09-30: "the physics and rendering biomechanics of slashing /
// stabbing / bludgeoning / magic casting from first person POV in Skyrim.
// I'd like to recreate that effect in my wolfenstein style dungeon crawler."
//
// WHAT SKYRIM IS ACTUALLY DOING, because it is less than people assume:
//
//   1. A SEPARATE SKELETON. Skyrim ships a dedicated first-person skeleton and
//      a dedicated set of first-person animation files. The third-person body
//      is not shown and is not involved. The weapon hangs off the WEAPON node
//      of that skeleton and nothing else.
//   2. A SEPARATE FOV. World FOV and first-person FOV are independent settings
//      for a reason that matters more than it sounds: an arc authored at 60°
//      reads completely differently at 90°, so the viewmodel gets its own
//      projection rather than the animator re-authoring every time the world
//      FOV is tuned.
//   3. THE SAME SCENE, WITH A PULLED-IN NEAR PLANE — which is exactly why
//      Skyrim's sword clips through walls. That is a bug we are not copying.
//      Render the viewmodel in a second pass with its own camera and a cleared
//      depth buffer and the weapon can never intersect geometry.
//   4. EVERYTHING ELSE IS SWAY, BOB, AND THE ARC. There is no clever physics.
//      The "weight" people describe is a lag spring and a timing table.
//
// THE ONE INSIGHT THAT MATTERS, and the one amateurs miss: IN FIRST PERSON THE
// WEAPON IS OFF SCREEN FOR MOST OF THE SWING. A full third-person arc played
// on a viewmodel spends most of its length behind the camera, so the player
// sees a weapon vanish and reappear. First-person attack animations are
// authored the other way round: the windup mostly LEAVES frame, and the strike
// re-enters late, fast, and across the middle of the screen. The read is the
// blade crossing the frame, not the arm doing anatomy.
//
// So each attack here is four phases, and only one of them is visible:
//
//   WINDUP    weapon lifts and exits frame. The player reads this as
//             anticipation, not as a swing. Longest phase.
//   STRIKE    re-enters and crosses the frame. 80-130ms. This is the attack.
//   CONTACT   a point INSIDE the strike, not at its end — around two thirds
//             through, near screen centre. Fires the hit.
//   RECOVER   settles back to guard, with overshoot. Long, and where the
//             sense of commitment lives.
//
// PURE. No THREE, no DOM, no timers — the same contract as lib/hit-juice.ts
// and lib/impact-hold.ts, for the same reasons. This computes numbers; the R3F
// layer applies them. It can be unit tested and it can be written while
// another session holds the scene.
//
// COMPOSES WITH HIT-JUICE. Pass `frozen` from juice.step() and the weapon
// holds still during hitstop while the sway and the camera keep moving —
// which is the two-clocks rule hit-juice.ts already sets out, applied to the
// hands. Freeze the weapon too and the impact reads as a dropped frame. Order
// matters: step the juice FIRST, then hand its `frozen` to this.
//
// THE DICE DECIDE WHETHER, THIS DECIDES WHEN. The attack roll is resolved
// before swing() is called, through the shared roller, as every roll is. The
// contact frame is where the result becomes visible: on a hit, call
// juice.hit() with the weight the roll earned; on a miss call nothing, and
// the follow-through sails on with no hitstop — a whiff should feel like one.
// ============================================================================

export type Swing = "slash" | "thrust" | "bludgeon" | "cast"

/**
 * What the R3F layer applies this frame.
 *
 * Offsets are in VIEWMODEL SPACE — metres, right-handed, camera looking down
 * -Z. Rotations are radians. Everything is relative to the weapon's rest pose,
 * so the scene owns where "held ready" actually is and this only ever nudges.
 */
export interface Pose {
  x: number
  y: number
  z: number
  pitch: number
  yaw: number
  roll: number
  /**
   * Degrees to ADD to the viewmodel camera's FOV this frame. Only the thrust
   * uses it, and it is the whole reason a thrust reads at all — see THRUST.
   */
  fov: number
  /** 0..1 blade-trail ribbon opacity. Non-zero only across the strike. */
  trail: number
  /**
   * 0..1 intensity for the point light parented to the hands. CAST ONLY —
   * zero for every other swing. Ramps across the windup, spikes to 1 on
   * release, dies over the recovery. See CAST: this is the cast's animation.
   */
  glow: number
  /** 0..1 through the whole attack, or -1 when idle. For sprite frame picking. */
  phase: number
}

const REST: Pose = { x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 0, trail: 0, glow: 0, phase: -1 }

interface Timing {
  /** Seconds. The weapon mostly leaves frame here. */
  windup: number
  /** Seconds. The visible crossing. Short on purpose. */
  strike: number
  /** Fraction THROUGH the strike where the blow lands, 0..1. */
  contactAt: number
  /** Seconds. Back to guard, with overshoot. */
  recover: number
  /**
   * Does the weapon stop dead on contact? A blade follows through; a hammer
   * does not. Three frames of dead stop is the entire difference between a
   * mace and a sword, and it costs nothing.
   */
  deadStop: boolean
}

/**
 * The ladder. Windups are long and strikes are short because that is what the
 * real motion does — a committed cut runs 250-400ms from initiation to impact,
 * and the blade reaches peak speed in the last handspan before the target, not
 * at the midpoint. Recovery to guard is another 300-500ms and is where the
 * player feels whether the swing cost them anything.
 */
const TIMING: Record<Swing, Timing> = {
  //           windup strike contactAt recover deadStop
  slash:    { windup: 0.22, strike: 0.10, contactAt: 0.66, recover: 0.38, deadStop: false },
  thrust:   { windup: 0.18, strike: 0.08, contactAt: 0.82, recover: 0.30, deadStop: false },
  bludgeon: { windup: 0.36, strike: 0.13, contactAt: 0.70, recover: 0.46, deadStop: true  },
  cast:     { windup: 0.34, strike: 0.12, contactAt: 0.55, recover: 0.52, deadStop: false },
}

/**
 * Keyframe poses per attack. Three per swing: where the windup takes it, where
 * it is at contact, and where the follow-through carries it before recovery
 * pulls it back. The curve between them is eased, not linear.
 *
 * SLASH — up and back out of frame over the right shoulder, then a diagonal
 * across the screen to low-left. Roll is the big one: the blade rotating
 * through frame is what reads as an edge rather than a stick.
 *
 * THRUST — almost pure Z, which is the problem. A thrust has nearly no
 * screen-space travel, so in first person it looks like nothing happened.
 * Every good FPS solves this the same way: exaggerate the pull-back so the
 * weapon visibly shrinks, then punch the FOV out two to four degrees over the
 * extension. The FOV does the work the arc cannot.
 *
 * BLUDGEON — higher, slower, more vertical, and it STOPS. Lower spring
 * stiffness so it lags the camera further; that lag is the mass.
 *
 * CAST — the hands rise into frame palm-forward and the payoff is downrange,
 * so there is no impact on the hands at all. The animation is the LIGHT: ramp
 * a point light parented to the hands across the windup and spike it on
 * release. That single light does more than any hand motion here.
 */
const KEYS: Record<Swing, { wind: Partial<Pose>; hit: Partial<Pose>; follow: Partial<Pose> }> = {
  slash: {
    wind:   { x:  0.16, y:  0.14, z:  0.06, pitch: -0.34, yaw:  0.30, roll: -0.75 },
    hit:    { x: -0.10, y: -0.06, z: -0.13, pitch:  0.22, yaw: -0.16, roll:  0.85 },
    follow: { x: -0.20, y: -0.14, z: -0.04, pitch:  0.30, yaw: -0.26, roll:  1.05 },
  },
  thrust: {
    wind:   { x:  0.04, y: -0.05, z:  0.20, pitch:  0.10, yaw:  0.06, roll: -0.10 },
    hit:    { x:  0.00, y:  0.01, z: -0.34, pitch: -0.04, yaw:  0.00, roll:  0.00, fov: 3.2 },
    follow: { x:  0.00, y:  0.00, z: -0.28, pitch: -0.02, yaw:  0.00, roll:  0.00, fov: 1.4 },
  },
  bludgeon: {
    wind:   { x:  0.10, y:  0.26, z:  0.10, pitch: -0.62, yaw:  0.14, roll: -0.30 },
    hit:    { x: -0.04, y: -0.16, z: -0.16, pitch:  0.46, yaw: -0.06, roll:  0.22 },
    follow: { x: -0.05, y: -0.19, z: -0.12, pitch:  0.50, yaw: -0.08, roll:  0.26 },
  },
  cast: {
    wind:   { x: -0.02, y:  0.12, z:  0.08, pitch: -0.20, yaw: -0.05, roll:  0.10 },
    hit:    { x:  0.00, y:  0.06, z: -0.16, pitch:  0.06, yaw:  0.00, roll:  0.00 },
    follow: { x:  0.00, y:  0.02, z: -0.06, pitch:  0.02, yaw:  0.00, roll:  0.00 },
  },
}

/**
 * Lag spring stiffness in Hz, per weapon class. Lower reads as heavier. Keyed
 * on what is HELD, not on what is swinging: the first cut keyed it on the
 * running swing and fell back to "slash" when idle, so between blows a mace
 * swayed like a sword — which is exactly when the player is turning and
 * looking at it.
 */
const SWAY_HZ: Record<Swing, number> = { slash: 7.0, thrust: 8.0, bludgeon: 4.5, cast: 6.0 }

/**
 * An attack pressed this close to the end of the recovery is queued, not
 * dropped. Without it a click a few frames early just vanishes and chained
 * blows feel sticky; with a longer window the player loses control of it.
 */
const BUFFER = 0.15

/** How far the weapon lags behind a mouse turn, metres per rad/s. Clamped. */
const SWAY_GAIN = 0.055
const SWAY_CLAMP = 0.10
/** Walk bob: vertical runs at twice the horizontal, as a gait does. */
const BOB_HZ = 1.15
const BOB_X = 0.014
const BOB_Y = 0.010

const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u)
const easeIn = (u: number) => u * u
/**
 * Ease out past the target and back. The recovery rides this so the guard is
 * ARRIVED at: the weapon swings a little past rest and settles. The first cut
 * subtracted a sine bump instead, which sagged mid-recovery and never passed
 * rest at all. BACK sets the size: ~6% of the travel.
 */
const BACK = 1.2
const easeOutBack = (u: number) => {
  const v = u - 1
  return 1 + (BACK + 1) * v * v * v + BACK * v * v
}
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const mix = (a: number, b: number, u: number) => a + (b - a) * u

function blend(from: Partial<Pose>, to: Partial<Pose>, u: number, out: Pose): void {
  out.x = mix(from.x ?? 0, to.x ?? 0, u)
  out.y = mix(from.y ?? 0, to.y ?? 0, u)
  out.z = mix(from.z ?? 0, to.z ?? 0, u)
  out.pitch = mix(from.pitch ?? 0, to.pitch ?? 0, u)
  out.yaw = mix(from.yaw ?? 0, to.yaw ?? 0, u)
  out.roll = mix(from.roll ?? 0, to.roll ?? 0, u)
  out.fov = mix(from.fov ?? 0, to.fov ?? 0, u)
}

/**
 * One axis of a critically damped spring, advanced EXACTLY by d seconds.
 *
 * The first cut integrated it with an Euler step, which is only stable while
 * omega * dt stays small. At 7 Hz that held at 60fps and nowhere else: at
 * 30fps, or on the one long frame after a tab is refocused, the weapon's
 * offset grew by twenty orders of magnitude in forty frames. The closed form
 * has no step-size limit — any dt lands where the real spring would be.
 *
 *   e(t) = (e0 + (v0 + w e0) t) exp(-w t)        e = x - target
 */
function springAxis(x: number, v: number, target: number, w: number, d: number): [number, number] {
  const e = x - target
  const b = v + w * e
  const k = Math.exp(-w * d)
  return [target + (e + b * d) * k, (v - w * b * d) * k]
}

export interface ViewmodelInput {
  /** Camera yaw rate, rad/s. Drives the lag sway. */
  yawRate: number
  /** Camera pitch rate, rad/s. */
  pitchRate: number
  /** Movement speed, 0..1 of walk speed. Drives the bob. */
  speed: number
  /**
   * From hit-juice's step().juice.frozen. The WEAPON holds during hitstop; the
   * sway and bob do not, because they are presentation and the two clocks run
   * separately. See the header.
   */
  frozen?: boolean
}

export interface Viewmodel {
  /**
   * Begin an attack. While one is running the press is ignored — unless it
   * lands inside the last BUFFER seconds of the recovery, in which case it is
   * queued and starts the frame the current one ends. Returns whether the
   * press was taken (started or queued).
   */
  swing: (kind: Swing) => boolean
  /**
   * What is in the hands. Sets how heavily the weapon lags the camera, idle
   * or swinging. A spear holds as "thrust", a mace as "bludgeon".
   */
  hold: (kind: Swing) => void
  /**
   * Advance a frame. Returns the pose to apply and, on exactly one frame per
   * attack, `contact: true` — that is the frame to call juice.hit() (on a hit),
   * play the impact sound, and apply the wound. Nothing else should decide
   * when a blow SHOWS; the dice decide whether it lands. See the header.
   */
  step: (dt: number, input: ViewmodelInput) => { pose: Pose; contact: boolean }
  /** True when no attack is running. */
  idle: () => boolean
  reset: () => void
}

export function createViewmodel(held: Swing = "slash"): Viewmodel {
  const pose: Pose = { ...REST }
  let kind: Swing | null = null
  let queued: Swing | null = null
  let t = 0
  let fired = false
  let bobT = 0
  // Sway state: position and velocity of the lag spring, two axes.
  let sx = 0, svx = 0, sy = 0, svy = 0

  const total = (k: Swing) => {
    const g = TIMING[k]
    return g.windup + g.strike + g.recover
  }

  const start = (k: Swing) => {
    kind = k
    t = 0
    fired = false
  }

  return {
    swing(k) {
      if (!kind) { start(k); return true }
      if (total(kind) - t <= BUFFER) { queued = k; return true }
      return false
    },

    hold(k) {
      held = k
    },

    step(dt, input) {
      const d = clamp(dt, 0, 0.05)
      let contact = false

      // ── SWAY. A critically damped spring chasing a target that is just the
      // camera's turn rate, negated: turn right and the weapon falls left,
      // then catches up. This is 90% of what people call "weapon weight".
      const w = 2 * Math.PI * SWAY_HZ[held]
      const tx = clamp(-input.yawRate * SWAY_GAIN, -SWAY_CLAMP, SWAY_CLAMP)
      const ty = clamp(-input.pitchRate * SWAY_GAIN, -SWAY_CLAMP, SWAY_CLAMP)
      ;[sx, svx] = springAxis(sx, svx, tx, w, d)
      ;[sy, svy] = springAxis(sy, svy, ty, w, d)

      // ── BOB. Vertical at twice the horizontal, because a gait rises once
      // per step and swings once per stride.
      bobT += d * input.speed
      const bx = Math.sin(bobT * BOB_HZ * Math.PI * 2) * BOB_X * input.speed
      const by = Math.abs(Math.sin(bobT * BOB_HZ * Math.PI * 2 * 2)) * BOB_Y * input.speed

      // ── ATTACK. Frozen holds the attack clock only; sway and bob above
      // already advanced.
      if (kind) {
        const g = TIMING[kind]
        const keys = KEYS[kind]
        const cast = kind === "cast"
        if (!input.frozen) t += d

        const windEnd = g.windup
        const strikeEnd = g.windup + g.strike
        const end = total(kind)
        const contactT = g.windup + g.strike * g.contactAt

        // The contact frame SHOWS the contact pose. Whatever frame first
        // crosses contactT is pinned to it exactly, even when a long frame
        // would have carried the blade past. This is the frame hitstop then
        // holds for up to twenty frames, so it is the one frame that must be
        // right; the few milliseconds dropped are invisible.
        if (!fired && t >= contactT) {
          t = contactT
          fired = true
          contact = true
        }

        if (t < windEnd) {
          // Out of frame, easing IN so it accelerates away rather than
          // drifting. The player should feel the weapon being loaded.
          const u = easeIn(t / windEnd)
          blend(REST, keys.wind, u, pose)
          pose.trail = 0
          pose.glow = cast ? 0.6 * u : 0
        } else if (t < strikeEnd) {
          const u = (t - windEnd) / g.strike
          if (u < g.contactAt) {
            // Accelerating INTO contact: the blade is fastest in the last
            // handspan before the target, not at the midpoint.
            blend(keys.wind, keys.hit, easeIn(u / g.contactAt), pose)
          } else if (g.deadStop) {
            // A hammer does not follow through. Hold the contact pose for the
            // rest of the strike, then let recovery pull it back. Three frames
            // of nothing is the whole difference between a mace and a sword.
            blend(keys.hit, keys.hit, 0, pose)
          } else {
            // Follow-through starts FROM THE CONTACT POSE. The first cut
            // started it from the windup pose, so on the very frame the blow
            // landed the blade snapped back out of frame (a one-frame jump of
            // over a radian of roll on the slash), and hitstop then froze it
            // there. The thrust never reached full extension for the same
            // reason, which also cost it most of its FOV punch.
            blend(keys.hit, keys.follow, easeOut((u - g.contactAt) / (1 - g.contactAt)), pose)
          }
          // Trail is brightest across the fast middle of the crossing — and
          // gone the instant a hammer stops, because nothing is moving.
          pose.trail = g.deadStop && u >= g.contactAt ? 0 : Math.sin(u * Math.PI)
          pose.glow = cast ? (u < g.contactAt ? mix(0.6, 1, u / g.contactAt) : 1) : 0
        } else {
          const lin = clamp((t - strikeEnd) / g.recover, 0, 1)
          blend(g.deadStop ? keys.hit : keys.follow, REST, easeOutBack(lin), pose)
          pose.trail = 0
          pose.glow = cast ? (1 - lin) * (1 - lin) : 0
        }

        pose.phase = clamp(t / end, 0, 1)
        if (t >= end) {
          kind = null; t = 0; pose.phase = -1
          if (queued) { start(queued); queued = null }
        }
      } else {
        Object.assign(pose, REST)
      }

      // Sway and bob ride ON TOP of the attack pose, never replace it.
      pose.x += sx + bx
      pose.y += sy - by

      return { pose, contact }
    },

    idle: () => kind === null,
    reset() {
      kind = null; queued = null; t = 0; fired = false; bobT = 0
      sx = svx = sy = svy = 0
      Object.assign(pose, REST)
    },
  }
}
