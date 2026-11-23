import { describe, expect, it } from "vitest"
import { pitComesFirst, pitDoneFor, pitDoneValue, pitOwedBy, pitSessionDoneValue, pitHeroKey, pitParty, pitSrc, pitTryParty, pitChannel, pitRoles } from "./pit"

describe("pitHeroKey", () => {
  it("knows the four originals by first name, however cased", () => {
    expect(pitHeroKey("Fifi")).toBe("fifi")
    expect(pitHeroKey("  KENTA Anaya ")).toBe("kenta")
    expect(pitHeroKey("Samson the Bright")).toBe("samson")
    expect(pitHeroKey("scott")).toBe("scott")
  })
  it("has no art for anyone else", () => {
    for (const n of ["Lynkes", "Gandalf", "Kingasaur", "", null, undefined, "Fifina"]) expect(pitHeroKey(n), String(n)).toBeNull()
  })
})

describe("pitComesFirst", () => {
  const base = { run: "run-7", characterId: "c1", name: "Fifi", rolled: false, done: null }
  it("a new game for a hero with Pit art", () => expect(pitComesFirst(base)).toBe(true))
  it("never for a saved game", () => expect(pitComesFirst({ ...base, rolled: true })).toBe(false))
  it("never for a hero without Pit art", () => expect(pitComesFirst({ ...base, name: "Lynkes" })).toBe(false))
  it("never when the run is unknown (a network blip must not loop anyone)", () => {
    expect(pitComesFirst({ ...base, run: null })).toBe(false)
    expect(pitComesFirst({ ...base, run: undefined })).toBe(false)
  })
  it("once per run, per hero", () => {
    expect(pitComesFirst({ ...base, done: pitDoneValue("run-7", "c1") })).toBe(false)
    expect(pitComesFirst({ ...base, done: pitDoneValue("run-6", "c1") })).toBe(true)
    expect(pitComesFirst({ ...base, done: pitDoneValue("run-7", "c2") })).toBe(true)
  })
})

describe("the whole table goes (Sam, 2026-11-20)", () => {
  const back = { run: "run-7", characterId: "c1", name: "Fifi", rolled: true, done: null, session: 2 }
  it("a hero who has already woken goes in when someone seated still owes the Pit", () => expect(pitComesFirst({ ...back, partyDue: true })).toBe(true))
  it("and not when nobody does, or the table did not say", () => {
    expect(pitComesFirst({ ...back, partyDue: false })).toBe(false)
    expect(pitComesFirst(back)).toBe(false)
  })
  it("once per session for them", () => {
    expect(pitComesFirst({ ...back, partyDue: true, done: pitSessionDoneValue("run-7", 2, "c1") })).toBe(false)
    expect(pitComesFirst({ ...back, partyDue: true, done: pitSessionDoneValue("run-7", 1, "c1") })).toBe(true)
    expect(pitComesFirst({ ...back, partyDue: true, done: pitDoneValue("run-7", "c1") })).toBe(true)
  })
  it("never without Pit art", () => expect(pitComesFirst({ ...back, name: "Lynkes", partyDue: true })).toBe(false))
  it("what a win writes ends in the hero's id either way (the waker reads that)", () => {
    expect(pitDoneFor("r", 2, "c1", true)).toBe("r:s2:c1")
    expect(pitDoneFor("r", 2, "c1", false)).toBe("r:c1")
  })
  it("who owes it: seated, has Pit art, has not rolled; not DM-run, not excused", () => {
    const seats = [{ id: "c1", name: "Fifi of Waterdeep" }, { id: "c2", name: "Kenta of Neverwinter" }, { id: "c3", name: "Lynkes" }, { id: "c4", name: "Samson", away: true }, { id: "c5", name: "Scott", dm: true }]
    expect(pitOwedBy(seats, new Set(["c1"]))).toEqual(["c2"])
    expect(pitOwedBy(seats, new Set(["c1", "c2"]))).toEqual([])
  })
})

describe("pitParty", () => {
  const seats = [
    { id: "c1", name: "Fifi" },
    { id: "c2", name: "Kenta" },
    { id: "c3", name: "Lynkes" },
    { id: "c4", name: "Samson", away: true },
  ]
  it("this browser's hero first, then the seated heroes with Pit art who have not stepped out", () => {
    expect(pitParty("c2", "Kenta", seats)).toEqual({ me: "kenta", party: ["kenta", "fifi"] })
    expect(pitParty("c1", "Fifi", seats)).toEqual({ me: "fifi", party: ["fifi", "kenta"] })
  })
  it("a hero without Pit art does not enter", () => expect(pitParty("c3", "Lynkes", seats)).toEqual({ me: null, party: [] }))
  it("alone at the table", () => expect(pitParty("c1", "Fifi", [])).toEqual({ me: "fifi", party: ["fifi"] }))
})

describe("pitSrc / pitTryParty", () => {
  it("builds the frame's address", () => {
    expect(pitSrc("fifi", ["fifi", "kenta"], { film: true, sound: false })).toBe("/pit-arena/index.html?embed=1&me=fifi&party=fifi%2Ckenta&film=1&snd=0")
  })
  it("reads ?try=", () => {
    expect(pitTryParty("kenta,fifi,nobody,kenta")).toEqual(["kenta", "fifi"])
    expect(pitTryParty("nobody")).toBeNull()
    expect(pitTryParty(null)).toBeNull()
  })
})

describe("THE PIT, TOGETHER", () => {
  it("one channel per run and session", () => {
    expect(pitChannel("run-7", 3)).toBe("pit:run-7:s3")
    expect(pitChannel("run-7", null)).toBe("pit:run-7:s0")
  })
  it("the player here longest runs the fight; everyone works out the same answer", () => {
    const m = [{ key: "kenta", at: 200 }, { key: "fifi", at: 100 }]
    expect(pitRoles(m, ["fifi", "kenta"], "kenta")).toEqual({ host: "fifi", role: "client", present: ["fifi", "kenta"] })
    expect(pitRoles(m, ["fifi", "kenta"], "fifi").role).toBe("host")
  })
  it("when the host leaves, the next one takes over", () => {
    expect(pitRoles([{ key: "kenta", at: 200 }], ["fifi", "kenta"], "kenta")).toEqual({ host: "kenta", role: "host", present: ["kenta"] })
  })
  it("ignores strangers, keeps a hero's earliest tab, breaks ties by the Pit's order", () => {
    const m = [{ key: "lynkes", at: 1 }, { key: "kenta", at: 50 }, { key: "kenta", at: 10 }, { key: "fifi", at: 10 }]
    expect(pitRoles(m, ["fifi", "kenta"], "kenta")).toEqual({ host: "fifi", role: "client", present: ["fifi", "kenta"] })
  })
  it("nobody here yet: no role", () => expect(pitRoles([], ["fifi"], "fifi")).toEqual({ host: null, role: null, present: [] }))
  it("the frame is told to join the shared fight", () => {
    expect(pitSrc("fifi", ["fifi", "kenta"], { film: true, sound: true, net: true })).toContain("net=1")
    expect(pitSrc("fifi", ["fifi"], { film: true, sound: true })).not.toContain("net=")
  })
})
