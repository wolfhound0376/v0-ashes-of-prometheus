// Blood on the floor, drawn.
//
// The marks themselves come from vtt_maps.meta.marks (see lib/blood-marks):
// the route lays them, Realtime carries them, and this file only paints. Each
// mark is one small plane on the floor with a splatter drawn into a canvas
// from the mark's own seed — so every board at the table draws the same
// stain in the same place, and a reload draws it again.
//
// Under everything that moves. Pinned just above the painted tile and below
// the spell decals (DECAL_Y = 0.025), the movement bands and the rings, so a
// pool never covers a thing the player needs to read; it only stains what
// they are standing on.
import * as THREE from "three"
import { normaliseMarks, placement, type BloodMark } from "@/lib/blood-marks"

const BLOOD_Y = 0.018

export interface BloodDecalHandle {
  /** Bring the floor in line with this list: new marks appear, gone marks go. */
  sync: (raw: unknown) => void
  dispose: () => void
}

/** A splatter, from a seed. 128px is plenty for something a third of a square wide. */
function splatTexture(seed: number): THREE.CanvasTexture {
  const S = 128
  const canvas = document.createElement("canvas")
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext("2d")!
  // A tiny LCG so the shape is a function of the seed and nothing else.
  let s = seed >>> 0 || 1
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
  ctx.clearRect(0, 0, S, S)
  // The body of the pool: a few overlapping blots around the centre, darkest
  // in the middle, thinning to the edge the way a pool dries.
  const blots = 5 + Math.floor(rnd() * 4)
  for (let i = 0; i < blots; i++) {
    const r = S * (0.16 + rnd() * 0.16)
    const cx = S / 2 + (rnd() - 0.5) * S * 0.28
    const cy = S / 2 + (rnd() - 0.5) * S * 0.28
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
    g.addColorStop(0, "rgba(84,8,10,0.92)")
    g.addColorStop(0.55, "rgba(96,12,14,0.78)")
    g.addColorStop(1, "rgba(70,6,8,0)")
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.ellipse(cx, cy, r * (0.8 + rnd() * 0.4), r * (0.8 + rnd() * 0.4), rnd() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  // Spatter: small drops flung outward, sparse.
  const drops = 6 + Math.floor(rnd() * 8)
  for (let i = 0; i < drops; i++) {
    const ang = rnd() * Math.PI * 2
    const dist = S * (0.22 + rnd() * 0.24)
    const r = 1.2 + rnd() * 3.2
    ctx.fillStyle = `rgba(80,8,10,${0.5 + rnd() * 0.4})`
    ctx.beginPath()
    ctx.arc(S / 2 + Math.cos(ang) * dist, S / 2 + Math.sin(ang) * dist, r, 0, Math.PI * 2)
    ctx.fill()
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.needsUpdate = true
  return tex
}

export function layBloodDecals(opts: {
  parent: THREE.Object3D
  cellToWorld: (x: number, y: number) => { x: number; z: number }
  /** Board units per grid square. The board's SQ. */
  squareSize?: number
}): BloodDecalHandle {
  const size = opts.squareSize ?? 1
  const group = new THREE.Group()
  group.position.y = BLOOD_Y
  opts.parent.add(group)
  const drawn = new Map<string, { mesh: THREE.Mesh; tex: THREE.Texture }>()
  const geo = new THREE.PlaneGeometry(1, 1)

  const draw = (m: BloodMark) => {
    const tex = splatTexture(m.seed)
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      // Multiply into the floor rather than sit on it: blood darkens stone,
      // it does not glow over it.
      blending: THREE.NormalBlending,
      toneMapped: false,
    })
    const mesh = new THREE.Mesh(geo, mat)
    const p = placement(m.seed)
    const w = opts.cellToWorld(m.x, m.y)
    mesh.rotation.x = -Math.PI / 2
    mesh.rotation.z = p.rot
    mesh.position.set(w.x + p.dx * size, 0, w.z + p.dz * size)
    mesh.scale.set(m.size * size * p.stretch, m.size * size / p.stretch, 1)
    // Above the floor (0), below the spell decals (2+), the bands and the rings.
    mesh.renderOrder = 1
    group.add(mesh)
    drawn.set(m.id, { mesh, tex })
  }

  const remove = (id: string) => {
    const d = drawn.get(id)
    if (!d) return
    group.remove(d.mesh)
    ;(d.mesh.material as THREE.Material).dispose()
    d.tex.dispose()
    drawn.delete(id)
  }

  return {
    sync(raw) {
      const marks = normaliseMarks(raw)
      const want = new Set(marks.map((m) => m.id))
      for (const id of Array.from(drawn.keys())) if (!want.has(id)) remove(id)
      for (const m of marks) if (!drawn.has(m.id)) draw(m)
    },
    dispose() {
      for (const id of Array.from(drawn.keys())) remove(id)
      opts.parent.remove(group)
      geo.dispose()
    },
  }
}
