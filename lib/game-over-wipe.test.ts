import { describe, expect, it } from "vitest"
import { wipeVerdict } from "@/lib/game-over-wipe"

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
