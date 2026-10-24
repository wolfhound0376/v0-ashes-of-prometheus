import { describe, expect, it } from "vitest"
import { headingBetween, parseWalkHandoff, roadsOpenedBy, walkHandoffHref, WALK_HANDOFFS, type WalkArrival } from "./handoff"

describe("walk hand-off — a way out of Velkynvelve lands the party on the travel map", () => {
  it("every cavern in Sam's export has a name and a camp plate that exists", () => {
    for (const k of ["tunnels", "wastes", "shore", "lair", "grove", "crystal"] as const) {
      expect(WALK_HANDOFFS[k].name).toBeTruthy()
      expect(["tunnels", "fungal", "shore"]).toContain(WALK_HANDOFFS[k].biome)
    }
  })
  it("the river comes out on the shore, the grove is fungal, the unpainted caverns fall to the tunnels", () => {
    expect(WALK_HANDOFFS.shore.biome).toBe("shore")
    expect(WALK_HANDOFFS.grove.biome).toBe("fungal")
    expect(WALK_HANDOFFS.wastes.biome).toBe("tunnels")
    expect(WALK_HANDOFFS.lair.biome).toBe("tunnels")
  })
  it("the href is the string the walk page builds by hand", () => {
    expect(walkHandoffHref("tunnels")).toBe("/map?from=velkynvelve&via=tunnels&plate=tunnels")
    expect(walkHandoffHref("grove")).toBe("/map?from=velkynvelve&via=grove&plate=fungal")
  })
  it("reads its own href back", () => {
    const a = parseWalkHandoff(walkHandoffHref("shore").slice("/map".length))!
    expect(a).toMatchObject({ from: "velkynvelve", via: "shore", biome: "shore", name: "The Darklake shore" })
    expect(a.plate).toBe("/camp/plates/shore.webp")
  })
  it("an explicit plate wins only when it is a real camp plate", () => {
    expect(parseWalkHandoff("?via=wastes&plate=shore")!.biome).toBe("shore")
    expect(parseWalkHandoff("?via=wastes&plate=lava")!.biome).toBe("tunnels")
  })
  it("no hand-off, or one it does not know, is nothing — never a guess", () => {
    expect(parseWalkHandoff("")).toBeNull()
    expect(parseWalkHandoff("?via=menzoberranzan")).toBeNull()
    expect(parseWalkHandoff(new URLSearchParams({ from: "velkynvelve" }))).toBeNull()
  })
})

describe("the nodal side — which roads a way out opens on the travel map", () => {
  // The live graph around Velkynvelve as of 2026-10-24: two painted roads leave it, one west, one east.
  const V = { id: "v", node_key: "velkynvelve", metadata: { map_x: 470, map_y: 120 } }
  const R10 = { id: "r10", node_key: "road-10", metadata: { map_x: 414, map_y: 197 } }
  const R15 = { id: "r15", node_key: "road-15", metadata: { map_x: 576, map_y: 209 } }
  const R11 = { id: "r11", node_key: "road-11", metadata: { map_x: 462, map_y: 398 } }
  const nodes = [V, R10, R15, R11]
  const edges = [
    { from_node_id: "r10", to_node_id: "v" },
    { from_node_id: "v", to_node_id: "r15" },
    { from_node_id: "r10", to_node_id: "r15" }, // the bypass below the camp: not from V, must not count
  ]
  const arrival = (via: WalkArrival["via"]): WalkArrival => parseWalkHandoff(walkHandoffHref(via).slice("/map".length))!

  it("the south passage and the lift both come out on the cavern floor the two roads start from", () => {
    for (const via of ["tunnels", "wastes"] as const) {
      const roads = roadsOpenedBy(arrival(via), V, nodes, edges)
      expect(roads.map((r) => r.node.node_key)).toEqual(["road-10", "road-15"])
    }
  })
  it("each road is named by where it lies from the outpost, not by an invented place-name", () => {
    const roads = roadsOpenedBy(arrival("tunnels"), V, nodes, edges)
    expect(roads.map((r) => r.heading)).toEqual(["south-west", "south-east"])
  })
  it("a road with no edge to the party's node is not offered — the river has no edge in the data yet", () => {
    expect(roadsOpenedBy(arrival("shore"), V, nodes, edges)).toEqual([])
    // ...and the moment the data joins them, it is.
    const withRiver = [...edges, { from_node_id: "v", to_node_id: "r11" }]
    expect(roadsOpenedBy(arrival("shore"), V, nodes, withRiver).map((r) => `${r.node.node_key}:${r.heading}`)).toEqual(["road-11:south"])
  })
  it("a road the map has never loaded is not offered either", () => {
    expect(roadsOpenedBy(arrival("tunnels"), V, [V, R15], edges).map((r) => r.node.node_key)).toEqual(["road-15"])
  })
  it("caverns beyond caverns open no road off the outpost", () => {
    for (const via of ["lair", "grove", "crystal"] as const) expect(roadsOpenedBy(arrival(via), V, nodes, edges)).toEqual([])
  })
  it("headings follow the map's axes, y downward", () => {
    const o = { map_x: 0, map_y: 0 }
    expect(headingBetween(o, { map_x: 10, map_y: 2 })).toBe("east")
    expect(headingBetween(o, { map_x: -10, map_y: 2 })).toBe("west")
    expect(headingBetween(o, { map_x: 2, map_y: 10 })).toBe("south")
    expect(headingBetween(o, { map_x: 2, map_y: -10 })).toBe("north")
    expect(headingBetween(o, { map_x: 10, map_y: 10 })).toBe("south-east")
    expect(headingBetween(o, { map_x: -10, map_y: -10 })).toBe("north-west")
  })
})
