import { describe, expect, it } from "vitest"
import { MAX_PER_ITEM, isHaulIn, matchCharacter, planHaul, poolAfter, shortName, type CatalogRow } from "./camp-haul"

const row = (slug: string): CatalogRow => ({ id: "id-" + slug, slug, name: slug, item_type: "consumable", weight: 0.1, value: 0, description: null })
const catalog = [row("trillimac"), row("waterorb"), row("rothe-meat")]

describe("planHaul — nothing invented", () => {
  it("resolves known slugs, merges duplicates, rejects the unknown by name", () => {
    const p = planHaul({ mode: "forage", supplies_delta: 3, items: [{ slug: "trillimac", quantity: 2 }, { slug: "Trillimac ", quantity: 1 }, { slug: "glowcap-of-doom", quantity: 1 }] }, catalog)
    expect(p.supplies_delta).toBe(3)
    expect(p.items).toEqual([{ item: catalog[0], quantity: 3 }])
    expect(p.rejected).toEqual([{ slug: "glowcap-of-doom", quantity: 1, reason: "not in the catalog" }])
  })

  it("drops zero and negative quantities, caps the absurd, and refuses non-slugs", () => {
    const p = planHaul({ mode: "hunt", supplies_delta: 2, items: [{ slug: "waterorb", quantity: 0 }, { slug: "rothe-meat", quantity: 999 }, { slug: "DROP TABLE", quantity: 1 }] }, catalog)
    expect(p.items).toEqual([{ item: catalog[2], quantity: MAX_PER_ITEM }])
    expect(p.flags.some((f) => f.includes("capped"))).toBe(true)
    expect(p.rejected[0]).toMatchObject({ slug: "DROP TABLE", reason: "not a slug" })
  })

  it("only a rest may take food away", () => {
    expect(planHaul({ mode: "forage", supplies_delta: -5, items: [] }, catalog).supplies_delta).toBe(0)
    expect(planHaul({ mode: "rest", supplies_delta: -20, items: [] }, catalog).supplies_delta).toBe(-20)
    expect(planHaul({ mode: "rest", supplies_delta: -5000, items: [] }, catalog).supplies_delta).toBe(-200)
  })

  it("the pool never goes negative", () => {
    expect(poolAfter(7, -20)).toBe(0)
    expect(poolAfter(null, 4)).toBe(4)
    expect(poolAfter(12, -5)).toBe(7)
  })

  it("validates the wire shape", () => {
    expect(isHaulIn({ mode: "forage", supplies_delta: 1, items: [] })).toBe(true)
    expect(isHaulIn({ mode: "picnic", supplies_delta: 1, items: [] })).toBe(false)
    expect(isHaulIn({ mode: "forage", supplies_delta: "1", items: [] })).toBe(false)
    expect(isHaulIn({ mode: "forage", supplies_delta: 1, items: [{ slug: 1, quantity: 1 }] })).toBe(false)
  })
})

describe("matchCharacter — the page's short names against the sheets", () => {
  const pcs = [
    { id: "a", name: "Fifi of Copperas Cove" },
    { id: "b", name: "Kenta" },
    { id: "c", name: "Samson" },
    { id: "d", name: "Scott" },
    { id: "e", name: "Bastet" },
  ]
  it("matches by id, exact name, then first word", () => {
    expect(matchCharacter("a", pcs)?.name).toBe("Fifi of Copperas Cove")
    expect(matchCharacter("kenta", pcs)?.id).toBe("b")
    expect(matchCharacter("Fifi", pcs)?.id).toBe("a")
  })
  it("refuses to guess between two claimants", () => {
    const twins = [...pcs, { id: "f", name: "Fifi the Second" }]
    expect(matchCharacter("Fifi", twins)).toBeNull()
    expect(matchCharacter("", pcs)).toBeNull()
    expect(matchCharacter("Ront", pcs)).toBeNull()
  })
  it("shortens the way the page expects", () => {
    expect(shortName("Fifi of Copperas Cove")).toBe("Fifi")
    expect(shortName("  Scott ")).toBe("Scott")
  })
})
