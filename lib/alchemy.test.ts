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
const pack = (): ReagentRow[] => [
  { slug: "fire-lichen", qty: 3, value: 5 },
  { slug: "ormu-moss", qty: 2, value: 10 },
  { slug: "waterorb", qty: 1, value: 15 },
]
const resting = { longRest: true }

describe("recipes", () => {
  it("prices materials at half value (SRD)", () => {
    expect(materialsGp(recipeFor("alchemists-fire")!)).toBe(25)
    expect(materialsGp(recipeFor("potion-of-healing")!)).toBe(12.5)
  })
  it("carries the XGE healing table", () => {
    expect(recipeFor("potion-of-greater-healing")).toMatchObject({ value: 100, days: 5 })
    expect(recipeFor("potion-of-supreme-healing")).toMatchObject({ value: 10000, days: 20 })
  })
  it("every recipe names its source", () => {
    for (const r of RECIPES) expect(r.source.length).toBeGreaterThan(3)
  })
})

describe("canBrew", () => {
  it("refuses without the tool proficiency", () => {
    const c = canBrew(recipeFor("potion-of-healing")!, fifi, pack(), resting)
    expect(c.ok).toBe(false)
    expect(c.reason).toMatch(/not proficient with Herbalism Kit/)
  })
  it("antitoxin accepts either kit", () => {
    expect(canBrew(recipeFor("antitoxin")!, fifi, pack(), resting).ok).toBe(true)
    expect(canBrew(recipeFor("antitoxin")!, herbalist, pack(), resting).ok).toBe(true)
  })
  it("XGE one-dose items need a long rest and one dose only", () => {
    const r = recipeFor("alchemists-fire")!
    expect(canBrew(r, fifi, pack(), { longRest: false }).reason).toMatch(/long rest/)
    expect(canBrew(r, fifi, pack(), { longRest: true, doseUsedThisRest: true }).reason).toMatch(/one dose/)
    const ok = canBrew(r, fifi, pack(), resting)
    expect(ok.ok).toBe(true)
    expect(ok.days).toBe(0)
    expect(ok.check).toBeNull()
  })
  it("counts reagent value plus loose gp toward raw materials", () => {
    const r = recipeFor("alchemists-fire")! // 25 gp of materials
    expect(canBrew(r, fifi, [{ slug: "fire-lichen", qty: 1, value: 5 }], resting).reason).toMatch(/needs 25 gp/)
    expect(canBrew(r, fifi, [{ slug: "fire-lichen", qty: 1, value: 5 }], { longRest: true, rawMaterialsGp: 20 }).ok).toBe(true)
  })
  it("requires named reagents when the recipe lists them", () => {
    const r = { ...recipeFor("alchemists-fire")!, reagents: [{ slug: "lamp-oil", qty: 1 }] }
    expect(canBrew(r, fifi, pack(), resting).reason).toMatch(/short of lamp-oil — 0\/1/)
  })
  it("downtime recipes take the book's days, doubled with improvised tools", () => {
    const r = recipeFor("potion-of-healing")!
    expect(canBrew(r, herbalist, pack(), resting).days).toBe(1)
    expect(canBrew(r, herbalist, pack(), { longRest: false, improvisedTools: true }).days).toBe(2)
    expect(canBrew(recipeFor("basic-poison-vial")!, poisoner, [{ slug: "spider-venom-gland", qty: 2, value: 30 }], resting).days).toBe(20)
  })
  it("proficient but not carrying the kit", () => {
    const c = canBrew(recipeFor("acid-vial")!, { ...fifi, carrying: ["Thieves' Tools"] }, pack(), resting)
    expect(c.reason).toMatch(/not carrying/)
  })
})

describe("brew", () => {
  it("spends cheapest reagents first and makes one product with no roll", () => {
    const res = brew(recipeFor("alchemists-fire")!, fifi, pack(), resting)
    expect(res.produced).toEqual({ slug: "alchemists-fire", qty: 1 })
    expect(res.roll).toBeNull()
    expect(res.spent).toEqual([{ slug: "fire-lichen", qty: 3, value: 5 }, { slug: "ormu-moss", qty: 1, value: 10 }])
    expect(res.pack).toEqual([{ slug: "ormu-moss", qty: 1, value: 10 }, { slug: "waterorb", qty: 1, value: 15 }])
    expect(res.spentGp).toBe(0)
  })
  it("named reagents are taken first", () => {
    const r = { ...recipeFor("antitoxin")!, reagents: [{ slug: "waterorb", qty: 1 }] }
    const res = brew(r, fifi, pack(), resting)
    expect(res.spent[0]).toEqual({ slug: "waterorb", qty: 1, value: 15 })
  })
  it("refusal spends nothing", () => {
    const res = brew(recipeFor("potion-of-healing")!, fifi, pack(), resting)
    expect(res.produced).toBeNull()
    expect(res.pack).toEqual(pack())
  })
  it("house-rule check uses the rng and can fail", () => {
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
  const e = experiment(fifi, [{ slug: "bluecap", qty: 1, value: 2 }])
  expect(e.ok).toBe(false)
  expect(e.handoff).toMatch(/DM rules the result/)
})
