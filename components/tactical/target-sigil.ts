// ============================================================================
// THE TARGET SIGIL, drawn — a flat turning ring and a rising plume.
//
// Sam, 2026-09-28: "The ring should stay horizontal and the magic should
// radiate and permeate while the ring rotates clockwise."
//
// ── why this is two meshes and not one ────────────────────────────────────
//
// The first version was a single billboarded quad, and it could not do what
// Sam asked. A billboard faces the camera by definition, so rotating it about
// the vertical axis has nowhere to happen — turn it and what a player sees is
// the whole plate tipping over, not a ring spinning. A ring that lies flat and
// turns clockwise has to be a real horizontal plane in the world.
//
// But the plume cannot live on that plane, or the rising energy would be
// painted flat onto the floor. So:
//
//   RING    a plane rotated onto the ground under the target, turning
//           clockwise about Y, foreshortened by the camera like any other
//           floor geometry.
//   PLUME   an upright quad facing the camera, growing outward (radiate) with
//           an inner glow that soaks into the body (permeate).
//
// ── the un-squash, and why the ring is baked stretched ────────────────────
//
// Sam drew the ring as a 2.04:1 ellipse — measured, and exactly the board's
// orthographic dimetric foreshortening. The art therefore already contains the
// perspective. Laid flat as drawn, the camera would apply that squash a SECOND
// time and flatten it to roughly 4:1. So the bake stretches it back into a
// circle and the camera puts Sam's ellipse back by itself. Nothing here
// compensates; the geometry is a plain square on the ground.
//
// CLOCKWISE is negative rotation about +Y. Three.js is right-handed, so a
// positive Y rotation is counter-clockwise seen from above, which is the
// direction Sam did not ask for.
// ============================================================================

import * as THREE from "three"
import { Flip, loadSheet } from "./spell-vfx-kit"
import type { VfxHandle } from "./spell-vfx"
import {
  sigilDuration, sigilPoseAt, sigilStrikeAt,
  type SigilOutcome, type SigilPlan,
} from "@/lib/target-sigil"

/** Ring diameter on the floor, in board units. A square is 1.0. */
const RING = 2.6

/** Plume quad size. */
const PLUME = 2.2

/** How high the plume quad's centre sits above the feet. */
const PLUME_Y = 1.15

/** Just above the floor, under the spell decals at 0.025 but over blood at 0.018. */
const FLOOR_Y = 0.022

export function targetSigilVfx(opts: {
  parent: THREE.Object3D
  camera?: THREE.Camera | null
  /** The victim's feet, in world space. */
  at: THREE.Vector3
  plan: SigilPlan
  outcome: SigilOutcome
  /** Fired once, on the frame the spell takes — the end of the hold. */
  onStrike?: () => void
}): VfxHandle {
  const { parent, plan, outcome } = opts
  const group = new THREE.Group()
  parent.add(group)

  let ring: Flip | null = null
  let plume: Flip | null = null
  let glow: THREE.PointLight | null = null
  let peakP = 0.5
  let disposed = false
  let struck = false
  let t = 0
  const lifetime = sigilDuration(plan)
  const at = opts.at.clone()

  const readPeak = (sheet: unknown) => {
    const meta = sheet as { peak?: number; frames: number }
    if (typeof meta.peak === "number" && meta.frames > 0) peakP = meta.peak / meta.frames
  }

  void loadSheet(plan.art.ring).then((sheet) => {
    if (disposed) return
    readPeak(sheet)
    ring = new Flip(sheet, 0xffffff, RING, RING)
    // Onto the ground plane. Everything after this only turns it about Y.
    ring.mesh.rotation.x = -Math.PI / 2
    ring.opacity = 0
    group.add(ring.mesh)
  }).catch(() => {})

  void loadSheet(plan.art.plume).then((sheet) => {
    if (disposed) return
    readPeak(sheet)
    plume = new Flip(sheet, 0xffffff, PLUME, PLUME)
    plume.opacity = 0
    group.add(plume.mesh)
    glow = new THREE.PointLight(0x9a5bd6, 0, 6, 1.8)
    glow.castShadow = false
    group.add(glow)
  }).catch(() => {})

  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const f of [ring, plume]) {
      if (!f) continue
      group.remove(f.mesh)
      f.dispose()
    }
    ring = plume = null
    if (glow) { group.remove(glow); glow = null }
    group.parent?.remove(group)
  }

  return {
    update(dt: number) {
      if (disposed) return false
      t += dt
      const pose = sigilPoseAt(t, plan, outcome, peakP)

      if (!struck && pose.struck) { struck = true; opts.onStrike?.() }

      if (ring) {
        ring.mesh.position.set(at.x, FLOOR_Y, at.z)
        // Flat, and turning. rotation.x stays at -90 degrees so the plane never
        // leaves the floor; only Y changes, and pose.spin is already negative.
        ring.mesh.rotation.set(-Math.PI / 2, 0, 0)
        ring.mesh.rotateZ(pose.spin)
        ring.mesh.scale.setScalar(pose.scale)
        ring.setProgress(pose.frame)
        ring.opacity = pose.opacity
      }

      if (plume) {
        plume.mesh.position.set(at.x, at.y + PLUME_Y, at.z)
        if (opts.camera) plume.mesh.quaternion.copy(opts.camera.quaternion)
        // Radiate: the plume spreads wider than the ring as the magic pushes
        // out, and narrows as it is driven back into them.
        plume.mesh.scale.set(pose.radiate, pose.radiate, pose.radiate)
        plume.setProgress(pose.frame)
        plume.opacity = pose.opacity
      }

      if (glow) {
        // Permeate: the light inside the body, brightest when it has soaked in.
        glow.position.set(at.x, at.y + 0.85, at.z)
        glow.intensity = 14 * pose.permeate
      }

      if (t >= lifetime) { dispose(); return false }
      return true
    },
    dispose,
  }
}

export { sigilStrikeAt }
