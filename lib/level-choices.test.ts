import { describe, expect, it } from "vitest"
import { PENDING_LEVEL_SOURCE } from "./camp"
import { choicesOwed, classSpells, planFor, settleChoices } from "./level-choices"

// Kenta's live sheet, 2026-10-28: Sorcerer 1, SRD 5.2.1, 4 cantrips, 2 prepared.
const casting = { cantrips: ["Ray of Frost", "Shocking Grasp", "Minor Illusion", "Chill Touch"], prepared: ["Disguise Self", "Fog Cloud"], rules_source: "SRD 5.2.1 p.65" }
const marker = (l: number) => ({ name: `Level ${l} — choices to make`, desc: "…", source: PENDING_LEVEL_SOURCE })

describe("planFor", () => {
  it("serves the sorcerer at 2 and 3 only (4+ waits on the class trial)", () => {
    expect(planFor("Sorcerer", 2)).toMatchObject({ newSpells: 2, newCantrips: 0, maxSpellLevel: 1, metamagic: 2, origin: false, sorceryPoints: { from: 0, to: 2 } })
    expect(planFor("Sorcerer", 3)).toMatchObject({ newSpells: 2, maxSpellLevel: 2, metamagic: 0, origin: true })
    expect(planFor("Sorcerer", 4)).toBeNull()
    expect(planFor("Wizard", 2)).toBeNull()
    expect(planFor("Rogue", 2)).toMatchObject({ caster: false, newSpells: 0, origin: false, gains: [{ name: "Cunning Action" }] })
    expect(planFor("Rogue", 3)).toMatchObject({ origin: true, subclassLabel: "Rogue Subclass", sneakAttack: { from: "1d6", to: "2d6" } })
  })
})

describe("classSpells", () => {
  it("is the owned dataset's sorcerer list, no Unearthed Arcana, nothing above the cap", () => {
    const l = classSpells("sorcerer", 1)
    expect(l.some((s) => s.name === "Chromatic Orb" && s.level === 1)).toBe(true)
    expect(l.every((s) => s.level <= 1)).toBe(true)
    expect(classSpells("sorcerer", 2).some((s) => /\(UA\)/.test(s.name))).toBe(false)
  })
})

describe("settleChoices", () => {
  const plan = planFor("Sorcerer", 2)!
  it("writes two spells, two Metamagic, Font of Magic, and clears the level's marker", () => {
    const out = settleChoices(plan, casting, [marker(2)], { metamagic: ["Quickened Spell", "Subtle Spell"], spells: ["Chromatic Orb", "Shield"] })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.spellcasting!.prepared).toEqual(["Disguise Self", "Fog Cloud", "Chromatic Orb", "Shield"])
    expect(out.spellcasting).toMatchObject({ prepared_max: 4, cantrips_max: 4, sorcery_points: { max: 2, used: 0 } })
    expect(out.features.some((f) => f.name.startsWith("Level 2"))).toBe(false)
    expect(out.features.map((f) => f.name)).toEqual(["Font of Magic", "Metamagic: Quickened Spell", "Metamagic: Subtle Spell"])
  })
  it("one swap adds one pick", () => {
    const out = settleChoices(plan, casting, [marker(2)], { metamagic: ["Careful Spell", "Twinned Spell"], spells: ["Shield", "Magic Missile", "Sleep"], swapOut: "Fog Cloud" })
    expect(out.ok && out.spellcasting!.prepared).toEqual(["Disguise Self", "Shield", "Magic Missile", "Sleep"])
  })
  it("refuses what the rules refuse", () => {
    const base = { metamagic: ["Quickened Spell", "Subtle Spell"], spells: ["Chromatic Orb", "Shield"] }
    expect(settleChoices(plan, casting, [], { ...base, spells: ["Chromatic Orb"] })).toMatchObject({ ok: false })
    expect(settleChoices(plan, casting, [], { ...base, spells: ["Chromatic Orb", "Misty Step"] })).toMatchObject({ ok: false })   // 2nd level at level 2
    expect(settleChoices(plan, casting, [], { ...base, spells: ["Chromatic Orb", "Fog Cloud"] })).toMatchObject({ ok: false })   // already prepared
    expect(settleChoices(plan, casting, [], { ...base, metamagic: ["Quickened Spell"] })).toMatchObject({ ok: false })
    expect(settleChoices(plan, casting, [], { ...base, cantrips: ["Fire Bolt"] })).toMatchObject({ ok: false })                     // no cantrip at 2
    expect(settleChoices(planFor("Sorcerer", 3)!, casting, [], { spells: ["Misty Step", "Shield"], origin: "Wild Magic Sorcery" })).toMatchObject({ ok: false })   // closed origin
  })
  it("level 3: an open origin and a 2nd-level spell", () => {
    const out = settleChoices(planFor("Sorcerer", 3)!, { ...casting, prepared: ["Disguise Self", "Fog Cloud", "Chromatic Orb", "Shield"] }, [marker(3)], { origin: "Draconic Sorcery", spells: ["Misty Step", "Scorching Ray"] })
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.features.map((f) => f.name)).toEqual(["Draconic Sorcery"])
  })
})

