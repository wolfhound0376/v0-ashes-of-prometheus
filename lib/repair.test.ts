import { describe, expect, it } from "vitest"
import {
  CONDITIONS,
  DEGRADE_CAUSES,
  MASTERCRAFT_HISTORY_REQUIRED,
  NEGLECT_LONG_RESTS,
  REPAIR_STEP,
  canMend,
  cleanSlugFor,
  conditionEffect,
  conditionOf,
  breaksOnNat1,
  degrade,
  hasTool,
  maintain,
  neglectDue,
  planUpgrade,
  repairMaterialsGp,
  repairSpec,
  repairToPristineGp,
  repairToolFor,
  rung,
  salvage,
  startingCondition,
  upgradeSlots,
} from "./repair"

const smith = { name: "Eldeth", tools: ["Smith's Tools"] }
const kenta = { name: "Kenta", tools: [] as string[] }

const longsword = { name: "Longsword", slug: "longsword", item_type: "weapon", rarity: "common", value: 15, weight: 3 }
const magicBlade = { name: "Dawnbringer", slug: "dawnbringer", item_type: "weapon", rarity: "rare", value: 5000, weight: 3 }
const plate = { name: "Plate", slug: "plate", item_type: "armor", rarity: "common", value: 1500, weight: 65 }

describe("the ladder", () => {
  it("has five rungs in order, worst last", () => {
    expect(CONDITIONS).toEqual(["pristine", "worn", "damaged", "broken", "destroyed"])
    expect(rung("pristine")).toBeLessThan(rung("worn"))
    expect(rung("broken")).toBeLessThan(rung("destroyed"))
  })

  it("worn carries NO mechanical penalty — it is the warning light, not a tax", () => {
    const e = conditionEffect("worn", "weapon")
    expect(e.attack).toBe(0)
    expect(e.damage).toBe(0)
    expect(e.ac).toBe(0)
    expect(e.disadvantage).toBe(false)
    expect(e.unusable).toBe(false)
    expect(e.valueMultiplier).toBeLessThan(1)
  })

  it("damaged is exactly what the seven hand-written rusted-* rows already say", () => {
    const e = conditionEffect("damaged", "weapon")
    expect(e.attack).toBe(-1)
    expect(e.damage).toBe(-1)
  })

  it("damaged reads differently for armour and for tools", () => {
    expect(conditionEffect("damaged", "armor").ac).toBe(-1)
    expect(conditionEffect("damaged", "tool").disadvantage).toBe(true)
    expect(conditionEffect("damaged", "tool").attack).toBe(0)
  })

  it("broken is unusable but still on the sheet; only destroyed is worth nothing", () => {
    expect(conditionEffect("broken", "weapon").unusable).toBe(true)
    expect(conditionEffect("broken", "weapon").valueMultiplier).toBeGreaterThan(0)
    expect(conditionEffect("destroyed", "weapon").valueMultiplier).toBe(0)
  })

  it("an item with no stored condition is pristine — every item in play today", () => {
    expect(conditionOf(null)).toBe("pristine")
    expect(conditionOf({ condition: null })).toBe("pristine")
    expect(conditionOf({ condition: "nonsense" })).toBe("pristine")
    expect(conditionOf({ condition: "broken" })).toBe("broken")
  })
})

