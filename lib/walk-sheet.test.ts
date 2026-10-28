import { describe, expect, it } from "vitest"
import { walkSheetFromRow } from "./walk-sheet"

// Fixtures are the live `characters` rows as read 2026-10-23 (only the columns walkSheetFromRow uses).
const GANDALF = {
  id: "614cac3d-f119-4b35-af78-766ddb510619", name: "Gandalf", class: "Wizard", level: 1, hp_max: 6, ac: 10, initiative: 0, speed: "30 ft.",
  proficiency_bonus: 2, str_score: 10, str_modifier: 0, dex_modifier: 0, con_modifier: 0, int_modifier: 3, wis_modifier: 3, cha_modifier: 1,
  sheet_species: "Half-Elf", sheet_skill_proficiencies: { Arcana: "proficient", History: "proficient", Insight: "proficient" },
  sheet_attacks: [
    { hit: "+2", name: "Dagger", type: "Melee Weapon", damage: "1d4 Piercing" },
    { hit: "+2", name: "Unarmed Strike", type: "Melee Attack", damage: "1 Bludgeoning" },
  ],
  sheet_spellcasting: { slots: { "1": { max: 2, used: 0 } }, ability: "Intelligence", save_dc: 13, attack_bonus: 5,
    cantrips: ["Fire Bolt", "Mage Hand", "Ray of Frost"], prepared: ["Chromatic Orb", "Shield", "Magic Missile", "Thunderwave"] },
}
const KENTA = {
  name: "Kenta", class: "Sorcerer", level: 1, hp_max: 8, ac: 10, initiative: 0, speed: "30 ft.", proficiency_bonus: 2, str_score: 12,
  str_modifier: 1, dex_modifier: 0, con_modifier: 2, int_modifier: -1, wis_modifier: -1, cha_modifier: 3, sheet_species: "Half-Elf",
  sheet_skill_proficiencies: { insight: "proficient", stealth: "proficient", acrobatics: "proficient" },
  sheet_attacks: [{ hit: "+3", name: "Unarmed Strike", damage: "2 Bludgeoning" }],
  sheet_spellcasting: { slots: { "1": { max: 2, used: 0 } }, ability: "Charisma", save_dc: 13, attack_bonus: 5,
    cantrips: ["Ray of Frost", "Shocking Grasp", "Minor Illusion", "Chill Touch"], prepared: ["Disguise Self", "Fog Cloud"], always_prepared: [] },
}
const FIFI = {
  name: "Fifi of Copperas Cove", class: "Rogue", level: 1, hp_max: 8, ac: 13, initiative: 3, speed: "30 ft.", proficiency_bonus: 2, str_score: 8,
  str_modifier: -1, dex_modifier: 3, con_modifier: 0, int_modifier: 1, wis_modifier: 1, cha_modifier: 1, sheet_species: "Human",
  sheet_skill_proficiencies: { stealth: "expertise", athletics: "proficient", sleight_of_hand: "expertise" },
  sheet_attacks: [{ hit: "+5", name: "Dagger", damage: "1d4+3 piercing" }, { hit: "+1", name: "Unarmed Strike", damage: "1 bludgeoning" }],
  sheet_spellcasting: null,
}

