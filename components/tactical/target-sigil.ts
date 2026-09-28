// ============================================================================
// THE TARGET SIGIL, drawn.
//
// One billboarded quad standing at the victim, playing Sam's necrotic sigil
// sheet through the three acts in lib/target-sigil: it blooms onto them, holds
// at its brightest while the save is rolled, then either closes on them or is
// thrown off.
//
// ── why billboarded and not laid flat ─────────────────────────────────────
//
// Measured, not assumed: the sigil's ring is 2.04:1 wide to tall, which is
// exactly the board's orthographic dimetric foreshortening. The perspective is
// already IN the art. Laying the quad on the ground plane would foreshorten it
// a second time and flatten the ring into a 4:1 smear, so it stands up and
// faces the camera instead, and reads correctly on both of the board's
// cameras.
//
// ── where it sits on the body ─────────────────────────────────────────────
//
// The ring is in the lower half of the frame and the plume rises out of it, so
// the quad is hung with the RING at about knee height and the plume covering
// the torso. Centring the art on the chest would bury the ring in the body and
// send the plume off over the target's head.
// ============================================================================

import * as THREE from "three"
import { Flip, loadSheet } from "./spell-vfx-kit"
import type { VfxHandle } from "./spell-vfx"
import {
  sigilDuration, sigilPoseAt, sigilStrikeAt,
  type SigilOutcome, type SigilPlan,
} from "@/lib/target-sigil"

/** Board units across, at rest. A square is 1.0. */
const SIZE = 2.3

/** Height of the quad's CENTRE, chosen so the ring lands near the knees. */
const CENTRE_Y = 1.05

export function targetSigilVfx(opts: {
  parent: THREE.Object3D
  camera?: THREE.Camera | null
  /** The victim's feet, in world space. */
  at: THREE.Vector3
  plan: SigilPlan
  outcome: SigilOutcome
  /**
   * Fired once, on the frame the spell actually takes — the end of the hold,
   * not the moment the sigil appears. The damage number, the flinch and the
   * impact sound hang off this, the same contract as a cast's onImpact.
   */
  onStrike?: () => void
}): VfxHandle {
  const { parent, plan, outcome } = opts
  const group = new THREE.Group()
  parent.add(group)

  let quad: Flip | null = null
  let peakP = 0.5              // replaced from the manifest once the sheet lands
  let light: THREE.PointLight | null = null
  let disposed = false
  let struck = false
  let t = 0
  const lifetime = sigilDuration(plan)
  const at = opts.at.clone()

  void loadSheet(plan.sheet).then((sheet) => {
    if (disposed) return
    // The peak is a property of the BAKED ART and moves when it is rebaked, so
    // it is read off the sheet rather than hardcoded here.
    const meta = sheet as unknown as { peak?: number; frames: number }
    if (typeof meta.peak === "number" && meta.frames > 0) peakP = meta.peak / meta.frames
    quad = new Flip(sheet, 0xffffff, SIZE, SIZE)
    quad.opacity = 0
    group.add(quad.mesh)
    // A single non-shadowing light, as everywhere else on this board.
    light = new THREE.PointLight(0x9a5bd6, 0, 6, 1.8)
    light.castShadow = false
    light.position.copy(at).setY(CENTRE_Y)
    group.add(light)
  }).catch(() => {})

  const dispose = () => {
    if (disposed) return
    disposed = true
    if (quad) { group.remove(quad.mesh); quad.dispose(); quad = null }
    if (light) { group.remove(light); light = null }
    group.parent?.remove(group)
  }

  return {
    update(dt: number) {
      if (disposed) return false
      t += dt
      const pose = sigilPoseAt(t, plan, outcome, peakP)

      if (!struck && pose.struck) {
        struck = true
        opts.onStrike?.()
      }

      if (quad) {
        quad.mesh.position.copy(at)
        quad.mesh.position.y += CENTRE_Y
        if (opts.camera) quad.mesh.quaternion.copy(opts.camera.quaternion)
        quad.mesh.rotateZ(pose.spin)
        quad.mesh.scale.setScalar(pose.scale)
        quad.setProgress(pose.frame)
        quad.opacity = pose.opacity
      }
      if (light) {
        // Brightest through the hold, so the victim is lit while they roll.
        light.intensity = pose.act === "hold" ? 9 : 9 * pose.opacity * 0.6
      }

      if (t >= lifetime) { dispose(); return false }
      return true
    },
    dispose,
  }
}

/** When the hit lands, for callers scheduling around it. */
export { sigilStrikeAt }
