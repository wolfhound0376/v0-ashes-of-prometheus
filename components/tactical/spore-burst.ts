import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import { DEATH_BURST_SECONDS } from "@/lib/death-burst"

// ============================================================================
// THE SPORE BURST — a gas spore going off.
//
// The gas spore's Death Burst (lib/death-burst) catches every creature within
// 20 feet. This is that radius, made visible: a sickly green-grey ring of
// spores thrown out from the body to fill the whole area, then left to drift
// and thin out. Three seconds, the same beat as every death in death-vfx,
// because it IS the spore's death and it plays beside it.
//
// Three layers, all procedural (no new sheets to bake):
//   the FLOOR  a soft disc that races out to the full radius, so the table
//              can see exactly who was inside;
//   the RIM    a thin ring at the edge, the line the rule draws;
//   the CLOUD  puffs thrown outward that slow, swell, drift and fade.
//
// Normal blending, not additive: spores are murk, and murk that glows reads
// as magic. One InstancedMesh for the cloud, allocated once. Deterministic
// from the seed so every seat sees the same cloud.
// ============================================================================

const TINT_CORE = new THREE.Color(0x8f9a62) // sickly green
const TINT_ASH = new THREE.Color(0x8a8878) // grey
const PUFFS = 56
/** When the spores reach the edge. The rest of the three seconds is drift. */
const SPREAD = 0.7

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

/** One soft round blot, drawn once and shared by every burst. */
let puffTex: THREE.Texture | null = null
function softTexture(): THREE.Texture {
  if (puffTex) return puffTex
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,255,255,1)")
  grad.addColorStop(0.45, "rgba(255,255,255,0.55)")
  grad.addColorStop(1, "rgba(255,255,255,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  puffTex = new THREE.CanvasTexture(c)
  return puffTex
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3)

export function sporeBurstVfx(args: {
  parent: THREE.Object3D
  /** The spore's square, on the floor. */
  position: THREE.Vector3
  /** The burst's radius in world units, to the edge of the last square caught. */
  radius: number
  camera?: THREE.Camera | null
  seed?: number
}): VfxHandle {
  const { parent, position, radius, camera } = args
  const r = rng(args.seed ?? Math.round(position.x * 1000 + position.z * 7919))
  const group = new THREE.Group()
  group.position.copy(position)
  parent.add(group)
  const tex = softTexture()

  // THE FLOOR.
  const floorGeo = new THREE.CircleGeometry(1, 48)
  const floorMat = new THREE.MeshBasicMaterial({
    map: tex, color: TINT_CORE, transparent: true, opacity: 0, depthWrite: false, toneMapped: false,
  })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0.03
  floor.scale.setScalar(0.01)
  group.add(floor)

  // THE RIM.
  const rimGeo = new THREE.RingGeometry(0.965, 1, 72)
  const rimMat = new THREE.MeshBasicMaterial({
    color: TINT_CORE, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  })
  const rim = new THREE.Mesh(rimGeo, rimMat)
  rim.rotation.x = -Math.PI / 2
  rim.position.y = 0.04
  rim.scale.setScalar(0.01)
  group.add(rim)

  // THE CLOUD.
  const puffGeo = new THREE.PlaneGeometry(1, 1)
  const puffMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  })
  const cloud = new THREE.InstancedMesh(puffGeo, puffMat, PUFFS)
  cloud.frustumCulled = false
  cloud.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * 3), 3)
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const angle = (i / PUFFS) * Math.PI * 2 + r() * 0.35
    // Most puffs ride the expanding ring; some fill the middle.
    const reach = radius * (i % 4 === 0 ? 0.25 + 0.5 * r() : 0.8 + 0.2 * r())
    const color = TINT_CORE.clone().lerp(TINT_ASH, r())
    cloud.setColorAt(i, color)
    return {
      angle, reach,
      height: 0.15 + 0.45 * r(),
      size: radius * (0.18 + 0.14 * r()),
      drift: new THREE.Vector2(r() - 0.5, r() - 0.5).multiplyScalar(radius * 0.12),
      rise: 0.15 + 0.25 * r(),
      delay: 0.08 * r(),
    }
  })
  cloud.instanceColor.needsUpdate = true
  group.add(cloud)

  const dummy = new THREE.Object3D()
  let t = 0
  return {
    update(dt: number) {
      t += dt
      const life = DEATH_BURST_SECONDS
      const out = easeOut(t / SPREAD)
      // Fades begin once the spores have filled the area.
      const fade = t < SPREAD ? 1 : Math.max(0, 1 - (t - SPREAD) / (life - SPREAD))

      floor.scale.setScalar(Math.max(0.01, radius * out))
      floorMat.opacity = 0.42 * Math.min(1, t / 0.12) * fade
      floor.rotation.z += dt * 0.15
      rim.scale.setScalar(Math.max(0.01, radius * out))
      rimMat.opacity = 0.7 * Math.min(1, t / 0.12) * fade * fade

      for (let i = 0; i < PUFFS; i++) {
        const p = puffs[i]
        const k = easeOut((t - p.delay) / SPREAD)
        const drift = Math.max(0, t - SPREAD)
        dummy.position.set(
          Math.cos(p.angle) * p.reach * k + p.drift.x * drift,
          p.height + p.rise * drift,
          Math.sin(p.angle) * p.reach * k + p.drift.y * drift,
        )
        if (camera) dummy.quaternion.copy(camera.quaternion)
        // Swell as they thin: a cloud spreading, not shrinking away.
        dummy.scale.setScalar(p.size * (0.35 + 0.65 * k) * (1 + 0.35 * drift) * (t < life ? 1 : 0))
        dummy.updateMatrix()
        cloud.setMatrixAt(i, dummy.matrix)
      }
      cloud.instanceMatrix.needsUpdate = true
      puffMat.opacity = 0.75 * fade

      return t < life
    },
    dispose() {
      parent.remove(group)
      floorGeo.dispose(); floorMat.dispose()
      rimGeo.dispose(); rimMat.dispose()
      puffGeo.dispose(); puffMat.dispose()
      cloud.dispose()
    },
  }
}
