import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
  BOND, CONTROL_MODELS, COMPANION_KINDS, bondOf, feedDay, canFeed, feedResult, obeys, orderObeyed, commandMenu, canFetch,
  drowSpares, normaliseCompanion, companionName, companionLabel, SPIDER_VARIANTS, spiderFromD4, variantOf, CALM,
  isSpiderFoe, calmTakes, PHASE,
} from "./companions.mjs"

const spider = (o = {}) => normaliseCompanion("pet-spider", { owner: "kenta", alive: true, ...o })!

describe("the record", () => {
  it("normalises a raw row and refuses an unknown kind", () => {
    expect(normaliseCompanion("dragon", { owner: "kenta" })).toBeNull()
    const c = spider({ bond: 7, name: "  <b>Skitter</b>  " })
    expect(c.bond).toBe(3)
    expect(c.name).toBe("bSkitter/b")
    expect(c.perched).toBe(false)
    expect(normaliseCompanion("pet-spider", { alive: false })!.alive).toBe(false)
  })
  it("names it safely and labels it", () => {
    expect(companionName("  Mr <i>Legs</i>  ")).toBe("Mr iLegs/i")
    expect(companionName("x".repeat(40))).toHaveLength(24)
    expect(companionLabel(spider())).toBe("the spider")
    expect(companionLabel(spider({ name: "Skitter" }))).toBe("Skitter")
  })
  it("only the pet and the steered effects are built; every model names its source", () => {
    expect(Object.entries(CONTROL_MODELS).filter(([, m]) => m.built).map(([k]) => k)).toEqual(["pet", "effect"])
    for (const m of Object.values(CONTROL_MODELS)) expect(m.source.length).toBeGreaterThan(10)
    expect(COMPANION_KINDS["pet-spider"].model).toBe("pet")
  })
})

describe("the bond (Sam's call 1)", () => {
  it("counts a game day as six changes of the watch", () => {
    expect(feedDay(0)).toBe(0)
    expect(feedDay(5)).toBe(0)
    expect(feedDay(6)).toBe(1)
    expect(feedDay(-3)).toBe(0)
  })
  it("feeds once a day, needs food, stops at the top", () => {
    expect(canFeed(spider(), { rotations: 0, hasFood: true }).ok).toBe(true)
    expect(canFeed(spider(), { rotations: 0, hasFood: false }).why).toMatch(/nothing it eats/)
    expect(canFeed(spider({ fedDay: 0 }), { rotations: 4, hasFood: true }).why).toMatch(/eaten today/)
    expect(canFeed(spider({ fedDay: 0 }), { rotations: 6, hasFood: true }).ok).toBe(true)
    expect(canFeed(spider({ bond: 3 }), { hasFood: true }).ok).toBe(false)
    expect(canFeed(spider({ alive: false }), { hasFood: true }).ok).toBe(false)
  })
  it("a DC 10 Animal Handling success raises it by one; a 1 always fails, a 20 always succeeds", () => {
    expect(feedResult(spider(), { total: 10, natural: 9 })).toMatchObject({ ok: true, before: 0, after: 1, name: "Settled" })
    expect(feedResult(spider(), { total: 9, natural: 8 })).toMatchObject({ ok: false, after: 0 })
    expect(feedResult(spider(), { total: 12, natural: 1 }).ok).toBe(false)
    expect(feedResult(spider(), { total: 4, natural: 20 }).ok).toBe(true)
    expect(feedResult(spider({ bond: 3 }), { total: 20, natural: 19 }).after).toBe(3)
    expect(feedResult(spider(), { total: 15, natural: 14, rotations: 13 }).fedDay).toBe(2)
    expect(feedResult(spider(), { total: 3, natural: 3, ok: true }).after).toBe(1)
    expect(BOND.dc).toBe(10)
  })
})

describe("orders (Sam's call 2)", () => {
  it("bond 0 takes no orders; bond 1 obeys safe orders and checks attack orders; bond 2 obeys all", () => {
    expect(obeys(spider({ bond: 0 }), "bite")).toBe("never")
    expect(obeys(spider({ bond: 1 }), "hide")).toBe("always")
    expect(obeys(spider({ bond: 1 }), "perch")).toBe("always")
    expect(obeys(spider({ bond: 1 }), "bite")).toBe("check")
    expect(obeys(spider({ bond: 1 }), "help")).toBe("check")
    expect(obeys(spider({ bond: 2 }), "web")).toBe("always")
    expect(obeys(spider({ bond: 1 }), "nonsense")).toBe("never")
  })
  it("the owner's roll: DC 10, natural 1 and 20 decide", () => {
    expect(orderObeyed({ total: 10, natural: 9 })).toBe(true)
    expect(orderObeyed({ total: 9, natural: 9 })).toBe(false)
    expect(orderObeyed({ total: 14, natural: 1 })).toBe(false)
    expect(orderObeyed({ total: 3, natural: 20 })).toBe(true)
  })
  it("the menu offers only orders it can carry out", () => {
    expect(commandMenu(spider({ bond: 0 }), { biteFoes: ["Drow guard"] })).toEqual([])
    const m = commandMenu(spider({ bond: 1 }), { biteFoes: ["Drow guard"], webFoes: ["Quaggoth"], helpFoes: ["Drow guard"], webReady: false, ownerReach: false })
    expect(m.map((r) => r.label)).toEqual(["Bite: Drow guard", "Help: Drow guard", "Hide", "Dodge"])
    expect(m.find((r) => r.cmd === "bite")!.check).toBe(true)
    expect(m.find((r) => r.cmd === "hide")!.check).toBe(false)
    const m2 = commandMenu(spider({ bond: 2 }), { webFoes: ["A", "B", "C", "D"], webReady: true, ownerReach: true, hidden: true })
    expect(m2.map((r) => r.label)).toEqual(["Web: A", "Web: B", "Web: C", "Dodge", "Back to the sleeve"])
    expect(m2.every((r) => !r.check)).toBe(true)
  })
})

