// Heroic Inspiration: when the roll panel offers the reroll, and the spend route against a fake database.
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { offerReroll, rerollLogLine, rerollNote } from "@/lib/heroic-inspiration"

describe("offerReroll — BG3: a failed check, and Inspiration this browser may spend", () => {
  const base = { hasInspiration: true, success: false, rerolled: false, canSpend: true }
  it("offers on a failure with Inspiration", () => expect(offerReroll(base)).toBe(true))
  it("never on a success: you must keep the new roll, so it could only lose it", () =>
    expect(offerReroll({ ...base, success: true })).toBe(false))
  it("not without Inspiration", () => expect(offerReroll({ ...base, hasInspiration: false })).toBe(false))
  it("one reroll per die", () => expect(offerReroll({ ...base, rerolled: true })).toBe(false))
  it("not from a browser that cannot spend it (someone else's character)", () =>
    expect(offerReroll({ ...base, canSpend: false })).toBe(false))
})

describe("the words", () => {
  it("the log keeps both dice, the second standing", () => {
    expect(rerollLogLine("Athletics: 9 (1d20+2 → [7] +2)", "Athletics (Inspiration): 18 (1d20+2 → [16] +2)"))
      .toBe("Athletics: 9 (1d20+2 → [7] +2) — Heroic Inspiration, rerolled: Athletics (Inspiration): 18 (1d20+2 → [16] +2)")
  })
  it("Malachar is told it was spent", () => expect(rerollNote("Fifi")).toContain("Heroic Inspiration"))
})

// --- the route, against a PostgREST stand-in ----------------------------------

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}

function fakeFrom(table: string) {
  const filters: ((r: Row) => boolean)[] = []
  const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
  const chain = {
    select: () => chain,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), chain),
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    update: (patch: Row) => {
      const where: ((r: Row) => boolean)[] = []
      const u = {
        eq: (k: string, v: unknown) => (where.push((r) => r[k] === v), u),
        select: async () => {
          const hit = (tables[table] ?? []).filter((r) => where.every((f) => f(r)))
          for (const r of hit) Object.assign(r, patch)
          return { data: hit.map((r) => ({ id: r.id, name: r.name })), error: null }
        },
      }
      return u
    },
  }
  return chain
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: fakeFrom }) }))
let POST: (req: Request) => Promise<Response>
beforeAll(async () => {
  ;({ POST } = await import("@/app/api/inspiration/spend/route"))
})

function spend(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request("http://x/api/inspiration/spend", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }))
}

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k]
  delete process.env.DM_ACCESS_CODE
  tables.characters = [
    { id: "fifi", name: "Fifi", sheet_heroic_inspiration: true },
    { id: "kenta", name: "Kenta", sheet_heroic_inspiration: false },
  ]
  tables.character_secrets = [
    { character_id: "fifi", claim_token: "fifi-token" },
    { character_id: "kenta", claim_token: "kenta-token" },
  ]
})

describe("POST /api/inspiration/spend", () => {
  it("spends it for the player who holds the claim", async () => {
    const r = await spend({ characterId: "fifi", claimToken: "fifi-token" })
    expect(r.status).toBe(200)
    expect(tables.characters[0].sheet_heroic_inspiration).toBe(false)
  })

  it("spends it once: a second press is told it is gone, never a free reroll", async () => {
    expect((await spend({ characterId: "fifi", claimToken: "fifi-token" })).status).toBe(200)
    const again = await spend({ characterId: "fifi", claimToken: "fifi-token" })
    expect(again.status).toBe(409)
  })

  it("refuses someone else's claim, and leaves the Inspiration where it was", async () => {
    const r = await spend({ characterId: "fifi", claimToken: "kenta-token" })
    expect(r.status).toBe(403)
    expect(tables.characters[0].sheet_heroic_inspiration).toBe(true)
  })

  it("refuses with no claim at all", async () => {
    expect((await spend({ characterId: "fifi" })).status).toBe(403)
  })

  it("409 when the character has none", async () => {
    expect((await spend({ characterId: "kenta", claimToken: "kenta-token" })).status).toBe(409)
  })

  it("lets the DM spend it for a character", async () => {
    process.env.DM_ACCESS_CODE = "open-sesame"
    const r = await spend({ characterId: "fifi" }, { "x-dm-key": "open-sesame" })
    expect(r.status).toBe(200)
    expect(tables.characters[0].sheet_heroic_inspiration).toBe(false)
  })

  it("a wrong DM key is no key", async () => {
    process.env.DM_ACCESS_CODE = "open-sesame"
    expect((await spend({ characterId: "fifi" }, { "x-dm-key": "nope" })).status).toBe(403)
  })

  it("rejects a request without a character", async () => {
    expect((await spend({ claimToken: "fifi-token" })).status).toBe(400)
  })
})
