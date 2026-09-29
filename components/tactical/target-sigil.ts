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

/**
 * The flame's footprint and height, in board units.
 *
 * Sam, 2026-09-28: "make the flame of necrotic magic flush with the base of
 * the sigil and the magic should look twice as long."
 *
 * FLUSH is geometry, not a nudge: the sheet is cropped to end exactly at the
 * floor plane and the quad is positioned by its BOTTOM edge, so the base of
 * the fire is the base of the sigil however the effect is scaled. Centring the
 * quad — what the first version did — floats the fire above its own ring.
 *
 * TWICE AS LONG is the 1:2 ratio here against a cell cropped from roughly a
 * square of source. The stretch lands on smoke and fire, which tolerate it;
 * the ring's glyphs are on their own sheet and are not stretched.
 */
/**
 * The hit spark's size, and how high up the body it lands.
 *
 * Chest height, not the floor: this is the spell landing ON them, not a mark
 * under them. Bigger than the flame is wide, so it reads as a detonation
 * rather than as part of the fire.
 */
const BURST_SIZE = 3.0
const BURST_Y = 1.0

const FLAME_W = 2.4
const FLAME_H = 4.8

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
  let motes: Flip | null = null
  let burst: Flip | null = null
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
    plume = new Flip(sheet, 0xffffff, FLAME_W, FLAME_H)
    plume.opacity = 0
    group.add(plume.mesh)
    glow = new THREE.PointLight(0x9a5bd6, 0, 6, 1.8)
    glow.castShadow = false
    group.add(glow)
  }).catch(() => {})

  // EMBERS RISING THROUGH THE FIRE (Sam, 2026-09-28: "add pixels to enhance
  // the plumes"). One shared white sheet, tinted with the school's own colour,
  // riding the same quad geometry as the plume so it is rooted and stretched
  // identically. Skipped entirely for a sigil that registers no mote art.
  if (plan.art.motes) {
    void loadSheet(plan.art.motes).then((sheet) => {
      if (disposed) return
      motes = new Flip(sheet, plan.art.tint ?? 0xffffff, FLAME_W, FLAME_H)
      motes.opacity = 0
      group.add(motes.mesh)
    }).catch(() => {})
  }

  // THE HIT SPARK on the frame the spell takes (Sam: "like the explosions
  // from Street Fighter"). Drawn at chest height on the victim, not on the
  // floor — it is the spell landing on them, not a mark under them.
  if (plan.art.burst) {
    void loadSheet(plan.art.burst).then((sheet) => {
      if (disposed) return
      burst = new Flip(sheet, plan.art.tint ?? 0xffffff, BURST_SIZE, BURST_SIZE)
      burst.opacity = 0
      group.add(burst.mesh)
    }).catch(() => {})
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const f of [ring, plume, motes, burst]) {
      if (!f) continue
      group.remove(f.mesh)
      f.dispose()
    }
    ring = plume = motes = burst = null
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
        // NO FLAME ON A SAVE. pose.flame is zero for the whole warded effect,
        // so the quad simply never shows; the ring above still forms, turns
        // and resolves.
        const lit = pose.opacity * pose.flame
        plume.mesh.visible = lit > 0.004
        if (plume.mesh.visible) {
          if (opts.camera) plume.mesh.quaternion.copy(opts.camera.quaternion)
          // Radiate widens the fire; height follows at a fraction of it, or a
          // spreading flame would also shoot to the ceiling.
          const sx = pose.radiate
          const sy = 1 + (pose.radiate - 1) * 0.45
          plume.mesh.scale.set(sx, sy, 1)
          // BASE-FLUSH. The quad is centred geometry, so lifting it by half
          // its SCALED height puts its bottom edge on the floor plane and
          // keeps it there as the fire grows.
          plume.mesh.position.set(at.x, at.y + (FLAME_H * sy) / 2, at.z)
          plume.setProgress(pose.frame)
          plume.opacity = lit
        }
      }

      if (motes) {
        // Same root, same stretch, same gating as the fire: the embers are
        // part of the flame, so they never outlive it and never show on a save.
        const lit = pose.opacity * pose.flame
        motes.mesh.visible = lit > 0.004
        if (motes.mesh.visible) {
          if (opts.camera) motes.mesh.quaternion.copy(opts.camera.quaternion)
          const sx = pose.radiate
          const sy = 1 + (pose.radiate - 1) * 0.45
          motes.mesh.scale.set(sx, sy, 1)
          motes.mesh.position.set(at.x, at.y + (FLAME_H * sy) / 2, at.z)
          // Driven by the CLOCK rather than by the sigil's progress: the motes
          // loop at their own drawn rate while the one-shot plume plays
          // through once beneath them.
          motes.clock(t)
          // Under the painted fire, so they read as embers inside it rather
          // than as confetti in front of it.
          motes.opacity = lit * 0.85
        }
      }

      if (burst) {
        // pose.burst is negative until the strike frame, and stays negative
        // for the whole of a warded cast.
        const b = pose.burst
        burst.mesh.visible = b >= 0 && b <= 1
        if (burst.mesh.visible) {
          if (opts.camera) burst.mesh.quaternion.copy(opts.camera.quaternion)
          burst.mesh.position.set(at.x, at.y + BURST_Y, at.z)
          // Grows as it goes, the way a spark throws itself outward.
          burst.mesh.scale.setScalar(0.75 + 0.55 * b)
          burst.setProgress(b)
          // Full brightness almost to the end: a spark does not fade, it stops.
          burst.opacity = b < 0.8 ? 1 : (1 - b) / 0.2
        }
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
