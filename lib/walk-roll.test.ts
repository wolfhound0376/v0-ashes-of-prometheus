import { readFileSync } from "node:fs"
import vm from "node:vm"
import { describe, expect, it } from "vitest"
import {
  WALK_ACTIONS,
  isWalkActionKey,
  parseWalkRollRequest,
  walkCheckModifier,
  walkRollMessage,
  walkVerdict,
} from "@/lib/walk-roll"

// A level-1 rogue-shaped row: DEX 16 (+3), STR 10 (+0), proficiency +2.
const rogue = {
  id: "c1", name: "Fifi", level: 1, proficiency_bonus: 2,
  str_score: 10, dex_score: 16, con_score: 12, int_score: 12, wis_score: 10, cha_score: 14,
  sheet_skill_proficiencies: { Stealth: "expertise", Athletics: "proficient" },
  sheet_proficiencies: { tools: ["Thieves' Tools"] },
}

describe("walkCheckModifier — the dashboard's maths", () => {
  it("tool check: ability modifier + proficiency when the sheet lists the tool", () => {
    expect(walkCheckModifier(rogue, WALK_ACTIONS["pen-gate:pick"].check)).toEqual({ modifier: 5, proficient: true })
  })
  it("tool check without the tool: the bare ability modifier", () => {
    const noTools = { ...rogue, sheet_proficiencies: { tools: [] } }
    expect(walkCheckModifier(noTools, WALK_ACTIONS["pen-gate:pick"].check)).toEqual({ modifier: 3, proficient: false })
  })
  it("tool names match loosely, as lib/repair hasTool does", () => {
    const spelled = { ...rogue, sheet_proficiencies: { tools: ["thieves tools"] } }
    expect(walkCheckModifier(spelled, WALK_ACTIONS["pen-gate:pick"].check).modifier).toBe(5)
  })
  it("skill check: proficient adds the bonus once", () => {
    expect(walkCheckModifier(rogue, WALK_ACTIONS["pen-gate:force"].check)).toEqual({ modifier: 2, proficient: true })
  })
  it("skill check: unproficient is the ability modifier alone", () => {
    const plain = { ...rogue, sheet_skill_proficiencies: {} }
    expect(walkCheckModifier(plain, WALK_ACTIONS["pen-gate:force"].check)).toEqual({ modifier: 0, proficient: false })
  })
  it("a missing score is 10, never a guess", () => {
    expect(walkCheckModifier({ id: "x", name: "Nobody" }, WALK_ACTIONS["pen-gate:force"].check).modifier).toBe(0)
  })
})

describe("walkVerdict — SRD ability check", () => {
  it("meets or beats the DC", () => {
    expect(walkVerdict(WALK_ACTIONS["pen-gate:pick"], 20)).toBe(true)
    expect(walkVerdict(WALK_ACTIONS["pen-gate:pick"], 19)).toBe(false)
  })
})

describe("parseWalkRollRequest — closed vocabulary", () => {
  it("accepts a known action", () => {
    expect(parseWalkRollRequest({ type: "aop:roll", id: "r1", action: "pen-gate:pick", characterId: "c1" }))
      .toEqual({ type: "aop:roll", id: "r1", action: "pen-gate:pick", characterId: "c1" })
  })
  it("refuses an unknown action, free text, or a missing id", () => {
    expect(parseWalkRollRequest({ type: "aop:roll", id: "r1", action: "open sesame" })).toBeNull()
    expect(parseWalkRollRequest({ type: "aop:roll", id: "r1", action: "toString" })).toBeNull()
    expect(parseWalkRollRequest({ type: "aop:roll", action: "pen-gate:pick" })).toBeNull()
    expect(parseWalkRollRequest({ type: "aop:action", id: "r1", action: "pen-gate:pick" })).toBeNull()
    expect(parseWalkRollRequest("aop:roll")).toBeNull()
  })
})

describe("walkRollMessage — what Malachar hears", () => {
  it("carries the verdict and the never-say-the-numbers rule", () => {
    const m = walkRollMessage("Fifi", WALK_ACTIONS["pen-gate:pick"], "Thieves' tools: 19 (1d20+5 → [14] +5)", false)
    expect(m).toContain("FAILS")
    expect(m).toContain("never say the roll, the total, the DC")
    expect(m.startsWith("[Dice Roll] Fifi")).toBe(true)
  })
})

