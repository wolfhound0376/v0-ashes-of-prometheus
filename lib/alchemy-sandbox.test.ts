import { describe, expect, it } from "vitest"
import { SANDBOX_CHARACTER_ID, STOCK, isSandboxCharacter, sandboxSheet, stockRows, type CatalogRow } from "./alchemy-sandbox"

const grid = ["restore-health", "darksight", "resist-poison", "steady-nerve"]
const cat: CatalogRow[] = [
  { id: "i1", slug: "bluecap", name: "Bluecap", alchemy_effects: grid, properties: { extraction: "grind" } },
  { id: "i2", slug: "darklake-stout", name: "Darklake Stout", properties: { drink: { class: "beer", save_dc: 10, steps_per_drink: 1 } } },
  { id: "i3", slug: "holy-water", name: "Holy Water (flask)" },
  { id: "i4", slug: "rune-chalk", name: "Rune Chalk" },
  { id: "i5", slug: "longsword", name: "Longsword" },
]

describe("alchemy sandbox stock", () => {
  const rows = stockRows(cat, () => null, "2026-10-01T00:00:00Z")

  it("stocks an ingredient both raw and already prepared", () => {
    const blue = rows.filter((r) => r.item_id === "i1")
    expect(blue.map((r) => [r.name, r.quantity, Boolean(r.prep)])).toEqual([
      ["Bluecap", STOCK.rawIngredient, false],
      ["Bluecap (ground)", STOCK.preparedIngredient, true],
    ])
  })

  it("only ever stocks catalogue rows, and only the bench's kinds of thing", () => {
    expect(rows.every((r) => cat.some((c) => c.id === r.item_id))).toBe(true)
    expect(rows.some((r) => r.item_id === "i5")).toBe(false)
    expect(rows.find((r) => r.item_id === "i2")?.quantity).toBe(STOCK.drink)
    expect(rows.find((r) => r.item_id === "i3")?.quantity).toBe(STOCK.holyWater)
    expect(rows.find((r) => r.item_id === "i4")?.quantity).toBe(STOCK.runeMaterial)
  })

  it("belongs to the practice character and nobody else", () => {
    expect(rows.every((r) => r.character_id === SANDBOX_CHARACTER_ID)).toBe(true)
    expect(isSandboxCharacter(SANDBOX_CHARACTER_ID)).toBe(true)
    expect(isSandboxCharacter("d00aa5b8-ced1-477d-9ec8-0861cca55498")).toBe(false)
  })

  it("is never a player and never in the party", () => {
    for (const cls of ["Wizard", "Cleric"] as const) {
      const s = sandboxSheet(cls)
      expect([s.is_player, s.in_party, s.character_type]).toEqual([false, false, "npc"])
    }
  })
})
