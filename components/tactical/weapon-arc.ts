import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import type { SwingStyle } from "@/lib/melee-combo"

// ============================================================================
// THE STREAK A BLADE LEAVES BEHIND IT.
//
// Sam: "combat swipes with melee weapons [should] have motion arcs like
// Street Fighter."
//
// A swing on this board was, visually, nothing. The model played its Attack
// clip, a sound fired on the contact frame and the target flinched — and the
// blade itself moved through empty air at whatever speed the animation ran,
// which at 30fps across a 1.2-unit miniature is a grey blur you have to be
// looking for. Every other kind of damage on this board announces itself: a
// Fireball blooms, a bolt flies, a hit throws sparks. Steel announced nothing.
//
// What a fighting game does instead — and what this draws — is leave the
// PATH in the air for a few frames after the blade has gone. The eye cannot
// track a fast edge, so the arc is drawn FOR it.
//
// ── HOW IT IS BUILT ─────────────────────────────────────────────────────────
//
// The honest way, not the cheap way: this is a real swept quad. Every frame
// it reads two world positions off the rig — the grip and the blade's tip —
// and stores them as one rung of a ladder. The ribbon is the surface between
// consecutive rungs. That means the arc is not an approximation of the swing;
// it IS the swing, traced by the weapon the model is actually holding, so it
// matches whatever clip happened to play without anyone having to measure
// that clip first. A dagger draws a short arc because a dagger is short.
//
// ── WHEN THE RIG WILL NOT COOPERATE ─────────────────────────────────────────
//
// Some things on this board cannot be traced. A creature with no RightHand
// bone, a clip that moves the body rather than the arm, a model whose "swing"
// is four frames of a shoulder twitch. Tracing those gives a ribbon a
// centimetre long, which is worse than nothing because it reads as a
// rendering fault rather than as an absent feature.
//
// So the arc watches how far the tip has actually travelled, and if the
// answer by a third of the way through is "barely", it stops tracing and
// SWEEPS the rest itself — a clean crescent along the style's own path, in
// front of the attacker, at the height their hand is at. That path is the
// fallback, never the default: a traced arc is always truer than a drawn one.
//
// ── COST ────────────────────────────────────────────────────────────────────
//
// One mesh, one material, one geometry per swing, all allocated at spawn and
// disposed when the handle finishes. The buffers are fixed-size and written
// in place; nothing is allocated per frame. Honours the VfxHandle contract so
// the board's existing effect loop drives it, same as every other effect here.
// ============================================================================

/** Rungs of the ladder. 24 across ~0.35s of sweep is smooth at any frame rate
 *  the board actually runs at, and the whole buffer is 1.2kB. */
const MAX_RUNGS = 24

/** How long before the contact frame the arc starts drawing.
 *
 *  The sweep is not the whole clip. A 2.8s Attack clip is mostly windup and
 *  recovery; the blade crosses in a fraction of a second around the contact
 *  frame, and drawing outside that window traces the arm being RAISED, which
 *  looks like the character smearing rather than striking. */
const LEAD_S = 0.24
/** And how long after it, so the arc carries through the blow rather than
 *  stopping dead on it. */
const TAIL_S = 0.12

/** Below this much tip travel (world units) by the check point, stop tracing
 *  and sweep instead. A real swing moves the tip a good half-unit; a rig that
 *  has managed less than a tenth of one is not swinging. */
const TRACE_FLOOR = 0.09
/** Fraction of the sweep window after which that judgement is made. Early
 *  enough that the drawn arc still has most of its sweep left to perform. */
const VERDICT_AT = 0.34

/** Steel. The default streak colour when nothing says otherwise. */
export const ARC_STEEL = 0xdce8ff
/** A critical hit's arc. Gold reads as "that one mattered" at a glance, and
 *  it is the same language the damage numbers already use for a crit. */
export const ARC_CRIT = 0xffd98a

export interface WeaponArcArgs {
  /** Where the ribbon lives. World-space, same convention as projectile.ts. */
  parent: THREE.Object3D
  /** The attacker's token object — gives the arc its facing and its origin. */
  body: THREE.Object3D
  /**
   * The thing being swung: the weapon prop if one is in the hand, otherwise
   * the hand bone itself. Null is fine and means "sweep it", which is the
   * honest answer for a creature with no arm to trace.
   */
  blade: THREE.Object3D | null
  /** The shape this blow draws (lib/melee-combo). */
  style: SwingStyle
  /** Seconds from now until the blade connects — the clip's release frame. */
  contact: number
  /** How long the streak hangs in the air after the sweep ends. */
  linger: number
  /** Streak colour. ARC_STEEL unless this is something special. */
  tint?: number
}

