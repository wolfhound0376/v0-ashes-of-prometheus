import { describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import {
  CHAIN_MARCH, CHAIN_MARCH_GUARDS, CHAIN_MARCH_LINES,
  chainMarchDue, chainMarchEscort, chainMarchLostLine, chainMarchMapHref, chainMarchOutcome, chainMarchPosts,
} from "./chain-march.mjs"
import { WALK_HANDOFFS } from "./travel/handoff"

// Sam's rulings, 2026-11-12: marched out in chains at zero for one last, harder escape; the rope bridge;
// GAME OVER if that fails. Everything else in lib/chain-march.mjs is Claude's and flagged there.

const ROOT = path.resolve(__dirname, "..")
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8")

describe("when the march begins", () => {
  it("begins when the clock is spent and the party is still held", () => {
    expect(chainMarchDue(0, true, null)).toBe(true)
  })
  it("does not begin while a watch is left", () => {
    expect(chainMarchDue(1, true, null)).toBe(false)
    expect(chainMarchDue(6, true, null)).toBe(false)
  })
  it("does not begin for a party that is out of the pen or has fought the breakout", () => {
    expect(chainMarchDue(0, false, null)).toBe(false)
  })
  it("begins once: a march on record is never begun again", () => {
    expect(chainMarchDue(0, true, { seq: "c1", stage: "taken" })).toBe(false)
    expect(chainMarchDue(0, true, { seq: "c1", out: "escaped" })).toBe(false)
  })
  it("does not begin on a clock it cannot read", () => {
    expect(chainMarchDue(NaN, true, null)).toBe(false)
    expect(chainMarchDue(undefined as unknown as number, true, null)).toBe(false)
  })
})

describe("the escort", () => {
  it("is one more drow than there are heroes", () => {
    expect(chainMarchEscort(2)).toHaveLength(3)
    expect(chainMarchEscort(3)).toHaveLength(4)
    expect(chainMarchEscort(4)).toHaveLength(5)
  })
  it("is never fewer than three or more than five", () => {
    expect(chainMarchEscort(0)).toHaveLength(CHAIN_MARCH.guardsMin)
    expect(chainMarchEscort(1)).toHaveLength(CHAIN_MARCH.guardsMin)
    expect(chainMarchEscort(6)).toHaveLength(CHAIN_MARCH.guardsMax)
    expect(chainMarchEscort(NaN)).toHaveLength(CHAIN_MARCH.guardsMin)
  })
  it("is only drow guards, and mixes the two figures", () => {
    const e = chainMarchEscort(4)
    expect(e.every((id) => CHAIN_MARCH_GUARDS.includes(id))).toBe(true)
    expect(new Set(e).size).toBe(2)
  })
})

describe("where the escort stands", () => {
  const [hx] = CHAIN_MARCH.halt
  it("splits the escort ahead of the column and behind it, the odd one ahead", () => {
    const p = chainMarchPosts(5)
    expect(p.filter((q) => q.x > hx)).toHaveLength(3)
    expect(p.filter((q) => q.x < hx)).toHaveLength(2)
  })
  it("never leaves an end of the bridge unguarded", () => {
    for (const n of [3, 4, 5]) {
      const p = chainMarchPosts(n)
      expect(p.some((q) => q.x > hx)).toBe(true)
      expect(p.some((q) => q.x < hx)).toBe(true)
    }
  })
  it("gives every guard a post of their own", () => {
    const p = chainMarchPosts(5)
    expect(new Set(p.map((q) => `${q.x},${q.y}`)).size).toBe(5)
  })
  it("halts the column on the bridge itself, with every post on its planks", () => {
    const spec = JSON.parse(read("scripts/velkynvelve-walk/spec.json"))[CHAIN_MARCH.plate]
    // the bridge is the floor that spans the middle of the plate
    const xs = (f: { poly: number[][] }) => f.poly.map((q) => q[0])
    const bridge = spec.floors.find((f: { poly: number[][] }) => Math.min(...xs(f)) < hx && Math.max(...xs(f)) > hx)
    expect(bridge).toBeTruthy()
    const lo = Math.min(...xs(bridge)), hi = Math.max(...xs(bridge))
    for (const q of chainMarchPosts(CHAIN_MARCH.guardsMax)) { expect(q.x).toBeGreaterThan(lo); expect(q.x).toBeLessThan(hi) }
  })
})

describe("how the bridge comes out", () => {
  it("beating the escort is an escape", () => {
    expect(chainMarchOutcome({ won: true })).toBe("escaped")
  })
  it("one hero off the plate is an escape, even if the fight was not won", () => {
    expect(chainMarchOutcome({ won: false, gotAway: 1 })).toBe("escaped")
  })
  it("anything else is Menzoberranzan", () => {
    expect(chainMarchOutcome({ won: false, gotAway: 0 })).toBe("lost")
    expect(chainMarchOutcome()).toBe("lost")
  })
  it("the DM ending the fight by hand decides nothing", () => {
    expect(chainMarchOutcome({ won: false, gotAway: 0, byDm: true })).toBeNull()
  })
  it("a won fight is an escape whoever ended it", () => {
    expect(chainMarchOutcome({ won: true, byDm: true })).toBe("escaped")
  })
})

describe("Malachar's last word", () => {
  it("is one of the three lines, and the same one for the same record", () => {
    const a = chainMarchLostLine("c-abc")
    expect(CHAIN_MARCH_LINES.lost).toContain(a)
    expect(chainMarchLostLine("c-abc")).toBe(a)
  })
  it("has a line for a record with no seq", () => {
    expect(CHAIN_MARCH_LINES.lost).toContain(chainMarchLostLine(undefined))
  })
})

describe("it stands on things that exist", () => {
  const spec = JSON.parse(read("scripts/velkynvelve-walk/spec.json"))
  const page = read("public/velkynvelve-walk/index.html")

  it("the plate is a painted road plate with floor and a place to arrive", () => {
    const p = spec[CHAIN_MARCH.plate]
    expect(p).toBeTruthy()
    expect(p.floors.length).toBeGreaterThan(0)
    expect(p.arrive).toHaveLength(2)
  })
  it("the plate has a way off it, so a hero can run", () => {
    const leaves = spec[CHAIN_MARCH.plate].zones.filter((z: { kind?: string }) => z.kind === "leave")
    expect(leaves.length).toBeGreaterThan(0)
  })
  it("every escort figure has a stat block on the map", () => {
    const at = page.indexOf("const FOE_BLOCKS = {")
    expect(at).toBeGreaterThan(-1)
    const blocks = page.slice(at, at + 60000)
    for (const id of CHAIN_MARCH_GUARDS) expect(blocks).toContain(`"${id}"`)
  })
  it("the road a party escapes onto is a hand-off the travel map knows, and it leads to Menzoberranzan", () => {
    const h = WALK_HANDOFFS[CHAIN_MARCH.via as keyof typeof WALK_HANDOFFS]
    expect(h).toBeTruthy()
    expect(h.biome).toBe(CHAIN_MARCH.biome)
    expect(h.roads).toContain("menzoberranzan")
    expect(chainMarchMapHref()).toBe("/map?from=velkynvelve&via=north&plate=tunnels")
  })
})

describe("the map carries the same rules", () => {
  const page = read("public/velkynvelve-walk/index.html")
  const template = read("scripts/velkynvelve-walk/template.html")

  it("the rules are pasted into the built page, not copied by hand", () => {
    expect(template).toContain("/*__CHAIN_MARCH__*/")
    expect(page).not.toContain("/*__CHAIN_MARCH__*/")
    expect(page).toContain("function chainMarchOutcome(")
    expect(page).toContain(CHAIN_MARCH_LINES.bridge)
  })
  it("the clock running out begins the march instead of only telling Malachar", () => {
    expect(page).toContain("chainMarchDue(caravanLeft(), penHeld(), state.chainMarch)")
  })
  it("a lost march is a GAME OVER with its own line, and no grave", () => {
    expect(page).toContain("G.line || gameOverLine(G.seq)")
    expect(page).toContain('why: "menzoberranzan"')
  })
  it("the DM's End combat button is told apart from a lost fight", () => {
    expect(page).toContain("endCombat(false, {byDm: true})")
  })
})
