import * as THREE from "three"
import { beforeAll, describe, expect, it } from "vitest"
import type { MapProp, PropPlacement } from "../map-props"
import { layMapProps } from "../../components/tactical/map-prop-decor"

// TextureLoader reaches for the network. Nothing here cares what the image is
// — only where the mesh ends up — so hand it a stub and keep the test offline.
beforeAll(() => {
  THREE.TextureLoader.prototype.load = function () {
    return new THREE.Texture()
  } as unknown as THREE.TextureLoader["load"]
})

const prop = (over: Partial<MapProp> & { slug: string }): MapProp => ({
  render_class: "billboard",
  footprint_w: 1,
  footprint_h: 1,
  biomes: ["cave"],
  blocks_movement: false,
  difficult_terrain: false,
  spawn_weight: 5,
  max_per_map: null,
  min_spacing: null,
  ...over,
})

const at = (slug: string, x: number, y: number, over: Partial<PropPlacement> = {}): PropPlacement => ({
  prop_slug: slug,
  grid_x: x,
  grid_y: y,
  rotation: 0,
  flip_x: false,
  placed_by: "random",
  seed: 1,
  ...over,
})

/** The board's own sqCentre, so the test measures what the board measures. */
const cellToWorld = (x: number, y: number) => ({ x: x + 0.5, z: y + 0.5 })

const mount = (classes?: Array<MapProp["render_class"]>) => {
  const parent = new THREE.Group()
  const handle = layMapProps({ parent, cellToWorld, squareSize: 1, classes })
  const group = () => parent.getObjectByName("map-props") as THREE.Group
  return { parent, handle, group }
}

describe("render classes", () => {
  it("lays a decal flat on the floor, just above the blood", () => {
    const { handle, group } = mount()
    handle.sync([at("blood", 2, 3)], [prop({ slug: "blood", render_class: "decal" })])
    const m = group().children[0] as THREE.Mesh
    expect(m.rotation.x).toBeCloseTo(-Math.PI / 2)
    // Above blood-decal's 0.018, below the spell decals at 0.025.
    expect(m.position.y).toBeGreaterThan(0.018)
    expect(m.position.y).toBeLessThan(0.025)
    expect(m.position.x).toBeCloseTo(2.5)
    expect(m.position.z).toBeCloseTo(3.5)
  })

  it("stands a billboard upright with its feet on the floor", () => {
    const { handle, group } = mount()
    handle.sync([at("stalagmite", 1, 1)], [prop({ slug: "stalagmite", render_class: "billboard" })])
    const m = group().children[0] as THREE.Mesh
    expect(m.rotation.x).toBe(0)
    // A 1x1 prop is one square tall, so its middle sits half a square up and
    // its bottom edge rests on y=0.
    expect(m.position.y).toBeCloseTo(0.5)
  })

  it("leaves overhead props undrawn by default — both cameras look down", () => {
    const { handle, group } = mount()
    handle.sync([at("stalactite", 0, 0)], [prop({ slug: "stalactite", render_class: "overhead" })])
    expect(group().children.length).toBe(0)
  })

  it("draws overhead when a caller opts in, for a camera that sits under it", () => {
    const { handle, group } = mount(["overhead"])
    handle.sync([at("stalactite", 0, 0)], [prop({ slug: "stalactite", render_class: "overhead" })])
    expect(group().children.length).toBe(1)
  })

  it("only draws the classes it was asked for", () => {
    const { handle, group } = mount(["decal"])
    handle.sync(
      [at("blood", 0, 0), at("stalagmite", 1, 0)],
      [prop({ slug: "blood", render_class: "decal" }), prop({ slug: "stalagmite" })],
    )
    expect(group().children.length).toBe(1)
    expect((group().children[0] as THREE.Mesh).userData.propSlug).toBe("blood")
  })
})

describe("footprints", () => {
  it("centres a 2x2 billboard over its whole footprint, not over its anchor", () => {
    const { handle, group } = mount()
    handle.sync([at("shack", 4, 6)], [prop({ slug: "shack", footprint_w: 2, footprint_h: 2 })])
    const m = group().children[0] as THREE.Mesh
    // Anchor square centre is (4.5, 6.5); a 2x2 sits half a square further on.
    expect(m.position.x).toBeCloseTo(5)
    expect(m.position.z).toBeCloseTo(7)
    // Square canvas: two squares wide means two squares tall.
    expect(m.position.y).toBeCloseTo(1)
  })

  it("stretches a decal across a non-square footprint", () => {
    const { handle, group } = mount()
    handle.sync([at("bridge", 0, 0)], [prop({ slug: "bridge", render_class: "decal", footprint_w: 2, footprint_h: 4 })])
    const m = group().children[0] as THREE.Mesh
    const geo = m.geometry as THREE.PlaneGeometry
    expect(geo.parameters.width).toBe(2)
    expect(geo.parameters.height).toBe(4)
    expect(m.position.x).toBeCloseTo(1)
    expect(m.position.z).toBeCloseTo(2)
  })
})

