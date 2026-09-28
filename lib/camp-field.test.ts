import { describe, expect, it } from "vitest"
import type { EncounterTableRow } from "./camp"
import {
  buildExploreMap, choosePrey, explorePermit, exploreEncounterDue, forageField, forageHaul, FUNGI, huntDanger,
  passivePerception, rollCount, searchRoom, seededRng, slipAway, type CatalogItem,
} from "./camp-field"

// The d20 faces in order; each call returns the next.
const seq = (...faces: number[]) => { let i = 0; return () => (faces[i++ % faces.length] - 1) / 20 + 0.001 }
// Raw fractions, for dice that are not d20s.
const frac = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length] }

// Real rows (encounter_table_rows, 2026-09-28) — the ones these tests touch.
const R = (table_key: string, a: number, b: number, result: string, detail: Record<string, unknown> = {}): EncounterTableRow => ({ table_key, roll_min: a, roll_max: b, result, detail })
const ROWS: EncounterTableRow[] = [
  R("underdark_creature", 1, 2, "Ambushers", { rolls: ["underdark_ambush"] }),
  R("underdark_creature", 3, 3, "Carrion crawler", { bestiary: "Carrion Crawler" }),
  R("underdark_creature", 4, 5, "Escaped slaves"),
  R("underdark_creature", 6, 20, "Traders"),
  R("underdark_ambush", 1, 9, "1d4 gricks hiding in a crevice", { count: "1d4", bestiary: "Grick" }),
  R("underdark_ambush", 10, 20, "1d4 orogs perching on ledges", { count: "1d4", bestiary: "Orog" }),
  R("underdark_discovery", 1, 10, "Nothing"),
  R("underdark_discovery", 11, 12, "A corpse clutching a salvageable nonmagical weapon"),
  R("underdark_discovery", 13, 14, "A corpse wearing a salvageable suit of nonmagical armour"),
  R("underdark_discovery", 15, 17, "1d6 gems worth 50 gp each", { count: "1d6", value_gp: 50 }),
  R("underdark_discovery", 18, 19, "A corpse carrying a random magic item (DMG Table B)", { dmg_table: "B" }),
  R("underdark_terrain", 1, 17, "Fungus cavern"),
  R("underdark_terrain", 18, 18, "Underground stream", { note: "foraging DC drops to 10" }),
  R("underdark_terrain", 19, 20, "Webs"),
]
const CATALOG: CatalogItem[] = [
  { slug: "rusted-scimitar", name: "Rusted Scimitar", item_type: "weapon", rarity: "common", value: 2 },
  { slug: "longsword", name: "Longsword", item_type: "weapon", rarity: "common", value: 15 },
  { slug: "leather-armor", name: "Leather Armor", item_type: "armor", rarity: "common", value: 10 },
  { slug: "rags", name: "Rags", item_type: "armor", rarity: "common", value: 0 },
  { slug: "carnelian-gem", name: "Carnelian", item_type: "misc", rarity: "common", value: 10 },
]

describe("forage field", () => {
  it("lays one food patch per day earned, plus 1d4 fungi from the biome", () => {
    const f = forageField({ success: true, supplies: 3, biome: "shore", rng: seq(1, 5, 9, 13, 17, 20, 4, 8, 12, 16, 2, 6) })
    expect(f.patches.filter((p) => p.kind === "food")).toHaveLength(3)
    const reagents = f.patches.filter((p) => p.kind === "reagent")
    expect(reagents.length).toBeGreaterThanOrEqual(1)
    expect(reagents.length).toBeLessThanOrEqual(4)
    for (const r of reagents) expect(FUNGI.some((x) => x.slug === r.slug)).toBe(true)
    expect(f.dc).toBe(15)
  })
  it("never grows waterorb away from water", () => {
    for (let s = 0; s < 40; s++) {
      const f = forageField({ success: true, supplies: 0, biome: "tunnels", rng: seededRng(s) })
      expect(f.patches.some((p) => p.slug === "waterorb")).toBe(false)
    }
  })
  it("a failed roll draws only scrub — nothing to carry", () => {
    const f = forageField({ success: false, supplies: 0, biome: "fungal", rng: seededRng(1) })
    expect(f.patches.every((p) => p.slug === null)).toBe(true)
    expect(forageHaul(f, f.patches.map((_, i) => i)).supplies).toBe(0)
  })
  it("leaves out fungi the catalog lacks, and says so", () => {
    const f = forageField({ success: true, supplies: 1, biome: "fungal", rng: seededRng(3), catalog: new Set(["bluecap"]) })
    expect(f.patches.filter((p) => p.kind === "reagent").every((p) => p.slug === "bluecap")).toBe(true)
    expect(f.flags.some((x) => /Trillimac is not in the catalog/.test(x))).toBe(true)
  })
  it("carries home only what was reached", () => {
    const f = forageField({ success: true, supplies: 2, biome: "fungal", rng: seededRng(9) })
    const haul = forageHaul(f, [0])
    expect(haul.supplies).toBe(1)
    expect(haul.missed).toBe(f.patches.length - 1)
  })
  it("the stream drops the DC to 10", () => {
    expect(forageField({ success: true, supplies: 1, biome: "shore", rng: seededRng(2), stream: true }).dc).toBe(10)
  })
})

