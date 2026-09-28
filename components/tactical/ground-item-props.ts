// Items on the floor, drawn.
//
// The rows come from vtt_ground_items (see lib/ground-items): the route puts
// them down and picks them up, Realtime carries the change, and this file
// only paints. Each pile is the same proxy geometry a character would hold
// (lib/equipment), laid on its side on the square, over a faint gold ring so
// a small dark object on a dark floor can still be found by eye.
//
// An item with pixel art (items.pixel_icon_url) lies there as that picture
// instead: flat on the square, nearest-filtered so it stays crisp beside the
// sprite miniatures. The proxy is the fallback for everything not yet drawn.
//
// THE RING IS THE RARITY and the taking is a small ceremony — a legendary
// glows amber from across the board and lifts away when claimed, a ration
// keeps the old gold and goes quietly. Both come from RARITY_TINT, the same
// table the paper doll and the held-weapon glow read, so there is one answer
// to "what colour is rare" in this codebase rather than three.
//
// Everything here carries userData.groundItemId, so the board's click
// raycast can ask "was that a thing on the floor?" the way it asks "was that
// a door?".
import * as THREE from "three"
import { archetypeFor, proxyGeometry, applyRarity, RARITY_TINT } from "@/lib/equipment"
import { normaliseGroundItems, type GroundItemRow } from "@/lib/ground-items"

/** Just above the blood (0.018) and the spell decals (0.025); under the miniatures. */
const PROP_Y = 0.03

/**
 * The ring a common thing gets. RARITY_TINT deliberately maps `common` to
 * null — a common item keeps its own metal rather than being tinted — so the
 * ring falls back to this gold, which is what every pile used to be.
 */
const COMMON_RING = 0xe0b45a

/**
 * How long a taken pile spends leaving. Short enough that a rogue clearing a
 * room never waits on it, long enough to read as "that went somewhere" rather
 * than as a dropped frame.
 */
const TAKE_SECONDS = 0.45

/** Rarer things shout louder. Multiplies the ring's breathing opacity. */
function ringGain(rarity: string | null | undefined): number {
  switch ((rarity ?? "common").toLowerCase()) {
    case "uncommon": return 1.25
    case "rare": return 1.5
    case "very_rare":
    case "very rare": return 1.75
    case "legendary":
    case "artifact": return 2.1
    default: return 1
  }
}

