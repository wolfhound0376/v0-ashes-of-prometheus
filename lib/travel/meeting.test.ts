import { describe, expect, it } from "vitest"
import { meetingAt, metCreatures } from "./meeting"

const eyes = (passive: number) => ({ id: "f", name: "Fifi", passive })
const creatures = [{ table_key: "underdark_random" }, { table_key: "underdark_creature" }]
const terrain = [{ table_key: "underdark_random" }, { table_key: "underdark_terrain" }]

describe("who sees whom first on the road (Sam, 2026-11-12)", () => {
  it("only creatures are met", () => {
    expect(metCreatures(creatures)).toBe(true)
    expect(metCreatures([{ table_key: "darklake_random" }, { table_key: "darklake_creature" }])).toBe(true)
    expect(metCreatures(terrain)).toBe(false)
    expect(metCreatures([])).toBe(false)
    expect(meetingAt({ noticed: true, best: eyes(15), dc: 12 }, terrain)).toBeNull()
  })
  it("noticed: the party sees them first and nobody is surprised", () => {
    const m = meetingAt({ noticed: true, best: eyes(13), dc: 12 }, creatures)!
    expect(m.first).toBe("party")
    expect(m.surprised).toBeNull()
    expect(m.chip).toBe("Fifi saw them first")
    expect(m.line).toContain("passive 13 vs DC 12")
  })
  it("missed: they see the party first and the party is surprised, by the 5.2.1 rule", () => {
    const m = meetingAt({ noticed: false, best: eyes(10), dc: 12 }, creatures)!
    expect(m.first).toBe("them")
    expect(m.surprised).toBe("party")
    expect(m.line).toContain("Disadvantage on Initiative")
  })
  it("no passive roll here (a sail, or nobody marching) gives no verdict", () => {
    expect(meetingAt(null, creatures)).toBeNull()
    expect(meetingAt({ noticed: false, best: null, dc: 12 }, creatures)).toBeNull()
  })
})
