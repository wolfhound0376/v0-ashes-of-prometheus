import { describe, it, expect } from "vitest"
import {
  brewAtBench, sharedEffects, blindColumns, impurityOf, potencyOf,
  BREW_DC, BREW_MARGIN, MAX_IMPURITY, CRIT_FAIL_CUE,
  type BenchIngredient, type BrewInput,
} from "@/lib/alchemy-bench"
import type { Grid } from "@/lib/eat-it-and-see"

// Real rows off the seeded catalogue (claude/claude_Alchemy_Grid.md).
const RIPPLEBARK: Grid = ["restore-health", "rot", "long-march", "purge-disease"]
const BLUECAP: Grid = ["sicken", "long-march", "purge-disease", "steady-nerve"]
const BLIND_CAVE_FISH: Grid = ["darksight", "resist-poison", "soft-step", "mind-link"]
const FIRE_LICHEN: Grid = ["burning-blood", "steady-nerve", "resist-poison", "wakefulness"]
const GRAY_OOZE: Grid = ["corrode", "numbing-venom", "rot", "sicken"]

function ing(slug: string, name: string, grid: Grid, knownColumns: number[] = [], have = 1): BenchIngredient {
  return { slug, name, grid, knownColumns, have }
}

const ripplebark = (known: number[] = []) => ing("ripplebark", "Ripplebark", RIPPLEBARK, known)
const bluecap = (known: number[] = []) => ing("bluecap", "Bluecap", BLUECAP, known)

function input(over: Partial<BrewInput> = {}): BrewInput {
  return {
    ingredients: [ripplebark(), bluecap()],
    check: 15,
    die: 11,
    proficient: true,
    ...over,
  }
}

describe("sharedEffects", () => {
  it("returns every effect two ingredients both carry", () => {
    expect(sharedEffects([RIPPLEBARK, BLUECAP])).toEqual(["long-march", "purge-disease"])
  })
  it("returns nothing when they share nothing", () => {
    expect(sharedEffects([BLIND_CAVE_FISH, GRAY_OOZE])).toEqual([])
  })
  it("counts across three, so a pair inside a trio still lands", () => {
    expect(sharedEffects([BLIND_CAVE_FISH, FIRE_LICHEN, GRAY_OOZE])).toEqual(["resist-poison"])
  })
  it("keeps bench order rather than sorting, so the result reads as loaded", () => {
    expect(sharedEffects([BLUECAP, RIPPLEBARK])).toEqual(["long-march", "purge-disease"])
  })
})

describe("refusals — nothing is consumed on these", () => {
  it("needs at least two ingredients", () => {
    expect(brewAtBench(input({ ingredients: [ripplebark()] }))).toMatchObject({ ok: false, reason: "too_few_ingredients" })
  })
  it("takes at most three", () => {
    const four = [ripplebark(), bluecap(), ing("fire-lichen", "Fire Lichen", FIRE_LICHEN), ing("gray-ooze-residue", "Gray Ooze Residue", GRAY_OOZE)]
    expect(brewAtBench(input({ ingredients: four }))).toMatchObject({ ok: false, reason: "too_many_ingredients" })
  })
  it("refuses the same ingredient twice — it shares all four effects with itself", () => {
    expect(brewAtBench(input({ ingredients: [ripplebark(), ripplebark()] })))
      .toMatchObject({ ok: false, reason: "duplicate_ingredient" })
  })
  it("refuses a row that is not an ingredient", () => {
    expect(brewAtBench(input({ ingredients: [ripplebark(), ing("rope", "Rope", null as unknown as Grid)] })))
      .toMatchObject({ ok: false, reason: "bad_grid", detail: "rope" })
  })
  it("refuses what the character is not holding", () => {
    expect(brewAtBench(input({ ingredients: [ripplebark(), ing("bluecap", "Bluecap", BLUECAP, [], 0)] })))
      .toMatchObject({ ok: false, reason: "not_held", detail: "bluecap" })
  })
  it("refuses a die that is not a d20 face", () => {
    expect(brewAtBench(input({ die: 0 }))).toMatchObject({ ok: false, reason: "bad_check" })
    expect(brewAtBench(input({ die: 21 }))).toMatchObject({ ok: false, reason: "bad_check" })
    expect(brewAtBench(input({ die: 7.5 }))).toMatchObject({ ok: false, reason: "bad_check" })
  })
})

