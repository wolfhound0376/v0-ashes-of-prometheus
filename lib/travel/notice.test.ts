import { describe, expect, it } from "vitest"
import { DEFAULT_NOTICE_DC, noticeAt, noticeSpec } from "./notice"
import { arrivalCue } from "./stingers"

describe("noticeSpec — the node's authored DC", () => {
  it("defaults to Sam's 12 and reads the authored fields", () => {
    expect(noticeSpec(null)).toEqual({ dc: DEFAULT_NOTICE_DC, reveals: null, text: null })
    expect(noticeSpec({ notice_dc: 15, notice_reveals: " wp--x--03 ", notice_text: "tracks" })).toEqual({ dc: 15, reveals: "wp--x--03", text: "tracks" })
    expect(noticeSpec({ notice_dc: "nonsense" }).dc).toBe(DEFAULT_NOTICE_DC)
  })
})

describe("noticeAt — passive Perception, best eyes in the party", () => {
  const spec = { dc: 12, reveals: "hidden-pool", text: "a glint of water" }
  it("the sharpest passive score decides, no dice", () => {
    const r = noticeAt(spec, [{ id: "a", name: "Kenta", passive: 10 }, { id: "b", name: "Fifi", passive: 13 }])
    expect(r.noticed).toBe(true)
    expect(r.best?.name).toBe("Fifi")
    expect(r.margin).toBe(1)
    expect(r.reveals).toBe("hidden-pool")
    expect(r.chip).toBe("Fifi's eyes · passive 13 vs DC 12 · noticed")
  })
  it("a miss reveals nothing and still names the eyes", () => {
    const r = noticeAt(spec, [{ id: "a", name: "Kenta", passive: 11 }])
    expect(r.noticed).toBe(false)
    expect(r.reveals).toBeNull()
    expect(r.text).toBeNull()
    expect(r.chip).toMatch(/missed$/)
  })
  it("an empty march never notices", () => {
    const r = noticeAt(spec, [])
    expect(r.noticed).toBe(false)
    expect(r.best).toBeNull()
  })
})

describe("arrivalCue — which of the five cues a node earns", () => {
  const base = { haltKind: "none", nodeType: "waypoint", firstVisit: true, revealed: false }
  it("a fight is a fight, even at the gates", () => {
    expect(arrivalCue({ ...base, haltKind: "encounter", nodeType: "location" })).toBe("hazard")
    expect(arrivalCue({ ...base, haltKind: "forced_march" })).toBe("hazard")
  })
  it("nightfall before wonder; a great place before a discovery; a reveal before silence", () => {
    expect(arrivalCue({ ...base, haltKind: "camp", nodeType: "location" })).toBe("nightfall")
    expect(arrivalCue({ ...base, nodeType: "location" })).toBe("great-place")
    expect(arrivalCue({ ...base, nodeType: "location", firstVisit: false })).toBe("quiet")
    expect(arrivalCue({ ...base, revealed: true })).toBe("discovery")
    expect(arrivalCue({ ...base })).toBe("quiet")
  })
})
