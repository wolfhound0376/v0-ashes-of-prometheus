import { describe, expect, it } from "vitest"
import { markOwedAloud, markVoicedElsewhere, takeOwedAloud, takeVoicedElsewhere } from "./voiced-elsewhere"

// Sam, 2026-11-13: an NPC who called you over says what they wanted the moment the talk opens. The line is
// marked "owed" so DM Narration speaks it even on its first look at the log; the opener, already said on the
// map, stays marked "voiced elsewhere" so it is not said twice. The two marks must not bleed into each other.
describe("voiced-elsewhere marks", () => {
  it("an owed line is taken exactly once", () => {
    markOwedAloud("Eldeth Feldrun", "How many guards did you count?")
    expect(takeOwedAloud("eldeth feldrun", " How many guards did you count? ")).toBe(true)
    expect(takeOwedAloud("Eldeth Feldrun", "How many guards did you count?")).toBe(false)
  })
  it("owed and voiced-elsewhere are separate ledgers", () => {
    markVoicedElsewhere("Ront", "You. A word.")
    expect(takeOwedAloud("Ront", "You. A word.")).toBe(false)
    expect(takeVoicedElsewhere("Ront", "You. A word.")).toBe(true)
    markOwedAloud("Ront", "What did the dwarf tell you?")
    expect(takeVoicedElsewhere("Ront", "What did the dwarf tell you?")).toBe(false)
    expect(takeOwedAloud("Ront", "What did the dwarf tell you?")).toBe(true)
  })
  it("a line nobody marked is never owed", () => {
    expect(takeOwedAloud("Jimjar", "Care to make it interesting?")).toBe(false)
  })
})
