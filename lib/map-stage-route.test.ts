import { beforeEach, describe, expect, it, vi } from "vitest"
import type { NextRequest } from "next/server"

// End-to-end test of the DM watch write path through the ACTUAL route handler (2026-10-30).
//
// lib/stage-roster-watch-write.test.ts covers the pure parsing. This covers the wiring the pure test cannot see:
// the DM key check, the Supabase round-trip (readStage → applyEventsTo → writeStage → readStage), and the thing
// the whole PR exists for — that pressing the button three times actually persists three rotations and brings
// Jorlan on. The bug being fixed was never in the logic; it was that nothing called it. So the wiring is the part
// worth testing.
//
// The admin client is a hand-rolled fake over one `world_flags` row, matching the two shapes stage-roster uses:
//   readStage:  .from("world_flags").select("value").eq(..).eq(..).maybeSingle()
//   writeStage: .from("world_flags").upsert(row, { onConflict })

let store: Record<string, unknown> | null = null
let upsertCalls = 0

function fakeAdmin() {
  return {
    from(table: string) {
      if (table !== "world_flags") throw new Error(`unexpected table: ${table}`)
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: store ? { value: store } : null, error: null }),
        upsert: async (row: { value: unknown }) => {
          upsertCalls++
          // round-trips through JSON the way jsonb does, so nothing survives by object identity
          store = JSON.parse(JSON.stringify(row.value))
          return { error: null }
        },
      }
      return chain
    },
  }
}

// vi.mock is hoisted above the imports by vitest, so the route's own `createAdminClient` is already
// the fake by the time this static import is evaluated — no top-level await needed (and top-level
// await would break `tsc` under this tsconfig's module setting).
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin() }))

import { POST } from "@/app/api/map-stage/route"

const DM_KEY = "gloom-tallow-hush-193"

const req = (body: unknown, key: string | null = DM_KEY) =>
  ({
    headers: { get: (h: string) => (h === "x-dm-key" && key !== null ? key : null) },
    json: async () => {
      if (typeof body === "string" && body === "__BAD_JSON__") throw new Error("bad json")
      return body
    },
  }) as unknown as NextRequest

beforeEach(() => {
  store = null
  upsertCalls = 0
  process.env.DM_ACCESS_CODE = DM_KEY
})

describe("POST /api/map-stage — who may change the watch", () => {
  it("refuses with no DM key", async () => {
    const res = await POST(req({ watch: "changing" }, null))
    expect(res.status).toBe(403)
    expect(upsertCalls).toBe(0)
  })

  it("refuses with the wrong DM key", async () => {
    const res = await POST(req({ watch: "changing" }, "not-the-key"))
    expect(res.status).toBe(403)
    expect(upsertCalls).toBe(0)
  })

  // The guard is `!!required &&` — without the env var set, every request must be refused rather than
  // every request being allowed. Worth pinning: the fail-open version of this line is a one-character change.
  it("refuses everything when DM_ACCESS_CODE is not configured", async () => {
    delete process.env.DM_ACCESS_CODE
    const res = await POST(req({ watch: "changing" }))
    expect(res.status).toBe(403)
    expect(upsertCalls).toBe(0)
  })

  it("accepts a key typed in a different shape (normalised)", async () => {
    const res = await POST(req({ watch: "changing" }, "  GLOOM_TALLOW HUSH.193  "))
    expect(res.status).toBe(200)
  })
})

describe("POST /api/map-stage — what it refuses to write", () => {
  it("400s on unreadable JSON and writes nothing", async () => {
    const res = await POST(req("__BAD_JSON__"))
    expect(res.status).toBe(400)
    expect(upsertCalls).toBe(0)
  })

  it("400s on an unknown word and writes nothing", async () => {
    const res = await POST(req({ watch: "sleepy" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/unknown watch state/) })
    expect(upsertCalls).toBe(0)
  })

  it("400s on an empty body and writes nothing", async () => {
    const res = await POST(req({}))
    expect(res.status).toBe(400)
    expect(upsertCalls).toBe(0)
  })
})

describe("POST /api/map-stage — the rotation actually persists", () => {
  it("one press changes the watch and counts one rotation", async () => {
    const res = await POST(req({ watch: "changing" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.watch.state).toBe("changing")
    expect(body.rotations).toBe(1)
    expect(upsertCalls).toBe(1)
    // and it is in the store, not just in the reply
    expect((store as { rotations: number }).rotations).toBe(1)
  })

  // The bug, as a test. Before this route existed the live game sat at rotations 0 for a whole run.
  it("three presses bring Jorlan on duty, whichever rotation was rolled", async () => {
    let last: { rotations: number; jorlanOnDuty: boolean } | null = null
    for (let i = 0; i < 3; i++) last = await (await POST(req({ watch: "changing" }))).json()
    expect(last!.rotations).toBe(3)
    expect(last!.jorlanOnDuty).toBe(true)              // jorlanAt is 2 or 3; by 3 he is on either way
    expect((store as { jorlanAt: number }).jorlanAt).toBeGreaterThanOrEqual(2)
    expect((store as { jorlanAt: number }).jorlanAt).toBeLessThanOrEqual(3)
  })

  it("jorlanOnDuty is false before the rolled rotation is reached", async () => {
    const first = await (await POST(req({ watch: "changing" }))).json()
    expect(first.rotations).toBe(1)
    expect(first.jorlanOnDuty).toBe(false)             // jorlanAt is never 1
  })

  it("posted and unattended move the watch without counting a rotation", async () => {
    await POST(req({ watch: "changing" }))
    const posted = await (await POST(req({ watch: "posted" }))).json()
    expect(posted.watch.state).toBe("posted")
    expect(posted.rotations).toBe(1)
    const empty = await (await POST(req({ watch: "unattended" }))).json()
    expect(empty.watch.state).toBe("unattended")
    expect(empty.rotations).toBe(1)
  })

  it("moves the gate without touching the watch", async () => {
    const body = await (await POST(req({ gate: "open" }))).json()
    expect(body.gate.state).toBe("open")
    expect(body.watch).toBeNull()
    expect(body.rotations).toBe(0)
  })

  it("takes watch and gate in one press", async () => {
    const body = await (await POST(req({ watch: "changing", gate: "open" }))).json()
    expect(body.watch.state).toBe("changing")
    expect(body.gate.state).toBe("open")
    expect(body.rotations).toBe(1)
  })

  // A rotation must not wipe who is on stage — the prisoners and the ooze stay where Malachar put them.
  it("leaves the rest of the stage alone", async () => {
    store = {
      area: "Velkynvelve",
      present: { buppido: { name: "Buppido", slug: "buppido", aliases: [], hp: 13, hpMax: 13, since: "t0" } },
      gone: {}, watch: null, gate: null, rotations: 0, jorlanAt: null, updatedAt: "t0",
    }
    await POST(req({ watch: "changing" }))
    const s = store as { area: string; present: Record<string, { name: string }> }
    expect(s.area).toBe("Velkynvelve")
    expect(s.present.buppido.name).toBe("Buppido")
  })
})
