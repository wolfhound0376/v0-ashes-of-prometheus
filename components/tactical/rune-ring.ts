// ============================================================================
// THE RUNE RING — glyphs orbiting the caster's forearm.
//
// Sam, 2026-09-28: "rune symbols that are generated around the casting arms of
// the spell caster ... based on schools of magic as well as the colors and
// effects."
//
// ── what this replaces ─────────────────────────────────────────────────────
//
// One quad. The kit drew the school's rune as a single 1.1 x 1.1 sprite
// pinned to the palm, tinted white, turning at 1.5 rad/s — the same
// performance for all eight schools. The glyph art differed; nothing else
// did, so at the board's camera distance no player could tell an abjuration
// from a necromancy without pausing.
//
// ── what it is now ─────────────────────────────────────────────────────────
//
// Five to seven small glyphs orbiting the FOREARM like a bracelet, in the
// school's own colour, moving in the school's own way. The arm passes through
// the ring. That is the literal reading of what Sam asked for, and it is also
// the better one: a ring around the forearm moves with the cast animation, so
// the follow-through throws it, where a disc on the palm just slid.
//
// ── finding the forearm ────────────────────────────────────────────────────
//
// The ring's axis is the forearm, taken from the hand bone to its PARENT in
// the skeleton, which is the forearm or elbow joint. That is why this takes a
// bone rather than a position: a position gives you a point and no direction,
// and a ring needs an axis or it is just a disc again. Rigs that do not give
// the hand a parent fall back to the direction of the cast, and failing that
// to world up — both still draw a ring, just not one aligned to the limb.
//
// ── budget ─────────────────────────────────────────────────────────────────
//
// Seven quads at most, one shared texture (Flip clones the UV window, not the
// image), no allocation per frame — the basis vectors and the scratch vectors
// below are built once and reused. That is about the cost of the single disc
// it replaces plus six more draw calls, which the board can afford for the
// ~0.8s a charge lasts.
// ============================================================================

import * as THREE from "three"
import { Flip, type Sheet } from "./spell-vfx-kit"
import type { MagicSchool } from "@/lib/spell-school"
import { SCHOOL_VFX, glyphPose, quadCount, releasePose } from "@/lib/spell-school-vfx"

/** How big one glyph is, in board units. A square is 1.0. */
const GLYPH = 0.30

/** How far up the forearm the ring sits from the hand bone, toward the elbow. */
const UP_THE_ARM = 0.20

export class RuneRing {
  private readonly quads: Flip[] = []
  private readonly school: MagicSchool
  private readonly seed: number
  private readonly group = new THREE.Group()

  // Scratch. Built once; every frame writes through them rather than
  // allocating, which is the board's rule for anything in an update loop.
  private readonly hand = new THREE.Vector3()
  private readonly elbow = new THREE.Vector3()
  private readonly axis = new THREE.Vector3(0, 1, 0)
  private readonly u = new THREE.Vector3()
  private readonly v = new THREE.Vector3()
  private readonly at = new THREE.Vector3()
  private readonly fallback = new THREE.Vector3()

  constructor(parent: THREE.Object3D, sheet: Sheet, school: MagicSchool, seed = 0) {
    this.school = school
    this.seed = seed
    const vfx = SCHOOL_VFX[school]
    for (let i = 0; i < quadCount(school); i++) {
      const f = new Flip(sheet, vfx.tint, GLYPH, GLYPH)
      f.opacity = 0
      this.quads.push(f)
      this.group.add(f.mesh)
    }
    parent.add(this.group)
  }

