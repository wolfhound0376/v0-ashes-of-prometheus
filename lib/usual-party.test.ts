import { describe, expect, it } from "vitest"
import { matchParty } from "./save-store"

const roster = [
  { id: "a", name: "Fifi of Waterdeep" },
  { id: "b", name: "Kenta of Neverwinter" },
  { id: "c", name: "Lynkes" },
]

describe("the usual party", () => {
  it("opens seats for the heroes the save remembers, by name", () => {
    expect(matchParty(["Fifi of Waterdeep", "Lynkes"], roster).map((c) => c.id)).toEqual(["a", "c"])
  })
  it("ignores case and stray spaces", () => {
    expect(matchParty([" lynkes "], roster).map((c) => c.id)).toEqual(["c"])
  })
  it("skips a hero who is gone, and anything that is not a name", () => {
    expect(matchParty(["Gandalf", 3, null], roster)).toEqual([])
  })
  it("is empty when the save has no party", () => {
    expect(matchParty(null, roster)).toEqual([])
    expect(matchParty([], roster)).toEqual([])
  })
})
