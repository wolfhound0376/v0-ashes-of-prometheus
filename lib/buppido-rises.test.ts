import { describe, expect, it } from "vitest"
import { buppidoRisesActive, buppidoRisesInPen, buppidoRisesLedgePlate, buppidoRisesLedgeTarget, buppidoRisesLedgeSpotted, buppidoRisesShoveWins } from "./buppido-rises.mjs"

describe("Buppido rises anywhere (Sam, 2026-11-15)", () => {
  it("fires for Buppido on any plate, once", () => {
    expect(buppidoRisesActive({ deadId: "buppido", plate: 11 })).toBe(true)
    expect(buppidoRisesActive({ deadId: "buppido", plate: "road-rope-bridge" })).toBe(true)
    expect(buppidoRisesActive({ deadId: "buppido", plate: "road-rope-bridge", fired: true })).toBe(false)
    expect(buppidoRisesActive({ deadId: "eldeth", plate: 11 })).toBe(false)
  })
  it("keeps the stone and the audience for the pen only", () => {
    expect(buppidoRisesInPen(11)).toBe(true)
    expect(buppidoRisesInPen("5c")).toBe(false)
  })
})

describe("the ledge (OotA guide p.10)", () => {
  it("knows its ledges", () => {
    expect(buppidoRisesLedgePlate("road-rope-bridge")).toBe(true)
    expect(buppidoRisesLedgePlate(11)).toBe(false)
  })
  it("goes for a hero with nobody within 30 ft, the nearest one", () => {
    const b = { x: 0, y: 0 }
    const near = { id: "kenta", x: 100, y: 0 }, far = { id: "samson", x: 500, y: 0 }, mate = { x: 110, y: 0 }
    expect(buppidoRisesLedgeTarget({ heroes: [near, far], others: [mate], buppido: b, pxPerFt: 1 })?.id).toBe("samson")
    expect(buppidoRisesLedgeTarget({ heroes: [near], others: [mate], buppido: b, pxPerFt: 1 })).toBeNull()
    expect(buppidoRisesLedgeTarget({ heroes: [near, { ...far, down: true }], others: [], buppido: b, pxPerFt: 1 })?.id).toBe("kenta")
  })
  it("is seen when passive Perception meets his Stealth, and a tied shove changes nothing", () => {
    expect(buppidoRisesLedgeSpotted(12, 12)).toBe(true)
    expect(buppidoRisesLedgeSpotted(11, 12)).toBe(false)
    expect(buppidoRisesShoveWins(10, 10)).toBe(false)
    expect(buppidoRisesShoveWins(11, 10)).toBe(true)
  })
})
