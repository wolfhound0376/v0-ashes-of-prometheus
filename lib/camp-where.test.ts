import { describe, expect, it } from "vitest"
import { campVerdict } from "./camp-where"

describe("campVerdict", () => {
  it("refuses camp inside a place's node map", () => {
    const v = campVerdict({ label: "Velkynvelve — Slave Pen", location: "Velkynvelve", sub_location: "Slave Pen", source: "subnodal" })
    expect(v.allowed).toBe(false)
    expect(v.where).toBe("Velkynvelve — Slave Pen")
    expect(v.reason).toMatch(/short rest/i)
  })

  it("allows camp out on the travel map", () => {
    expect(campVerdict({ label: "Road Marker 14", location: "Road Marker 14", source: "travel_nodes" }).allowed).toBe(true)
  })

  it("does not lock the fire when the position is unknown", () => {
    expect(campVerdict(null).allowed).toBe(true)
    expect(campVerdict({ label: null, source: "none" }).allowed).toBe(true)
  })
})

import { campPromptNote, dropBarredCamp } from "./camp-where"

describe("Malachar and the camp rule", () => {
  const inside = campVerdict({ label: "Velkynvelve — Slave Pen", source: "subnodal" })
  const road = campVerdict({ label: "Road Marker 14", source: "travel_nodes" })

  it("tells Malachar only when the party is inside a place", () => {
    expect(campPromptNote(inside)).toMatch(/Do NOT emit \[TIME:make_camp\] or \[TIME:long_rest\]/)
    expect(campPromptNote(inside)).toMatch(/short rest/)
    expect(campPromptNote(road)).toBeNull()
    expect(campPromptNote(null)).toBeNull()
  })

  it("drops make_camp and long_rest inside a place and keeps everything else", () => {
    const evs = [{ eventType: "make_camp" }, { eventType: "long_rest" }, { eventType: "short_rest" }, { eventType: "dialogue_exchange" }]
    const out = dropBarredCamp(evs, inside)
    expect(out.refused).toBe(true)
    expect(out.events.map((e) => e.eventType)).toEqual(["short_rest", "dialogue_exchange"])
  })

  it("leaves camp alone on the road", () => {
    const evs = [{ eventType: "make_camp" }, { eventType: "long_rest" }]
    expect(dropBarredCamp(evs, road)).toEqual({ events: evs, refused: false })
    expect(dropBarredCamp(evs, null).refused).toBe(false)
  })
})
