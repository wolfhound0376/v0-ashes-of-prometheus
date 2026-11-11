import { describe, expect, it } from "vitest"
import { LONG_REST_KEY, isRoadMarker, isStandingKey, paceOfKey, standingOptions } from "./standing"

const marker = { node_type: "waypoint", metadata: { map_x: 576, map_y: 209 } }

describe("what every road marker offers", () => {
  it("a long rest and the two other paces, and nothing invented", () => {
    const keys = standingOptions(marker, { pace: "normal" }, false).map((o) => o.key)
    expect(keys).toEqual([LONG_REST_KEY, "standing:pace-slow", "standing:pace-fast"])
  })
  it("never offers the pace the party is already keeping", () => {
    expect(standingOptions(marker, { pace: "slow" }, false).map((o) => o.key)).not.toContain("standing:pace-slow")
  })
  it("says there is no foraging after a fast pace (p.24)", () => {
    expect(standingOptions(marker, { pace: "fast" }, false)[0].detail).toContain("no foraging")
    expect(standingOptions(marker, { pace: "normal" }, false)[0].detail).not.toContain("no foraging")
  })
  it("stays quiet when the march was already stopped here", () => {
    expect(standingOptions(marker, { pace: "normal" }, true)).toEqual([])
  })
  it("is for road markers only: not a great place, not an unplaced waypoint", () => {
    expect(standingOptions({ node_type: "location", metadata: { map_x: 1, map_y: 1 } }, { pace: "normal" }, false)).toEqual([])
    expect(isRoadMarker({ node_type: "waypoint", metadata: {} })).toBe(false)
    expect(isRoadMarker({ node_type: "waypoint", metadata: { map_x: null, map_y: null } })).toBe(false)
    expect(isRoadMarker(marker)).toBe(true)
  })
  it("reads its own keys back", () => {
    expect(isStandingKey(LONG_REST_KEY)).toBe(true)
    expect(isStandingKey("search-the-ledge")).toBe(false)
    expect(paceOfKey("standing:pace-fast")).toBe("fast")
    expect(paceOfKey("standing:pace-sprint")).toBe(null)
    expect(paceOfKey(LONG_REST_KEY)).toBe(null)
  })
})