describe("sync", () => {
  const catalog = [prop({ slug: "a" }), prop({ slug: "b", render_class: "decal" })]

  it("adds what is new and removes what is gone", () => {
    const { handle, group } = mount()
    handle.sync([at("a", 0, 0), at("b", 1, 1)], catalog)
    expect(group().children.length).toBe(2)
    handle.sync([at("a", 0, 0)], catalog)
    expect(group().children.length).toBe(1)
    handle.sync([], catalog)
    expect(group().children.length).toBe(0)
  })

  it("leaves a prop that has not moved alone", () => {
    const { handle, group } = mount()
    handle.sync([at("a", 0, 0)], catalog)
    const first = group().children[0]
    handle.sync([at("a", 0, 0), at("b", 2, 2)], catalog)
    expect(group().children).toContain(first)
  })

  it("skips a placement whose slug is not in the catalog rather than guessing", () => {
    const { handle, group } = mount()
    handle.sync([at("ghost", 0, 0), at("a", 1, 1)], catalog)
    expect(group().children.length).toBe(1)
    expect((group().children[0] as THREE.Mesh).userData.propSlug).toBe("a")
  })

  it("is idempotent", () => {
    const { handle, group } = mount()
    const rows = [at("a", 0, 0), at("b", 1, 1)]
    handle.sync(rows, catalog)
    handle.sync(rows, catalog)
    handle.sync(rows, catalog)
    expect(group().children.length).toBe(2)
  })

  it("mirrors a flipped prop", () => {
    const { handle, group } = mount()
    handle.sync([at("a", 0, 0, { flip_x: true })], catalog)
    expect((group().children[0] as THREE.Mesh).scale.x).toBe(-1)
  })

  it("turns a decal by its stored rotation", () => {
    const { handle, group } = mount()
    handle.sync([at("b", 0, 0, { rotation: 90 })], catalog)
    expect((group().children[0] as THREE.Mesh).rotation.z).toBeCloseTo(Math.PI / 2)
  })
})

describe("update", () => {
  it("yaws standing props toward the camera and never tips them", () => {
    const { handle, group } = mount()
    handle.sync([at("a", 3, 3)], [prop({ slug: "a" })])
    const m = group().children[0] as THREE.Mesh
    const cam = new THREE.PerspectiveCamera()

    cam.position.set(0, 10, 10)
    handle.update(cam)
    const first = m.rotation.y
    expect(m.rotation.x).toBe(0)
    expect(m.rotation.z).toBe(0)

    // A quarter-turn of the camera turns the prop with it.
    cam.position.set(10, 10, 0)
    handle.update(cam)
    expect(m.rotation.y).not.toBeCloseTo(first)
    expect(m.rotation.x).toBe(0)
  })

  it("leaves decals flat when the camera moves", () => {
    const { handle, group } = mount()
    handle.sync([at("b", 0, 0)], [prop({ slug: "b", render_class: "decal" })])
    const m = group().children[0] as THREE.Mesh
    const cam = new THREE.PerspectiveCamera()
    cam.position.set(9, 9, 9)
    handle.update(cam)
    expect(m.rotation.x).toBeCloseTo(-Math.PI / 2)
    expect(m.rotation.y).toBe(0)
  })

  it("does not throw with nothing placed", () => {
    const { handle } = mount()
    expect(() => handle.update(new THREE.PerspectiveCamera())).not.toThrow()
  })
})

describe("dispose", () => {
  it("takes the group off the board and drops the meshes", () => {
    const { parent, handle, group } = mount()
    handle.sync([at("a", 0, 0), at("b", 1, 1)], [prop({ slug: "a" }), prop({ slug: "b", render_class: "decal" })])
    const g = group()
    handle.dispose()
    expect(parent.children).not.toContain(g)
    expect(g.children.length).toBe(0)
  })

  it("ignores a sync after dispose", () => {
    const { parent, handle } = mount()
    handle.dispose()
    handle.sync([at("a", 0, 0)], [prop({ slug: "a" })])
    expect(parent.getObjectByName("map-props")).toBeUndefined()
  })
})

describe("texture reuse", () => {
  it("pulls one image for a slug however many times it is placed", () => {
    let loads = 0
    THREE.TextureLoader.prototype.load = function () {
      loads++
      return new THREE.Texture()
    } as unknown as THREE.TextureLoader["load"]
    const { handle } = mount()
    handle.sync(
      [at("a", 0, 0), at("a", 1, 0), at("a", 2, 0), at("a", 3, 0)],
      [prop({ slug: "a" })],
    )
    expect(loads).toBe(1)
  })
})
