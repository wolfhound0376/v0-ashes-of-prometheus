import { describe, expect, it } from "vitest"
import {
  CORRODE_RULES, armorIsMetal, corrodeArmor, corrodeWeapon, corrosionFor, corrosionNote, isLauncher, weaponIsMetal,
} from "./corrode.mjs"

// SRD 5.1, Gray Ooze: Corrode Metal and Pseudopod (lib/corrode.mjs quotes both)

describe("what is metal", () => {
  it("counts blades, axes, maces, spears and the rusted iron bar as metal", () => {
    for (const w of ["dagger", "shortsword", "Longsword", "battleaxe", "mace", "warhammer", "spear", "javelin", "Rusted Iron Bar", "rusted-morningstar", "scimitar", "rapier"])
      expect(weaponIsMetal(w), w).toBe(true)
  })
  it("does not count wood, leather, rope, obsidian or bare hands", () => {
    for (const w of ["club", "Greatclub", "quarterstaff", "whip", "net", "obsidian-shard", "Unarmed Strike", "totem-club"])
      expect(weaponIsMetal(w), w).toBe(false)
  })
  it("knows a launcher never touches the ooze", () => {
    for (const w of ["shortbow", "Longbow", "hand crossbow", "light-crossbow", "sling"]) expect(isLauncher(w), w).toBe(true)
    expect(isLauncher("dagger")).toBe(false)
  })
  it("reads metal armour by its name, and a plain shield as wood", () => {
    for (const a of ["Chain Shirt", "chain mail", "Scale Mail", "breastplate", "Half Plate", "splint", "plate", "ring mail"]) expect(armorIsMetal(a, "medium"), a).toBe(true)
    for (const a of ["Padded", "Leather Armor", "Studded Leather", "hide"]) expect(armorIsMetal(a, "light"), a).toBe(false)
    expect(armorIsMetal("Shield", "shield")).toBe(false)
    expect(armorIsMetal("Iron Shield", "shield")).toBe(true)
  })
})

describe("the penalties, as printed", () => {
  it("a weapon loses 1 damage per hit and is destroyed at -5", () => {
    let t = 0, out
    for (let i = 1; i <= 4; i++) { out = corrodeWeapon(t); t = out.total; expect(out).toEqual({ total: i, destroyed: false }) }
    expect(corrodeWeapon(t)).toEqual({ total: 5, destroyed: true })
    expect(CORRODE_RULES.weaponDestroyedAt).toBe(5)
  })
  it("armour loses 1 AC per pseudopod hit and is destroyed when that brings it to AC 10", () => {
    expect(corrodeArmor(13, 0)).toEqual({ total: 1, ac: 12, destroyed: false })   // a chain shirt
    expect(corrodeArmor(13, 2)).toEqual({ total: 3, ac: 10, destroyed: true })
    expect(corrodeArmor(18, 7)).toEqual({ total: 8, ac: 10, destroyed: true })   // plate takes eight
  })
  it("says what happened in plain words", () => {
    expect(corrosionNote("weapon", 2, false)).toMatch(/-2 to damage/)
    expect(corrosionNote("armor", 1, false)).toMatch(/-1 AC/)
    expect(corrosionNote("weapon", 5, true)).toMatch(/destroyed/)
  })
})

describe("which blows corrode", () => {
  const ooze = { id: "gray-ooze", hero: false }, fifi = { id: "freia", hero: true }, drow = { id: "drow-guard-male", hero: false }
  it("a hero's metal weapon hitting the ooze", () => {
    expect(corrosionFor({ attacker: fifi, target: ooze, attack: { item: true, base: "dagger" } })).toEqual({ part: "weapon" })
  })
  it("not a magic weapon, not wood, not a fist, not a launcher", () => {
    expect(corrosionFor({ attacker: fifi, target: ooze, attack: { item: true, base: "dagger", magic: true } })).toBeNull()
    expect(corrosionFor({ attacker: fifi, target: ooze, attack: { item: true, base: "club" } })).toBeNull()
    expect(corrosionFor({ attacker: fifi, target: ooze, attack: { item: false, name: "Unarmed Strike" } })).toBeNull()
    expect(corrosionFor({ attacker: fifi, target: ooze, attack: { item: true, base: "hand-crossbow" } })).toBeNull()
  })
  it("ammunition that hits is destroyed", () => {
    expect(corrosionFor({ attacker: fifi, target: ooze, attack: { item: true, ammo: true, base: "hand-crossbow" } })).toEqual({ part: "ammo" })
  })
  it("the pseudopod on a hero in nonmagical metal armour", () => {
    expect(corrosionFor({ attacker: ooze, target: fifi, armor: { name: "Chain Shirt", category: "medium" } })).toEqual({ part: "armor" })
    expect(corrosionFor({ attacker: ooze, target: fifi, armor: { name: "Leather Armor", category: "light" } })).toBeNull()
    expect(corrosionFor({ attacker: ooze, target: fifi, armor: { name: "Chain Shirt", category: "medium", magic: true } })).toBeNull()
    expect(corrosionFor({ attacker: ooze, target: fifi, armor: null })).toBeNull()
  })
  it("nothing for anyone else's blows", () => {
    expect(corrosionFor({ attacker: fifi, target: drow, attack: { item: true, base: "dagger" } })).toBeNull()
    expect(corrosionFor({ attacker: drow, target: fifi, armor: { name: "Chain Shirt", category: "medium" } })).toBeNull()
  })
})
