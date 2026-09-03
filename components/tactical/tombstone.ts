// ============================================================================
// THE TOMBSTONE — the board's one permanent record that somebody actually died.
//
// Sam: "When a character dies, not downed, a funny looking tombstone in high
// quality graphics, shows up where the character was reading RIP."
//
// "NOT DOWNED" IS THE WHOLE SPECIFICATION.
//
// A character at 0 hit points is unconscious and rolling death saves, and they
// come back from that most of the time. death-vfx already treats them
// correctly: the "collapse" death keeps their colour precisely so a downed
// friend is not dressed as a corpse. Planting a headstone on somebody who is
// about to roll a 20 and stand up would be the same lie, carved in granite.
//
// So this fires on lib/death-saves' `dead` vitality and nothing else — the
// Dead condition, written when massive damage kills outright or the third
// death save fails. It is a different moment from the fall, arriving anywhere
// from the same instant to six rounds later, which is why it cannot ride on
// the HP change the way the collapse does.
//
// IT NEVER FINISHES.
//
// Every other VfxHandle on this board returns false and is disposed. This one
// returns true forever: it is not an effect, it is a piece of the map now. The
// board's own unmount disposes it with the rest of vfx[], which is the only
// death it gets.
//
// THE MODEL IS LOADED ONCE, EARLY, AND ON PURPOSE.
//
// It is ~2 MB with three 2K textures. Fetching and decoding that at the moment
// somebody's character dies is a frame hitch on the single most dramatic beat
// in a session. preloadTombstone() is called when the board builds, so by the
// time anyone needs it the GLB is already parsed and every later death clones
// it for free.
// ============================================================================

import * as THREE from "three"
// three/addons, matching the board. NOT three/examples/jsm — the two resolve
// differently under Turbopack and only one of them is what this app ships.
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import type { VfxHandle } from "./spell-vfx"

/**
 * The 2K cut. The 4K original is beside it in the bucket as
 * `tombstone-rip-4k.glb` and is a one-word edit away.
 *
 * The prop draws about one square wide — call it 120 screen pixels on a 1440p
 * board. A 4096² base colour on that is roughly thirty times more texels than
 * there are pixels to put them in, times three maps, and it costs ~200 MB of
 * video memory to be invisible. This file's neighbour (spell-vfx) states the
 * board's rule as staying smooth on a mid-range laptop; 2K keeps the carving
 * and the moss legible and hands three quarters of that memory back.
 */
export const TOMBSTONE_URL =
  "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/props/tombstone-rip.glb"

/**
 * How tall the stone stands, in world units, before per-token scaling.
 *
 * Measured against the board's own creature scale rather than guessed: 1 unit
 * is one 5-ft square, and spawnToken sizes a medium creature to about 1.2
 * units. So the first number I tried — normalising the GLB to its authored
 * 1.15 — put a headstone the same height as the person under it, which reads
 * as a monument looming over the corpse rather than a marker beside it.
 *
 * 0.72 units is about 3.6 feet: chest height on a standing character, which is
 * what a headstone actually is, and still unmistakable from the tactical
 * camera.
 */
const HEIGHT = 0.72

/** The rise: sunk, shoved up past true, settling back. */
const RISE = 1.05

let cached: THREE.Group | null = null
let inFlight: Promise<THREE.Group | null> | null = null

/**
 * Fetch and parse the stone once. Safe to call repeatedly — later calls get
 * the same promise, so a board that mounts twice does not fetch twice.
 *
 * Never throws. A missing prop must not take the board down with it: the
 * worst honest outcome is a death with no headstone, and that is what a
 * failure here produces.
 */
export function preloadTombstone(url: string = TOMBSTONE_URL): Promise<THREE.Group | null> {
  if (cached) return Promise.resolve(cached)
  if (inFlight) return inFlight
  inFlight = new Promise<THREE.Group | null>((resolve) => {
    new GLTFLoader().load(
      url,
      (gltf) => {
        const root = gltf.scene
        // Normalise ONCE, on the master, so every clone is already the right
        // size and sitting on its base rather than through it. The GLB is
        // authored ~2.18 units tall with its foot a little below the origin.
        const box = new THREE.Box3().setFromObject(root)
        const size = new THREE.Vector3()
        box.getSize(size)
        const s = size.y > 1e-4 ? HEIGHT / size.y : 1
        root.scale.setScalar(s)
        root.updateWorldMatrix(true, true)
        const box2 = new THREE.Box3().setFromObject(root)
        root.position.set(
          -(box2.min.x + box2.max.x) / 2,
          -box2.min.y,
          -(box2.min.z + box2.max.z) / 2,
        )
        root.traverse((o) => {
          const mesh = o as THREE.Mesh
          if (!mesh.isMesh) return
          mesh.castShadow = true
          mesh.receiveShadow = true
          // Same colour-space assertion the board makes for tokens: a base
          // colour read as linear renders washed and muddy, and asserting it
          // costs nothing next to rediscovering it.
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const m of mats) {
            const std = m as THREE.MeshStandardMaterial
            if (std?.map) std.map.colorSpace = THREE.SRGBColorSpace
          }
        })
        cached = root
        resolve(root)
      },
      undefined,
      (err) => {
        console.warn("[tombstone] could not load the stone — deaths will go unmarked", err)
        resolve(null)
      },
    )
  })
  return inFlight
}

