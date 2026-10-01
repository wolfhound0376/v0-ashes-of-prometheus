import { describe, expect, it } from "vitest"
import type { Rng } from "./game-context"
import type { Deity, Standing } from "./prayer"
import {
  COMMUNE_INDIFFERENCE_CEILING,
  OBSERVANCE_CADENCE_DAYS,
  OBSERVANCE_GRACE_DAYS,
  affinityScore,
  communeOutcome,
  daysUntilLapse,
  domainGate,
  grantDecision,
  missionGate,
  observanceState,
  owedSpellLevelFromSlots,
  patronAlwaysAnswers,
  selectGrantedSpells,
  type GrantInput,
  type Mission,
  type SpellLike,
} from "./devotion"

const LATHANDER: Deity = {
  slug: "lathander",
  name: "Lathander",
  reach: "dawn_hour",
  portfolio: ["dawn", "light", "renewal", "healing", "radiant"],
}

const BLANK: Standing = { attention: 0, accord: 0, debt: 0 }
const FORSWORN: Standing = { ...BLANK, vows: [{ text: "x", state: "broken" }] }

const seq = (...v: number[]): Rng => {
  let i = 0
  return () => v[Math.min(i++, v.length - 1)]
}

describe("observance", () => {
  const at = (last: number | null, today: number) => observanceState({ lastPrayerDay: last, today })

  it("treats a character who has never prayed as due, not lapsed", () => {
    // You cannot fall behind on an observance nobody told you about.
    expect(at(null, 500)).toBe("due")
  })

  it("is current inside the cadence", () => {
    expect(at(10, 10)).toBe("current")
    expect(at(10, 10 + OBSERVANCE_CADENCE_DAYS - 1)).toBe("current")
  })

  it("is due through the grace window", () => {
    expect(at(10, 10 + OBSERVANCE_CADENCE_DAYS)).toBe("due")
    expect(at(10, 10 + OBSERVANCE_CADENCE_DAYS + OBSERVANCE_GRACE_DAYS)).toBe("due")
  })

  it("lapses only after the grace runs out", () => {
    expect(at(10, 10 + OBSERVANCE_CADENCE_DAYS + OBSERVANCE_GRACE_DAYS + 1)).toBe("lapsed")
  })

  it("counts down to the lapse for the sheet nudge", () => {
    expect(daysUntilLapse({ lastPrayerDay: 10, today: 10 })).toBe(OBSERVANCE_CADENCE_DAYS + OBSERVANCE_GRACE_DAYS)
    expect(daysUntilLapse({ lastPrayerDay: 10, today: 30 })).toBeLessThan(0)
  })
})

describe("the grant — rails that stop this bricking a cleric", () => {
  const base: GrantInput = {
    characterClass: "cleric",
    owedSpellLevel: 2,
    grantedSpellLevel: 1,
    standing: BLANK,
    observance: "current",
  }

  it("RAIL 1: slots always advance, whatever the god thinks", () => {
    for (const observance of ["current", "due", "lapsed"] as const) {
      for (const standing of [BLANK, FORSWORN]) {
        expect(grantDecision({ ...base, observance, standing }).slotsAdvance).toBe(true)
      }
    }
  })

  it("RAIL 2: nothing is ever revoked, however badly it is going", () => {
    const worst = grantDecision({ ...base, observance: "lapsed", standing: FORSWORN })
    expect(worst.revokes).toBe(false)
    expect(worst.grantSpellLevel).toBeNull()
    // Null means "gain nothing", never "lose what you had".
    expect(base.grantedSpellLevel).toBe(1)
  })

  it("grants the next level when the observance is kept", () => {
    const d = grantDecision(base)
    expect(d.grantSpellLevel).toBe(2)
    expect(d.blockedBy).toBeUndefined()
  })

  it("holds the new level back when the observance has lapsed, and says it comes back", () => {
    const d = grantDecision({ ...base, observance: "lapsed" })
    expect(d.grantSpellLevel).toBeNull()
    expect(d.blockedBy).toBe("observance")
    expect(d.reasons.join(" ")).toContain("resumes")
  })

  it("still grants while merely due, but says the clock is running", () => {
    const d = grantDecision({ ...base, observance: "due" })
    expect(d.grantSpellLevel).toBe(2)
    expect(d.reasons.join(" ")).toContain("clock is running")
  })

  it("holds everything new back from the forsworn", () => {
    expect(grantDecision({ ...base, standing: FORSWORN }).blockedBy).toBe("standing")
  })

  it("never gates the first spell level — you arrive ordained", () => {
    const d = grantDecision({ ...base, owedSpellLevel: 1, grantedSpellLevel: 0, observance: "lapsed", standing: FORSWORN })
    expect(d.grantSpellLevel).toBe(1)
  })

  it("grants nothing when the class table owes nothing yet", () => {
    const d = grantDecision({ ...base, owedSpellLevel: 1, grantedSpellLevel: 1 })
    expect(d.grantSpellLevel).toBeNull()
    expect(d.blockedBy).toBe("nothing_owed")
  })

  it("applies to warlocks on the same terms (Sam: progression is similar)", () => {
    expect(grantDecision({ ...base, characterClass: "warlock" }).grantSpellLevel).toBe(2)
    expect(grantDecision({ ...base, characterClass: "warlock", observance: "lapsed" }).blockedBy).toBe("observance")
  })
})

