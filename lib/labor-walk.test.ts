import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
// plain .mjs, pasted into the walk page whole (build_walk.py /*__LABOR__*/)
import * as W from "./labor-walk.mjs"
import { TASKS } from "./labor"

const SPEC = JSON.parse(readFileSync(join(__dirname, "..", "scripts", "velkynvelve-walk", "spec.json"), "utf8"))

describe("where each task is worked", () => {
  it("has a plate for every task the scheduler can draw", () => {
    for (const t of TASKS) expect(SPEC[W.WORK_PLATE[t.key]], t.key).toBeTruthy()
  })

  it("sends the pots and the laundry to the waterfall, not the one-way pool", () => {
    expect(W.WORK_PLATE.pots).toBe("9")
    expect(W.WORK_PLATE.laundry).toBe("9")
  })

  it("walks every task there and back on the real Velkynvelve plates", () => {
    for (const t of TASKS) {
      const r = W.detailRoute(SPEC, t.key)
      expect(r.out, t.key).toBeTruthy()
      const out = r.out!
      expect(out[0]).toBe("11")
      expect(out[out.length - 1]).toBe(r.plate)
      expect(r.back![0]).toBe(r.plate)
      expect(r.back![r.back!.length - 1]).toBe("11")
    }
  })

  it("leaves the pen by its gate", () => {
    const r = W.detailRoute(SPEC, "water")
    expect(W.exitTo(SPEC, r.out![0], r.out![1])!.kind).toBe("gate")
  })

  it("never drops through the falls or takes the lift basket", () => {
    for (const t of TASKS) {
      const { out, back } = W.detailRoute(SPEC, t.key)
      for (const route of [out!, back!]) {
        for (let i = 1; i < route.length; i++) {
          const z = W.exitTo(SPEC, route[i - 1], route[i])
          if (z) expect(["water", "leave"]).not.toContain(z.kind)
        }
      }
    }
  })

  it("comes home the way it went when every door has a way back", () => {
    const { out, back } = W.detailRoute(SPEC, "kitchen")
    expect(back).toEqual([...out!].reverse())
  })

  it("uses a cut only where a door is missing — today, barracks to lift", () => {
    expect(W.cutsIn(SPEC, W.detailRoute(SPEC, "lift").out)).toEqual([["2", "5"]])
    for (const t of ["water", "clean", "pots", "kitchen", "rocks", "supplies", "quaggoth-hair"]) {
      const r = W.detailRoute(SPEC, t)
      expect(W.cutsIn(SPEC, r.out), t).toEqual([])
      expect(W.cutsIn(SPEC, r.back), t).toEqual([])
    }
  })

  it("prefers doors to cuts even when the cut is a shorter way", () => {
    const spec = {
      a: { zones: [{ to: ["b"] }] },
      b: { zones: [{ to: ["c"] }] },
      c: { zones: [{ to: ["d"] }] },
      d: { zones: [{ to: ["a"] }] },
    }
    expect(W.routeBetween(spec, "a", "d", { reverse: true })).toEqual(["a", "b", "c", "d"])
  })
})

describe("the steps of a detail", () => {
  it("goes scheduled → called → escorting → working → returning → done", () => {
    let s = "scheduled"
    for (const [a, n] of [["call", "called"], ["march", "escorting"], ["arrive", "working"], ["return", "returning"], ["done", "done"]]) {
      expect(W.advance(s, a)).toBe(n)
      s = n
    }
  })

  it("refuses a step out of order (two browsers racing to march)", () => {
    expect(W.advance("escorting", "march")).toBeNull()
    expect(W.advance("scheduled", "arrive")).toBeNull()
  })

  it("can be called off until it is done", () => {
    expect(W.advance("working", "abort")).toBe("aborted")
    expect(W.advance("done", "abort")).toBeNull()
    expect(W.advance("aborted", "abort")).toBeNull()
  })

  it("is live only while the party is being taken or is out", () => {
    expect(["called", "escorting", "working", "returning"].every(W.isLive)).toBe(true)
    expect(["scheduled", "done", "aborted"].some(W.isLive)).toBe(false)
  })
})

describe("the call", () => {
  it("warns on a refusal and slows a hero who drags their feet [SAM]", () => {
    expect(W.choiceEffect("refuse")).toMatchObject({ warning: true })
    expect(W.choiceEffect("drag")).toMatchObject({ slow: true, warning: false })
    expect(W.choiceEffect("go")).toMatchObject({ slow: false, warning: false })
  })

  it("has the escort's line for every task", () => {
    for (const t of TASKS) expect(W.LINES.task[t.key], t.key).toBeTruthy()
  })

  it("never names a hero in a call line (the guards don't know their names)", () => {
    for (const l of W.LINES.call) expect(l).not.toMatch(/\{name\}|Fifi|Kenta|Scott|Samson/)
  })
})

describe("who is who", () => {
  it("maps the prisoners' row names to their sprites", () => {
    expect(W.PRISONERS.map(W.prisonerSlug)).toEqual(["ront", "eldeth", "derendil", "sarith", "buppido", "jimjar", "topsy", "turvy", "shuushar", "stool"])
  })
})
