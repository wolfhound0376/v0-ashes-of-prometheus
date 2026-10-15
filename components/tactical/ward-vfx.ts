import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import type { WardSpell } from "@/lib/wards"
import { Flip, loadSheet } from "./spell-vfx-kit"
import {
  sanctuaryQuad, sanctuaryCentre, sanctuaryCastOpacity,
  RISE_SECONDS, CAST_SECONDS,
} from "@/lib/ward-look"

// ============================================================================
// A WARD LANDING — gold, from the feet up.
//
// Sam: "When Samson used Holy Shield/Armor we just have seen it land on Fifi
// by causing her to glow in gold from the feet moving up to her head slowly
// and then her AC is adjusted."
//
// Sanctuary and Shield of Faith resolved, cost their slot and changed the
// numbers, and looked like absolutely nothing — the kit has only offensive
// routes (ball, beam, radiate), all of which travel from a caster to a
// target and burst. A ward does the opposite: it arrives ON somebody and
// stays there.
//
// PROCEDURAL, for the same reason the arrow is. A rising band of light needs
// to hug a body whose height the board only learns at load time, from
// whatever GLB the token happens to carry — a sprite sheet cannot do that,
// and four of the twelve rigged models have no clips to hang one off anyway.
//
// THE SWEEP IS THE POINT. Not a flash: a band that starts at the floor and
// climbs to the crown over most of a second, because Sam described the
// motion, and because a protection that takes a moment to close reads as
// something being PUT ON rather than switched on.
// ============================================================================

const LOOK: Record<WardSpell, { core: number; halo: number; life: number }> = {
  // Lathander's gold. The same warm coin colour the HUD uses for a blessing.
  "shield of faith": { core: 0xffd77a, halo: 0xc9a227, life: 1.15 },
  // Sanctuary is cooler and paler — it hides rather than hardens, and giving
  // the two the same colour would make a player think they got the other one.
  sanctuary: { core: 0xf2f0dd, halo: 0x9fd8ff, life: 1.3 },
}

/**
 * Lay a ward on a body.
 *
 * `height` is how tall the thing is in board units; the caller measures it
 * from the model it actually loaded rather than assuming, because a myconid
 * sprout and a hook horror are both "one token".
 */
export function wardVfx(opts: {
  parent: THREE.Object3D
  /** The warded body, so the band follows it if it walks. */
  resolve: () => THREE.Object3D | null
  spell: WardSpell
  height?: number
  radius?: number
  /** The camera the board is drawing through; Sanctuary's dome faces it. */
  camera?: () => THREE.Camera | null
}): VfxHandle {
  if (opts.spell === "sanctuary") return sanctuaryCast(opts)
  const look = LOOK[opts.spell]
  const h = Math.max(0.8, opts.height ?? 1.7)
  const r = Math.max(0.25, opts.radius ?? 0.42)

  const group = new THREE.Group()
  opts.parent.add(group)

  // THE BAND: a ring that climbs. Open cylinder rather than a disc, so it
  // reads as a band of light passing over a body rather than as a plate
  // sliding up through it.
  const bandMat = new THREE.MeshBasicMaterial({
    color: look.core, transparent: true, opacity: 0.9, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 0.12, 24, 1, true), bandMat)
  group.add(band)

  // THE SHELL it leaves behind: fills in below the band as it rises, so the
  // protection visibly CLOSES over the body rather than a hoop wandering up
  // and nothing being left.
  const shellMat = new THREE.MeshBasicMaterial({
    color: look.halo, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  })
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), shellMat)
  shell.scale.set(r * 1.5, h * 0.62, r * 1.5)
  group.add(shell)

  let t = 0
  let dead = false

  return {
    update(dt: number): boolean {
      if (dead) return false
      t += dt
      const body = opts.resolve()
      if (!body) return false
      group.position.copy(body.position)

      const p = Math.min(1, t / look.life)
      // Ease out: quick off the floor, slowing as it reaches the head, which
      // is what makes it read as settling rather than as a constant-speed
      // wipe.
      const climb = 1 - Math.pow(1 - p, 2.2)
      band.position.y = climb * h
      // Wider at the waist, tighter at the crown — following a body's shape
      // rather than a tube's.
      const waist = 1 + Math.sin(climb * Math.PI) * 0.18
      band.scale.set(waist, 1, waist)
      bandMat.opacity = 0.9 * (1 - Math.pow(p, 3))

      // The shell fades in behind the band and then settles to a faint hold,
      // so the creature stays visibly warded rather than the whole thing
      // vanishing the instant it finishes.
      shellMat.opacity = p < 1 ? 0.16 * p : 0.1
      shell.position.y = h * 0.5

      if (t > look.life + 0.9) { dead = true; return false }
      return true
    },
    dispose() {
      dead = true
      group.remove(band, shell)
      band.geometry.dispose(); bandMat.dispose()
      shell.geometry.dispose(); shellMat.dispose()
      opts.parent.remove(group)
    },
  }
}

