import { describe, expect, it } from "vitest"
import { pickupPlan } from "./floor-holder"

describe("pickupPlan: what happens to the row parked under a pile", () => {
  it("a dropped dagger comes back as the SAME row", () => {
    expect(pickupPlan({ parkedRowFound: true, stackable: false, takerHasStack: false })).toBe("move-row")
  })
  it("a unique item never merges, even if the taker has another of the kind", () => {
    expect(pickupPlan({ parkedRowFound: true, stackable: false, takerHasStack: true })).toBe("move-row")
  })
  it("a stackable joins the taker's stack; with no stack the row itself moves", () => {
    expect(pickupPlan({ parkedRowFound: true, stackable: true, takerHasStack: true })).toBe("merge-into-stack")
    expect(pickupPlan({ parkedRowFound: true, stackable: true, takerHasStack: false })).toBe("move-row")
  })
  it("a pile with no row under it (DM-placed, or from before this change) makes a new row", () => {
    expect(pickupPlan({ parkedRowFound: false, stackable: false, takerHasStack: false })).toBe("mint-new")
  })
})
