import { describe, expect, it } from "vitest"
import {
  EVENT, PHASE, PHASES, QUIET_WINDOW_MS, canStep, discoveryDue, escapeFromFlags, escapeStep, jorlanStance,
  malacharLine, newEscape, policyFor, quietBanner, quietSecondsLeft, watchChangeMeans,
} from "./pen-escape.mjs"

// Design of record: claude/Pen_Escape_Phases_2026-11-13.md. Sam, 2026-11-13: "go. 2. Your call. 3. Lead the hunt."

const at = (now: number, rotation = 0) => ({ now, rotation })

describe("the phases", () => {
  it("starts held", () => {
    expect(newEscape().phase).toBe(PHASE.HELD)
  })

  it("plays Sam's run of 2026-11-13 the way it should have gone", () => {
    let e = newEscape(0, 4)
    e = escapeStep(e, EVENT.UNLOCK, at(1, 4)); expect(e.phase).toBe(PHASE.UNLOCKED)
    e = escapeStep(e, EVENT.FIGHT, at(2, 4)); expect(e.phase).toBe(PHASE.FIGHT); expect(e.back).toBe(PHASE.UNLOCKED)
    e = escapeStep(e, EVENT.WON, at(3, 4)); expect(e.phase).toBe(PHASE.OUT_QUIET)
    // he rested an hour on the landing: not allowed now
    expect(policyFor(e).shortRest.ok).toBe(false)
    // the watch changed (rotation 4 → 6): the relief finds the body
    expect(watchChangeMeans(e)).toBe("finds_body")
    expect(discoveryDue(e, 4, 6)).toBe(true)
    e = escapeStep(e, EVENT.DISCOVERED, at(5, 6)); expect(e.phase).toBe(PHASE.HUNTED)
    // Jorlan does not say "Back inside": he leads the hunt
    expect(jorlanStance(e)).toBe("hunt")
    expect(malacharLine(e)).toMatch(/alarm is up/)
  })

  it("refuses moves that make no sense, and says why", () => {
    const e = newEscape()
    const r = escapeStep(e, EVENT.DISCOVERED, at(1))
    expect(r.phase).toBe(PHASE.HELD)
    expect(r.refused).toMatch(/discovered cannot happen while held/)
    expect(canStep(e, EVENT.WON)).toBe(false)
  })

  it("a fight won while hunted leaves them hunted", () => {
    let e = { ...newEscape(), phase: PHASE.HUNTED }
    e = escapeStep(e, EVENT.FIGHT, at(1))
    e = escapeStep(e, EVENT.WON, at(2))
    expect(e.phase).toBe(PHASE.HUNTED)
  })

  it("a drow who gets away from the fight raises the alarm", () => {
    let e = escapeStep(escapeStep(newEscape(), EVENT.UNLOCK, at(1)), EVENT.FIGHT, at(2))
    expect(escapeStep(e, EVENT.FOE_ESCAPED, at(3)).phase).toBe(PHASE.HUNTED)
  })

  it("losing or surrendering goes to recaptured, and back to held after the march", () => {
    for (const from of [PHASE.UNLOCKED, PHASE.FIGHT, PHASE.OUT_QUIET, PHASE.HUNTED]) {
      const e = escapeStep({ ...newEscape(), phase: from }, EVENT.SURRENDER, at(1))
      expect(e.phase).toBe(PHASE.RECAPTURED)
      expect(escapeStep(e, EVENT.RETURNED, at(2)).phase).toBe(PHASE.HELD)
    }
  })

  it("gone is terminal", () => {
    const e = { ...newEscape(), phase: PHASE.GONE }
    for (const ev of Object.values(EVENT)) expect(canStep(e, ev)).toBe(false)
  })

  it("every phase can be reached from held", () => {
    const seen = new Set<string>([PHASE.HELD]), queue = [newEscape()]
    while (queue.length) {
      const e = queue.shift()!
      for (const ev of Object.values(EVENT)) {
        if (!canStep(e, ev)) continue
        const n = escapeStep(e, ev, at(1))
        if (!seen.has(n.phase)) { seen.add(n.phase); queue.push(n) }
      }
    }
    expect([...seen].sort()).toEqual([...PHASES].sort())
  })
})

