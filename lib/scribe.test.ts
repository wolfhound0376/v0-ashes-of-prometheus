import { describe, expect, it } from "vitest"
import {
  BASE_MS,
  CLAUSE_MS,
  LINE_MS,
  MAX_TOTAL_MS,
  SENTENCE_MS,
  SPACE_MS,
  WET_TAIL,
  charsWritten,
  scribeDelays,
  scribeDuration,
  wetRange,
} from "./scribe"

describe("the hand's rhythm", () => {
  it("gives one delay per character", () => {
    expect(scribeDelays("abc")).toHaveLength(3)
    expect(scribeDelays("")).toEqual([])
  })

  // The whole point. A constant delay is what makes every web typewriter
  // effect read as a machine.
  it("is never metronomic", () => {
    const d = scribeDelays("aaaaaaaaaaaaaaaaaaaa")
    expect(new Set(d.map((x) => Math.round(x * 100))).size).toBeGreaterThan(5)
  })

  it("writes the same page the same way every time", () => {
    expect(scribeDelays("Three guards on the gate.")).toEqual(scribeDelays("Three guards on the gate."))
  })

  it("writes two different pages differently", () => {
    expect(scribeDelays("Three guards.")).not.toEqual(scribeDelays("Four guards."))
  })

  // The nib stops once the full stop is DOWN. Pausing before it stutters a
  // beat early and reads as lag rather than as a hand.
  it("pauses after a full stop, not before it", () => {
    const text = "ab. cd"
    const d = scribeDelays(text, { maxTotalMs: 1e9 })
    // index 2 is '.', index 3 is the space that follows it
    expect(d[3]).toBeGreaterThan(SENTENCE_MS)
    expect(d[2]).toBeLessThan(SENTENCE_MS)
  })

  it("takes a shorter breath at a comma than at a full stop", () => {
    const comma = scribeDelays("ab, cd", { maxTotalMs: 1e9 })[3]
    const stop = scribeDelays("ab. cd", { maxTotalMs: 1e9 })[3]
    expect(comma).toBeGreaterThan(SPACE_MS)
    expect(comma).toBeLessThan(stop)
    expect(comma).toBeGreaterThan(CLAUSE_MS)
  })

  it("treats a new line as the longest pause", () => {
    const d = scribeDelays("ab\ncd", { maxTotalMs: 1e9 })
    expect(d[2]).toBe(LINE_MS)
    expect(d[2]).toBeGreaterThan(SENTENCE_MS)
  })

  it("crosses a space faster than it forms a letter", () => {
    const d = scribeDelays("ab cd", { maxTotalMs: 1e9 })
    expect(d[2]).toBeLessThan(BASE_MS)
  })
})

describe("the cap", () => {
  it("never lets a page outrun the reader", () => {
    const long = "Three guards on the gate. ".repeat(40)
    expect(scribeDuration(long)).toBeLessThanOrEqual(MAX_TOTAL_MS + 1)
  })

  it("leaves a short page at its natural pace", () => {
    const short = "Three guards."
    const capped = scribeDuration(short)
    const uncapped = scribeDuration(short, { maxTotalMs: 1e9 })
    expect(capped).toBeCloseTo(uncapped, 5)
  })

  // Scaling must keep the SHAPE — a scribe in a hurry still pauses longer at a
  // full stop than at a letter.
  it("keeps the pauses proportionally long when it hurries", () => {
    const text = "ab. cd. ef. " .repeat(60)
    const d = scribeDelays(text)
    const stopPause = d[3]
    const letter = d[1]
    expect(stopPause).toBeGreaterThan(letter * 4)
  })

  it("takes a rate multiplier", () => {
    const one = scribeDuration("Three guards.", { maxTotalMs: 1e9 })
    const two = scribeDuration("Three guards.", { maxTotalMs: 1e9, rate: 2 })
    expect(two).toBeCloseTo(one / 2, 5)
  })

  it("ignores a nonsense rate rather than dividing by zero", () => {
    expect(Number.isFinite(scribeDuration("abc", { rate: 0 }))).toBe(true)
    expect(Number.isFinite(scribeDuration("abc", { rate: -3 }))).toBe(true)
  })
})

describe("where the nib is", () => {
  const d = [100, 100, 100, 100]

  it("has written nothing before it touches the page", () => {
    expect(charsWritten(d, 0)).toBe(0)
    expect(charsWritten(d, -50)).toBe(0)
  })

  it("advances with elapsed time", () => {
    expect(charsWritten(d, 150)).toBe(1)
    expect(charsWritten(d, 250)).toBe(2)
  })

  it("finishes, and stays finished", () => {
    expect(charsWritten(d, 400)).toBe(4)
    expect(charsWritten(d, 99999)).toBe(4)
  })

  // Driven by elapsed time, not by frames — so a backgrounded tab catches up
  // instead of finishing late.
  it("jumps straight to the right place after a long stall", () => {
    expect(charsWritten(d, 320)).toBe(3)
  })

  it("handles an empty page", () => {
    expect(charsWritten([], 500)).toBe(0)
  })
})

describe("wet ink", () => {
  it("trails the nib", () => {
    expect(wetRange(20, 100)).toEqual({ from: 20 - WET_TAIL, to: 20 })
  })

  it("dries once the page is finished", () => {
    expect(wetRange(100, 100)).toEqual({ from: 0, to: 0 })
  })

  it("is nothing before the nib touches down", () => {
    expect(wetRange(0, 100)).toEqual({ from: 0, to: 0 })
  })

  it("does not run off the front of a page barely started", () => {
    expect(wetRange(2, 100).from).toBe(0)
  })
})