describe("absolute failure", () => {
  it("a natural 1 gives nothing, teaches nothing, and keeps the ingredients", () => {
    const r = brewAtBench(input({ die: 1, check: 4 }))
    expect(r).toMatchObject({ ok: true, outcome: "critical_failure" })
    if (!r.ok) throw new Error("unreachable")
    expect(r.effects).toEqual([])
    expect(r.revealed).toEqual([])
    expect(r.consumed).toEqual(["ripplebark", "bluecap"])
    expect(r.critical?.cue).toBe(CRIT_FAIL_CUE)
    expect(r.critical?.vesselDestroyed).toBe(true)
  })

  it("is decided by the FACE, not the total — a +14 brewer still blows up the bench", () => {
    // The whole point of the nat 1: proficiency lowers impurity and never
    // makes anyone immune to catastrophe.
    const r = brewAtBench(input({ die: 1, check: 15, proficient: true }))
    expect(r).toMatchObject({ outcome: "critical_failure" })
  })

  it("takes the rune with it, which is what makes a 1 hurt a caster", () => {
    const r = brewAtBench(input({ die: 1, check: 4, rune: "evocation" }))
    if (!r.ok) throw new Error("unreachable")
    expect(r.critical?.runeSpent).toBe("evocation")
  })

  it("spends no rune when none was inscribed", () => {
    const r = brewAtBench(input({ die: 1, check: 4 }))
    if (!r.ok) throw new Error("unreachable")
    expect(r.critical?.runeSpent).toBeNull()
  })
})

describe("no shared effect", () => {
  it("gives sludge and still eats the ingredients", () => {
    const r = brewAtBench(input({
      ingredients: [ing("blind-cave-fish", "Blind Cave Fish", BLIND_CAVE_FISH), ing("gray-ooze-residue", "Gray Ooze Residue", GRAY_OOZE)],
    }))
    expect(r).toMatchObject({ ok: true, outcome: "inert" })
    if (!r.ok) throw new Error("unreachable")
    expect(r.effects).toEqual([])
    expect(r.consumed).toEqual(["blind-cave-fish", "gray-ooze-residue"])
    expect(r.revealed).toEqual([])
  })
})

describe("the load-bearing rules", () => {
  it("a missed check still produces a potion — only a 1 and an empty grid give nothing", () => {
    const r = brewAtBench(input({ check: 4, die: 4, proficient: false }))
    expect(r).toMatchObject({ ok: true, outcome: "potion" })
    if (!r.ok) throw new Error("unreachable")
    expect(r.effects.length).toBeGreaterThan(0)
  })

  it("impurity 3 still produces a working potion", () => {
    const r = brewAtBench(input({
      check: 4, die: 4, proficient: false,
      recipe: { slug: "drow-field-notes", reliability: "sabotaged" },
    }))
    if (!r.ok) throw new Error("unreachable")
    expect(r.outcome).toBe("potion")
    expect(r.impurity).toBe(MAX_IMPURITY)
    expect(r.effects).toEqual(["long-march", "purge-disease"])
  })
})

