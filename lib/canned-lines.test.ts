import { describe, it, expect, vi } from "vitest"
import { pickCannedLine } from "./canned-lines"

type Row = { text: string; speaker: string; trigger: string | null }

function fakeDb(rows: Row[] | null, error: unknown = null) {
  const calls: Record<string, unknown>[] = []
  const builder: Record<string, unknown> = {}
  const chain = (name: string) =>
    vi.fn((...args: unknown[]) => {
      calls.push({ [name]: args })
      return builder
    })
  Object.assign(builder, {
    select: chain("select"),
    eq: chain("eq"),
    order: chain("order"),
    limit: vi.fn((...args: unknown[]) => {
      calls.push({ limit: args })
      return Promise.resolve({ data: rows, error })
    }),
  })
  // `.limit()` ends the chain here, but a trigger filter adds an `.eq()` after
  // it in the builder, so make the thenable available throughout.
  ;(builder as { then?: unknown }).then = undefined
  const db = { from: vi.fn(() => builder) }
  return { db: db as never, calls, builder }
}

// The builder above resolves on .limit(); the real query puts .eq() before it,
// which matches the implementation's order. These tests assert the filters.

describe("pickCannedLine", () => {
  it("asks only for reusable rows — the rule is in the query, not the caller", async () => {
    const { db, calls } = fakeDb([{ text: "Step back.", speaker: "Drow Guard", trigger: "gate_warning" }])
    await pickCannedLine(db, { speaker: "Drow Guard" })
    const eqs = calls.filter((c) => "eq" in c).map((c) => (c.eq as unknown[]).join("="))
    expect(eqs).toContain("reusable=true")
    expect(eqs).toContain("speaker=Drow Guard")
  })

  it("filters by trigger when one is given", async () => {
    const { db, calls } = fakeDb([{ text: "Step back.", speaker: "Drow Guard", trigger: "gate_warning" }])
    await pickCannedLine(db, { speaker: "Drow Guard", trigger: "gate_warning" })
    const eqs = calls.filter((c) => "eq" in c).map((c) => (c.eq as unknown[]).join("="))
    expect(eqs).toContain("trigger=gate_warning")
  })

  it("returns one of the candidates", async () => {
    const rows = [
      { text: "Step back.", speaker: "Drow Guard", trigger: "gate_warning" },
      { text: "Away from the bars.", speaker: "Drow Guard", trigger: "gate_warning" },
    ]
    const { db } = fakeDb(rows)
    const got = await pickCannedLine(db, { speaker: "Drow Guard" }, () => 0.99)
    expect(got?.text).toBe("Away from the bars.")
  })

  it("varies — a guard with four warnings does not always say the first", async () => {
    const rows = ["a", "b", "c", "d"].map((t) => ({ text: t, speaker: "Drow Guard", trigger: "gate_warning" }))
    const { db } = fakeDb(rows)
    const first = await pickCannedLine(db, { speaker: "Drow Guard" }, () => 0)
    const last = await pickCannedLine(db, { speaker: "Drow Guard" }, () => 0.99)
    expect(first?.text).toBe("a")
    expect(last?.text).toBe("d")
  })

  it("skips excluded lines so a bark does not repeat twice running", async () => {
    const rows = [
      { text: "Step back.", speaker: "Drow Guard", trigger: "gate_warning" },
      { text: "Away from the bars.", speaker: "Drow Guard", trigger: "gate_warning" },
    ]
    const { db } = fakeDb(rows)
    const got = await pickCannedLine(db, { speaker: "Drow Guard", exclude: ["Step back."] }, () => 0)
    expect(got?.text).toBe("Away from the bars.")
  })

  it("returns null when everything is excluded", async () => {
    const { db } = fakeDb([{ text: "Step back.", speaker: "Drow Guard", trigger: "gate_warning" }])
    expect(await pickCannedLine(db, { speaker: "Drow Guard", exclude: ["Step back."] })).toBeNull()
  })

  it("returns null on an empty archive — the normal case early on", async () => {
    const { db } = fakeDb([])
    expect(await pickCannedLine(db, { speaker: "Drow Guard" })).toBeNull()
  })

  it("returns null, never throws, when the database errors", async () => {
    const { db } = fakeDb(null, { message: "relation does not exist" })
    expect(await pickCannedLine(db, { speaker: "Drow Guard" })).toBeNull()
  })

  it("returns null without querying when no speaker is given", async () => {
    const { db } = fakeDb([{ text: "x", speaker: "y", trigger: null }])
    expect(await pickCannedLine(db, { speaker: "  " })).toBeNull()
  })

  it("clamps the pool to something sane", async () => {
    const { db, calls } = fakeDb([{ text: "x", speaker: "Drow Guard", trigger: null }])
    await pickCannedLine(db, { speaker: "Drow Guard", pool: 5000 })
    expect(calls.find((c) => "limit" in c)?.limit).toEqual([50])
  })
})
