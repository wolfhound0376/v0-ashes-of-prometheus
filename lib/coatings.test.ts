import { describe, expect, it } from "vitest"
import {
  COAT_RULES, COATINGS, THROWN_VIALS, ammoWord, coatDried, coatFits, coatLasts, coatLine, coatSaveDamage, coatingOf, newCoat, thrownVialOf,
} from "./coatings.mjs"

// Sam, 2026-11-25: dip a weapon or bolt/arrow in poison or another additive per 5E; throw the vials; the bonus shows in damage.
// Every number below is the catalogue's and the SRD's (lib/coatings.mjs quotes each rule), or Sam's residue ruling.

describe("what counts as a coating", () => {
  it("finds a coating by catalogue slug or by the name in the bag", () => {
    expect(coatingOf({ slug: "drow-poison" })?.key).toBe("drow")
    expect(coatingOf({ name: "Drow poison" })?.key).toBe("drow")
    expect(coatingOf({ name: "Basic Poison (vial)" })?.key).toBe("basic")
    expect(coatingOf({ name: "Serpent Venom (vial)" })?.key).toBe("serpent")
    expect(coatingOf({ name: "Wyvern Poison (vial)" })?.key).toBe("wyvern")
    expect(coatingOf({ name: "Purple Worm Poison" })?.key).toBe("worm")
    expect(coatingOf({ name: "Gray Ooze Residue (vial)" })?.key).toBe("residue")
  })
  it("leaves ingested, inhaled and contact poisons, and everything else, alone", () => {
    for (const name of ["Diluted drow poison", "Assassin's Blood (vial)", "Truth Serum (vial)", "Midnight Tears (vial)", "Essence of Ether (vial)",
      "Carrion Crawler Mucus", "Potion of Poison", "Antitoxin (vial)", "Hand crossbow bolt (drow poison)", "Acid (vial)", "Dagger"])
      expect(coatingOf({ name }), name).toBeNull()
  })
  it("carries the printed numbers", () => {
    expect(COATINGS["basic-poison-vial"]).toMatchObject({ dc: 10, dice: "1d4", half: false })
    expect(COATINGS["serpent-venom"]).toMatchObject({ dc: 11, dice: "3d6", half: true })
    expect(COATINGS["wyvern-poison"]).toMatchObject({ dc: 15, dice: "7d6", half: true })
    expect(COATINGS["purple-worm-poison"]).toMatchObject({ dc: 19, dice: "12d6", half: true })
    expect(COATINGS["drow-poison"]).toMatchObject({ dc: 13 })
    expect(COATINGS["gray-ooze-residue"]).toMatchObject({ dice: "1d6", type: "acid" })   // Sam, 2026-10-27
  })
})

describe("how long a coat lasts", () => {
  it("an injury poison is spent by the wound that delivers it: one hit, or three pieces of ammunition", () => {
    expect(newCoat(COATINGS["drow-poison"], "weapon").uses).toBe(1)
    expect(newCoat(COATINGS["serpent-venom"], "ammo").uses).toBe(COAT_RULES.ammoPerDose)
    expect(newCoat(COATINGS["drow-poison"], "ammo", 1).uses).toBe(1)   // the Scavenged Possessions' single bolt
  })
  it("basic poison stays on a weapon for its minute, then dries", () => {
    const c = newCoat(COATINGS["basic-poison-vial"], "weapon")
    expect(c.uses).toBe(Infinity); expect(c.rounds).toBe(10)
    c.startRound = 2
    expect(coatDried(c, 11)).toBe(false)
    expect(coatDried(c, 12)).toBe(true)
    expect(newCoat(COATINGS["basic-poison-vial"], "ammo").uses).toBe(3)
  })
  it("the residue rides every hit until the fight ends, on a weapon or on the ammunition", () => {
    for (const where of ["weapon", "ammo"]) { const c = newCoat(COATINGS["gray-ooze-residue"], where); expect(c.uses).toBe(Infinity); expect(coatDried(c, 99)).toBe(false); expect(coatLasts(c)).toMatch(/until the fight ends/) }
  })
})

