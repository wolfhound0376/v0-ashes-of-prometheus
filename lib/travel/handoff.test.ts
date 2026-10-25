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

describe("the nodal side — which roads a way out opens on the travel map (Sam's picks, 2026-10-24)", () => {
  const V = { id: "v", node_key: "velkynvelve", metadata: { map_x: 470, map_y: 120 } }
  const R07 = { id: "r07", node_key: "road-07", metadata: { map_x: 345, map_y: 231 } }
  const R09 = { id: "r09", node_key: "road-09", metadata: { map_x: 398, map_y: 288 } }
  const R10 = { id: "r10", node_key: "road-10", metadata: { map_x: 414, map_y: 197 } }
  const R15 = { id: "r15", node_key: "road-15", metadata: { map_x: 576, map_y: 209 } }
  const R21 = { id: "r21", node_key: "road-21", metadata: { map_x: 750, map_y: 267 } }
  const POOL = { id: "cp", node_key: "cliff-pool", metadata: { map_x: 470, map_y: 286 } }
  const nodes = [V, R07, R09, R10, R15, R21, POOL]
  // the painted roads as the data has them today: only road-10 and road-15 touch Velkynvelve
  const painted = [
    { from_node_id: "r10", to_node_id: "v" },
    { from_node_id: "v", to_node_id: "r15" },
    { from_node_id: "r10", to_node_id: "r15" },
  ]
  // ...and with the cavern edges from the PR applied
  const withCaverns = [...painted, { from_node_id: "v", to_node_id: "r21" }, { from_node_id: "v", to_node_id: "cp" }, { from_node_id: "v", to_node_id: "r09" }, { from_node_id: "v", to_node_id: "r07" }]
  const arrival = (via: WalkArrival["via"]): WalkArrival => parseWalkHandoff(walkHandoffHref(via).slice("/map".length))!
  const keys = (via: WalkArrival["via"], edges: typeof painted) => roadsOpenedBy(arrival(via), V, nodes, edges).map((r) => r.node.node_key)

  it("the wastes' Oozing Temple tunnel opens road-10, which the painted roads already join", () => {
    expect(keys("wastes", painted)).toEqual(["road-10"])
  })
  it("the lair, the shore and the grove wait for their edges, then open exactly Sam's marker", () => {
    expect(keys("lair", painted)).toEqual([])
    expect(keys("shore", painted)).toEqual([])
    expect(keys("grove", painted)).toEqual([])
    expect(keys("lair", withCaverns)).toEqual(["road-21"])
    expect(keys("shore", withCaverns)).toEqual(["cliff-pool"])
    expect(keys("grove", withCaverns)).toEqual(["road-09"])
  })
  it("the tunnels keep both of Sam's markers in his order", () => {
    expect(keys("tunnels", withCaverns)).toEqual(["road-07", "road-10"])
  })
  it("each road is named by where it lies from the outpost, not by an invented place-name", () => {
    expect(roadsOpenedBy(arrival("tunnels"), V, nodes, withCaverns).map((r) => r.heading)).toEqual(["south-west", "south-west"])
    expect(roadsOpenedBy(arrival("shore"), V, nodes, withCaverns)[0].heading).toBe("south")
    expect(roadsOpenedBy(arrival("lair"), V, nodes, withCaverns)[0].heading).toBe("south-east")
  })
  it("a road the map has never loaded is not offered either", () => {
    expect(roadsOpenedBy(arrival("tunnels"), V, [V, R10], withCaverns).map((r) => r.node.node_key)).toEqual(["road-10"])
  })
  it("the crystal passage opens no road — nothing picked", () => {
    expect(keys("crystal", withCaverns)).toEqual([])
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
