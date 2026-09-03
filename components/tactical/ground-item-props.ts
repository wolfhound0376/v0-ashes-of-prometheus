// Items on the floor, drawn.
//
// The rows come from vtt_ground_items (see lib/ground-items): the route puts
// them down and picks them up, Realtime carries the change, and this file
// only paints. Each pile is the same proxy geometry a character would hold
// (lib/equipment), laid on its side on the square, over a faint gold ring so
// a small dark object on a dark floor can still be found by eye.
//
// Everything here carries userData.groundItemId, so the board's click
// raycast can ask "was that a thing on the floor?" the way it asks "was that
// a door?".
import * as THREE from "three"
import { archetypeFor, proxyGeometry, applyRarity } from "@/lib/equipment"
import { normaliseGroundItems, type GroundItemRow } from "@/lib/ground-items"

/** Just above the blood (0.018) and the spell decals (0.025); under the miniatures. */
const PROP_Y = 0.03

export interface GroundItemHandle {
  /** Bring the floor in line with this list: new piles appear, taken ones go. */
  sync: (raw: unknown) => void
  /** Everything clickable, for the raycaster. */
  objects: () => THREE.Object3D[]
  /** The row behind a hit object, or null. */
  rowFor: (hit: THREE.Object3D | null | undefined) => GroundItemRow | null
  /** Called from the render loop so the ring can breathe. */
  tick: (t: number) => void
  dispose: () => void
}

/** A tiny LCG so a pile always lands in the same spot on its square. */
function seeded(id: string): () => number {
  let s = 2166136261
  for (let i = 0; i < id.length; i++) s = Math.imul(s ^ id.charCodeAt(i), 16777619) >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

export function layGroundItems(opts: {
  parent: THREE.Object3D
  cellToWorld: (x: number, y: number) => { x: number; z: number }
  /** Board units per grid square. The board's SQ. */
  squareSize?: number
  /** Rarity per item id, when the board knows it; commons keep their metal. */
  rarityOf?: (row: GroundItemRow) => string | null | undefined
}): GroundItemHandle {
  const size = opts.squareSize ?? 1
  const group = new THREE.Group()
  group.position.y = PROP_Y
  opts.parent.add(group)

  const drawn = new Map<string, { root: THREE.Group; ring: THREE.Mesh; row: GroundItemRow }>()
  const ringGeo = new THREE.RingGeometry(0.16 * size, 0.24 * size, 32)

  const draw = (row: GroundItemRow) => {
    const rnd = seeded(row.id)
    const root = new THREE.Group()
    const w = opts.cellToWorld(row.grid_x, row.grid_y)
    // Off-centre by up to a fifth of a square, so a pile does not sit
    // exactly under a miniature's feet, and turned some way or another.
    root.position.set(w.x + (rnd() - 0.5) * 0.4 * size, 0, w.z + (rnd() - 0.5) * 0.4 * size)
    root.rotation.y = rnd() * Math.PI * 2

    // The ring: additive, faint, breathing in tick().
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe0b45a,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.renderOrder = 3
    root.add(ring)

    // The object itself: the archetype proxy, on its side. Proxies are built
    // along +Y from the grip, so lying down is a quarter turn about X; a
    // little lift keeps the thickest part out of the floor.
    const archetype = archetypeFor(row.name)
    const obj = proxyGeometry(archetype === "empty" ? "dagger" : archetype)
    obj.rotation.x = Math.PI / 2
    obj.rotation.z = (rnd() - 0.5) * 0.6
    obj.position.y = 0.025 * size
    obj.scale.setScalar(0.42 * size)
    applyRarity(obj, opts.rarityOf?.(row) ?? "common")
    root.add(obj)

    root.traverse((o) => { o.userData.groundItemId = row.id })
    group.add(root)
    drawn.set(row.id, { root, ring, row })
  }

  const remove = (id: string) => {
    const d = drawn.get(id)
    if (!d) return
    group.remove(d.root)
    d.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      // The ring geometry is shared; everything else is the proxy's own.
      if (m.geometry !== ringGeo) m.geometry.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) mat.dispose()
    })
    drawn.delete(id)
  }

  return {
    sync(raw) {
      const rows = normaliseGroundItems(raw)
      const want = new Set(rows.map((r) => r.id))
      for (const id of Array.from(drawn.keys())) if (!want.has(id)) remove(id)
      for (const r of rows) {
        const have = drawn.get(r.id)
        // A pile that moved square (a DM nudge) is redrawn; the rest stay put.
        if (have && (have.row.grid_x !== r.grid_x || have.row.grid_y !== r.grid_y)) remove(r.id)
        if (!drawn.has(r.id)) draw(r)
      }
    },
    objects() {
      return Array.from(drawn.values(), (d) => d.root)
    },
    rowFor(hit) {
      let o: THREE.Object3D | null | undefined = hit
      while (o && !o.userData.groundItemId) o = o.parent
      const id = o?.userData.groundItemId as string | undefined
      return id ? drawn.get(id)?.row ?? null : null
    },
    tick(t) {
      const pulse = 0.28 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2.2))
      for (const d of drawn.values()) {
        ;(d.ring.material as THREE.MeshBasicMaterial).opacity = pulse
      }
    },
    dispose() {
      for (const id of Array.from(drawn.keys())) remove(id)
      opts.parent.remove(group)
      ringGeo.dispose()
    },
  }
}
