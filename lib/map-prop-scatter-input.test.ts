import { describe, expect, it } from "vitest"
import { scatterMapFrom, type NodeCells } from "./map-prop-scatter-input"
import { protectedSquares } from "./map-props"

const cell = (x: number, y: number) => ({ sq: [x, y] as [number, number] })

/** A 4x4 room with two door squares on the top edge and two registered exits. */
function room(): NodeCells {
  const floor = []
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) floor.push(cell(x, y))
  return {
    cells: { floor, doors: [cell(0, 0), cell(3, 0)], water: [], walls: [] },
    exits: [{ cells: [[0, 0]] }, { cells: [[3, 0]] }],
  }
}

describe("scatterMapFrom", () => {
  it("takes every floor square", () => {
    expect(scatterMapFrom(room()).floor).toHaveLength(16)
  })

  it("keeps door squares walkable but marks them occupied", () => {
    const m = scatterMapFrom(room())
    const floorKeys = m.floor.map(([x, y]) => `${x},${y}`)
    expect(floorKeys).toContain("0,0")
    expect(m.occupied?.map(([x, y]) => `${x},${y}`)).toEqual(expect.arrayContaining(["0,0", "3,0"]))
  })

  it("adds water cells to the floor", () => {
    const n = room()
    n.cells!.water = [cell(9, 9)]
    const m = scatterMapFrom(n)
    expect(m.floor).toHaveLength(17)
    expect(m.floor.map(([x, y]) => `${x},${y}`)).toContain("9,9")
  })

  it("counts a cell once when it is both floor and water", () => {
    const n = room()
    n.cells!.water = [cell(2, 2)]
    expect(scatterMapFrom(n).floor).toHaveLength(16)
  })

  it("merges caller-supplied occupied squares with the doors", () => {
    const m = scatterMapFrom(room(), { occupied: [[1, 1]] })
    expect(m.occupied?.map(([x, y]) => `${x},${y}`).sort()).toEqual(["0,0", "1,1", "3,0"])
  })

  it("drops occupied squares that are not on the floor", () => {
    const m = scatterMapFrom(room(), { occupied: [[99, 99]] })
    expect(m.occupied?.map(([x, y]) => `${x},${y}`)).not.toContain("99,99")
  })

  it("carries the registered exits through", () => {
    expect(scatterMapFrom(room()).exits).toEqual([[[0, 0]], [[3, 0]]])
  })

  it("drops an exit whose cells are all off the floor", () => {
    const n = room()
    n.exits = [{ cells: [[0, 0]] }, { cells: [[50, 50]] }]
    expect(scatterMapFrom(n).exits).toHaveLength(1)
  })

  it("survives a missing cells block", () => {
    const m = scatterMapFrom({})
    expect(m.floor).toEqual([])
    expect(m.exits).toEqual([])
  })

  it("skips malformed squares rather than throwing", () => {
    const n = { cells: { floor: [cell(1, 1), { sq: [1] }, { sq: ["a", 2] }] } } as unknown as NodeCells
    expect(scatterMapFrom(n).floor).toEqual([[1, 1]])
  })

  it("is deterministic", () => {
    expect(scatterMapFrom(room())).toEqual(scatterMapFrom(room()))
  })

  it("feeds protectedSquares an exit pair it can actually route between", () => {
    // The whole point of carrying exits: protectedSquares must protect a path.
    const keep = protectedSquares(scatterMapFrom(room()))
    expect(keep.has("0,0")).toBe(true)
    expect(keep.has("3,0")).toBe(true)
    expect(keep.size).toBeGreaterThan(2)
  })
})
