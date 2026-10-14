import { describe, expect, it } from "vitest"
import { mayLead, tallyLeader } from "./leader"

describe("who leads", () => {
  const party = ["fifi", "kenta", "samson", "scott"]
  it("needs more than half of the eligible voters", () => {
    expect(tallyLeader({ fifi: "fifi", kenta: "fifi" }, party).leader).toBe(null)
    expect(tallyLeader({ fifi: "fifi", kenta: "fifi", samson: "fifi" }, party).leader).toBe("fifi")
    expect(tallyLeader({}, party).needed).toBe(3)
  })
  it("ignores votes from or for anyone outside the party", () => {
    const t = tallyLeader({ fifi: "fifi", kenta: "fifi", ghost: "fifi", samson: "malachar" }, party)
    expect(t.leader).toBe(null)
    expect(t.counts).toEqual({ fifi: 2 })
  })
  it("changes when confidence moves", () => {
    const first = tallyLeader({ fifi: "fifi", kenta: "fifi", samson: "fifi", scott: "kenta" }, party)
    expect(first.leader).toBe("fifi")
    const second = tallyLeader({ fifi: "fifi", kenta: "kenta", samson: "kenta", scott: "kenta" }, party)
    expect(second.leader).toBe("kenta")
  })
  it("a party of two needs both", () => {
    expect(tallyLeader({ fifi: "fifi" }, ["fifi", "kenta"]).leader).toBe(null)
    expect(tallyLeader({ fifi: "fifi", kenta: "fifi" }, ["fifi", "kenta"]).leader).toBe("fifi")
  })
  it("the DM always may; a player only while leading", () => {
    expect(mayLead({ dm: true, characterId: null }, null)).toBe(true)
    expect(mayLead({ dm: false, characterId: "fifi" }, "fifi")).toBe(true)
    expect(mayLead({ dm: false, characterId: "kenta" }, "fifi")).toBe(false)
    expect(mayLead({ dm: false, characterId: null }, null)).toBe(false)
  })
})