describe("degradation is event-driven and the cause list is closed", () => {
  it("takes exactly one rung, for a cause on the list", () => {
    const r = degrade(longsword, "pristine", "hazard")
    expect(r.ok).toBe(true)
    expect(r.to).toBe("worn")
  })

  it("refuses a cause that is not on the list", () => {
    // @ts-expect-error — the point of the test is the runtime guard
    const r = degrade(longsword, "pristine", "swung it a lot")
    expect(r.ok).toBe(false)
    expect(r.to).toBe("pristine")
  })

  it("every listed cause is a real one and nothing else is", () => {
    expect(DEGRADE_CAUSES).toContain("nat1")
    expect(DEGRADE_CAUSES).toContain("neglect")
    expect(DEGRADE_CAUSES).not.toContain("attack")
  })

  it("neglect never takes a blade past damaged — it does not shatter in the scabbard", () => {
    expect(degrade(longsword, "worn", "neglect").to).toBe("damaged")
    const past = degrade(longsword, "damaged", "neglect")
    expect(past.ok).toBe(false)
    expect(past.to).toBe("damaged")
  })

  it("a hazard CAN take it past damaged, where neglect cannot", () => {
    expect(degrade(longsword, "damaged", "hazard").to).toBe("broken")
    expect(degrade(longsword, "broken", "hazard").to).toBe("destroyed")
  })

  it("destroyed is the floor", () => {
    expect(degrade(longsword, "destroyed", "hazard").ok).toBe(false)
  })

  it("the nat-1 rule fires on the live catalog flag or on an already-damaged weapon", () => {
    const rusted = { properties: { breaks_on_nat_1: true } }
    expect(breaksOnNat1(rusted, "pristine")).toBe(true)
    expect(breaksOnNat1({ properties: {} }, "pristine")).toBe(false)
    expect(breaksOnNat1({ properties: {} }, "damaged")).toBe(true)
  })
})

describe("maintain — free, and the reason the whetstone exists", () => {
  it("lifts worn to pristine with the right tool, no roll and no materials", () => {
    const m = maintain(longsword, "worn", smith, "Smith's Tools")
    expect(m.ok).toBe(true)
    expect(m.to).toBe("pristine")
    expect(m.clockReset).toBe(true)
  })

  it("refuses without proficiency", () => {
    expect(maintain(longsword, "worn", kenta, "Smith's Tools").ok).toBe(false)
  })

  it("cannot fix damaged — that is a repair", () => {
    const m = maintain(longsword, "damaged", smith, "Smith's Tools")
    expect(m.ok).toBe(false)
    expect(m.reason).toContain("repair")
  })

  it("resets the clock on a pristine item without needing a tool", () => {
    const m = maintain(longsword, "pristine", kenta, null)
    expect(m.ok).toBe(true)
    expect(m.clockReset).toBe(true)
  })

  it("matches tool names the way lib/camp does", () => {
    expect(hasTool(["smiths tools"], "Smith's Tools")).toBe(true)
    expect(hasTool(["Thieves' Tools"], "Smith's Tools")).toBe(false)
  })
})

describe("neglect fires at exactly seven long rests", () => {
  const eq = { condition: "pristine" as const, equipped: true }

  it("not at six, yes at seven", () => {
    expect(neglectDue({ ...eq, longRestsSinceMaintained: NEGLECT_LONG_RESTS - 1 })).toBe(false)
    expect(neglectDue({ ...eq, longRestsSinceMaintained: NEGLECT_LONG_RESTS })).toBe(true)
  })

  it("only for equipped gear", () => {
    expect(neglectDue({ ...eq, equipped: false, longRestsSinceMaintained: 99 })).toBe(false)
  })

  it("never past damaged, and never for mastercraft — that is mastercraft's whole benefit", () => {
    expect(neglectDue({ ...eq, condition: "damaged", longRestsSinceMaintained: 99 })).toBe(false)
    expect(neglectDue({ ...eq, mastercraft: true, longRestsSinceMaintained: 99 })).toBe(false)
  })

  it("treats a missing count as zero rather than throwing", () => {
    expect(neglectDue({ ...eq, longRestsSinceMaintained: null })).toBe(false)
  })
})

describe("mend — the cantrip, scoped to what the SRD actually says", () => {
  it("lifts broken to damaged for a small item, and never restores magic", () => {
    const m = canMend({ ...longsword, weight: 3 }, "broken")
    expect(m.ok).toBe(true)
    expect(m.to).toBe("damaged")
    expect(m.flags.join(" ")).toMatch(/never the magic/i)
  })

  it("refuses a suit of armour — not a one-foot tear", () => {
    expect(canMend(plate, "broken").ok).toBe(false)
  })

  it("refuses anything heavier than the one-foot break allows", () => {
    expect(canMend({ name: "Greatsword", item_type: "weapon", weight: 6 }, "broken").ok).toBe(false)
  })

  it("cannot be spammed up the ladder, and cannot touch destroyed", () => {
    expect(canMend(longsword, "damaged").ok).toBe(false)
    expect(canMend(longsword, "destroyed").ok).toBe(false)
  })

  it("falls back to item_type when the row has no weight, and says so", () => {
    const m = canMend({ name: "Signet Ring", item_type: "accessory", weight: null }, "broken")
    expect(m.ok).toBe(true)
    expect(m.flags.join(" ")).toMatch(/no weight/i)
  })
})

