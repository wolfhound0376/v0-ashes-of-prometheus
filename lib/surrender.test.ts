import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { SURRENDER_RULES, SURRENDER_PRISONERS, SURRENDER_LINES, surrenderVictim, surrenderRoll, surrenderBeating, surrenderSummary } from "./surrender.mjs"
import { SURGEON_VICTIMS } from "./drow-surgeon.mjs"

// a scripted die: each call returns the next value, as the fraction that lands an n-sided die on `face`
const dice = (...faces: [number, number][]) => {
  const q = [...faces]
  return () => { const [face, sides] = q.shift()!; return (face - 0.5) / sides }
}

describe("the prisoners who can be thrown", () => {
  it("are the Drow Surgeon's eight, same ids and names, so the two tables cannot drift apart", () => {
    expect(SURRENDER_PRISONERS.map((p) => p.id)).toEqual(SURGEON_VICTIMS.map((v) => v.id))
    expect(SURRENDER_PRISONERS.map((p) => p.name)).toEqual(SURGEON_VICTIMS.map((v) => v.name))
    expect(SURRENDER_PRISONERS.map((p) => p.id)).not.toContain("topsy")
  })
})

describe("surrenderVictim", () => {
  it("takes one of the prisoners who ran with the party, chosen evenly, in the table's order", () => {
    const v = surrenderVictim(["ront", "eldeth", "stool"], [], dice([2, 3]))
    expect(v).toMatchObject({ id: "ront", name: "Ront", roll: 2, of: 3, from: "party" })
    expect(surrenderVictim(["stool", "ront", "eldeth"], [], dice([1, 3]))?.id).toBe("eldeth")   // the caller's order does not matter
  })
  it("skips a prisoner already dead or gone", () => {
    const v = surrenderVictim(["ront", "eldeth"], ["ront"], dice([1, 1]))
    expect(v).toMatchObject({ id: "eldeth", of: 1 })
  })
  it("falls back to the pen's own prisoners when nobody ran with the party", () => {
    const v = surrenderVictim([], ["buppido"], dice([1, 7]))
    expect(v).toMatchObject({ id: "eldeth", of: 7, from: "pen" })
  })
  it("ignores ids that are not prisoners (a hero, a guard) and is null when nobody is left", () => {
    expect(surrenderVictim(["kenta", "drow-guard-male"], SURRENDER_PRISONERS.map((p) => p.id))).toBeNull()
    expect(surrenderVictim(["kenta"], [], dice([3, 8]))?.id).toBe("jimjar")
  })
  it("never lands past the end of the pool, whatever the die says", () => {
    expect(surrenderVictim(["ront"], [], () => 0.999999)?.id).toBe("ront")
  })
})

describe("the beating", () => {
  it("is the SRD improvised weapon's 1d4", () => {
    expect(SURRENDER_RULES.beating).toBe("1d4")
    expect(surrenderRoll("1d4", dice([3, 4]))).toEqual({ total: 3, rolls: [3] })
  })
  it("takes the roll off the hero's hit points", () => {
    expect(surrenderBeating(9, dice([3, 4]))).toEqual({ skipped: false, rolls: [3], dmg: 3, hpAfter: 6 })
  })
  it("never drops a hero below 1 HP", () => {
    expect(surrenderBeating(2, dice([4, 4]))).toEqual({ skipped: false, rolls: [4], dmg: 1, hpAfter: 1 })
    expect(surrenderBeating(1, dice([4, 4]))).toEqual({ skipped: false, rolls: [4], dmg: 0, hpAfter: 1 })
  })
  it("leaves a hero who is already down where they lie", () => {
    expect(surrenderBeating(0)).toEqual({ skipped: true, rolls: [], dmg: 0, hpAfter: 0 })
    expect(surrenderBeating(-3)).toEqual({ skipped: true, rolls: [], dmg: 0, hpAfter: 0 })
  })
})

describe("the line for Malachar", () => {
  it("names the place, the beating, the victim and the captive stance", () => {
    const s = surrenderSummary("Guard Tower", { id: "ront", name: "Ront" }, [{ name: "Kenta", dmg: 3, skipped: false }, { name: "Fifi", dmg: 0, skipped: true }])
    expect(s).toContain("surrendered to the guards in Guard Tower")
    expect(s).toContain("Kenta 3")
    expect(s).not.toContain("Fifi")
    expect(s).toContain("threw Ront into the chasm")
    expect(s).toContain("CAPTIVE")
  })
  it("says so when nobody was left to throw", () => {
    expect(surrenderSummary("the pen", null, [])).toContain("no prisoner left")
  })
})

describe("the paste into the painted map", () => {
  it("has a placeholder in the walk template and lines the page speaks", () => {
    const t = readFileSync("scripts/velkynvelve-walk/template.html", "utf8")
    expect(t).toContain("/*__SURRENDER__*/")
    for (const k of Object.keys(SURRENDER_LINES)) expect(t).toContain(`SURRENDER_LINES.${k}`)
  })
})