describe("choicesOwed", () => {
  it("reads the ceremony's marker for that level only", () => {
    expect(choicesOwed([marker(2)], 2)).toBe(true)
    expect(choicesOwed([marker(2)], 3)).toBe(false)
    expect(choicesOwed(null, 2)).toBe(false)
  })
})

describe("the rogue", () => {
  it("level 2 writes Cunning Action and nothing to the spell sheet", () => {
    const out = settleChoices(planFor("Rogue", 2)!, null, [marker(2)], {})
    expect(out.ok).toBe(true)
    if (out.ok){ expect(out.spellcasting).toBeNull(); expect(out.features.map((f) => f.name)).toEqual(["Cunning Action"]) }
  })
  it("level 3 needs the open subclass (Thief); the PHB three stay closed", () => {
    expect(settleChoices(planFor("Rogue", 3)!, null, [marker(3)], {})).toMatchObject({ ok: false })
    expect(settleChoices(planFor("Rogue", 3)!, null, [marker(3)], { origin: "Assassin" })).toMatchObject({ ok: false })
    const out = settleChoices(planFor("Rogue", 3)!, null, [marker(3)], { origin: "Thief" })
    expect(out.ok && out.features.map((f) => f.name)).toEqual(["Steady Aim", "Sneak Attack 2d6", "Thief"])
  })
  it("level 3 raises the sheet's own Sneak Attack line from +1d6 to +2d6 (Fifi's row wording)", () => {
    const sheet = [{ name: "Sneak Attack", desc: "Once per turn, +1d6 damage with a Finesse or Ranged weapon when you have Advantage.", source: "Rogue 1" }, marker(3)]
    const out = settleChoices(planFor("Rogue", 3)!, null, sheet, { origin: "Thief" })
    expect(out.ok && out.features.find((f) => f.name === "Sneak Attack")?.desc).toMatch(/\+2d6 damage/)
    expect(out.ok && out.features.find((f) => f.name === "Sneak Attack")?.desc).not.toMatch(/1d6/)
    // level 2 leaves it alone
    const two = settleChoices(planFor("Rogue", 2)!, null, [sheet[0], marker(2)], {})
    expect(two.ok && two.features.find((f) => f.name === "Sneak Attack")?.desc).toMatch(/\+1d6/)
  })
  it("refuses spells and Metamagic", () => {
    expect(settleChoices(planFor("Rogue", 2)!, null, [], { spells: ["Shield"] })).toMatchObject({ ok: false })
    expect(settleChoices(planFor("Rogue", 2)!, null, [], { metamagic: ["Subtle Spell"] })).toMatchObject({ ok: false })
  })
})

