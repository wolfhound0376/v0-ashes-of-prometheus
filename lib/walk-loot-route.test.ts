// /api/walk-loot against a fake database: the landing chest's rolled potions (kept for the run) and eating ormu where
// it grows (Sam, 2026-11-23). Same fake-PostgREST pattern as lib/camp-haul-route.test.ts.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const writes: { table: string; op: string; row: Row }[] = []

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const chain = {
    select: () => chain,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
    in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), chain),
    is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), chain),
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (res: (x: { data: Row[]; error: null }) => void) => res({ data: rows(), error: null }),
    upsert: async (row: Row) => {
      const t = (tables[table] ??= []), i = t.findIndex((r) => r.campaign_id === row.campaign_id && r.key === row.key)
      const copy = JSON.parse(JSON.stringify(row)) as Row
      if (i >= 0) t[i] = copy; else t.push(copy)
      writes.push({ table, op: "upsert", row: copy })
      return { error: null }
    },
    update: (patch: Row) => {
      const u = { eq: (k: string, v: unknown) => { for (const r of tables[table] ?? []) if (r[k] === v) Object.assign(r, patch); writes.push({ table, op: "update", row: patch }); return Object.assign(Promise.resolve({ error: null }), u, { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) } }
      return u
    },
    insert: (row: Row) => {
      ;(tables[table] ??= []).push({ id: `${table}-${(tables[table] ?? []).length + 1}`, ...row })
      writes.push({ table, op: "insert", row })
      const done = { error: null, data: null }
      return Object.assign(Promise.resolve(done), { select: () => ({ maybeSingle: async () => done }) })
    },
  }
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fakeFrom }) }))

type LootRoute = typeof import("@/app/api/walk-loot/route")
let POST: LootRoute["POST"], GET: LootRoute["GET"]
beforeAll(async () => { ({ POST, GET } = await import("@/app/api/walk-loot/route")) })

const post = (body: unknown) => POST(new NextRequest("http://x/api/walk-loot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
const look = (container: string) => GET(new NextRequest(`http://x/api/walk-loot?container=${encodeURIComponent(container)}`))
const flag = () => (tables.world_flags ?? []).find((r) => r.key === "walk-loot")?.value as { taken?: Record<string, Record<string, number>>; rolls?: Record<string, Record<string, number>>; pockets?: Record<string, { slug: string }[]> } | undefined

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  writes.length = 0
  tables.characters = [{ id: "kenta", name: "Kenta" }]
  // stackable, so the container mints no parked rows (lib/floor-holder.ts rowsToMint) and the test stays on this route
  const item = (slug: string, name: string, properties: Row = {}) => ({ id: `it-${slug}`, slug, name, item_type: "misc", stackable: true, weight: 0.5, properties })
  tables.items = [
    item("ormu-moss", "Ormu", { eat_heal: "1d4" }),
    item("potion-of-healing", "Potion of Healing", { heal: "2d4+2" }),
    item("dagger", "Dagger"), item("thieves-tools", "Thieves' Tools"), item("drow-poison", "Drow Poison"),
  ]
})

describe("the landing chest's 1d4 potions of healing (Sam, 2026-11-23)", () => {
  it("are rolled the first time anyone looks, kept in the run's flag, and the same on every look after", async () => {
    const first = await (await look("pen-landing-chest")).json() as { rows: { slug: string; qty: number }[] }
    const n = first.rows.find((r) => r.slug === "potion-of-healing")?.qty ?? 0
    expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(4)
    expect(flag()?.rolls?.["pen-landing-chest"]?.["potion-of-healing"]).toBe(n)
    expect(first.rows.filter((r) => r.slug !== "potion-of-healing").map((r) => [r.slug, r.qty])).toEqual([["dagger", 1], ["thieves-tools", 2], ["drow-poison", 1]])
    const upserts = writes.filter((w) => w.op === "upsert").length
    for (let i = 0; i < 20; i++){
      const again = await (await look("pen-landing-chest")).json() as { rows: { slug: string; qty: number }[] }
      expect(again.rows.find((r) => r.slug === "potion-of-healing")?.qty).toBe(n)
    }
    expect(writes.filter((w) => w.op === "upsert").length).toBe(upserts)   // nothing re-rolled, nothing re-written
  })
})

