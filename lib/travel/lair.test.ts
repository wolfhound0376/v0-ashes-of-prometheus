import { describe, expect, it } from "vitest"
import { isAmbushLair, lairSearchOpen, searcherOf } from "./lair"
import type { SheetSlice } from "../game-context"

const hero = (name: string, int: number, wis: number): SheetSlice => ({ id: name, name, level: 3, str_score: 10, dex_score: 10, con_score: 10, int_score: int, wis_score: wis, cha_score: 10, proficiency_bonus: 2, sheet_skill_proficiencies: {} })

describe("the ambushers' lair (OotA ch.2 p.32)", () => {
  it("is only there when the dice named Ambushers", () => {
    expect(isAmbushLair([{ table_key: "underdark_random" }, { table_key: "underdark_creature" }, { table_key: "underdark_ambush" }])).toBe(true)
    expect(isAmbushLair([{ table_key: "underdark_creature" }])).toBe(false)
    expect(isAmbushLair(null)).toBe(false)
  })
  it("opens once they are behind the party: slipped past, or fought", () => {
    expect(lairSearchOpen({ outcome: "passed" }, 0)).toBe(true)
    expect(lairSearchOpen({ outcome: "fight" }, 0)).toBe(true)
    expect(lairSearchOpen(null, 0)).toBe(true)                 // no box offered: a fight at the table
  })
  it("stays shut while a choice is open, after a parley, or while spotted", () => {
    expect(lairSearchOpen(null, 3)).toBe(false)
    expect(lairSearchOpen({ outcome: "parley" }, 0)).toBe(false)
    expect(lairSearchOpen({ outcome: "spotted" }, 2)).toBe(false)
  })
  it("sends the best eye on the march, with the better of Perception and Investigation", () => {
    const s = searcherOf([hero("Freia", 10, 12), hero("Sarith", 16, 10), hero("Eldeth", 10, 14)])
    expect(s?.sheet.name).toBe("Sarith")
    expect(s?.skill).toBe("investigation")
    expect(s?.bonus).toBe(3)
    expect(searcherOf([hero("Eldeth", 10, 14)])?.skill).toBe("perception")
    expect(searcherOf([])).toBeNull()
  })
})
