import { describe, expect, it } from "vitest"
import { applyEventsTo, jorlanOnDuty, watchWriteEvents, type Stage } from "./stage-roster"

// The DM's watch-change write path (2026-10-30). Until this existed the map's "Story: the watch changes" button
// was a local preview: it set storyWatch in one browser and never reached the server, so `rotations` stayed 0 for
// a whole run and Jorlan — who comes on with the 2nd or 3rd rotation — could never arrive. Measured on the live
// game that day: watch null, rotations 0.

const fresh = (): Stage => ({ area: "Velkynvelve", present: {}, gone: {}, watch: null, gate: null, rotations: 0, jorlanAt: null, updatedAt: "" })
const at = (n: number) => () => (n === 2 ? 0.1 : 0.9)

describe("watchWriteEvents — what a DM map may ask for", () => {
  it("turns a watch word into one watch event", () => {
    expect(watchWriteEvents({ watch: "changing" })).toEqual({ events: [{ kind: "watch", state: "changing" }], error: null })
  })

  it("turns a gate word into one gate event", () => {
    expect(watchWriteEvents({ gate: "open" })).toEqual({ events: [{ kind: "gate", state: "open" }], error: null })
  })

  it("accepts both at once, watch first", () => {
    const { events } = watchWriteEvents({ watch: "unattended", gate: "unlocked" })
    expect(events).toEqual([{ kind: "watch", state: "unattended" }, { kind: "gate", state: "unlocked" }])
  })

  // The whole point of reusing watchStateOf: the button speaks the same words as Malachar's [WATCH:] tag, so the
  // two can never drift. If this list ever shrinks, a DM press and a line of prose stop meaning the same thing.
  it("speaks every word the [WATCH:] tag speaks", () => {
    for (const w of ["change", "changing", "shift-change", "rotation", "relief", "relieved"]) {
      expect(watchWriteEvents({ watch: w }).events).toEqual([{ kind: "watch", state: "changing" }])
    }
    for (const w of ["unattended", "empty", "abandoned", "deserted", "unguarded"]) {
      expect(watchWriteEvents({ watch: w }).events).toEqual([{ kind: "watch", state: "unattended" }])
    }
    for (const w of ["posted", "back", "returned", "manned", "on watch"]) {
      expect(watchWriteEvents({ watch: w }).events).toEqual([{ kind: "watch", state: "posted" }])
    }
  })

  it("refuses a word it does not know rather than guessing", () => {
    expect(watchWriteEvents({ watch: "sleepy" }).error).toMatch(/unknown watch state/)
    expect(watchWriteEvents({ gate: "wedged" }).error).toMatch(/unknown gate state/)
  })

  it("refuses an empty or wrongly shaped body", () => {
    expect(watchWriteEvents({}).error).toMatch(/nothing to change/)
    expect(watchWriteEvents(null).error).toMatch(/must be an object/)
    expect(watchWriteEvents([]).error).toMatch(/must be an object/)
    expect(watchWriteEvents("changing").error).toMatch(/must be an object/)
  })

  it("ignores a non-string watch instead of coercing it", () => {
    expect(watchWriteEvents({ watch: 3 }).error).toMatch(/nothing to change/)
  })
})

describe("the write path actually advances the rotation", () => {
  // This is the bug the PR exists to fix, stated as a test: three DM presses must do what three [WATCH: change]
  // tags do, including bringing Jorlan on.
  it("three presses bring Jorlan on when the roll says 3", () => {
    const s = fresh()
    for (let i = 0; i < 2; i++) {
      const { events } = watchWriteEvents({ watch: "changing" })
      applyEventsTo(s, events!, `t${i}`, at(3))
    }
    expect(s.rotations).toBe(2)
    expect(jorlanOnDuty(s)).toBe(false)

    const { events } = watchWriteEvents({ watch: "changing" })
    applyEventsTo(s, events!, "t3", at(3))
    expect(s.rotations).toBe(3)
    expect(jorlanOnDuty(s)).toBe(true)
  })

  it("a posted or unattended press does not count as a rotation", () => {
    const s = fresh()
    for (const w of ["unattended", "posted"]) {
      const { events } = watchWriteEvents({ watch: w })
      applyEventsTo(s, events!, "t", at(2))
    }
    expect(s.rotations).toBe(0)
    expect(jorlanOnDuty(s)).toBe(false)
  })

  it("a gate press moves the gate and leaves the rotation alone", () => {
    const s = fresh()
    const { events } = watchWriteEvents({ gate: "open" })
    applyEventsTo(s, events!, "t1", at(2))
    expect(s.gate).toEqual({ state: "open", since: "t1" })
    expect(s.rotations).toBe(0)
  })
})