describe("eating ormu where it grows (Sam, 2026-11-23: heals 1d4)", () => {
  it("takes one handful off the patch per eat, tells the DM, and refuses once the patch is bare", async () => {
    const a = await post({ action: "eat", characterId: "kenta", container: "pen-ormu", slug: "ormu-moss" })
    expect(a.status).toBe(200)
    expect(await a.json()).toMatchObject({ ok: true, ate: "Ormu", heal: "1d4", left: 1 })
    expect(flag()?.taken?.["pen-ormu"]?.["ormu-moss"]).toBe(1)
    expect((tables.dialogue ?? []).map((r) => r.text)).toEqual(["Kenta eats a handful of Ormu from glowing moss on the wet wall."])
    const b = await post({ action: "eat", characterId: "kenta", container: "pen-ormu", slug: "ormu-moss" })
    expect(await b.json()).toMatchObject({ ok: true, left: 0 })
    const c = await post({ action: "eat", characterId: "kenta", container: "pen-ormu", slug: "ormu-moss" })
    expect(c.status).toBe(409)
    expect(await c.json()).toMatchObject({ left: 0 })
    expect(flag()?.taken?.["pen-ormu"]?.["ormu-moss"]).toBe(2)
    // and nothing went into anyone's pack: eaten, not taken
    expect(tables.inventory_items ?? []).toEqual([])
    // the harvest sees the same bare patch
    const after = await (await look("pen-ormu")).json() as { rows: unknown[] }
    expect(after.rows).toEqual([])
  })

  it("refuses anything the catalogue does not say is eaten for healing, so it cannot empty a chest", async () => {
    const r = await post({ action: "eat", characterId: "kenta", container: "pen-landing-chest", slug: "potion-of-healing" })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toMatch(/not something to eat/)
    expect(flag()?.taken?.["pen-landing-chest"]).toBeUndefined()
  })

  it("needs a real character and a real container", async () => {
    expect((await post({ action: "eat", characterId: "nobody", container: "pen-ormu", slug: "ormu-moss" })).status).toBe(404)
    expect((await post({ action: "eat", characterId: "kenta", container: "no-such-place", slug: "ormu-moss" })).status).toBe(400)
  })
})

