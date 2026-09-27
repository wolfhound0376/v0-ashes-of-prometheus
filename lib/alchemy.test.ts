import { describe, expect, it } from "vitest"
import {
  HOUSE_RULES,
  RECIPES,
  brew,
  canBrew,
  experiment,
  harvestPoison,
  materialsGp,
  rawMaterialWeightLb,
  recipeFor,
  type ReagentRow,
} from "./alchemy"

const fifi = { name: "Fifi", tools: ["Alchemist's Supplies", "Thieves' Tools"], proficiencyBonus: 2 }
const herbalist = { name: "Sarith", tools: ["Herbalism Kit"], proficiencyBonus: 2 }
const poisoner = { name: "Jimjar", tools: ["Poisoner's Kit"], proficiencyBonus: 2 }
// Reagents carry no price (Sam, 2026-09-27): value is 0, as the catalog has it.
const r = (slug: string, qty: number): ReagentRow => ({ slug, qty, value: 0 })
const pack = (): ReagentRow[] => [
  r("fire-lichen", 3),
  r("ormu-moss", 3),
  r("waterorb", 2),
  r("nightlight-fungus", 1),
  r("ripplebark", 1),
  r("lamp-oil", 1),
  r("spider-venom-gland", 1),
]
const resting = { longRest: true }

describe("recipes", () => {
  it("prices materials at half value (SRD) for the coin path", () => {
    expect(materialsGp(recipeFor("alchemists-fire")!)).toBe(25)
    expect(materialsGp(recipeFor("potion-of-healing")!)).toBe(12.5)
  })
  it("carries the XGE healing table", () => {
    expect(recipeFor("potion-of-greater-healing")).toMatchObject({ value: 100, days: 5 })
    expect(recipeFor("potion-of-supreme-healing")).toMatchObject({ value: 10000, days: 20 })
  })
  it("every recipe names its source", () => {
    for (const x of RECIPES) expect(x.source.length).toBeGreaterThan(3)
  })
  it("the common recipes name their reagents (Sam's ruling)", () => {
    for (const slug of ["potion-of-healing", "antitoxin", "acid-vial", "alchemists-fire", "basic-poison-vial", "drow-poison", "truth-serum"]) {
      expect(recipeFor(slug)!.reagents?.length).toBeGreaterThan(0)
    }
  })
})

describe("canBrew", () => {
  it("refuses without the tool proficiency", () => {
    const c = canBrew(recipeFor("potion-of-healing")!, fifi, pack(), resting)
    expect(c.ok).toBe(false)
    expect(c.reason).toMatch(/not proficient with Herbalism Kit/)
  })
  it("having the named reagents is enough — no gold needed", () => {
    const c = canBrew(recipeFor("potion-of-healing")!, herbalist, pack(), { longRest: false })
    expect(c.ok).toBe(true)
    expect(c.availableGp).toBe(0)
  })
  it("antitoxin accepts either kit", () => {
    expect(canBrew(recipeFor("antitoxin")!, fifi, pack(), resting).ok).toBe(true)
    expect(canBrew(recipeFor("antitoxin")!, herbalist, pack(), resting).ok).toBe(true)
  })
  it("names the missing reagent", () => {
    expect(canBrew(recipeFor("alchemists-fire")!, fifi, [r("fire-lichen", 1), r("lamp-oil", 1)], resting).reason).toMatch(/short of fire-lichen — 1\/2/)
    expect(canBrew(recipeFor("acid-vial")!, fifi, pack(), resting).reason).toMatch(/short of gray-ooze-residue — 0\/1/)
  })
  it("XGE one-dose items need a long rest and one dose only", () => {
    const x = recipeFor("alchemists-fire")!
    expect(canBrew(x, fifi, pack(), { longRest: false }).reason).toMatch(/long rest/)
    expect(canBrew(x, fifi, pack(), { longRest: true, doseUsedThisRest: true }).reason).toMatch(/one dose/)
    const ok = canBrew(x, fifi, pack(), resting)
    expect(ok.ok).toBe(true)
    expect(ok.days).toBe(0)
    expect(ok.check).toBeNull()
  })
  it("a recipe with no reagent list costs coin (XGE as written)", () => {
    const soap = recipeFor("perfume")!
    expect(soap.reagents).toBeUndefined()
    expect(canBrew(soap, fifi, pack(), resting).reason).toMatch(/2\.5 gp of raw materials in coin/)
    expect(canBrew(soap, fifi, pack(), { longRest: true, rawMaterialsGp: 3 }).ok).toBe(true)
  })
  it("downtime recipes take the book's days, doubled with improvised tools", () => {
    const x = recipeFor("potion-of-healing")!
    expect(canBrew(x, herbalist, pack(), resting).days).toBe(1)
    expect(canBrew(x, herbalist, pack(), { longRest: false, improvisedTools: true }).days).toBe(2)
    expect(canBrew(recipeFor("basic-poison-vial")!, poisoner, pack(), resting).days).toBe(20)
  })
  it("proficient but not carrying the kit", () => {
    const c = canBrew(recipeFor("acid-vial")!, { ...fifi, carrying: ["Thieves' Tools"] }, pack(), resting)
    expect(c.reason).toMatch(/not carrying/)
  })
})

