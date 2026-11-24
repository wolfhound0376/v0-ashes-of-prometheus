import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { holdFightFoes, isFightFoe, mapOwnsFight, type CombatFlag } from "./combat-flag"
import type { StageEvent } from "./stage-roster"

// The Guard Tower fight of 2026-11-23 (run 95b1aa1b): the map's own spotting raised this flag at 04:05:58 UTC, and
// Malachar's narration of it came back at 04:06:08 with [NPC_LEAVE: Drow Guard] (hp 22) and [COMBAT_END].
const spotted: CombatFlag = {
  status: "active",
  foes: [
    { name: "Drow guard", slug: "drow-guard", aliases: ["drow-guard-male"], hp: 13, hpMax: 13 },
    { name: "Drow guard", slug: "drow-guard", aliases: ["drow-guard-female"], hp: 13, hpMax: 13 },
    { name: "Drow guard", slug: "drow-guard", aliases: ["drow-guard"], hp: 13, hpMax: 13 },
  ],
  area: "Guard Tower",
  startedAt: "2026-11-24T04:05:58.700Z",
  startedBy: "Fifi of Waterdeep",
  label: "Drow guard sees Fifi where they should not be — the guards attack!",
  opener: "d00aa5b8-ced1-477d-9ec8-0861cca55498",
}
const malachars: CombatFlag = { ...spotted, opener: null, label: "Malachar calls for initiative." }

describe("mapOwnsFight", () => {
  it("a fight the map opened from a guard's spotting is the map's", () => {
    expect(mapOwnsFight(spotted)).toBe(true)
  })
  it("Malachar's own call to initiative is not", () => {
    expect(mapOwnsFight(malachars)).toBe(false)
    const { opener: _gone, ...noOpener } = spotted
    expect(mapOwnsFight(noOpener as CombatFlag)).toBe(false)
  })
  it("no fight, no hold", () => {
    expect(mapOwnsFight(null)).toBe(false)
    expect(mapOwnsFight(undefined)).toBe(false)
  })
})

describe("isFightFoe", () => {
  it("Malachar's spelling of a foe is that foe", () => {
    expect(isFightFoe(spotted, "Drow Guard")).toBe(true)
    expect(isFightFoe(spotted, "drow guard")).toBe(true)
    expect(isFightFoe(spotted, "Drow Guard (female)")).toBe(true)
  })
  it("someone not in the fight is not", () => {
    expect(isFightFoe(spotted, "Jorlan Duskryn")).toBe(false)
    expect(isFightFoe(spotted, "Eldeth Feldrun")).toBe(false)
    expect(isFightFoe(spotted, "")).toBe(false)
  })
})

describe("holdFightFoes", () => {
  const tonight: StageEvent[] = [
    { kind: "arrive", name: "Drow Guard", aliases: null, hp: 22, hpMax: 22 },
    { kind: "leave", name: "Drow Guard", dead: false },
  ]
  it("the narration cannot walk a living foe of the map's fight off the stage", () => {
    const r = holdFightFoes(spotted, tonight)
    expect(r.held).toEqual(["Drow Guard"])
    expect(r.events).toEqual([tonight[0]])
  })
  it("a foe the narration kills still dies", () => {
    const dead: StageEvent = { kind: "leave", name: "Drow Guard", dead: true, cause: null }
    expect(holdFightFoes(spotted, [dead]).events).toEqual([dead])
  })
  it("anyone else may still come and go", () => {
    const ev: StageEvent[] = [{ kind: "leave", name: "Jorlan Duskryn", dead: false }, { kind: "watch", state: "changing" }]
    expect(holdFightFoes(spotted, ev)).toEqual({ events: ev, held: [] })
  })
  it("in Malachar's own fight, or with no fight, nothing is held", () => {
    expect(holdFightFoes(malachars, tonight)).toEqual({ events: tonight, held: [] })
    expect(holdFightFoes(null, tonight)).toEqual({ events: tonight, held: [] })
  })
})

describe("the chat route and the map", () => {
  it("the chat route reads the flag before the reply's tags and holds [COMBAT_END] for the map's fight", () => {
    const route = readFileSync("app/api/chat/route.ts", "utf8")
    const read = route.indexOf("const fightOnFlag = await readCombatFlag(timeAdmin)")
    const start = route.indexOf("const combatStartMatch = rawText.match(")
    expect(read).toBeGreaterThan(-1)
    expect(read).toBeLessThan(start)
    expect(route).toMatch(/if \(mapOwnsFight\(fightOnFlag\)\)[^\n]*\n\s*else await endCombatFlag\(timeAdmin\)/)
    expect(route).toContain("applyStageEvents(timeAdmin, fightHold.events)")
  })
  it("the built map does not end a fight it opened when the flag comes down, except for a surrender", () => {
    for (const f of ["scripts/velkynvelve-walk/template.html", "public/velkynvelve-walk/index.html"]) {
      const html = readFileSync(f, "utf8")
      expect(html).toContain("flagOpenedByMap = !!flag.opener;")
      expect(html).toMatch(/if \(flagOpenedByMap && !surrenderFresh\(\)\) return;\n\s*endCombat\(!surrenderFresh\(\)\);/)
    }
  })
})
