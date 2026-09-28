import { describe, expect, it } from "vitest"
import {
  blockedBy,
  difficultBy,
  eligible,
  footprint,
  propArtUrl,
  protectedSquares,
  rngFrom,
  scatter,
  seedFrom,
  type MapProp,
  type ScatterMap,
} from "./map-props"

/** A prop, with the boring fields filled in. */
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

/** An open w x h room, every square walkable. */
const room = (w: number, h: number): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) out.push([x, y])
  return out
}

describe("rngFrom / seedFrom", () => {
  it("is deterministic for a seed", () => {
    const a = rngFrom(1234)
    const b = rngFrom(1234)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it("gives different streams for different seeds", () => {
    expect(rngFrom(1)()).not.toEqual(rngFrom(2)())
  })

  it("stays in [0,1)", () => {
    const r = rngFrom(99)
    for (let i = 0; i < 500; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it("seeds a node slug to a stable number", () => {
    expect(seedFrom("node-08")).toEqual(seedFrom("node-08"))
    expect(seedFrom("node-08")).not.toEqual(seedFrom("node-09"))
  })
})

describe("eligible", () => {
  const props = [
    prop({ slug: "fungi-ormu", biomes: ["cave", "velkynvelve"] }),
    prop({ slug: "trap-net", biomes: ["dungeon"], spawn_weight: 0 }),
    prop({ slug: "temple-of-lolth", biomes: ["drow_outpost"], spawn_weight: 0 }),
    prop({ slug: "kelp-frond", biomes: ["water"] }),
  ]

  it("keeps props of the biome", () => {
    expect(eligible(props, "cave").map((p) => p.slug)).toEqual(["fungi-ormu"])
  })

  it("never returns a weight-0 prop, biome or not", () => {
    expect(eligible(props, "dungeon")).toEqual([])
    expect(eligible(props, "drow_outpost")).toEqual([])
  })
})

describe("scatter determinism", () => {
  const props = [prop({ slug: "a" }), prop({ slug: "b" }), prop({ slug: "c" })]
  const map: ScatterMap = { floor: room(10, 10) }

  it("gives the same floor for the same seed", () => {
    expect(scatter(props, map, "cave", 42)).toEqual(scatter(props, map, "cave", 42))
  })

  it("gives a different floor for a different seed", () => {
    expect(scatter(props, map, "cave", 42)).not.toEqual(scatter(props, map, "cave", 43))
  })

  it("records the seed on every placement, so a re-roll is deliberate", () => {
    for (const pl of scatter(props, map, "cave", 7)) {
      expect(pl.seed).toBe(7)
      expect(pl.placed_by).toBe("random")
    }
  })
})

describe("scatter respects the catalog", () => {
  it("places nothing when no prop suits the biome", () => {
    expect(scatter([prop({ slug: "a", biomes: ["water"] })], { floor: room(8, 8) }, "cave", 1)).toEqual([])
  })

  it("places nothing on a map with no floor", () => {
    expect(scatter([prop({ slug: "a" })], { floor: [] }, "cave", 1)).toEqual([])
  })

  it("never places a weight-0 prop — this is what keeps traps out of the scatter", () => {
    const props = [prop({ slug: "rubble" }), prop({ slug: "trap-bear", spawn_weight: 0 })]
    const placed = scatter(props, { floor: room(14, 14) }, "cave", 5)
    expect(placed.length).toBeGreaterThan(0)
    expect(placed.some((p) => p.prop_slug === "trap-bear")).toBe(false)
  })

  it("honours max_per_map", () => {
    const props = [prop({ slug: "well", max_per_map: 2 }), prop({ slug: "rubble" })]
    const placed = scatter(props, { floor: room(16, 16) }, "cave", 3)
    expect(placed.filter((p) => p.prop_slug === "well").length).toBeLessThanOrEqual(2)
  })

  it("honours min_spacing between two of the same prop", () => {
    const props = [prop({ slug: "campfire", min_spacing: 4 })]
    const placed = scatter(props, { floor: room(20, 20) }, "cave", 11, { density: 0.5 })
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const d = Math.max(
          Math.abs(placed[i].grid_x - placed[j].grid_x),
          Math.abs(placed[i].grid_y - placed[j].grid_y),
        )
        expect(d).toBeGreaterThanOrEqual(4)
      }
    }
  })

  it("never puts two props on one square", () => {
    const placed = scatter([prop({ slug: "a" }), prop({ slug: "b" })], { floor: room(12, 12) }, "cave", 8, { density: 0.9 })
    const seen = new Set(placed.map((p) => `${p.grid_x},${p.grid_y}`))
    expect(seen.size).toBe(placed.length)
  })

  it("never places on an occupied square", () => {
    const occupied: Array<[number, number]> = [[0, 0], [1, 1], [2, 2]]
    const placed = scatter([prop({ slug: "a" })], { floor: room(6, 6), occupied }, "cave", 4, { density: 1 })
    for (const [x, y] of occupied) {
      expect(placed.some((p) => p.grid_x === x && p.grid_y === y)).toBe(false)
    }
  })

  it("respects the limit", () => {
    const placed = scatter([prop({ slug: "a" })], { floor: room(20, 20) }, "cave", 2, { density: 1, limit: 7 })
    expect(placed.length).toBeLessThanOrEqual(7)
  })

  it("only ever mirrors a standing prop, never lays it on its side", () => {
    const props = [prop({ slug: "stalagmite", render_class: "billboard" }), prop({ slug: "blood", render_class: "decal" })]
    const placed = scatter(props, { floor: room(14, 14) }, "cave", 6, { density: 0.6 })
    for (const p of placed) {
      if (p.prop_slug === "stalagmite") expect(p.rotation).toBe(0)
    }
    expect(placed.some((p) => p.prop_slug === "blood")).toBe(true)
  })
})

describe("protectedSquares", () => {
  it("is just the exit mouths when there is one exit", () => {
    const map: ScatterMap = { floor: room(5, 5), exits: [[[0, 0], [0, 1]]] }
    expect(protectedSquares(map)).toEqual(new Set(["0,0", "0,1"]))
  })

  it("holds a connecting path between two exits", () => {
    const map: ScatterMap = { floor: room(5, 5), exits: [[[0, 0]], [[4, 4]]] }
    const keep = protectedSquares(map)
    expect(keep.has("0,0")).toBe(true)
    expect(keep.has("4,4")).toBe(true)
    // A shortest 4-connected path across a 5x5 room is 9 squares.
    expect(keep.size).toBe(9)
  })

  it("returns only the mouths when the two exits cannot reach each other", () => {
    // Two one-square rooms with no floor between them.
    const map: ScatterMap = { floor: [[0, 0], [9, 9]], exits: [[[0, 0]], [[9, 9]]] }
    expect(protectedSquares(map)).toEqual(new Set(["0,0", "9,9"]))
  })
})

describe("a blocker can never sever the room", () => {
  /** Walk from any exit cell to every other exit, 4-connected, avoiding blocked squares. */
  const connected = (floor: Array<[number, number]>, blocked: Set<string>, exits: Array<Array<[number, number]>>) => {
    const walk = new Set(floor.map(([x, y]) => `${x},${y}`))
    const start = exits[0][0]
    const seen = new Set<string>([`${start[0]},${start[1]}`])
    const q: Array<[number, number]> = [start]
    let head = 0
    while (head < q.length) {
      const [x, y] = q[head++]
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as Array<[number, number]>) {
        const key = `${nx},${ny}`
        if (!walk.has(key) || seen.has(key) || blocked.has(key)) continue
        seen.add(key)
        q.push([nx, ny])
      }
    }
    return exits.every((cells) => cells.some(([x, y]) => seen.has(`${x},${y}`)))
  }

  it("keeps a one-square corridor open at any density", () => {
    // Two 3x3 chambers joined by a single-square corridor. The corridor is the
    // only route, so any blocker landing on it severs the map.
    const floor: Array<[number, number]> = []
    for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) floor.push([x, y])
    for (let x = 6; x < 9; x++) for (let y = 0; y < 3; y++) floor.push([x, y])
    for (let x = 3; x < 6; x++) floor.push([x, 1])
    const exits: Array<Array<[number, number]>> = [[[0, 1]], [[8, 1]]]
    const props = [prop({ slug: "boulder", blocks_movement: true })]

    for (let seed = 0; seed < 40; seed++) {
      const placed = scatter(props, { floor, exits }, "cave", seed, { density: 1 })
      const blocked = new Set(blockedBy(placed, props).map(([x, y]) => `${x},${y}`))
      expect(connected(floor, blocked, exits)).toBe(true)
    }
  })

  it("leaves the exit mouths themselves walkable", () => {
    const floor = room(8, 8)
    const exits: Array<Array<[number, number]>> = [[[0, 3], [0, 4]], [[7, 3], [7, 4]]]
    const props = [prop({ slug: "boulder", blocks_movement: true })]
    for (let seed = 0; seed < 25; seed++) {
      const blocked = new Set(
        blockedBy(scatter(props, { floor, exits }, "cave", seed, { density: 1 }), props).map(([x, y]) => `${x},${y}`),
      )
      for (const key of ["0,3", "0,4", "7,3", "7,4"]) expect(blocked.has(key)).toBe(false)
    }
  })

  it("still lets a non-blocking prop sit on the route — scenery may crowd, not close", () => {
    const floor = room(6, 6)
    const exits: Array<Array<[number, number]>> = [[[0, 0]], [[5, 5]]]
    const props = [prop({ slug: "moss", blocks_movement: false })]
    const placed = scatter(props, { floor, exits }, "cave", 9, { density: 1 })
    const keep = protectedSquares({ floor, exits })
    expect(placed.some((p) => keep.has(`${p.grid_x},${p.grid_y}`))).toBe(true)
  })
})

describe("footprints", () => {
  it("covers every square of a multi-square prop", () => {
    expect(footprint(2, 3, { footprint_w: 2, footprint_h: 2 })).toEqual([
      [2, 3], [2, 4], [3, 3], [3, 4],
    ])
  })

  it("treats a 0 footprint as 1x1 rather than nothing", () => {
    expect(footprint(1, 1, { footprint_w: 0, footprint_h: 0 })).toEqual([[1, 1]])
  })

  it("will not straddle a wall", () => {
    // An L of floor: a 2x2 prop has nowhere legal to stand.
    const floor: Array<[number, number]> = [[0, 0], [1, 0], [0, 1]]
    const props = [prop({ slug: "shack", footprint_w: 2, footprint_h: 2 })]
    expect(scatter(props, { floor }, "cave", 1, { density: 1 })).toEqual([])
  })
})

describe("blockedBy / difficultBy", () => {
  const props = [
    prop({ slug: "boulder", blocks_movement: true }),
    prop({ slug: "rubble", difficult_terrain: true }),
    prop({ slug: "moss" }),
    prop({ slug: "shack", blocks_movement: true, footprint_w: 2, footprint_h: 2 }),
  ]
  const placed = [
    { prop_slug: "boulder", grid_x: 1, grid_y: 1, rotation: 0, flip_x: false, placed_by: "random", seed: 1 },
    { prop_slug: "rubble", grid_x: 2, grid_y: 2, rotation: 0, flip_x: false, placed_by: "random", seed: 1 },
    { prop_slug: "moss", grid_x: 3, grid_y: 3, rotation: 0, flip_x: false, placed_by: "random", seed: 1 },
    { prop_slug: "shack", grid_x: 5, grid_y: 5, rotation: 0, flip_x: false, placed_by: "random", seed: 1 },
  ] as const

  it("reports only movement blockers, with their whole footprint", () => {
    expect(blockedBy([...placed], props).sort()).toEqual(
      [[1, 1], [5, 5], [5, 6], [6, 5], [6, 6]].sort(),
    )
  })

  it("keeps difficult terrain out of the blocked list — it slows, it does not stop", () => {
    expect(blockedBy([...placed], props)).not.toContainEqual([2, 2])
    expect(difficultBy([...placed], props)).toEqual([[2, 2]])
  })

  it("ignores a placement whose prop is not in the catalog", () => {
    expect(blockedBy([{ prop_slug: "ghost", grid_x: 0, grid_y: 0, rotation: 0, flip_x: false, placed_by: "random", seed: 1 }], props)).toEqual([])
  })
})

describe("propArtUrl", () => {
  it("builds the storage path the catalog rows point at", () => {
    expect(propArtUrl("https://x.supabase.co/storage/v1/object/public/vtt-assets", "fungi-ormu"))
      .toBe("https://x.supabase.co/storage/v1/object/public/vtt-assets/props/fungi-ormu.png")
  })

  it("tolerates a trailing slash on the base", () => {
    expect(propArtUrl("https://x/vtt-assets/", "boulder")).toBe("https://x/vtt-assets/props/boulder.png")
  })
})
