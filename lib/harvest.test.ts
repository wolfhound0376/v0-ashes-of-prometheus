import { describe, expect, it } from "vitest"
import { bodyKit, crNumber, rarityForCr } from "./harvest"

describe("Xanathar's harvest band (XGE pp. 128-129)", () => {
  it("reads the bestiary's CR strings", () => {
    expect(crNumber("1/4")).toBe(0.25)
    expect(crNumber("1/8")).toBe(0.125)
    expect(crNumber("13")).toBe(13)
    expect(crNumber(null)).toBeNull()
    expect(crNumber("?")).toBeNull()
  })

  it("puts each CR in the book's band", () => {
    expect(rarityForCr("0")).toBe("common")          // below the table: common
    expect(rarityForCr("1/2")).toBe("common")
    expect(rarityForCr("1")).toBe("common")
    expect(rarityForCr("3")).toBe("common")
    expect(rarityForCr("4")).toBe("uncommon")
    expect(rarityForCr("8")).toBe("uncommon")
    expect(rarityForCr("9")).toBe("rare")
    expect(rarityForCr("12")).toBe("rare")
    expect(rarityForCr("13")).toBe("very_rare")
    expect(rarityForCr("18")).toBe("very_rare")
    expect(rarityForCr("19")).toBe("legendary")
    expect(rarityForCr(null)).toBeNull()
  })
})

describe("bodyKit: the DB harvest wins, the TS kit is the fallback", () => {
  const beetle = [{ slug: "giant-fire-beetle-gland", qty: 2 }, { slug: "beetle-meat", qty: 1 }]
  it("uses the harvest rows for a creature with no kit", () => {
    expect(bodyKit("giant-fire-beetle", beetle)).toEqual(beetle)
  })
  it("replaces the stop-gap creature parts when the table has rows", () => {
    const rows = [{ slug: "quaggoth-pelt", qty: 1, note: "a shaggy white pelt" }]
    expect(bodyKit("quaggoth", rows)).toEqual(rows)
  })
  it("keeps a drow's kit and adds parts after it", () => {
    const kit = bodyKit("drow-guard-male", [{ slug: "x-part", qty: 1 }])!
    expect(kit.at(-1)).toEqual({ slug: "x-part", qty: 1 })
    expect(kit.length).toBeGreaterThan(1)
  })
  it("falls back to lib/walk-loot.ts with no rows or no table", () => {
    expect(bodyKit("giant-spider", null)?.map((e) => e.slug)).toEqual(["spider-venom-gland", "giant-spider-silk", "spider-meat"])
    expect(bodyKit("giant-fire-beetle", [])).toBeUndefined()
  })
})
