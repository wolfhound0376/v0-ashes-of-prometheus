import { describe, expect, it } from "vitest"
import {
  applyTransition,
  isNight,
  normaliseSkill,
  passivePerception,
  resolveSkillCheck,
  resolveSurprise,
  rollInitiative,
  type Combatant,
  type Rng,
  type SheetSlice,
} from "./game-context"

/** mulberry32 — a tiny seeded PRNG. Same seed, same stream, every run. */
function seeded(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Plays back exact d20 faces (1–20), so a test can name the roll it wants. */
function faces(...rolls: number[]): Rng {
  let i = 0
  return () => {
    if (i >= rolls.length) throw new Error("scripted rng exhausted")
    return (rolls[i++] - 1) / 20 + 0.001
  }
}

const sheet = (over: Partial<SheetSlice> & { name: string }): SheetSlice => ({
  id: over.name.toLowerCase(),
  level: 1,
  str_score: 10,
  dex_score: 10,
  con_score: 10,
  int_score: 10,
  wis_score: 10,
  cha_score: 10,
  ...over,
})

describe("seeded rng", () => {
  it("makes rollInitiative deterministic", () => {
    const party: Combatant[] = [
      { id: "a", name: "A", side: "party", dex_score: 14 },
      { id: "b", name: "B", side: "party", dex_score: 12 },
      { id: "c", name: "C", side: "enemy", dex_score: 16 },
      { id: "d", name: "D", side: "enemy", dex_score: 8 },
    ]
    expect(rollInitiative(party, seeded(42))).toEqual(rollInitiative(party, seeded(42)))
  })

  it("makes resolveSurprise deterministic", () => {
    const hiders = [{ sheet: sheet({ name: "Rogue", dex_score: 16 }) }]
    const observers = [{ sheet: sheet({ name: "Guard", wis_score: 12 }) }]
    expect(resolveSurprise(hiders, observers, seeded(7))).toEqual(resolveSurprise(hiders, observers, seeded(7)))
  })
})

describe("rollInitiative", () => {
  it("is d20 + DEX mod only, sorted high to low", () => {
    const order = rollInitiative(
      [
        { id: "a", name: "A", side: "party", dex_score: 14 }, // +2
        { id: "b", name: "B", side: "enemy", dex_score: 8 }, // -1
      ],
      seeded(1),
    )
    for (const e of order) expect(e.total).toBe(e.roll + e.dexMod)
    expect(order[0].total).toBeGreaterThanOrEqual(order[1].total)
  })

  it("flags ties and breaks them by DEX score", () => {
    // A rolls 12 (+0 = 12), B rolls 11 (+1 = 12). Tiebreak rng values follow each d20.
    const order = rollInitiative(
      [
        { id: "a", name: "A", side: "party", dex_score: 10 },
        { id: "b", name: "B", side: "enemy", dex_score: 12 },
      ],
      faces(12, 1, 11, 1),
    )
    expect(order.map((e) => e.id)).toEqual(["b", "a"])
    expect(order.every((e) => e.tied)).toBe(true)
  })
})

describe("resolveSurprise", () => {
  const guard = sheet({ name: "Guard", wis_score: 12 }) // passive 11

  it("surprises an observer who notices no hider", () => {
    const { verdicts } = resolveSurprise([{ sheet: sheet({ name: "Rogue" }) }], [{ sheet: guard }], faces(11))
    expect(verdicts[0].passivePerception).toBe(11)
    expect(verdicts[0].comparisons[0]).toEqual({ hider: "Rogue", stealth: 11, noticed: false }) // tie goes to the hider
    expect(verdicts[0].surprised).toBe(true)
  })

  it("does not surprise an observer who notices any hider", () => {
    const hiders = [{ sheet: sheet({ name: "Quiet" }) }, { sheet: sheet({ name: "Loud" }) }]
    const { verdicts } = resolveSurprise(hiders, [{ sheet: guard }], faces(18, 3))
    expect(verdicts[0].comparisons.map((c) => c.noticed)).toEqual([false, true])
    expect(verdicts[0].surprised).toBe(false)
  })

  it("is per creature, not per side", () => {
    const sharp = sheet({ name: "Sharp", wis_score: 18, sheet_skill_proficiencies: { Perception: "proficient" } }) // 10+4+2 = 16
    const { verdicts } = resolveSurprise([{ sheet: sheet({ name: "Rogue" }) }], [{ sheet: guard }, { sheet: sharp }], faces(14))
    expect(verdicts.map((v) => v.surprised)).toEqual([true, false])
  })

  it("uses the stored passive_perception when set", () => {
    expect(passivePerception(sheet({ name: "X", wis_score: 20, passive_perception: 9 }))).toBe(9)
  })
})

describe("resolveSkillCheck", () => {
  it("adds proficiency only when proficient, doubled for expertise", () => {
    const s = sheet({ name: "S", dex_score: 16, sheet_skill_proficiencies: { "Sleight of Hand": "expertise" } })
    const check = resolveSkillCheck(s, "sleight_of_hand", 15, faces(10))
    expect(check.total).toBe(10 + 3 + 4)
    expect(check.arithmetic).toBe("d20(10) + DEX(+3) + expertise(+4) = 17 vs DC 15")
    expect(resolveSkillCheck(s, "stealth", 15, faces(10)).prof).toBe(0)
  })

  it("does not treat a natural 20 as an automatic success", () => {
    expect(resolveSkillCheck(sheet({ name: "S" }), "athletics", 25, faces(20)).success).toBe(false)
  })
})

describe("applyTransition", () => {
  it("allows the listed edges", () => {
    expect(applyTransition("overworld", { type: "arrive", nodeId: "n", hasMap: true, discoveredAt: "2026-01-01" })).toMatchObject({ ok: true, next: "exploration" })
    expect(applyTransition("exploration", { type: "initiative", combatStateId: "c", encounterKey: "e" })).toMatchObject({ ok: true, next: "combat" })
    expect(applyTransition("overworld", { type: "ambush", combatStateId: "c", encounterKey: "e" })).toMatchObject({ ok: true, next: "combat" })
    expect(applyTransition("combat", { type: "combat_ended", combatStateId: "c" })).toMatchObject({ ok: true, next: "exploration" })
  })

  it("rejects everything else with an error", () => {
    expect(applyTransition("camp", { type: "initiative", combatStateId: "c", encounterKey: "e" }).ok).toBe(false)
    expect(applyTransition("overworld", { type: "arrive", nodeId: "n", hasMap: true, discoveredAt: null }).ok).toBe(false)
  })
})

describe("helpers", () => {
  it("normalises mixed skill keys and rejects unknowns", () => {
    expect(normaliseSkill("Sleight of Hand")).toBe("sleight_of_hand")
    expect(normaliseSkill("animal-handling")).toBe("animal_handling")
    expect(normaliseSkill("Lockpicking")).toBeNull()
  })

  it("never reports night in the Underdark", () => {
    expect(isNight({ hours: 23, lastLongRestAt: null }, { hasSky: false })).toBe(false)
    expect(isNight({ hours: 23, lastLongRestAt: null }, { hasSky: true })).toBe(true)
  })
})
