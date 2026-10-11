// The haul route against a fake database: what it writes, and what it refuses.
import { beforeEach, describe, expect, it, vi } from "vitest"

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const writes: { table: string; op: string; row: Row }[] = []

/** A tiny PostgREST stand-in: enough of the chain for this route. */
function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const q: Record<string, unknown> = {}
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const chain = {
    select: () => chain,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), chain),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), chain),
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (x: { data: Row[]; error: null }) => void) => res({ data: rows(), error: null }),
    update: (patch: Row) => ({
      eq: async (k: string, v: unknown) => {
        for (const r of tables[table] ?? []) if (r[k] === v) Object.assign(r, patch), writes.push({ table, op: "update", row: { ...r } })
        return { error: null }
      },
    }),
    insert: async (row: Row) => {
      ;(tables[table] ??= []).push({ id: `${table}-${(tables[table] ?? []).length + 1}`, ...row })
      writes.push({ table, op: "insert", row })
      return { error: null }
    },
  }
  void q
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fakeFrom }) }))

const { POST, GET } = await import("@/app/api/camp/haul/route")

function post(body: unknown) {
  return POST(new Request("http://x/api/camp/haul", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never)
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  writes.length = 0
  delete process.env.DM_ACCESS_CODE
  tables.characters = [
    { id: "fifi", name: "Fifi of Copperas Cove", is_player: true, archived_at: null },
    { id: "kenta", name: "Kenta", is_player: true, archived_at: null },
  ]
  tables.items = [
    { id: "it-trill", slug: "trillimac", name: "Trillimac", item_type: "consumable", weight: 0.5, value: 0, description: "A fungus." },
    { id: "it-meat", slug: "rothe-meat", name: "Rothé meat", item_type: "consumable", weight: 1, value: 0, description: null },
  ]
  tables.inventory_items = [{ id: "inv-1", character_id: "fifi", item_id: "it-trill", item_key: "trillimac", quantity: 2, confiscated_from: null }]
  tables.party_supplies = [{ id: "pool", supplies: 12 }]
  tables.campaign_runs = [{ id: "run-1", campaign_id: "abyss", status: "setup" }]
})

describe("POST /api/camp/haul", () => {
  it("a forage adds food to the pool, grows a stack, inserts a new catalog row, and rejects the invented", async () => {
    const res = await post({ who: "Fifi", mode: "forage", supplies_delta: 3, items: [{ slug: "trillimac", quantity: 2 }, { slug: "rothe-meat", quantity: 1 }, { slug: "moon-truffle", quantity: 4 }] })
    const j = await res.json()
    expect(res.status).toBe(200)
    expect(j.supplies).toBe(15)
    expect(j.who).toEqual({ id: "fifi", name: "Fifi of Copperas Cove" })
    expect(j.added).toEqual([{ slug: "trillimac", quantity: 2 }, { slug: "rothe-meat", quantity: 1 }])
    expect(j.rejected).toEqual([{ slug: "moon-truffle", quantity: 4, reason: "not in the catalog" }])
    expect(tables.inventory_items.find((r) => r.id === "inv-1")?.quantity).toBe(4)
    const inserted = writes.find((w) => w.table === "inventory_items" && w.op === "insert")?.row
    expect(inserted).toMatchObject({ character_id: "fifi", item_id: "it-meat", item_key: "rothe-meat", name: "Rothé meat", quantity: 1 })
    expect(tables.party_supplies[0].supplies).toBe(15)
  })

  it("a rest charges the pool and never below zero; a forage cannot charge it", async () => {
    await post({ who: "kenta", mode: "rest", supplies_delta: -20, items: [] })
    expect(tables.party_supplies[0].supplies).toBe(0)
    tables.party_supplies[0].supplies = 9
    const j = await (await post({ who: "kenta", mode: "hunt", supplies_delta: -4, items: [] })).json()
    expect(j.supplies).toBe(9)
    expect(j.flags.join(" ")).toContain("cannot take food away")
  })

  it("creates the pool on first use, keyed to the active run", async () => {
    tables.party_supplies = []
    const j = await (await post({ who: "Fifi", mode: "hunt", supplies_delta: 2, items: [] })).json()
    expect(j.supplies).toBe(2)
    expect(writes.find((w) => w.table === "party_supplies")?.row).toMatchObject({ campaign_id: "run-1", supplies: 2 })
  })

  it("refuses an unknown or ambiguous character and a bad shape", async () => {
    expect((await post({ who: "Ront", mode: "forage", supplies_delta: 1, items: [] })).status).toBe(404)
    expect((await post({ who: "Fifi", mode: "picnic", supplies_delta: 1, items: [] })).status).toBe(400)
    expect((await post({ mode: "forage", supplies_delta: 1, items: [] })).status).toBe(400)
  })

  it("is DM-gated when DM_ACCESS_CODE is set", async () => {
    process.env.DM_ACCESS_CODE = "open-sesame"
    expect((await post({ who: "Fifi", mode: "forage", supplies_delta: 1, items: [] })).status).toBe(403)
    const ok = await POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json", "x-dm-key": "open-sesame" }, body: JSON.stringify({ who: "Fifi", mode: "forage", supplies_delta: 1, items: [] }) }) as never)
    expect(ok.status).toBe(200)
  })
})

describe("GET /api/camp/haul", () => {
  it("returns the pool and each player's pack by slug, with the short names the camp page uses", async () => {
    const j = await (await GET()).json()
    expect(j.supplies).toBe(12)
    expect(j.pool_exists).toBe(true)
    expect(j.characters).toEqual([
      { id: "fifi", name: "Fifi of Copperas Cove", short: "Fifi" },
      { id: "kenta", name: "Kenta", short: "Kenta" },
    ])
    expect(j.packs).toEqual({ fifi: { trillimac: 2 } })
  })
})
