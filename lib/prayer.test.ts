import { describe, expect, it } from "vitest"
import type { Rng } from "./game-context"
import {
  CAP_LAITY,
  CAP_STRANGER,
  DEBT_ROT_FLOOR,
  REACH_RULES,
  TIER_ANSWER,
  TIER_HAND,
  TIER_SIGN,
  TIER_SILENCE,
  TIER_WITNESS,
  WRONG_LISTENER_BAND,
  WRONG_LISTENER_BAND_HATED,
  WRONG_LISTENER_BAND_UNADDRESSED,
  accordTerm,
  attentionTerm,
  capFor,
  debtDecay,
  debtForTier,
  debtTerm,
  extremityTerm,
  offeringTerm,
  reachTerm,
  resolvePrayer,
  responseNumber,
  standingWord,
  tierFor,
  vowTerm,
  wrongListenerRisk,
  type Deity,
  type Offering,
  type PrayerInput,
  type Standing,
} from "./prayer"

// ---------------------------------------------------------------------------
// Scripted dice. (R - 0.5)/N lands dead centre of the face, so the floor can
// never be nudged off by a float that does not divide cleanly.
// ---------------------------------------------------------------------------

function rngOf(...faces: Array<{ sides: number; roll: number }>): Rng {
  const values = faces.map((f) => (f.roll - 0.5) / f.sides)
  let i = 0
  return () => {
    const v = values[Math.min(i, values.length - 1)]
    i += 1
    return v
  }
}

const d100 = (roll: number) => ({ sides: 100, roll })
const d20f = (roll: number) => ({ sides: 20, roll })

// ---------------------------------------------------------------------------
// Canon fixtures. Lathander's enmity with Lolth is sourced (OotA Expanded
// p.359), not invented, and it is what puts Samson on the wide band.
// ---------------------------------------------------------------------------

const LATHANDER: Deity = { slug: "lathander", name: "Lathander", reach: "dawn_hour" }
const LOLTH: Deity = { slug: "lolth", name: "Lolth", enemies: ["lathander", "eilistraee", "vhaeraun"] }
const MORADIN: Deity = { slug: "moradin", name: "Moradin" }

const NOTHING: Offering = { kind: "none", verified: true }
const COSTLY: Offering = { kind: "costly", verified: true }
const IRREPLACEABLE: Offering = { kind: "irreplaceable", verified: true }

const BLANK: Standing = { attention: 0, accord: 0, debt: 0 }

function prayer(over: Partial<PrayerInput> = {}): PrayerInput {
  return {
    petitioner: { clericLevel: 1, isClericOfDeity: true },
    deity: LATHANDER,
    standing: BLANK,
    offering: NOTHING,
    posture: "silent",
    context: {},
    ...over,
  }
}

// ---------------------------------------------------------------------------

