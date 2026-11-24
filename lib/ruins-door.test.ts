import { describe, expect, it } from "vitest"
import { OUTPOST_NODE, partyInOutpost } from "./ruins-door"

describe("the Ruins door opens only from the road", () => {
  it("is shut while the party is still at Velkynvelve", () => {
    expect(OUTPOST_NODE).toBe("velkynvelve")
    expect(partyInOutpost("velkynvelve")).toBe(true)
    expect(partyInOutpost(" Velkynvelve ")).toBe(true)
  })
  it("opens on the march: a waypoint or another place", () => {
    expect(partyInOutpost("wp--velkynvelve-sloobludop--03")).toBe(false)
    expect(partyInOutpost("sloobludop")).toBe(false)
  })
  it("does not guess when the position is unknown", () => {
    expect(partyInOutpost(null)).toBe(false)
    expect(partyInOutpost(undefined)).toBe(false)
    expect(partyInOutpost("")).toBe(false)
  })
})