describe("walkSheetFromRow", () => {
  it("builds Gandalf from his own row, not from Kenta's", () => {
    const s = walkSheetFromRow(GANDALF)
    expect(s).toMatchObject({ name: "Gandalf", cls: "Wizard", level: 1, race: "half-elf", hp: 6, ac: 10, init: 0, speed: 30, strScore: 10 })
    expect(s.saves).toEqual({ str: 0, dex: 0, con: 0, int: 3, wis: 3, cha: 1 })
    expect(s.magic).toEqual({ dc: 13, hit: 5, mod: 3, slots: { "1": 2 },
      cantrips: ["Fire Bolt", "Mage Hand", "Ray of Frost"], prepared: ["Chromatic Orb", "Shield", "Magic Missile", "Thunderwave"] })
  })

  it("fights unarmed at the start of a run: the row's Unarmed Strike, never the confiscated dagger", () => {
    expect(walkSheetFromRow(GANDALF).attacks).toEqual([{ name: "Unarmed Strike", hit: 2, dmg: "1", type: "bludgeoning", reach: 5 }])
  })

  it("reproduces the page's hand-written snapshots for the premades it can check against", () => {
    // template.html SHEETS.kenta / SHEETS.freia: skills and the unarmed line
    expect(walkSheetFromRow(KENTA).skills).toMatchObject({ sleightOfHand: 0, medicine: -1, stealth: 2, athletics: 1, perception: -1 })
    expect(walkSheetFromRow(KENTA).attacks[0]).toMatchObject({ hit: 3, dmg: "2" })
    expect(walkSheetFromRow(FIFI).skills).toMatchObject({ sleightOfHand: 7, medicine: 1, stealth: 7, athletics: 1, perception: 1 })
    expect(walkSheetFromRow(FIFI).attacks[0]).toMatchObject({ hit: 1, dmg: "1" })
  })

  it("adds class save proficiency, Investigation and Thieves' Tools (Fifi of Waterdeep's row, 2026-10-27)", () => {
    const row = { ...FIFI, sheet_save_proficiencies: ["dex", "int"],
      sheet_skill_proficiencies: { ...FIFI.sheet_skill_proficiencies, investigation: "proficient" },
      sheet_proficiencies: { tools: ["Thieves' Tools", "Alchemist's Supplies", "Dice Set"] } }
    const s = walkSheetFromRow(row)
    expect(s.saves).toEqual({ str: -1, dex: 5, con: 0, int: 3, wis: 1, cha: 1 })
    expect(s.skills).toMatchObject({ investigation: 3, thievesTools: 5 })
    // without the tools a Rogue's lock pick is bare Dex; with expertise in them it doubles
    expect(walkSheetFromRow(FIFI).skills.thievesTools).toBe(3)
    expect(walkSheetFromRow({ ...row, sheet_skill_proficiencies: { thieves_tools: "expertise" } }).skills.thievesTools).toBe(7)
  })

  it("carries the loot card's knowledge skills and tools (Fifi: Investigation, Alchemist's Supplies)", () => {
    const row = { ...FIFI, sheet_skill_proficiencies: { ...FIFI.sheet_skill_proficiencies, investigation: "proficient", arcana: "expertise" },
      sheet_proficiencies: { tools: ["Thieves' Tools", "Alchemist's Supplies", "Dice Set"] } }
    const s = walkSheetFromRow(row)
    expect(s.lore.investigation).toEqual({ mod: 3, level: "proficient" })
    expect(s.lore.arcana).toEqual({ mod: 5, level: "expertise" })
    expect(s.lore.religion).toEqual({ mod: 1, level: "" })
    expect(s.tools).toEqual({ alchemist: 3, poisoner: null, herbalism: null })
  })

  it("keeps the bare ability modifiers apart from the saves (Fifi: Dex save +5, Dex modifier +3)", () => {
    const s = walkSheetFromRow({ ...FIFI, sheet_save_proficiencies: ["dex", "int"] })
    expect(s.saves.dex).toBe(5)
    expect(s.mods).toEqual({ str: -1, dex: 3, con: 0, int: 1, wis: 1, cha: 1 })
  })

  it("gives a non-caster no magic", () => {
    expect(walkSheetFromRow(FIFI).magic).toBeNull()
  })

  it("falls to neutral values for a sparse row instead of guessing", () => {
    const s = walkSheetFromRow({ name: "Nobody" })
    expect(s).toMatchObject({ hp: 1, ac: 10, init: 0, speed: 30, strScore: 10, magic: null })
    expect(s.attacks[0]).toEqual({ name: "Unarmed Strike", hit: 2, dmg: "1", type: "bludgeoning", reach: 5 })
  })
})
