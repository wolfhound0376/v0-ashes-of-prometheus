import { describe, expect, it } from "vitest"
import { withWornGear, wornBonuses, wornSkillBonus } from "./worn-bonus"
import { calculateAC } from "./armor-class"
import { walkSheetFromRow } from "./walk-sheet"
import { resolveSkillCheck, skillBonus, type SheetSlice } from "./game-context"

// Fifi of Waterdeep as the live row stood on 2026-11-24: Dexterity 17 (+3), a rogue with Stealth expertise.
const fifi = {
  id: "fifi", name: "Fifi of Waterdeep", class: "Rogue", level: 1, proficiency_bonus: 2, hp_max: 8, ac: 13, initiative: 3,
  str_score: 8, str_modifier: -1, dex_score: 17, dex_modifier: 3, con_score: 10, con_modifier: 0,
  int_score: 12, int_modifier: 1, wis_score: 12, wis_modifier: 1, cha_score: 12, cha_modifier: 1,
  passive_perception: 11,
  sheet_save_proficiencies: ["dex", "int"],
  sheet_skill_proficiencies: { stealth: "expertise", sleight_of_hand: "expertise", athletics: "proficient" },
}
const dexCloak = { slot: "back", name: "Traveler's Cloak", equipped: true, stats_bonus: { dex: 1 } }
const stealthCloak = { slot: "back", name: "Traveler's Cloak", equipped: true, stats_bonus: { stealth: 1 } }

describe("wornBonuses", () => {
  it("reads abilities and skills however they are spelled, and says where each came from", () => {
    const b = wornBonuses([{ name: "A", stats_bonus: { Dexterity: 1, "Sleight of Hand": 2 } }, { name: "B", stats_bonus: { dex_score: 1, stealth: "1" } }])
    expect(b.abilities).toEqual({ dex: 2 })
    expect(b.skills).toEqual({ sleight_of_hand: 2, stealth: 1 })
    expect(b.sources.map((s) => s.from)).toEqual(["A", "A", "B", "B"])
  })
  it("leaves ac, initiative and *_modifier to the code that already reads them", () => {
    expect(wornBonuses([{ stats_bonus: { ac: 1, initiative: 2, dex_modifier: 1 } }]).sources).toEqual([])
  })
  it("gives nothing for a row that is not equipped, or has no bonus", () => {
    expect(wornBonuses([{ ...dexCloak, equipped: false }, { name: "Rags", stats_bonus: null }, { name: "Rags", stats_bonus: { ac: 0 } }]).sources).toEqual([])
    expect(wornBonuses(null).sources).toEqual([])
  })
})

describe("withWornGear", () => {
  it("17 Dexterity with a +1 cloak is 18, and the modifier, initiative and nothing else move by one", () => {
    const worn = withWornGear(fifi, [dexCloak])
    expect(worn.dex_score).toBe(18)
    expect(worn.dex_modifier).toBe(4)
    expect(worn.initiative).toBe(4)
    expect(worn.wis_modifier).toBe(1)
    expect(worn.passive_perception).toBe(11)
    expect(fifi.dex_score).toBe(17) // the row itself is never changed
  })
  it("an even score gains the point but not the modifier", () => {
    const worn = withWornGear({ ...fifi, dex_score: 16 }, [dexCloak])
    expect(worn.dex_score).toBe(17)
    expect(worn.dex_modifier).toBe(3)
    expect(worn.initiative).toBe(3)
  })
  it("never guesses a score the row does not carry", () => {
    const { dex_score: _gone, ...noScore } = fifi
    const worn = withWornGear(noScore, [dexCloak])
    expect(worn.dex_modifier).toBe(3)
    expect("dex_score" in worn).toBe(false)
  })
  it("is safe to call twice, and returns the same object when nothing worn matters", () => {
    const once = withWornGear(fifi, [dexCloak])
    expect(withWornGear(once, [dexCloak])).toBe(once)
    expect(withWornGear(fifi, [])).toBe(fifi)
    expect(withWornGear(fifi, [{ name: "Rags", stats_bonus: { ac: 0 } }])).toBe(fifi)
    expect(withWornGear(null, [dexCloak])).toBe(null)
  })
  it("a Stealth cloak leaves Dexterity alone and carries the skill bonus on the row", () => {
    const worn = withWornGear(fifi, [stealthCloak])
    expect(worn.dex_score).toBe(17)
    expect(wornSkillBonus(worn, "Stealth")).toBe(1)
    expect(wornSkillBonus(worn, "sleight_of_hand")).toBe(0)
    expect(wornSkillBonus(fifi, "stealth")).toBe(0)
  })
})

describe("what the rest of the game then sees", () => {
  it("AC follows the modifier: 13 unarmoured becomes 14", () => {
    expect(calculateAC(fifi, [dexCloak]).total).toBe(13) // the cloak alone is not armour
    expect(calculateAC(withWornGear(fifi, [dexCloak]), [dexCloak]).total).toBe(14)
  })
  it("the map's sheet: the Dexterity cloak lifts the save and every Dexterity skill", () => {
    const base = walkSheetFromRow(fifi)
    const worn = walkSheetFromRow(withWornGear(fifi, [dexCloak]))
    expect(worn.mods.dex).toBe(base.mods.dex + 1)
    expect(worn.saves.dex).toBe(base.saves.dex + 1)
    expect(worn.skills.stealth).toBe(base.skills.stealth + 1)
    expect(worn.skills.sleightOfHand).toBe(base.skills.sleightOfHand + 1)
    expect(worn.skills.athletics).toBe(base.skills.athletics)
    expect(worn.init).toBe(base.init + 1)
  })
  it("the map's sheet: the Stealth cloak lifts Stealth only", () => {
    const base = walkSheetFromRow(fifi)
    const worn = walkSheetFromRow(withWornGear(fifi, [stealthCloak]))
    expect(worn.skills.stealth).toBe(base.skills.stealth + 1)
    expect(worn.skills.sleightOfHand).toBe(base.skills.sleightOfHand)
    expect(worn.saves.dex).toBe(base.saves.dex)
  })
})

describe("camp, travel and Malachar's checks (lib/game-context.ts)", () => {
  const slice = (row: object) => row as unknown as SheetSlice
  it("a row nobody dressed is exactly as before", () => {
    expect(skillBonus(slice(fifi), "stealth")).toEqual({ mod: 3, prof: 4, level: "expertise", gear: 0 })
  })
  it("the Dexterity cloak lifts every Dexterity skill through the score", () => {
    const worn = slice(withWornGear(fifi, [dexCloak]))
    expect(skillBonus(worn, "stealth")).toEqual({ mod: 4, prof: 4, level: "expertise", gear: 0 })
    expect(skillBonus(worn, "acrobatics").mod).toBe(4)
    expect(skillBonus(worn, "athletics").mod).toBe(-1)
  })
  it("the Stealth cloak lifts Stealth only, and the working names it", () => {
    const worn = slice(withWornGear(fifi, [stealthCloak]))
    expect(skillBonus(worn, "stealth")).toEqual({ mod: 4, prof: 4, level: "expertise", gear: 1 })
    expect(skillBonus(worn, "sleight_of_hand")).toEqual({ mod: 3, prof: 4, level: "expertise", gear: 0 })
    const check = resolveSkillCheck(worn, "stealth", 15, () => 0.5)
    expect(check.total).toBe(check.roll + 8)
    expect(check.arithmetic).toContain("DEX(+3) + worn gear(+1) + expertise(+4)")
  })
})
