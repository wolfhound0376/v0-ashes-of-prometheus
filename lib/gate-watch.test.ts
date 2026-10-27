import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { GATE_RULES, gateRuleStep } from "./gate-watch.mjs"

// play a sequence of looks: [ms, atBars] → the acts the watch takes
function run(looks: [number, boolean][], start: any = null, onWarn?: (w: any) => any) {
  let w = start
  const acts: string[] = []
  for (const [t, at] of looks) {
    const r = gateRuleStep(w, at, t)
    w = r.w
    acts.push(r.act)
    if (r.act === "warn" && onWarn) w = onWarn(w)
  }
  return { acts, w }
}

describe("the pen gate warning (Sam, 2026-10-27)", () => {
  it("is 10 seconds", () => {
    expect(GATE_RULES.graceMs).toBe(10000)
  })

  it("warns first — never shoots on approach", () => {
    expect(gateRuleStep(null, true, 0)).toEqual({ w: { stage: "warned", at: 0 }, act: "warn" })
  })

  it("the bug: 'Step back' while still standing at the bars does NOT shoot (measured: shot 0.8 s after the click)", () => {
    const stepped = { stage: "stepped", at: 0, left: false }
    // the frames right after the click: still at the bars, walking away
    for (const t of [16, 33, 800, 3000, 9000]) expect(gateRuleStep(stepped, true, t).act).toBe("wait")
  })

  it("heeded: step back, get away inside 10 s, and nothing is fired", () => {
    const { acts } = run([[1000, true], [2000, false], [5000, false], [25000, false]], { stage: "stepped", at: 0, left: false })
    expect(acts).not.toContain("shoot")
  })

  it("more than 10 s since the warning and still at the bars: they shoot", () => {
    expect(gateRuleStep({ stage: "stepped", at: 0, left: false }, true, 10001).act).toBe("shoot")
  })

  it("the card left unanswered: wait out the 10 s, then shoot", () => {
    const w = { stage: "warned", at: 0 }
    expect(gateRuleStep(w, true, 9999).act).toBe("wait")
    expect(gateRuleStep(w, true, 10001).act).toBe("shoot")
  })

  it("not heeded: gets away, then comes back to the bars while the warning stands", () => {
    const { acts } = run([[1000, false], [6000, true]], { stage: "stepped", at: 0, left: false })
    expect(acts).toEqual(["none", "shoot"])
  })

  it("once the warning lapses, a new approach is warned again, not shot", () => {
    const { acts } = run([[1000, false], [GATE_RULES.againMs + 1, true]], { stage: "stepped", at: 0, left: false })
    expect(acts).toEqual(["none", "warn"])
  })

  it("the map pastes this file in and asks it (no second copy of the rule)", () => {
    const tpl = readFileSync(new URL("../scripts/velkynvelve-walk/template.html", import.meta.url), "utf8")
    expect(tpl).toContain("/*__GATE_WATCH__*/")
    expect(tpl).toContain("gateRuleStep(")
    expect(tpl).not.toMatch(/gateWarn\.until/)
  })
})