describe("impurity is scored on what the brewer knew BEFORE the brew", () => {
  it("charges the blind-ingredient point AND reveals the same columns in one brew", () => {
    const r = brewAtBench(input({ proficient: true }))
    if (!r.ok) throw new Error("unreachable")
    // Neither ingredient's used columns were known, so both cost a point...
    expect(r.impurity).toBe(2)
    // ...and this is the brew that teaches them. If impurity were scored
    // after the reveal, both points would vanish and brewing blind would be free.
    expect(r.revealed).toEqual([
      { itemSlug: "ripplebark", column: 3, effect: "long-march" },
      { itemSlug: "ripplebark", column: 4, effect: "purge-disease" },
      { itemSlug: "bluecap", column: 2, effect: "long-march" },
      { itemSlug: "bluecap", column: 3, effect: "purge-disease" },
    ])
  })

  it("charges nothing once the brewer already knew the columns it used", () => {
    const r = brewAtBench(input({ ingredients: [ripplebark([3, 4]), bluecap([2, 3])] }))
    if (!r.ok) throw new Error("unreachable")
    expect(r.impurity).toBe(0)
    expect(r.revealed).toEqual([])
  })

  it("reveals only the columns the brew actually used, never the whole grid", () => {
    const r = brewAtBench(input())
    if (!r.ok) throw new Error("unreachable")
    // restore-health (ripplebark col 1) was not shared, so it stays hidden.
    expect(r.revealed.map((x) => x.effect)).not.toContain("restore-health")
    expect(r.revealed.map((x) => x.effect)).not.toContain("sicken")
  })
})

describe("blindColumns", () => {
  it("finds the used columns a brewer has not discovered", () => {
    expect(blindColumns(ripplebark([3]), ["long-march", "purge-disease"])).toEqual([4])
  })
  it("ignores columns the brew did not use", () => {
    expect(blindColumns(ripplebark(), ["long-march"])).toEqual([3])
  })
  it("returns nothing for a row with no grid rather than throwing", () => {
    expect(blindColumns(ing("rope", "Rope", null as unknown as Grid), ["long-march"])).toEqual([])
  })
})

describe("impurityOf — the spec §5 ladder", () => {
  const known = () => [ripplebark([3, 4]), bluecap([2, 3])]

  it("charges a point for no proficiency", () => {
    const r = impurityOf(input({ ingredients: known(), proficient: false }), ["long-march"])
    expect(r.value).toBe(1)
    expect(r.reasons[0]).toMatch(/proficiency/)
  })

  it("charges a point for missing the DC", () => {
    const r = impurityOf(input({ ingredients: known(), check: BREW_DC - 1 }), ["long-march"])
    expect(r.value).toBe(1)
  })

  it("charges 1 for a drifted recipe and 2 for a sabotaged one", () => {
    const drift = impurityOf(input({ ingredients: known(), recipe: { slug: "r", reliability: "drifted" } }), ["long-march"])
    const sabo = impurityOf(input({ ingredients: known(), recipe: { slug: "r", reliability: "sabotaged" } }), ["long-march"])
    expect(drift.value).toBe(1)
    expect(sabo.value).toBe(2)
  })

  it("charges nothing for a recipe that is honest", () => {
    const r = impurityOf(input({ ingredients: known(), recipe: { slug: "r", reliability: "true" } }), ["long-march"])
    expect(r.value).toBe(0)
  })

  it("forgives a point for abjuration and for the earned-proficiency milestone", () => {
    const r = impurityOf(input({ ingredients: known(), proficient: false, rune: "abjuration", milestone: true }), ["long-march"])
    expect(r.value).toBe(0)
  })

  it("never goes below zero, however many marks are stacked", () => {
    const r = impurityOf(input({ ingredients: known(), rune: "abjuration", milestone: true }), ["long-march"])
    expect(r.value).toBe(0)
  })

  it("never goes above three", () => {
    const r = impurityOf(input({
      ingredients: [ripplebark(), bluecap()], proficient: false, check: 3,
      recipe: { slug: "r", reliability: "sabotaged" }, rune: "necromancy",
    }), ["long-march", "purge-disease"])
    expect(r.value).toBe(MAX_IMPURITY)
  })

  it("blessed water caps it at 1 — the cleric working preventively", () => {
    const r = impurityOf(input({
      ingredients: [ripplebark(), bluecap()], proficient: false, check: 3, base: "blessed-water",
    }), ["long-march", "purge-disease"])
    expect(r.value).toBe(1)
    expect(r.reasons.join(" ")).toMatch(/capped/)
  })

  it("necromancy buys its advantage with a point", () => {
    const r = impurityOf(input({ ingredients: known(), rune: "necromancy" }), ["long-march"])
    expect(r.value).toBe(1)
  })
})

