import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { standableGrid, withWalkable, type VelkynvelveNode } from "./node"
import { findPath, lineClear, type Point } from "./pathfinding"

const PX = 32
const centre = (x: number, y: number): Point => ({ x: (x + 0.5) * PX, y: (y + 0.5) * PX })

function nodeOf(walkable: string[], props: VelkynvelveNode["props"] = []): VelkynvelveNode {
  return { slug: "t", name: "t", squares: walkable.length, squarePx: PX, deck: "", walkable, props, spawns: [] }
}

/** Every leg of the path is clear for the body — nothing crosses a blocked square. */
function pathIsClear(grid: boolean[][], from: Point, path: Point[]): boolean {
  let a = from
  for (const b of path) {
    if (!lineClear(grid, PX, a, b)) return false
    a = b
  }
  return true
}

describe("standableGrid", () => {
  it("marks chasm squares unstandable", () => {
    const g = standableGrid(nodeOf(["o.", ".o"]))
    expect(g).toEqual([
      [true, false],
      [false, true],
    ])
  })

  it("blocks every square a prop covers", () => {
    const g = standableGrid(nodeOf(["ooo", "ooo", "ooo"], [{ id: "t", image: "", x: 1, y: 0, w: 2, h: 2 }]))
    expect(g).toEqual([
      [true, false, false],
      [true, false, false],
      [true, true, true],
    ])
  })
})

describe("findPath", () => {
  const open5 = standableGrid(nodeOf(["ooooo", "ooooo", "ooooo", "ooooo", "ooooo"]))

  it("returns [] when already at the target", () => {
    expect(findPath(open5, centre(2, 2), centre(2, 2), { squarePx: PX })).toEqual([])
  })

  it("walks a straight line across open deck in one leg", () => {
    const to = centre(4, 4)
    expect(findPath(open5, centre(0, 0), to, { squarePx: PX })).toEqual([to])
  })

  it("routes around a wall without crossing it", () => {
    const g = standableGrid(nodeOf(["ooooo", "ooooo", "oo.oo", "oo.oo", "oo.oo"]))
    const from = centre(0, 4)
    const path = findPath(g, from, centre(4, 4), { squarePx: PX })
    expect(path).not.toBeNull()
    expect(path!.length).toBeGreaterThan(1)
    expect(pathIsClear(g, from, path!)).toBe(true)
  })

  it("does not cut between two diagonally touching blocks", () => {
    // The only gap is the corner where (1,0) and (0,1) meet: sealed.
    const g = standableGrid(nodeOf(["o.", ".o"]))
    expect(findPath(g, centre(0, 0), centre(1, 1), { squarePx: PX })).toBeNull()
  })

  it("refuses a target in the chasm or inside a prop", () => {
    const g = standableGrid(nodeOf(["ooo", "ooo", "oo."], [{ id: "p", image: "", x: 1, y: 1, w: 1, h: 1 }]))
    expect(findPath(g, centre(0, 0), centre(2, 2), { squarePx: PX })).toBeNull()
    expect(findPath(g, centre(0, 0), centre(1, 1), { squarePx: PX })).toBeNull()
  })

  it("refuses a target that is cut off", () => {
    const g = standableGrid(nodeOf(["oo.oo", "oo.oo", "oo.oo"]))
    expect(findPath(g, centre(0, 1), centre(4, 1), { squarePx: PX })).toBeNull()
  })
})

describe("the tavern node", () => {
  const node = JSON.parse(
    readFileSync(join(__dirname, "../../public/velkynvelve/nodes/tavern/node.json"), "utf8"),
  ) as VelkynvelveNode
  const grid = standableGrid(node)

  it("no square walled off by props", () => {
    // Every standable square must be walkable from the first spawn — furniture
    // that seals a corner makes floor the players can see but never reach.
    const spawn = node.spawns[0]
    expect(grid[spawn.y][spawn.x]).toBe(true)
    const unreachable: string[] = []
    for (let y = 0; y < node.squares; y++) {
      for (let x = 0; x < node.squares; x++) {
        if (!grid[y][x]) continue
        const path = findPath(grid, centre(spawn.x, spawn.y), centre(x, y), { squarePx: node.squarePx })
        if (path === null) unreachable.push(`${x},${y}`)
      }
    }
    expect(unreachable).toEqual([])
    for (const s of node.spawns) expect(grid[s.y][s.x]).toBe(true)
  })
})

describe("the slave pen node", () => {
  const node = withWalkable(
    JSON.parse(
      readFileSync(join(__dirname, "../../public/velkynvelve/nodes/slave-pen/node.json"), "utf8"),
    ) as VelkynvelveNode,
  )
  const grid = standableGrid(node)
  const pen = node.geometry!.platforms.find((p) => p.id === "pen")!

  it("every pen square is reachable and the locked gates seal it", () => {
    const from = centre(node.spawns[0].x, node.spawns[0].y)
    const cutOff: string[] = []
    const escaped: string[] = []
    for (let y = 0; y < node.squares; y++) {
      for (let x = 0; x < node.squares; x++) {
        if (!grid[y][x]) continue
        const inPen = node.walkable[y][x] === "o" && Math.max(Math.abs(x + 0.5 - pen.cx), Math.abs(y + 0.5 - pen.cy)) <= pen.apothem
        const path = findPath(grid, from, centre(x, y), { squarePx: node.squarePx })
        if (inPen && !path) cutOff.push(`${x},${y}`)
        if (!inPen && path) escaped.push(`${x},${y}`)
      }
    }
    expect(cutOff).toEqual([])
    expect(escaped).toEqual([])
    for (const s of node.spawns) expect(grid[s.y][s.x]).toBe(true)
  })
})
