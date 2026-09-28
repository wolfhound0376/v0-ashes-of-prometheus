import { describe, expect, it } from "vitest"
import { reach, stepToward, walkableFrom } from "./npc-ai"

// A 5x1 corridor with rapids in the middle square: . . ~ . .
const cells = {
  floor: [[0, 0], [1, 0], [3, 0], [4, 0]].map((sq) => ({ sq })),
  difficult: [{ sq: [2, 0] }],
}

describe("difficult terrain (SRD 5.1, Combat: Difficult Terrain)", () => {
  it("makes declared difficult squares walkable", () => {
    const w = walkableFrom(cells)
    expect(w.has("2,0")).toBe(true)
    expect(w.difficult.has("2,0")).toBe(true)
  })

  it("charges two squares to enter a difficult square", () => {
    const d = reach({ x: 0, y: 0 }, walkableFrom(cells), new Set())
    expect(d.get("1,0")).toBe(1)
    expect(d.get("2,0")).toBe(3)
    expect(d.get("3,0")).toBe(4)
  })

  it("leaves a map with no difficult terrain priced exactly as before", () => {
    const plain = new Set(["0,0", "1,0", "2,0", "3,0"])
    expect(reach({ x: 0, y: 0 }, plain, new Set()).get("3,0")).toBe(3)
  })

  it("stops a monster short when the ford eats its speed", () => {
    // 3 squares of speed: 1 to the bank, 2 to wade in. It cannot also climb out.
    const to = stepToward({ x: 0, y: 0 }, { x: 4, y: 0 }, walkableFrom(cells), new Set(), 3)
    expect(to).toEqual({ x: 2, y: 0 })
  })

  it("still ignores water that is not declared difficult", () => {
    const w = walkableFrom({ floor: [{ sq: [0, 0] }], water: [{ sq: [1, 0] }] })
    expect(w.has("1,0")).toBe(false)
  })
})
