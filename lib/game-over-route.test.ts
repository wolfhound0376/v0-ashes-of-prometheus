// /api/game-over with its helpers stood in: which game overs end the game (Sam, 2026-11-23: "Game over;
// automatically ends the game."), and that Mortal and non-Mortal still end it the way Sam ruled on 2026-11-23.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const calls: string[] = []
let save: { id: string; name: string; mortal: boolean } | null = null

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const chain = {
    select: () => chain,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
    neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), chain),
    or: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    insert: async (row: Row) => {
      const t = (tables[table] ??= [])
      if (table === "world_flags" && t.some((r) => r.key === row.key)) return { error: { code: "23505", message: "dup" } }
      t.push(row); calls.push(`insert ${table} ${String(row.key ?? "")}`); return { error: null }
    },
    update: () => ({ eq: async () => ({ error: null }) }),
    delete: () => { calls.push(`delete ${table}`); return { or: async () => ({ error: null }), eq: () => ({ eq: async () => ({ error: null }) }) } },
  }
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fakeFrom }) }))
vi.mock("@/lib/dm-session", () => ({ isDmRequest: () => false }))
vi.mock("@/lib/restart-campaign", () => ({ CAMPAIGN_ID: "abyss", restartCampaign: async () => { calls.push("restart"); return { ok: true, report: { run: { number: 8 } } } } }))
vi.mock("@/lib/seats", () => ({ readSeated: async () => [{ id: "c-fifi" }] }))
vi.mock("@/lib/table-store", () => ({
  readTable: async () => ({ status: "playing", session: 2 }),
  writeTable: async (_db: unknown, t: { status: string }) => { calls.push(`table ${t.status}`) },
  clearSeats: async () => { calls.push("clear seats") }, clearInvites: async () => { calls.push("clear invites") },
}))
vi.mock("@/lib/save-store", () => ({
  loadedSave: async () => save, headInPlay: async () => save,
  loadSave: async (_db: unknown, id: string) => { calls.push(`load ${id}`); return { ok: true } },
  startNewSave: async () => { calls.push("new save"); return { ok: true } },
}))

type Route = typeof import("@/app/api/game-over/route")
let POST: Route["POST"]
beforeAll(async () => { ({ POST } = await import("@/app/api/game-over/route")) })
const post = () => POST(new NextRequest("http://x/api/game-over", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ run: 7, characterId: "c-fifi", claimToken: "tok" }) }))

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  calls.length = 0
  tables.character_secrets = [{ character_id: "c-fifi", claim_token: "tok" }]
  tables.campaign_runs = [{ id: "run-7", run_number: 7, campaign_id: "abyss", status: "active" }]
  save = { id: "save-1", name: "Out of the Abyss — Nov 23", mortal: true }
})
const world = (state: Row) => { tables.walk_world = [{ campaign_run_id: "run-7", heroes: { fifi: { cid: "c-fifi" } }, state }] }

describe("POST /api/game-over: every game over ends the game", () => {
  it("the whole party down with nobody to pick them up ('fell'), in Mortal: the game is deleted and reset", async () => {
    world({ fallen: [], gameOver: { seq: "g1", why: "fell" } })
    const r = await post(); const j = await r.json()
    expect(r.status).toBe(200)
    expect(j).toMatchObject({ ok: true, outcome: "delete" })
    expect(calls).toEqual(expect.arrayContaining(["restart", "delete campaign_saves", "clear seats", "table closed", "new save"]))
    expect(tables.world_flags?.[0]).toMatchObject({ key: "game_over_wipe", note: "Game over (fell)" })
  })
  it("the same in a non-Mortal campaign: the table closes and the campaign goes back to its last save, nothing deleted", async () => {
    save = { id: "save-2", name: "Out of the Abyss — Nov 22", mortal: false }
    world({ fallen: [], gameOver: { seq: "g1", why: "fell" } })
    const j = await (await post()).json()
    expect(j).toMatchObject({ ok: true, outcome: "back" })
    expect(calls).toEqual(expect.arrayContaining(["table closed", "load save-2"]))
    expect(calls).not.toContain("delete campaign_saves")
    expect(calls).not.toContain("restart")
  })
  it("the march out in chains lost ends it too", async () => {
    world({ fallen: [], gameOver: { seq: "g2", why: "menzoberranzan" } })
    expect((await (await post()).json()).ok).toBe(true)
  })
  it("a table with no game over and nobody dead is not ended: nothing is touched", async () => {
    world({ fallen: [] })
    const r = await post()
    expect(r.status).toBe(409)
    expect(calls).toEqual([])
  })
})
