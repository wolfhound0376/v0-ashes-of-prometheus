import { describe, expect, it } from "vitest"
import type { Rng } from "./game-context"
import { CAMP_ACTION_RULES } from "./camp"
import {
  PRAYER_FORBIDDEN,
  faithPatchAfter,
  narrationContract,
  prayAtCamp,
  type CampPrayerInput,
  type FaithRow,
} from "./camp-prayer"
import { OBSERVANCE_CADENCE_DAYS, OBSERVANCE_GRACE_DAYS } from "./devotion"
import { resolvePrayer, type Deity, type Offering, type Standing } from "./prayer"

const rngOf = (...faces: Array<{ sides: number; roll: number }>): Rng => {
  const v = faces.map((f) => (f.roll - 0.5) / f.sides)
  let i = 0
  return () => v[Math.min(i++, v.length - 1)]
}
const d100 = (roll: number) => ({ sides: 100, roll })
const d20f = (roll: number) => ({ sides: 20, roll })

const LATHANDER: Deity = {
  slug: "lathander", name: "Lathander", reach: "dawn_hour",
  portfolio: ["dawn", "light", "renewal", "healing", "radiant"],
}
const LOLTH: Deity = { slug: "lolth", name: "Lolth", enemies: ["lathander"] }

const NOTHING: Offering = { kind: "none", verified: true }
const COSTLY: Offering = { kind: "costly", verified: true }

const FAITH = (over: Partial<FaithRow> = {}): FaithRow => ({
  deity_slug: "lathander", attention: 0, accord: 0, debt: 0, last_prayer_day: null, ...over,
})

function input(over: Partial<CampPrayerInput> = {}): CampPrayerInput {
  return {
    character: { id: "c1", name: "Samson", class: "Cleric", level: 1 },
    faith: FAITH(),
    deity: LATHANDER,
    petition: "Let the light find us down here.",
    posture: "silent",
    offering: NOTHING,
    context: { sunless: true, gravity: 85 },
    gameDay: 10,
    actionsRemaining: 2,
    ...over,
  }
}

/** A real PrayerInput, for the places a test calls resolvePrayer directly. */
function pInput(over: Partial<Parameters<typeof resolvePrayer>[0]> = {}): Parameters<typeof resolvePrayer>[0] {
  return {
    petitioner: { clericLevel: 1, isClericOfDeity: true },
    deity: LATHANDER,
    standing: { attention: 0, accord: 0, debt: 0 },
    offering: NOTHING,
    posture: "silent",
    context: { sunless: true, gravity: 85 },
    ...over,
  }
}

describe("the PRAY button is no longer a blank page", () => {
  it("no longer routes to dmScene", () => {
    // The whole reason this file exists. Before 2026-10-01 this read
    // "dmScene() — no rule; the DM answers or does not".
    expect(CAMP_ACTION_RULES.pray.resolves).not.toContain("dmScene")
    expect(CAMP_ACTION_RULES.pray.resolves).toContain("prayAtCamp")
  })

  it("still costs exactly one camp action", () => {
    const d = prayAtCamp(input({ actionsRemaining: 2 }), rngOf(d100(50)))
    expect(d.spend).toBe(true)
    expect(d.remaining).toBe(1)
  })

  it("spends the action even when the god says nothing", () => {
    // Silence IS the answer. Refunding it would teach players to press again
    // until something happened, which is the vending machine this design is
    // built to avoid.
    const d = prayAtCamp(input(), rngOf(d100(100)))
    expect(d.result?.tier).toBe(0)
    expect(d.spend).toBe(true)
    expect(d.remaining).toBe(1)
  })

  it("spends nothing when there is no action left, and does not roll", () => {
    const d = prayAtCamp(input({ actionsRemaining: 0 }), rngOf(d100(1)))
    expect(d.ok).toBe(false)
    expect(d.spend).toBe(false)
    expect(d.remaining).toBe(0)
    expect(d.result).toBeNull()
  })

  it("refuses a prayer with no words in it", () => {
    expect(prayAtCamp(input({ petition: "   " }), rngOf(d100(1))).ok).toBe(false)
  })
})

