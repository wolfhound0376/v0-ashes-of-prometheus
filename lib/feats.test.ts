import { describe, expect, it } from "vitest"
import { PENDING_LEVEL_SOURCE } from "./camp"
import { FEATS, featBlocked, featOptions } from "./feats"
import { planFor, settleChoices, type HeroStats } from "./level-choices"

const marker = (l: number) => ({ name: `Level ${l} — choices to make`, desc: "…", source: PENDING_LEVEL_SOURCE })
// Kenta-like sorcerer at level 3 → 4 (SRD 5.2.1): CHA 17, CON 15, Lucky not taken
const kentaStats: HeroStats = { scores: { STR: 12, DEX: 10, CON: 15, INT: 10, WIS: 10, CHA: 17 }, hp_max: 26, hp_current: 20, initiative: 0, proficiency_bonus: 2, featureNames: ["Spellcasting", "Innate Sorcery"] }
const kentaCasting = { cantrips: ["Ray of Frost", "Shocking Grasp", "Minor Illusion", "Chill Touch"], prepared: ["Disguise Self", "Fog Cloud", "Chromatic Orb", "Shield", "Mirror Image", "Misty Step"], ability: "Charisma", save_dc: 13, attack_bonus: 5 }
// Lynkes-like rogue: DEX 17, already has Lucky
const lynkesStats: HeroStats = { scores: { STR: 10, DEX: 17, CON: 10, INT: 10, WIS: 10, CHA: 15 }, hp_max: 27, hp_current: 27, initiative: 3, proficiency_bonus: 2, featureNames: ["Sneak Attack", "Lucky"] }
const spellPicks = { spells: ["Magic Missile"], cantrips: ["Fire Bolt"] }

