import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

// The walk is a GENERATED page (scripts/velkynvelve-walk/build_walk.py), so this pulls the
// shipped gapOnLine/planLeap straight out of public/velkynvelve-walk/index.html and runs them
// against the real node geometry in spec.json. Testing a re-typed copy would have passed while
// the page shipped something else — that has happened here before.
const ROOT = path.join(__dirname, "..")
const PAGE = fs.readFileSync(path.join(ROOT, "public/velkynvelve-walk/index.html"), "utf8")
const SPEC = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts/velkynvelve-walk/spec.json"), "utf8"))

function grab(name: string): string {
  const i = PAGE.indexOf(`function ${name}(`)
  if (i < 0) throw new Error(`the walk no longer defines ${name}()`)
  let depth = 0
  for (let k = PAGE.indexOf("{", i); k < PAGE.length; k++) {
    if (PAGE[k] === "{") depth++
    else if (PAGE[k] === "}" && --depth === 0) return PAGE.slice(i, k + 1)
  }
  throw new Error(`unbalanced ${name}()`)
}

// Mirrors of the page's own constants and grid build. CELL/GW/GH/BASE must track line ~357.
const NAT_W = 2400, NAT_H = 1339, CELL = 20
const GW = Math.ceil(NAT_W / CELL), GH = Math.ceil(NAT_H / CELL), BASE = 1.15
const MIN_LEAP_FT = Number(/const MIN_LEAP_FT = (\d+)/.exec(PAGE)?.[1])

type Pt = { x: number; y: number }
let grid = new Uint8Array(GW * GH)
let node: any = null
let depthMin = 0, depthMax = 1

const inPoly = (p: number[][], x: number, y: number) => {
  let c = false
  for (let i = 0, n = p.length; i < n; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i - 1 + n) % n]
    if (y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1) c = !c
  }
  return c
}
const inFloor = (f: any, x: number, y: number) =>
  f.poly ? inPoly(f.poly, x, y)
  : f.ellipse ? ((x - f.ellipse[0]) / f.ellipse[2]) ** 2 + ((y - f.ellipse[1]) / f.ellipse[3]) ** 2 <= 1
  : f.rect ? x >= f.rect[0] && x <= f.rect[2] && y >= f.rect[1] && y <= f.rect[3]
  : false

function loadNode(key: string) {
  node = SPEC[key]
  grid = new Uint8Array(GW * GH)
  depthMin = 1e9; depthMax = -1e9
  for (let cy = 0; cy < GH; cy++) for (let cx = 0; cx < GW; cx++) {
    const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2
    const inside = node.floors.some((f: any) => inFloor(f, x, y))
      || node.zones.some((z: any) => x >= z.rect[0] && x <= z.rect[2] && y >= z.rect[1] && y <= z.rect[3])
    const blocked = (node.obstacles || []).some((o: any) => ((x - o.cx) / o.rx) ** 2 + ((y - o.cy) / o.ry) ** 2 < 1)
    if (inside && !blocked) { grid[cy * GW + cx] = 1; depthMin = Math.min(depthMin, y); depthMax = Math.max(depthMax, y) }
  }
  if (depthMax - depthMin < 200) { depthMin -= 100; depthMax += 100 }
}

const walkable = (x: number, y: number) => {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL)
  return cx >= 0 && cy >= 0 && cx < GW && cy < GH && grid[cy * GW + cx] === 1
}
const depthAt = (y: number) => 0.8 + 0.32 * Math.min(1, Math.max(0, (y - depthMin) / (depthMax - depthMin)))
const ftPx = (a: any) => (96 * BASE * node.scale * depthAt(a.y) * (a.big || 1)) / 5
const fname = (a: any) => a.id

const [, planLeap] = new Function(
  "walkable", "ftPx", "fname", "MIN_LEAP_FT", "balconyFloor", "outsidePen",
  `${grab("gapOnLine")}\n${grab("planLeap")}\nreturn [gapOnLine, planLeap];`,
)(walkable, ftPx, fname, MIN_LEAP_FT, () => false, () => false)   // no pen gate on these plates: the leap rule alone as [unknown, (a: any, to: Pt) => any]

// str_score off the characters table, the same numbers the sheets carry.
const STR: Record<string, number> = { kenta: 12, samson: 11, scott: 12, freia: 8 }
const hero = (id: string, at: Pt, move = 30) =>
  ({ id, kind: "pc", x: at.x, y: at.y, c: { move, conds: new Set<string>(), sheet: { strScore: STR[id] } as Record<string, number> } })

/** A walkable point on each side of `o`, with the obstacle itself between them. */
function crossing(o: any, runUpPx: number): { A: Pt; B: Pt } | null {
  for (let t = 0; t < 16; t++) {
    const ux = Math.cos((t * Math.PI) / 8), uy = Math.sin((t * Math.PI) / 8)
    const half = Math.hypot(o.rx * ux, o.ry * uy)
    const A = { x: o.cx - ux * (half + runUpPx), y: o.cy - uy * (half + runUpPx) }
    const B = { x: o.cx + ux * (half + 40), y: o.cy + uy * (half + 40) }
    if (walkable(A.x, A.y) && walkable(B.x, B.y) && !walkable(o.cx, o.cy)) return { A, B }
  }
  return null
}

