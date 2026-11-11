import { describe, expect, it } from "vitest"
import { pickupPlan, rowsToMint } from "./floor-holder"

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

describe("rowsToMint: a container's unique things get real rows, once", () => {
  it("a fresh body with one hand crossbow needs one row", () => {
    expect(rowsToMint({ qty: 1, taken: 0, have: 0, stackable: false, inCatalogue: true })).toBe(1)
  })
  it("already minted, or already taken, needs none", () => {
    expect(rowsToMint({ qty: 1, taken: 0, have: 1, stackable: false, inCatalogue: true })).toBe(0)
    expect(rowsToMint({ qty: 1, taken: 1, have: 0, stackable: false, inCatalogue: true })).toBe(0)
  })
  it("two coils of rope, one taken before this shipped, needs one", () => {
    expect(rowsToMint({ qty: 2, taken: 1, have: 0, stackable: false, inCatalogue: true })).toBe(1)
  })
  it("coins and bolts stay counts; a thing not in the catalogue is never made", () => {
    expect(rowsToMint({ qty: 20, taken: 0, have: 0, stackable: true, inCatalogue: true })).toBe(0)
    expect(rowsToMint({ qty: 1, taken: 0, have: 0, stackable: false, inCatalogue: false })).toBe(0)
  })
})