describe("the map and the table agree", () => {
  for (const file of ["scripts/velkynvelve-walk/template.html", "public/velkynvelve-walk/index.html"]) {
    const page = readFileSync(file, "utf8")
    it(`${file}: no "what did it come to" window on the pen gate`, () => {
      expect(page).not.toMatch(/DC 20, OotA p\.18\)\. What did it come to/)
      expect(page).not.toContain('add("20 or more"')
      expect(page).not.toContain("Picking or forcing it is a DC 20 check")
    })
    it(`${file}: every action the map asks for is in WALK_ACTIONS, with the same DC offline`, () => {
      const asked = [...page.matchAll(/attempt\("([^"]+)"/g)].map((m) => m[1])
      expect(asked.length).toBeGreaterThan(0)
      for (const k of asked) expect(isWalkActionKey(k), k).toBe(true)
      const local = JSON.parse(/LOCAL_DC = (\{[^}]*\})/.exec(page)?.[1] ?? "{}") as Record<string, number>
      for (const [k, dc] of Object.entries(local)) {
        expect(isWalkActionKey(k), k).toBe(true)
        expect(dc).toBe(WALK_ACTIONS[k as keyof typeof WALK_ACTIONS].dc)
      }
    })
  }
})

// The map's half, run for real: the shipped rollOnDashboard and its listener, lifted out of the built page and
// run against a fake dashboard window. This is the code a player's click executes.
describe("the shipped map asks the dashboard and obeys the answer", () => {
  const page = readFileSync("public/velkynvelve-walk/index.html", "utf8")
  const start = page.indexOf("const ROLLS = new Map()")
  const end = page.indexOf("function handOff(")
  const code = page.slice(start, end)

  function boot(opts: { inApp: boolean }) {
    const posted: unknown[] = []
    let listener: ((e: { origin: string; data: unknown }) => void) | null = null
    const parent = { postMessage: (m: unknown) => posted.push(m) }
    const ctx: Record<string, unknown> = {
      APP: opts.inApp, location: { origin: "https://ashes.example" },
      window: { parent: opts.inApp ? parent : null },
      addEventListener: (_t: string, fn: typeof listener) => { listener = fn },
      d20: () => 7, myClaimId: "seat-1", characterIdOf: () => "leader-row", leader: { id: "fifi" },
      setTimeout, clearTimeout, Promise, Map, Math, Date,
    }
    if (!opts.inApp) (ctx.window as { parent: unknown }).parent = ctx.window
    vm.createContext(ctx)
    vm.runInContext(code + "\nthis.rollOnDashboard = rollOnDashboard;", ctx)
    return { ctx, posted, send: (data: unknown, origin = "https://ashes.example") => listener?.({ origin, data }) }
  }

  it("found the code in the built page", () => {
    expect(start).toBeGreaterThan(0)
    expect(end).toBeGreaterThan(start)
  })

  it("posts a closed-vocabulary request with this browser's seat, then follows the dashboard's verdict", async () => {
    const m = boot({ inApp: true })
    const p = (m.ctx.rollOnDashboard as (a: string, mod: number) => Promise<Record<string, unknown>>)("pen-gate:pick", 3)
    expect(m.posted).toHaveLength(1)
    const req = parseWalkRollRequest(m.posted[0])
    expect(req).not.toBeNull()
    expect(req?.action).toBe("pen-gate:pick")
    expect(req?.characterId).toBe("seat-1")
    m.send({ type: "aop:roll-result", id: "someone-else", ok: true, success: false }) // not ours: ignored
    m.send({ type: "aop:roll-result", id: req?.id, ok: true, success: true, total: 21 }, "https://evil.example") // wrong origin: ignored
    m.send({ type: "aop:roll-result", id: req?.id, ok: true, success: true, total: 21, natural: 16 })
    await expect(p).resolves.toMatchObject({ ok: true, success: true, total: 21 })
  })

  it("opened on its own, it rolls locally against the same DC", async () => {
    const m = boot({ inApp: false })
    const r = await (m.ctx.rollOnDashboard as (a: string, mod: number) => Promise<Record<string, unknown>>)("pen-gate:force", 2)
    expect(m.posted).toHaveLength(0)
    expect(r).toMatchObject({ ok: true, total: 9, success: false })
  })
})