/** World-space length of a weapon prop, measured rather than assumed.
 *
 *  Props are modelled along +Y from the grip (lib/equipment's proxyGeometry
 *  says so explicitly), so the tip is the top of the bounding box — and
 *  measuring it means a real art asset works as well as a proxy without
 *  anyone maintaining a table of lengths. */
function tipOffsetOf(blade: THREE.Object3D): THREE.Vector3 {
  const box = new THREE.Box3().setFromObject(blade)
  if (box.isEmpty()) return new THREE.Vector3(0, 0.35, 0)
  // Local, not world: the box is in world space, so bring the reach back
  // through the blade's own scale to get a local offset that survives the
  // bone's animation.
  const height = Math.max(0.12, box.max.y - box.min.y)
  const scale = blade.getWorldScale(new THREE.Vector3()).y || 1
  return new THREE.Vector3(0, height / scale, 0)
}

export function weaponArcVfx(args: WeaponArcArgs): VfxHandle {
  const { parent, body, blade, style, contact, linger } = args
  const tint = new THREE.Color(args.tint ?? ARC_STEEL)

  const sweep = LEAD_S + TAIL_S
  // The arc starts drawing shortly before contact. On a clip whose contact
  // frame lands sooner than the lead-in, it simply starts now.
  let wait = Math.max(0, contact - LEAD_S)

  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(MAX_RUNGS * 2 * 3)
  const col = new Float32Array(MAX_RUNGS * 2 * 3)
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3))
  // One quad per pair of rungs, built once. drawRange limits how much of it
  // is used while the ribbon is still short.
  const idx = new Uint16Array((MAX_RUNGS - 1) * 6)
  for (let i = 0; i < MAX_RUNGS - 1; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    idx.set([a, b, c, b, d, c], i * 6)
  }
  geo.setIndex(new THREE.BufferAttribute(idx, 1))
  geo.setDrawRange(0, 0)

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    // Additive, so the tail fading to black IS the tail fading out — no alpha
    // sorting, no depth writes, nothing to get in front of anything.
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false   // the bounds change every frame; culling it would blink it out
  mesh.renderOrder = 6
  parent.add(mesh)

  /** Rungs, newest last. Each is a grip point and a tip point. */
  const rungs: { inner: THREE.Vector3; outer: THREE.Vector3 }[] = []

  const tipLocal = blade ? tipOffsetOf(blade) : null
  const gripWorld = new THREE.Vector3()
  const tipWorld = new THREE.Vector3()

  let elapsed = 0        // since the sweep began
  let travelled = 0      // how far the tip has actually gone
  let drawn = false      // switched to the swept fallback?
  let decided = false
  let fading = 0         // seconds spent fading after the sweep ended
  const lastTip = new THREE.Vector3()
  let haveLast = false

  // The attacker's frame, captured when the sweep starts. Captured rather
  // than read live because a body that turns mid-swing would otherwise drag
  // the drawn arc around with it.
  const origin = new THREE.Vector3()
  const forward = new THREE.Vector3()
  const right = new THREE.Vector3()
  const up = new THREE.Vector3(0, 1, 0)
  const planeUp = new THREE.Vector3()
  let radius = 0.55
  let framed = false

  const frameUp = () => {
    if (framed) return
    framed = true
    const yaw = body.rotation.y
    // Matches the board's own facing convention: rotation.y = atan2(dx, dz).
    forward.set(Math.sin(yaw), 0, Math.cos(yaw))
    right.copy(up).cross(forward).normalize()
    // Hand height if we have a hand, chest height if we do not.
    if (blade) blade.getWorldPosition(origin)
    else origin.copy(body.position).setY(body.position.y + 0.75)
    // The arc plane, tipped off vertical by the style so a downward cut
    // actually travels downward as it crosses.
    planeUp.copy(up).multiplyScalar(Math.cos(style.tilt))
      .addScaledVector(forward, Math.sin(style.tilt)).normalize()
    if (tipLocal && blade) {
      radius = tipLocal.length() * blade.getWorldScale(new THREE.Vector3()).y
    }
    radius = Math.max(0.3, radius) * style.reach
  }

  /** Where the traced blade is, right now. */
  const traceRung = () => {
    if (!blade || !tipLocal) return null
    blade.getWorldPosition(gripWorld)
    tipWorld.copy(tipLocal).applyMatrix4(blade.matrixWorld)
    if (haveLast) travelled += lastTip.distanceTo(tipWorld)
    lastTip.copy(tipWorld)
    haveLast = true
    return { inner: gripWorld.clone(), outer: tipWorld.clone() }
  }

  /** Where a swept blade WOULD be, at `t` through the sweep. */
  const sweptRung = (t: number) => {
    frameUp()
    // Ease the angle: a swing is fastest through the middle, which is what
    // makes the rungs bunch at the ends the way a real trail does.
    const e = t * t * (3 - 2 * t)
    const theta = style.from + (style.to - style.from) * e
    const dir = right.clone().multiplyScalar(Math.cos(theta))
      .addScaledVector(planeUp, Math.sin(theta))
    // Pushed out in front of the body, or the arc sweeps through the model.
    const base = origin.clone().addScaledVector(forward, radius * 0.45)
    return {
      inner: base.clone().addScaledVector(dir, radius * 0.22),
      outer: base.clone().addScaledVector(dir, radius),
    }
  }

  const push = (rung: { inner: THREE.Vector3; outer: THREE.Vector3 }) => {
    rungs.push(rung)
    if (rungs.length > MAX_RUNGS) rungs.shift()
  }

  /**
   * Rewrite the buffers.
   *
   * `fade` is the whole ribbon's brightness. Along its length each rung dims
   * toward the tail, and the leading edge is washed toward white — that hot
   * front edge is the crescent flash a fighting game puts on a slash, and it
   * is what stops the ribbon reading as a smear.
   */
  const rebuild = (fade: number) => {
    const n = rungs.length
    if (n < 2) { geo.setDrawRange(0, 0); return }
    for (let i = 0; i < n; i++) {
      const r = rungs[i]
      const k = i * 6
      pos[k] = r.inner.x; pos[k + 1] = r.inner.y; pos[k + 2] = r.inner.z
      pos[k + 3] = r.outer.x; pos[k + 4] = r.outer.y; pos[k + 5] = r.outer.z
      // 0 at the oldest rung, 1 at the newest.
      const along = n > 1 ? i / (n - 1) : 1
      // Tail falls away fast; the head keeps its brightness.
      const head = along * along
      const lum = fade * style.glow * (0.12 + 0.88 * head)
      // The outer edge of the ribbon is brighter than the inner: the tip
      // moves furthest and fastest, and that is where the light is.
      const hot = 0.35 + 0.65 * head
      const r0 = THREE.MathUtils.lerp(tint.r, 1, head * 0.75)
      const g0 = THREE.MathUtils.lerp(tint.g, 1, head * 0.75)
      const b0 = THREE.MathUtils.lerp(tint.b, 1, head * 0.75)
      col[k] = r0 * lum * 0.45; col[k + 1] = g0 * lum * 0.45; col[k + 2] = b0 * lum * 0.45
      col[k + 3] = r0 * lum * hot; col[k + 4] = g0 * lum * hot; col[k + 5] = b0 * lum * hot
    }
    ;(geo.attributes.position as THREE.BufferAttribute).needsUpdate = true
    ;(geo.attributes.color as THREE.BufferAttribute).needsUpdate = true
    geo.setDrawRange(0, (n - 1) * 6)
  }

  return {
    update(dt: number): boolean {
      if (wait > 0) {
        wait -= dt
        if (wait > 0) return true
        dt = -wait      // spend the remainder of this frame on the sweep
        wait = 0
      }

      if (elapsed < sweep) {
        elapsed += dt
        const t = Math.min(1, elapsed / sweep)

        if (!decided) {
          const rung = traceRung()
          if (rung) push(rung)
          if (t >= VERDICT_AT) {
            decided = true
            // Not moving, or nothing to trace: sweep the rest by hand, and
            // throw away the stub we traced so the drawn arc starts clean.
            if (!rung || travelled < TRACE_FLOOR) {
              drawn = true
              rungs.length = 0
              // Backfill the part of the sweep already spent, so the arc
              // arrives mid-stroke rather than growing out of a point.
              for (let i = 0; i <= 6; i++) push(sweptRung((t * i) / 6))
            }
          }
        } else {
          push(drawn ? sweptRung(t) : (traceRung() ?? sweptRung(t)))
        }
        rebuild(1)
        return true
      }

      // Swept. Now it hangs and dies. Nothing new is added; the existing
      // rungs are held in place and dimmed, which reads as the light going
      // out of the air rather than as the arc retracting.
      fading += dt
      const left = 1 - fading / Math.max(0.05, linger)
      if (left <= 0) return false
      // Squared, so it lets go quickly rather than lingering as a grey band.
      rebuild(left * left)
      return true
    },
    dispose() {
      parent.remove(mesh)
      geo.dispose()
      mat.dispose()
    },
  }
}
