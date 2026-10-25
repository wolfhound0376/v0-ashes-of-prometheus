import { describe, expect, it } from "vitest"
import { applyStageEvents, type Stage } from "./stage-roster"

// A one-row stand-in for world_flags: reads what was last upserted.
function fakeDb(start: Stage) {
  let value: Stage = JSON.parse(JSON.stringify(start))
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { value } }) }
  const db = {
    from: () => ({ ...q, upsert: async (row: { value: Stage }) => { value = JSON.parse(JSON.stringify(row.value)); return { error: null } } }),
    get value() { return value },
  }
  return db
}
const base = (): Stage => ({
  area: "Velkynvelve",
  present: { "drow-guard": { name: "Drow Guard", slug: "drow-guard", aliases: [], hp: 13, hpMax: 13, since: "t" } },
  gone: {},
  updatedAt: "t",
})

describe("stage roster: what killed them (Sam, 2026-10-25: necrotic kills wither to bones)", () => {
  it("a killing blow with a damage type puts the cause on the gone entry", async () => {
    const db = fakeDb(base())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyStageEvents(db as any, [{ kind: "leave", name: "Drow Guard", dead: true, cause: "necrotic" }])
    expect(db.value.gone["drow-guard"]).toMatchObject({ dead: true, cause: "necrotic", hp: 0 })
    expect(db.value.present["drow-guard"]).toBeUndefined()
  })

  it("a following [NPC_LEAVE:] with no type keeps the cause the blow set", async () => {
    const db = fakeDb(base())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyStageEvents(db as any, [
      { kind: "leave", name: "Drow Guard", dead: true, cause: "necrotic" },
      { kind: "leave", name: "Drow Guard", dead: true },
    ])
    expect(db.value.gone["drow-guard"].cause).toBe("necrotic")
  })

  it("an untyped kill and a walk-off carry no cause", async () => {
    const db = fakeDb(base())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyStageEvents(db as any, [{ kind: "leave", name: "Drow Guard", dead: true }])
    expect(db.value.gone["drow-guard"].cause).toBeNull()
    const db2 = fakeDb(base())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await applyStageEvents(db2 as any, [{ kind: "leave", name: "Drow Guard", dead: false, cause: "necrotic" }])
    expect(db2.value.gone["drow-guard"].cause).toBeNull()
  })
})
