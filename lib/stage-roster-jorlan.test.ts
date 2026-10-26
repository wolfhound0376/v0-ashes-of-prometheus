import { describe, expect, it } from "vitest"
import { applyEventsTo, jorlanOnDuty, rollJorlanAt, type Stage } from "./stage-roster"

// Sam, 2026-10-26: "Jorlan shouldn't be present in the beginning of the game. He should come after the 2nd or 3rd
// guard rotation."

const fresh = (): Stage => ({ area: "Velkynvelve", present: {}, gone: {}, watch: null, gate: null, rotations: 0, jorlanAt: null, updatedAt: "" })
const change = { kind: "watch", state: "changing" } as const
const at = (n: number) => () => (n === 2 ? 0.1 : 0.9)   // the roll: low → 2nd rotation, high → 3rd

describe("Jorlan comes on with a later watch", () => {
  it("is not on duty when the game begins", () => {
    expect(jorlanOnDuty(fresh())).toBe(false)
  })

  it("rolls only 2 or 3", () => {
    for (const r of [0, 0.25, 0.49, 0.5, 0.75, 0.999]) expect([2, 3]).toContain(rollJorlanAt(() => r))
    expect(rollJorlanAt(() => 0.1)).toBe(2)
    expect(rollJorlanAt(() => 0.9)).toBe(3)
  })

  it("rolls once, at the first change, and keeps it", () => {
    const s = fresh()
    applyEventsTo(s, [change], "t1", at(3))
    expect(s.rotations).toBe(1)
    expect(s.jorlanAt).toBe(3)
    applyEventsTo(s, [change], "t2", at(2))             // a second roll would say 2; the first one stands
    expect(s.jorlanAt).toBe(3)
  })

  it("arrives with the 2nd rotation when that is the roll", () => {
    const s = fresh()
    applyEventsTo(s, [change], "t1", at(2))
    expect(jorlanOnDuty(s)).toBe(false)
    applyEventsTo(s, [change], "t2", at(2))
    expect(jorlanOnDuty(s)).toBe(true)
  })

  it("arrives with the 3rd rotation when that is the roll", () => {
    const s = fresh()
    applyEventsTo(s, [change, change], "t1", at(3))
    expect(jorlanOnDuty(s)).toBe(false)
    applyEventsTo(s, [change], "t2", at(3))
    expect(jorlanOnDuty(s)).toBe(true)
  })

  it("counts only changes of the watch, not posted or unattended", () => {
    const s = fresh()
    applyEventsTo(s, [{ kind: "watch", state: "posted" }, { kind: "watch", state: "unattended" }, { kind: "watch", state: "posted" }], "t1", at(2))
    expect(s.rotations).toBe(0)
    expect(s.jorlanAt).toBeNull()
  })

  it("keeps the count when the party moves to another area", () => {
    const s = fresh()
    applyEventsTo(s, [change, { kind: "move", area: "Guard Tower" }, change], "t1", at(2))
    expect(s.rotations).toBe(2)
    expect(jorlanOnDuty(s)).toBe(true)
  })

  it("reads a stage written before rotations existed as none yet", () => {
    expect(jorlanOnDuty({ rotations: undefined, jorlanAt: undefined })).toBe(false)
  })
})
