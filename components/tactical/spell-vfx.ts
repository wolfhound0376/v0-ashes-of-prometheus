// ============================================================================
// SPELL VFX — the light that leaves her hand.
//
// Raw Three.js, no new dependencies, no postprocessing package. Everything
// here is spawned at the RELEASE frame of a cast animation (see
// lib/token-animation castEventFor) and anchored to the caster's actual hand
// BONE, so it tracks the hand as the arm follows through. A position sampled
// once at spawn drifts off the palm within three frames — the bone moves.
//
// Frame budget: one non-shadowing point light, ~40 additive points, and at
// most one travelling mote per cast, all disposed when the effect ends. The
// board's rule is that this stays smooth on a mid-range laptop, so nothing
// here allocates per-frame.
// ============================================================================

import * as THREE from "three"

export interface VfxHandle {
  /** Advance. Returns false once finished — the caller drops the handle. */
  update(dt: number): boolean
  dispose(): void
}

export interface SpellPalette {
  /** The core flash and the light. */
  core: number
  /** The sparks thrown off it. */
  spark: number
}

const PALETTES: { match: string[]; palette: SpellPalette }[] = [
  { match: ["eldritch blast", "eldritch"], palette: { core: 0xc47dff, spark: 0x7b2fd6 } },
  { match: ["hex", "necrotic", "blight", "contagion"], palette: { core: 0x9dff6e, spark: 0x2f7a1e } },
  { match: ["guiding bolt", "radiant", "sacred flame", "healing", "cure"], palette: { core: 0xffe9a8, spark: 0xffb42e } },
  { match: ["web", "entangle", "grease"], palette: { core: 0xe8e4d8, spark: 0x9a9384 } },
  { match: ["fire", "flame", "burning", "fireball", "scorching"], palette: { core: 0xffc46b, spark: 0xff5a1e } },
  { match: ["frost", "ice", "cold", "sleet", "chill"], palette: { core: 0xbfe9ff, spark: 0x3f9fd6 } },
  { match: ["thunder", "lightning", "shatter", "shocking"], palette: { core: 0xdff0ff, spark: 0x5ea8ff } },
  { match: ["darkness", "hunger of hadar", "shadow", "void"], palette: { core: 0x9a6bd6, spark: 0x2a1040 } },
]

/** Arcane blue when we have never heard of the spell. */
const DEFAULT_PALETTE: SpellPalette = { core: 0x9fd8ff, spark: 0x3d7ad6 }

export function paletteForSpell(name: string): SpellPalette {
  const key = name.trim().toLowerCase()
  for (const p of PALETTES) {
    if (p.match.some((m) => key.includes(m))) return p.palette
  }
  return DEFAULT_PALETTE
}

const SPARKS = 40
const SPARK_LIFE = 0.9
const FLASH_LIFE = 0.4
const BOLT_SPEED = 26 // board units per second

/**
 * Fire a cast effect from `anchor` (the hand bone).
 *
 * `target` is optional: given one, a mote travels from the hand to that point
 * and bursts on arrival, which is what sells a ranged attack. Without one the
 * effect is just the discharge at the palm, which is right for a self or area
 * spell.
 */
