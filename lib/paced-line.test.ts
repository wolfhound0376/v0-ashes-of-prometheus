import { describe, expect, it } from "vitest"
import { BEHIND_MAX, HOLD_MAX_MS, HOLD_MIN_MS, holdMs, pacedStep } from "@/lib/paced-line"

const L = (id: string, text = "Small thing. Guess it did.") => ({ id, text })

describe("the stage line holds long enough to read (Sam's playtest 2026-11-15, point 1)", () => {
  it("gives short lines the floor and long speeches the ceiling", () => {
    expect(holdMs("...Huh.")).toBe(HOLD_MIN_MS)
    expect(holdMs("word ".repeat(80))).toBe(HOLD_MAX_MS)
  })
  it("shows the newest line when nothing is up yet", () => {
    expect(pacedStep([L("a"), L("b")], null, 0, 0).id).toBe("b")
  })
  it("keeps a line up until it has been read, then moves to the next in order", () => {
    const lines = [L("a"), L("b"), L("c")]
    const held = pacedStep(lines, "a", 1000, 1500)
    expect(held.id).toBe("a")
    expect(held.wait).toBeGreaterThan(0)
    expect(pacedStep(lines, "a", 1000, 1000 + holdMs(lines[0].text)).id).toBe("b")
  })
  it("rests on the last line with nothing queued", () => {
    expect(pacedStep([L("a"), L("b")], "b", 0, 99999)).toEqual({ id: "b", wait: Infinity })
  })
  it("skips ahead when a burst leaves it too far behind", () => {
    const lines = ["a", "b", "c", "d", "e", "f"].map((id) => L(id))
    expect(pacedStep(lines, "a", 0, 99999).id).toBe(lines[lines.length - 1 - BEHIND_MAX].id)
  })
  it("jumps to the newest line when the shown one is no longer in the log", () => {
    expect(pacedStep([L("x"), L("y")], "gone", 0, 0).id).toBe("y")
  })
})