describe("the cleric (SRD 5.2.1)", () => {
  // Samson's live sheet, 2026-10-28: Cleric 1, 3 cantrips, 4 prepared, Bless always prepared (Sam's house rule).
  const sam = { cantrips: ["Guidance", "Toll the Dead", "Thaumaturgy"], prepared: ["Sanctuary", "Healing Word", "Guiding Bolt", "Shield of Faith"], always_prepared: ["Bless"], rules_source: "SRD 5.2.1 p.36" }
  it("plans Channel Divinity and one prepared spell at 2, the domain and a 2nd-level spell at 3", () => {
    expect(planFor("Cleric", 2)).toMatchObject({ cls: "cleric", newSpells: 1, newCantrips: 0, maxSpellLevel: 1, origin: false, channelDivinity: { from: 0, to: 2 } })
    expect(planFor("Cleric", 2)!.gains.map((g) => g.name)).toEqual(["Channel Divinity", "Divine Spark", "Turn Undead"])
    expect(planFor("Cleric", 3)).toMatchObject({ newSpells: 1, maxSpellLevel: 2, origin: true, subclassLabel: "Divine Domain", prepared: { from: 5, to: 6 } })
  })
  it("level 2 writes the spell, two Channel Divinity uses, and no sorcery points", () => {
    const out = settleChoices(planFor("Cleric", 2)!, sam, [marker(2)], { spells: ["Cure Wounds"] })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.spellcasting!.prepared).toEqual([...sam.prepared, "Cure Wounds"])
    expect(out.spellcasting).toMatchObject({ prepared_max: 5, cantrips_max: 3, channel_divinity: { max: 2, used: 0 } })
    expect(out.spellcasting).not.toHaveProperty("sorcery_points")
    expect(out.features.map((f) => f.name)).toEqual(["Channel Divinity", "Divine Spark", "Turn Undead"])
  })
  it("refuses Bless (always prepared), a 2nd-level spell at 2, and a sorcerer spell", () => {
    expect(settleChoices(planFor("Cleric", 2)!, sam, [], { spells: ["Bless"] })).toMatchObject({ ok: false })
    expect(settleChoices(planFor("Cleric", 2)!, sam, [], { spells: ["Aid"] })).toMatchObject({ ok: false })
    expect(settleChoices(planFor("Cleric", 2)!, sam, [], { spells: ["Shield"] })).toMatchObject({ ok: false })
  })
  it("level 3 Life Domain writes its features and always-prepared spells; the PHB domains stay closed", () => {
    const l2 = { ...sam, prepared: [...sam.prepared, "Command"], channel_divinity: { max: 2, used: 1 } }
    expect(settleChoices(planFor("Cleric", 3)!, l2, [marker(3)], { spells: ["Spiritual Weapon"], origin: "War Domain" })).toMatchObject({ ok: false })
    expect(settleChoices(planFor("Cleric", 3)!, l2, [marker(3)], { spells: ["Aid"], origin: "Life Domain" })).toMatchObject({ ok: false })   // Aid comes with the domain
    const out = settleChoices(planFor("Cleric", 3)!, l2, [marker(3)], { spells: ["Spiritual Weapon"], origin: "Life Domain" })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.features.map((f) => f.name)).toEqual(["Life Domain", "Disciple of Life", "Preserve Life"])
    expect(out.spellcasting).toMatchObject({ always_prepared: ["Bless", "Aid", "Cure Wounds", "Lesser Restoration"], channel_divinity: { max: 2, used: 1 }, prepared_max: 6 })
  })
  it("a spell the domain makes always prepared leaves the chosen list", () => {
    const l2 = { ...sam, prepared: [...sam.prepared, "Cure Wounds"] }
    const out = settleChoices(planFor("Cleric", 3)!, l2, [marker(3)], { spells: ["Spiritual Weapon"], origin: "Life Domain" })
    expect(out.ok && out.spellcasting!.prepared).toEqual([...sam.prepared, "Spiritual Weapon"])
  })
})

describe("the bard (SRD 5.2.1)", () => {
  // Scott's live sheet, 2026-10-28: Bard 1, 2 cantrips, 4 prepared, seven skill proficiencies.
  const scott = { cantrips: ["Mage Hand", "Vicious Mockery"], prepared: ["Healing Word", "Faerie Fire", "Sleep", "Dissonant Whispers"], always_prepared: [], rules_source: "SRD 5.2.1 p.31" }
  const sk = { arcana: "proficient", nature: "proficient", history: "proficient", acrobatics: "proficient", perception: "proficient", persuasion: "proficient", performance: "proficient" }
  it("level 2: Jack of All Trades, two Expertise, one spell", () => {
    expect(planFor("Bard", 2)).toMatchObject({ cls: "bard", newSpells: 1, expertise: 2, origin: false })
    const out = settleChoices(planFor("Bard", 2)!, scott, [marker(2)], { spells: ["Heroism"], expertise: ["performance", "persuasion"] }, sk)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.skills).toMatchObject({ performance: "expertise", persuasion: "expertise", arcana: "proficient" })
    expect(out.features.map((f) => f.name)).toEqual(["Jack of All Trades", "Expertise"])
    expect(out.spellcasting).not.toHaveProperty("channel_divinity")
  })
  it("Expertise needs a proficiency you have, and two of them", () => {
    expect(settleChoices(planFor("Bard", 2)!, scott, [], { spells: ["Heroism"], expertise: ["stealth", "persuasion"] }, sk)).toMatchObject({ ok: false })
    expect(settleChoices(planFor("Bard", 2)!, scott, [], { spells: ["Heroism"], expertise: ["persuasion"] }, sk)).toMatchObject({ ok: false })
  })
  it("level 3 College of Lore: three new skills and Cutting Words; Valor stays closed", () => {
    const sk2 = { ...sk, performance: "expertise", persuasion: "expertise" }
    expect(settleChoices(planFor("Bard", 3)!, scott, [marker(3)], { spells: ["Shatter"], origin: "College of Valor" }, sk2)).toMatchObject({ ok: false })
    expect(settleChoices(planFor("Bard", 3)!, scott, [marker(3)], { spells: ["Shatter"], origin: "College of Lore", skills: ["stealth", "insight", "arcana"] }, sk2)).toMatchObject({ ok: false })   // arcana already
    const out = settleChoices(planFor("Bard", 3)!, scott, [marker(3)], { spells: ["Shatter"], origin: "College of Lore", skills: ["stealth", "insight", "deception"] }, sk2)
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.features.map((f) => f.name)).toEqual(["College of Lore", "Cutting Words", "Bonus Proficiencies"])
    expect(out.skills).toMatchObject({ stealth: "proficient", insight: "proficient", deception: "proficient", performance: "expertise" })
  })
})
