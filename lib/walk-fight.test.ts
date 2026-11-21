import { describe, expect, it } from "vitest"
import { CLAIM_QUIET_MS, FIGHT_STALE_MS, cleanBody, isHeld, isScenePlate, mayClaim, mayDrive, openDecision, type LiveFight } from "./walk-fight"

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
  it("a scene joins a held scene, and a held fight", () => {
    const scene = live(1000, { plate: "scene:11" })
    expect(openDecision(scene, 2000, "scene:11")).toEqual({ kind: "join", fight: scene })
    expect(openDecision(live(1000), 2000, "scene:11")).toEqual({ kind: "join", fight: live(1000) })
  })
  it("a fight outranks a scene: it ends the scene and takes the row", () => {
    expect(openDecision(live(1000, { plate: "scene:11" }), 2000, "11")).toEqual({ kind: "take", endStale: "f1" })
    expect(openDecision(live(1000, { plate: "scene:11" }), 2000, "9")).toEqual({ kind: "take", endStale: "f1" })
    expect(isScenePlate("scene:10b")).toBe(true)
    expect(isScenePlate("11")).toBe(false)
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

describe("a fight outlives a refresh (claim)", () => {
  it("may be claimed only once its authority has been quiet CLAIM_QUIET_MS", () => {
    const now = 1_000_000
    expect(mayClaim(live(now - 1000), now)).toBe(false)
    expect(mayClaim(live(now - CLAIM_QUIET_MS), now)).toBe(true)
    expect(mayClaim(live(now - CLAIM_QUIET_MS, { ended_at: at(now) }), now)).toBe(false)
    expect(mayClaim(null, now)).toBe(false)
  })
})
