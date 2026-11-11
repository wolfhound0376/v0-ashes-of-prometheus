import { describe, expect, it } from "vitest"
import { NO_STANDING } from "@/lib/npc-asks"
import { ADVISERS, adviceChance, adviceLine, adviceNote, adviserFor, guideFor } from "@/lib/npc-advice"

const st = (o: Partial<typeof NO_STANDING>) => ({ ...NO_STANDING, ...o })

describe("the prisoners' advice on where to go", () => {
  it("only those the book gives something to say are advisers", () => {
    for (const k of ["Jimjar", "Buppido", "Shuushar", "Sarith Kzekarit", "Eldeth Feldrun"]) expect(adviserFor(k)).not.toBeNull()
    for (const k of ["Prince Derendil", "Ront", "Stool", "Topsy"]) expect(adviserFor(k)).toBeNull()
  })
  it("every adviser is on the book's guide table, and the note comes from it", () => {
    for (const a of ADVISERS) expect(guideFor(a.key)).not.toBeNull()
    expect(adviceNote(guideFor("jimjar"))).toContain("Blingdenstone")
    expect(adviceNote(guideFor("sarith"))).toContain("any region")
    expect(adviceNote(guideFor("eldeth"))).toContain("+5")
    expect(adviceNote(guideFor("ront"))).toBeNull()
  })
  it("standing sets the odds and motive bends them", () => {
    const jimjar = adviserFor("jimjar")!, buppido = adviserFor("buppido")!, sarith = adviserFor("sarith")!
    expect(adviceChance(jimjar, NO_STANDING)).toBeCloseTo(0.3)
    expect(adviceChance(jimjar, st({ trust: 8, affection: 8 }))).toBeCloseTo(0.8)
    expect(adviceChance(jimjar, st({ resentment: 20 }))).toBe(0)
    expect(adviceChance(buppido, st({ resentment: 20 }))).toBeGreaterThan(0.5) // he wants you on that road regardless
    expect(adviceChance(sarith, NO_STANDING)).toBeLessThan(adviceChance(jimjar, NO_STANDING))
    for (const a of ADVISERS) expect(adviceChance(a, st({ trust: 50 }))).toBeLessThan(1)
  })
  it("the line addresses the hero and leaves no placeholder", () => {
    for (const a of ADVISERS) for (const p of [0, 0.99]) { const l = adviceLine(a, "Bard", p); expect(l).toContain("Bard"); expect(l).not.toContain("{you}") }
  })
})