describe("brew", () => {
  it("consumes exactly the named reagents and nothing else, with no roll", () => {
    const res = brew(recipeFor("alchemists-fire")!, fifi, pack(), resting)
    expect(res.produced).toEqual({ slug: "alchemists-fire", qty: 1 })
    expect(res.roll).toBeNull()
    expect(res.spent).toEqual([r("fire-lichen", 2), r("lamp-oil", 1)])
    expect(res.spentGp).toBe(0)
    expect(res.pack.find((p) => p.slug === "fire-lichen")?.qty).toBe(1)
    expect(res.pack.find((p) => p.slug === "lamp-oil")).toBeUndefined()
    expect(res.pack.find((p) => p.slug === "ormu-moss")?.qty).toBe(3)
  })
  it("a coin recipe spends gp, not reagents", () => {
    const res = brew(recipeFor("perfume")!, fifi, pack(), { longRest: true, rawMaterialsGp: 5 })
    expect(res.produced).toEqual({ slug: "perfume", qty: 1 })
    expect(res.spent).toEqual([])
    expect(res.spentGp).toBe(2.5)
    expect(res.pack).toEqual(pack())
  })
  it("refusal spends nothing", () => {
    const res = brew(recipeFor("potion-of-healing")!, fifi, pack(), resting)
    expect(res.produced).toBeNull()
    expect(res.pack).toEqual(pack())
  })
  it("house-rule check uses the rng and can fail (reagents still spent)", () => {
    HOUSE_RULES.brewCheck = true
    try {
      const bad = brew(recipeFor("alchemists-fire")!, fifi, pack(), resting, () => 0)
      expect(bad.roll).toMatchObject({ d20: 1, total: 3, success: false })
      expect(bad.produced).toBeNull()
      expect(bad.spent.length).toBeGreaterThan(0)
      const good = brew(recipeFor("alchemists-fire")!, fifi, pack(), resting, () => 0.99)
      expect(good.roll?.success).toBe(true)
    } finally {
      HOUSE_RULES.brewCheck = false
    }
  })
})

describe("harvestPoison (DMG p.258)", () => {
  it("DC 20; failing by 5+ exposes", () => {
    const b = { ...poisoner, natureBonus: 1 }
    expect(harvestPoison(b, "giant spider", () => 0.99).success).toBe(true) // 20+2
    const fail = harvestPoison(b, "giant spider", () => 0.6) // d20 13 + 2 = 15 → failed by 5
    expect(fail.success).toBe(false)
    expect(fail.exposed).toBe(true)
    const near = harvestPoison(b, "giant spider", () => 0.8) // 17+2=19
    expect(near.exposed).toBe(false)
  })
})

it("raw materials weigh 1 lb per 50 gp", () => {
  expect(rawMaterialWeightLb(125)).toBe(2.5)
})

it("experiment hands off to the DM", () => {
  const e = experiment(fifi, [r("bluecap", 1)])
  expect(e.ok).toBe(false)
  expect(e.handoff).toMatch(/DM rules the result/)
})