export interface GroundItemHandle {
  /** Bring the floor in line with this list: new piles appear, taken ones go. */
  sync: (raw: unknown) => void
  /** Everything clickable, for the raycaster. */
  objects: () => THREE.Object3D[]
  /** Every pile currently drawn. The board asks so TAKE knows what is in reach. */
  rows: () => GroundItemRow[]
  /** The row behind a hit object, or null. */
  rowFor: (hit: THREE.Object3D | null | undefined) => GroundItemRow | null
  /** Draw every pile again, e.g. once the pixel icons have arrived. */
  redraw: () => void
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
  /** The item's pixel icon, when it has one; the proxy is drawn otherwise. */
  iconFor?: (row: GroundItemRow) => string | null | undefined
}): GroundItemHandle {
  const size = opts.squareSize ?? 1
  const group = new THREE.Group()
  group.position.y = PROP_Y
  opts.parent.add(group)

  const drawn = new Map<string, { root: THREE.Group; ring: THREE.Mesh; row: GroundItemRow; gain: number }>()
  /**
   * Piles on their way out.
   *
   * A taken thing used to vanish between two frames, which read as a glitch
   * rather than as a reward — the one moment the floor pays off was the one
   * moment with no feedback at all. These lift and fade instead, and only
   * then get disposed. `startedAt` is filled on the first tick that sees the
   * entry, because tick's clock is the only one this module is given.
   */
  const fading = new Map<
    string,
    { root: THREE.Group; startedAt: number | null; baseY: number }
  >()
  const ringGeo = new THREE.RingGeometry(0.16 * size, 0.24 * size, 32)
  const iconGeo = new THREE.PlaneGeometry(0.46 * size, 0.46 * size)
  // One texture per picture, shared by every pile of that item.
  const textures = new Map<string, THREE.Texture>()
  const loader = new THREE.TextureLoader()
  const textureFor = (url: string) => {
    let tex = textures.get(url)
    if (!tex) {
      tex = loader.load(url)
      tex.magFilter = THREE.NearestFilter
      tex.minFilter = THREE.NearestFilter
      tex.generateMipmaps = false
      tex.colorSpace = THREE.SRGBColorSpace
      textures.set(url, tex)
    }
    return tex
  }

  const draw = (row: GroundItemRow) => {
    const rnd = seeded(row.id)
    const root = new THREE.Group()
    const w = opts.cellToWorld(row.grid_x, row.grid_y)
    // Off-centre by up to a fifth of a square, so a pile does not sit
    // exactly under a miniature's feet, and turned some way or another.
    root.position.set(w.x + (rnd() - 0.5) * 0.4 * size, 0, w.z + (rnd() - 0.5) * 0.4 * size)
    root.rotation.y = rnd() * Math.PI * 2

    // The ring: additive, faint, breathing in tick().
    //
    // ITS COLOUR IS THE RARITY, Diablo's convention and the same RARITY_TINT
    // the paper doll and the held-weapon glow already use — so a legendary on
    // the floor reads as a legendary from across the board, before anyone has
    // walked over to hover it. Commons keep the old gold: RARITY_TINT maps
    // them to null on purpose, and a tinted common would make every stick and
    // ration look like treasure, which is the thing this is trying to stop.
    const rarity = opts.rarityOf?.(row)
    const gain = ringGain(rarity)
    const ring = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: RARITY_TINT[String(rarity ?? "common").toLowerCase()] ?? COMMON_RING,
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

    const icon = opts.iconFor?.(row)
    if (icon) {
      // The pixel icon, lying flat inside the ring.
      const pic = new THREE.Mesh(
        iconGeo,
        new THREE.MeshBasicMaterial({ map: textureFor(icon), transparent: true, alphaTest: 0.5, depthWrite: false, toneMapped: false }),
      )
      pic.rotation.x = -Math.PI / 2
      pic.position.y = 0.004 * size
      pic.renderOrder = 4
      root.add(pic)
    } else {
      // The object itself: the archetype proxy, on its side. Proxies are built
      // along +Y from the grip, so lying down is a quarter turn about X; a
      // little lift keeps the thickest part out of the floor.
      const archetype = archetypeFor(row.name)
      const obj = proxyGeometry(archetype === "empty" ? "dagger" : archetype)
      obj.rotation.x = Math.PI / 2
      obj.rotation.z = (rnd() - 0.5) * 0.6
      obj.position.y = 0.025 * size
      obj.scale.setScalar(0.42 * size)
      applyRarity(obj, rarity ?? "common")
      root.add(obj)
    }

    root.traverse((o) => { o.userData.groundItemId = row.id })
    group.add(root)
    drawn.set(row.id, { root, ring, row, gain })
  }

  /** Stop drawing it, and let it go. Immediate: nothing animates here. */
  const remove = (id: string) => {
    const d = drawn.get(id)
    if (!d) return
    group.remove(d.root)
    disposeRoot(d.root)
    drawn.delete(id)
  }

  /**
   * Take it off the floor with a flourish: up, and out.
   *
   * The row is dropped from `drawn` at once so TAKE and the raycast stop
   * offering a pile that is already in someone's pack; only the drawing
   * lingers.
   */
  const lift = (id: string) => {
    const d = drawn.get(id)
    if (!d) return
    drawn.delete(id)
    // alphaTest clips rather than blends, so a fading icon would hold full
    // opacity and then pop. Drop it, and let every material blend instead.
    d.root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[]) {
        mat.transparent = true
        ;(mat as THREE.MeshBasicMaterial).alphaTest = 0
        mat.depthWrite = false
      }
    })
    fading.set(id, { root: d.root, startedAt: null, baseY: d.root.position.y })
  }

  function disposeRoot(root: THREE.Group) {
    root.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      // The ring and icon geometry are shared; everything else is the proxy's own.
      if (m.geometry !== ringGeo && m.geometry !== iconGeo) m.geometry.dispose()
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) mat.dispose()
    })
  }

  return {
    sync(raw) {
      const rows = normaliseGroundItems(raw)
      const want = new Set(rows.map((r) => r.id))
      // GONE FROM THE LIST MEANS SOMEONE TOOK IT, so it leaves with the
      // flourish rather than blinking out. A pile that merely moved square is
      // handled below and is not a pickup.
      for (const id of Array.from(drawn.keys())) if (!want.has(id)) lift(id)
      for (const r of rows) {
        const have = drawn.get(r.id)
        // A pile that moved square (a DM nudge) is redrawn; the rest stay put.
        if (have && (have.row.grid_x !== r.grid_x || have.row.grid_y !== r.grid_y)) remove(r.id)
        if (!drawn.has(r.id)) draw(r)
      }
    },
    redraw() {
      for (const d of Array.from(drawn.values())) {
        remove(d.row.id)
        draw(d.row)
      }
    },
    objects() {
      return Array.from(drawn.values(), (d) => d.root)
    },
    rows() {
      return Array.from(drawn.values(), (d) => d.row)
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
        // Capped: additive blending past 1 blows out to white and loses the
        // rarity colour, which is the whole point of the ring.
        ;(d.ring.material as THREE.MeshBasicMaterial).opacity = Math.min(0.95, pulse * d.gain)
      }
      // The taken ones, on their way up and out.
      for (const [id, f] of Array.from(fading.entries())) {
        if (f.startedAt === null) f.startedAt = t
        const k = (t - f.startedAt) / TAKE_SECONDS
        if (k >= 1) {
          group.remove(f.root)
          disposeRoot(f.root)
          fading.delete(id)
          continue
        }
        // Ease out, so it leaves quickly and settles rather than sliding.
        const e = 1 - (1 - k) * (1 - k)
        f.root.position.y = f.baseY + e * 0.55 * size
        f.root.scale.setScalar(1 + e * 0.35)
        f.root.traverse((o) => {
          const m = o as THREE.Mesh
          if (!m.isMesh) return
          for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.Material[]) {
            mat.opacity = 1 - e
          }
        })
      }
    },
    dispose() {
      for (const id of Array.from(drawn.keys())) remove(id)
      for (const [id, f] of Array.from(fading.entries())) {
        group.remove(f.root)
        disposeRoot(f.root)
        fading.delete(id)
      }
      opts.parent.remove(group)
      ringGeo.dispose()
      iconGeo.dispose()
      for (const tex of textures.values()) tex.dispose()
      textures.clear()
    },
  }
}
