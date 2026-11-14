import { describe, expect, it } from "vitest"
import {
  ASKERS, GOLD_DEBT, NO_STANDING, PALLIATION, addressFor, applyDeltas, askLine, askOutcome, askerFor, chooseAsk,
  isImportant, replyLine, theftNote, theftOutcome, THEFT_OUTCOMES, type Standing,
} from "./npc-asks"

const st = (p: Partial<Standing>): Standing => ({ ...NO_STANDING, ...p })
const fifi = { name: "Fifi of Waterdeep", species: "Human", cls: "Rogue" }
const scott = { name: "Scott Reedwind of Luskan", species: "Half-Elf", cls: "Bard" }
const lynkes = { name: "Lynkes", species: "Halfling", cls: "Rogue" }
const dwarf = { name: "Borin", species: "Dwarf", cls: "Fighter" }

describe("what they call you (Sam: shorty / Fifi / dwarf / Bard / Scott)", () => {
  it("a stranger is what the NPC can see", () => {
    expect(addressFor({ temper: "gruff", knowsName: false, standing: NO_STANDING, hero: dwarf })).toBe("dwarf")
  })
  it("a bully calls the small folk shorty, and nobody else", () => {
    expect(addressFor({ temper: "bully", knowsName: false, standing: NO_STANDING, hero: lynkes })).toBe("shorty")
    expect(addressFor({ temper: "bully", knowsName: false, standing: NO_STANDING, hero: fifi })).toBe("human")
    expect(addressFor({ temper: "gruff", knowsName: false, standing: NO_STANDING, hero: lynkes })).toBe("halfling")
  })
  it("never the name before it is known, however warm", () => {
    const a = addressFor({ temper: "gruff", knowsName: false, standing: st({ affection: 40, trust: 40 }), hero: scott })
    expect(a).toBe("Bard")
    expect(a).not.toContain("Scott")
  })
  it("the first name once it is known", () => {
    expect(addressFor({ temper: "gruff", knowsName: true, standing: NO_STANDING, hero: fifi })).toBe("Fifi")
    expect(addressFor({ temper: "wheedling", knowsName: true, standing: NO_STANDING, hero: scott })).toBe("Scott")
  })
  it("a bully uses the name only once warm", () => {
    expect(addressFor({ temper: "bully", knowsName: true, standing: NO_STANDING, hero: lynkes })).toBe("shorty")
    expect(addressFor({ temper: "bully", knowsName: true, standing: st({ respect: 20 }), hero: lynkes })).toBe("Lynkes")
  })
  it("a soured NPC drops the name", () => {
    expect(addressFor({ temper: "gruff", knowsName: true, standing: st({ resentment: 30 }), hero: lynkes })).toBe("shorty")
    expect(addressFor({ temper: "courtly", knowsName: true, standing: st({ resentment: 30 }), hero: fifi })).toBe("human")
  })
})

describe("which ask", () => {
  const food = { kind: "food" as const, itemName: "Sporebread Loaf" }
  const blade = { kind: "weapon" as const, itemName: "Dagger" }
  const coin = { kind: "gold" as const, itemName: "Gold Coin" }
  it("Shuushar the pacifist never asks for a weapon; Stool asks for nothing", () => {
    expect(chooseAsk(ASKERS.shuushar, NO_STANDING, [blade])).toBeNull()
    expect(askerFor("Stool")).toBeNull()
    expect(askerFor("Shuushar the Awakened")).toBe(ASKERS.shuushar)
    expect(askerFor("Prince Derendil")?.temper).toBe("courtly")
  })
  it("gold only when they feel owed", () => {
    expect(chooseAsk(ASKERS.jimjar, NO_STANDING, [coin])).toBeNull()
    expect(chooseAsk(ASKERS.jimjar, st({ debt: GOLD_DEBT }), [coin])).toEqual(coin)
  })
  it("the NPC's own order of wanting, not the list's", () => {
    expect(chooseAsk(ASKERS.eldeth, NO_STANDING, [food, blade])).toEqual(blade)
    expect(chooseAsk(ASKERS.ront, NO_STANDING, [blade, food])).toEqual(food)
  })
  it("a soured NPC asks no favours but still wants what it is owed", () => {
    expect(chooseAsk(ASKERS.ront, st({ resentment: 40 }), [food, blade])).toBeNull()
    expect(chooseAsk(ASKERS.ront, st({ resentment: 40, debt: 20 }), [food, coin])).toEqual(coin)
  })
  it("great import: rare or better, or a thing that opens something", () => {
    expect(isImportant({ kind: "food", itemName: "Feywine", rarity: "rare" })).toBe(true)
    expect(isImportant({ kind: "weapon", itemName: "Dagger", rarity: "common" })).toBe(false)
    expect(isImportant({ kind: "food", itemName: "Slave Pen Key", opens: true })).toBe(true)
  })
})

