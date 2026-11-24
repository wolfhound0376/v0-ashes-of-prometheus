// /api/walk-loot against a fake database: the landing chest's rolled potions (kept for the run) and eating ormu where
// it grows (Sam, 2026-11-23). Same fake-PostgREST pattern as lib/camp-haul-route.test.ts.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
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
const flag = () => (tables.world_flags ?? []).find((r) => r.key === "walk-loot")?.value as { taken?: Record<string, Record<string, number>>; rolls?: Record<string, Record<string, number>> } | undefined

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
