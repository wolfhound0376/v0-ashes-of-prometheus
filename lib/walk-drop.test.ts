import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"

// Going over the edge (Sam, 2026-10-27: "Derendil, Ront, and any barbarian can jump and will often do it to close the
// gap especially from up high ... Fall damage as applicable."). Like walk-long-jump.test.ts, this pulls the SHIPPED
// planDrop / landFall / isLeaper out of the generated page (public/velkynvelve-walk/index.html) and runs them, so a
// re-typed copy cannot pass while the page ships something else. No plate has `heights` yet, so the ground here is
// built by hand: a ledge LEDGE high on the left, open air, then the floor.
const ROOT = path.join(__dirname, "..")
const PAGE = fs.readFileSync(path.join(ROOT, "public/velkynvelve-walk/index.html"), "utf8")

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
const constant = (name: string) => {
  const m = new RegExp(`const ${name} = ([^;]+);`).exec(PAGE)
  if (!m) throw new Error(`the walk no longer defines ${name}`)
  return m[1]
}

const LEDGE_FT = Number(constant("LEDGE_FT"))
const PX_PER_FT = 4                                    // a flat 4 px a foot keeps the arithmetic readable
const EDGE_X = 400, AIR_TO = 420                       // the ledge ends at x=400; x 400-420 is open air; floor beyond
let ledgeFt = 20

const walkable = (x: number, _y: number) => x >= 0 && x <= 1200 && !(x > EDGE_X && x < AIR_TO)
const elevAt = (x: number, _y: number) => (x <= EDGE_X ? ledgeFt : 0)
const ftPx = () => PX_PER_FT
const fname = (a: any) => a.id
const isBarbarian = (cls: unknown) => /barbarian/i.test(String(cls || ""))

const planDrop = new Function("walkable", "elevAt", "ftPx", "fname", "LEDGE_FT",
  `${grab("planDrop")}\nreturn planDrop;`)(walkable, elevAt, ftPx, fname, LEDGE_FT) as (a: any, to: any) => any
const isLeaper = new Function("isBarbarian", `return ${constant("isLeaper")};`)(isBarbarian) as (a: any) => boolean

// landFall with the page's dice, damage and log replaced by recorders
function fallWith(rolls: number[], resist = false) {
  const seen: { expr?: string; dealt?: number; prone?: boolean } = {}
  const roll = (expr: string) => { seen.expr = expr; return { total: rolls.reduce((s, r) => s + r, 0), rolls } }
  const t: any = { id: "ront", down: false, c: { hp: 50, conds: new Set<string>(), sheet: { speed: 30 } } }
  const damage = (a: any, n: number) => { const m = resist ? Math.floor(n / 2) : n; seen.dealt = m; a.c.hp -= m; if (a.c.hp <= 0) a.down = true }
  const addCond = (a: any, k: string) => { a.c.conds.add(k); seen.prone = k === "prone" }
  const landFall = new Function("roll", "damage", "addCond", "bank", "shake", "hitstop", "log", "fname",
    `${grab("landFall")}\nreturn landFall;`)(roll, damage, addCond, () => {}, () => {}, () => {}, () => {}, fname)
  return { t, seen, landFall }
}

const leaper = (id: string, x: number, opts: { str?: number; move?: number; cls?: string; leaper?: boolean } = {}) => ({
  id, x, y: 500,
  c: { move: opts.move ?? 30, conds: new Set<string>(), sheet: { strScore: opts.str ?? 16, cls: opts.cls ?? "Orc", leaper: opts.leaper ?? true } },
})

describe("going over the edge", () => {
  it("drops off a ledge with a run-up and reports how far it falls", () => {
    ledgeFt = 20
    const g = planDrop(leaper("ront", 340), { x: 480, y: 500 })        // 15 ft of ledge, then the edge, then the floor
    expect(g.ok).toBe(true)
    expect(g.drop).toBe(true)
    expect(g.dropFt).toBe(20)
    expect(g.standing).toBe(false)
  })

  it("is the floor's business, not a drop, when the ledge is under 10 ft", () => {
    ledgeFt = 5
    expect(planDrop(leaper("ront", 340), { x: 480, y: 500 })).toBeNull()
  })

  it("never jumps UP: from the floor there is nothing to drop from", () => {
    ledgeFt = 20
    expect(planDrop(leaper("ront", 600), { x: 300, y: 500 })).toBeNull()
  })

  it("still pays for the run-up and the gap in movement", () => {
    ledgeFt = 20
    const g = planDrop(leaper("ront", 340, { move: 5 }), { x: 480, y: 500 })
    expect(g.ok).toBeFalsy()
    expect(g.why).toMatch(/Not enough movement/)
  })

  it("will not go if prone or restrained", () => {
    ledgeFt = 20
    const a = leaper("ront", 340); a.c.conds.add("restrained")
    expect(planDrop(a, { x: 480, y: 500 })).toBeNull()
  })
})

describe("who leaps on their own", () => {
  it("is Ront and Derendil by their sheets, and any barbarian by class", () => {
    expect(isLeaper(leaper("ront", 0))).toBe(true)
    expect(isLeaper(leaper("derendil", 0, { str: 17, cls: "Quaggoth" }))).toBe(true)
    expect(isLeaper(leaper("ulfgar", 0, { cls: "Barbarian", leaper: false }))).toBe(true)
    expect(isLeaper(leaper("eldeth", 0, { str: 11, cls: "Shield dwarf", leaper: false }))).toBe(false)
  })
  it("never without a STR score: there is no long jump to make", () => {
    expect(isLeaper({ c: { sheet: { cls: "Barbarian" } } })).toBe(false)
  })
  it("Ront and Derendil carry the flag on the page itself", () => {
    expect(PAGE).toMatch(/ront: +\{name: "Ront"[^\n]*leaper: true/)
    expect(PAGE).toMatch(/derendil: +\{name: "Derendil"[^\n]*leaper: true/)
  })
})

describe("the fall (SRD 5.1: 1d6 bludgeoning per 10 ft, max 20d6, prone unless no damage)", () => {
  it("rolls 2d6 for a 20 ft drop and lands prone", () => {
    const { t, seen, landFall } = fallWith([3, 4]); landFall(t, 20)
    expect(seen.expr).toBe("2d6"); expect(seen.dealt).toBe(7); expect(t.c.conds.has("prone")).toBe(true)
  })
  it("rounds down: 19 ft is still 1d6", () => {
    const { t, seen, landFall } = fallWith([5]); landFall(t, 19)
    expect(seen.expr).toBe("1d6")
  })
  it("caps at 20d6", () => {
    const { t, seen, landFall } = fallWith(new Array(20).fill(1)); landFall(t, 400)
    expect(seen.expr).toBe("20d6")
  })
  it("a raging barbarian takes half (bludgeoning resistance) and still lands prone", () => {
    const { t, seen, landFall } = fallWith([6, 6], true); landFall(t, 20)
    expect(seen.dealt).toBe(6); expect(t.c.conds.has("prone")).toBe(true)
  })
  it("no damage, no prone", () => {
    const { t, landFall } = fallWith([1], true); landFall(t, 10)    // 1 halved to 0
    expect(t.c.conds.has("prone")).toBe(false)
  })
})
