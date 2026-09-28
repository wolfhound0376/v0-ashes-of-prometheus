import { describe, expect, it } from "vitest"
import {
  EDGE_STRENGTH, MAX_SPLASH_DELAY, WAVE_FEET_PER_SECOND,
  isExplosive, splashArrivals, splashWeight, type SplashBody,
} from "./splash-timing"

const FT = 5
const opts = (explosive = true) => ({ explosive, feetPerSquare: FT })

/** Four drow in a line east of the blast, at 0, 5, 10 and 15 feet. */
const LINE: SplashBody[] = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 1, y: 0 },
  { id: "c", x: 2, y: 0 },
  { id: "d", x: 3, y: 0 },
]

describe("isExplosive", () => {
  it("knows a blast from a cloud", () => {
    expect(isExplosive("fire")).toBe(true)
    expect(isExplosive("thunder")).toBe(true)
    expect(isExplosive("poison")).toBe(false)
    expect(isExplosive("fog")).toBe(false)
  })
})

describe("splashArrivals", () => {
  it("measures distance in feet through the board's own square size", () => {
    const [, b, c] = splashArrivals({ x: 0, y: 0 }, LINE, opts())
    expect(b.distanceFt).toBe(5)
    expect(c.distanceFt).toBe(10)
  })

  it("measures diagonals as real distance, not as squares", () => {
    const [hit] = splashArrivals({ x: 0, y: 0 }, [{ id: "a", x: 3, y: 4 }], opts())
    expect(hit.distanceFt).toBeCloseTo(25, 6)   // 3-4-5 triangle, times 5 ft
  })

  it("arrives outward: nobody further off is reached sooner", () => {
    const out = splashArrivals({ x: 0, y: 0 }, LINE, opts())
    for (let i = 1; i < out.length; i++) {
      expect(out[i].delay).toBeGreaterThanOrEqual(out[i - 1].delay)
    }
  })

  it("hits ground zero on the impact frame itself", () => {
    const [first] = splashArrivals({ x: 0, y: 0 }, LINE, opts())
    expect(first.id).toBe("a")
    expect(first.delay).toBe(0)
  })

  it("delays by real distance over the wave speed", () => {
    const [, b] = splashArrivals({ x: 0, y: 0 }, LINE, opts())
    expect(b.delay).toBeCloseTo(5 / WAVE_FEET_PER_SECOND, 9)
  })

  it("never makes anyone wait past the cap, however big the shape", () => {
    const far = splashArrivals({ x: 0, y: 0 }, [{ id: "z", x: 400, y: 400 }], opts())
    expect(far[0].delay).toBe(MAX_SPLASH_DELAY)
  })

  it("draws a cloud on everyone at once — no front to travel", () => {
    const out = splashArrivals({ x: 0, y: 0 }, LINE, opts(false))
    for (const a of out) expect(a.delay).toBe(0)
  })

  it("still measures distance for a cloud, so strength falls off without a delay", () => {
    const out = splashArrivals({ x: 0, y: 0 }, LINE, opts(false))
    expect(out.at(-1)!.distanceFt).toBe(15)
    expect(out.at(-1)!.strength).toBeLessThan(out[0].strength)
  })

  it("falls off to the edge strength at the furthest body and no further", () => {
    const out = splashArrivals({ x: 0, y: 0 }, LINE, opts())
    expect(out[0].strength).toBeCloseTo(1, 9)
    expect(out.at(-1)!.strength).toBeCloseTo(EDGE_STRENGTH, 9)
    for (const a of out) {
      expect(a.strength).toBeGreaterThanOrEqual(EDGE_STRENGTH)
      expect(a.strength).toBeLessThanOrEqual(1)
    }
  })

  it("gives a lone victim a full-strength splash, not an arbitrary fraction", () => {
    // Falloff is measured across THIS blast's actual spread. With one body
    // there is no spread, and dividing by an assumed radius would quietly
    // halve every single-target hit.
    const [only] = splashArrivals({ x: 0, y: 0 }, [{ id: "a", x: 4, y: 0 }], opts())
    expect(only.strength).toBe(1)
    expect(only.delay).toBeCloseTo(20 / WAVE_FEET_PER_SECOND, 9)
  })

  it("gives everyone a full splash when they are all equidistant", () => {
    const ring: SplashBody[] = [
      { id: "n", x: 0, y: 2 }, { id: "s", x: 0, y: -2 },
      { id: "e", x: 2, y: 0 }, { id: "w", x: -2, y: 0 },
    ]
    for (const a of splashArrivals({ x: 0, y: 0 }, ring, opts())) {
      expect(a.strength).toBeCloseTo(1, 9)
      expect(a.delay).toBeCloseTo(10 / WAVE_FEET_PER_SECOND, 9)
    }
  })

  it("handles an empty shape without throwing", () => {
    expect(splashArrivals({ x: 0, y: 0 }, [], opts())).toEqual([])
  })

  it("breaks ties by id, so every seat plays the same order", () => {
    const tied: SplashBody[] = [
      { id: "zeta", x: 1, y: 0 }, { id: "alpha", x: 0, y: 1 }, { id: "mid", x: -1, y: 0 },
    ]
    expect(splashArrivals({ x: 0, y: 0 }, tied, opts()).map((a) => a.id))
      .toEqual(["alpha", "mid", "zeta"])
  })

  it("is a pure function of its inputs — a replay splashes identically", () => {
    const a = splashArrivals({ x: 2, y: 3 }, LINE, opts())
    const b = splashArrivals({ x: 2, y: 3 }, LINE, opts())
    expect(a).toEqual(b)
  })

  it("works from a cone's own origin, so the front runs out along the cone", () => {
    // The board passes the caster's square as `centre` for a self-centred
    // shape. Bodies deeper into the cone are reached later, which is right.
    const cone: SplashBody[] = [
      { id: "near", x: 1, y: 0 }, { id: "far", x: 5, y: 0 },
    ]
    const [near, far] = splashArrivals({ x: 0, y: 0 }, cone, opts())
    expect(near.id).toBe("near")
    expect(far.delay).toBeGreaterThan(near.delay)
  })
})

describe("splashWeight", () => {
  it("draws a full splash on a body that took damage", () => {
    expect(splashWeight({ amount: 14 })).toEqual({ draw: true, scale: 1, sparks: 1, warded: false })
  })

  it("draws a smaller, sparkless, warded splash on a SAVED body", () => {
    const w = splashWeight({ amount: 7, word: "SAVED" })
    expect(w.draw).toBe(true)
    expect(w.scale).toBeLessThan(1)
    expect(w.sparks).toBe(0)
    expect(w.warded).toBe(true)
  })

  it("still splashes a body that saved for NO damage — the blast reached them", () => {
    // Evasion, or a resisted save that zeroed it. Drawing nothing would say
    // the shape missed them, which is a different thing and a lie.
    expect(splashWeight({ amount: 0, word: "SAVED" }).draw).toBe(true)
  })

  it("draws nothing on a body the shape did not touch", () => {
    expect(splashWeight({ amount: 0 }).draw).toBe(false)
    expect(splashWeight({ amount: 0, word: "MISS" }).draw).toBe(false)
  })

  it("reads SAVED whatever the casing or padding the server sent", () => {
    expect(splashWeight({ amount: 3, word: " saved " }).warded).toBe(true)
  })

  it("draws a full splash on healing, which is a hit that helps", () => {
    expect(splashWeight({ amount: 9, heals: true }).draw).toBe(true)
  })
})