describe("missions", () => {
  const mission = (over: Partial<Mission> = {}): Mission => ({
    id: "m1",
    deitySlug: "lathander",
    text: "Carry fire to the deepest dark and let it be seen",
    state: "accepted",
    unlocks: { spellLevel: 4 },
    ...over,
  })

  it("RAIL 4: never gates a spell level the class table already owes", () => {
    // The critical rail. A mission makes you REACH; it never makes you wait
    // for progression you earned by levelling.
    expect(missionGate(2, 2, []).blocked).toBe(false)
    expect(missionGate(1, 3, []).blocked).toBe(false)
  })

  it("gates a level that runs ahead of the class table", () => {
    const g = missionGate(4, 3, [mission()])
    expect(g.blocked).toBe(true)
    expect(g.mission?.id).toBe("m1")
  })

  it("opens it once the mission is done", () => {
    expect(missionGate(4, 3, [mission({ state: "complete" })]).blocked).toBe(false)
  })

  it("blocks an early level with no mission offering it at all", () => {
    const g = missionGate(4, 3, [])
    expect(g.blocked).toBe(true)
    expect(g.mission).toBeUndefined()
    expect(g.reason).toContain("no mission")
  })

  it("gates a domain behind its mission, and a domain with no mission stays shut", () => {
    expect(domainGate("Light", [mission({ unlocks: { domain: "Light" } })]).blocked).toBe(true)
    expect(domainGate("Light", [mission({ unlocks: { domain: "Light" }, state: "complete" })]).blocked).toBe(false)
    expect(domainGate("Light", []).blocked).toBe(true)
  })

  it("routes a mission block through the grant decision", () => {
    const d = grantDecision({
      characterClass: "cleric",
      owedSpellLevel: 3,
      grantedSpellLevel: 3,
      standing: BLANK,
      observance: "current",
      missions: [mission()],
    })
    // Nothing owed beats the mission — the class table is satisfied.
    expect(d.blockedBy).toBe("nothing_owed")
  })
})

describe("the god chooses the spells, not the player", () => {
  const spells: SpellLike[] = [
    { name: "Guiding Bolt", level: 1, school: "evocation", tags: ["radiant"] },
    { name: "Cure Wounds", level: 1, school: "abjuration", tags: ["healing"] },
    { name: "Inflict Wounds", level: 1, school: "necromancy", tags: ["necrotic"] },
    { name: "Bane", level: 1, school: "enchantment", tags: ["debuff"] },
  ]

  it("scores a spell by how much it looks like the god", () => {
    expect(affinityScore(spells[0], LATHANDER)).toBeGreaterThan(0)
    expect(affinityScore(spells[3], LATHANDER)).toBe(0)
  })

  it("has no opinion when the god has no portfolio", () => {
    expect(affinityScore(spells[0], { slug: "x", name: "X" })).toBe(0)
    expect(affinityScore(spells[0], null)).toBe(0)
  })

  it("gives a Lathanderite light and healing before necrotic", () => {
    const picked = selectGrantedSpells(spells, LATHANDER, 2, seq(0.1, 0.2, 0.3, 0.4))
    const names = picked.map((s) => s.name)
    expect(names).toContain("Guiding Bolt")
    expect(names).toContain("Cure Wounds")
    expect(names).not.toContain("Inflict Wounds")
  })

  it("is deterministic for a given rng, so a reroll is a decision not a slip", () => {
    const a = selectGrantedSpells(spells, LATHANDER, 3, seq(0.5, 0.1, 0.9, 0.2))
    const b = selectGrantedSpells(spells, LATHANDER, 3, seq(0.5, 0.1, 0.9, 0.2))
    expect(a.map((s) => s.name)).toEqual(b.map((s) => s.name))
  })

  it("handles an empty list and a zero count without throwing", () => {
    expect(selectGrantedSpells([], LATHANDER, 3, seq(0.5))).toEqual([])
    expect(selectGrantedSpells(spells, LATHANDER, 0, seq(0.5))).toEqual([])
  })
})

