import { describe, expect, it } from "vitest"
import { ENDING_GAME_OVERS, endVerdict, wipeOutcome, wipeVerdict } from "@/lib/game-over-wipe"

const heroes = { samson: { cid: "c-sam" }, scott: { cid: "c-scott" }, kenta: { cid: "c-kenta" } }

describe("the game dies with the party (Sam, 2026-11-15)", () => {
  it("is a wipe when every seated hero has fallen", () => {
    expect(wipeVerdict([{ id: "c-sam" }, { id: "c-scott" }], heroes, ["samson", "scott"])).toEqual({ ok: true, dead: ["samson", "scott"] })
  })
  it("ignores the DM's seat and heroes nobody is playing", () => {
    expect(wipeVerdict([{ id: "dm", dm: true }, { id: "c-sam" }], heroes, ["samson"]).ok).toBe(true)
  })
  it("is not a wipe while one seated hero still lives", () => {
    expect(wipeVerdict([{ id: "c-sam" }, { id: "c-scott" }], heroes, ["samson"]).ok).toBe(false)
  })
  it("is not a wipe at an empty table", () => {
    expect(wipeVerdict([], heroes, ["samson"]).ok).toBe(false)
    expect(wipeVerdict([{ id: "dm", dm: true }], heroes, []).ok).toBe(false)
  })
  it("never wipes for a seated hero the shared world does not know", () => {
    expect(wipeVerdict([{ id: "c-sam" }, { id: "c-new" }], heroes, ["samson"]).ok).toBe(false)
  })
})

describe("what a wipe does to the campaign (Sam, 2026-11-23: deletes in Mortal only)", () => {
  it("deletes a Mortal campaign", () => {
    expect(wipeOutcome({ mortal: true })).toBe("delete")
  })
  it("sends any other campaign back to its last save", () => {
    expect(wipeOutcome({ mortal: false })).toBe("back")
    expect(wipeOutcome({})).toBe("back")
  })
  it("deletes when no saved game is in play, as before saved games", () => {
    expect(wipeOutcome(null)).toBe("delete")
    expect(wipeOutcome("missing")).toBe("delete")
  })
})

describe("every game over ends the game (Sam, 2026-11-23: \"Game over; automatically ends the game.\")", () => {
  const heroes = { fifi: { cid: "c-fifi" }, samson: { cid: "c-sam" } }
  it("the whole party down with nobody to pick them up ends it, though nobody is dead", () => {
    expect(endVerdict([{ id: "c-fifi" }], heroes, [], { why: "fell", seq: "g1" })).toEqual({ ok: true, dead: [], why: "fell" })
  })
  it("so does the march out in chains lost", () => {
    expect(endVerdict([{ id: "c-fifi" }, { id: "c-sam" }], heroes, ["samson"], { why: "menzoberranzan" })).toEqual({ ok: true, dead: ["samson"], why: "menzoberranzan" })
  })
  it("a table of dead heroes still ends it as before", () => {
    expect(endVerdict([{ id: "c-fifi" }], heroes, ["fifi"], null)).toEqual({ ok: true, dead: ["fifi"] })
  })
  it("nothing else does: no game over, an unknown kind, one hero dead while another lives, or nobody seated", () => {
    expect(endVerdict([{ id: "c-fifi" }], heroes, [], null).ok).toBe(false)
    expect(endVerdict([{ id: "c-fifi" }], heroes, [], { why: "anything-else" }).ok).toBe(false)
    expect(endVerdict([{ id: "c-fifi" }, { id: "c-sam" }], heroes, ["fifi"], undefined).ok).toBe(false)
    expect(endVerdict([{ id: "dm", dm: true }], heroes, [], { why: "fell" }).ok).toBe(false)
    expect([...ENDING_GAME_OVERS].sort()).toEqual(["fell", "menzoberranzan"])
  })
})
