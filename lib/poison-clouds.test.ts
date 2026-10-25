import { describe, expect, it } from "vitest"
import {
  BODY_FT, CLOUD_RULES, autoSucceeds, cloudDamage, driftAway, inCloud, saveOutcome, shouldRoll,
} from "./poison-clouds.mjs"
import { SKULL_FREE_FROM, cloudFrame, skullsAt } from "./area-cloud.mjs"

const STINK = CLOUD_RULES["Stinking Cloud"]
const KILL = CLOUD_RULES["Cloudkill"]

describe("the SRD 5.1 numbers", () => {
  it("Stinking Cloud: 3rd level, 90 ft, 20-ft radius, CON, concentration up to 1 minute", () => {
    expect(STINK).toMatchObject({ level: 3, rangeFt: 90, radiusFt: 20, save: "con", rounds: 10, dmg: null })
  })
  it("Cloudkill: 5th level, 120 ft, 20-ft radius, CON, 5d8 poison half on a save, up to 10 minutes", () => {
    expect(KILL).toMatchObject({ level: 5, rangeFt: 120, radiusFt: 20, save: "con", rounds: 100, dmg: "5d8", half: true })
  })
  it("only Cloudkill's fog moves, 10 ft a turn", () => {
    expect(KILL.drift).toBe(10)
    expect(STINK.drift).toBe(0)
  })
  it("skulls show in the deadly fog and not in the nauseating gas", () => {
    expect(KILL.skulls).toBe(true)
    expect(STINK.skulls).toBe(false)
  })
})

describe("who is in it", () => {
  it("Stinking Cloud asks for a creature COMPLETELY within it", () => {
    expect(inCloud(17.5, STINK)).toBe(true)            // body edge exactly at 20 ft
    expect(inCloud(18, STINK)).toBe(false)             // straddling the edge: not completely within
  })
  it("Cloudkill catches anyone any part of whom is in it", () => {
    expect(inCloud(18, KILL)).toBe(true)
    expect(inCloud(22.5, KILL)).toBe(true)             // touching the edge
    expect(inCloud(23, KILL)).toBe(false)
  })
  it("a bigger body is measured from its own edge", () => {
    expect(inCloud(16, STINK, 5)).toBe(false)          // a Large creature 16 ft out reaches 21 ft
    expect(BODY_FT).toBe(2.5)
  })
})

describe("who rolls, and when", () => {
  it("Stinking Cloud tests at the start of a turn only, never on entering", () => {
    expect(shouldRoll(STINK, "start", undefined, 7)).toBe(true)
    expect(shouldRoll(STINK, "enter", undefined, 7)).toBe(false)
  })
  it("Cloudkill tests on entering for the first time on a turn, or starting there — once a turn", () => {
    expect(shouldRoll(KILL, "enter", undefined, 7)).toBe(true)
    expect(shouldRoll(KILL, "enter", 7, 7)).toBe(false)     // out and back in on the same turn: no second roll
    expect(shouldRoll(KILL, "start", 6, 7)).toBe(true)      // a new turn
  })
  it("Stinking Cloud passes creatures immune to poison or that don't need to breathe", () => {
    expect(autoSucceeds(STINK, { immune: ["poison"] })).toBe(true)
    expect(autoSucceeds(STINK, { immuneCond: ["poisoned"] })).toBe(true)      // the quaggoth
    expect(autoSucceeds(STINK, { noBreath: true })).toBe(true)
    expect(autoSucceeds(STINK, { ctype: "undead" })).toBe(true)
    expect(autoSucceeds(STINK, {})).toBe(false)
  })
  it("Cloudkill affects them anyway (SRD: even if they don't need to breathe)", () => {
    expect(autoSucceeds(KILL, { noBreath: true })).toBe(false)
    expect(autoSucceeds(KILL, { ctype: "undead" })).toBe(false)
  })
})

describe("what a save does", () => {
  it("Stinking Cloud: a failure costs the action, a success costs nothing, neither deals damage", () => {
    expect(saveOutcome(STINK, false)).toEqual({ dmg: 0, retch: true })
    expect(saveOutcome(STINK, true)).toEqual({ dmg: 0, retch: false })
  })
  it("Cloudkill: full on a failure, half (rounded down) on a success", () => {
    expect(saveOutcome(KILL, false, 23)).toEqual({ dmg: 23, retch: false })
    expect(saveOutcome(KILL, true, 23)).toEqual({ dmg: 11, retch: false })
  })
  it("Cloudkill gains 1d8 per slot above 5th", () => {
    expect(cloudDamage(KILL, 5)).toBe("5d8")
    expect(cloudDamage(KILL, 7)).toBe("7d8")
    expect(cloudDamage(STINK, 3)).toBeNull()
  })
})

describe("Cloudkill's fog rolls away from the caster", () => {
  it("moves straight away along the line from the caster through the centre", () => {
    const n = driftAway({ x: 10, y: 0 }, { x: 0, y: 0 }, 10)
    expect(n.x).toBeCloseTo(20)
    expect(n.y).toBeCloseTo(0)
  })
  it("keeps its last direction when the caster stands on its centre", () => {
    const n = driftAway({ x: 5, y: 5 }, { x: 5, y: 5 }, 10, { x: 0, y: 1 })
    expect(n).toMatchObject({ x: 5, y: 15 })
  })
  it("stays put with no direction to take", () => {
    expect(driftAway({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toMatchObject({ x: 5, y: 5, dir: null })
  })
})

describe("skulls in and out of the gas", () => {
  const S = { frames: 100, fps: 20, grow: 50 }

  it("a skull-free cloud never shows a frame before the skulls have gone", () => {
    for (let i = 0; i < 400; i++) expect(cloudFrame(S, i / 20, 0, SKULL_FREE_FROM)).toBeGreaterThanOrEqual(SKULL_FREE_FROM)
  })

  it("no skull surfaces before the grow is over (the grow has its own)", () => {
    expect(skullsAt(2.4, 2.5, 7, 6, 3)).toEqual([])
  })

  it("skulls come and go: fading in, holding, fading out, always inside the cloud", () => {
    let seen = 0, max = 0
    for (let i = 0; i < 600; i++) {
      const ks = skullsAt(2.5 + i / 30, 2.5, 7, 6, 3)
      seen += ks.length
      for (const k of ks) {
        expect(k.alpha).toBeGreaterThanOrEqual(0)
        expect(k.alpha).toBeLessThanOrEqual(1)
        expect(k.puff).toBeGreaterThanOrEqual(0); expect(k.puff).toBeLessThan(7)
        expect(k.head).toBeGreaterThanOrEqual(0); expect(k.head).toBeLessThan(6)
        expect(Math.abs(k.u)).toBeLessThanOrEqual(0.25)
        max = Math.max(max, k.alpha)
      }
    }
    expect(seen).toBeGreaterThan(0)
    expect(max).toBeGreaterThan(0.6)
  })

  it("is the same on every seat", () => {
    expect(skullsAt(7.3, 2.5, 7, 6, 11)).toEqual(skullsAt(7.3, 2.5, 7, 6, 11))
  })

  it("a skull fades in rather than popping on", () => {
    const ks = skullsAt(2.5 + 0.05, 2.5, 7, 6, 3)
    for (const k of ks) expect(k.alpha).toBeLessThan(0.3)
  })
})
