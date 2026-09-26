import * as THREE from "three"
import type { Sheet } from "./spell-vfx-kit"

// ============================================================================
// THE SPARKS — what comes off a hit.
//
// An impact used to be one flipbook quad and a light. It bloomed and it
// faded, and it never threw anything: no embers off a Fireball, no shards off
// a frost bolt, no sparks off steel. Sam: "better ... impact animations".
//
// This is a pool of little pixel-art sparks (public/vfx/pxSpark, one 8x8
// diamond) thrown from the point of impact, tinted the damage type's colour,
// under gravity, shrinking to nothing. ONE draw call however many there are:
// an InstancedMesh, allocated once per cast, never per frame. A dead spark
// is scaled to zero, which is cheaper than any visibility flag.
//
// Deterministic: the seed picks every direction, so the same hit throws the
// same sparks on every seat.
// ============================================================================

/** mulberry32 — small, fast, good enough for where sparks go. */
function rng(seed: number): () => number {
  let a = (seed >>> 0) || 1
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const GRAVITY = 7.5
const DRAG = 1.8

export class ImpactBurst {
  readonly mesh: THREE.InstancedMesh
  private readonly geo: THREE.PlaneGeometry
  private readonly mat: THREE.MeshBasicMaterial
  private readonly n: number
  private readonly pos: Float32Array
  private readonly vel: Float32Array
  private readonly life: Float32Array
  private readonly age: Float32Array
  private readonly size: Float32Array
  private readonly dummy = new THREE.Object3D()
  private alive = 0

  constructor(parent: THREE.Object3D, sheet: Sheet, tint: number, count: number) {
    this.n = Math.max(1, Math.min(64, count))
    this.geo = new THREE.PlaneGeometry(1, 1)
    this.mat = new THREE.MeshBasicMaterial({
      map: sheet.tex,
      color: tint,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.n)
    this.mesh.frustumCulled = false
    this.pos = new Float32Array(this.n * 3)
    this.vel = new Float32Array(this.n * 3)
    this.life = new Float32Array(this.n)
    this.age = new Float32Array(this.n)
    this.size = new Float32Array(this.n)
    // Everything starts dead: a zero-scale matrix draws nothing.
    this.dummy.scale.setScalar(0)
    this.dummy.updateMatrix()
    for (let i = 0; i < this.n; i++) this.mesh.setMatrixAt(i, this.dummy.matrix)
    this.mesh.instanceMatrix.needsUpdate = true
    parent.add(this.mesh)
  }

  /**
   * Throw every spark from `at`.
   *
   * `incoming` is the direction the spell arrived from; sparks favour
   * bouncing back the way it came and up, the way debris does. `power`
   * scales speed and size — an area spell throws further than a cantrip.
   */
  fire(at: THREE.Vector3, incoming: THREE.Vector3 | null, power = 1, seed = 1): void {
    const r = rng(seed)
    const back = incoming ? incoming.clone().normalize().multiplyScalar(-0.55) : new THREE.Vector3()
    for (let i = 0; i < this.n; i++) {
      // A random direction, nudged back along the flight and upward.
      const dx = r() * 2 - 1, dy = r() * 2 - 1, dz = r() * 2 - 1
      const len = Math.hypot(dx, dy, dz) || 1
      let vx = dx / len + back.x, vy = dy / len + back.y + 0.7, vz = dz / len + back.z
      const vlen = Math.hypot(vx, vy, vz) || 1
      const speed = (1.8 + 4.2 * r()) * power
      vx = (vx / vlen) * speed; vy = (vy / vlen) * speed; vz = (vz / vlen) * speed
      this.pos[i * 3] = at.x + vx * 0.015
      this.pos[i * 3 + 1] = at.y + vy * 0.015
      this.pos[i * 3 + 2] = at.z + vz * 0.015
      this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz
      this.life[i] = 0.28 + 0.42 * r()
      this.age[i] = 0
      this.size[i] = (0.07 + 0.09 * r()) * Math.sqrt(power)
    }
    this.alive = this.n
  }

  /** Advance the sparks. Returns true while any is still in the air. */
  update(dt: number, camera?: THREE.Camera | null): boolean {
    if (this.alive === 0) return false
    let alive = 0
    for (let i = 0; i < this.n; i++) {
      const a = (this.age[i] += dt)
      const l = this.life[i]
      if (a >= l) {
        this.dummy.scale.setScalar(0)
        this.dummy.updateMatrix()
        this.mesh.setMatrixAt(i, this.dummy.matrix)
        continue
      }
      alive++
      const k = i * 3
      this.vel[k + 1] -= GRAVITY * dt
      const drag = Math.max(0, 1 - DRAG * dt)
      this.vel[k] *= drag; this.vel[k + 1] *= drag; this.vel[k + 2] *= drag
      this.pos[k] += this.vel[k] * dt
      this.pos[k + 1] += this.vel[k + 1] * dt
      this.pos[k + 2] += this.vel[k + 2] * dt
      // A spark on the floor stops there rather than sinking through it.
      if (this.pos[k + 1] < 0.02) { this.pos[k + 1] = 0.02; this.vel[k + 1] *= -0.3 }
      const s = this.size[i] * Math.pow(1 - a / l, 0.7)
      this.dummy.position.set(this.pos[k], this.pos[k + 1], this.pos[k + 2])
      if (camera) this.dummy.quaternion.copy(camera.quaternion)
      this.dummy.scale.setScalar(s)
      this.dummy.updateMatrix()
      this.mesh.setMatrixAt(i, this.dummy.matrix)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.alive = alive
    return alive > 0
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh)
    this.geo.dispose()
    this.mat.dispose()
    this.mesh.dispose()
  }
}
