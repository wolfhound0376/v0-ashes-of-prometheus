import { describe, expect, it } from "vitest"
import { hpAfterSlap } from "./whistle-slap"

describe("the slap for whistling a guard into the pen", () => {
  it("costs one hit point", () => {
    expect(hpAfterSlap(8)).toBe(7)
    expect(hpAfterSlap(2)).toBe(1)
  })
  it("never drops him and never heals", () => {
    expect(hpAfterSlap(1)).toBe(1)
    expect(hpAfterSlap(0)).toBe(0)
    expect(hpAfterSlap(-3)).toBe(0)
    expect(hpAfterSlap(null)).toBe(0)
    expect(hpAfterSlap(Number.NaN)).toBe(0)
  })
})
