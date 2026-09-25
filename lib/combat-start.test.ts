import { describe, expect, it } from "vitest"
import { resolveSkillCheck, resolveSurprise, passivePerception, type Rng } from "./game-context"
import {
  campOf,
  dexScoreOf,
  sheetFromBestiary,
  sheetFromCharacter,
  sideOf,
  statBlockPassive,
  statBlockStealth,
  surprisePairings,
  type StartToken,
} from "./combat-start"

/** Plays back exact d20 faces (1–20). */
function faces(...rolls: number[]): Rng {
  let i = 0
  return () => (rolls[i++] - 1) / 20 + 0.001
}

// Rows shaped like the live tables (Derro and Svirfneblin as the bestiary prints them).
const derro = { id: "b1", dex: 14, wis: 5, skills: "Stealth +4", senses: "darkvision 120 ft., passive Perception 7" }
const gnome = { id: "b2", dex: 14, wis: 10, skills: "Investigation +3, Perception +2, Stealth +4", senses: "darkvision 120 ft., passive Perception 12" }

describe("stat block parsing", () => {
  it("reads the printed Stealth and passive Perception", () => {
    expect(statBlockStealth(gnome.skills)).toBe(4)
    expect(statBlockStealth("Perception +2")).toBeNull()
    expect(statBlockPassive(derro.senses)).toBe(7)
  })

  it("lands a monster's Stealth check on the printed bonus", () => {
    const sheet = sheetFromBestiary(derro, "t1", "Derro")
    const check = resolveSkillCheck(sheet, "stealth", 0, faces(10))
    expect(check.total).toBe(14) // d20 10 + the book's +4
    expect(passivePerception(sheet)).toBe(7)
  })

  it("adds nothing when the block lists no Stealth", () => {
    const sheet = sheetFromBestiary({ id: "b", dex: 12 }, "t", "Rat")
    expect(resolveSkillCheck(sheet, "stealth", 0, faces(10)).total).toBe(11)
  })
})

describe("character rows", () => {
  it("prefers the DEX score, falls back to the stored modifier", () => {
    expect(dexScoreOf({ id: "c", dex_score: 17, dex_modifier: 1 })).toBe(17)
    expect(dexScoreOf({ id: "c", dex_score: null, dex_modifier: 3 })).toBe(16)
    expect(dexScoreOf(undefined)).toBe(10)
  })

  it("reads mixed-style skill keys (Freía's expertise)", () => {
    const sheet = sheetFromCharacter(
      { id: "c", level: 1, dex_score: 17, proficiency_bonus: 2, sheet_skill_proficiencies: { stealth: "expertise" } },
      "Freía",
    )
    expect(resolveSkillCheck(sheet, "stealth", 0, faces(10)).total).toBe(10 + 3 + 4)
  })
})

describe("sides", () => {
  it("puts party and ally in one camp against hostiles", () => {
    expect(campOf("party")).toBe(campOf("ally"))
    expect(campOf("hostile")).not.toBe(campOf("party"))
    expect(sideOf("hostile")).toBe("enemy")
    expect(sideOf("ally")).toBe("ally")
  })

  it("compares hiders only against the other camp, and surprises per creature", () => {
    const tokens: StartToken[] = [
      { id: "rogue", label: "Freía", character_id: "c1", bestiary_id: null, allegiance: "party" },
      { id: "cleric", label: "Samson", character_id: "c2", bestiary_id: null, allegiance: "party" },
      { id: "derro", label: "Derro", character_id: null, bestiary_id: "b1", allegiance: "hostile" },
      { id: "gnome", label: "Svirfneblin", character_id: null, bestiary_id: "b2", allegiance: "hostile" },
    ]
    const sheetOf = (t: StartToken) =>
      t.character_id
        ? sheetFromCharacter({ id: t.character_id, dex_score: 10 }, t.label ?? "")
        : sheetFromBestiary(t.bestiary_id === "b1" ? derro : gnome, t.id, t.label ?? "")
    const pairs = surprisePairings(tokens, new Set(["rogue"]), sheetOf)
    expect(pairs).toHaveLength(1)
    expect(pairs[0].observerIds).toEqual(["derro", "gnome"]) // Samson is not watching his own rogue

    // Stealth 10 (flat): beats the Derro's 7, not the gnome's 12.
    const r = resolveSurprise(pairs[0].hiders, pairs[0].observers, faces(10))
    expect(r.verdicts.map((v) => v.surprised)).toEqual([true, false])
  })

  it("makes no pairing when nobody is hiding", () => {
    const t: StartToken = { id: "a", label: "A", character_id: null, bestiary_id: null, allegiance: "party" }
    expect(surprisePairings([t], new Set(), () => sheetFromBestiary(undefined, "a", "A"))).toEqual([])
  })
})