describe("the terms", () => {
  it("bands attention", () => {
    expect([0, 19, 20, 49, 50, 79, 80, 100].map(attentionTerm)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
  })

  it("bands accord, including the negative side", () => {
    expect([100, 60, 59, 25, 24, 0, -1, -49, -50, -100].map(accordTerm)).toEqual([
      4, 4, 2, 2, 0, 0, -1, -1, -3, -3,
    ])
  })

  it("scores a paid offering and refuses a promised one", () => {
    expect(offeringTerm(NOTHING)).toBe(0)
    expect(offeringTerm(COSTLY)).toBe(1)
    expect(offeringTerm(IRREPLACEABLE)).toBe(3)
    expect(offeringTerm({ kind: "irreplaceable", verified: false })).toBe(0)
    expect(offeringTerm({ kind: "costly", verified: false })).toBe(0)
  })

  it("says so when an offering was not verified", () => {
    const { flags } = responseNumber(prayer({ offering: { kind: "costly", verified: false } }))
    expect(flags.some((f) => f.includes("not verified"))).toBe(true)
  })

  it("bands extremity, and treats an unknown gravity as comfort", () => {
    expect([100, 70, 69, 40, 39, 0].map(extremityTerm)).toEqual([3, 3, 1, 1, 0, 0])
    expect(extremityTerm(undefined)).toBe(0)
  })

  it("weighs vows, worst state first", () => {
    expect(vowTerm(undefined)).toBe(0)
    expect(vowTerm([])).toBe(0)
    expect(vowTerm([{ text: "x", state: "kept" }])).toBe(0)
    expect(vowTerm([{ text: "x", state: "open" }])).toBe(2)
    expect(vowTerm([{ text: "x", state: "open" }, { text: "y", state: "broken" }])).toBe(-5)
  })

  it("treats debt symmetrically so a god who owes you is worth what owing costs", () => {
    expect(debtTerm(0)).toBe(0)
    expect(debtTerm(25)).toBe(1)
    expect(debtTerm(99)).toBe(3)
    expect(debtTerm(-25)).toBe(-1)
    expect(debtTerm(-30)).toBe(-1)
    expect(debtTerm(30)).toBe(1)
  })
})

describe("reach — Lathander underground (Sam, 2026-10-01)", () => {
  const rule = REACH_RULES.dawn_hour

  it("shortens his reach where there is no sky", () => {
    expect(reachTerm(LATHANDER, { sunless: true })).toBe(-1)
  })

  it("reaches furthest at the true dawn hour, which nobody down there can see", () => {
    expect(reachTerm(LATHANDER, { sunless: true, minutesOfDay: rule.window.startMinute })).toBe(2)
    expect(reachTerm(LATHANDER, { sunless: true, minutesOfDay: 390 })).toBe(2)
    expect(reachTerm(LATHANDER, { sunless: true, minutesOfDay: rule.window.endMinute })).toBe(2)
  })

  it("does not stack the bonus with the penalty — the window replaces it", () => {
    const inWindow = reachTerm(LATHANDER, { sunless: true, minutesOfDay: 400 })
    expect(inWindow).toBe(rule.windowBonus)
    expect(inWindow).not.toBe(rule.windowBonus + rule.sunlessPenalty)
  })

  it("is silent one minute either side of the window", () => {
    expect(reachTerm(LATHANDER, { sunless: true, minutesOfDay: rule.window.startMinute - 1 })).toBe(-1)
    expect(reachTerm(LATHANDER, { sunless: true, minutesOfDay: rule.window.endMinute + 1 })).toBe(-1)
  })

  it("costs nothing under an open sky at the wrong hour", () => {
    expect(reachTerm(LATHANDER, { sunless: false, minutesOfDay: 900 })).toBe(0)
  })

  it("leaves a god with no reach rule alone wherever he is", () => {
    expect(reachTerm(MORADIN, { sunless: true, minutesOfDay: 900 })).toBe(0)
    expect(reachTerm(null, { sunless: true })).toBe(0)
  })

  it("names itself at runtime as approved homebrew whenever it bites", () => {
    const { flags } = responseNumber(prayer({ context: { sunless: true } }))
    const reach = flags.find((f) => f.includes("reach rule"))
    expect(reach).toBeDefined()
    expect(reach).toContain("approved Sam 2026-10-01")
    // The rule is ruled, so nothing in this module may still claim otherwise.
    expect(flags.some((f) => f.includes("NEEDS SAM"))).toBe(false)
  })
})

describe("the cap is the rail", () => {
  it("pins a cleric of this god to their cleric level", () => {
    expect(capFor({ clericLevel: 1, isClericOfDeity: true }, LATHANDER, BLANK)).toBe(1)
    expect(capFor({ clericLevel: 10, isClericOfDeity: true }, LATHANDER, BLANK)).toBe(10)
  })

  it("tops everyone else out at 5, and a total stranger at 2", () => {
    expect(capFor({ clericLevel: 0, isClericOfDeity: false }, LATHANDER, { ...BLANK, attention: 30 })).toBe(CAP_LAITY)
    expect(capFor({ clericLevel: 0, isClericOfDeity: false }, LATHANDER, BLANK)).toBe(CAP_STRANGER)
  })

  it("caps a prayer addressed to nobody in particular at 2", () => {
    expect(capFor({ clericLevel: 20, isClericOfDeity: true }, null, BLANK)).toBe(CAP_STRANGER)
  })

  it("clamps the response number into [0, cap] and never below zero", () => {
    const wretched = responseNumber(
      prayer({
        standing: { attention: 0, accord: -100, debt: 100, vows: [{ text: "x", state: "broken" }] },
        petitioner: { clericLevel: 5, isClericOfDeity: true },
      }),
    )
    expect(wretched.terms.raw).toBeLessThan(0)
    expect(wretched.rn).toBe(0)

    const saintly = responseNumber(
      prayer({
        standing: { attention: 100, accord: 100, debt: -100, vows: [{ text: "x", state: "open" }] },
        offering: IRREPLACEABLE,
        context: { gravity: 100, sunless: true, minutesOfDay: 390 },
        petitioner: { clericLevel: 3, isClericOfDeity: true },
      }),
    )
    expect(saintly.terms.raw).toBeGreaterThan(3)
    expect(saintly.rn).toBe(3)
  })
})

describe("RAIL 1 — prayer can never out-perform Divine Intervention", () => {
  // SRD 5.1: Divine Intervention is d100 <= cleric level at 10th. Prayer is
  // capped at the same number, so its success chance is <= the class feature's
  // at every level. Where they TIE (level 10 with a perfect ledger) the outputs
  // still differ: Divine Intervention can produce a cleric spell, and prayer
  // structurally cannot — see the tier-4 test below.
  it("keeps RN at or under the cleric level for every level, with everything maxed", () => {
    for (let level = 1; level <= 20; level += 1) {
      const { rn } = responseNumber(
        prayer({
          petitioner: { clericLevel: level, isClericOfDeity: true },
          standing: { attention: 100, accord: 100, debt: -100, vows: [{ text: "x", state: "open" }] },
          offering: IRREPLACEABLE,
          context: { gravity: 100, sunless: true, minutesOfDay: 390 },
        }),
      )
      expect(rn).toBeLessThanOrEqual(level)
    }
  })

  it("never returns tier 4 — an answer IS the class feature, not this module", () => {
    const seen = new Set<number>()
    for (let level = 1; level <= 20; level += 1) {
      for (let roll = 1; roll <= 100; roll += 1) {
        const out = resolvePrayer(
          prayer({
            petitioner: { clericLevel: level, isClericOfDeity: true },
            standing: { attention: 100, accord: 100, debt: -100, vows: [{ text: "x", state: "open" }] },
            offering: IRREPLACEABLE,
            context: { gravity: 100, sunless: true, minutesOfDay: 390 },
          }),
          rngOf(d100(roll)),
        )
        seen.add(out.tier)
      }
    }
    expect(seen.has(TIER_ANSWER)).toBe(false)
    expect([...seen].every((t) => t <= TIER_HAND)).toBe(true)
  })

  it("tells the route that a cleric 10+ owns the feature itself", () => {
    const out = resolvePrayer(
      prayer({ petitioner: { clericLevel: 10, isClericOfDeity: true } }),
      rngOf(d100(50)),
    )
    expect(out.divineInterventionAvailable).toBe(true)
    expect(out.flags.some((f) => f.includes("Divine Intervention"))).toBe(true)

    const novice = resolvePrayer(prayer(), rngOf(d100(50)))
    expect(novice.divineInterventionAvailable).toBe(false)
  })
})

describe("tier by margin", () => {
  it("is silence above RN, and silence always when RN is zero", () => {
    expect(tierFor(10, 9, 0)).toBe(TIER_SILENCE)
    expect(tierFor(1, 0, 3)).toBe(TIER_SILENCE)
  })

  it("walks sign -> witness -> hand as the roll goes deeper under RN", () => {
    // RN 9: hand at <=3, witness at <=6, sign at <=9.
    expect(tierFor(9, 9, 1)).toBe(TIER_SIGN)
    expect(tierFor(7, 9, 1)).toBe(TIER_SIGN)
    expect(tierFor(6, 9, 1)).toBe(TIER_WITNESS)
    expect(tierFor(4, 9, 1)).toBe(TIER_WITNESS)
    expect(tierFor(3, 9, 1)).toBe(TIER_HAND)
    expect(tierFor(1, 9, 1)).toBe(TIER_HAND)
  })

  it("refuses a hand to anyone who paid nothing, however deep the roll", () => {
    expect(tierFor(1, 9, 0)).toBe(TIER_WITNESS)
  })

  it("holds a forsworn petitioner to a sign no matter how well they roll", () => {
    expect(tierFor(1, 9, 3, { vowBroken: true })).toBe(TIER_SIGN)
    expect(tierFor(99, 9, 3, { vowBroken: true })).toBe(TIER_SILENCE)
  })

  it("costs debt for what the god actually spent, and nothing for a sign", () => {
    expect(debtForTier(TIER_SILENCE)).toBe(0)
    expect(debtForTier(TIER_SIGN)).toBe(0)
    expect(debtForTier(TIER_WITNESS)).toBe(10)
    expect(debtForTier(TIER_HAND)).toBe(25)
  })
})

describe("unpaid debt rots", () => {
  it("does nothing below the floor", () => {
    expect(debtDecay(DEBT_ROT_FLOOR - 1, 10)).toBe(0)
  })

  it("bleeds accord by the week at or above it", () => {
    expect(debtDecay(DEBT_ROT_FLOOR, 1)).toBe(-1)
    expect(debtDecay(80, 4)).toBe(-4)
    expect(debtDecay(80, 0)).toBe(0)
  })
})

describe("the wrong listener", () => {
  const velkynvelve = { locationFaith: LOLTH, sunless: true, confined: true }

  it("never rolls where nothing hostile is listening", () => {
    expect(wrongListenerRisk("aloud", LATHANDER, { sunless: true })).toBe(0)
  })

  it("never rolls for a silent prayer, even in the pen", () => {
    expect(wrongListenerRisk("silent", LATHANDER, velkynvelve)).toBe(0)
  })

  it("carries a murmur only where the walls are close", () => {
    expect(wrongListenerRisk("murmured", MORADIN, velkynvelve)).toBe(WRONG_LISTENER_BAND)
    expect(wrongListenerRisk("murmured", MORADIN, { locationFaith: LOLTH })).toBe(0)
  })

  it("widens the band for a god the local power hates — Lathander in Lolth's house", () => {
    expect(wrongListenerRisk("aloud", MORADIN, velkynvelve)).toBe(WRONG_LISTENER_BAND)
    expect(wrongListenerRisk("aloud", LATHANDER, velkynvelve)).toBe(WRONG_LISTENER_BAND_HATED)
  })

  it("punishes addressing nobody in particular", () => {
    expect(wrongListenerRisk("aloud", null, velkynvelve)).toBe(WRONG_LISTENER_BAND_UNADDRESSED)
  })

  it("rolls even when the prayer was answered — a heard prayer can still cost you", () => {
    const out = resolvePrayer(
      prayer({
        posture: "aloud",
        context: { ...velkynvelve, gravity: 100, minutesOfDay: 390 },
        standing: { attention: 100, accord: 100, debt: 0 },
        offering: IRREPLACEABLE,
      }),
      rngOf(d100(1), d20f(1)),
    )
    expect(out.tier).toBeGreaterThan(TIER_SILENCE)
    expect(out.overheard).toBe(true)
  })

  it("does not roll a d20 at all when nobody is listening", () => {
    const out = resolvePrayer(prayer({ posture: "aloud" }), rngOf(d100(50)))
    expect(out.wrongListenerBand).toBe(0)
    expect(out.wrongListenerRoll).toBeNull()
    expect(out.overheard).toBe(false)
  })
})

describe("the word on the sheet", () => {
  it("puts a broken vow above everything else", () => {
    expect(standingWord({ attention: 100, accord: 100, debt: 0, vows: [{ text: "x", state: "broken" }] })).toBe(
      "forsworn",
    )
  })

  it("reads lapsed, indebted, favoured, noticed, unknown in that order", () => {
    expect(standingWord({ attention: 100, accord: -50, debt: 0 })).toBe("lapsed")
    expect(standingWord({ attention: 100, accord: 100, debt: DEBT_ROT_FLOOR })).toBe("indebted")
    expect(standingWord({ attention: 20, accord: 25, debt: 0 })).toBe("favoured")
    expect(standingWord({ attention: 20, accord: 0, debt: 0 })).toBe("noticed")
    expect(standingWord({ attention: 19, accord: 0, debt: 0 })).toBe("unknown")
  })
})

describe("Samson, level 1, in the pen", () => {
  // The scene the module exists for: a level 1 cleric of Lathander, a god of
  // the dawn, imprisoned underground by priestesses of a goddess who hates him.
  const inThePen = (over: Partial<PrayerInput> = {}) =>
    prayer({
      petitioner: { clericLevel: 1, isClericOfDeity: true },
      deity: LATHANDER,
      context: { locationFaith: LOLTH, sunless: true, confined: true, gravity: 85 },
      ...over,
    })

  it("mostly gets nothing, and nothing is the honest answer", () => {
    const out = resolvePrayer(inThePen({ posture: "silent" }), rngOf(d100(50)))
    expect(out.responseNumber).toBe(1)
    expect(out.tier).toBe(TIER_SILENCE)
    expect(out.tierName).toBe("silence")
  })

  it("is heard on a 1, because his need is real even though he is a stranger", () => {
    const out = resolvePrayer(inThePen({ posture: "silent" }), rngOf(d100(1)))
    expect(out.tier).toBe(TIER_SIGN)
    expect(out.debtDelta).toBe(0)
  })

  it("sits on the wide band the moment he says it out loud", () => {
    const out = resolvePrayer(inThePen({ posture: "aloud" }), rngOf(d100(50), d20f(4)))
    expect(out.wrongListenerBand).toBe(WRONG_LISTENER_BAND_HATED)
    expect(out.overheard).toBe(true)
  })

  it("cannot buy his way past the cap with an offering alone", () => {
    const out = resolvePrayer(inThePen({ offering: IRREPLACEABLE, posture: "silent" }), rngOf(d100(1)))
    expect(out.terms.raw).toBeGreaterThan(1)
    expect(out.responseNumber).toBe(1)
    // RN 1: floor(1/3) is 0, so a hand is unreachable at level 1 by construction.
    expect(out.tier).toBe(TIER_SIGN)
  })
})
