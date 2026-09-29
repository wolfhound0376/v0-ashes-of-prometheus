import { describe, expect, it } from "vitest"
import {
  MeleeCombo,
  COMBO_WINDOW_MS,
  styleFor,
  rotateClip,
  arcSecondsFor,
  type ComboStep,
} from "./melee-combo"

describe("the combo chain", () => {
  it("walks 0 → 1 → 2 and starts over", () => {
    const c = new MeleeCombo()
    const t = 1_000
    expect(c.next("fifi", t)).toBe(0)
    expect(c.next("fifi", t + 400)).toBe(1)
    expect(c.next("fifi", t + 800)).toBe(2)
    expect(c.next("fifi", t + 1200)).toBe(0)
  })

  it("opens fresh once the attacker has stopped for a while", () => {
    const c = new MeleeCombo()
    expect(c.next("ront", 0)).toBe(0)
    expect(c.next("ront", 500)).toBe(1)
    // A whole round has gone by. He should not come back mid-combo.
    expect(c.next("ront", 500 + COMBO_WINDOW_MS + 1)).toBe(0)
  })

  it("holds the chain across a gap inside the window", () => {
    const c = new MeleeCombo()
    c.next("ront", 0)
    expect(c.next("ront", COMBO_WINDOW_MS - 1)).toBe(1)
  })

  it("gives two creatures their own rhythm", () => {
    // Two drow off the same stat block are two fighters. If they shared a
    // chain they would swing in unison, which is the exact fault the idle
    // loops already had to fix.
    const c = new MeleeCombo()
    expect(c.next("drow-a", 0)).toBe(0)
    expect(c.next("drow-b", 10)).toBe(0)
    expect(c.next("drow-a", 20)).toBe(1)
    expect(c.next("drow-b", 30)).toBe(1)
  })

  it("peeks without advancing, and answers null outside the window", () => {
    const c = new MeleeCombo()
    c.next("kenta", 0)
    expect(c.peek("kenta", 100)).toBe(0)
    expect(c.peek("kenta", 100)).toBe(0)   // still 0 — peeking is not swinging
    expect(c.next("kenta", 100)).toBe(1)
    expect(c.peek("kenta", 100 + COMBO_WINDOW_MS + 1)).toBeNull()
    expect(c.peek("nobody", 0)).toBeNull()
  })

  it("forgets a chain on request", () => {
    const c = new MeleeCombo()
    c.next("ront", 0)
    c.next("ront", 10)
    c.forget("ront")
    expect(c.next("ront", 20)).toBe(0)
  })
})

describe("swing styles", () => {
  const STEPS: ComboStep[] = [0, 1, 2]

  it("gives every step a distinct arc", () => {
    for (const archetype of ["blade", "dagger", "axe", "mace", "spear", "staff", "empty"] as const) {
      const names = STEPS.map((s) => styleFor(archetype, s).name)
      expect(new Set(names).size, `${archetype} repeats a style`).toBe(3)
    }
  })

  it("sweeps the other way on the answering blow", () => {
    // The point of step 1 is that it comes back across the body. Whatever
    // the numbers are, the sign of the travel has to flip.
    const a = styleFor("blade", 0)
    const b = styleFor("blade", 1)
    expect(Math.sign(a.to - a.from)).toBe(-Math.sign(b.to - b.from))
  })

  it("makes the finisher the biggest and brightest of the three", () => {
    const [one, two, three] = STEPS.map((s) => styleFor("axe", s))
    expect(three.glow).toBeGreaterThan(one.glow)
    expect(three.glow).toBeGreaterThan(two.glow)
    expect(three.width).toBeGreaterThan(one.width)
  })

  it("keeps a dagger's arcs shorter than a greataxe's", () => {
    for (const s of STEPS) {
      expect(styleFor("dagger", s).reach).toBeLessThan(styleFor("axe", s).reach)
    }
  })

  it("falls back to the blade chain for anything unmapped", () => {
    // A bow is not swung, but asking must not throw — the board decides
    // whether to DRAW the arc, and it should never have to guard this call.
    expect(styleFor("bow", 1).name).toBe(styleFor("blade", 1).name)
  })
})

describe("clip rotation", () => {
  it("never repeats back to back when the model has the clips not to", () => {
    const pool = ["Attack", "Attack_2", "Attack_3"]
    const seen = ([0, 1, 2] as ComboStep[]).map((s) => rotateClip(pool, s))
    expect(new Set(seen).size).toBe(3)
  })

  it("returns the one clip a one-clip model has, every time", () => {
    const pool = ["Attack"]
    for (const s of [0, 1, 2] as ComboStep[]) expect(rotateClip(pool, s)).toBe("Attack")
  })

  it("prefers a clip that names what the step is trying to be", () => {
    // The overhead finisher should reach for Charged_Slash rather than for
    // whatever index the plain rotation would have landed on.
    const pool = ["Attack", "Left_Slash", "Charged_Slash"]
    expect(rotateClip(pool, 2, styleFor("blade", 2))).toBe("Charged_Slash")
    expect(rotateClip(pool, 1, styleFor("blade", 1))).toBe("Left_Slash")
  })

  it("has nothing to say about an empty pool", () => {
    expect(rotateClip([], 0)).toBeNull()
  })
})

describe("how long the streak hangs", () => {
  it("stays clear of the next blow however long the clip is", () => {
    // A 2.8s Attack clip must not leave an arc still burning when the
    // second swing starts, or two blows smear into one.
    expect(arcSecondsFor(2.8, styleFor("axe", 2))).toBeLessThan(0.9)
  })

  it("never blinks out on a very short clip", () => {
    expect(arcSecondsFor(0.2, styleFor("dagger", 0))).toBeGreaterThan(0.2)
  })

  it("trails longer for a heavy finisher than for a knife flick", () => {
    expect(arcSecondsFor(1.2, styleFor("axe", 2)))
      .toBeGreaterThan(arcSecondsFor(1.2, styleFor("dagger", 2)))
  })
})
