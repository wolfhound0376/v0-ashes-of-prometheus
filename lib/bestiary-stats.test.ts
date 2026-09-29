import { describe, expect, it } from "vitest"
import { hasPlayableStats } from "./bestiary-stats"

// Shapes of real rows (bestiary, 2026-09-29).
describe("hasPlayableStats", () => {
  it("accepts a sourced row", () => {
    expect(hasPlayableStats({ stats_status: "sourced", hp: 82, ac: 15 })).toBe(true) // vampire-spawn
  })
  it("refuses a needs_stats placeholder", () => {
    expect(hasPlayableStats({ stats_status: "needs_stats", hp: null, ac: null })).toBe(false) // beholder
  })
  it("refuses the flag even if someone half-filled the numbers", () => {
    expect(hasPlayableStats({ stats_status: "needs_stats", hp: 180, ac: 18 })).toBe(false)
  })
  it("refuses a row with no hit points whatever its flag says", () => {
    expect(hasPlayableStats({ stats_status: null, hp: null, ac: 12 })).toBe(false)
  })
  it("accepts a homebrew row with HP but no AC", () => {
    expect(hasPlayableStats({ stats_status: "homebrew", hp: 9, ac: null })).toBe(true) // kenta
  })
  it("accepts an older row that predates stats_status", () => {
    expect(hasPlayableStats({ hp: 7, ac: 12 })).toBe(true)
  })
  it("refuses nothing at all", () => {
    expect(hasPlayableStats(null)).toBe(false)
  })
})