export interface TombstoneOpts {
  parent: THREE.Object3D
  /** Centre of the square the character died on. */
  position: THREE.Vector3
  /** Token size multiplier, so a giant's grave is a giant's grave. */
  scale?: number
  /** Turned a little off-square so a row of graves is not a row of clones. */
  seed?: number
}

/**
 * Plant a stone. Returns null when the model never loaded, so the caller can
 * simply not push it.
 */
export function tombstoneVfx(o: TombstoneOpts): VfxHandle | null {
  if (!cached) return null

  const group = new THREE.Group()
  const stone = cached.clone(true)
  group.add(stone)

  const scale = o.scale ?? 1
  group.scale.setScalar(scale)

  // A quarter-square back and a hand to the side, so the stone marks the
  // square without standing inside the body already lying on it. The body is
  // the record of HOW they died and stays worth seeing.
  const seed = o.seed ?? 0
  const jitterX = (((seed & 0xff) / 255) - 0.5) * 0.22
  const jitterZ = (((seed >>> 8 & 0xff) / 255) - 0.5) * 0.18
  group.position.set(o.position.x + jitterX, 0, o.position.z - 0.26 * scale + jitterZ)

  // Never perfectly square to the grid. A headstone that lines up exactly with
  // the tiles reads as a game object; two degrees of lean reads as a grave.
  group.rotation.y = (((seed >>> 16 & 0xff) / 255) - 0.5) * 0.9
  group.rotation.z = (((seed >>> 24 & 0xff) / 255) - 0.5) * 0.10

  // Starts buried. The rise is the whole gag: it shoves up out of the floor
  // like something being planted rather than fading in like a UI element.
  const sunk = -HEIGHT * scale * 1.05
  group.position.y = sunk
  o.parent.add(group)

  // A little dust where it breaks the floor.
  const DUST = 26
  const dustGeo = new THREE.BufferGeometry()
  const dPos = new Float32Array(DUST * 3)
  const dVel: THREE.Vector3[] = []
  for (let i = 0; i < DUST; i++) {
    const a = Math.random() * Math.PI * 2
    const r = 0.12 + Math.random() * 0.3
    dPos[i * 3] = o.position.x + Math.cos(a) * r
    dPos[i * 3 + 1] = 0.02
    dPos[i * 3 + 2] = o.position.z + Math.sin(a) * r
    dVel.push(new THREE.Vector3(Math.cos(a) * 0.22, 0.35 + Math.random() * 0.4, Math.sin(a) * 0.22))
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dPos, 3))
  const dustMat = new THREE.PointsMaterial({
    color: 0xbfae92, size: 0.1, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.NormalBlending, sizeAttenuation: true,
  })
  const dust = new THREE.Points(dustGeo, dustMat)
  o.parent.add(dust)

  let t = 0
  let settled = false

  return {
    update(dt: number): boolean {
      // Once it has landed this is a rock. Do nothing, cost nothing, and stay
      // — returning false here would have the caller dispose the grave.
      if (settled) return true

      t += dt
      const k = Math.min(1, t / RISE)
      // Ease out with a small overshoot, so it thumps into place.
      const e = 1 - Math.pow(1 - k, 3)
      const overshoot = Math.sin(k * Math.PI) * 0.06 * HEIGHT * scale
      group.position.y = sunk + (0 - sunk) * e + overshoot

      // Dust appears as the stone breaks the surface, then falls away.
      const dk = Math.min(1, Math.max(0, (t - 0.18) / 0.9))
      dustMat.opacity = dk < 0.25 ? dk / 0.25 * 0.55 : (1 - (dk - 0.25) / 0.75) * 0.55
      const arr = dustGeo.getAttribute("position") as THREE.BufferAttribute
      for (let i = 0; i < DUST; i++) {
        const v = dVel[i]
        arr.setY(i, Math.max(0.01, arr.getY(i) + v.y * dt))
        arr.setX(i, arr.getX(i) + v.x * dt)
        arr.setZ(i, arr.getZ(i) + v.z * dt)
        v.y -= 1.4 * dt
      }
      arr.needsUpdate = true

      if (t >= RISE + 1.1) {
        group.position.y = 0
        // The dust is finished even though the stone is not — drop it early so
        // a board with several graves is not paying for particles nobody sees.
        dust.removeFromParent()
        dustGeo.dispose()
        dustMat.dispose()
        settled = true
      }
      return true
    },
    dispose() {
      // DELIBERATELY NOT disposing the stone's geometry or materials.
      //
      // Object3D.clone() SHARES both with the object it was cloned from, and
      // what this was cloned from is the cached master every future grave is
      // made of. Disposing here would free the buffers out from under the
      // cache: the next character to die would get an empty grave, and so
      // would every one after. Detaching is the whole of the cleanup — the
      // master owns the resources and lives as long as the page.
      group.removeFromParent()
      dust.removeFromParent()
      dustGeo.dispose()
      dustMat.dispose()
    },
  }
}
