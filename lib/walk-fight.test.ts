import { describe, expect, it } from "vitest"
import { FIGHT_STALE_MS, cleanBody, isHeld, mayDrive, openDecision, type LiveFight } from "./walk-fight"

const at = (ms: number) => new Date(ms).toISOString()
const live = (seen: number, extra: Partial<LiveFight> = {}): LiveFight => ({ id: "f1", plate: "11", auth_key: "dm", auth_seen: at(seen), started_at: at(seen), ended_at: null, ...extra })

describe("one fight per run", () => {
  it("joins a fight whose authority is ticking", () => {
    expect(openDecision(live(1000), 2000)).toEqual({ kind: "join", fight: live(1000) })
  })
  it("takes a fight whose authority went quiet, ending the old one", () => {
    expect(openDecision(live(0), FIGHT_STALE_MS + 1)).toEqual({ kind: "take", endStale: "f1" })
  })
  it("takes when there is none", () => {
    expect(openDecision(null, 5)).toEqual({ kind: "take", endStale: null })
  })
  it("an ended fight is not held", () => {
    expect(isHeld(live(1000, { ended_at: at(1500) }), 1600)).toBe(false)
  })
})

describe("only the authority drives", () => {
  it("ticks from the authority only", () => {
    expect(mayDrive(live(0), "dm")).toBe(true)
    expect(mayDrive(live(0), "someone-else")).toBe(false)
    expect(mayDrive(live(0, { ended_at: at(1) }), "dm")).toBe(false)
    expect(mayDrive(null, "dm")).toBe(false)
  })
})

describe("bodies", () => {
  it("must be objects of sane size", () => {
    expect(cleanBody({ a: 1 }).ok).toBe(true)
    expect(cleanBody([1]).ok).toBe(false)
    expect(cleanBody(null).ok).toBe(false)
    expect(cleanBody({ s: "x".repeat(300_000) }).ok).toBe(false)
  })
})
