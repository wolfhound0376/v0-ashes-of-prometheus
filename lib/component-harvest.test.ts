import { describe, expect, it } from "vitest"
import { SPELL_COMPONENTS } from "./spell-component-data"
import { componentTextFor } from "./alchemy-ingredients"
import {
  HARVEST_TABLE,
  type BestiaryRow,
  harvestReport,
  harvestableSpells,
  spellsFedBy,
  supplyFor,
} from "./component-harvest"

// A slice of the live bestiary (129 rows on 2026-09-29), chosen to cover every
// kind the matcher recognises plus the kinds the Underdark does NOT have.
const bestiary: BestiaryRow[] = [
  { slug: "giant-bat", name: "Giant Bat", creature_type: "beast" },
  { slug: "swarm-of-bats", name: "Swarm of Bats", creature_type: "swarm of Tiny beasts" },
  { slug: "giant-spider", name: "Giant Spider", creature_type: "beast" },
  { slug: "phase-spider", name: "Phase Spider", creature_type: "monstrosity" },
  { slug: "female-steeder", name: "Female Steeder", creature_type: "beast" },
  { slug: "giant-fire-beetle", name: "Giant Fire Beetle", creature_type: "beast" },
  { slug: "deep-rothe", name: "Deep Rothé", creature_type: "beast" },
  { slug: "giant-rat", name: "Giant Rat", creature_type: "beast" },
  { slug: "umber-hulk", name: "Umber Hulk", creature_type: "monstrosity" },
  { slug: "ancient-deep-dragon", name: "Ancient Deep Dragon", creature_type: "dragon" },
  { slug: "drow", name: "Drow", creature_type: "humanoid (elf)" },
  { slug: "quaggoth", name: "Quaggoth", creature_type: "humanoid (quaggoth)" },
  { slug: "shrieker", name: "Shrieker", creature_type: "plant" },
]

describe("the harvest table is anchored to the book", () => {
  it("every phrase occurs verbatim in that spell's component text", () => {
    for (const row of HARVEST_TABLE) {
      const text = componentTextFor(row.spell)
      expect(text, `${row.spell} is not in the component data`).not.toBeNull()
      expect(text!, `${row.spell}: phrase drifted from the text`).toContain(row.phrase)
    }
  })

  it("covers exactly the creature-sourced spells, no more and no fewer", () => {
    const flagged = SPELL_COMPONENTS.filter((c) => c.creatureSourced).map((c) => c.spell).sort()
    const mapped = HARVEST_TABLE.map((h) => h.spell).sort()
    expect(mapped).toEqual(flagged)
  })

  it("does not carry Heroes' Feast, which names no creature", () => {
    // It survived the first keyword sweep and was caught here, when it had
    // nothing to map to. This test is what keeps it out.
    expect(HARVEST_TABLE.some((h) => h.spell === "Heroes' Feast")).toBe(false)
    expect(componentTextFor("Heroes' Feast")).not.toContain("feather")
  })

  it("gives every row at least one source", () => {
    for (const row of HARVEST_TABLE) expect(row.sources.length).toBeGreaterThan(0)
  })
})

describe("matching against a bestiary", () => {
  it("finds the umber hulk for Guards and Wards", () => {
    const s = supplyFor("Guards and Wards", bestiary)!
    expect(s.satisfiable).toBe(true)
    expect(s.bySource[0].suppliers.map((r) => r.slug)).toEqual(["umber-hulk"])
  })

  it("finds spiders for Web, steeder included", () => {
    const s = supplyFor("Web", bestiary)!
    expect(s.bySource[0].suppliers.map((r) => r.slug)).toEqual([
      "giant-spider", "phase-spider", "female-steeder",
    ])
  })

  it("counts both bat rows for Fireball", () => {
    expect(supplyFor("Fireball", bestiary)!.bySource[0].suppliers).toHaveLength(2)
  })

  it("reports the gap rather than substituting: no birds in the Underdark", () => {
    for (const spell of ["Fly", "Feather Fall", "Fear", "Wind Wall"]) {
      const s = supplyFor(spell, bestiary)!
      expect(s.satisfiable, `${spell} should not be satisfiable`).toBe(false)
      expect(s.bySource.every((b) => b.suppliers.length === 0)).toBe(true)
    }
  })

  it("no sheep either, so every fleece illusion is unsupplied", () => {
    for (const spell of ["Minor Illusion", "Silent Image", "Major Image", "Phantasmal Force"]) {
      expect(supplyFor(spell, bestiary)!.satisfiable).toBe(false)
    }
  })

  it("a deep dragon supplies the generic dragon scale but not the red one", () => {
    expect(supplyFor("Fizban's Platinum Shield (UA)", bestiary)!.satisfiable).toBe(true)
    expect(supplyFor("Aganazzar's Scorcher", bestiary)!.satisfiable).toBe(false)
  })

  it("treats caster- and target-supplied components as satisfiable without a monster", () => {
    const s = supplyFor("Clone", bestiary)!
    expect(s.satisfiable).toBe(true)
    expect(s.bySource[0].suppliers).toHaveLength(0)
  })

  it("returns null for a spell not in the table", () => {
    expect(supplyFor("Magic Missile", bestiary)).toBeNull()
  })

  it("requires ALL sources — an eggshell and a snakeskin glove", () => {
    const s = supplyFor("Bigby's Hand", bestiary)!
    expect(s.bySource).toHaveLength(2)
    expect(s.satisfiable).toBe(false) // no bird and no snake in this bestiary
  })
})

describe("harvestReport", () => {
  it("splits supplied from unsupplied and names what is missing", () => {
    const r = harvestReport(bestiary)
    expect(r.supplied.length + r.unsupplied.length).toBe(
      HARVEST_TABLE.filter((h) => !h.spell.includes("(UA)")).length,
    )
    expect(r.summary).toContain("any bird")
    expect(r.summary).toContain("any sheep")
  })

  it("excludes Unearthed Arcana unless asked", () => {
    const published = harvestReport(bestiary)
    const withUA = harvestReport(bestiary, true)
    expect(withUA.supplied.length + withUA.unsupplied.length).toBeGreaterThan(
      published.supplied.length + published.unsupplied.length,
    )
  })

  it("answers what one corpse is worth", () => {
    const bat = spellsFedBy("giant-bat", bestiary)
    expect(bat).toContain("Fireball")
    expect(bat).toContain("Darkness")
    expect(bat).toContain("Arcane Eye")
    expect(spellsFedBy("shrieker", bestiary)).toEqual([]) // a plant feeds nothing here
  })

  it("never names a creature the bestiary does not hold", () => {
    const r = harvestReport(bestiary, true)
    const slugs = new Set(bestiary.map((b) => b.slug))
    for (const s of [...r.supplied, ...r.unsupplied]) {
      for (const bs of s.bySource) {
        for (const sup of bs.suppliers) expect(slugs.has(sup.slug)).toBe(true)
      }
    }
    for (const k of Object.keys(r.byCreature)) expect(slugs.has(k)).toBe(true)
  })

  it("handles an empty bestiary without throwing", () => {
    const r = harvestReport([])
    expect(r.supplied.every((s) => s.bySource.every((b) => b.source.kind === "self-or-target"))).toBe(true)
  })

  it("exposes the component rows for the mapped spells", () => {
    expect(harvestableSpells()).toHaveLength(HARVEST_TABLE.length)
  })
})
