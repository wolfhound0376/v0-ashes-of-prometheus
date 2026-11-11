import { describe, expect, it } from "vitest"
import { FIGHT_HANDOVER_MS, FIGHT_HANDOVER_STEP_MS, FIGHT_LOST_MS, FIGHT_STALE_MS, cleanBody, handoverOrder, isHeld, mayDrive, mayEndLost, openDecision, tableMissing, takeDecision, type LiveFight } from "./walk-fight"
import type { Seat } from "./walk-world"

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

// A FIGHT SURVIVES ITS SCREEN
const seat = (at: number, n: number | null, dm = false): Seat => ({ at, slug: null, cid: dm ? null : "c" + n, dm, seat: n, digest: "", version: 0, status: "in-step" })
describe("the hand-over", () => {
  const T = 1_000_000
  const table = { fifi: seat(T, 1), kenta: seat(T, 2), samson: seat(T, 3) }
  it("offers the fight in One World's order: the DM, then the lowest seat; the screen that went quiet last", () => {
    expect(handoverOrder(table, "fifi", T)).toEqual(["kenta", "samson", "fifi"])
    expect(handoverOrder({ ...table, dm: seat(T, null, true) }, "kenta", T)).toEqual(["dm", "fifi", "samson", "kenta"])
    expect(handoverOrder({ ...table, kenta: seat(T - 60_000, 2) }, "fifi", T)).toEqual(["samson", "fifi"])   // a seat that is not connected is not in it
    expect(handoverOrder(null, "fifi", T)).toEqual([])
  })
  it("never hands over a fight that is ticking", () => {
    const d = takeDecision(live(T - FIGHT_HANDOVER_MS + 1, { auth_key: "fifi" }), "kenta", table, T)
    expect(d).toMatchObject({ ok: false, why: "held" })
  })
  it("gives a quiet fight to the first in line, and to the next only a step later", () => {
    const f = (quiet: number) => live(T - quiet, { auth_key: "fifi" })
    expect(takeDecision(f(FIGHT_HANDOVER_MS), "kenta", table, T)).toEqual({ ok: true })
    expect(takeDecision(f(FIGHT_HANDOVER_MS), "samson", table, T)).toMatchObject({ ok: false, why: "wait", waitMs: FIGHT_HANDOVER_STEP_MS })
    expect(takeDecision(f(FIGHT_HANDOVER_MS + FIGHT_HANDOVER_STEP_MS), "samson", table, T)).toEqual({ ok: true })
    // the screen that went quiet may have it back (it reloaded), after everyone who never left
    expect(takeDecision(f(FIGHT_HANDOVER_MS + FIGHT_HANDOVER_STEP_MS), "fifi", table, T)).toMatchObject({ ok: false, why: "wait" })
    expect(takeDecision(f(FIGHT_HANDOVER_MS + 2 * FIGHT_HANDOVER_STEP_MS), "fifi", table, T)).toEqual({ ok: true })
    // alone at the table, it is first
    expect(takeDecision(f(FIGHT_HANDOVER_MS), "fifi", { fifi: seat(T, 1) }, T)).toEqual({ ok: true })
    // a caller One World does not know waits behind everyone it does
    expect(takeDecision(f(FIGHT_HANDOVER_MS + 2 * FIGHT_HANDOVER_STEP_MS), "stranger", table, T)).toMatchObject({ ok: false, why: "wait" })
  })
  it("has nothing to hand over once the fight has ended", () => {
    expect(takeDecision(live(0, { ended_at: at(5) }), "kenta", table, T)).toMatchObject({ ok: false, why: "ended" })
    expect(takeDecision(null, "kenta", table, T)).toMatchObject({ ok: false, why: "ended" })
  })
  it("lets a fight nobody carried be ended, never a ticking one", () => {
    expect(mayEndLost(live(T - FIGHT_LOST_MS), T)).toBe(true)
    expect(mayEndLost(live(T - FIGHT_LOST_MS + 1), T)).toBe(false)
    expect(mayEndLost(live(0, { ended_at: at(1) }), T)).toBe(false)
  })
})

describe("the tables are not there", () => {
  it("knows PostgREST's own words for it", () => {
    expect(tableMissing({ code: "PGRST205", message: "Could not find the table 'public.walk_fights' in the schema cache" })).toBe(true)
    expect(tableMissing("PGRST205 Could not find the table 'public.walk_fights' in the schema cache")).toBe(true)
    expect(tableMissing({ code: "42P01", message: 'relation "public.walk_fights" does not exist' })).toBe(true)
    expect(tableMissing({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false)
    expect(tableMissing(null)).toBe(false)
  })
})
