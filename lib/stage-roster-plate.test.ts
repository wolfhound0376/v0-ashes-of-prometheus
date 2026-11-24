import { describe, expect, it } from "vitest"
import { applyEventsTo, applyStageEvents, type Stage } from "./stage-roster"

// Sam, 2026-11-23, of a chuul that walked in behind the party in a room it was never called to:
// "why is there one of these guys behind". Who Malachar brings in is stamped with the party's walk plate.

const base = (): Stage => ({ area: null, present: {}, gone: {}, updatedAt: "t" })

describe("stage roster: a creature belongs to the room it was called into", () => {
  it("an arrival is stamped with the party's plate", () => {
    const s = applyEventsTo(base(), [{ kind: "arrive", name: "Chuul", hp: 93, hpMax: 93 }], "t1", Math.random, "ruins-flooded-crypt")
    expect(s.present.chuul.plate).toBe("ruins-flooded-crypt")
  })
  it("brought in again in another room, it is where the party is now", () => {
    const s = applyEventsTo(base(), [{ kind: "arrive", name: "Chuul" }], "t1", Math.random, "ruins-flooded-crypt")
    applyEventsTo(s, [{ kind: "arrive", name: "Chuul" }], "t2", Math.random, "ruins-great-hall")
    expect(s.present.chuul.plate).toBe("ruins-great-hall")
  })
  it("[NPC_MOVE:] moves it to the party's plate; an unknown plate keeps the one it had", () => {
    const s = applyEventsTo(base(), [{ kind: "arrive", name: "Quaggoth" }], "t1", Math.random, "11")
    applyEventsTo(s, [{ kind: "place", name: "Quaggoth", where: "at the bars" }], "t2", Math.random, null)
    expect(s.present.quaggoth.plate).toBe("11")
    applyEventsTo(s, [{ kind: "place", name: "Quaggoth", where: "by the door" }], "t3", Math.random, "12")
    expect(s.present.quaggoth.plate).toBe("12")
  })
  it("with no plate known it is left unstamped (shown wherever the party is, as before)", () => {
    const s = applyEventsTo(base(), [{ kind: "arrive", name: "Grick" }], "t1")
    expect(s.present.grick.plate).toBeNull()
  })
  it("leaving or dying keeps the room it was in", () => {
    const s = applyEventsTo(base(), [{ kind: "arrive", name: "Grick" }], "t1", Math.random, "ruins-great-hall")
    applyEventsTo(s, [{ kind: "leave", name: "Grick", dead: true }], "t2")
    expect(s.gone.grick.plate).toBe("ruins-great-hall")
  })
})

// A stand-in database: the stage row, the live run, and that run's walk_world row.
function fakeDb(start: Stage, plate: string | number | null) {
  let value: Stage = JSON.parse(JSON.stringify(start))
  const rows: Record<string, unknown> = {
    world_flags: { value },
    campaign_runs: { id: "run-84" },
    walk_world: plate === undefined ? null : { plate },
  }
  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ["select", "eq", "neq", "order", "limit"]) q[m] = () => q
    q.maybeSingle = async () => ({ data: table === "world_flags" ? { value } : rows[table], error: null })
    q.upsert = async (row: { value: Stage }) => { value = JSON.parse(JSON.stringify(row.value)); return { error: null } }
    return q
  }
  return { from: chain, get value() { return value } }
}

describe("applyStageEvents reads the party's plate from walk_world", () => {
  it("stamps an arrival with the live run's world plate", async () => {
    const db = fakeDb(base(), "ruins-great-hall")
    await applyStageEvents(db as never, [{ kind: "arrive", name: "Chuul", hp: 93, hpMax: 93 }])
    expect(db.value.present.chuul.plate).toBe("ruins-great-hall")
  })
  it("a numbered plate is kept as text", async () => {
    const db = fakeDb(base(), 11)
    await applyStageEvents(db as never, [{ kind: "arrive", name: "Quaggoth" }])
    expect(db.value.present.quaggoth.plate).toBe("11")
  })
  it("no world row yet: unstamped, nothing thrown", async () => {
    const db = fakeDb(base(), null)
    await applyStageEvents(db as never, [{ kind: "arrive", name: "Quaggoth" }])
    expect(db.value.present.quaggoth.plate).toBeNull()
  })
})
