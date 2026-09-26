import { describe, expect, it } from "vitest"
import { conditionNames, statusKindsOf } from "./status-kinds"

describe("statusKindsOf", () => {
  it("reads the plain words", () => {
    expect(statusKindsOf(["Burning"])).toEqual(["burning"])
    expect(statusKindsOf(["Charged"])).toEqual(["charged"])
    expect(statusKindsOf(["Webbed"])).toEqual(["webbed"])
    expect(statusKindsOf(["Prone"])).toEqual(["prone"])
  })

  it("reads the ways the DM and the rules actually spell them", () => {
    expect(statusKindsOf(["on fire"])).toEqual(["burning"])
    expect(statusKindsOf(["Lightning Charge"])).toEqual(["charged"])
    expect(statusKindsOf(["Restrained"])).toEqual(["webbed"])
  })

  it("does not mistake other conditions for these", () => {
    expect(statusKindsOf(["Manacled", "Grappled", "Poisoned", "Frightened", "Charmed"])).toEqual([])
  })

  it("returns each look once, in a stable order, whatever the input order", () => {
    expect(statusKindsOf(["Prone", "Burning", "burning", "Restrained"])).toEqual(["burning", "webbed", "prone"])
  })

  it("ignores blanks and junk", () => {
    expect(statusKindsOf(["", "  ", "???"])).toEqual([])
  })
})

describe("conditionNames", () => {
  it("accepts strings, {name} objects and vtt_tokens.effects rows", () => {
    expect(conditionNames(["Prone", { name: "Burning" }, { condition: "Restrained", spell: "web" }])).toEqual(["Prone", "Burning", "Restrained"])
  })
  it("is empty for anything that is not an array", () => {
    expect(conditionNames(null)).toEqual([])
    expect(conditionNames("Prone")).toEqual([])
    expect(conditionNames({ condition: "Prone" })).toEqual([])
  })
})
