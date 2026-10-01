import { describe, expect, it } from "vitest"
import { RUNE_RIDER, RUNE_SCHOOLS, canInscribe, hasArcana, isArcane, isRuneSchool } from "./alchemy-runes"
import { brewAtBench, type BenchIngredient } from "./alchemy-bench"
import type { Grid } from "./eat-it-and-see"

const kenta = { name: "Kenta", class: "Sorcerer", sheet_skill_proficiencies: {} }
const samson = { name: "Samson", class: "Cleric", sheet_skill_proficiencies: { Arcana: "proficient" } }
const fifi = { name: "Fifi", class: "Rogue", sheet_skill_proficiencies: { arcana: "proficient" } }

describe("who can inscribe", () => {
  it("arcane casters only; divine is not arcane", () => {
    expect(isArcane({ class: "Sorcerer" })).toBe(true)
    expect(isArcane({ class: "Bard" })).toBe(true)
    expect(isArcane({ class: "Cleric" })).toBe(false)
  })

  it("an arcane caster with the mark and a material can", () => {
    expect(canInscribe(kenta, [{ school: "illusion", learned_via: "found" }], "illusion", 1).ok).toBe(true)
  })

  it("nobody can without the mark", () => {
    expect(canInscribe(kenta, [], "illusion", 3).ok).toBe(false)
  })

  it("nobody can without a material", () => {
    expect(canInscribe(kenta, [{ school: "illusion", learned_via: "found" }], "illusion", 0).ok).toBe(false)
  })

  it("a cleric never can — not even trained in Arcana with a taught mark (divine is not arcane)", () => {
    expect(canInscribe(samson, [{ school: "abjuration", learned_via: "found" }], "abjuration", 1).ok).toBe(false)
    expect(canInscribe(samson, [{ school: "abjuration", learned_via: "taught" }], "abjuration", 1).ok).toBe(false)
  })

  it("the second door: a non-caster with Arcana and a TAUGHT mark can; a FOUND one cannot", () => {
    expect(canInscribe(fifi, [{ school: "conjuration", learned_via: "taught" }], "conjuration", 1).ok).toBe(true)
    expect(canInscribe(fifi, [{ school: "conjuration", learned_via: "found" }], "conjuration", 1).ok).toBe(false)
  })

  it("reads Arcana whatever the key's case", () => {
    expect(hasArcana({ Arcana: "proficient" })).toBe(true)
    expect(hasArcana({ arcana: "expertise" })).toBe(true)
    expect(hasArcana({ Stealth: "proficient" })).toBe(false)
  })
})

describe("riders", () => {
  it("has an entry for all eight schools; only evocation adds no condition (its rune IS the tier)", () => {
    expect(RUNE_SCHOOLS.length).toBe(8)
    for (const s of RUNE_SCHOOLS) expect(s in RUNE_RIDER).toBe(true)
    expect(RUNE_SCHOOLS.filter((s) => RUNE_RIDER[s] === null)).toEqual(["evocation"])
    expect(isRuneSchool("evocation")).toBe(true)
    expect(isRuneSchool("pyromancy")).toBe(false)
  })

  it("the bench arithmetic still holds with a rune: evocation +1 tier, abjuration -1, necromancy +1", () => {
    const g1: Grid = ["restore-health", "rot", "darksight", "sicken"]
    const g2: Grid = ["restore-health", "long-march", "keen-scent", "corrode"]
    const ing = (slug: string, grid: Grid): BenchIngredient => ({ slug, name: slug, grid, knownColumns: [1, 2, 3, 4], have: 1 })
    const base = { ingredients: [ing("a", g1), ing("b", g2)], check: 12, die: 12, proficient: false }
    const plain = brewAtBench(base)
    const evo = brewAtBench({ ...base, rune: "evocation" })
    const abj = brewAtBench({ ...base, rune: "abjuration" })
    const nec = brewAtBench({ ...base, rune: "necromancy" })
    if (!plain.ok || !evo.ok || !abj.ok || !nec.ok) throw new Error("expected brews")
    expect(evo.potency).toBe(plain.potency + 1)
    expect(abj.impurity).toBe(plain.impurity - 1)
    expect(nec.impurity).toBe(plain.impurity + 1)
  })
})
