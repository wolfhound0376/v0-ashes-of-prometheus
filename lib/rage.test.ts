import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  RAGE_RESISTS, RAGE_ROUNDS, RAGE_TINT, WOUNDED_FURY_DIE,
  attackRiders, beginRage, canRage, isBarbarian, isStrengthMelee, rageAdvantage, rageAfterTurn,
  rageDamageBonus, rageResists, ragesPerLongRest, tintFor, woundedFury,
} from "./rage.mjs"

// The lines these assert are quoted at the top of lib/rage.mjs from the SRD 5.1 as ingested in
// campaign_chunks (Classes: Barbarian — Rage; the Barbarian table) and the quaggoth's Wounded Fury.

const greataxe = { name: "Greataxe", hit: 6, dmg: "1d12+3", type: "slashing", reach: 5, str: true }
const rapier = { name: "Rapier", hit: 5, dmg: "1d8+2", type: "piercing", reach: 5, str: false }   // finesse, swung with DEX
const shortbow = { name: "Shortbow", hit: 5, dmg: "1d6+2", type: "piercing", reach: 80, long: 320, ammo: true, str: false }
const fist = { name: "Unarmed Strike", hit: 6, dmg: "4", type: "bludgeoning", reach: 5 }   // the sheet's own line: no flag
const javelin = { name: "Javelin", hit: 6, dmg: "1d6+3", type: "piercing", reach: 5, thrown: 30, str: true }

describe("the Barbarian table", () => {
  it("Rage Damage: +2 until 9th, +3 until 16th, +4 from 16th", () => {
    expect([1, 5, 8].map(rageDamageBonus)).toEqual([2, 2, 2])
    expect([9, 15].map(rageDamageBonus)).toEqual([3, 3])
    expect([16, 20].map(rageDamageBonus)).toEqual([4, 4])
  })
  it("Rages per long rest: 2, 3 at 3rd, 4 at 6th, 5 at 12th, 6 at 17th, unlimited at 20th", () => {
    expect([1, 2].map(ragesPerLongRest)).toEqual([2, 2])
    expect([3, 5].map(ragesPerLongRest)).toEqual([3, 3])
    expect([6, 11].map(ragesPerLongRest)).toEqual([4, 4])
    expect([12, 16].map(ragesPerLongRest)).toEqual([5, 5])
    expect([17, 19].map(ragesPerLongRest)).toEqual([6, 6])
    expect(ragesPerLongRest(20)).toBe(Infinity)
  })
  it("a bad level reads as 1st", () => {
    expect(rageDamageBonus(NaN)).toBe(2)
    expect(ragesPerLongRest(0)).toBe(2)
  })
})

describe("entering a rage", () => {
  const bastet = { cls: "Barbarian", level: 5, bonus: true, raging: null, used: 0, heavyArmor: false }
  it("is a bonus action, for a barbarian, with a rage left, not in heavy armor", () => {
    expect(canRage(bastet)).toEqual({ ok: true, why: "" })
    expect(canRage({ ...bastet, bonus: false }).why).toMatch(/bonus action/)
    expect(canRage({ ...bastet, raging: beginRage(1) }).why).toMatch(/already/)
    expect(canRage({ ...bastet, used: 3 }).why).toMatch(/long rest/)
    expect(canRage({ ...bastet, used: 2 }).ok).toBe(true)   // third rage of three at 5th
    expect(canRage({ ...bastet, heavyArmor: true }).why).toMatch(/heavy armor/)
    expect(canRage({ ...bastet, cls: "Rogue" }).why).toMatch(/not a barbarian/)
  })
  it("knows a barbarian by class, however the sheet spells it", () => {
    expect(isBarbarian("Barbarian")).toBe(true)
    expect(isBarbarian("barbarian (Path of the Berserker)")).toBe(true)
    expect(isBarbarian("Bard")).toBe(false)
    expect(isBarbarian(null)).toBe(false)
  })
})