describe("potencyOf", () => {
  it("pins a missed check at tier I however skilled the brewer", () => {
    expect(potencyOf(input({ check: BREW_DC - 1, proficient: true, rune: "evocation" }))).toBe(1)
  })
  it("gives tier I to an unproficient brewer who just scrapes the DC", () => {
    expect(potencyOf(input({ check: BREW_DC, proficient: false }))).toBe(1)
  })
  it("gives proficiency a tier", () => {
    expect(potencyOf(input({ check: BREW_DC, proficient: true }))).toBe(2)
  })
  it("gives a margin of five another", () => {
    expect(potencyOf(input({ check: BREW_DC + BREW_MARGIN, proficient: true }))).toBe(3)
  })
  it("caps at III — evocation cannot push past the top", () => {
    expect(potencyOf(input({ check: BREW_DC + BREW_MARGIN, proficient: true, rune: "evocation" }))).toBe(3)
  })
  it("lets evocation carry an unproficient brewer, which is what fortify is for", () => {
    expect(potencyOf(input({ check: BREW_DC, proficient: false, rune: "evocation" }))).toBe(2)
  })
})

describe("the summary line", () => {
  it("names the effects, the tier and the impurity for the DM log", () => {
    const r = brewAtBench(input())
    if (!r.ok) throw new Error("unreachable")
    expect(r.summary).toMatch(/long-march/)
    expect(r.summary).toMatch(/tier II/)
    expect(r.summary).toMatch(/impurity 2/)
  })
  it("does not name the saboteur — a sabotaged recipe reads as ordinary impurity", () => {
    const r = brewAtBench(input({ recipe: { slug: "drow-field-notes", reliability: "sabotaged" } }))
    if (!r.ok) throw new Error("unreachable")
    expect(r.summary).not.toMatch(/sabotag/i)
  })
})

describe("extraction — a bruised ingredient (Sam's 'Yes', 2026-10-01)", () => {
  const known = () => [ripplebark([3, 4]), bluecap([2, 3])]

  it("costs exactly one point per bruised ingredient", () => {
    const clean = brewAtBench(input({ ingredients: known() }))
    const one = brewAtBench(input({ ingredients: [{ ...known()[0], bruised: true }, known()[1]] }))
    const two = brewAtBench(input({ ingredients: known().map((i) => ({ ...i, bruised: true })) }))
    if (!clean.ok || !one.ok || !two.ok) throw new Error("expected brews")
    expect(one.impurity - clean.impurity).toBe(1)
    expect(two.impurity - clean.impurity).toBe(2)
    expect(one.impurityReasons.some((r) => r.includes("bruised"))).toBe(true)
  })

  it("never denies the potion — bruising is a cost, not a punishment", () => {
    const r = brewAtBench(input({ ingredients: known().map((i) => ({ ...i, bruised: true })), check: 3, die: 3, proficient: false }))
    expect(r.ok && r.outcome).toBe("potion")
  })
})

describe("recipes (spec §6, the Poisoned Cookbook)", () => {
  const blind = () => [ripplebark(), bluecap()]

  it("a TRUE recipe waives the unknown-ingredient penalty", () => {
    const without = brewAtBench(input({ ingredients: blind() }))
    const withTrue = brewAtBench(input({ ingredients: blind(), recipe: { slug: "r", reliability: "true" } }))
    if (!without.ok || !withTrue.ok) throw new Error("expected brews")
    expect(withTrue.impurity).toBeLessThan(without.impurity)
    expect(withTrue.impurityReasons.some((r) => r.includes("had not discovered"))).toBe(false)
  })

  it("a drifted copy does NOT waive it, and adds its own point", () => {
    const without = brewAtBench(input({ ingredients: blind() }))
    const drifted = brewAtBench(input({ ingredients: blind(), recipe: { slug: "r", reliability: "drifted" } }))
    if (!without.ok || !drifted.ok) throw new Error("expected brews")
    expect(drifted.impurity).toBe(Math.min(3, without.impurity + 1))
  })
})
