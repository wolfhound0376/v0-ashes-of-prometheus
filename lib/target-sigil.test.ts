import { describe, expect, it } from "vitest"
import {
  BURST_LIFE, DEFAULT_PLAN, SCHOOL_SIGIL, callsForSave, sigilDuration, sigilPoseAt,
  sigilStrikeAt, targetSigilFor, type SigilPlan,
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

  it("draws the illusion sigil for its single-target save spells", () => {
    // Most of illusion's save spells are AREAS (Fear, Hypnotic Pattern), which
    // the splash system already draws body by body. These four are the
    // single-target ones the sigil is actually for.
    for (const name of ["Phantasmal Killer", "Dream", "Mental Prison", "Seeming"]) {
      expect(targetSigilFor({ school: "illusion", spellName: name }), name).not.toBeNull()
    }
  })

  it("still skips illusion's AREA save spells — splash covers those", () => {
    for (const name of ["Fear", "Hypnotic Pattern"]) {
      expect(targetSigilFor({ school: "illusion", spellName: name, isArea: true }), name).toBeNull()
    }
  })

  it("draws a sigil for EVERY school — the list is finally complete", () => {
    // This test moved five times as schools got art — enchantment, evocation,
    // transmutation, conjuration, divination — each time naming whoever was
    // still silent. Abjuration was the last, so there is no negative case
    // left and the test inverts: all eight must draw, with and without a
    // damage type. If a school ever goes quiet again, this is what says so.
    const ALL = ["abjuration", "conjuration", "divination", "enchantment",
                 "evocation", "illusion", "necromancy", "transmutation"] as const
    expect(ALL).toHaveLength(8)
    for (const s of ALL) {
      expect(targetSigilFor({ resolve: "save", school: s, damage: "radiant" }), s).not.toBeNull()
      expect(targetSigilFor({ resolve: "save", school: s, damage: null }), s).not.toBeNull()
    }
  })

  it("gives every registered sigil mote art and a tint from Sam's palette", () => {
    for (const [school, art] of Object.entries(SCHOOL_SIGIL)) {
      expect(art?.motes, school).toBe("pxPlumeMotes")
      expect(typeof art?.tint, school).toBe("number")
    }
    // One shared white sheet serves them all, so a new sigil costs no new
    // mote art — only a tint.
    const tints = Object.values(SCHOOL_SIGIL).map((a) => a?.tint)
    expect(new Set(tints).size).toBe(tints.length)
  })

  it("lets a school have NO ring, and names the two that do without one", () => {
    // Conjuration first (Sam, 2026-09-29: "just remove the sigil"), then
    // divination, whose art never had a ring in it — a seer ringed by scrying
    // eyes, with the figure cut out so the caster's sprite stands in the hole.
    //
    // Asserted as a SET, not as one exception, and the negative half is
    // asserted too: a school losing its ring should be a decision someone
    // made, not something that drifted in.
    const RINGLESS = new Set(["conjuration", "divination"])
    for (const [school, art] of Object.entries(SCHOOL_SIGIL)) {
      if (RINGLESS.has(school)) expect(art?.ring, school).toBeUndefined()
      else expect(art?.ring, school).toBeTruthy()
    }
    // Whatever it has or lacks, EVERY sigil has a plume: that is the layer
    // the effect actually reads from.
    for (const [school, art] of Object.entries(SCHOOL_SIGIL)) {
      expect(art?.plume, school).toBeTruthy()
    }
  })

  it("sizes the plume quad from the art, and only where the art needs it", () => {
    // Two schools override, for the same reason and different shapes:
    // divination's eyes are SQUARE, abjuration's dome is wider than tall.
    // Everything else is the default tall column and must stay unset, or the
    // override stops meaning anything.
    expect(SCHOOL_SIGIL.divination?.plumeSize).toEqual([3.2, 3.2])
    expect(SCHOOL_SIGIL.abjuration?.plumeSize).toEqual([2.8, 2.25])
    const SIZED = new Set(["divination", "abjuration"])
    for (const [school, art] of Object.entries(SCHOOL_SIGIL)) {
      if (!SIZED.has(school)) expect(art?.plumeSize, school).toBeUndefined()
    }
    // A dome is wider than it is tall; eyes ringing a figure are square.
    const [aw, ah] = SCHOOL_SIGIL.abjuration!.plumeSize!
    expect(aw).toBeGreaterThan(ah)
    // Both must clear a one-square sprite standing in the middle.
    for (const s of SIZED) expect(SCHOOL_SIGIL[s as "divination"]!.plumeSize![0]).toBeGreaterThan(1)
  })

  it("anchors on the target by default, and on the CASTER for the two self-wards", () => {
    // Divination's eyes open around whoever is scrying; abjuration's ward
    // closes over whoever is casting it. Both are things a caster does to
    // their own square. Every other school marks the creature the spell was
    // thrown at, and an absent `anchor` must keep meaning "target" — the
    // board reads it as `=== "caster"`, so a typo falls back to the safe side.
    const SELF = new Set(["divination", "abjuration"])
    for (const [school, art] of Object.entries(SCHOOL_SIGIL)) {
      if (SELF.has(school)) expect(art?.anchor, school).toBe("caster")
      else expect(art?.anchor, school).toBeUndefined()
    }
  })

  it("asks for the ward pose only where the caster raises rather than throws", () => {
    // Sam, 2026-09-30: "he just needs to raise his hands, the magic sphere is
    // what he creates." Abjuration is the only school that wants its own
    // caster pose; every other one keeps the ordinary cast, and an undefined
    // casterPose must keep meaning that.
    expect(SCHOOL_SIGIL.abjuration?.casterPose).toBe("ward")
    for (const [school, art] of Object.entries(SCHOOL_SIGIL)) {
      if (school !== "abjuration") expect(art?.casterPose, school).toBeUndefined()
    }
  })

  it("has a registry keyed by school, so a second sigil is one line and no logic", () => {
    expect(SCHOOL_SIGIL.necromancy?.ring).toBe("sigilNecroticRing")
    expect(SCHOOL_SIGIL.enchantment?.ring).toBe("sigilEnchantmentRing")
    expect(SCHOOL_SIGIL.illusion?.ring).toBe("sigilIllusionRing")
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
        for (const v of [p.frame, p.opacity, p.scale, p.spin, p.radiate, p.permeate, p.flame, p.burst]) {
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

  it("throws the hit spark ON the strike frame, not before it", () => {
    const strike = sigilStrikeAt(PLAN)
    expect(sigilPoseAt(strike - 0.02, PLAN, "taken", PEAK).burst).toBeLessThan(0)
    expect(sigilPoseAt(strike + 0.01, PLAN, "taken", PEAK).burst).toBeGreaterThanOrEqual(0)
  })

  it("runs the spark once, forward, and stops — it does not fade or loop", () => {
    const strike = sigilStrikeAt(PLAN)
    let last = -1
    for (let u = 0; u <= BURST_LIFE; u += 0.005) {
      const b = sigilPoseAt(strike + u, PLAN, "taken", PEAK).burst
      expect(b).toBeGreaterThanOrEqual(last - 1e-9)   // monotonic
      expect(b).toBeLessThanOrEqual(1)                // never past its end
      last = b
    }
    // The endpoint asserted exactly, rather than trusting the loop to land on
    // it — accumulating 0.005 steps stops at 0.295, not 0.300.
    expect(sigilPoseAt(strike + BURST_LIFE, PLAN, "taken", PEAK).burst).toBeCloseTo(1, 6)
  })

  it("throws NO spark on a save — the spell was turned aside", () => {
    for (let t = 0; t <= sigilDuration(PLAN) + 0.3; t += 0.01) {
      expect(sigilPoseAt(t, PLAN, "warded", PEAK).burst, `@${t.toFixed(2)}`).toBeLessThan(0)
    }
  })

  it("gives every registered sigil a burst sheet — shared, or its own", () => {
    // This used to require the SHARED sheet for every school, which held
    // while one white burst served them all. Evocation now has art of its
    // own (Sam drew a fire blast for it), so the rule that actually matters
    // is the one this was protecting: no registered school may go WITHOUT a
    // hit spark, because the strike frame is the dramatic peak of the effect
    // and a school missing one simply fades instead of landing.
    for (const [school, art] of Object.entries(SCHOOL_SIGIL)) {
      expect(art?.burst, `${school} has no burst`).toBeTruthy()
    }
    // The shared sheet is still the default: a school only departs from it
    // when someone drew art for that school specifically.
    const own = Object.entries(SCHOOL_SIGIL).filter(([, a]) => a?.burst !== "pxSigilBurst")
    expect(own.map(([s]) => s)).toEqual(["evocation"])
    expect(SCHOOL_SIGIL.evocation?.burst).toBe("sigilEvocationBurst")
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

describe("a still sigil — transmutation's ring does not turn", () => {
  const plan = targetSigilFor({ resolve: "save", school: "transmutation", damage: "radiant" })!

  it("is registered still, and the turning schools are not", () => {
    expect(SCHOOL_SIGIL.transmutation?.still).toBe(true)
    for (const s of ["necromancy", "enchantment", "illusion", "evocation", "conjuration"] as const) {
      expect(SCHOOL_SIGIL[s]?.still, s).toBeFalsy()
    }
  })

  it("never turns, in any act or outcome", () => {
    const total = plan.form + plan.hold + plan.resolve
    for (const outcome of ["taken", "warded"] as const) {
      for (let i = 0; i <= 40; i++) {
        const t = (total * 1.1 * i) / 40
        expect(sigilPoseAt(t, plan, outcome, 0.5).spin, `${outcome} @${t.toFixed(2)}`).toBe(0)
      }
    }
  })

  it("holds the whirlwind back until the ring is lit — the point of the change", () => {
    // Sam: "transparent to slowly visible and glowing and THEN the whirlwind
    // shows." Without the delay the plume rises through a ring that is still
    // fading in and the ring never gets its moment.
    const early = sigilPoseAt(plan.form * 0.3, plan, "taken", 0.5)
    expect(early.opacity).toBeGreaterThan(0)     // the ring is coming up
    expect(early.flame).toBe(0)                  // and nothing is rising yet
    const mid = sigilPoseAt(plan.form * 0.7, plan, "taken", 0.5)
    expect(mid.flame).toBe(0)                    // still nothing at 70% up
    const late = sigilPoseAt(plan.form * 0.98, plan, "taken", 0.5)
    expect(late.flame).toBeGreaterThan(0.4)      // by the end of form it is there
  })

  it("lasts twice as long, with the extra time in the RISE", () => {
    // Sam: "the sigil needs to last twice as long." The doubling is the easy
    // half; the reweighting is the point. On the default plan the ring was up
    // in a third of the effect and spent the rest fading, which reads as
    // appearing and then going transparent.
    expect(sigilDuration(plan)).toBeCloseTo(2 * sigilDuration({ art: plan.art, ...DEFAULT_PLAN }), 5)
    expect(plan.form / sigilDuration(plan)).toBeGreaterThan(0.5)
    expect(DEFAULT_PLAN.form / (DEFAULT_PLAN.form + DEFAULT_PLAN.hold + DEFAULT_PLAN.resolve))
      .toBeLessThan(0.4)
  })

  it("still fades in, and a turning school still turns", () => {
    expect(sigilPoseAt(0, plan, "taken", 0.5).opacity).toBeLessThan(0.05)
    expect(sigilPoseAt(plan.form, plan, "taken", 0.5).opacity).toBeGreaterThan(0.9)
    const spun = targetSigilFor({ resolve: "save", school: "evocation", damage: "fire" })!
    expect(sigilPoseAt(spun.form * 0.8, spun, "taken", 0.5).spin).toBeLessThan(0)
  })
})