// ============================================================================
// SANCTUARY — Sam's own art.
//
// Sam, 2026-10-15, sending a 16-frame dome of gold and white light: embers on
// the floor, a ring, wisps rising up both sides, a halo closing over the top.
// It replaces the procedural band for Sanctuary only; Shield of Faith keeps
// the climbing gold Sam described for it.
//
// The rise plays once, the hold loops for a moment at full strength, then it
// lets go — and the standing ward in status-vfx.ts, quiet, takes over for as
// long as vtt_tokens.ward says the spell is up. lib/ward-look.ts holds the
// sizing and timing so both read the same numbers.
// ============================================================================

const toCam = new THREE.Vector3()
const camUp = new THREE.Vector3()

function sanctuaryCast(opts: {
  parent: THREE.Object3D
  resolve: () => THREE.Object3D | null
  height?: number
  radius?: number
  camera?: () => THREE.Camera | null
}): VfxHandle {
  const h = Math.max(0.8, opts.height ?? 1.7)
  const r = Math.max(0.18, opts.radius ?? 0.38)
  let rise: Flip | null = null
  let hold: Flip | null = null
  let t = 0
  let dead = false

  // Both sheets are asked for at once: the hold has to be here by the time
  // the rise ends, or the dome would blink out for a frame at the seam.
  void loadSheet("sanctuaryRise").then((s) => {
    if (dead) return
    rise = new Flip(s, 0xffffff, 1, 1)
    rise.opacity = 0
    opts.parent.add(rise.mesh)
  }).catch(() => {})
  void loadSheet("sanctuaryHold").then((s) => {
    if (dead) return
    hold = new Flip(s, 0xffffff, 1, 1)
    hold.opacity = 0
    opts.parent.add(hold.mesh)
  }).catch(() => {})

  const drop = (f: Flip | null) => {
    if (!f) return
    opts.parent.remove(f.mesh)
    f.dispose()
  }

  return {
    update(dt: number): boolean {
      if (dead) return false
      t += dt
      const body = opts.resolve()
      const cam = opts.camera?.() ?? null
      if (!body) return false
      if (t > CAST_SECONDS) { dead = true; return false }
      if (!cam) return true

      camUp.set(0, 1, 0).applyQuaternion(cam.quaternion)
      cam.getWorldDirection(toCam).negate()
      // A billboard's height runs along the camera's up, and a standing body
      // is foreshortened by the pitch, so the halo is sized against the body
      // as it LOOKS rather than as it is.
      const quad = sanctuaryQuad(h * Math.max(0.2, camUp.y), r)
      const c = sanctuaryCentre(body.position, camUp, toCam, quad)
      const a = sanctuaryCastOpacity(t)
      for (const f of [rise, hold]) {
        if (!f) continue
        f.mesh.position.set(c.x, c.y, c.z)
        f.mesh.quaternion.copy(cam.quaternion)
        f.mesh.scale.set(quad.w, quad.h, 1)
      }
      // ONE of the two at a time. Until the hold has arrived the rise keeps
      // its last frame rather than leaving nothing on the body.
      const rising = t < RISE_SECONDS || !hold
      if (rise) { rise.setProgress(Math.min(0.999, t / RISE_SECONDS)); rise.opacity = rising ? a : 0 }
      if (hold) { hold.clock(t - RISE_SECONDS); hold.opacity = rising ? 0 : a }
      return true
    },
    dispose() {
      dead = true
      drop(rise); drop(hold)
      rise = hold = null
    },
  }
}
