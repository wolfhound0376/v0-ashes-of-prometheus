import { describe, expect, it } from "vitest"
import { battleFor, battleHref, isBattle } from "./battle"

const spiders = { table_key: "underdark_ambush", result: "1d6 giant spiders clinging to walls or ceiling", detail: { count: "1d6", bestiary: "Giant Spider" } }
const ambushers = { table_key: "underdark_creature", result: "Ambushers", detail: { rolls: ["underdark_ambush"] } }
const random = { table_key: "underdark_random", result: "Terrain and creatures", detail: {} }
const terrain = (result: string) => ({ table_key: "underdark_terrain", result, detail: {} })
const four = () => 4

describe("where a road encounter is fought (Sam, 2026-11-12)", () => {
  it("giant spiders fight on the Webs, the count rolled and kept", () => {
    const b = battleFor([random, ambushers, spiders], { surprised: "party" }, four)
    expect(isBattle(b)).toBe(true)
    if (!isBattle(b)) return
    expect(b.plate).toBe("road-webs")
    expect(b.foes).toEqual(["giant-spider", "giant-spider", "giant-spider", "giant-spider"])
    expect(b.countDice).toBe("1d6")
    expect(b.countRolls).toEqual([4])
    expect(b.surprised).toBe("party")
  })
  it("a painted terrain rolled with them is the plate", () => {
    const b = battleFor([random, terrain("Rope bridge"), ambushers, spiders], null, four)
    expect(isBattle(b) && b.plate).toBe("road-rope-bridge")
    expect(isBattle(b) && b.surprised).toBeNull()
    const c = battleFor([random, terrain("Gorge"), ambushers, spiders], null, four)
    expect(isBattle(c) && c.plate).toBe("road-webs")
  })
  it("offers nothing it cannot back with data, and says why", () => {
    const chuul = { table_key: "underdark_ambush", result: "1 chuul lurking in a pool of water", detail: { count: 1, bestiary: "Chuul" } }
    expect(battleFor([random, ambushers, chuul], null, four)).toEqual({ reason: "The walk has no stat block for Chuul yet." })
    const traders = { table_key: "underdark_creature", result: "Traders", detail: {} }
    expect(battleFor([random, traders], null, four)).toEqual({ reason: "This result has no stat block linked in the encounter table yet." })
    const noCount = { table_key: "underdark_ambush", result: "giant spiders", detail: { bestiary: "Giant Spider" } }
    expect(battleFor([noCount], null, four)).toEqual({ reason: "The encounter table gives no count for Giant Spider yet." })
    expect(battleFor([random, terrain("Webs")], null, four)).toBeNull()
  })
  it("gricks fight in the tunnels; orogs only where a painted terrain was rolled (Sam, 2026-11-12)", () => {
    const gricks = { table_key: "underdark_ambush", result: "1d4 gricks hiding in a crevice", detail: { count: "1d4", bestiary: "Grick" } }
    const orogs = { table_key: "underdark_ambush", result: "1d4 orogs perching on ledges", detail: { count: "1d4", bestiary: "Orog" } }
    const g = battleFor([random, ambushers, gricks], null, () => 3)
    expect(isBattle(g) && [g.plate, g.foes.join()]).toEqual(["road-tunnels", "grick,grick,grick"])
    expect(battleFor([random, ambushers, orogs], null, () => 2)).toEqual({ reason: "No battle plate is painted for Orog here yet." })
    const o = battleFor([random, terrain("Boneyard"), ambushers, orogs], null, () => 2)
    expect(isBattle(o) && [o.plate, o.foes.join()]).toEqual(["road-boneyard", "orog,orog"])
  })
  it("the address carries plate, foes, the row's words and the surprise", () => {
    const b = battleFor([ambushers, spiders], { surprised: "party" }, () => 2)
    if (!isBattle(b)) throw new Error("expected a battle")
    const u = new URL(battleHref(b, undefined, true), "https://x")
    expect(u.pathname).toBe("/velkynvelve")
    expect(u.searchParams.get("road")).toBe("road-webs")
    expect(u.searchParams.get("foes")).toBe("giant-spider,giant-spider")
    expect(u.searchParams.get("surprised")).toBe("party")
    expect(u.searchParams.get("sandbox")).toBe("1")
    expect(new URL(battleHref(b, "them"), "https://x").searchParams.get("surprised")).toBe("them")
    expect(new URL(battleHref(b, null), "https://x").searchParams.has("surprised")).toBe(false)
  })
})
