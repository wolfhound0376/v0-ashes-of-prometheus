// Scenery on the board, drawn.
//
// Which prop stands on which square is decided in lib/map-props (seeded, and
// careful never to wall off a room). This file only paints what it is handed,
// the way blood-decal.ts only paints the marks the route laid.
//
// THREE RENDER CLASSES, and getting them wrong is the prop equivalent of
// putting V5 square art on hexes:
//
//   decal      drawn top-down, lies flat on the floor. Blood, webs, rubble,
//              ore veins, corpses, traps, the bridges. Never occludes a body.
//   billboard  drawn side-on, stands upright and yaws to face the camera.
//              Mushrooms, stalagmites, chests, altars, cages, buildings.
//   overhead   drawn top-down, belongs on the ceiling. Stalactites, roosting
//              bats, hanging chains.
//
// OVERHEAD IS NOT DRAWN HERE, and that is deliberate rather than unfinished.
// This board has two cameras and both of them look down at the floor: the
// classic orthographic at the 2:1 dimetric elevation, and the perspective one
// at 45 degrees with four quarter-turns. Neither is a first-person view, so a
// stalactite hung at ceiling height would sit between the camera and the
// squares the players need to read. The ceiling rule in the map-pipeline skill
// ("visible in first person, hidden in tactical") describes the LOCAL viewer's
// buildSquare(), not this component. The 15 overhead props stay in the catalog
// and stay unrendered until there is a camera underneath them; `classes` below
// is the one switch that turns them on.
//
// A pixel prop is drawn like a pixel figure: nearest-neighbour both ways, so a
// 64px mushroom keeps its pixels instead of dissolving into a smear.
import * as THREE from "three"
import type { MapProp, PropPlacement, RenderClass } from "@/lib/map-props"

/** Public art for the 191 props: vtt-assets/props/<slug>.png. */
export const PROP_BASE =
  "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/props"

/**
 * Prop decals ride just above the blood (0.018) and just below the spell
 * decals (0.025): a pool of blood stains the stone a prop sits on, and a
 * Grease or a Web laid by a caster covers the scenery rather than sliding
 * under it.
 */
const DECAL_Y = 0.02

/** A prop's own art is 64px per 5-ft square, whatever its canvas. */
const PX_PER_SQUARE = 64

export interface PropDecorHandle {
  /** Bring the board in line with this list: new props appear, gone props go. */
  sync: (placements: PropPlacement[], catalog: MapProp[]) => void
  /** Turn the standing props to face the camera. Call from the animation loop. */
  update: (camera: THREE.Camera) => void
  dispose: () => void
}

/** Stable key for one placement, so a re-sync moves nothing that has not moved. */
const keyOf = (p: PropPlacement) => `${p.prop_slug}@${p.grid_x},${p.grid_y}`

