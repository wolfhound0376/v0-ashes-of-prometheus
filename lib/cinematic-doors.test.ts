import { describe, expect, it } from "vitest"
import { ENGINE_CUES, MAP_CUES, cueLines, cuesForMalachar, doorFor, offerToMalachar, type CueRow } from "./cinematic-doors"

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

describe("the row is the trigger", () => {
  const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498"
  const GANDALF = "614cac3d-f119-4b35-af78-766ddb510619"
  const PEN = "node-11-slave-pen"
  // the live pen + generic action rows after the 2026-11-10 migration, trimmed to what matters
  const rows: CueRow[] = [
    { state: "notice-success", fired_by: "engine", moment: "road" },
    { state: "ward-sigil", fired_by: "map", plate: PEN, moment: "sigil" },
    { state: "gray-ooze-arrives", fired_by: "malachar", plate: PEN, moment: "A gray ooze comes into the slave pen where the party is." },
    { state: "bard-song-success", fired_by: "malachar", moment: "The bard performs a song and it lands: the performance succeeded." },
    { state: "lockpick-success", fired_by: "malachar", character_id: FIFI, moment: "Fifi picks a lock and it opens: the check succeeded." },
    { state: "sleep-nightmare", fired_by: "malachar", character_id: FIFI, moment: "Fifi falls asleep and you narrate her nightmare." },
  ]
  const names = (plate: string | null, characterId: string | null) => offerToMalachar(rows, { plate, characterId }).map((c) => c.state)

  it("offers Fifi her own films in the pen, and never the engine's or the map's", () => {
    expect(names(PEN, FIFI)).toEqual(["gray-ooze-arrives", "bard-song-success", "lockpick-success", "sleep-nightmare"])
  })

  it("does not offer Fifi's films on Gandalf's turn", () => {
    expect(names(PEN, GANDALF)).toEqual(["gray-ooze-arrives", "bard-song-success"])
  })

  it("does not offer a pen film on another plate", () => {
    expect(names("node-10b-guard-tower-lower", GANDALF)).toEqual(["bard-song-success"])
  })

  it("still offers a plated film when the plate is not known (as before plates existed)", () => {
    expect(names(null, GANDALF)).toContain("gray-ooze-arrives")
  })

  it("never offers a retired film", () => {
    expect(offerToMalachar([{ state: "bard-song-success", fired_by: "malachar", retired: true }], { plate: null, characterId: null })).toEqual([])
  })

  it("the row can narrow but never widen: a row mislabelled malachar for an engine cue is still withheld", () => {
    expect(offerToMalachar([{ state: "notice-success", fired_by: "malachar" }], { plate: null, characterId: null })).toEqual([])
  })

  it("a database without the new columns (names only) behaves as PR #1252 did", () => {
    expect(offerToMalachar([{ state: "notice-success" }, { state: "lockpick-success" }], { plate: PEN, characterId: null }).map((c) => c.state)).toEqual(["lockpick-success"])
  })

  it("two films for one cue are offered once, keeping a moment if either has one", () => {
    const two = offerToMalachar([{ state: "x-cue" }, { state: "x-cue", moment: "the moment" }], { plate: null, characterId: null })
    expect(two).toEqual([{ state: "x-cue", moment: "the moment" }])
  })

  it("lists each cue with what its film shows", () => {
    expect(cueLines([{ state: "a", moment: "what a shows" }, { state: "b", moment: null }])).toBe("- a: what a shows\n- b")
  })
})