describe("the narration contract — what Malachar may not do", () => {
  it("forbids a spell, healing, damage and bonuses at EVERY tier", () => {
    for (let roll = 1; roll <= 100; roll += 1) {
      const d = prayAtCamp(
        input({
          character: { id: "c1", name: "Samson", class: "Cleric", level: 20 },
          offering: COSTLY, faith: FAITH({ attention: 100, accord: 100 }),
        }),
        rngOf(d100(roll)),
      )
      expect(d.narration.forbidden).toEqual([...PRAYER_FORBIDDEN])
    }
  })

  it("names the forbidden things explicitly, so the prompt cannot soften them", () => {
    const f = PRAYER_FORBIDDEN.join(" ").toLowerCase()
    for (const word of ["spell", "hit points", "damage", "ac", "saving throw", "item", "slot"]) {
      expect(f).toContain(word)
    }
  })

  it("grants Inspiration at tier 2 and at no other tier", () => {
    for (const tier of [0, 1, 2, 3, 4] as const) {
      const c = narrationContract(
        { ...resolvePrayer(pInput(), rngOf(d100(50))), tier, tierName: "x" },
        "private",
      )
      expect(c.grantsInspiration).toBe(tier === 2)
    }
  })

  it("lets a hand save a death save, and says it is not healing", () => {
    const c = narrationContract({ ...resolvePrayer(pInput(), rngOf(d100(50))), tier: 3, tierName: "a hand" }, "private")
    const text = c.permitted.join(" ").toLowerCase()
    expect(text).toContain("death save")
    expect(text).toContain("never by healing")
  })

  it("treats silence as something to write, not an error", () => {
    const c = narrationContract({ ...resolvePrayer(pInput(), rngOf(d100(50))), tier: 0, tierName: "silence" }, "private")
    expect(c.permitted.join(" ")).toContain("it is the scene, not an error")
  })
})

describe("privacy (Sam, 2026-10-01)", () => {
  it("keeps a silent or murmured prayer private, and only an aloud one public", () => {
    expect(prayAtCamp(input({ posture: "silent" }), rngOf(d100(50))).visibility).toBe("private")
    expect(prayAtCamp(input({ posture: "murmured" }), rngOf(d100(50))).visibility).toBe("private")
    expect(prayAtCamp(input({ posture: "aloud" }), rngOf(d100(50))).visibility).toBe("party")
  })

  it("carries the audience into the contract Malachar reads", () => {
    expect(prayAtCamp(input({ posture: "silent" }), rngOf(d100(50))).narration.audience).toBe("private")
  })

  it("forbids revealing an unspoken prayer at all", () => {
    expect(PRAYER_FORBIDDEN.join(" ")).toContain("unless it was spoken aloud")
  })
})

