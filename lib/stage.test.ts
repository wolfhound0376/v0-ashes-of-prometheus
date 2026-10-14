import { describe, expect, it } from "vitest"
import { STALE_AFTER_MS, modeForPath, shouldFollow, transitionFor } from "./stage"

describe("stage grammar", () => {
  it("reads the mode off the pathname", () => {
    expect(modeForPath("/")).toBe("table")
    expect(modeForPath("/map")).toBe("map")
    expect(modeForPath("/camp/scenes")).toBe("camp")
    expect(modeForPath("/velkynvelve")).toBe("scene")
    expect(modeForPath("/battle")).toBe("battle")
    expect(modeForPath("/admin")).toBe("other")
  })
  it("draws each move the way the mock does", () => {
    expect(transitionFor("table", "map")).toBe("grow")
    expect(transitionFor("table", "battle")).toBe("grow")
    expect(transitionFor("map", "table")).toBe("shrink")
    expect(transitionFor("battle", "table")).toBe("shrink")
    expect(transitionFor("scene", "map")).toBe("medallion")
    expect(transitionFor("map", "camp")).toBe("dive")
    expect(transitionFor("camp", "map")).toBe("dip") // anything else: dip through black, never a hard cut
    expect(transitionFor("map", "map")).toBe("dip")
  })
})

describe("the table moves together", () => {
  const now = Date.parse("2026-10-14T12:00:00Z")
  const rec = (over: Partial<Parameters<typeof shouldFollow>[0] & object>) => ({ mode: "map" as const, by: "them", at: new Date(now - 1000).toISOString(), ...over })
  it("follows another browser's move to a shared mode", () => {
    expect(shouldFollow(rec({}), "me", "table", now)).toBe(true)
  })
  it("never follows itself", () => {
    expect(shouldFollow(rec({ by: "me" }), "me", "table", now)).toBe(false)
  })
  it("does not follow onto the battle board — the DM's place", () => {
    expect(shouldFollow(rec({ mode: "battle" }), "me", "table", now)).toBe(false)
  })
  it("stays put when already there, on an outside page, or when the record is stale", () => {
    expect(shouldFollow(rec({}), "me", "map", now)).toBe(false)
    expect(shouldFollow(rec({}), "me", "other", now)).toBe(false)
    expect(shouldFollow(rec({ at: new Date(now - STALE_AFTER_MS - 1).toISOString() }), "me", "table", now)).toBe(false)
    expect(shouldFollow(null, "me", "table", now)).toBe(false)
  })
})

describe("film — a moment, not a place", () => {
  const now = Date.parse("2026-10-14T20:00:00Z")
  it("a party clip is followed from any mode, including the table", () => {
    const rec = { mode: "film" as const, by: "them", at: "2026-10-14T19:59:30Z", clip: "https://x/clip.mp4" }
    expect(shouldFollow(rec, "me", "table", now)).toBe(true)
    expect(shouldFollow(rec, "me", "map", now)).toBe(true)
    expect(shouldFollow(rec, "them", "map", now)).toBe(false)
  })
  it("a film record without a clip is nothing to follow", () => {
    expect(shouldFollow({ mode: "film", by: "them", at: "2026-10-14T19:59:30Z" }, "me", "table", now)).toBe(false)
  })
})
