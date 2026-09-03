// ============================================================================
// DEFENCE MOTION — what a miniature does when its rig cannot do it.
//
// The board asks a target to dodge, parry, block or flinch. clipFor answers
// with a clip name or null, and null is common: of the six models on the
// board today, FIVE have no dodge clip and two have no hit clip. They stood
// perfectly still while a blade went past them.
//
// The existing comment in token-animation is right that falling back to the
// flinch is wrong — "a miniature that recoils on a miss is lying to the
// table". But standing still is also a lie, just a quieter one, and it is the
// one players actually reported.
//
// So this is the third answer: move the BODY. No clip, no rig, no mixer —
// a short scripted transform on the object the board already has, the same
// trick death-vfx.ts uses to lay down a model with no death animation. It is
// not as good as an animated evade. It is much better than a statue, it works
// on every model including one with zero clips, and it is replaced for free
// the moment a real clip exists — the caller only reaches for this when
// clipFor returned null.
//
// Honours the VfxHandle contract so the board's existing effect loop drives
// it with no special case.
// ============================================================================

import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import type { TokenState } from "@/lib/token-animation"

/**
 * How each defence moves a body, in the object's own local space.
 *
 * `lean` is rotation about Z — the torso tipping. `shift` is a lateral step,
 * in board units, where one unit is a five-foot square. `drop` is a crouch.
 * `life` is how long the whole motion takes.
 *
 * The numbers are small on purpose. A miniature is being watched from a
 * tabletop camera, and a full square of travel reads as the token having
 * MOVED — which it has not; it is still standing in the square it occupies,
 * and the board's grid logic would disagree with anything larger.
 */
const SHAPES: Partial<Record<TokenState, { lean: number; shift: number; drop: number; life: number }>> = {
  // Out of the way and back. The biggest travel of the four, because a dodge
  // is the one defence that is ABOUT not being where you were.
  dodge: { lean: 0.55, shift: 0.62, drop: 0.16, life: 0.46 },
  // A turn of the blade: the body rotates, it does not travel.
  parry: { lean: 0.46, shift: 0.14, drop: 0.05, life: 0.36 },
  // Braced. Almost no lean, a real crouch — weight going down into the shield
  // rather than away from the blow.
  block: { lean: 0.14, shift: 0.10, drop: 0.28, life: 0.38 },
  // Taking it. Leans INTO the hit and sags, which is the opposite shape from
  // the dodge above and is what stops the two reading as the same motion.
  hurt: { lean: -0.42, shift: -0.26, drop: 0.20, life: 0.40 },
}

// ─────────────────────────────────────────────────────────────────────────────
// WHY THESE NUMBERS GOT BIGGER, roughly doubled, on 2026-09-03.
//
// Sam: "opponents that win after an attack (melee) role is made should show an
// appropriate dodge."
//
// The rule was already right and already running. defenceFor has returned
// parry on a near miss, dodge on a wide one and block behind a shield since it
// was written, and this file has been supplying the motion for it. The problem
// was purely that NOBODY COULD SEE IT.
//
// The first pass chose deliberately small numbers, reasoning that "a full
// square of travel reads as the token having MOVED". That reasoning is sound
// and the conclusion was wrong: at the distance this board is actually viewed
// from — a tabletop camera looking down at a 12x12 room — a third of a square
// over four tenths of a second is invisible. It was tuned by reading the code
// rather than by watching it.
//
// Still well under a square, so the grid never lies about where anybody is
// standing. It simply now happens far enough, and low enough, to be seen.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Move a body through a defence it has no clip for.
 *
 * `from` is where the blow came from, so the motion can be oriented — a dodge
 * away from the attacker rather than in an arbitrary direction. Without it the
 * step goes to the model's own left, which is still better than nothing but
 * looks arbitrary when the attacker is standing on the other side.
 *
 * Returns null when there is nothing sensible to do, so the caller can treat
 * "no motion" as a real answer rather than getting a handle that does nothing.
 */
export function defenceMotion(opts: {
  body: THREE.Object3D
  state: TokenState
  /** World position of whatever is attacking, if known. */
  from?: THREE.Vector3 | null
}): VfxHandle | null {
  const shape = SHAPES[opts.state]
  if (!shape) return null

  const body = opts.body
  // Captured, not read each frame. The board REBUILDS a token on any HP
  // change — and being hit is an HP change — so by the time this finishes the
  // object may have been replaced. Holding the numbers rather than the object
  // means the motion completes on whatever is standing there, and a rebuilt
  // token simply starts from its own rest pose.
  const rest = {
    rz: body.rotation.z,
    x: body.position.x,
    y: body.position.y,
    z: body.position.z,
  }

  // Away from the attacker, flattened to the floor plane. The board is
  // orbited, not free-flown, so a vertical component would only ever tip the
  // model into the ground.
  let ax = 0
  let az = 1
  if (opts.from) {
    const dx = body.position.x - opts.from.x
    const dz = body.position.z - opts.from.z
    const len = Math.hypot(dx, dz)
    if (len > 1e-4) { ax = dx / len; az = dz / len }
  }

  let t = 0
  let done = false

  return {
    update(dt: number): boolean {
      if (done) return false
      t += dt
      const p = Math.min(1, t / shape.life)
      // Out fast, back slow: a defence is a reaction, and a reaction that
      // eases out both ways reads as a dance step. sin(p*pi) peaks at the
      // halfway point and returns to zero, so the body always ends where it
      // started even if the handle is dropped early.
      const k = Math.sin(p * Math.PI) ** 0.7
      body.rotation.z = rest.rz + shape.lean * k
      body.position.x = rest.x + ax * shape.shift * k
      body.position.z = rest.z + az * shape.shift * k
      body.position.y = rest.y - shape.drop * k
      if (p >= 1) {
        // Put it back EXACTLY. Accumulated float error over a long session is
        // a miniature that has quietly leaned a few degrees off true and sunk
        // into the floor, which is the kind of thing nobody can name and
        // everybody notices.
        body.rotation.z = rest.rz
        body.position.set(rest.x, rest.y, rest.z)
        done = true
        return false
      }
      return true
    },
    dispose() {
      if (done) return
      body.rotation.z = rest.rz
      body.position.set(rest.x, rest.y, rest.z)
      done = true
    },
  }
}