describe("the bubble", () => {
  it("every temper has a line for every kind, with the address and the item in it or implied", () => {
    for (const a of Object.values(ASKERS)) for (const k of a.wants) for (const p of [0, 0.99]) {
      const line = askLine(a.temper, k, "shorty", "Sporebread Loaf", p)
      expect(line).not.toMatch(/\{[aAi]\}/)
      expect(line.toLowerCase()).toContain("shorty")
      for (const o of ["gave", "refused", "ignored"] as const) expect(replyLine(a.temper, o).length).toBeGreaterThan(0)
    }
  })
  it("opens with a capital when the address leads", () => {
    expect(askLine("gruff", "food", "dwarf", "Bat Meat", 0)).toMatch(/^Dwarf\./)
    expect(askLine("bully", "food", "shorty", "Bat Meat", 0)).toBe("Hey shorty. That bat meat. Hand it over.")
  })
})

describe("what it does", () => {
  it("kindness lands at 65%, unkindness in full", () => {
    expect(PALLIATION).toBe(0.65)
    expect(askOutcome("food", "gave").deltas).toEqual({ affection: 3, trust: 2, debt: -2 })
    expect(askOutcome("food", "refused").deltas).toEqual({ resentment: 2, affection: -1 })
    expect(askOutcome("weapon", "gave").gravity).toBeGreaterThan(askOutcome("food", "gave").gravity)
  })
  it("ignoring costs less than refusing, and both cost something", () => {
    for (const k of ["food", "weapon", "gold"] as const) {
      const r = askOutcome(k, "refused").deltas.resentment!, i = askOutcome(k, "ignored").deltas.resentment!
      expect(i).toBeGreaterThan(0)
      expect(r).toBeGreaterThan(i)
    }
  })
  it("stays inside the table's -100..100", () => {
    expect(applyDeltas(st({ resentment: 99 }), { resentment: 5 }).resentment).toBe(100)
    expect(applyDeltas(st({ debt: -99 }), { debt: -8 }).debt).toBe(-100)
  })
})

describe("caught with a hand in their pocket (Sam, 2026-11-13)", () => {
  it("every way it ends costs something, and none of it is good news", () => {
    for (const o of THEFT_OUTCOMES) {
      const { gravity, deltas } = theftOutcome(o)
      expect(gravity, o).toBeGreaterThan(0)
      expect(deltas.trust!, o).toBeLessThan(0)
      expect(deltas.resentment!, o).toBeGreaterThan(0)
    }
  })
  it("being let off is the cheapest; cowing them buys fear; a fight is the heaviest", () => {
    const f = theftOutcome("forgave"), c = theftOutcome("cowed"), x = theftOutcome("fought")
    expect(f.gravity).toBeLessThan(c.gravity)
    expect(c.gravity).toBeLessThan(x.gravity)
    expect(c.deltas.fear).toBeGreaterThan(0)
    expect(f.deltas.fear).toBeUndefined()
  })
  it("hands out a copy, so one catch cannot change the table for the next", () => {
    theftOutcome("cowed").deltas.fear = 99
    expect(theftOutcome("cowed").deltas.fear).toBe(8)
  })
  it("writes the ledger line in the fiction's words", () => {
    expect(theftNote("Jimjar", "Lynkes", "forgave", "Bent wire")).toBe("Jimjar caught Lynkes's hand at the bent wire and let it pass, this once.")
    expect(theftNote("Jimjar", "Lynkes", "cowed", "Bent wire")).toMatch(/handing it over/)
    expect(theftNote("Jimjar", "Lynkes", "fought", "Bent wire")).toMatch(/came to blows/)
  })
})
