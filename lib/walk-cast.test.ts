import { describe, expect, it } from "vitest"
import { castKind, castList, entryFor, healAmount, planCast, spendSlot } from "./walk-cast"

// Gandalf's and Samson's sheets as read 2026-10-23
const GANDALF = { slots: { "1": { max: 2, used: 0 } }, cantrips: ["Fire Bolt", "Mage Hand", "Ray of Frost"], prepared: ["Chromatic Orb", "Shield", "Magic Missile", "Thunderwave"] }
const SAMSON = { slots: { "1": { max: 2, used: 0 } }, cantrips: ["Guidance", "Toll the Dead", "Thaumaturgy"], prepared: ["Sanctuary", "Healing Word", "Guiding Bolt", "Shield of Faith"], always_prepared: [] }

describe("casting outside a fight", () => {
  it("lists every memorized spell with its level, never treating a levelled spell as a free cantrip", () => {
    const l = castList(GANDALF)
    expect(l.map((s) => s.name)).toEqual(["Fire Bolt", "Mage Hand", "Ray of Frost", "Chromatic Orb", "Shield", "Magic Missile", "Thunderwave"])
    // Shield, Magic Missile, Thunderwave and Chromatic Orb have no spellbook row: their level comes from lib/data/spells.json
    for (const n of ["Chromatic Orb", "Shield", "Magic Missile", "Thunderwave"]) expect(l.find((s) => s.name === n)?.level).toBe(1)
    expect(l.find((s) => s.name === "Mage Hand")).toMatchObject({ level: 0, left: null })
    expect(l.find((s) => s.name === "Shield")).toMatchObject({ left: 2 })
  })

  it("sorts spells into heal / fight / utility", () => {
    expect(castKind(entryFor("Healing Word"))).toBe("heal")
    expect(castKind(entryFor("Fire Bolt"))).toBe("fight")
    expect(castKind(entryFor("Magic Missile"))).toBe("fight")
    expect(castKind(entryFor("Mage Hand"))).toBe("utility")
    expect(castKind(entryFor("Shield of Faith"))).toBe("utility")
  })

  it("refuses a spell they do not know, and a levelled spell with no slot left", () => {
    expect(planCast(GANDALF, "Fireball")).toMatchObject({ ok: false })
    expect(planCast({ ...GANDALF, slots: { "1": { max: 2, used: 2 } } }, "Shield")).toMatchObject({ ok: false, why: expect.stringMatching(/No level 1 spell slots left/) })
    expect(planCast({ ...GANDALF, slots: { "1": { max: 2, used: 2 } } }, "Mage Hand")).toMatchObject({ ok: true, level: 0 })
  })

  it("spends exactly one slot of the spell's level, and none for a cantrip", () => {
    expect(spendSlot(SAMSON, 1).slots?.["1"]).toEqual({ max: 2, used: 1 })
    expect(spendSlot(SAMSON, 0)).toBe(SAMSON)
  })

  it("heals with SRD 5.2.1 Healing Word (2d4) plus the caster's modifier", () => {
    const plan = planCast(SAMSON, "Healing Word")
    if (!plan.ok) throw new Error(plan.why)
    expect(healAmount(plan.name, plan.entry, 3, () => 0)).toBe(2 + 3)       // two 1s
    expect(healAmount(plan.name, plan.entry, 3, () => 0.999)).toBe(8 + 3)   // two 4s
  })
})