describe("hunt", () => {
  it("draws prey only from the bestiary it is given", () => {
    const { prey } = choosePrey("fungal", seededRng(4), new Set(["giant-rat"]))
    expect(prey?.slug).toBe("giant-rat")
    expect(choosePrey("fungal", seededRng(4), new Set()).prey).toBeNull()
  })
  it("a quiet hunt below 16 meets nothing", () => {
    const h = huntDanger(ROWS, 0, seq(15))
    expect(h.creature).toBeNull()
  })
  it("noise widens the band: a 13 with 3 noise is a creature", () => {
    const h = huntDanger(ROWS, 3, seq(13, 3))
    expect(h.adjusted).toBe(16)
    expect(h.creature?.bestiary).toBe("Carrion Crawler")
  })
  it("Ambushers roll again on the ambush table", () => {
    const h = huntDanger(ROWS, 0, frac(0.86, 0.01, 0.56, 0.6)) // d20 18, creature 1, ambush 12, d4 3
    expect(h.creature?.bestiary).toBe("Orog")
    expect(h.creature?.via).toEqual(["underdark_random", "underdark_creature", "underdark_ambush"])
    expect(h.creature?.count).toBe(3)
  })
  it("a row with no stat block is left to the DM", () => {
    const h = huntDanger(ROWS, 0, seq(20, 4))
    expect(h.creature?.bestiary).toBeNull()
    expect(h.flags.some((f) => /names no stat block/.test(f))).toBe(true)
  })
  it("hiding is Stealth against passive Perception", () => {
    expect(passivePerception({ wis: 12, skills: { Perception: 2 } })).toBe(12)
    expect(passivePerception({ wis: 11, senses: "darkvision 60 ft., passive Perception 10" })).toBe(10)
    expect(slipAway("Fifi", 11, { name: "Orog", passive: 10 }).caught).toBe(false)
    expect(slipAway("Fifi", 9, { name: "Orog", passive: 10 }).caught).toBe(true)
    // Real rows: skills as text; stub rows with no stats get no number.
    expect(passivePerception({ wis: 11, skills: "Perception +4" })).toBe(14)
    expect(passivePerception({ wis: null, skills: null, senses: null })).toBeNull()
    expect(slipAway("Fifi", 20, { name: "Umber hulk", passive: null }).caught).toBeNull()
  })
})

describe("explore", () => {
  it("wild tunnels explore; towns are the DM's scene; metadata overrides", () => {
    expect(explorePermit({ node_type: "waypoint" }).ok).toBe(true)
    expect(explorePermit({ node_type: "location", name: "Gracklstugh" }).ok).toBe(false)
    expect(explorePermit({ node_type: "location", metadata: { explorable: true } }).ok).toBe(true)
    expect(explorePermit({ node_type: "waypoint", metadata: { explorable: false } }).ok).toBe(false)
    expect(explorePermit(null).ok).toBe(false)
  })
  it("same seed, same map; every room reachable from camp", () => {
    const a = buildExploreMap("wp-17", ROWS), b = buildExploreMap("wp-17", ROWS)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    const at = (x: number, y: number) => a.rooms[y * a.w + x]
    const seen = new Set<string>([`${a.camp.x},${a.camp.y}`]), q = [a.camp]
    while (q.length) {
      const { x, y } = q.shift()!, r = at(x, y)
      const next = [r.doors.n && { x, y: y - 1 }, r.doors.e && { x: x + 1, y }, r.doors.s && { x, y: y + 1 }, r.doors.w && { x: x - 1, y }].filter(Boolean) as { x: number; y: number }[]
      for (const n of next) if (!seen.has(`${n.x},${n.y}`)) { seen.add(`${n.x},${n.y}`); q.push(n) }
    }
    expect(seen.size).toBe(a.w * a.h)
    expect(at(a.camp.x, a.camp.y).isCamp).toBe(true)
    // Doors agree on both sides.
    for (const r of a.rooms) if (r.doors.e) expect(at(r.x + 1, r.y).doors.w).toBe(true)
  })
  it("terrain comes from the book's table", () => {
    const m = buildExploreMap(42, ROWS)
    for (const r of m.rooms) if (r.terrain) expect(["Fungus cavern", "Underground stream", "Webs"]).toContain(r.terrain)
  })
  const search = (total: number, ...faces: number[]) => searchRoom({ who: "Kenta", total, catalog: CATALOG, discoveryRows: ROWS, rng: seq(...faces) })
  it("a missed search or a 1–10 is a dead end", () => {
    expect(search(14, 20).deadEnd).toBe(true)
    expect(search(15, 7).deadEnd).toBe(true)
  })
  it("a weapon corpse gives a catalog weapon, rusted first", () => {
    const f = search(18, 11, 1)
    expect(f.items).toEqual([{ slug: "rusted-scimitar", name: "Rusted Scimitar", quantity: 1 }])
  })
  it("armour is a catalog row and never rags", () => {
    const f = search(18, 13, 1)
    expect(f.items[0].slug).toBe("leather-armor")
  })
  it("50 gp gems the catalog lacks go to the DM — nothing conjured", () => {
    const f = search(18, 15, 4)
    expect(f.items).toEqual([])
    expect(f.dmPicks).toMatch(/50 gp/)
  })
  it("magic items are always the DM's pick", () => {
    const f = search(18, 18)
    expect(f.items).toEqual([])
    expect(f.dmPicks).toMatch(/Table B/)
  })
  it("every third new room rolls for encounters", () => {
    expect([1, 2, 3, 4, 5, 6].map(exploreEncounterDue)).toEqual([false, false, true, false, false, true])
    expect(rollCount("2d6", frac(0.34, 0.5))).toBe(7)
  })
})