describe("out of a fight", () => {
  it("fetches for someone who can speak to it, or for its owner at bond 3; never while perched", () => {
    expect(canFetch(spider({ bond: 0 }), { canSpeak: true })).toBe(true)
    expect(canFetch(spider({ bond: 2 }), { isOwner: true })).toBe(false)
    expect(canFetch(spider({ bond: 3 }), { isOwner: true })).toBe(true)
    expect(canFetch(spider({ bond: 3 }), { isOwner: false })).toBe(false)
    expect(canFetch(spider({ bond: 3, perched: true }), { isOwner: true })).toBe(false)
  })
  it("drow spare it (Sam's call 3); nobody else does", () => {
    for (const id of ["drow-guard-male", "drow-guard-female", "jorlan", "ilvara", "shoor", "asha"]) expect(drowSpares(id, "pet-spider")).toBe(true)
    expect(drowSpares("quaggoth", "pet-spider")).toBe(false)
    expect(drowSpares("drow-guard-male", "ront")).toBe(false)
  })
})

describe("the three spiders (Sam, 2026-11-23: a d4)", () => {
  it("a d4: 1 redknee, 2 cave, 3 baby phase, 4 the owner chooses", () => {
    expect([1, 2, 3, 4].map(spiderFromD4)).toEqual(["redknee", "cave", "phase", null])
    expect(Object.values(SPIDER_VARIANTS).map((v) => v.face)).toEqual([1, 2, 3])
  })
  it("the record keeps its variant; nonsense is dropped", () => {
    expect(variantOf(spider({ variant: "cave" }))).toBe("cave")
    expect(variantOf(spider({ variant: "dragon" }))).toBeNull()
    expect(companionLabel(spider({ variant: "phase" }))).toBe("the baby phase spider")
  })
  it("A bites and webs, nothing more", () => {
    const m = commandMenu(spider({ bond: 2, variant: "redknee" }), { biteFoes: ["Drow"], webFoes: ["Drow"], helpFoes: ["Drow"], webReady: true, spidersNear: true, ownerReach: true })
    expect(m.map((r) => r.cmd)).toEqual(["bite", "web", "hide", "dodge", "perch"])
    expect(SPIDER_VARIANTS.redknee.biteAdvantage).toBe(true)
  })
  it("B helps and calms spiders, no web; it steals from bond 1", () => {
    const m = commandMenu(spider({ bond: 2, variant: "cave" }), { biteFoes: ["Drow"], webFoes: ["Drow"], helpFoes: ["Drow"], webReady: true, spidersNear: true })
    expect(m.map((r) => r.cmd)).toEqual(["bite", "help", "calm", "hide", "dodge"])
    expect(canFetch(spider({ bond: 1, variant: "cave" }), { isOwner: true })).toBe(true)
    expect(canFetch(spider({ bond: 0, variant: "cave" }), { isOwner: true })).toBe(false)
  })
  it("C only bites (and keeps itself alive); A and C never steal", () => {
    const m = commandMenu(spider({ bond: 2, variant: "phase" }), { biteFoes: ["Drow"], webFoes: ["Drow"], helpFoes: ["Drow"], webReady: true, spidersNear: true, ownerReach: true })
    expect(m.map((r) => r.cmd)).toEqual(["bite", "hide", "dodge", "perch"])
    expect(canFetch(spider({ bond: 3, variant: "phase" }), { isOwner: true, canSpeak: true })).toBe(false)
    expect(canFetch(spider({ bond: 3, variant: "redknee" }), { isOwner: true, canSpeak: true })).toBe(false)
    expect(PHASE.ft).toBe(30)
  })
  it("the calm: hostile spiders only; a Charisma save against DC 11", () => {
    expect(isSpiderFoe("giant-spider")).toBe(true)
    expect(isSpiderFoe("giant-wolf-spider")).toBe(true)
    expect(isSpiderFoe("pet-spider")).toBe(false)
    expect(isSpiderFoe("drow-guard-male")).toBe(false)
    expect(calmTakes({ total: 10, natural: 13 })).toBe(true)
    expect(calmTakes({ total: 11, natural: 14 })).toBe(false)
    expect(calmTakes({ total: 25, natural: 1 })).toBe(true)
    expect(calmTakes({ total: 2, natural: 20 })).toBe(false)
    expect(CALM.rangeFt).toBe(30)
  })
})

describe("the map runs these rules", () => {
  it("the built map carries this file", () => {
    const page = readFileSync("public/velkynvelve-walk/index.html", "utf8")
    expect(page).toContain("export const COMPANION_SOURCE".replace("export ", ""))
    expect(page).not.toContain("/*__COMPANIONS__*/")
  })
})
