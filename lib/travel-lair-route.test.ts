// /api/travel action "lair" against a fake database: searching an ambushers' lair on the road (OotA ch.2 p.32;
// Sam, 2026-11-25: "Build it there"). Same fake-PostgREST pattern as lib/walk-loot-route.test.ts.
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
    update: (patch: Row) => ({
      eq: async (k: string, v: unknown) => { for (const r of tables[table] ?? []) if (r[k] === v) Object.assign(r, JSON.parse(JSON.stringify(patch))); writes.push({ table, op: "update", row: patch }); return { error: null } },
    }),
    insert: async (row: Row) => { (tables[table] ??= []).push({ id: `${table}-${(tables[table] ?? []).length + 1}`, ...row }); writes.push({ table, op: "insert", row }); return { error: null } },
  }
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fakeFrom }) }))
vi.mock("@/lib/travel/leader-store", () => ({
  activeRunId: async () => "run-1",
  readLeader: async () => ({ leader: null, host: null, votes: {} }),
  roster: async () => [{ id: "sarith", name: "Sarith" }, { id: "freia", name: "Freía" }],
}))
vi.mock("@/lib/worn-gear-rows", () => ({ dressRows: async (_db: unknown, rows: unknown[]) => rows, dressRow: async (_db: unknown, row: unknown) => row }))

type TravelRoute = typeof import("@/app/api/travel/route")
let POST: TravelRoute["POST"]
beforeAll(async () => { delete process.env.DM_ACCESS_CODE; ({ POST } = await import("@/app/api/travel/route")) })

const post = (body: unknown) => POST(new NextRequest("http://x/api/travel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
const sheet = (id: string, name: string, int: number, wis: number) => ({ id, name, level: 3, str_score: 10, dex_score: 10, con_score: 10, int_score: int, wis_score: wis, cha_score: 10, proficiency_bonus: 2, passive_perception: 10, sheet_skill_proficiencies: {} })
const AMBUSH_ROLLS = [{ table_key: "underdark_random", result: "Creature" }, { table_key: "underdark_creature", result: "Ambushers", detail: { rolls: ["underdark_ambush"] } }, { table_key: "underdark_ambush", result: "Grick", detail: { bestiary: "Grick", count: "1d4" } }]
const arrival = (outcome: Row) => ({ id: "arr-1", halted: true, resolved_at: null, outcome: { kind: "encounter", rolls: AMBUSH_ROLLS, meeting: { first: "party", surprised: null }, foes: [{ result: "Grick", table_key: "underdark_ambush" }], ...outcome } })
// Math.random, in the order the route draws: the search check's d20, the table's d20, then the catalog pick.
function dice(...rs: number[]) { const q = [...rs]; vi.spyOn(Math, "random").mockImplementation(() => (q.length ? q.shift()! : 0)) }

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  writes.length = 0
  tables.characters = [sheet("sarith", "Sarith", 16, 10), sheet("freia", "Freía", 10, 12)]
  tables.encounter_table_rows = [
    { table_key: "underdark_discovery", roll_min: 1, roll_max: 10, result: "Nothing", detail: {} },
    { table_key: "underdark_discovery", roll_min: 11, roll_max: 12, result: "A corpse clutching a salvageable nonmagical weapon", detail: {} },
    { table_key: "underdark_discovery", roll_min: 13, roll_max: 14, result: "A corpse wearing a salvageable suit of nonmagical armour", detail: {} },
    { table_key: "underdark_discovery", roll_min: 15, roll_max: 17, result: "1d6 gems worth 50 gp each", detail: { count: "1d6", value_gp: 50 } },
    { table_key: "underdark_discovery", roll_min: 18, roll_max: 19, result: "A corpse carrying a random magic item (DMG Table B)", detail: { dmg_table: "B" } },
    { table_key: "underdark_discovery", roll_min: 20, roll_max: 20, result: "A hoard: 2d6 50 gp gems and 1d4 rolls on DMG Table C", detail: { dmg_table: "C" } },
  ]
  tables.items = [{ id: "it-dagger", slug: "dagger", name: "Dagger", item_type: "weapon", rarity: "common", value: 2, description: "A dagger.", icon_url: null, equippable_slot: "main_hand", weight: 1 }]
})
afterEach(() => vi.restoreAllMocks())

describe("searching an ambushers' lair on the road", () => {
  it("after slipping past: the best eye searches, the book's d20 is rolled, and the find goes into that hero's pack from the catalog", async () => {
    tables.travel_arrivals = [arrival({ stance: { outcome: "passed" } })]
    dice(0.99, 0.5, 0)                                       // check d20 = 20; table d20 = 11 (a weapon); the catalog's first weapon
    const res = await post({ action: "lair" })
    const out = await res.json() as { ok: boolean; lair: { searcher: string; skill: string; face: number; awarded: { name: string }[] } }
    expect(res.status).toBe(200)
    expect(out.lair.searcher).toBe("Sarith")                 // INT 16: Investigation +3 beats Freía's Perception +1
    expect(out.lair.skill).toBe("investigation")
    expect(out.lair.face).toBe(11)
    expect(out.lair.awarded).toEqual([{ name: "Dagger", quantity: 1 }])
    const ins = writes.find((w) => w.table === "inventory_items")?.row
    expect(ins).toMatchObject({ character_id: "sarith", name: "Dagger", item_id: "it-dagger", quantity: 1 })
    expect((tables.travel_arrivals[0].outcome as Row).lair).toBeTruthy()   // kept on the encounter
  })

  it("is searched once: a second search gets the first one's find back and writes nothing", async () => {
    tables.travel_arrivals = [arrival({ stance: { outcome: "fight" } })]
    dice(0.99, 0.99)                                          // a hoard: the DM's pick, nothing awarded
    const first = await (await post({ action: "lair" })).json() as { lair: { dm_picks: string | null; awarded: unknown[] } }
    expect(first.lair.dm_picks).toMatch(/Table C/)
    expect(first.lair.awarded).toEqual([])
    const n = writes.length
    const again = await post({ action: "lair" })
    expect(again.status).toBe(409)
    expect(((await again.json()) as { lair: unknown }).lair).toEqual(first.lair)
    expect(writes.length).toBe(n)
  })

  it("is refused before the party has answered, after a parley, and where the dice named no Ambushers", async () => {
    tables.travel_arrivals = [arrival({})]
    expect((await post({ action: "lair" })).status).toBe(409)
    tables.travel_arrivals = [arrival({ stance: { outcome: "parley" } })]
    expect((await post({ action: "lair" })).status).toBe(409)
    tables.travel_arrivals = [arrival({ stance: { outcome: "passed" }, rolls: [{ table_key: "underdark_creature", result: "Drow" }] })]
    expect((await post({ action: "lair" })).status).toBe(409)
    expect(writes.length).toBe(0)
  })

  it("a failed search is a dead end: no d20 on the table, nothing awarded", async () => {
    tables.travel_arrivals = [arrival({ stance: { outcome: "passed" } })]
    dice(0)                                                   // check d20 = 1: 1 + 3 = 4 vs DC 15
    const out = await (await post({ action: "lair" })).json() as { lair: { face: number | null; awarded: unknown[]; note: string } }
    expect(out.lair.face).toBeNull()
    expect(out.lair.awarded).toEqual([])
    expect(writes.filter((w) => w.table === "inventory_items")).toEqual([])
  })
})
