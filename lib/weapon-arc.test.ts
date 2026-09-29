import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { weaponArcVfx, ARC_STEEL } from "@/components/tactical/weapon-arc"
import { styleFor } from "@/lib/melee-combo"

const F = 1 / 60

/** A token with a hand bone and something in it, the shape the board passes. */
function fighter() {
  const body = new THREE.Object3D()
  const hand = new THREE.Object3D()
  hand.position.set(0.2, 0.8, 0)
  body.add(hand)
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.7, 0.05))
  blade.position.y = 0.35
  hand.add(blade)
  body.updateMatrixWorld(true)
  return { body, hand, blade }
}

function arcOn(opts: { move?: boolean; contact?: number; linger?: number } = {}) {
  const scene = new THREE.Object3D()
  const { body, hand, blade } = fighter()
  const handle = weaponArcVfx({
    parent: scene,
    body,
    blade,
    style: styleFor("blade", 0),
    contact: opts.contact ?? 0.3,
    linger: opts.linger ?? 0.4,
    tint: ARC_STEEL,
  })
  /** One frame, optionally swinging the arm the way a clip would. */
  const frame = (dt = F, turn = opts.move === false ? 0 : 0.35) => {
    hand.rotation.z += turn
    body.updateMatrixWorld(true)
    return handle.update(dt)
  }
  return { scene, handle, frame, body, blade }
}

/** The ribbon mesh the handle put into the scene. */
function ribbonOf(scene: THREE.Object3D): THREE.Mesh {
  const mesh = scene.children.find((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh
  expect(mesh, "the arc put no mesh in the scene").toBeTruthy()
  return mesh
}

function drawn(scene: THREE.Object3D): number {
  return ribbonOf(scene).geometry.drawRange.count
}

describe("the swing arc", () => {
  it("draws nothing until the blade is about to connect", () => {
    // A 2.8s Attack clip is mostly windup. An arc that started at frame zero
    // would trace the arm being RAISED, which reads as a smear, not a strike.
    const { scene, frame } = arcOn({ contact: 1.0 })
    for (let i = 0; i < 20; i++) frame()   // 0.33s in — still winding up
    expect(drawn(scene)).toBe(0)
  })

  it("grows a ribbon through the sweep", () => {
    const { scene, frame } = arcOn({ contact: 0 })
    frame(); frame(); frame()
    const early = drawn(scene)
    expect(early).toBeGreaterThan(0)
    for (let i = 0; i < 8; i++) frame()
    expect(drawn(scene)).toBeGreaterThan(early)
  })

  it("traces the weapon rather than inventing a path", () => {
    // The whole point: the ribbon is where the blade actually went. Swing the
    // arm through a known arc and the vertices have to land on it.
    const { scene, frame, blade } = arcOn({ contact: 0 })
    const seen: THREE.Vector3[] = []
    for (let i = 0; i < 10; i++) {
      frame()
      seen.push(blade.getWorldPosition(new THREE.Vector3()))
    }
    const pos = ribbonOf(scene).geometry.getAttribute("position")
    // Every tip the blade passed through should be somewhere in the ribbon.
    for (const p of seen.slice(2, 8)) {
      let nearest = Infinity
      for (let v = 0; v < pos.count; v++) {
        nearest = Math.min(nearest, p.distanceTo(new THREE.Vector3().fromBufferAttribute(pos, v)))
      }
      expect(nearest).toBeLessThan(0.45)
    }
  })

  it("sweeps a path of its own when the rig will not move", () => {
    // A creature with no usable swing in its rig traced a one-centimetre
    // ribbon, which reads as a rendering fault rather than as no feature. It
    // draws the arc itself instead.
    const { scene, frame } = arcOn({ contact: 0, move: false })
    for (let i = 0; i < 14; i++) frame()
    expect(drawn(scene)).toBeGreaterThan(0)
    const pos = ribbonOf(scene).geometry.getAttribute("position")
    const pts: THREE.Vector3[] = []
    for (let v = 0; v < pos.count; v++) pts.push(new THREE.Vector3().fromBufferAttribute(pos, v))
    const box = new THREE.Box3().setFromPoints(pts)
    // A real arc, not a dot.
    expect(box.getSize(new THREE.Vector3()).length()).toBeGreaterThan(0.3)
  })

  it("never writes a NaN into the buffers", () => {
    // A single NaN vertex takes the whole mesh off screen, silently.
    for (const move of [true, false]) {
      const { scene, frame } = arcOn({ contact: 0, move })
      for (let i = 0; i < 30; i++) frame()
      for (const name of ["position", "color"]) {
        const a = ribbonOf(scene).geometry.getAttribute(name)
        for (let v = 0; v < a.count * a.itemSize; v++) {
          expect(Number.isFinite((a.array as Float32Array)[v]), `${name} went NaN`).toBe(true)
        }
      }
    }
  })

  it("fades out and lets go", () => {
    const { handle, frame } = arcOn({ contact: 0, linger: 0.3 })
    let alive = true
    // Sweep (0.36s) plus linger (0.3s) is well under a second; give it two.
    for (let i = 0; i < 120 && alive; i++) alive = frame()
    expect(alive, "the arc never finished — it would hang on the board forever").toBe(false)
  })

  it("dims as it dies rather than retracting", () => {
    const { scene, frame } = arcOn({ contact: 0, linger: 0.5 })
    for (let i = 0; i < 24; i++) frame()     // through the sweep
    const brightness = () => {
      const c = ribbonOf(scene).geometry.getAttribute("color").array as Float32Array
      let sum = 0
      for (let i = 0; i < c.length; i++) sum += c[i]
      return sum
    }
    const rungs = drawn(scene)
    const lit = brightness()
    for (let i = 0; i < 12; i++) frame()
    expect(brightness()).toBeLessThan(lit)   // going out
    expect(drawn(scene)).toBe(rungs)         // but still the same length
  })

  it("takes its mesh with it when disposed", () => {
    const { scene, handle, frame } = arcOn({ contact: 0 })
    for (let i = 0; i < 6; i++) frame()
    expect(scene.children.length).toBe(1)
    handle.dispose()
    expect(scene.children.length).toBe(0)
  })

  it("copes with a creature that has nothing in its hand at all", () => {
    // equipOnRig returns null for a natural weapon, and the board passes the
    // hand bone instead — or, on a rig with no hand bone, null.
    const scene = new THREE.Object3D()
    const body = new THREE.Object3D()
    const handle = weaponArcVfx({
      parent: scene, body, blade: null,
      style: styleFor("empty", 2), contact: 0, linger: 0.3,
    })
    let alive = true
    for (let i = 0; i < 120 && alive; i++) alive = handle.update(F)
    expect(alive).toBe(false)
  })
})
