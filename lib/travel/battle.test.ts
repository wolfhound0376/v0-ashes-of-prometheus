import { describe, expect, it } from "vitest"
import { battleFor, battleHref, isBattle, RUINS_HREF, ruinsRolled, TUNNEL_PLATES, tunnelPlate } from "./battle"

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
    const piercers = { table_key: "underdark_ambush", result: "1d6 piercers masquerading as stalactites", detail: { count: "1d6", bestiary: "Piercer" } }
    expect(battleFor([random, ambushers, piercers], null, four)).toEqual({ reason: "The walk has no stat block for Piercer yet." })
    const traders = { table_key: "underdark_creature", result: "Traders", detail: {} }
    expect(battleFor([random, traders], null, four)).toEqual({ reason: "This result has no stat block linked in the encounter table yet." })
    const noCount = { table_key: "underdark_ambush", result: "giant spiders", detail: { bestiary: "Giant Spider" } }
    expect(battleFor([noCount], null, four)).toEqual({ reason: "The encounter table gives no count for Giant Spider yet." })
    expect(battleFor([random, terrain("Webs")], null, four)).toBeNull()
  })
  it("gricks fight in the tunnels; orogs on a painted terrain when rolled, else the tunnels too (Sam, 2026-11-12)", () => {
    const gricks = { table_key: "underdark_ambush", result: "1d4 gricks hiding in a crevice", detail: { count: "1d4", bestiary: "Grick" } }
    const orogs = { table_key: "underdark_ambush", result: "1d4 orogs perching on ledges", detail: { count: "1d4", bestiary: "Orog" } }
    const g = battleFor([random, ambushers, gricks], null, () => 3)
    expect(isBattle(g) && [g.plate, g.foes.join()]).toEqual(["road-tunnels-winding", "grick,grick,grick"])   // a 3 on the plate die
    const t = battleFor([random, ambushers, orogs], null, () => 2)
    expect(isBattle(t) && [t.plate, t.foes.join()]).toEqual(["road-tunnels-junction", "orog,orog"])
    const u = battleFor([random, terrain("Lava swell"), ambushers, orogs], null, () => 2)
    expect(isBattle(u) && TUNNEL_PLATES.includes(u.plate)).toBe(true)
    const o = battleFor([random, terrain("Boneyard"), ambushers, orogs], null, () => 2)
    expect(isBattle(o) && [o.plate, o.foes.join()]).toEqual(["road-boneyard", "orog,orog"])
  })
  it("a fight that falls to the tunnels rolls one of the generic tunnel plates (Sam, 2026-11-23)", () => {
    expect(TUNNEL_PLATES[0]).toBe("road-tunnels")
    expect([1, 2, 3, 4].map((f) => tunnelPlate(() => f))).toEqual([...TUNNEL_PLATES])
    expect(tunnelPlate(() => 0)).toBe("road-tunnels")   // a bad die falls back to the original plate
    expect(tunnelPlate(() => 9)).toBe("road-tunnels")
    const dice: number[] = []
    tunnelPlate((d) => (dice.push(d), 1))
    expect(dice).toEqual([TUNNEL_PLATES.length])
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

describe("the Ruins on the road", () => {
  it("offers the way in only when the terrain dice land on Ruins", () => {
    expect(ruinsRolled([{ table_key: "underdark_terrain", result: "Ruins" }])).toBe(true)
    expect(ruinsRolled([{ table_key: "underdark_random", result: "Terrain" }, { table_key: "underdark_terrain", result: " ruins " }])).toBe(true)
    expect(ruinsRolled([{ table_key: "underdark_terrain", result: "Boneyard" }])).toBe(false)
    expect(ruinsRolled([{ table_key: "underdark_creature", result: "Ruins" }])).toBe(false)
    expect(ruinsRolled(null)).toBe(false)
  })
  it("opens the walk page at the rooms and says it came from the map", () => {
    expect(RUINS_HREF).toBe("/velkynvelve?ruins=1&from=map")
  })
})

describe("more ambushers come to blows (Sam, 2026-11-25: \"Need more creatures\")", () => {
  const random = { table_key: "underdark_random", result: "One or more creatures", detail: {} }
  const ambushers = { table_key: "underdark_creature", result: "Ambushers", detail: {} }
  const one = () => 1
  const row = (result: string, bestiary: string, count: number | string) => ({ table_key: "underdark_ambush", result, detail: { bestiary, count } })
  it("the chuul, the grell and the umber hulk each have a fight, on the tunnels", () => {
    for (const [result, bestiary, foe] of [
      ["1 chuul lurking in a pool of water", "Chuul", "chuul"],
      ["1 grell floating near the high ceiling", "Grell", "grell"],
      ["1 umber hulk bursting out of a nearby wall", "Umber Hulk", "umber-hulk"],
    ] as const) {
      const b = battleFor([random, ambushers, row(result, bestiary, 1)], null, one)
      expect(isBattle(b), bestiary).toBe(true)
      if (!isBattle(b)) continue
      expect(b.foes).toEqual([foe])
      expect(TUNNEL_PLATES).toContain(b.plate)
    }
  })
  it("a creature the walk cannot field still says why, and a row with no count still says so", () => {
    expect(battleFor([random, ambushers, row("1d6 piercers masquerading as stalactites", "Piercer", "1d6")], null, one)).toEqual({ reason: "The walk has no stat block for Piercer yet." })
    const crawler = { table_key: "underdark_creature", result: "Carrion crawler", detail: { bestiary: "Carrion Crawler" } }
    expect(battleFor([random, crawler], null, one)).toEqual({ reason: "The walk has no stat block for Carrion Crawler yet." })
  })
})