export function castSpellVfx(opts: {
  parent: THREE.Object3D
  anchor: THREE.Object3D
  palette: SpellPalette
  target?: THREE.Vector3 | null
}): VfxHandle {
  const { parent, anchor, palette } = opts
  const origin = new THREE.Vector3()
  anchor.getWorldPosition(origin)

  const group = new THREE.Group()
  group.position.copy(origin)
  parent.add(group)

  // ── the flash: a light and a small additive core, both on the palm ──────
  const light = new THREE.PointLight(palette.core, 22, 9, 1.6)
  light.castShadow = false // the board's rule; a shadow-casting spark is not affordable
  group.add(light)

  const coreGeo = new THREE.IcosahedronGeometry(0.16, 1)
  const coreMat = new THREE.MeshBasicMaterial({
    color: palette.core,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const core = new THREE.Mesh(coreGeo, coreMat)
  group.add(core)

  // ── the sparks: thrown outward in world space, so they stay where they
  //    were thrown rather than dragging along with the follow-through ──────
  const sparkPos = new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3)
  const vel: THREE.Vector3[] = []
  for (let i = 0; i < SPARKS; i++) {
    sparkPos.setXYZ(i, origin.x, origin.y, origin.z)
    const dir = new THREE.Vector3(
      Math.random() * 2 - 1,
      Math.random() * 1.4 - 0.35,
      Math.random() * 2 - 1,
    ).normalize()
    vel.push(dir.multiplyScalar(1.2 + Math.random() * 2.4))
  }
  const sparkGeo = new THREE.BufferGeometry()
  sparkGeo.setAttribute("position", sparkPos)
  const sparkMat = new THREE.PointsMaterial({
    color: palette.spark,
    size: 0.09,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })
  const sparks = new THREE.Points(sparkGeo, sparkMat)
  sparks.frustumCulled = false
  parent.add(sparks)

  // ── the mote: only when the spell has somewhere to go ───────────────────
  const target = opts.target ? opts.target.clone() : null
  let bolt: THREE.Mesh | null = null
  let boltMat: THREE.MeshBasicMaterial | null = null
  let boltGeo: THREE.SphereGeometry | null = null
  let travel = 0
  let distance = 0
  if (target) {
    distance = origin.distanceTo(target)
    boltGeo = new THREE.SphereGeometry(0.13, 10, 8)
    boltMat = new THREE.MeshBasicMaterial({
      color: palette.core,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    bolt = new THREE.Mesh(boltGeo, boltMat)
    bolt.position.copy(origin)
    parent.add(bolt)
  }

  let t = 0
  let impacted = false
  /** The flash is extinguished exactly once. Without this latch the impact
   *  light, set below, is zeroed again on the very next frame by the branch
   *  that ends the flash — and the mote lands in the dark. */
  let flashDone = false
  const world = new THREE.Vector3()
  const lifetime = target ? SPARK_LIFE + distance / BOLT_SPEED + 0.35 : SPARK_LIFE

  let disposed = false
  const dispose = () => {
    if (disposed) return
    disposed = true
    parent.remove(sparks)
    sparkGeo.dispose()
    sparkMat.dispose()
    group.remove(light)
    group.remove(core)
    parent.remove(group)
    coreGeo.dispose()
    coreMat.dispose()
    if (bolt) {
      parent.remove(bolt)
      boltGeo?.dispose()
      boltMat?.dispose()
    }
  }

  return {
    update(dt: number) {
      if (disposed) return false
      t += dt

      // The flash rides the palm for as long as it lives.
      if (t < FLASH_LIFE) {
        anchor.getWorldPosition(world)
        group.position.copy(world)
        const k = 1 - t / FLASH_LIFE
        light.intensity = 22 * k * k
        coreMat.opacity = 0.95 * k
        const s = 1 + (1 - k) * 2.2
        core.scale.setScalar(s)
      } else if (!flashDone) {
        flashDone = true
        light.intensity = 0
        coreMat.opacity = 0
      }

      // Sparks fly out and fall, in world space.
      if (t < SPARK_LIFE) {
        const k = 1 - t / SPARK_LIFE
        for (let i = 0; i < SPARKS; i++) {
          const v = vel[i]
          sparkPos.setXYZ(
            i,
            sparkPos.getX(i) + v.x * dt,
            sparkPos.getY(i) + v.y * dt,
            sparkPos.getZ(i) + v.z * dt,
          )
          v.y -= 3.4 * dt // a little gravity so it settles rather than escaping
        }
        sparkPos.needsUpdate = true
        sparkMat.opacity = 0.9 * k
      } else if (sparkMat.opacity !== 0) {
        sparkMat.opacity = 0
      }

      // The mote travels, then bursts.
      if (bolt && boltMat && target && !impacted) {
        travel += BOLT_SPEED * dt
        const k = distance > 0 ? Math.min(1, travel / distance) : 1
        bolt.position.lerpVectors(origin, target, k)
        if (k >= 1) {
          impacted = true
          // The impact re-uses the flash light rather than allocating another.
          light.position.copy(target).sub(group.position)
          light.intensity = 16
          boltMat.opacity = 0
        }
      } else if (impacted && light.intensity > 0) {
        light.intensity = Math.max(0, light.intensity - 60 * dt)
      }

      if (t >= lifetime) {
        dispose()
        return false
      }
      return true
    },
    dispose,
  }
}
