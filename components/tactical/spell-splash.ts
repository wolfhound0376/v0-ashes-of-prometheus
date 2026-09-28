// ============================================================================
// SPLASH — the blast landing on the bodies caught in it.
//
// Sam, 2026-09-28: "magical and explosive splash effects that land on targets."
//
// ── the hole this fills ────────────────────────────────────────────────────
//
// An area cast already did three of the four things it should. It bloomed at
// the aim point, it laid a floor decal over the shape, and — in the board's
// flinch() — it applied hit points and reactions to everyone standing in that
// shape. What nothing did was put an effect ON those bodies. Four drow inside
// a Fireball took four damage numbers while the fire itself stayed politely in
// the middle of them.
//
// This draws the missing piece: the type's own impact art, at each body, timed
// by when the front actually reaches them (lib/splash-timing), sized by how
// far out they are, and softened to a ward-flare for anyone who made the save.
//
// ── one pool, not one effect per victim ────────────────────────────────────
//
// A Fireball in a crowd can catch eight bodies. Eight independent cast
// effects would be eight sheet loads, eight spark pools and eight lights. So
// this is ONE handle for the whole shape: the sheet is loaded once and shared
// across every quad, and there is a single spark pool sized for the blast.
// Per body it costs one quad.
// ============================================================================

import * as THREE from "three"
import { Flip, loadSheet, type DamageType } from "./spell-vfx-kit"
import { ImpactBurst } from "./impact-burst"
import type { VfxHandle } from "./spell-vfx"
import { isExplosive, splashArrivals, splashWeight, type SplashBody } from "@/lib/splash-timing"

/** What the board knows about one body caught in a shape. */
export interface SplashVictim extends SplashBody {
  /** Where the body is standing, in world space. */
  at: THREE.Vector3
  /** Hit points it took. 0 with word SAVED still splashes. */
  amount: number
  heals?: boolean
  word?: string | null
}

/** How long one body's splash plays. */
const LIFE = 0.55

/** Base size of a splash quad, before strength and the saved-softening. */
const SIZE = 1.5

/** A warded splash reads cold and pale whatever the damage type was. */
const WARD_TINT = 0xbfe4ff

/**
 * Draw the blast landing on everyone in the shape.
 *
 * `centre` is the shape's own grid origin — the aim point for a sphere, the
 * caster's square for a cone — which is what the board already holds as
 * `p.centre`. Returns null when there is nobody to splash or the damage type
 * has no impact art, so the caller can simply skip pushing a handle.
 */
export function splashOnVictims(opts: {
  parent: THREE.Object3D
  camera?: THREE.Camera | null
  type: DamageType
  /** The type's impact sheet key, resolved by the caller from the kit's table. */
  impactSheet: string
  /** The type's colour, for the sparks. */
  tint: number
  centre: { x: number; y: number }
  victims: readonly SplashVictim[]
  feetPerSquare: number
  seed?: number
}): VfxHandle | null {
  const drawable = opts.victims.filter((v) => splashWeight(v).draw)
  if (drawable.length === 0) return null

  const explosive = isExplosive(opts.type)
  const arrivals = splashArrivals(opts.centre, drawable, {
    explosive,
    feetPerSquare: opts.feetPerSquare,
  })

  // Look each victim's world position and verdict back up by id. The arrivals
  // come back sorted and thinned, so index correspondence is not safe.
  const byId = new Map(drawable.map((v) => [v.id, v]))

  const group = new THREE.Group()
  opts.parent.add(group)

  interface Quad { flip: Flip; at: THREE.Vector3; delay: number; size: number; warded: boolean; born: number }
  const quads: Quad[] = []
  let sparks: ImpactBurst | null = null
  let disposed = false
  let t = 0

  // Both sheets load in parallel and the effect simply starts from wherever it
  // has got to — the same contract as a cast, which never blocks on IO.
  void loadSheet(opts.impactSheet).then((sheet) => {
    if (disposed) return
    for (const a of arrivals) {
      const v = byId.get(a.id)
      if (!v) continue
      const w = splashWeight(v)
      const size = SIZE * a.strength * w.scale
      const flip = new Flip(sheet, w.warded ? WARD_TINT : opts.tint, size, size)
      flip.opacity = 0
      group.add(flip.mesh)
      quads.push({ flip, at: v.at.clone(), delay: a.delay, size, warded: w.warded, born: -1 })
    }
  }).catch(() => {})

  // ONE spark pool for the whole blast, and only for bodies that actually took
  // it — a shape full of saves throws no sparks at all, which is the reading.
  const sparkers = arrivals.filter((a) => {
    const v = byId.get(a.id)
    return v ? splashWeight(v).sparks > 0 : false
  })
  if (sparkers.length > 0) {
    void loadSheet("pxSpark").then((sheet) => {
      if (disposed) return
      sparks = new ImpactBurst(group, sheet, opts.tint, Math.min(48, 8 * sparkers.length))
    }).catch(() => {})
  }
  let sparksFired = false

  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const q of quads) { group.remove(q.flip.mesh); q.flip.dispose() }
    quads.length = 0
    sparks?.dispose()
    sparks = null
    group.parent?.remove(group)
  }

  const lastArrival = arrivals.reduce((m, a) => Math.max(m, a.delay), 0)
  const lifetime = lastArrival + LIFE + 0.5   // + the sparks' own tail

  return {
    update(dt: number) {
      if (disposed) return false
      t += dt

      for (const q of quads) {
        if (t < q.delay) continue
        if (q.born < 0) q.born = q.delay
        const age = t - q.born
        if (age > LIFE) { q.flip.opacity = 0; continue }
        const p = age / LIFE
        q.flip.mesh.position.copy(q.at)
        // Chest height, and rising slightly as it blooms, so the splash sits
        // on the body rather than under its feet.
        q.flip.mesh.position.y += 0.75 + p * 0.25
        if (opts.camera) q.flip.mesh.quaternion.copy(opts.camera.quaternion)
        q.flip.setProgress(p)
        // Full bright on arrival, easing off over the back half.
        q.flip.opacity = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85
        const s = 1 + p * (q.warded ? 0.25 : 0.55)
        q.flip.mesh.scale.setScalar(s)
      }

      // The sparks fire once, from the FIRST body the front reaches, so the
      // debris leaves ground zero rather than every square at once.
      if (sparks && !sparksFired && sparkers.length > 0 && t >= sparkers[0].delay) {
        sparksFired = true
        const first = byId.get(sparkers[0].id)
        if (first) {
          const from = first.at.clone()
          from.y += 0.7
          sparks.fire(from, null, 1.2, opts.seed ?? 1)
        }
      }
      if (sparks && sparksFired) sparks.update(dt, opts.camera ?? null)

      if (t >= lifetime) { dispose(); return false }
      return true
    },
    dispose,
  }
}
