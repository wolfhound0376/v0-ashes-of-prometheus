import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import { aimPoint, flightTime } from "@/lib/projectile-aim"

// ============================================================================
// THE BOLT — an arrow you can actually see leave the bow.
//
// Sam: "we should be able to see an arrow projectile leaving the bow or
// crossbow. An arrow flies and a hit impales the target or misses them if
// missed."
//
// PROCEDURAL, NOT A SPRITE, and deliberately so. An arrow is a shaft with a
// head — a hard silhouette that has to point along its own travel — and a
// billboarded sprite sheet cannot do that: it always faces the camera, so an
// arrow drawn as a sprite looks like a dart hanging in the air. Every other
// effect on this board is a sprite because fire and frost have no fixed
// shape. Steel does.
//
// It also means this needs no art, which matters: of the twelve rigged models
// in the bucket, four have no animation clips at all and none has a "fire"
// clip. Waiting for art would mean waiting a long time for a bolt.
//
// Honours the VfxHandle contract, so the board's existing effect loop drives
// it and calls onImpact on the frame it lands — the same frame the damage,
// the number and the flinch are applied.
// ============================================================================

/** How far a bolt sinks into whatever it hits, in board units. */
const BITE = 0.18

function buildArrow(): THREE.Group {
  const g = new THREE.Group()
  // Along +Z, so the group can simply be pointed at where it is going.
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.46, 5),
    new THREE.MeshBasicMaterial({ color: 0x6b4a2a, toneMapped: false }),
  )
  shaft.rotation.x = Math.PI / 2
  g.add(shaft)

  const head = new THREE.Mesh(
    new THREE.ConeGeometry(0.032, 0.11, 6),
    new THREE.MeshBasicMaterial({ color: 0xc9cdd4, toneMapped: false }),
  )
  head.rotation.x = Math.PI / 2
  head.position.z = 0.27
  g.add(head)

  // Fletching: two crossed quads at the back. Cheap, and it is what makes the
  // silhouette read as an arrow rather than as a nail at tabletop distance.
  const featherMat = new THREE.MeshBasicMaterial({
    color: 0xd8d2c4, side: THREE.DoubleSide, transparent: true, opacity: 0.9, toneMapped: false,
  })
  for (const roll of [0, Math.PI / 2]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.14), featherMat)
    f.position.z = -0.19
    f.rotation.z = roll
    g.add(f)
  }
  return g
}

/**
 * Loose one shot.
 *
 * `hit` and `margin` decide where it actually goes — see lib/projectile-aim.
 * A miss flies PAST the target, which is the first thing on this board to
 * spend the margin the server has been sending for weeks.
 *
 * `onImpact` fires on the frame it arrives, hit or miss, because a miss is
 * still a moment: it is when the target ducks and when the bolt clatters.
 */
export function loose(opts: {
  parent: THREE.Object3D
  /** Where it leaves — the shooter's hand, or their chest if there is no rig. */
  from: THREE.Vector3
  /** The target's centre. */
  to: THREE.Vector3
  hit: boolean
  margin?: number
  seed?: number
  onImpact?: () => void
}): VfxHandle {
  const arrow = buildArrow()
  const start = opts.from.clone()
  const aim = aimPoint({
    from: { x: start.x, z: start.z },
    to: { x: opts.to.x, z: opts.to.z },
    hit: opts.hit,
    margin: opts.margin,
    seed: opts.seed,
  })
  // Chest height on the way in, wherever it is going.
  const end = new THREE.Vector3(aim.x, opts.to.y, aim.z)

  const life = flightTime({ x: start.x, z: start.z }, { x: end.x, z: end.z })
  const dir = end.clone().sub(start)
  // Bite in a little past the surface on a hit, so it reads as buried rather
  // than as resting against them.
  if (opts.hit && dir.lengthSq() > 1e-6) end.add(dir.clone().normalize().multiplyScalar(BITE))

  arrow.position.copy(start)
  arrow.lookAt(end)
  opts.parent.add(arrow)

  let t = 0
  let landed = false
  let done = false

  return {
    update(dt: number): boolean {
      if (done) return false
      t += dt
      const p = Math.min(1, t / life)
      arrow.position.lerpVectors(start, end, p)
      // A SHALLOW ARC. A flat line reads as a laser; a real arc would need a
      // ballistic solution nobody asked for. A hand's width of lift at the
      // midpoint is enough to say "thrown" rather than "beamed".
      arrow.position.y += Math.sin(p * Math.PI) * 0.16
      // Point along travel, including the arc, so the head leads.
      const ahead = new THREE.Vector3().lerpVectors(start, end, Math.min(1, p + 0.05))
      ahead.y += Math.sin(Math.min(1, p + 0.05) * Math.PI) * 0.16
      if (ahead.distanceToSquared(arrow.position) > 1e-8) arrow.lookAt(ahead)

      if (p >= 1 && !landed) {
        landed = true
        opts.onImpact?.()
        // A HIT STICKS, A MISS DOES NOT. The bolt that struck stays in the
        // body for a beat; the one that went by is gone, because an arrow
        // hanging in mid-air where nobody is standing is worse than no arrow.
        if (!opts.hit) { done = true; return false }
      }
      if (landed) {
        // Linger, then vanish. Not removed on the impact frame: the eye needs
        // a moment to register that it arrived.
        if (t > life + 0.5) { done = true; return false }
      }
      return true
    },
    dispose() {
      done = true
      opts.parent.remove(arrow)
      arrow.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
    },
  }
}
