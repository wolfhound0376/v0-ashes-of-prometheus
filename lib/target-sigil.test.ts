import { describe, expect, it } from "vitest"
import {
  DEFAULT_PLAN, SCHOOL_SIGIL, callsForSave, sigilDuration, sigilPoseAt, sigilStrikeAt,
  targetSigilFor, type SigilPlan,
} from "./target-sigil"

const PLAN: SigilPlan = { art: { ring: "sigilNecroticRing", plume: "sigilNecroticPlume" }, ...DEFAULT_PLAN }
const PEAK = 6 / 12   // the baked sheet's peak frame, as the manifest records it

describe("targetSigilFor", () => {
  it("draws the sigil for a save-based necromancy spell aimed at a creature", () => {
    const plan = targetSigilFor({ resolve: "save", school: "necromancy", damage: "necrotic" })
    expect(plan?.art.ring).toBe("sigilNecroticRing")
    expect(plan?.art.plume).toBe("sigilNecroticPlume")
  })

  it("falls back to the damage type when the school is unknown", () => {
    // A monster's innate drain: no 5e school, but plainly necrotic.
    expect(targetSigilFor({ resolve: "save", school: null, damage: "necrotic" })?.art.ring)
      .toBe("sigilNecroticRing")
  })

  it("draws nothing for an attack-roll spell — there is no hanging moment", () => {
    // Chill Touch and Inflict Wounds are necromancy and necrotic, and both
    // resolve on contact: the answer is known the instant they land.
    expect(targetSigilFor({ resolve: "attack", school: "necromancy", damage: "necrotic" })).toBeNull()
  })

  it("draws nothing for an auto-hit spell", () => {
    expect(targetSigilFor({ resolve: "auto", school: "necromancy", damage: "necrotic" })).toBeNull()
  })

  it("draws nothing for an AREA spell — splash already covers every body in it", () => {
    expect(targetSigilFor({ resolve: "save", school: "necromancy", damage: "necrotic", isArea: true }))
      .toBeNull()
  })

  it("draws nothing for a save spell of a school with no sigil yet", () => {
    // Updated when enchantment landed: this used to name enchantment as the
    // negative case. A school with art registered must draw; only the six
    // still without art stay silent.
    expect(targetSigilFor({ resolve: "save", school: "evocation", damage: "radiant" })).toBeNull()
    expect(targetSigilFor({ resolve: "save", school: "abjuration", damage: null })).toBeNull()
    expect(targetSigilFor({ resolve: "save", school: "illusion", damage: null })).toBeNull()
  })

  it("has a registry keyed by school, so a second sigil is one line and no logic", () => {
    expect(SCHOOL_SIGIL.necromancy?.ring).toBe("sigilNecroticRing")
    expect(SCHOOL_SIGIL.enchantment?.ring).toBe("sigilEnchantmentRing")
  })

  it("draws the enchantment sigil for a save spell that deals NO damage", () => {
    // The case that exposed two wiring bugs at once. Hold Person is not in
    // lib/spellbook.ts at all and has no damage type, so both the old trigger
    // and the old board branch skipped it silently.
    const plan = targetSigilFor({
      resolve: null, school: "enchantment", damage: null, spellName: "Hold Person",
    })
    expect(plan?.art.ring).toBe("sigilEnchantmentRing")
  })

  it("draws it for the rest of the school the spellbook has never heard of", () => {
    for (const name of ["Charm Person", "Command", "Tasha's Hideous Laughter", "Bane"]) {
      expect(targetSigilFor({ school: "enchantment", spellName: name }), name).not.toBeNull()
    }
  })
})

describe("callsForSave", () => {
  it("believes the spellbook when it has an opinion", () => {
    expect(callsForSave({ resolve: "save", spellName: "anything" })).toBe(true)
  })

  it("lets an explicit non-save resolution WIN over the dataset", () => {
    // Chill Touch is an attack roll in the spellbook. The dataset must not
    // promote a hand-checked attack spell into a save.
    expect(callsForSave({ resolve: "attack", spellName: "Chill Touch" })).toBe(false)
    expect(callsForSave({ resolve: "auto", spellName: "Magic Missile" })).toBe(false)
  })

  it("falls back to the 556-spell dataset when the spellbook is silent", () => {
    expect(callsForSave({ spellName: "Hold Person" })).toBe(true)
    expect(callsForSave({ spellName: "Charm Person" })).toBe(true)
    expect(callsForSave({ spellName: "Command" })).toBe(true)
  })

  it("says no for a spell that calls for no save in either source", () => {
    expect(callsForSave({ spellName: "Fire Bolt" })).toBe(false)
    expect(callsForSave({ spellName: "Magic Missile" })).toBe(false)
    expect(callsForSave({ spellName: "Malachar's Little Joke" })).toBe(false)
    expect(callsForSave({})).toBe(false)
  })

  it("does not care about case or stray whitespace", () => {
    expect(callsForSave({ spellName: "  hOlD pErSoN  " })).toBe(true)
  })
})

