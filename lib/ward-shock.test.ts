import { describe, expect, it } from "vitest"
import { hpAfterWardShock, WARD_SHOCK_HP } from "./ward-shock"

describe("the pen ward's bite", () => {
  it("drops a healthy hero to 1 hit point", () => {
    expect(hpAfterWardShock(8)).toBe(WARD_SHOCK_HP)
    expect(hpAfterWardShock(44)).toBe(1)
    expect(hpAfterWardShock(2)).toBe(1)
  })
  it("never heals: a hero at 1 stays at 1, and one at 0 stays at 0", () => {
    expect(hpAfterWardShock(1)).toBe(1)
    expect(hpAfterWardShock(0)).toBe(0)
  })
  it("never kills and never goes negative", () => {
    expect(hpAfterWardShock(-3)).toBe(0)
    expect(hpAfterWardShock(null)).toBe(0)
    expect(hpAfterWardShock(undefined)).toBe(0)
    expect(hpAfterWardShock(Number.NaN)).toBe(0)
  })
  it("reads a fractional sheet value down, not up", () => {
    expect(hpAfterWardShock(1.9)).toBe(1)
    expect(hpAfterWardShock(5.5)).toBe(1)
  })
})