describe("repair — one rung per project, on the crafting loop", () => {
  it("damaged climbs to worn; broken climbs to damaged", () => {
    expect(REPAIR_STEP.damaged.to).toBe("worn")
    expect(REPAIR_STEP.broken.to).toBe("damaged")
  })

  it("broken is harder than damaged by exactly three", () => {
    const d = repairSpec(longsword, "damaged").spec
    const b = repairSpec(longsword, "broken").spec
    expect(b!.dc - d!.dc).toBe(3)
  })

  it("reads DC and hours off the rarity table crafting already uses", () => {
    const rare = repairSpec(magicBlade, "damaged").spec
    const common = repairSpec(longsword, "damaged").spec
    expect(rare!.dc).toBeGreaterThan(common!.dc)
    expect(rare!.checks).toBe(rare!.hours)
  })

  it("refuses worn and pristine — maintenance is not a repair and costs nothing", () => {
    expect(repairSpec(longsword, "worn").spec).toBeNull()
    expect(repairSpec(longsword, "worn").reason).toMatch(/costs nothing/)
    expect(repairSpec(longsword, "pristine").spec).toBeNull()
  })

  it("refuses destroyed and points at salvage", () => {
    expect(repairSpec(longsword, "destroyed").reason).toMatch(/salvage/i)
  })

  it("flags that mundane repair leaves a magic item's enchantment dormant", () => {
    const s = repairSpec(magicBlade, "broken").spec
    expect(s!.flags.join(" ")).toMatch(/never the enchantment/i)
  })

  it("will not guess a tool for armour, because the row carries no material", () => {
    const t = repairToolFor(plate)
    expect(t.tool).toBeNull()
    expect(t.reason).toMatch(/properties\.repair\.tools/)
    expect(repairSpec(plate, "broken").spec).toBeNull()
  })

  it("assumes a weapon is metal but says out loud that it assumed", () => {
    const t = repairToolFor(longsword)
    expect(t.tool).toBe("Smith's Tools")
    expect(t.flags.join(" ")).toMatch(/assumed metal/i)
  })

  it("lets the catalog override the guess, the DC, and the cost", () => {
    const item = {
      ...plate,
      properties: { repair: { tools: "Leatherworker's Tools", dc: 9, cost_gp: 7 } },
    }
    const s = repairSpec(item, "broken").spec
    expect(s!.tool).toBe("Leatherworker's Tools")
    expect(s!.dc).toBe(9)
    expect(s!.materialsGp).toBe(7)
  })

  it("refuses when the catalog asks for a facility the camp does not have", () => {
    const item = { ...longsword, properties: { repair: { tools: "Smith's Tools", requires: "forge" } } }
    expect(repairSpec(item, "broken", { facilities: [] }).spec).toBeNull()
    expect(repairSpec(item, "broken", { facilities: ["forge"] }).spec).not.toBeNull()
  })

  it("materials are a quarter at damaged and a half at broken", () => {
    expect(repairMaterialsGp(1000, "damaged")).toBe(250)
    expect(repairMaterialsGp(1000, "broken")).toBe(500)
  })

  it("broken to pristine lands at 75% of market value — the property the economics rest on", () => {
    expect(repairToPristineGp(1000, "broken")).toBe(750)
    expect(repairToPristineGp(1000, "damaged")).toBe(250)
    expect(repairToPristineGp(1000, "worn")).toBe(0)
  })

  it("so a cheap item is not worth repairing and a precious one always is", () => {
    const cheap = repairToPristineGp(longsword.value, "broken")
    expect(cheap).toBeLessThan(longsword.value)
    expect(repairToPristineGp(magicBlade.value, "broken")).toBeLessThan(magicBlade.value)
    expect(cheap).toBeGreaterThan(longsword.value * 0.7)
  })
})

