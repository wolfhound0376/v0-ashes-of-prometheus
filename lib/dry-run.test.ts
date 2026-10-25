import { describe, expect, it, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { READ_RPCS, dryBuilder, dryRun, newDryRunLog } from "./dry-run"

// A pretend Supabase client: one table, every builder method recorded, awaitable like PostgREST.
function fakeClient() {
  const calls: string[] = []
  const builder = (table: string) => {
    const b: Record<string, unknown> = {}
    const chain = (name: string) => (..._args: unknown[]) => { calls.push(`${table}.${name}`); return b }
    for (const m of ["select", "eq", "neq", "in", "order", "limit", "like", "is", "gt", "insert", "upsert", "update", "delete"]) b[m] = chain(m)
    b.maybeSingle = () => { calls.push(`${table}.maybeSingle`); return b }
    b.single = () => { calls.push(`${table}.single`); return b }
    b.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "real" }], error: null }).then(res)
    return b
  }
  const rpc = vi.fn((fn: string) => ({ then: (res: (v: unknown) => unknown) => Promise.resolve({ data: `rpc:${fn}`, error: null }).then(res) }))
  const client = { from: vi.fn(builder), rpc, auth: { getUser: () => "me" } }
  return { client: client as unknown as SupabaseClient, calls, rpc }
}

describe("dryRun", () => {
  it("lets reads through to the real client, chain and all", async () => {
    const { client, calls } = fakeClient()
    const db = dryRun(client)
    const r = await db.from("characters").select("id").eq("is_player", true).order("name").limit(1).maybeSingle()
    expect(r).toEqual({ data: [{ id: "real" }], error: null })
    expect(calls).toEqual(["characters.select", "characters.eq", "characters.order", "characters.limit", "characters.maybeSingle"])
  })

  it("swallows every write, keeps the chain, and resolves to an empty success", async () => {
    const { client, calls } = fakeClient()
    const log = newDryRunLog()
    const db = dryRun(client, log)
    const ins = await db.from("dialogue").insert({ text: "x" })
    const upd = await db.from("characters").update({ hp_current: 1 }).eq("id", "c1").select("id")
    const one = await db.from("roll_requests").insert({}).select("id").single()
    const del = await db.from("npc_encounters").delete().eq("name", "Jorlan")
    const up = await db.from("world_flags").upsert({ key: "k" }, { onConflict: "campaign_id,key" })
    expect(ins).toMatchObject({ data: [], error: null })
    expect(upd).toMatchObject({ data: [], error: null })
    expect(one).toMatchObject({ data: null, error: null })
    expect(del).toMatchObject({ data: [], error: null })
    expect(up).toMatchObject({ data: [], error: null })
    // Nothing reached the real builder past the table lookup.
    expect(calls.filter((c) => /insert|update|delete|upsert/.test(c))).toEqual([])
    expect(log.writes).toEqual([
      { table: "dialogue", op: "insert" },
      { table: "characters", op: "update" },
      { table: "roll_requests", op: "insert" },
      { table: "npc_encounters", op: "delete" },
      { table: "world_flags", op: "upsert" },
    ])
  })

  it("passes read-only rpcs and swallows the rest", async () => {
    const { client, rpc } = fakeClient()
    const log = newDryRunLog()
    const db = dryRun(client, log)
    expect(READ_RPCS.has("party_location_label")).toBe(true)
    const where = await db.rpc("party_location_label")
    expect(where).toEqual({ data: "rpc:party_location_label", error: null })
    const reset = await db.rpc("subnodal_reset_to_start", { p_slug: "x" })
    expect(reset).toMatchObject({ data: null, error: null })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(log.writes).toEqual([{ table: "rpc:subnodal_reset_to_start", op: "rpc" }])
  })

  it("leaves everything else on the client alone", () => {
    const { client } = fakeClient()
    const db = dryRun(client) as unknown as { auth: { getUser: () => string } }
    expect(db.auth.getUser()).toBe("me")
  })

  it("dryBuilder survives any chain and awaits cleanly", async () => {
    const b = dryBuilder() as unknown as { eq: (...a: unknown[]) => { select: () => { order: () => Promise<unknown> } } }
    const r = await b.eq("a", 1).select().order()
    expect(r).toMatchObject({ data: [], error: null, statusText: "dry-run" })
    const s = await (dryBuilder() as unknown as { select: () => { maybeSingle: () => Promise<unknown> } }).select().maybeSingle()
    expect(s).toMatchObject({ data: null, error: null })
  })
})