describe("+2 melee damage, only while raging, only on a Strength melee weapon attack", () => {
  const raging = { hp: 50, raging: beginRage(2), level: 5 }
  const calm = { hp: 50, raging: null, level: 5 }
  it("a greataxe swung in a rage gets the flat bonus", () => {
    expect(attackRiders(raging, greataxe).flat).toEqual([{ label: "rage", amount: 2 }])
    expect(attackRiders(raging, fist).flat).toEqual([{ label: "rage", amount: 2 }])   // the sheet's fist is Strength
  })
  it("the same swing not raging gets nothing", () => {
    expect(attackRiders(calm, greataxe).flat).toEqual([])
    expect(attackRiders(calm, greataxe).adv).toBe(0)
  })
  it("a rage gives no advantage on the attack roll itself", () => {
    expect(attackRiders(raging, greataxe).adv).toBe(0)
  })
  it("not on a bow, not on a finesse weapon swung with Dexterity, not on a thrown javelin", () => {
    expect(attackRiders(raging, shortbow).flat).toEqual([])
    expect(attackRiders(raging, rapier).flat).toEqual([])
    expect(attackRiders(raging, javelin, true).flat).toEqual([])
    expect(attackRiders(raging, javelin, false).flat).toEqual([{ label: "rage", amount: 2 }])   // stabbed with it in hand
    expect(isStrengthMelee(greataxe)).toBe(true)
    expect(isStrengthMelee(shortbow)).toBe(false)
    expect(isStrengthMelee(fist)).toBe(true)
    expect(isStrengthMelee(null)).toBe(false)
  })
  it("scales with the table", () => {
    expect(attackRiders({ ...raging, level: 9 }, greataxe).flat[0].amount).toBe(3)
    expect(attackRiders({ ...raging, level: 16 }, greataxe).flat[0].amount).toBe(4)
  })
})

describe("advantage on Strength checks and saves, only while raging", () => {
  it("+1 on STR, nothing on the other five, nothing when calm", () => {
    expect(rageAdvantage(beginRage(1), "str")).toBe(1)
    expect(rageAdvantage(beginRage(1), "STR")).toBe(1)
    for (const ab of ["dex", "con", "int", "wis", "cha"]) expect(rageAdvantage(beginRage(1), ab)).toBe(0)
    expect(rageAdvantage(null, "str")).toBe(0)
  })
})

describe("resistance to bludgeoning, piercing and slashing, only while raging", () => {
  it("the three physical types, and nothing else", () => {
    expect(RAGE_RESISTS).toEqual(["bludgeoning", "piercing", "slashing"])
    for (const t of RAGE_RESISTS) expect(rageResists(beginRage(1), t)).toBe(true)
    for (const t of ["fire", "poison", "acid", "psychic", "necrotic", "cold", "radiant"]) expect(rageResists(beginRage(1), t)).toBe(false)
    expect(rageResists(null, "slashing")).toBe(false)
    expect(rageResists(beginRage(1), "Slashing")).toBe(true)
  })
})

describe("how a rage ends", () => {
  it("lasts while you keep attacking or keep getting hit, and resets its flags each turn", () => {
    const r1 = rageAfterTurn({ ...beginRage(1), attacked: true, hurt: false }, 1)
    expect(r1.ended).toBeNull(); expect(r1.rage).toEqual({ since: 1, attacked: false, hurt: false })
    const r2 = rageAfterTurn({ ...beginRage(1), attacked: false, hurt: true }, 2)
    expect(r2.ended).toBeNull(); expect(r2.rage).toEqual({ since: 1, attacked: false, hurt: false })
  })
  it("ends when a turn passes with no attack made and no damage taken", () => {
    const r = rageAfterTurn(beginRage(3), 4)
    expect(r.rage).toBeNull(); expect(r.ended).toMatch(/no attack made and no damage taken/)
  })
  it("ends after one minute (10 rounds) even while fighting", () => {
    expect(RAGE_ROUNDS).toBe(10)
    expect(rageAfterTurn({ since: 1, attacked: true, hurt: true }, 10).ended).toBeNull()
    expect(rageAfterTurn({ since: 1, attacked: true, hurt: true }, 11).ended).toMatch(/minute/)
  })
  it("no rage, nothing to end", () => {
    expect(rageAfterTurn(null, 5)).toEqual({ rage: null, ended: null })
  })
})