  /**
   * Place every glyph for this frame.
   *
   * `t` is seconds since the charge began and `charge` its full length, so
   * the school's motion knows how far through it is. `aim` is the direction
   * the spell will leave in, used only as a fallback axis when the rig gives
   * the hand no parent bone.
   */
  update(opts: {
    anchor: THREE.Object3D
    t: number
    charge: number
    camera?: THREE.Camera | null
    aim?: THREE.Vector3 | null
  }): void {
    const { anchor, t, charge, camera } = opts
    anchor.getWorldPosition(this.hand)

    // THE FOREARM, or the best stand-in the rig allows.
    const parent = anchor.parent
    if (parent) {
      parent.getWorldPosition(this.elbow)
      this.axis.subVectors(this.hand, this.elbow)
      // A hand sharing its parent's exact position gives a zero vector, which
      // would normalize to NaN and blank the whole ring.
      if (this.axis.lengthSq() < 1e-8) this.axis.set(0, 1, 0)
      else this.axis.normalize()
    } else if (opts.aim) {
      this.axis.subVectors(opts.aim, this.hand)
      if (this.axis.lengthSq() < 1e-8) this.axis.set(0, 1, 0)
      else this.axis.normalize()
    } else {
      this.axis.set(0, 1, 0)
    }

    // An orthonormal pair spanning the plane the ring lives in. Cross with
    // world up unless the axis IS world up, in which case cross with X.
    this.fallback.set(0, 1, 0)
    if (Math.abs(this.axis.dot(this.fallback)) > 0.97) this.fallback.set(1, 0, 0)
    this.u.crossVectors(this.axis, this.fallback).normalize()
    this.v.crossVectors(this.axis, this.u).normalize()

    const n = this.quads.length
    for (let i = 0; i < n; i++) {
      const q = this.quads[i]
      const pose = glyphPose(this.school, i, t, charge, this.seed)
      const c = Math.cos(pose.angle) * pose.radius
      const s = Math.sin(pose.angle) * pose.radius

      // hand + axis*(up the arm + this glyph's own slide) + the ring offset
      this.at.copy(this.hand)
      this.at.addScaledVector(this.axis, UP_THE_ARM + pose.along)
      this.at.addScaledVector(this.u, c)
      this.at.addScaledVector(this.v, s)
      q.mesh.position.copy(this.at)

      // Billboarded, not laid in the ring's plane. A glyph lying in the plane
      // is edge-on to the camera for half its orbit and simply vanishes there;
      // facing the camera keeps all of them legible, and the ORBIT is what
      // says "around the arm", not the glyph's own facing.
      if (camera) q.mesh.quaternion.copy(camera.quaternion)
      // A negative scale hangs the glyph upside down — necromancy.
      q.mesh.scale.set(1, pose.scale, 1)

      q.opacity = pose.opacity
      q.clock(t + i * 0.07)   // offset so the ring is not sixteen frames in lockstep
    }
  }

  /**
   * Throw the ring outward and fade it. `u` is seconds since the release
   * frame. Returns false once there is nothing left to draw.
   */
  release(u: number): boolean {
    const pose = releasePose(this.school, u)
    const vfx = SCHOOL_VFX[this.school]
    for (const q of this.quads) {
      q.opacity = pose.opacity
      q.tint = vfx.release
      // Scale about the ring's centre by moving the quads, not by scaling the
      // group — the group is at the origin and the quads are in world space.
      q.mesh.scale.set(pose.scale, pose.scale * Math.sign(q.mesh.scale.y || 1), pose.scale)
    }
    return pose.opacity > 0.01
  }

  /**
   * Push the whole ring outward from the hand as it is thrown. Separate from
   * release() because it needs the hand position, which only the caller has.
   */
  expandFrom(hand: THREE.Vector3, u: number): void {
    const pose = releasePose(this.school, u)
    for (const q of this.quads) {
      this.at.subVectors(q.mesh.position, hand)
      const len = this.at.length()
      if (len > 1e-6) {
        this.at.multiplyScalar((len + (pose.scale - 1) * 0.22) / len)
        q.mesh.position.copy(hand).add(this.at)
      }
    }
  }

  dispose(): void {
    for (const q of this.quads) {
      this.group.remove(q.mesh)
      q.dispose()
    }
    this.quads.length = 0
    this.group.parent?.remove(this.group)
  }
}