describe("the rusted weapons become real swords", () => {
  it("a rusted row starts damaged, which is what its rusted_rule already says", () => {
    expect(startingCondition({ slug: "rusted-longsword" })).toBe("damaged")
    expect(startingCondition({ slug: "longsword" })).toBe("pristine")
    expect(startingCondition({ slug: "x", properties: { rusted: true } })).toBe("damaged")
  })

  it("repairing past damaged swaps the instance to the clean catalog row", () => {
    expect(cleanSlugFor("rusted-longsword")).toBe("longsword")
    expect(cleanSlugFor("rusted-war-pick")).toBe("war-pick")
    expect(cleanSlugFor("longsword")).toBeNull()
    expect(cleanSlugFor("rusted-")).toBeNull()
    expect(cleanSlugFor(null)).toBeNull()
  })
})

describe("upgrade — catalog-validated, never invented", () => {
  const clean = { name: "Longsword", rarity: "common" as const, condition: "pristine" as const }

  it("caps slots by rarity", () => {
    expect(upgradeSlots("common")).toBe(1)
    expect(upgradeSlots("rare")).toBe(2)
    expect(upgradeSlots("legendary")).toBe(3)
    expect(upgradeSlots(null)).toBe(1)
    expect(upgradeSlots("very rare")).toBe(3)
  })

  it("refuses a material that carries no fitting or rune_material property", () => {
    const r = planUpgrade({
      item: clean, upgrades: [], kind: "fitting",
      material: { slug: "rock", name: "A Rock", properties: {} },
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/will not invent/i)
  })

  it("takes the effect from the material's own row", () => {
    const r = planUpgrade({
      item: clean, upgrades: [], kind: "fitting",
      material: { slug: "silvered-edge", name: "Silvered Edge", properties: { fitting: "Counts as silvered." } },
    })
    expect(r.ok).toBe(true)
    expect(r.note).toContain("Counts as silvered.")
  })

  it("refuses once the slots are full", () => {
    const r = planUpgrade({
      item: clean,
      upgrades: [{ slug: "silvered-edge", kind: "fitting", effect: "x" }],
      kind: "fitting",
      material: { slug: "adamantine", name: "Adamantine Banding", properties: { fitting: "y" } },
    })
    expect(r.ok).toBe(false)
    expect(r.slotsUsed).toBe(1)
    expect(r.slotsTotal).toBe(1)
  })

  it("refuses to improve a damaged item — repair it first", () => {
    const r = planUpgrade({
      item: { ...clean, condition: "damaged" }, upgrades: [], kind: "fitting",
      material: { slug: "s", name: "S", properties: { fitting: "y" } },
    })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/repair it/i)
  })

  it("mastercraft is earned by history, not bought", () => {
    const short = planUpgrade({ item: clean, upgrades: [], kind: "mastercraft", history: MASTERCRAFT_HISTORY_REQUIRED - 1 })
    expect(short.ok).toBe(false)
    const earned = planUpgrade({ item: clean, upgrades: [], kind: "mastercraft", history: MASTERCRAFT_HISTORY_REQUIRED })
    expect(earned.ok).toBe(true)
    expect(earned.dc).toBeGreaterThan(0)
  })

  it("mastercraft is not a combat bonus", () => {
    const r = planUpgrade({ item: clean, upgrades: [], kind: "mastercraft", history: 5 })
    expect(r.note).toMatch(/not a combat bonus/i)
    expect(r.note).not.toMatch(/\+1 to hit/i)
  })
})

describe("salvage", () => {
  it("only works on destroyed", () => {
    expect(salvage(longsword, "broken").ok).toBe(false)
    expect(salvage(longsword, "destroyed").ok).toBe(true)
  })

  it("returns the craft materials when the row has them", () => {
    const item = { name: "Dagger", value: 2, properties: { craft: { materials: [{ slug: "iron", qty: 1 }] } } }
    const s = salvage(item, "destroyed")
    expect(s.materials).toEqual([{ slug: "iron", qty: 1 }])
    expect(s.scrapGp).toBe(0)
  })

  it("falls back to a tenth of value as scrap", () => {
    expect(salvage({ name: "Longsword", value: 150 }, "destroyed").scrapGp).toBe(15)
  })
})
