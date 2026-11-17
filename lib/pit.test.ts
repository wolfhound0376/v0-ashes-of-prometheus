import { describe, expect, it } from "vitest"
import { pitComesFirst, pitDoneValue, pitHeroKey, pitParty, pitSrc, pitTryParty } from "./pit"

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