describe("the warlock commune — the inversion", () => {
  const commune = (over: Partial<Parameters<typeof communeOutcome>[0]> = {}) =>
    communeOutcome({ roll: 50, responseNumber: 5, observance: "current", standing: BLANK, ...over })

  it("never answers with silence — a patron always answers", () => {
    expect(patronAlwaysAnswers()).toBe(true)
    for (let roll = 1; roll <= 100; roll += 1) {
      for (const observance of ["current", "due", "lapsed"] as const) {
        const out = commune({ roll, observance })
        expect(["boon", "indifference", "displeasure", "curse"]).toContain(out.outcome)
      }
    }
  })

  it("pays a boon for a good roll under the response number", () => {
    expect(commune({ roll: 1 }).outcome).toBe("boon")
  })

  it("is indifferent through the middle", () => {
    expect(commune({ roll: COMMUNE_INDIFFERENCE_CEILING }).outcome).toBe("indifference")
  })

  it("turns displeased on a bad roll", () => {
    expect(commune({ roll: COMMUNE_INDIFFERENCE_CEILING + 1 }).outcome).toBe("displeasure")
  })

  it("MISSING THE CHECK-IN GETS YOU NOTICED, NOT IGNORED", () => {
    // The whole point of the inversion: a lapsed cleric hears nothing; a
    // lapsed warlock hears from someone.
    const kept = commune({ roll: 50, observance: "current" })
    const missed = commune({ roll: 50, observance: "lapsed" })
    expect(kept.outcome).toBe("indifference")
    expect(missed.outcome).toBe("displeasure")
    expect(missed.worsenedBy).toBe(1)
    expect(missed.reasons.join(" ")).toContain("noticed")
  })

  it("curses a forsworn warlock who also missed the check-in", () => {
    const out = commune({ roll: 99, observance: "lapsed", standing: FORSWORN })
    expect(out.outcome).toBe("curse")
    expect(out.worsenedBy).toBe(2)
  })

  it("cannot get worse than a curse", () => {
    const out = commune({ roll: 100, observance: "lapsed", standing: FORSWORN })
    expect(out.outcome).toBe("curse")
  })

  it("still pays a boon to a devout warlock even though the patron is grim", () => {
    expect(commune({ roll: 1, observance: "current", standing: { attention: 80, accord: 60, debt: 0 } }).outcome).toBe("boon")
  })
})

describe("what the class table owes — both real slot shapes", () => {
  // Verified against class_spellcasting_progression on 2026-10-01,
  // source "SRD 5.2.1 (2025)" (cleric p.36, warlock p.71).

  it("reads a cleric's highest slot level from the level map", () => {
    expect(owedSpellLevelFromSlots({ "1": 2 })).toBe(1)
    expect(owedSpellLevelFromSlots({ "1": 4, "2": 2 })).toBe(2)
    expect(owedSpellLevelFromSlots({ "1": 4, "2": 3, "3": 2 })).toBe(3)
  })

  it("reads a warlock's pact level instead of the key, which is the trap", () => {
    // max(keys) on a pact object would read "count" and "level" as keys and
    // return garbage. The warlock's slots are ALL at one level.
    expect(owedSpellLevelFromSlots({ pact: true, count: 1, level: 1 })).toBe(1)
    expect(owedSpellLevelFromSlots({ pact: true, count: 2, level: 2 })).toBe(2)
    expect(owedSpellLevelFromSlots({ pact: true, count: 2, level: 3 })).toBe(3)
  })

  it("ignores a level whose slot count is zero", () => {
    expect(owedSpellLevelFromSlots({ "1": 4, "2": 0 })).toBe(1)
  })

  it("returns 0 for junk rather than NaN", () => {
    for (const junk of [null, undefined, 0, "", "slots", [], {}]) {
      expect(owedSpellLevelFromSlots(junk)).toBe(0)
    }
  })

  it("drives the grant off the real cleric rows", () => {
    // Samson at level 3 is owed level 2 spells; if he has only been granted
    // level 1 and has kept the observance, the god gives him the next step.
    const owed = owedSpellLevelFromSlots({ "1": 4, "2": 2 })
    const d = grantDecision({
      characterClass: "cleric",
      owedSpellLevel: owed,
      grantedSpellLevel: 1,
      standing: BLANK,
      observance: "current",
    })
    expect(d.grantSpellLevel).toBe(2)
  })
})
