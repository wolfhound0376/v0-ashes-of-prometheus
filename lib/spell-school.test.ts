import { describe, expect, it } from "vitest"
import { ALL_SCHOOL_RUNES, SCHOOL_RUNE, schoolOf, schoolRuneFor } from "./spell-school"
import { SPELL_SCHOOL_CODES } from "./spell-school-data"

describe("schoolOf", () => {
  it("reads the book's school, one per school", () => {
    expect(schoolOf("Fireball")).toBe("evocation")
    expect(schoolOf("Mage Armor")).toBe("abjuration")
    expect(schoolOf("Find Familiar")).toBe("conjuration")
    expect(schoolOf("Detect Magic")).toBe("divination")
    expect(schoolOf("Charm Person")).toBe("enchantment")
    expect(schoolOf("Minor Illusion")).toBe("illusion")
    expect(schoolOf("Animate Dead")).toBe("necromancy")
    expect(schoolOf("Polymorph")).toBe("transmutation")
  })

  it("does not care about case or stray whitespace", () => {
    expect(schoolOf("  fIrEbAlL  ")).toBe("evocation")
  })

  it("separates damage type from school — the whole point of this file", () => {
    // Chill Touch deals necrotic damage and is a necromancy spell: agreement.
    expect(schoolOf("Chill Touch")).toBe("necromancy")
    // Inflict Wounds also deals necrotic, but it is NOT necromancy.
    expect(schoolOf("Inflict Wounds")).toBe("necromancy")
    // Toll the Dead: necrotic damage, necromancy school.
    expect(schoolOf("Toll the Dead")).toBe("necromancy")
    // Spirit Guardians deals radiant/necrotic but is conjuration.
    expect(schoolOf("Spirit Guardians")).toBe("conjuration")
    // Sacred Flame is radiant damage and evocation, not "holy".
    expect(schoolOf("Sacred Flame")).toBe("evocation")
  })

  it("returns null rather than guessing for anything unwritten", () => {
    expect(schoolOf("Malachar's Little Joke")).toBeNull()
    expect(schoolOf("")).toBeNull()
    expect(schoolOf(null)).toBeNull()
    expect(schoolOf(undefined)).toBeNull()
  })
})

describe("schoolRuneFor", () => {
  it("gives the school's rune", () => {
    expect(schoolRuneFor("Fireball")).toBe("runeEvocation")
    expect(schoolRuneFor("Animate Dead")).toBe("runeNecromancy")
  })

  it("returns null for an unknown spell, so the kit keeps its damage-type rune", () => {
    expect(schoolRuneFor("Eldritch Blast of My Own Invention")).toBeNull()
  })
})

describe("the generated data", () => {
  it("covers the whole dataset", () => {
    expect(Object.keys(SPELL_SCHOOL_CODES).length).toBe(556)
  })

  it("uses only the eight legal codes", () => {
    const legal = new Set(["A", "C", "D", "E", "V", "I", "N", "T"])
    for (const [name, code] of Object.entries(SPELL_SCHOOL_CODES)) {
      expect(legal.has(code), `${name} -> ${code}`).toBe(true)
    }
  })

  it("is stored lowercased, or lookups would silently miss", () => {
    for (const name of Object.keys(SPELL_SCHOOL_CODES)) expect(name).toBe(name.toLowerCase())
  })

  it("resolves every spell in the dataset to a school and a rune", () => {
    for (const name of Object.keys(SPELL_SCHOOL_CODES)) {
      expect(schoolOf(name), name).not.toBeNull()
      expect(schoolRuneFor(name), name).toMatch(/^rune[A-Z]/)
    }
  })

  it("names exactly eight runes, all distinct", () => {
    expect(ALL_SCHOOL_RUNES).toHaveLength(8)
    expect(new Set(ALL_SCHOOL_RUNES).size).toBe(8)
    expect(new Set(Object.values(SCHOOL_RUNE)).size).toBe(8)
  })

  it("every school reachable from real spell names", () => {
    const seen = new Set(Object.keys(SPELL_SCHOOL_CODES).map((n) => schoolOf(n)))
    expect(seen.size).toBe(8)
  })
})
