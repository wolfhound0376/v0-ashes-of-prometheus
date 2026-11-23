import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// THE WALK CHECK FOR THE PIXEL ROAD (Sam's standing rule, 2026-10-29: always prove the party can walk a new map).
// On the painted plates the walkable floor is a hand-made mask. On a pixel road it comes with the map, in
// road.json, so it can be proved from the file alone: the way in reaches the way out on floor, with a figure's
// footprint, round every prop. The footprint numbers and the rule below are the page's own
// (public/pixel-road/index.html: FOOT_RX, FOOT_RY, FACE_LIP, solidAt, canStand); if those change, change them here.
type Road = {
  id: string; walkable?: string; tile: number; cols: number; rows: number; ground: string; grid: string[]
  objects: { kind: string; x: number; y: number; w: number; h: number; ground: [number, number, number, number] }[]
  entry: { x: number; y: number }; exit: { x: number; y: number }; landmarks?: { kind: string; x: number; y: number }[]
}
const ROOT = join("public", "pixel-road")
const roads = readdirSync(ROOT).filter((d) => existsSync(join(ROOT, d, "road.json")))
const FOOT_RX = 7, FOOT_RY = 3, STEP = 16, FACE_LIP = 14

function walker(road: Road) {
  const solid = (px: number, py: number) => {
    const c = Math.floor(px / road.tile), r = Math.floor(py / road.tile)
    if (r < 0 || c < 0 || r >= road.rows || c >= road.cols || !(road.walkable ?? "w").includes(road.grid[r][c])) return true
    const up = Math.floor((py - FACE_LIP) / road.tile)
    if (up >= 0 && road.grid[up][c] === "a") return true // the face hangs half a cell into the floor below it
    return road.objects.some(({ ground: g }) => px >= g[0] && px <= g[0] + g[2] && py >= g[1] && py <= g[1] + g[3])
  }
  const canStand = (x: number, y: number) => !solid(x - FOOT_RX, y) && !solid(x + FOOT_RX, y) && !solid(x, y - FOOT_RY) && !solid(x, y + FOOT_RY) && !solid(x, y)
  const W = Math.ceil((road.cols * road.tile) / STEP), H = Math.ceil((road.rows * road.tile) / STEP)
  const ok = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && canStand(i * STEP + STEP / 2, j * STEP + STEP / 2)
  const node = (x: number, y: number): [number, number] => [Math.round((x - STEP / 2) / STEP), Math.round((y - STEP / 2) / STEP)]
  /** Every half-cell a figure can reach from a point, walking eight ways without cutting a corner. */
  const reach = (x: number, y: number) => {
    const [si, sj] = node(x, y), seen = new Set<number>(), todo: [number, number][] = []
    if (ok(si, sj)) { seen.add(sj * W + si); todo.push([si, sj]) }
    while (todo.length) {
      const [i, j] = todo.pop()!
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ni = i + di, nj = j + dj
        if ((!di && !dj) || !ok(ni, nj) || seen.has(nj * W + ni)) continue
        if (di && dj && (!ok(i + di, j) || !ok(i, j + dj))) continue
        seen.add(nj * W + ni); todo.push([ni, nj])
      }
    }
    return { has: (px: number, py: number) => { const [i, j] = node(px, py); return seen.has(j * W + i) }, size: seen.size, W, H, ok }
  }
  return { canStand, reach }
}

describe("the pixel road", () => {
  it("has at least one stretch", () => expect(roads.length).toBeGreaterThan(0))

  describe.each(roads)("%s", (id) => {
    const road = JSON.parse(readFileSync(join(ROOT, id, "road.json"), "utf8")) as Road
    const { canStand, reach } = walker(road)

    it("has a grid the size it says, and its pictures", () => {
      expect(road.grid.length).toBe(road.rows)
      for (const row of road.grid) expect(row.length).toBe(road.cols)
      expect(existsSync(join(ROOT, id, road.ground))).toBe(true)
      for (const k of new Set(road.objects.map((o) => o.kind))) expect(existsSync(join(ROOT, id, "objects", k + ".png")), k).toBe(true)
    })

    it("lets the party stand at the way in and the way out", () => {
      expect(canStand(road.entry.x, road.entry.y)).toBe(true)
      expect(canStand(road.exit.x, road.exit.y)).toBe(true)
    })

    it("joins the way in to the way out on floor, round every prop", () => {
      expect(reach(road.entry.x, road.entry.y).has(road.exit.x, road.exit.y)).toBe(true)
    })

    it("leaves no floor the party cannot get to", () => {
      // Every half-cell a figure could stand on is reachable from the way in: no sealed pockets behind a prop.
      const r = reach(road.entry.x, road.entry.y)
      let standable = 0
      for (let j = 0; j < r.H; j++) for (let i = 0; i < r.W; i++) if (r.ok(i, j)) standable++
      expect(r.size).toBe(standable)
    })

    it("keeps every prop's footprint on the floor, not in the rock", () => {
      for (const o of road.objects) {
        const cx = o.ground[0] + o.ground[2] / 2, cy = o.ground[1] + o.ground[3] / 2
        expect(road.walkable ?? "w", `${o.kind} at ${o.x},${o.y}`).toContain(road.grid[Math.floor(cy / road.tile)][Math.floor(cx / road.tile)])
      }
    })

    it("lets the party walk up to every landmark", () => {
      const r = reach(road.entry.x, road.entry.y)
      for (const m of road.landmarks ?? []) {
        let near = false
        for (let dy = -96; dy <= 96 && !near; dy += STEP) for (let dx = -96; dx <= 96 && !near; dx += STEP) near = r.has(m.x + dx, m.y + dy)
        expect(near, m.kind).toBe(true)
      }
    })
  })
})
