import { describe, expect, it } from "vitest"
import { plateToNodeNumber } from "./situation-nodes"

describe("plateToNodeNumber", () => {
  it("reads the area number off the fourteen original plates", () => {
    expect(plateToNodeNumber("node-01-southern-watch-post")).toBe(1)
    expect(plateToNodeNumber("node-07-ilvara-quarters")).toBe(7)
    expect(plateToNodeNumber("node-10-guard-tower")).toBe(10)
    expect(plateToNodeNumber("node-11-slave-pen")).toBe(11)
    expect(plateToNodeNumber("node-14-pool-river")).toBe(14)
  })

  it("folds the guard tower's other levels into node 10 (one stalactite, one node on the DM's map)", () => {
    expect(plateToNodeNumber("node-10b-guard-tower-lower")).toBe(10)
    expect(plateToNodeNumber("node-10c-guard-tower-armory")).toBe(10)
  })

  it("leaves the caverns and anything unknown alone", () => {
    for (const s of ["biome-tunnels", "biome-crystal", "biome-wastes", "biome-lair", "biome-shore", "biome-grove"]) {
      expect(plateToNodeNumber(s), s).toBe(null)
    }
    expect(plateToNodeNumber("")).toBe(null)
    expect(plateToNodeNumber(null)).toBe(null)
    expect(plateToNodeNumber(undefined)).toBe(null)
    expect(plateToNodeNumber("slave-pen")).toBe(null)
    expect(plateToNodeNumber("node-x-nowhere")).toBe(null)
    expect(plateToNodeNumber("node-00-nothing")).toBe(null)
  })
})