describe("Wounded Fury switches on at 10 HP or fewer and off above it", () => {
  const quaggoth = (hp: number) => ({ hp, woundedFury: 10, raging: null })
  const claw = { name: "Claw", hit: 5, dmg: "1d6+3", type: "slashing", reach: 5 }
  it("on at 10, on at 1, off at 11, off at 0 (a body at 0 is down)", () => {
    expect(woundedFury(10, 10)).toBe(true)
    expect(woundedFury(1, 10)).toBe(true)
    expect(woundedFury(11, 10)).toBe(false)
    expect(woundedFury(0, 10)).toBe(false)
  })
  it("nothing for a creature without the trait", () => {
    expect(woundedFury(3, null)).toBe(false)
    expect(woundedFury(3, undefined)).toBe(false)
  })
  it("advantage and +2d6 on a melee hit while on; neither when healed above 10", () => {
    expect(attackRiders(quaggoth(10), claw)).toEqual({ adv: 1, dice: [{ label: "wounded fury", dice: WOUNDED_FURY_DIE }], flat: [] })
    expect(attackRiders(quaggoth(11), claw)).toEqual({ adv: 0, dice: [], flat: [] })
    expect(attackRiders(quaggoth(45), claw)).toEqual({ adv: 0, dice: [], flat: [] })
  })
  it("the extra damage is melee only; the advantage is on every attack roll", () => {
    const r = attackRiders(quaggoth(6), shortbow)
    expect(r.adv).toBe(1); expect(r.dice).toEqual([])
  })
  it("a raging barbarian is not in Wounded Fury: different trait, different trigger", () => {
    expect(attackRiders({ hp: 5, raging: beginRage(1), level: 5 }, greataxe)).toEqual({ adv: 0, dice: [], flat: [{ label: "rage", amount: 2 }] })
  })
})

describe("the red tint follows the state, not the animation", () => {
  it("red while raging, red in Wounded Fury, none otherwise, and it is the approved fury red", () => {
    expect(RAGE_TINT).toBe("#ff4a2a")
    expect(tintFor({ hp: 50, raging: beginRage(1) })).toBe(RAGE_TINT)
    expect(tintFor({ hp: 9, woundedFury: 10 })).toBe(RAGE_TINT)
    expect(tintFor({ hp: 11, woundedFury: 10 })).toBeNull()
    expect(tintFor({ hp: 50, raging: null })).toBeNull()
    expect(tintFor({ hp: 0, woundedFury: 10 })).toBeNull()
  })
})

describe("the painted map reads these rules, it does not keep its own copy", () => {
  const here = new URL(".", import.meta.url)
  const template = readFileSync(new URL("../scripts/velkynvelve-walk/template.html", here), "utf8")
  const built = readFileSync(new URL("../public/velkynvelve-walk/index.html", here), "utf8")
  it("template carries the placeholder build_walk.py fills from lib/rage.mjs", () => {
    expect(template).toContain("/*__RAGE__*/")
    expect(template).not.toMatch(/function rageDamageBonus/)
  })
  it("the built page carries the functions, and nothing in it hand-rolls the Wounded Fury test any more", () => {
    for (const fn of ["rageDamageBonus", "ragesPerLongRest", "canRage", "rageAfterTurn", "attackRiders", "rageResists", "rageAdvantage", "woundedFury", "tintFor"])
      expect(built).toMatch(new RegExp(`function ${fn}\\(`))
    expect(built).not.toContain("/*__RAGE__*/")
    expect(built).not.toMatch(/att\.c\.hp <= att\.c\.sheet\.woundedFury/)
    expect(built).not.toMatch(/c\.hp <= c\.sheet\.woundedFury/)
  })
  it("the resolver, the damage step and the draw loop each call in", () => {
    for (const call of ["attackRiders(", "rageResists(", "rageAfterTurn(", "canRage(", "tintFor("]) expect(template).toContain(call)
  })
})
