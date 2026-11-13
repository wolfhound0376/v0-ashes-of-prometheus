import { describe, expect, it } from "vitest"
import { applyEventsTo, gateNow, GATE_VISIT_MS, type Stage } from "./stage-roster"

// Sam, 2026-11-12: "The door open without anyone actually unlocking it." Malachar narrated a guard stepping in to look
// and tagged [GATE: open]; the gate then stood open on every map for good. A story-opened gate is now a drow visit.
const blank = (): Stage => ({ area: null, present: {}, gone: {}, watch: null, gate: null, rotations: 0, jorlanAt: null, updatedAt: "" })
const T0 = "2026-11-13T00:02:14.948Z"

describe("a story-opened gate is a visit", () => {
  it("records when the drow will lock it again", () => {
    const s = applyEventsTo(blank(), [{ kind: "gate", state: "open", visit: true }], T0)
    expect(s.gate?.state).toBe("open")
    expect(Date.parse(s.gate!.visitUntil!) - Date.parse(T0)).toBe(GATE_VISIT_MS)
  })
  it("reads as open during the visit and locked after it, from the moment it ran out", () => {
    const s = applyEventsTo(blank(), [{ kind: "gate", state: "open", visit: true }], T0)
    expect(gateNow(s.gate, Date.parse(T0) + GATE_VISIT_MS - 1)?.state).toBe("open")
    const after = gateNow(s.gate, Date.parse(T0) + GATE_VISIT_MS + 5000)
    expect(after).toEqual({ state: "locked", since: s.gate!.visitUntil })
  })
  it("the DM's button (no visit) stands open", () => {
    const s = applyEventsTo(blank(), [{ kind: "gate", state: "open" }], T0)
    expect(s.gate?.visitUntil).toBeUndefined()
    expect(gateNow(s.gate, Date.parse(T0) + 10 * GATE_VISIT_MS)?.state).toBe("open")
  })
  it("leaves unlocked and locked gates alone", () => {
    expect(gateNow({ state: "unlocked", since: T0 }, Date.parse(T0) + 1e9)?.state).toBe("unlocked")
    expect(gateNow(null)).toBeNull()
  })
})