describe("which attacks carry a coat", () => {
  const blade = newCoat(COATINGS["drow-poison"], "weapon"), shots = newCoat(COATINGS["drow-poison"], "ammo")
  it("a weapon coat rides a blade or a point, swung or thrown, and nothing blunt", () => {
    expect(coatFits(blade, { name: "Dagger", type: "piercing" })).toBe(true)
    expect(coatFits(blade, { name: "Scimitar", type: "slashing" })).toBe(true)
    expect(coatFits(blade, { name: "Rusted iron bar", type: "bludgeoning" })).toBe(false)
    expect(coatFits(blade, { name: "Unarmed Strike", type: "bludgeoning" })).toBe(false)
    expect(coatFits(blade, { name: "Hand crossbow", type: "piercing", ammo: true })).toBe(false)
  })
  it("an ammunition coat rides bolts, arrows and needles, not a blade and not a sling bullet", () => {
    for (const name of ["Hand crossbow", "Light Crossbow", "Shortbow", "Longbow", "Blowgun"]) expect(coatFits(shots, { name, type: "piercing", ammo: true }), name).toBe(true)
    expect(coatFits(shots, { name: "Shortbow", type: "piercing" })).toBe(true)          // a stat block's own line carries no ammo flag
    expect(coatFits(shots, { name: "Sling", type: "bludgeoning", ammo: true })).toBe(false)
    expect(coatFits(shots, { name: "Dagger", type: "piercing" })).toBe(false)
  })
  it("the residue rides any weapon, blunt ones and a sling too", () => {
    expect(coatFits(newCoat(COATINGS["gray-ooze-residue"], "weapon"), { name: "Mace", type: "bludgeoning" })).toBe(true)
    expect(coatFits(newCoat(COATINGS["gray-ooze-residue"], "ammo"), { name: "Sling", type: "bludgeoning", ammo: true })).toBe(true)
  })
  it("never rides a thrown flask, a rock or a fist", () => {
    expect(coatFits(blade, { name: "Acid (vial)", type: "acid", flask: {} })).toBe(false)
    expect(coatFits(blade, { name: "Rock", type: "piercing", rock: true })).toBe(false)
  })
  it("knows what each launcher shoots", () => {
    expect(ammoWord("Hand crossbow")).toBe("bolts"); expect(ammoWord("Longbow")).toBe("arrows"); expect(ammoWord("Blowgun")).toBe("needles")
    expect(ammoWord("Sling")).toBeNull(); expect(ammoWord("Dagger")).toBeNull()
    expect(ammoWord("Hand crossbow bolt (drow poison)")).toBeNull(); expect(ammoWord("Bolts (20)")).toBeNull(); expect(ammoWord("Arrows")).toBeNull()
  })
})

describe("what a coat adds to the damage", () => {
  it("says it in one line for the attack menu and the item card", () => {
    expect(coatLine(newCoat(COATINGS["gray-ooze-residue"], "weapon"))).toBe("+1d6 acid")
    expect(coatLine(newCoat(COATINGS["basic-poison-vial"], "weapon"))).toBe("DC 10 Con or 1d4 poison")
    expect(coatLine(newCoat(COATINGS["serpent-venom"], "ammo"))).toBe("DC 11 Con or 3d6 poison (half on a save)")
    expect(coatLine(newCoat(COATINGS["drow-poison"], "weapon"))).toBe("DC 13 Con or poisoned")
  })
  it("basic poison is all or nothing; the venoms deal half on a save", () => {
    expect(coatSaveDamage(COATINGS["basic-poison-vial"], 3, false)).toBe(3)
    expect(coatSaveDamage(COATINGS["basic-poison-vial"], 3, true)).toBe(0)
    expect(coatSaveDamage(COATINGS["serpent-venom"], 11, false)).toBe(11)
    expect(coatSaveDamage(COATINGS["serpent-venom"], 11, true)).toBe(5)
  })
})

describe("vials that are thrown", () => {
  it("oil, essence of ether and crawler mucus are thrown; injury poisons are not", () => {
    expect(thrownVialOf({ name: "Flask of lamp oil" })?.kind).toBe("oil")
    expect(thrownVialOf({ slug: "essence-of-ether" })).toMatchObject({ kind: "ether", dc: 15 })
    expect(thrownVialOf({ name: "Carrion Crawler Mucus" })).toMatchObject({ kind: "mucus", dc: 13 })
    for (const name of ["Drow poison", "Basic Poison (vial)", "Serpent Venom (vial)", "Gray Ooze Residue (vial)", "Lizard Oil"]) expect(thrownVialOf({ name }), name).toBeNull()
    expect(COAT_RULES.oilBurn).toBe(5)
    expect(Object.keys(THROWN_VIALS)).toHaveLength(3)
  })
})