describe("Samson at the fire in Velkynvelve", () => {
  const pen = (over: Partial<CampPrayerInput> = {}) =>
    input({ context: { sunless: true, gravity: 85, locationFaith: LOLTH, confined: true }, ...over })

  it("is a stranger to his own god until he starts praying", () => {
    const d = prayAtCamp(pen(), rngOf(d100(50)))
    expect(d.standing).toBe("unknown")
    expect(d.observance).toBe("due")   // never prayed: due, not lapsed
  })

  it("is heard by the wrong people when he says it out loud to Lolth's enemy", () => {
    const d = prayAtCamp(pen({ posture: "aloud" }), rngOf(d100(50), d20f(3)))
    expect(d.result?.wrongListenerBand).toBe(4)
    expect(d.result?.overheard).toBe(true)
    expect(d.narration.overheardBy).not.toBeNull()
  })

  it("is not overheard when he keeps it behind his teeth", () => {
    const d = prayAtCamp(pen({ posture: "silent" }), rngOf(d100(50)))
    expect(d.result?.wrongListenerBand).toBe(0)
    expect(d.narration.overheardBy).toBeNull()
  })

  it("counts as a cleric of Lathander only when the faith row agrees", () => {
    const own = prayAtCamp(pen(), rngOf(d100(50)))
    expect(own.result?.terms.cap).toBe(1)              // his own cleric level
    const other = prayAtCamp(pen({ faith: FAITH({ deity_slug: "moradin" }) }), rngOf(d100(50)))
    expect(other.result?.terms.cap).toBe(2)            // a god he has no standing with
  })

  it("works for a character with no faith row at all", () => {
    // "unknown" rather than null: a god who has never heard of you still has
    // a word for it, and the UI should not need two spellings of "nothing yet".
    const d = prayAtCamp(pen({ faith: null }), rngOf(d100(50)))
    expect(d.ok).toBe(true)
    expect(d.standing).toBe("unknown")
    expect(d.observance).toBe("due")
  })

  it("reports the same standing word whether the prayer was offered or refused", () => {
    const offered = prayAtCamp(pen({ faith: null }), rngOf(d100(50)))
    const refused = prayAtCamp(pen({ faith: null, actionsRemaining: 0 }), rngOf(d100(50)))
    expect(refused.standing).toBe(offered.standing)
  })
})

describe("what the route writes back", () => {
  const base: Standing = { attention: 0, accord: 0, debt: 0 }

  it("notices being addressed at all", () => {
    const r = resolvePrayer(pInput(), rngOf(d100(100)))   // silence
    const p = faithPatchAfter(base, r, 10)
    expect(p.attention).toBeGreaterThan(0)
    expect(p.last_prayer_day).toBe(10)
  })

  it("notices harder when the prayer cost something or the moment was grave", () => {
    const plain = faithPatchAfter(base, resolvePrayer(pInput({ context: {} }), rngOf(d100(100))), 10)
    const grave = faithPatchAfter(base, resolvePrayer(pInput({ offering: COSTLY, context: { gravity: 90 } }), rngOf(d100(100))), 10)
    expect(grave.attention).toBeGreaterThan(plain.attention)
  })

  it("adds the answer's Debt and never exceeds the ledger bounds", () => {
    const r = resolvePrayer(
      pInput({ petitioner: { clericLevel: 20, isClericOfDeity: true }, offering: COSTLY,
               standing: { attention: 100, accord: 100, debt: 95 } }),
      rngOf(d100(1)),
    )
    const p = faithPatchAfter({ attention: 100, accord: 100, debt: 95 }, r, 12)
    expect(p.debt).toBeLessThanOrEqual(100)
    expect(p.attention).toBeLessThanOrEqual(100)
  })

  it("moves the observance clock forward so the next prayer is measured from today", () => {
    const r = resolvePrayer(pInput(), rngOf(d100(50)))
    expect(faithPatchAfter(base, r, 42).last_prayer_day).toBe(42)
  })

  it("re-derives the sheet word rather than leaving it stale", () => {
    const r = resolvePrayer(pInput(), rngOf(d100(100)))
    expect(faithPatchAfter({ attention: 60, accord: 60, debt: 0 }, r, 10).state).toBe("favoured")
  })
})

describe("the observance reads off the live clock", () => {
  it("is current just inside the cadence and lapsed past the grace", () => {
    const day = (last: number, today: number) =>
      prayAtCamp(input({ faith: FAITH({ last_prayer_day: last }), gameDay: today }), rngOf(d100(50))).observance
    expect(day(10, 10)).toBe("current")
    expect(day(10, 10 + OBSERVANCE_CADENCE_DAYS)).toBe("due")
    expect(day(10, 10 + OBSERVANCE_CADENCE_DAYS + OBSERVANCE_GRACE_DAYS + 1)).toBe("lapsed")
  })
})
