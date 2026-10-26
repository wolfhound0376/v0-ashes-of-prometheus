import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import {
  SURGEON_RULES, SURGEON_VICTIMS, SURGEON_BOONS, SURGEON_LINES,
  surgeonVictim, surgeonSpeaksElvish, surgeonRoll, surgeonBolt, surgeonVolley, surgeonHeal, surgeonPersuade, surgeonBoon,
} from "./drow-surgeon.mjs"

// a scripted die: each call returns the next value, as the fraction that makes surgeonD(sides) land on `face`
const dice = (...faces: [number, number][]) => {
  const q = [...faces]
  return () => { const [face, sides] = q.shift()!; return (face - 0.5) / sides }
}

describe("the victim table (Sam's d8)", () => {
  it("is the eight prisoners a plain bolt can kill, no wererats", () => {
    expect(SURGEON_VICTIMS.map((v) => v.d8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect(SURGEON_VICTIMS.map((v) => v.id)).not.toContain("topsy")
    expect(SURGEON_VICTIMS.map((v) => v.id)).not.toContain("turvy")
  })
  it("a roll names its prisoner", () => {
    expect(surgeonVictim(5)?.name).toBe("Ront")
    expect(surgeonVictim(8)?.name).toBe("Stool")
  })
  it("a prisoner already gone passes it to the next, round the end", () => {
    expect(surgeonVictim(5, ["ront"])?.id).toBe("sarith")
    expect(surgeonVictim(8, ["stool"])?.id).toBe("buppido")
    expect(surgeonVictim(1, SURGEON_VICTIMS.map((v) => v.id))).toBeNull()
  })
})

describe("who understands her", () => {
  it("reads Elvish from the languages line", () => {
    expect(surgeonSpeaksElvish("Common, Elvish")).toBe(true)
    expect(surgeonSpeaksElvish(["Common", "elven"])).toBe(true)
    expect(surgeonSpeaksElvish("Common, Goblin, Thieves' Cant, Undercommon")).toBe(false)
    expect(surgeonSpeaksElvish(null)).toBe(false)
    expect(surgeonSpeaksElvish("Common, one extra language")).toBe(false)
  })
})

describe("the bolt (bestiary drow: +4, 1d6+2, DC 13 CON)", () => {
  it("uses the sourced numbers", () => {
    expect(SURGEON_RULES.bolt).toMatchObject({ hit: 4, dmg: "1d6+2", poisonDc: 13 })
    expect(SURGEON_RULES.potion.heal).toBe("2d4+2")
  })
  it("a natural 1 misses whatever the total", () => {
    const b = surgeonBolt({ ac: 3, hp: 9, conSave: 0 }, dice([1, 20]))
    expect(b.hit).toBe(false); expect(b.hpAfter).toBe(9)
  })
  it("a hit wounds; a save the poison misses", () => {
    const b = surgeonBolt({ ac: 12, hp: 9, conSave: 2 }, dice([10, 20], [3, 6], [12, 20]))
    expect(b.hit).toBe(true); expect(b.dmg).toBe(5); expect(b.hpAfter).toBe(4)
    expect(b.save).toMatchObject({ total: 14, ok: true }); expect(b.down).toBe(false)
  })
  it("a natural 20 doubles the dice, not the +2", () => {
    const b = surgeonBolt({ ac: 30, hp: 30, conSave: 0 }, dice([20, 20], [4, 6], [5, 6], [15, 20]))
    expect(b.crit).toBe(true); expect(b.dmg).toBe(11)
  })
  it("failing the save by 5 or more knocks them out at any HP", () => {
    const b = surgeonBolt({ ac: 10, hp: 20, conSave: 0 }, dice([15, 20], [1, 6], [7, 20]))
    expect(b.hpAfter).toBe(17); expect(b.poisoned).toBe(true); expect(b.ko).toBe(true); expect(b.down).toBe(true)
  })
  it("0 HP is down", () => {
    const b = surgeonBolt({ ac: 10, hp: 3, conSave: 0 }, dice([15, 20], [2, 6], [18, 20]))
    expect(b.hpAfter).toBe(0); expect(b.down).toBe(true)
  })
})

describe("a volley", () => {
  it("stops the moment the prisoner drops", () => {
    const v = surgeonVolley({ ac: 10, hp: 3, conSave: 0 }, 2, dice([15, 20], [6, 6], [18, 20]))
    expect(v.bolts.length).toBe(1); expect(v.down).toBe(true); expect(v.hpAfter).toBe(0)
  })
  it("one bolt per guard while they stand", () => {
    const v = surgeonVolley({ ac: 20, hp: 9, conSave: 0 }, 2, dice([2, 20], [3, 20]))
    expect(v.bolts.length).toBe(2); expect(v.down).toBe(false); expect(v.hpAfter).toBe(9)
  })
})

describe("the potion", () => {
  it("heals 2d4+2 from where they lie, never past the maximum", () => {
    expect(surgeonHeal(0, 9, dice([3, 4], [4, 4])).hpAfter).toBe(9)
    expect(surgeonHeal(0, 20, dice([1, 4], [1, 4])).amount).toBe(4)
  })
})

describe("talking her round", () => {
  it("DC 15, a straight roll in Elvish", () => {
    const r = surgeonPersuade(3, false, dice([12, 20]))
    expect(r.rolls).toEqual([12]); expect(r.total).toBe(15); expect(r.success).toBe(true)
  })
  it("through a translator: disadvantage, the lower die", () => {
    const r = surgeonPersuade(3, true, dice([18, 20], [9, 20]))
    expect(r.rolls).toEqual([18, 9]); expect(r.d20).toBe(9); expect(r.success).toBe(false)
  })
})

describe("the favours (Sam's d4)", () => {
  it("names catalog slugs only, and the dagger hides its name", () => {
    expect(surgeonBoon(1).slug).toBe("drow-lockpick")
    expect(surgeonBoon(2)).toMatchObject({ slug: "diluted-drow-poison", to: "downed" })
    expect(surgeonBoon(3).kind).toBe("jorlan")
    expect(surgeonBoon(4)).toMatchObject({ slug: "lolths-tooth", shown: "Drow ritual dagger" })
    expect(SURGEON_BOONS[4].shown).not.toMatch(/lolth/i)
  })
  it("every line she says has both her tongue and the translation", () => {
    for (const l of Object.values(SURGEON_LINES)) { expect(l.en.length).toBeGreaterThan(0); expect(l.elv.length).toBeGreaterThan(0) }
  })
})

describe("the map reads this same file", () => {
  it("template carries the placeholder build_walk.py fills from lib/drow-surgeon.mjs", () => {
    const t = readFileSync("scripts/velkynvelve-walk/template.html", "utf8")
    expect(t).toContain("/*__DROW_SURGEON__*/")
    const b = readFileSync("scripts/velkynvelve-walk/build_walk.py", "utf8")
    expect(b).toContain("drow-surgeon.mjs")
  })
})
