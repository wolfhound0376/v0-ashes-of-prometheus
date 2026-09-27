import { describe, expect, it } from "vitest"
import {
  ailmentsOf, attune, copyScroll, cure, cureOptions, decipher, deityOf, devotionPath, identify, investigate,
  medicineMenu, prayMenu, prayToGod, readScroll, riteOptions, studyMenu, tend, tendOptions,
  type RiteSheet, type StudyItem, type StudySheet,
} from "./camp-rites"

// Real rows (2026-09-27): Samson — Cleric 1, Lathander, slots 2/2 used; Kenta — Sorcerer 1, Kelemvor, Unconscious.
const samson: RiteSheet = {
  id: "samson", name: "Samson", class: "Cleric", level: 1, wis_score: 16, int_score: 10, hp_current: 9, hp_max: 9,
  sheet_skill_proficiencies: { Insight: "proficient", Medicine: "proficient", Religion: "proficient" },
  sheet_spellcasting: { ability: "Wisdom", slots: { "1": { max: 2, used: 2 } }, cantrips: ["Guidance", "Toll the Dead", "Thaumaturgy"], prepared: ["Sanctuary", "Healing Word", "Guiding Bolt", "Shield of Faith"] },
  sheet_personality: { faith: "Lathander" },
}
const kenta: RiteSheet = { id: "kenta", name: "Kenta", class: "Sorcerer", level: 1, wis_score: 8, hp_current: 0, hp_max: 8, conditions: ["Faerie Fire", "Unconscious"], sheet_personality: { faith: "Kelemvor" } }
const fifi: RiteSheet = { id: "fifi", name: "Fifi", class: "Rogue", level: 1, wis_score: 12, hp_current: 8, hp_max: 8, sheet_personality: {} }
const rested = { ...samson, sheet_spellcasting: { ...samson.sheet_spellcasting, slots: { "1": { max: 2, used: 0 } } } }
const seq = (...faces: number[]) => { let i = 0; return () => (faces[i++ % faces.length] - 1) / 20 + 0.001 }

describe("medicine", () => {
  it("investigate is dark unless someone is ill", () => {
    const m = medicineMenu(samson, [samson, kenta, fifi])
    expect(m.find((o) => o.k === "investigate")).toMatchObject({ ok: false, highlight: false })
    const sick = { ...fifi, conditions: ["Sewer Plague"] }
    expect(medicineMenu(samson, [samson, sick]).find((o) => o.k === "investigate")).toMatchObject({ ok: true, highlight: true })
  })
  it("Samson with no slots can still stabilise Kenta by hand", () => {
    const o = tendOptions(samson, kenta)
    expect(o.find((x) => x.k === "spell:Healing Word")).toMatchObject({ ok: false, reason: expect.stringMatching(/No level 1/) })
    expect(o.find((x) => x.k === "kit-stabilize")?.ok).toBe(false)
    expect(o.find((x) => x.k === "stabilize")?.ok).toBe(true)
    const r = tend(samson, kenta, "stabilize", {}, seq(8)) // 8 + 3 WIS + 2 prof = 13 ≥ 10
    expect(r.stabilized).toBe(true)
    expect(r.check?.total).toBe(13)
  })
  it("Healing Word heals 2d4 + WIS and spends the slot", () => {
    const d4 = [0.6, 0.9] // d4 faces 3 and 4
    let i = 0
    const r = tend(rested, { ...fifi, hp_current: 2 }, "spell:Healing Word", {}, () => d4[i++])
    expect(r).toMatchObject({ ok: true, healed: 6, hp: 8, slotSpent: 1 }) // 3+4+3 = 10, capped at 6
  })
  it("a Healer's Kit stabilises without a check", () => {
    expect(tend(samson, kenta, "kit-stabilize", { healersKitUses: 3 }, seq(1))).toMatchObject({ stabilized: true, kitUsed: true, check: null })
  })
  it("diagnosis uses the disease's DC and names the cure", () => {
    const sick = { ...fifi, conditions: ["Sight Rot"] }
    expect(ailmentsOf(sick)[0]).toMatchObject({ kind: "disease", dc: 15 })
    const d = investigate(samson, sick, seq(12)) // 12+3+2 = 17
    expect(d.check?.success).toBe(true)
    expect(d.note).toMatch(/Eyebright/)
  })
  it("antitoxin does not cure; Lesser Restoration needs a level 2 spell", () => {
    const poisoned = { ...fifi, conditions: ["Poisoned"] }
    const opts = cureOptions(samson, poisoned, { antitoxin: 1 })
    expect(opts.find((o) => o.k === "spell:Lesser Restoration")?.ok).toBe(false)
    expect(cure(samson, poisoned, "antitoxin", { antitoxin: 1 })).toMatchObject({ ok: true, cured: null })
  })
})