export function layMapProps(opts: {
  parent: THREE.Object3D
  /** Grid square to board coordinates. The board's own sqCentre. */
  cellToWorld: (x: number, y: number) => { x: number; z: number }
  /** Board units per grid square. The board's SQ. */
  squareSize?: number
  /** Which classes to draw. Overhead is off until a camera exists under it. */
  classes?: RenderClass[]
  /** Where the art lives; overridable for tests. */
  base?: string
}): PropDecorHandle {
  const size = opts.squareSize ?? 1
  const base = (opts.base ?? PROP_BASE).replace(/\/$/, "")
  const draw = new Set<RenderClass>(opts.classes ?? ["decal", "billboard"])

  const group = new THREE.Group()
  group.name = "map-props"
  opts.parent.add(group)

  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin("anonymous")
  // One texture per slug, however many times the slug is placed: a floor with
  // twelve bluecaps pulls one PNG, not twelve.
  const textures = new Map<string, THREE.Texture>()
  const planes = new Map<string, THREE.PlaneGeometry>()
  const drawn = new Map<string, { mesh: THREE.Mesh; billboard: boolean }>()
  const standing: THREE.Mesh[] = []
  let disposed = false

  const textureFor = (slug: string) => {
    const had = textures.get(slug)
    if (had) return had
    const tex = loader.load(`${base}/${slug}.png`)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    textures.set(slug, tex)
    return tex
  }

  const planeFor = (w: number, h: number) => {
    const key = `${w}x${h}`
    const had = planes.get(key)
    if (had) return had
    const geo = new THREE.PlaneGeometry(w, h)
    planes.set(key, geo)
    return geo
  }

  const add = (pl: PropPlacement, prop: MapProp) => {
    const fw = Math.max(1, prop.footprint_w)
    const fh = Math.max(1, prop.footprint_h)
    const tex = textureFor(prop.slug)

    // The anchor is the top-left square of the footprint, so the centre of a
    // 2x2 prop is half a square further along each axis than its anchor.
    const a = opts.cellToWorld(pl.grid_x, pl.grid_y)
    const cx = a.x + ((fw - 1) * size) / 2
    const cz = a.z + ((fh - 1) * size) / 2

    const billboard = prop.render_class === "billboard"
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      // Pixel art has hard edges and no semi-transparent fringe worth keeping.
      // alphaTest lets a standing prop write depth, which is what makes a body
      // walk correctly BEHIND a stalagmite instead of through it.
      alphaTest: 0.35,
      depthWrite: billboard,
      side: THREE.DoubleSide,
      toneMapped: false,
    })

    let mesh: THREE.Mesh
    if (billboard) {
      // The canvas is square, so a prop that is `fw` squares wide stands `fw`
      // squares tall. Bottom edge on the floor: the geometry is offset up by
      // half its height rather than the mesh being moved, so the yaw below
      // spins it about its feet and not about its middle.
      const side = fw * size
      const geo = planeFor(side, side)
      mesh = new THREE.Mesh(geo, mat)
      mesh.position.set(cx, side / 2, cz)
      if (pl.flip_x) mesh.scale.x = -1
      standing.push(mesh)
    } else {
      // Flat on the floor, stretched across the whole footprint.
      const geo = planeFor(fw * size, fh * size)
      mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.rotation.z = (pl.rotation * Math.PI) / 180
      mesh.position.set(cx, DECAL_Y, cz)
      if (pl.flip_x) mesh.scale.x = -1
      // Above the blood (1), below the spell decals and the movement bands.
      mesh.renderOrder = 2
    }

    mesh.name = `prop:${prop.slug}`
    mesh.userData.propSlug = prop.slug
    mesh.userData.square = [pl.grid_x, pl.grid_y]
    group.add(mesh)
    drawn.set(keyOf(pl), { mesh, billboard })
  }

  const remove = (key: string) => {
    const d = drawn.get(key)
    if (!d) return
    group.remove(d.mesh)
    ;(d.mesh.material as THREE.Material).dispose()
    const i = standing.indexOf(d.mesh)
    if (i >= 0) standing.splice(i, 1)
    drawn.delete(key)
  }

  return {
    sync(placements, catalog) {
      if (disposed) return
      const bySlug = new Map(catalog.map((p) => [p.slug, p]))
      const want = new Map<string, { pl: PropPlacement; prop: MapProp }>()
      for (const pl of placements) {
        const prop = bySlug.get(pl.prop_slug)
        // A placement whose prop is not in the catalog is skipped rather than
        // guessed at: an unknown slug means the row and the art disagree, and
        // an invented square is worse than a missing mushroom.
        if (!prop || !draw.has(prop.render_class)) continue
        want.set(keyOf(pl), { pl, prop })
      }
      for (const key of Array.from(drawn.keys())) if (!want.has(key)) remove(key)
      for (const [key, { pl, prop }] of want) if (!drawn.has(key)) add(pl, prop)
    },

    update(camera) {
      if (disposed || standing.length === 0) return
      // Yaw only. A standing prop turns to face the camera about its feet and
      // never tips: a mushroom leaning back at the camera's pitch reads as a
      // sticker, which is exactly the "still looks 3D" failure the HD-2D pivot
      // was about. Pitch stays 0, as it does for the pixel figures.
      const yaw = Math.atan2(
        camera.position.x - group.position.x,
        camera.position.z - group.position.z,
      )
      for (const m of standing) m.rotation.y = yaw
    },

    dispose() {
      disposed = true
      for (const key of Array.from(drawn.keys())) remove(key)
      opts.parent.remove(group)
      for (const t of textures.values()) t.dispose()
      for (const g of planes.values()) g.dispose()
      textures.clear()
      planes.clear()
      standing.length = 0
    },
  }
}