describe("the feat catalogue", () => {
  it("every feat has a name, a description and a source", () => {
    for (const f of FEATS) { expect(f.name).toBeTruthy(); expect(f.desc.length).toBeGreaterThan(10); expect(f.source).toMatch(/SRD 5\.2\.1|PHB 2024/) }
    expect(new Set(FEATS.map((f) => f.name)).size).toBe(FEATS.length)
  })
  it("opens only SRD feats; PHB feats and Magic Initiate stay locked with a reason", () => {
    for (const f of FEATS.filter((x) => x.open)) expect(f.source).toBe("SRD 5.2.1")
    const ctx = { level: 4, scores: lynkesStats.scores, featureNames: [], spellcasting: false, fightingStyle: false }
    expect(featBlocked(FEATS.find((f) => f.name === "War Caster")!, ctx)).toMatch(/Player's Handbook/)
    expect(featBlocked(FEATS.find((f) => f.name === "Magic Initiate")!, ctx)).toMatch(/DM/)
  })
  it("checks prerequisites: Grappler needs STR or DEX 13; a feat already on the sheet is refused", () => {
    const g = FEATS.find((f) => f.name === "Grappler")!
    expect(featBlocked(g, { level: 4, scores: { STR: 10, DEX: 12 }, featureNames: [], spellcasting: false, fightingStyle: false })).toMatch(/13/)
    expect(featBlocked(g, { level: 4, scores: { STR: 8, DEX: 17 }, featureNames: [], spellcasting: false, fightingStyle: false })).toBeNull()
    expect(featBlocked(FEATS.find((f) => f.name === "Alert")!, { level: 4, scores: {}, featureNames: ["Alert"], spellcasting: false, fightingStyle: false })).toBe("Already yours.")
  })
  it("offers origin and general feats, takeable ones first; fighting styles only with the feature", () => {
    const opts = featOptions({ level: 4, scores: lynkesStats.scores, featureNames: [], spellcasting: false, fightingStyle: false })
    expect(opts.some((o) => o.name === "Archery")).toBe(false)
    expect(opts[0].ok).toBe(true)
    expect(opts.filter((o) => o.ok).map((o) => o.name).sort()).toEqual(["Alert", "Grappler", "Savage Attacker", "Skilled"])
    expect(featOptions({ level: 4, scores: {}, featureNames: ["Fighting Style"], spellcasting: false, fightingStyle: true }).some((o) => o.name === "Archery" && o.ok)).toBe(true)
  })
})

describe("level 4: the Ability Score Improvement or a feat (SRD 5.2.1)", () => {
  const plan = planFor("Sorcerer", 4)!
  it("plans the improvement for every class this screen serves", () => {
    for (const c of ["Sorcerer", "Rogue", "Cleric", "Bard", "Wizard"]) expect(planFor(c, 4)).toMatchObject({ improvement: true, origin: false })
    expect(planFor("Rogue", 4)!.sneakAttack).toEqual({ from: "2d6", to: "2d6" })
    expect(planFor("Sorcerer", 3)!.improvement).toBe(false)
  })
  it("+2 CHA: score, modifier, save DC and spell attack all move; the marker clears", () => {
    const out = settleChoices(plan, kentaCasting, [marker(4)], { ...spellPicks, asi: { CHA: 2 } }, {}, kentaStats)
    if (!out.ok) throw new Error(out.error)
    expect(out.columns).toMatchObject({ cha_score: 19, cha_modifier: 4 })
    expect(out.spellcasting).toMatchObject({ save_dc: 14, attack_bonus: 6 })
    expect(out.features.some((f) => f.name === "Level 4 — choices to make")).toBe(false)
    expect(out.features.find((f) => f.name === "Ability Score Improvement")).toMatchObject({ desc: "+2 CHA (17 → 19).", source: "Feat · SRD 5.2.1 · level 4" })
  })
  it("+1 CHA +1 CON: CON 15 → 16 raises the modifier, so HP max rises by 1 per level", () => {
    const out = settleChoices(plan, kentaCasting, [marker(4)], { ...spellPicks, asi: { CHA: 1, CON: 1 } }, {}, kentaStats)
    if (!out.ok) throw new Error(out.error)
    expect(out.columns).toMatchObject({ con_score: 16, con_modifier: 3, cha_score: 18, cha_modifier: 4, hp_max: 30, hp_current: 24 })
  })
  it("refuses a bad split, both at once, nothing at all, and a score past 20", () => {
    const bad = (asi: Record<string, number>) => settleChoices(plan, kentaCasting, [marker(4)], { ...spellPicks, asi }, {}, kentaStats)
    expect(bad({ CHA: 3 })).toMatchObject({ ok: false })
    expect(bad({ CHA: 1 })).toMatchObject({ ok: false })
    expect(bad({ CHA: 1, CON: 1, STR: 1 })).toMatchObject({ ok: false })
    expect(settleChoices(plan, kentaCasting, [marker(4)], { ...spellPicks, asi: { CHA: 2 } }, {}, { ...kentaStats, scores: { ...kentaStats.scores, CHA: 19 } })).toMatchObject({ ok: false, error: "CHA cannot go above 20." })
    expect(settleChoices(plan, kentaCasting, [marker(4)], { ...spellPicks, asi: { CHA: 2 }, feat: "Alert" }, {}, kentaStats)).toMatchObject({ ok: false })
    expect(settleChoices(plan, kentaCasting, [marker(4)], { ...spellPicks }, {}, kentaStats)).toMatchObject({ ok: false, error: "Choose the Ability Score Improvement or a feat." })
  })
  it("Alert: the feat lands under Feats and Initiative gains the Proficiency Bonus", () => {
    const rogue = planFor("Rogue", 4)!
    const out = settleChoices(rogue, null, [marker(4)], { feat: "Alert" }, {}, lynkesStats)
    if (!out.ok) throw new Error(out.error)
    expect(out.columns).toEqual({ initiative: 5 })
    expect(out.features.find((f) => f.name === "Alert")!.source).toBe("Feat · SRD 5.2.1 · level 4")
  })
  it("Grappler: its +1 must go to STR or DEX; DEX 17 → 18 also raises Initiative", () => {
    const rogue = planFor("Rogue", 4)!
    expect(settleChoices(rogue, null, [marker(4)], { feat: "Grappler" }, {}, lynkesStats)).toMatchObject({ ok: false })
    expect(settleChoices(rogue, null, [marker(4)], { feat: "Grappler", featAbility: "CHA" }, {}, lynkesStats)).toMatchObject({ ok: false })
    const out = settleChoices(rogue, null, [marker(4)], { feat: "Grappler", featAbility: "DEX" }, {}, lynkesStats)
    if (!out.ok) throw new Error(out.error)
    expect(out.columns).toEqual({ dex_score: 18, dex_modifier: 4, initiative: 4 })
  })
  it("Skilled: three new skills, none already proficient", () => {
    const rogue = planFor("Rogue", 4)!
    const sheet = { stealth: "expertise", perception: "proficient" }
    expect(settleChoices(rogue, null, [marker(4)], { feat: "Skilled", featSkills: ["stealth", "arcana", "history"] }, sheet, lynkesStats)).toMatchObject({ ok: false })
    expect(settleChoices(rogue, null, [marker(4)], { feat: "Skilled", featSkills: ["arcana", "history"] }, sheet, lynkesStats)).toMatchObject({ ok: false })
    const out = settleChoices(rogue, null, [marker(4)], { feat: "Skilled", featSkills: ["arcana", "history", "insight"] }, sheet, lynkesStats)
    if (!out.ok) throw new Error(out.error)
    expect(out.skills).toMatchObject({ stealth: "expertise", arcana: "proficient", history: "proficient", insight: "proficient" })
    expect(out.columns).toBeNull()
  })
  it("refuses a closed PHB feat, a feat already on the sheet, and any improvement at level 3", () => {
    const rogue = planFor("Rogue", 4)!
    expect(settleChoices(rogue, null, [marker(4)], { feat: "Sharpshooter" }, {}, lynkesStats)).toMatchObject({ ok: false })
    expect(settleChoices(rogue, null, [marker(4)], { feat: "Alert" }, {}, { ...lynkesStats, featureNames: ["Alert"] })).toMatchObject({ ok: false })
    expect(settleChoices(planFor("Rogue", 3)!, null, [marker(3)], { origin: "Thief", asi: { DEX: 2 } }, {}, lynkesStats)).toMatchObject({ ok: false })
  })
})
