import { describe, expect, it } from "vitest"
import { PLATE_OPTIONS, clipWarnings, heroNamedButUnbound, isFiredBy, isPlate, summarizeRequests, type RequestRow } from "./cinematic-health"

const PEN = "Scene_1_Velkynvelve (slave pen)"
const row = (o: Partial<RequestRow>): RequestRow => ({
  req_location: PEN, req_state: null, req_kind: "action", resolution: "exact", resolved_clip_id: null, character_id: null, created_at: "2026-11-10T20:00:00Z", ...o,
})

describe("summarizeRequests", () => {
  const names = { fifi: "Fifi of Waterdeep", gan: "Gandalf" }
  const clips = [{ location: PEN, state: "count-guards", kind: "action", video_url: "x.mp4" }, { location: PEN, state: "fungus-ormu-moss", kind: "action", video_url: null }]

  it("says how often a film was served, when last, and to whom", () => {
    const h = summarizeRequests([
      row({ resolved_clip_id: "c1", character_id: "fifi", created_at: "2026-11-01T00:00:00Z" }),
      row({ resolved_clip_id: "c1", character_id: "gan", created_at: "2026-11-10T00:00:00Z" }),
      row({ resolved_clip_id: "c1", character_id: "fifi", created_at: "2026-11-05T00:00:00Z" }),
      row({ resolved_clip_id: "c1", character_id: null }),
    ], names, clips)
    expect(h.byClip.c1.served).toBe(4)
    expect(h.byClip.c1.last).toBe("2026-11-10T20:00:00Z")
    expect(h.byClip.c1.to).toEqual(["Fifi of Waterdeep", "Gandalf", "an unseated window"])
  })

  it("lists what was asked for and still has no film, most-asked first", () => {
    const miss = (state: string, at = "2026-11-10T00:00:00Z") => row({ req_state: state, resolution: "miss", created_at: at })
    const h = summarizeRequests([miss("fungus-waterorb"), miss("fungus-ormu-moss"), miss("fungus-ormu-moss", "2026-11-10T09:00:00Z")], names, clips)
    expect(h.misses.map((m) => [m.state, m.asked])).toEqual([["fungus-ormu-moss", 2], ["fungus-waterorb", 1]])
    expect(h.misses[0].last).toBe("2026-11-10T09:00:00Z")
  })

  it("drops a miss once that cue has film, and never counts 'seen' or 'rejected' as a gap", () => {
    const h = summarizeRequests([
      row({ req_state: "count-guards", resolution: "miss" }),
      row({ req_state: "sleep-nightmare", resolution: "seen" }),
      row({ req_state: "whatever", resolution: "rejected" }),
    ], names, clips)
    expect(h.misses).toEqual([])
  })
})

describe("heroNamedButUnbound", () => {
  const heroes = [{ name: "Fifi of Waterdeep" }, { name: "Gandalf" }, { name: "Kenta of Neverwinter" }]
  it("catches the film Gandalf was served", () => {
    expect(heroNamedButUnbound({ video_url: "https://x/cinematics/Velkynvelve_Fifi_StealthFail.mp4", character_id: null }, heroes)).toBe("Fifi of Waterdeep")
  })
  it("is quiet once the row is bound, and for a film named for nobody", () => {
    expect(heroNamedButUnbound({ video_url: "https://x/Velkynvelve_Fifi_StealthFail.mp4", character_id: "d00a" }, heroes)).toBeNull()
    expect(heroNamedButUnbound({ video_url: "https://x/Velkynvelve_CountingGuards_General.mp4", character_id: null }, heroes)).toBeNull()
    expect(heroNamedButUnbound({ video_url: null, character_id: null }, heroes)).toBeNull()
  })
  it("matches whole words only", () => {
    expect(heroNamedButUnbound({ video_url: "https://x/kentaurs_charge.mp4", character_id: null }, heroes)).toBeNull()
  })
})

describe("clipWarnings", () => {
  const ok = { video_url: "a.mp4", character_id: null, moment: "The bard sings.", retired: false, fired_by: "malachar" }
  it("is empty for a healthy film and for a retired one", () => {
    expect(clipWarnings(ok, [])).toEqual([])
    expect(clipWarnings({ ...ok, video_url: null, moment: null, retired: true }, [])).toEqual([])
  })
  it("names the missing film and the missing moment", () => {
    expect(clipWarnings({ ...ok, video_url: null, moment: " " }, [])).toEqual(["Awaiting film", "No moment: Malachar is guessing from the name"])
    expect(clipWarnings({ ...ok, moment: null, fired_by: "map" }, [])).toEqual(["No moment written"])
  })
})

describe("the closed lists", () => {
  it("knows the doors", () => {
    expect(isFiredBy("map")).toBe(true)
    expect(isFiredBy("player")).toBe(false)
  })
  it("offers the walk's plates, the pen among them, each once", () => {
    expect(isPlate("node-11-slave-pen")).toBe(true)
    expect(isPlate("the-moon")).toBe(false)
    expect(new Set(PLATE_OPTIONS.map((p) => p.slug)).size).toBe(PLATE_OPTIONS.length)
  })
})
