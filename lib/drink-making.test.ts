import { describe, expect, it } from "vitest"
import { canMake, clericOnly, needsStill } from "./drink-making"

const stout = { class: "beer", save_dc: 10, steps_per_drink: 1, maker: "any brewer", made_from: ["bluecap"] }
const brandy = { class: "liquor", save_dc: 14, steps_per_drink: 2, maker: "any brewer, needs a still", made_from: ["torchstalk", "barrelstalk"] }
const communion = { class: "wine", save_dc: 12, steps_per_drink: 1, maker: "cleric only", made_from: ["mushroom-wine"] }
const fifi = { name: "Fifi", class: "Rogue" }
const samson = { name: "Samson", class: "Cleric" }

describe("making a drink", () => {
  it("beer: any brewer with the (prepared) mash", () => {
    expect(canMake("Darklake Stout", stout, { character: fifi, have: { bluecap: 1 }, hasStill: false }).ok).toBe(true)
    expect(canMake("Darklake Stout", stout, { character: fifi, have: {}, hasStill: false }).ok).toBe(false)
  })

  it("liquor needs a still", () => {
    expect(needsStill(brandy)).toBe(true)
    expect(canMake("Torchstalk Brandy", brandy, { character: fifi, have: { torchstalk: 1, barrelstalk: 1 }, hasStill: false }).ok).toBe(false)
    expect(canMake("Torchstalk Brandy", brandy, { character: fifi, have: { torchstalk: 1, barrelstalk: 1 }, hasStill: true }).ok).toBe(true)
  })

  it("wine is a cleric's work", () => {
    expect(clericOnly(communion)).toBe(true)
    expect(canMake("Communion Wine", communion, { character: fifi, have: { "mushroom-wine": 1 }, hasStill: false }).ok).toBe(false)
    expect(canMake("Communion Wine", communion, { character: samson, have: { "mushroom-wine": 1 }, hasStill: false }).ok).toBe(true)
  })

  it("refuses a drink nobody has written a recipe for, rather than inventing one", () => {
    expect(canMake("Mystery", { class: "beer", save_dc: 10, steps_per_drink: 1 }, { character: fifi, have: {}, hasStill: true }).ok).toBe(false)
  })
})
