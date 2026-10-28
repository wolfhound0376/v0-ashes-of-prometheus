import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
// plain .mjs, pasted into the walk page whole (build_walk.py /*__LABOR__*/)
import * as W from "./labor-walk.mjs"

const SPEC = JSON.parse(readFileSync(join(__dirname, "..", "scripts", "velkynvelve-walk", "spec.json"), "utf8"))

// Sam, 2026-10-26: the escort takes the party from the pen plate and the detail just shows up on the work plate.
describe("the march out is one cut", () => {
  it("lands the party at the door of the plate before the work plate", () => {
    expect(W.arrivalFrom(SPEC, "11", "10b")).toBe("10")     // rocks, rope: in by the guard tower's ladder
    expect(W.arrivalFrom(SPEC, "11", "10c")).toBe("10")     // supplies
    expect(W.arrivalFrom(SPEC, "11", "3k")).toBe("3")       // kitchen, dishes
    expect(W.arrivalFrom(SPEC, 11, "12")).toBe("11")        // quaggoth hair is next door to the pen
  })
  it("agrees with the route the detail walks", () => {
    for (const task of Object.keys(W.WORK_PLATE)) {
      const r = W.detailRoute(SPEC, task)
      if (!r.out) continue
      expect(W.arrivalFrom(SPEC, W.PEN_PLATE, r.plate), task).toBe(r.out.length > 1 ? r.out[r.out.length - 2] : W.PEN_PLATE)
    }
  })
  it("is what the walk page does: through the pen's gate, then the cut — no walk onto the next plate", () => {
    const page = readFileSync(join(__dirname, "..", "scripts", "velkynvelve-walk", "template.html"), "utf8")
    const walk = page.slice(page.indexOf("async function laborWalk("), page.indexOf("// 2. at work:"))
    const out = walk.slice(0, walk.indexOf("if (opts.cut && route.length > 2)"))
    expect(out).toContain("travel(to, z, false, {note})")   // `to` is the work plate: the cut
    expect(out).not.toMatch(/travel\(nx/)                    // the old walk onto route[1]
  })
})

// The forgotten laundry shift of 2026-10-26: 'working' for two hours because nobody pressed "Finish the shift".
describe("the shift timeout — one game hour (Sam)", () => {
  const t0 = Date.parse("2026-10-27T02:00:00Z")
  // arrived a minute ago in real time, so only the game clock is in play here (the backstop has its own tests below)
  const arrive = (clock?: { day: number; minutes: number }, at = new Date(t0 - 60000).toISOString()) => ({ at, kind: "step", action: "arrive", from: "escorting", to: "working", by: "dm", clock })
  const detail = (events: unknown[], status = "working") => ({ status, events })

  it("leaves a shift alone for its hour", () => {
    expect(W.shiftTimeout(detail([arrive({ day: 1, minutes: 600 })]), { day: 1, minutes: 660 }, t0)).toBe("ok")
  })
  it("marks it overdue past the hour, then waits a minute for a map to walk them home", () => {
    const d = detail([arrive({ day: 1, minutes: 600 })])
    expect(W.shiftTimeout(d, { day: 1, minutes: 665 }, t0)).toBe("flag")
    const marked = detail([...d.events, { at: new Date(t0).toISOString(), kind: "overdue" }])
    expect(W.shiftTimeout(marked, { day: 1, minutes: 665 }, t0 + W.OVERDUE_GRACE_MS - 1)).toBe("overdue")
    expect(W.shiftTimeout(marked, { day: 1, minutes: 665 }, t0 + W.OVERDUE_GRACE_MS)).toBe("abort")
  })
  it("counts across midnight", () => {
    expect(W.shiftTimeout(detail([arrive({ day: 1, minutes: 1420 })]), { day: 2, minutes: 30 }, t0)).toBe("ok")
    expect(W.shiftTimeout(detail([arrive({ day: 1, minutes: 1420 })]), { day: 2, minutes: 41 }, t0)).toBe("flag")
  })
  it("ends at once when Malachar passes a whole labor shift ([TIME:labor_shift], 480 minutes)", () => {
    expect(W.shiftTimeout(detail([arrive({ day: 1, minutes: 120 })]), { day: 1, minutes: 600 }, t0)).toBe("flag")
  })
  it("never touches a detail that is not working", () => {
    for (const s of ["scheduled", "called", "escorting", "returning", "done", "aborted"]) {
      expect(W.shiftTimeout(detail([arrive({ day: 1, minutes: 0 })], s), { day: 3, minutes: 0 }, t0), s).toBe("ok")
    }
  })
  it("cannot time out on the game clock without a game time for the arrival (the route looks it up in time_log)", () => {
    expect(W.shiftTimeout(detail([arrive()]), { day: 3, minutes: 0 }, t0)).toBe("ok")
    expect(W.shiftTimeout(detail([arrive()]), { day: 3, minutes: 0 }, t0, { day: 1, minutes: 0 })).toBe("flag")
  })
  it("uses the latest arrival on the detail", () => {
    expect(W.arrivalStep([arrive({ day: 1, minutes: 0 }), arrive({ day: 1, minutes: 500 })])?.clock).toEqual({ day: 1, minutes: 500 })
  })

  // Sam, 2026-10-27: "add the 15 minute backstop" — the game clock stands still while nobody talks to Malachar.
  describe("the 15-real-minute backstop", () => {
    const quiet = { day: 1, minutes: 600 }                       // the clock has not moved since they arrived
    const at = (msBefore: number) => new Date(t0 - msBefore).toISOString()
    it("leaves a quiet shift alone for 15 real minutes", () => {
      const d = detail([arrive(quiet, at(W.SHIFT_REAL_MS))])
      expect(W.shiftOver(d, quiet, t0)).toBeNull()
      expect(W.shiftTimeout(d, quiet, t0)).toBe("ok")
    })
    it("ends a quiet shift after 15 real minutes, even though the game clock never moved", () => {
      const d = detail([arrive(quiet, at(W.SHIFT_REAL_MS + 1000))])
      expect(W.shiftOver(d, quiet, t0)).toBe("real-time")
      expect(W.shiftTimeout(d, quiet, t0)).toBe("flag")
    })
    it("ends it too when there is no game time at all", () => {
      expect(W.shiftTimeout(detail([arrive(undefined, at(W.SHIFT_REAL_MS + 1000))]), { day: 3, minutes: 0 }, t0)).toBe("flag")
    })
    it("whichever comes first: the game hour can still end it sooner", () => {
      expect(W.shiftOver(detail([arrive({ day: 1, minutes: 600 }, at(5 * 60000))]), { day: 1, minutes: 661 }, t0)).toBe("game-hour")
    })
    it("then waits the same minute for a map to walk them home before calling it off", () => {
      const d = detail([arrive(quiet, at(W.SHIFT_REAL_MS + 1000)), { at: new Date(t0).toISOString(), kind: "overdue" }])
      expect(W.shiftTimeout(d, quiet, t0 + W.OVERDUE_GRACE_MS - 1)).toBe("overdue")
      expect(W.shiftTimeout(d, quiet, t0 + W.OVERDUE_GRACE_MS)).toBe("abort")
    })
    it("is 15 minutes", () => expect(W.SHIFT_REAL_MS).toBe(15 * 60 * 1000))
  })
})

describe("the shift plays itself (Sam, 2026-10-27)", () => {
  const at = (iso: string) => ({ status: "working", events: [{ kind: "step", to: "working", at: iso }] })
  const t0 = Date.parse("2026-10-27T22:00:00Z")
  it("runs 0..1 over the watched shift from the arrival step", () => {
    const d = at("2026-10-27T22:00:00Z")
    expect(W.shiftProgress(d, t0)).toBe(0)
    expect(W.shiftProgress(d, t0 + W.SHIFT_WATCH_MS / 2)).toBeCloseTo(0.5)
    expect(W.shiftProgress(d, t0 + W.SHIFT_WATCH_MS * 3)).toBe(1)
  })
  it("is 0 when not working or never arrived", () => {
    expect(W.shiftProgress({ status: "returning", events: [] }, t0)).toBe(0)
    expect(W.shiftProgress({ status: "working", events: [] }, t0)).toBe(0)
  })
  it("orders the whim only on the pointless tasks, the verdict last", () => {
    expect(W.shiftBeats("supplies").map((b) => b.line)).toEqual(["progress", "whim", "done"])
    expect(W.shiftBeats("water").map((b) => b.line)).toEqual(["progress", "done"])
    for (const t of ["rocks", "rope", "supplies", "quaggoth-hair"] as const) expect(W.WORK_LINES.whim[t]).toBeTruthy()
  })
  it("fires each beat once across successive ticks", () => {
    const seen: string[] = []
    let p = 0
    for (const q of [0.1, 0.31, 0.31, 0.6, 0.93, 1]) { seen.push(...W.beatsBetween("rope", p, q).map((b) => b.line)); p = q }
    expect(seen).toEqual(["progress", "whim", "done"])
  })
})