// A DEAD GUARD'S POCKETS ARE ON HIS BODY (Sam, 2026-11-23: "Yes").
describe("a dead guard's pockets on his body", () => {
  const BODY = "body:drow-guard-male:11-500-600", POCKET = "pocket:drow-guard-male:pen-545-702"
  const seedPocket = (taken: Record<string, number> = {}) => {
    tables.world_flags = [{ campaign_id: "ashes-of-prometheus", key: "walk-loot", value: {
      pockets: { [POCKET]: [{ slug: "potion-of-healing", qty: 1, note: "a stoppered vial" }, { slug: "slave-pen-key", qty: 1, note: "the key to the slave pen" }, { slug: "gold-coin", qty: 5, note: "in a coin purse" }] },
      taken: Object.keys(taken).length ? { [POCKET]: taken } : {},
    } }]
  }
  const lookBody = async (kill = "", pocket: string | null = POCKET) =>
    (await GET(new NextRequest(`http://x/api/walk-loot?container=${encodeURIComponent(BODY)}${kill ? `&kill=${kill}` : ""}${pocket ? `&pocket=${encodeURIComponent(pocket)}` : ""}`))).json() as Promise<{ rows: { slug: string; qty: number; from?: string }[]; ruined: { slug: string }[] }>
  const fromPocket = (rows: { slug: string; qty: number; from?: string }[]) => rows.filter((r) => r.from === POCKET).map((r) => [r.slug, r.qty])
  beforeEach(() => {
    tables.characters.push({ id: "fifi", name: "Fifi" })
    tables.items.push({ id: "it-key", slug: "slave-pen-key", name: "Slave pen key", item_type: "misc", stackable: true, weight: 0, properties: {} },
      { id: "it-gold", slug: "gold-coin", name: "Gold coin", item_type: "currency", stackable: true, weight: 0, properties: {} })
  })
  afterEach(() => vi.restoreAllMocks())

  it("shows what is still in his pockets on his body, without what was lifted before he died", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999)            // every d20 a 20: nothing breaks
    seedPocket({ "gold-coin": 2 })
    const b = await lookBody()
    expect(fromPocket(b.rows)).toEqual([["potion-of-healing", 1], ["slave-pen-key", 1], ["gold-coin", 3]])
    expect(b.rows.some((r) => r.slug === "shortsword" && !r.from)).toBe(true)   // his kit is still there too
  })

  it("a take off the body is a take from his pocket: one record, nothing there twice", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999)
    seedPocket()
    await lookBody()
    const r = await post({ action: "take", characterId: "kenta", container: BODY, slug: "potion-of-healing", from: POCKET })
    expect(r.status).toBe(200)
    expect(flag()?.taken?.[POCKET]?.["potion-of-healing"]).toBe(1)
    expect(flag()?.taken?.[BODY]).toBeUndefined()
    expect(fromPocket((await lookBody()).rows).map((x) => x[0])).not.toContain("potion-of-healing")
    const pocketRows = (await (await look(POCKET)).json() as { rows: { slug: string }[] }).rows.map((x) => x.slug)
    expect(pocketRows).not.toContain("potion-of-healing")
    expect((tables.dialogue ?? []).map((d) => d.text)).toContain("Kenta takes Potion of Healing from a body.")
  })

  it("the pen key off his body is the one pen key: no other guard offers one after", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999)
    seedPocket()
    await lookBody()
    expect((await post({ action: "take", characterId: "kenta", container: BODY, slug: "slave-pen-key", from: POCKET })).status).toBe(200)
    const other = await (await look("pocket:drow-guard-female:pen-600-700")).json() as { rows: { slug: string }[] }
    expect(other.rows.map((x) => x.slug)).not.toContain("slave-pen-key")
  })

  it("refuses a take that names a pocket the body does not hold", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999)
    seedPocket()
    await lookBody()
    const r = await post({ action: "take", characterId: "kenta", container: BODY, slug: "potion-of-healing", from: "pocket:drow-guard-male:p2-1-2" })
    expect(r.status).toBe(409)
    expect(flag()?.taken?.[POCKET]?.["potion-of-healing"]).toBeUndefined()
  })

  it("glass in his pockets rolls for breakage by how he died; keys and coins never break", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0)                // every d20 a 1: everything that can break, breaks
    seedPocket()
    const b = await lookBody("fire")
    expect(fromPocket(b.rows)).toEqual([["slave-pen-key", 1], ["gold-coin", 5]])
    expect(b.ruined.map((x) => x.slug)).toContain("potion-of-healing")
    expect(flag()?.pockets?.[POCKET]?.map((e: { slug: string }) => e.slug)).toEqual(["slave-pen-key", "gold-coin"])
  })

  it("is linked once and kept: a later look without the pocket id still shows it, and wear is not rolled again", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999)
    seedPocket()
    await lookBody()
    vi.spyOn(Math, "random").mockReturnValue(0)
    const again = await lookBody("", null)
    expect(fromPocket(again.rows)).toEqual([["potion-of-healing", 1], ["slave-pen-key", 1], ["gold-coin", 5]])
  })

  it("rolls the pockets of a guard nobody had looked at, at the moment his body is first seen", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999)
    tables.world_flags = []
    await lookBody()
    expect(Array.isArray(flag()?.pockets?.[POCKET])).toBe(true)
  })

  it("only a guard's own pockets: a named drow's body does not take a guard's pocket", async () => {
    seedPocket()
    const shoor = await (await GET(new NextRequest(`http://x/api/walk-loot?container=${encodeURIComponent("body:shoor:8")}&pocket=${encodeURIComponent(POCKET)}`))).json() as { rows: { from?: string }[] }
    expect(shoor.rows.some((r) => r.from)).toBe(false)
  })
})