describe("sigilPoseAt — the three acts", () => {
  it("runs form, then hold, then resolve, then done", () => {
    expect(sigilPoseAt(0.0, PLAN, "taken", PEAK).act).toBe("form")
    expect(sigilPoseAt(0.6, PLAN, "taken", PEAK).act).toBe("hold")
    expect(sigilPoseAt(1.0, PLAN, "taken", PEAK).act).toBe("resolve")
    expect(sigilPoseAt(9.0, PLAN, "taken", PEAK).act).toBe("done")
  })

  it("never returns an opacity outside 0..1, or a non-finite pose", () => {
    for (const outcome of ["taken", "warded"] as const) {
      for (let t = 0; t <= sigilDuration(PLAN) + 0.5; t += 0.01) {
        const p = sigilPoseAt(t, PLAN, outcome, PEAK)
        expect(p.opacity, `${outcome} @${t.toFixed(2)}`).toBeGreaterThanOrEqual(0)
        expect(p.opacity, `${outcome} @${t.toFixed(2)}`).toBeLessThanOrEqual(1)
        for (const v of [p.frame, p.opacity, p.scale, p.spin, p.radiate, p.permeate, p.flame]) {
          expect(Number.isFinite(v)).toBe(true)
        }
      }
    }
  })

  it("never drives the sheet past its own end", () => {
    for (let t = 0; t <= sigilDuration(PLAN) + 1; t += 0.01) {
      const f = sigilPoseAt(t, PLAN, "taken", PEAK).frame
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })

  it("advances the sheet monotonically — the bloom never runs backwards", () => {
    let last = -1
    for (let t = 0; t <= sigilDuration(PLAN); t += 0.01) {
      const f = sigilPoseAt(t, PLAN, "taken", PEAK).frame
      expect(f).toBeGreaterThanOrEqual(last - 1e-9)
      last = f
    }
  })

  it("lands from slightly large, so it reads as dropping onto them", () => {
    expect(sigilPoseAt(0, PLAN, "taken", PEAK).scale).toBeGreaterThan(1.2)
    expect(sigilPoseAt(PLAN.form, PLAN, "taken", PEAK).scale).toBeCloseTo(1, 1)
  })

  it("PARKS the sheet for the whole hold — the art is a one-shot, not a loop", () => {
    // The bug this pins down: driven as a loop, the sigil guttered out and
    // relit under the target while the save was still being rolled.
    const a = sigilPoseAt(PLAN.form + 0.01, PLAN, "taken", PEAK).frame
    const b = sigilPoseAt(PLAN.form + PLAN.hold - 0.01, PLAN, "taken", PEAK).frame
    expect(a).toBeCloseTo(PEAK, 9)
    expect(b).toBeCloseTo(PEAK, 9)
  })

  it("holds at full brightness — the moment is meant to be legible", () => {
    expect(sigilPoseAt(PLAN.form + PLAN.hold / 2, PLAN, "taken", PEAK).opacity).toBe(1)
  })

  it("survives a zero hold, for a replay that already knows the answer", () => {
    const instant: SigilPlan = { ...PLAN, hold: 0 }
    const p = sigilPoseAt(PLAN.form, instant, "taken", PEAK)
    expect(Number.isFinite(p.scale)).toBe(true)
    expect(p.act).toBe("resolve")
  })
})

describe("sigilPoseAt — taken and warded are opposite motions", () => {
  it("CONTRACTS when it takes them and EXPANDS when it is warded off", () => {
    const t = PLAN.form + PLAN.hold + PLAN.resolve * 0.8
    expect(sigilPoseAt(t, PLAN, "taken", PEAK).scale).toBeLessThan(1)
    expect(sigilPoseAt(t, PLAN, "warded", PEAK).scale).toBeGreaterThan(1.4)
  })

  it("turns CLOCKWISE the whole way, both outcomes — Sam's direction", () => {
    // Negative is clockwise seen from above in three.js's right-handed frame.
    // The first draft had the two resolutions turning opposite ways; Sam ruled
    // the ring turns clockwise throughout, so they differ in SPEED instead.
    for (const o of ["taken", "warded"] as const) {
      let last = 0
      for (let t = 0.01; t <= sigilDuration(PLAN); t += 0.01) {
        const spin = sigilPoseAt(t, PLAN, o, PEAK).spin
        expect(spin, `${o} @${t.toFixed(2)}`).toBeLessThanOrEqual(last + 1e-9)
        last = spin
      }
      expect(last).toBeLessThan(-1)   // it really has turned, not just drifted
    }
  })

  it("never jumps the ring's angle — a rate may step, an angle may not", () => {
    for (const o of ["taken", "warded"] as const) {
      let prev = sigilPoseAt(0, PLAN, o, PEAK).spin
      for (let t = 0.005; t <= sigilDuration(PLAN); t += 0.005) {
        const spin = sigilPoseAt(t, PLAN, o, PEAK).spin
        // At the fastest rate (4.2 rad/s) a 5 ms step is ~0.021 rad.
        expect(Math.abs(spin - prev), `${o} jumped @${t.toFixed(3)}`).toBeLessThan(0.05)
        prev = spin
      }
    }
  })

  it("winds UP as it takes them and STALLS as it is warded off", () => {
    const base = PLAN.form + PLAN.hold
    const rate = (o: "taken" | "warded") =>
      Math.abs(sigilPoseAt(base + PLAN.resolve * 0.95, PLAN, o, PEAK).spin
             - sigilPoseAt(base + PLAN.resolve * 0.85, PLAN, o, PEAK).spin)
    expect(rate("taken")).toBeGreaterThan(rate("warded") * 3)
  })

  it("RADIATES outward when warded and drives INWARD when taken", () => {
    const t = PLAN.form + PLAN.hold + PLAN.resolve * 0.9
    expect(sigilPoseAt(t, PLAN, "warded", PEAK).radiate).toBeGreaterThan(2)
    expect(sigilPoseAt(t, PLAN, "taken", PEAK).radiate).toBeLessThan(1)
  })

  it("shows NO FLAME at all on a save — Sam's ruling; the ring still turns", () => {
    for (let t = 0; t <= sigilDuration(PLAN) + 0.3; t += 0.01) {
      const p = sigilPoseAt(t, PLAN, "warded", PEAK)
      expect(p.flame, `flame @${t.toFixed(2)}`).toBe(0)
    }
    // ...and the sigil itself is emphatically still there and still turning.
    const mid = sigilPoseAt(PLAN.form + PLAN.hold / 2, PLAN, "warded", PEAK)
    expect(mid.opacity).toBe(1)
    expect(sigilPoseAt(0.5, PLAN, "warded", PEAK).spin)
      .toBeLessThan(sigilPoseAt(0.2, PLAN, "warded", PEAK).spin)
  })

  it("lights the flame when it takes them", () => {
    expect(sigilPoseAt(PLAN.form + PLAN.hold / 2, PLAN, "taken", PEAK).flame).toBe(1)
    expect(sigilPoseAt(PLAN.form * 0.9, PLAN, "taken", PEAK).flame).toBeGreaterThan(0.5)
  })

  it("keeps flame within 0..1 throughout, both outcomes", () => {
    for (const o of ["taken", "warded"] as const) {
      for (let t = 0; t <= sigilDuration(PLAN) + 0.3; t += 0.01) {
        const f = sigilPoseAt(t, PLAN, o, PEAK).flame
        expect(f).toBeGreaterThanOrEqual(0)
        expect(f).toBeLessThanOrEqual(1)
      }
    }
  })

  it("PERMEATES the body only when it takes them", () => {
    const t = PLAN.form + PLAN.hold + PLAN.resolve * 0.9
    expect(sigilPoseAt(t, PLAN, "taken", PEAK).permeate).toBeGreaterThan(0.9)
    expect(sigilPoseAt(t, PLAN, "warded", PEAK).permeate).toBe(0)
  })

  it("keeps radiate and permeate finite and sane for the whole effect", () => {
    for (const o of ["taken", "warded"] as const) {
      for (let t = 0; t <= sigilDuration(PLAN) + 0.3; t += 0.01) {
        const p = sigilPoseAt(t, PLAN, o, PEAK)
        expect(p.radiate).toBeGreaterThan(0)
        expect(p.radiate).toBeLessThan(4)
        expect(p.permeate).toBeGreaterThanOrEqual(0)
        expect(p.permeate).toBeLessThanOrEqual(1)
      }
    }
  })

  it("FLARES before it fades when it takes them; a ward just thins out", () => {
    const t = PLAN.form + PLAN.hold + PLAN.resolve * 0.15
    expect(sigilPoseAt(t, PLAN, "taken", PEAK).opacity).toBe(1)
    expect(sigilPoseAt(t, PLAN, "warded", PEAK).opacity).toBeLessThan(1)
  })

  it("ends invisible either way", () => {
    for (const o of ["taken", "warded"] as const) {
      expect(sigilPoseAt(sigilDuration(PLAN), PLAN, o, PEAK).opacity).toBeLessThanOrEqual(0.01)
    }
  })
})

describe("the strike frame", () => {
  it("lands when the hold ends, not when the sigil appears", () => {
    expect(sigilStrikeAt(PLAN)).toBeCloseTo(PLAN.form + PLAN.hold, 9)
  })

  it("is not struck before that moment and is struck after it", () => {
    const s = sigilStrikeAt(PLAN)
    expect(sigilPoseAt(s - 0.01, PLAN, "taken", PEAK).struck).toBe(false)
    expect(sigilPoseAt(s + 0.01, PLAN, "taken", PEAK).struck).toBe(true)
  })

  it("agrees with the duration — strike always falls inside the effect", () => {
    expect(sigilStrikeAt(PLAN)).toBeLessThan(sigilDuration(PLAN))
  })
})
