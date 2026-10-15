import { describe, expect, it } from "vitest"
import { costLine, offerOptions, readOptions, resolveChoice } from "./options"
import type { SheetSlice } from "../game-context"

const sheet = (over: Partial<SheetSlice> = {}): SheetSlice => ({
  id: "c1", name: "Fifi", level: 3,
  str_score: 10, dex_score: 14, con_score: 12, int_score: 10, wis_score: 12, cha_score: 10,
  proficiency_bonus: 2, sheet_skill_proficiencies: {}, ...over,
})

const payload = {
  options: [
    { key: "dive", label: "Dive into the pool", detail: "Cold and deep.", cost: { hours: 1, exhaustion: 1 }, check: { skill: "athletics", dc: 13 }, outcome: { success: "You reach the bottom.", failure: "You surface with nothing." } },
    { key: "boat", label: "Cross by boat", cost: { hours: 2 }, requires: ["boat"] },
    { key: "secret", label: "Follow the scratches", hidden_until_noticed: true, outcome: { reveals: "hidden-cave" } },
    { key: "", label: "malformed — no key" },
    "not an object",
  ],
}

describe("readOptions — authored, never invented", () => {
  it("reads the well-formed ones and skips the rest", () => {
    const opts = readOptions(payload as any)
    expect(opts.map((o) => o.key)).toEqual(["dive", "boat", "secret"])
    expect(opts[0].cost).toEqual({ hours: 1, exhaustion: 1 })
    expect(opts[0].check).toEqual({ skill: "athletics", dc: 13 })
  })
  it("a node with no authored options has none", () => {
    expect(readOptions(null)).toEqual([])
    expect(readOptions({})).toEqual([])
    expect(readOptions({ options: "nope" } as any)).toEqual([])
  })
})

describe("offerOptions — what the party may actually pick", () => {
  const opts = readOptions(payload as any)
  it("a hidden option stays hidden until the passive roll found something", () => {
    expect(offerOptions(opts, { noticed: false, has: [] }).map((o) => o.key)).toEqual(["dive", "boat"])
    expect(offerOptions(opts, { noticed: true, has: [] }).map((o) => o.key)).toEqual(["dive", "boat", "secret"])
  })
  it("a missing requirement greys the option out and says why", () => {
    const noBoat = offerOptions(opts, { noticed: false, has: [] }).find((o) => o.key === "boat")!
    expect(noBoat.available).toBe(false)
    expect(noBoat.blocked_by).toEqual(["boat"])
    const withBoat = offerOptions(opts, { noticed: false, has: ["Boat"] }).find((o) => o.key === "boat")!
    expect(withBoat.available).toBe(true)
  })
})

describe("costLine — the party reads the price before choosing", () => {
  const opts = readOptions(payload as any)
  it("spells out every cost", () => {
    expect(costLine(opts[0])).toBe("1 h · 1 level of exhaustion · athletics DC 13")
    expect(costLine(opts[1])).toBe("2 h · needs boat")
    expect(costLine(opts[2])).toBe("free")
  })
})

describe("resolveChoice — the best-suited character makes the check", () => {
  const opts = readOptions(payload as any)
  const strong = sheet({ id: "c2", name: "Kenta", str_score: 18, sheet_skill_proficiencies: { athletics: "proficient" } })
  it("picks the best bonus and shows the arithmetic", () => {
    const out = resolveChoice(opts[0], [sheet(), strong], () => 0.5) // d20 = 11
    expect(out.roll!.name).toBe("Kenta")
    expect(out.roll!.bonus).toBe(6) // +4 STR, +2 proficiency
    expect(out.roll!.total).toBe(17)
    expect(out.success).toBe(true)
    expect(out.text).toBe("You reach the bottom.")
    expect(out.roll!.arithmetic).toBe("d20(11) +6 = 17 vs DC 13")
  })
  it("a failure tells the failure story and reveals nothing", () => {
    const out = resolveChoice(opts[0], [sheet()], () => 0) // d20 = 1
    expect(out.success).toBe(false)
    expect(out.text).toBe("You surface with nothing.")
    expect(out.reveals).toBeNull()
  })
  it("the hours are spent whether the check passed or not", () => {
    expect(resolveChoice(opts[0], [sheet()], () => 0).cost).toEqual({ hours: 1, exhaustion: 1 })
  })
  it("an option with no check simply happens", () => {
    const out = resolveChoice(opts[2], [sheet()], () => 0)
    expect(out.roll).toBeNull()
    expect(out.success).toBe(true)
    expect(out.reveals).toBe("hidden-cave")
  })
})
