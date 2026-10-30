import { describe, expect, it } from "vitest"
import { CEILING_MS, GRACE_MS, entryGoKey, entryKey, expectedOf, gate, msUntil } from "./entry"

const T0 = Date.parse("2026-10-29T20:00:00Z")
const LYNKES = { id: "a", name: "Lynkes" }, GANDALF = { id: "b", name: "Gandalf" }

describe("who the gate waits for", () => {
  it("is every seated player, but not the DM's companions or anyone he excused", () => {
    const seats = [{ ...LYNKES }, { ...GANDALF }, { id: "c", name: "Ront", dm: true }, { id: "d", name: "Fifi", away: true }]
    expect(expectedOf(seats)).toEqual([LYNKES, GANDALF])
  })
})

describe("the gate", () => {
  const base = { expected: [LYNKES, GANDALF], forcedAt: null, startedAt: T0 }

  it("stays shut while anyone is still waking", () => {
    const g = gate({ ...base, arrivedAt: { a: T0 + 40_000 }, now: T0 + 60_000 })
    expect(g.goAt).toBeNull()
    expect(g.waitingFor).toEqual([GANDALF])
    expect(g.arrived).toEqual([LYNKES])
  })

  it("opens for everyone a beat after the LAST one arrives — the DM included, so nobody walks in alone", () => {
    const g = gate({ ...base, arrivedAt: { a: T0 + 40_000, b: T0 + 95_000 }, now: T0 + 95_500 })
    expect(g).toMatchObject({ goAt: T0 + 95_000 + GRACE_MS, why: "all", waitingFor: [] })
  })

  it("opens when the DM says so, even with someone still waking", () => {
    const g = gate({ ...base, arrivedAt: {}, forcedAt: T0 + 30_000, now: T0 + 30_100 })
    expect(g).toMatchObject({ goAt: T0 + 30_000 + GRACE_MS, why: "dm" })
  })

  it("opens at once for a DM with nobody to wait for", () => {
    expect(gate({ expected: [], arrivedAt: {}, forcedAt: null, startedAt: T0, now: T0 + 5000 })).toMatchObject({ goAt: T0 + GRACE_MS, why: "alone" })
  })

  it("never waits past the ceiling for a player who never arrives (a closed laptop)", () => {
    expect(gate({ ...base, arrivedAt: { a: T0 }, now: T0 + CEILING_MS - 1 }).goAt).toBeNull()
    expect(gate({ ...base, arrivedAt: { a: T0 }, now: T0 + CEILING_MS })).toMatchObject({ goAt: T0 + CEILING_MS, why: "ceiling" })
  })
})

describe("keys and clocks", () => {
  it("keeps one row per arrival, scoped to the session, so last session's rows can't open this gate", () => {
    expect(entryKey(7, "a")).toBe("entry:7:a")
    expect(entryKey(8, "a")).not.toBe(entryKey(7, "a"))
    expect(entryGoKey(7)).toBe("entry-go:7")
  })
  it("counts down from the server's clock and never below zero", () => {
    expect(msUntil(null, T0)).toBeNull()
    expect(msUntil(T0 + 2000, T0)).toBe(2000)
    expect(msUntil(T0, T0 + 9000)).toBe(0)
  })
})