describe("the quiet window (Sam: 'your call' — next watch change or 8 minutes)", () => {
  const out = () => escapeStep(escapeStep(escapeStep(newEscape(0, 2), EVENT.UNLOCK, at(0, 2)), EVENT.FIGHT, at(0, 2)), EVENT.WON, at(1000, 2))

  it("is 8 minutes", () => {
    expect(QUIET_WINDOW_MS).toBe(8 * 60 * 1000)
    expect(out().discoverBy).toBe(1000 + QUIET_WINDOW_MS)
  })

  it("ends at the next watch change, even early", () => {
    expect(discoveryDue(out(), 2000, 2)).toBe(false)
    expect(discoveryDue(out(), 2000, 3)).toBe(true)
  })

  it("ends when the clock runs out, even with no watch change", () => {
    expect(discoveryDue(out(), 1000 + QUIET_WINDOW_MS - 1, 2)).toBe(false)
    expect(discoveryDue(out(), 1000 + QUIET_WINDOW_MS, 2)).toBe(true)
  })

  it("counts down on the map", () => {
    expect(quietSecondsLeft(out(), 1000)).toBe(480)
    expect(quietBanner(out(), 1000 + 61000)).toBe("The watch changes in 6:59 — the body will be found")
    expect(quietBanner(newEscape(), 0)).toBeNull()
  })

  it("never fires outside the window", () => {
    expect(discoveryDue(newEscape(), 1e12, 99)).toBe(false)
  })
})

describe("the policy table", () => {
  it("covers every phase with every system", () => {
    const keys = Object.keys(policyFor(newEscape())).sort()
    for (const p of PHASES) expect(Object.keys(policyFor({ ...newEscape(), phase: p })).sort()).toEqual(keys)
  })

  it("no warnings or volleys once they are out", () => {
    for (const p of [PHASE.OUT_QUIET, PHASE.HUNTED, PHASE.FIGHT]) {
      const pol = policyFor({ ...newEscape(), phase: p })
      expect(pol.gateWarning).toBe(false)
      expect(pol.volleys).toBe(false)
      expect(pol.jorlanVisits).toBe(false)
      expect(pol.labor).toBe(false)
    }
  })

  it("the leaning guard only leans while the gate is locked", () => {
    expect(policyFor(newEscape()).leaningGuard).toBe(true)
    expect(policyFor({ ...newEscape(), phase: PHASE.UNLOCKED }).leaningGuard).toBe(false)
  })

  it("a missing or broken escape reads as held", () => {
    expect(policyFor(null)).toEqual(policyFor(newEscape()))
    expect(policyFor({ phase: "nonsense" } as never)).toEqual(policyFor(newEscape()))
  })
})

describe("Jorlan (Sam: 'Lead the hunt.')", () => {
  const hunted = { ...newEscape(), phase: PHASE.HUNTED }
  it("leads the hunt", () => { expect(jorlanStance(hunted)).toBe("hunt") })
  it("stands aside if he gave his word", () => {
    expect(jorlanStance(hunted, { pledged: true })).toBe("aside")
    expect(malacharLine(hunted, { pledged: true })).toMatch(/stands aside/)
  })
  it("still talks first while they are out quietly, knowing a guard is dead", () => {
    expect(jorlanStance({ ...newEscape(), phase: PHASE.OUT_QUIET })).toBe("talk_knows")
  })
})

describe("what Malachar is told", () => {
  it("names the dead once they are out", () => {
    const e = { ...newEscape(), phase: PHASE.OUT_QUIET }
    expect(malacharLine(e, { dead: ["the male gate guard"] })).toBe(
      "ESCAPE: out_quiet. The prisoners are OUT. They killed the gate watch and nobody alive knows yet; the next watch will find the body. Any drow who sees them knows exactly what happened. Dead: the male gate guard.")
  })
  it("does not leak deaths while they are still held", () => {
    expect(malacharLine(newEscape(), { dead: ["x"] })).not.toMatch(/Dead/)
  })
})

describe("old saves", () => {
  it("reads the run Sam played (brokeOut, battle over, gate open) as out quietly with a fresh window", () => {
    const e = escapeFromFlags({ gateOpen: true, doorShut: false, brokeOut: { why: "the ambush" }, battle: { over: 1, won: true } }, 100, 6)
    expect(e.phase).toBe(PHASE.OUT_QUIET)
    expect(e.discoverBy).toBe(100 + QUIET_WINDOW_MS)
    expect(e.atRotation).toBe(6)
  })
  it("a fight still running", () => {
    expect(escapeFromFlags({ battle: { over: null } }).phase).toBe(PHASE.FIGHT)
  })
  it("an unlocked gate nobody has used", () => {
    expect(escapeFromFlags({ gateOpen: true, doorShut: true }).phase).toBe(PHASE.UNLOCKED)
  })
  it("a locked pen", () => {
    expect(escapeFromFlags({}).phase).toBe(PHASE.HELD)
  })
  it("keeps a phase that is already there", () => {
    const e = { ...newEscape(), phase: PHASE.HUNTED }
    expect(escapeFromFlags({ escape: e, gateOpen: false })).toBe(e)
  })
})