describe("the walk's long jump", () => {
  it("carries a STR SCORE, not the save modifier, for all four heroes", () => {
    // 5e long jump is measured in Strength SCORE feet; the sheets' `saves.str` is the modifier.
    for (const [slug, score] of Object.entries(STR)) {
      const row = new RegExp(`\\n  ${slug}:\\s*\\{[^\\n]*?strScore: (\\d+)`).exec(PAGE)
      expect(row, `${slug} has no strScore on its sheet`).toBeTruthy()
      expect(Number(row![1]), slug).toBe(score)
    }
  })

  it("leaves a crack in the floor alone — a seam is not an obstacle", () => {
    // Nodes 7, 9 and 10 each have a ~2 ft diagonal seam the pathfinder treats as a wall.
    // Leaping those would hide a pathfinding bug behind an animation.
    loadNode("9")
    expect(planLeap(hero("kenta", { x: 1510, y: 730 }), { x: 1550, y: 710 })).toBeNull()
    expect(MIN_LEAP_FT).toBeGreaterThanOrEqual(5)
  })

  it("halves the span from a standing start and says so", () => {
    loadNode("12")
    const o = node.obstacles[0]
    const near = crossing(o, 15)
    expect(near, "no standing-start anchor in the den").toBeTruthy()
    const g = planLeap(hero("kenta", near!.A), near!.B)
    expect(g.standing).toBe(true)
    expect(g.max).toBe(Math.floor(STR.kenta / 2))
  })

  it("gives the full Strength score once there is 10 ft of run-up", () => {
    loadNode("12")
    const cr = crossing(node.obstacles[0], 170)!
    const g = planLeap(hero("kenta", cr.A), cr.B)
    expect(g.runUpFt).toBeGreaterThanOrEqual(10)
    expect(g.max).toBe(STR.kenta)
  })

  it("refuses, with a reason, what the legs or the movement cannot do", () => {
    loadNode("12")
    const cr = crossing(node.obstacles[0], 170)!
    const far = planLeap(hero("freia", cr.A), cr.B)       // STR 8 against a ~14 ft span
    expect(far.ok).toBeFalsy()
    expect(far.why).toMatch(/\d+ ft/)
    const spent = planLeap(hero("kenta", cr.A, 5), cr.B)  // 5 ft of movement left
    expect(spent.ok).toBeFalsy()
    expect(spent.why).toBeTruthy()
  })

  it("never jumps while prone, grappled, restrained or asleep", () => {
    loadNode("12")
    const cr = crossing(node.obstacles[0], 170)!
    for (const cond of ["prone", "grappled", "restrained", "asleep"]) {
      const a = hero("kenta", cr.A); a.c.conds.add(cond)
      expect(planLeap(a, cr.B), cond).toBeNull()
    }
  })

  it("never plans one for a creature, which has no Strength score on its block", () => {
    loadNode("12")
    const cr = crossing(node.obstacles[0], 170)!
    const spider = hero("kenta", cr.A); spider.c.sheet = {}
    expect(planLeap(spider, cr.B)).toBeNull()
  })

  it("is reachable: every hero can clear real obstacles on the real maps", () => {
    // The guard against shipping art and rules nobody can ever trigger.
    const cleared: Record<string, number> = { kenta: 0, samson: 0, scott: 0, freia: 0 }
    let crossings = 0
    for (const key of Object.keys(SPEC)) {
      if (key.startsWith("_") || !SPEC[key].floors) continue   // _handoffs, _layout: build metadata, not plates
      loadNode(key)
      for (const o of node.obstacles || []) {
        for (let t = 0; t < 16; t++) {
          const ux = Math.cos((t * Math.PI) / 8), uy = Math.sin((t * Math.PI) / 8)
          const half = Math.hypot(o.rx * ux, o.ry * uy)
          const A = { x: o.cx - ux * (half + 170), y: o.cy - uy * (half + 170) }
          const B = { x: o.cx + ux * (half + 40), y: o.cy + uy * (half + 40) }
          if (!walkable(A.x, A.y) || !walkable(B.x, B.y) || walkable(o.cx, o.cy)) continue
          if (!planLeap(hero("kenta", A), B)) continue
          crossings++
          for (const h of Object.keys(cleared)) if (planLeap(hero(h, A), B)?.ok) cleared[h]++
        }
      }
    }
    expect(crossings).toBeGreaterThan(50)
    for (const h of Object.keys(cleared)) expect(cleared[h], `${h} can never clear anything`).toBeGreaterThan(0)
    // Fifi has the worst Strength in the party, so she must clear the fewest. If this ever
    // flips, a sheet has drifted from the characters table.
    expect(cleared.freia).toBeLessThan(cleared.kenta)
  })
})