describe("pray", () => {
  it("the god on the sheet is the option", () => {
    expect(deityOf(samson)).toBe("Lathander")
    expect(prayMenu(samson).map((o) => o.title)).toEqual(["HOLY RITES", "PRAY TO LATHANDER"])
    expect(prayMenu(fifi).map((o) => o.title)).toEqual(["PRAY"])
    expect(prayMenu({ ...fifi, class: "Warlock" }).map((o) => o.k)).toEqual(["patron", "god"])
  })
  it("the animation follows the path", () => {
    expect([samson, kenta, { ...fifi, class: "Warlock" }].map(devotionPath)).toEqual(["cleric", "devout", "warlock"])
  })
  it("rites: no ritual prepared is said plainly", () => {
    const r = riteOptions(samson)
    expect(r[0]).toMatchObject({ k: "ritual", ok: false })
    expect(riteOptions({ ...samson, sheet_spellcasting: { ...samson.sheet_spellcasting, prepared: ["Purify Food and Drink"] } })[0].k).toBe("ritual:Purify Food and Drink")
  })
  it("success inspires the prayer; a 20 inspires the party; once a rest", () => {
    const party = [samson, kenta, fifi]
    expect(prayToGod(samson, party, seq(10)).inspired).toEqual(["samson"]) // 10+3+2 = 15
    expect(prayToGod(samson, party, seq(20)).inspired).toEqual(["samson", "kenta", "fifi"])
    expect(prayToGod(samson, party, seq(2)).inspired).toEqual([])
    expect(prayToGod(samson, party, seq(20), { prayedThisRest: true }).ok).toBe(false)
  })
})

describe("study", () => {
  const wiz: StudySheet = { id: "w", name: "Vex", class: "Wizard", level: 3, int_score: 16, sheet_spellcasting: { slots: { "1": { max: 4, used: 0 }, "2": { max: 2, used: 0 } } }, languages: ["Common", "Elvish"] }
  const ring: StudyItem = { id: "r", name: "Ring of Protection", rarity: "rare", attunement: true }
  const cursed: StudyItem = { id: "c", name: "Dark Blade", rarity: "uncommon", cursed: true }
  const scroll: StudyItem = { id: "s", name: "Scroll", kind: "scroll", spell: { name: "Shield", level: 1, classes: ["Sorcerer", "Wizard"] } }
  it("learn-scroll exists only for a wizard", () => {
    expect(studyMenu(fifi, [scroll]).some((o) => o.k === "learn-scroll")).toBe(false)
    expect(studyMenu(wiz, [scroll]).find((o) => o.k === "learn-scroll")?.ok).toBe(true)
  })
  it("three attunements at most", () => {
    const pack = [1, 2, 3].map((i) => ({ ...ring, id: `a${i}`, attunedBy: "w" }))
    expect(attune(wiz, ring, [...pack, ring]).ok).toBe(false)
    expect(attune(wiz, ring, [ring]).ok).toBe(true)
  })
  it("a cursed item reveals nothing", () => {
    expect(identify(fifi, cursed).note).toMatch(/keeps to itself/)
  })
  it("a scroll off your list is unintelligible", () => {
    expect(readScroll(samson, scroll).note).toMatch(/Unintelligible/)
    expect(readScroll(wiz, scroll).note).toMatch(/could cast it/)
  })
  it("copying costs 50 gp a level", () => {
    expect(copyScroll(wiz, scroll, 40).ok).toBe(false)
    expect(copyScroll(wiz, scroll, 60).write).toMatchObject({ gp_spent: 50 })
  })
  it("a known language reads without a roll", () => {
    expect(decipher(wiz, { id: "b", name: "Journal", kind: "book", language: "Elvish" }, seq(1)).check).toBeUndefined()
    expect(decipher(wiz, { id: "b", name: "Tablet", kind: "book", language: "Undercommon", subject: "arcana" }, seq(10)).check?.total).toBe(13)
  })
})
