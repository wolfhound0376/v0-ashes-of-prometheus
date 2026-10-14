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
