import { describe, expect, it } from "vitest"
import { ENGINE_CUES, MAP_CUES, cuesForMalachar, doorFor } from "./cinematic-doors"

describe("cinematic doors", () => {
  it("keeps the road's check films off Malachar's list (the road film that played in the pen)", () => {
    expect(doorFor("notice-success")).toBe("engine")
    expect(doorFor("navigation-fail")).toBe("engine")
    expect(doorFor("forced-march-fail")).toBe("engine")
    expect(doorFor("alchemy-critical-failure")).toBe("engine")
  })

  it("keeps films the map has to earn off Malachar's list (the sigil film a rogue got without a roll)", () => {
    expect(doorFor("ward-sigil")).toBe("map")
    expect(doorFor("count-guards")).toBe("map")
    expect(doorFor("fungus-ormu-moss")).toBe("map")
  })

  it("leaves the story moments to Malachar", () => {
    for (const s of ["lockpick-success", "stealth-fail-solo", "sleep-nightmare", "bard-song-success", "gray-ooze-arrives"]) {
      expect(doorFor(s)).toBe("malachar")
    }
  })

  it("builds his list from the scene's clips: owned cues dropped, blanks dropped, no repeats", () => {
    // the live catalogue's filmed action states for the pen + generic, 2026-11-10
    const filmed = [
      "notice-success", "navigation-fail", "forced-march-fail", "alchemy-critical-failure",
      "bard-song-success", "count-guards", "count-guards", "gray-ooze-arrives", "lockpick-success",
      "sharpen-shard", "sleep-nightmare", "stealth-fail-solo", "ward-sigil", null, " ",
    ]
    expect(cuesForMalachar(filmed)).toEqual([
      "bard-song-success", "gray-ooze-arrives", "lockpick-success", "sharpen-shard", "sleep-nightmare", "stealth-fail-solo",
    ])
  })

  it("no cue has two doors", () => {
    expect(ENGINE_CUES.filter((c) => MAP_CUES.includes(c))).toEqual([])
  })
})
