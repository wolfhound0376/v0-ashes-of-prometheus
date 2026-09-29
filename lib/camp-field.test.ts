import { describe, expect, it } from "vitest"
import type { EncounterTableRow } from "./camp"
import {
  fieldKit, kitDamage, fieldFoe, QUIVER, herbSpotDC, skillLevel, spotChance, spotHerb,
  T, passable, slowFactor, tileAt, buildExploreWorld, placeOnWorld, CACHE_COUNT, lostInTheDark,
  lairOccupant, lairRoom, parseDice, rollAttack, roomRoamers, strikerFromBestiary, strikerFromSheet,
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

describe("the zelda layer", () => {
  it("reads dice from bestiary text and sheet rows", () => {
    expect(parseDice("1d4+3")).toEqual({ n: 1, d: 4, mod: 3 })
    expect(parseDice("1d6-1")).toEqual({ n: 1, d: 6, mod: -1 })
    expect(parseDice("2")).toEqual({ n: 0, d: 0, mod: 2 })
    // Real rows, 2026-09-28
    expect(strikerFromBestiary({ name: "Giant Rat", actions: [{ desc: "Hit: 4 (1d4+2) piercing.", name: "Bite", to_hit: "+4" }] })).toEqual({ name: "Giant Rat — Bite", toHit: 4, damage: "1d4+2" })
    expect(strikerFromBestiary({ name: "Deep Rothé", actions: [] })).toBeNull()
    expect(strikerFromSheet({ name: "Dagger", hit: "+5", damage: "1d4+3 piercing" })).toEqual({ name: "Dagger", toHit: 5, damage: "1d4+3" })
  })
  it("attack rolls follow the SRD: 20 crits and doubles dice, 1 misses", () => {
    const dagger = { name: "Dagger", toHit: 5, damage: "1d4+3" }
    const crit = rollAttack(dagger, 30, frac(0.99, 0.99, 0.99))
    expect(crit.crit && crit.hit).toBe(true)
    expect(crit.damage).toBe(4 + 4 + 3)
    expect(rollAttack(dagger, 2, frac(0.001)).hit).toBe(false)
    const plain = rollAttack(dagger, 12, frac(0.35, 0.5))
    expect(plain.total).toBe(8 + 5)
    expect(plain.damage).toBe(3 + 3)
  })
  it("rooms keep their vermin; camp has none", () => {
    expect(roomRoamers("2,1", "tunnels", false)).toEqual(roomRoamers("2,1", "tunnels", false))
    expect(roomRoamers("2,1", "tunnels", true)).toEqual([])
  })
  it("the lair is the room farthest from camp", () => {
    const m = buildExploreMap("wp-17", ROWS)
    const lair = lairRoom(m)
    expect(`${lair.x},${lair.y}`).not.toBe(`${m.camp.x},${m.camp.y}`)
    const occ = lairOccupant(ROWS, seq(12, 2))
    expect(occ?.bestiary).toBe("Orog")
  })
  it("a lair search rolls the discovery table with advantage", () => {
    const f = searchRoom({ who: "Kenta", total: 18, catalog: CATALOG, discoveryRows: ROWS, rng: seq(3, 11, 1), advantage: true })
    expect(f.face).toBe(11)
    expect(f.flags.some((x) => /Advantage/.test(x))).toBe(true)
  })
})

describe("the overworld", () => {
  const W = buildExploreWorld("wp-17", ROWS)
  const reach = () => {
    const seen = new Set<string>([`${W.camp.x},${W.camp.y}`]), q = [W.camp]
    while (q.length) { const c = q.shift()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = c.x + dx, y = c.y + dy; if (!passable(tileAt(W, x, y)) || seen.has(`${x},${y}`)) continue; seen.add(`${x},${y}`); q.push({ x, y }) } }
    return seen
  }
  it("is big: 8×6 screens of 15×9", () => {
    expect(W.cols).toBe(121)
    expect(W.rows).toBe(55)
  })
  it("same seed, same world", () => {
    expect(buildExploreWorld("wp-17", ROWS).grid.join("")).toBe(W.grid.join(""))
  })
  it("every searchable spot and the lair can be walked to from camp", () => {
    const seen = reach()
    for (const p of W.pois) expect(seen.has(`${p.x},${p.y}`)).toBe(true)
    // and no ground is shown that cannot be reached
    // Unreachable ground only ever shows as a far bank you can see across the water or the chasm.
    for (let i = 0; i < W.grid.length; i++) if (passable(W.grid[i]) && !seen.has(`${i % W.cols},${Math.floor(i / W.cols)}`)) {
      const x = i % W.cols, y = Math.floor(i / W.cols); let wet = false
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const t = tileAt(W, x + dx, y + dy); if (t === T.DEEP || t === T.CHASM) wet = true }
      expect(wet).toBe(true)
    }
  })
  it("has rivers you cannot wade except at fords, and a chasm with bridges", () => {
    const n = (t: number) => W.grid.filter((x) => x === t).length
    expect(n(T.DEEP)).toBeGreaterThan(50)
    expect(n(T.FORD)).toBeGreaterThan(0)
    expect(n(T.CHASM)).toBeGreaterThan(20)
    expect(n(T.BRIDGE)).toBeGreaterThan(0)
    expect(passable(T.DEEP)).toBe(false)
    expect(slowFactor(T.FORD)).toBeLessThan(1)
  })
  it("rock never touches water or the chasm", () => {
    for (let y = 1; y < W.rows - 1; y++) for (let x = 1; x < W.cols - 1; x++) {
      const t = tileAt(W, x, y); if (t !== T.DEEP && t !== T.FORD && t !== T.CHASM && t !== T.BRIDGE) continue
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(tileAt(W, x + dx, y + dy)).not.toBe(T.WALL)
    }
  })
  it("few places are worth searching, and they are spread out", () => {
    expect(W.pois.filter((p) => p.kind === "cache").length).toBeLessThanOrEqual(CACHE_COUNT)
    expect(W.pois.filter((p) => p.kind === "lair")).toHaveLength(1)
  })
  it("the lantern running out costs a level of exhaustion", () => {
    expect(lostInTheDark("Fifi").exhaustion).toBe(1)
  })
})

describe("placing things on the overworld", () => {
  const W = buildExploreWorld("wp-17", ROWS)
  it("puts patches on walkable floor, spaced, within the walking range asked", () => {
    const ps = placeOnWorld(W, 10, seededRng(1), { near: 6, far: 60, spacing: 5 })
    expect(ps.length).toBe(10)
    for (const p of ps) expect(tileAt(W, p.x, p.y)).toBe(T.FLOOR)
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) expect(Math.abs(ps[i].x - ps[j].x) + Math.abs(ps[i].y - ps[j].y)).toBeGreaterThanOrEqual(5)
  })
  it("same rng, same places", () => {
    expect(placeOnWorld(W, 3, seededRng(7))).toEqual(placeOnWorld(W, 3, seededRng(7)))
  })
})

describe("class kits (Sam's field rules)", () => {
  // Real sheets 2026-09-28
  const kenta = fieldKit({ class: "Sorcerer", cha: 17, prof: 2, spellAbility: "Charisma", cantrips: ["Ray of Frost", "Shocking Grasp", "Minor Illusion", "Chill Touch"] })
  const samson = fieldKit({ class: "Cleric", wis: 16, prof: 2, spellAbility: "Wisdom", prepared: ["Healing Word"] })
  it("sorcerers cannot melee and fire the ranged cantrip they know", () => {
    expect(kenta.melee.can).toBe(false)
    expect(kenta.ranged?.name).toBe("Ray of Frost")
    expect(kenta.ranged?.toHit).toBe(5)
    expect(kenta.notes.some((n) => /does not know Fire Bolt/.test(n))).toBe(true)
    expect(fieldKit({ class: "Wizard", int: 16, cantrips: ["Fire Bolt"] }).ranged?.name).toBe("Fire Bolt")
  })
  it("clerics heal three times and shed light", () => {
    expect(samson.heal).toEqual({ name: "Healing Word", uses: 3, dice: "1d4+3" })
    expect(samson.lightBonus).toBeGreaterThan(0)
  })
  it("the rest follow Sam's list", () => {
    expect(fieldKit({ class: "Rogue" }).moveMul).toBeGreaterThan(1)
    expect(fieldKit({ class: "Warlock", cha: 16 }).ranged).toMatchObject({ name: "Eldritch Blast", halve: true, knockback: true })
    expect(fieldKit({ class: "Fighter" })).toMatchObject({ knockbackOnMiss: true, melee: { mul: 2 } })
    expect(fieldKit({ class: "Bard" }).special).toMatchObject({ kind: "music", uses: 3 })
    expect(fieldKit({ class: "Ranger", dex: 16 })).toMatchObject({ ranged: { name: "Longbow", kind: "arrow", damage: "1d8+3", drawSeconds: 1.4, ammo: 12 }, beastCalm: 0.75 })
    expect(fieldKit({ class: "Rogue", dex: 17 }).ranged).toMatchObject({ name: "Shortbow", damage: "1d6+3", drawSeconds: 2.3, ammo: QUIVER })
    expect(fieldKit({ class: "Fighter", str: 16 }).melee.weapon).toMatchObject({ name: "Longsword", damage: "1d8+3", toHit: 5 })
    expect(fieldKit({ class: "Paladin", str: 14 }).melee).toMatchObject({ weapon: { name: "Longsword" }, reachMul: 1.35 })
    expect(fieldKit({ class: "Barbarian", str: 17 }).melee).toMatchObject({ weapon: { name: "Greataxe", damage: "1d12+3" }, reachMul: 1.6 })
    expect(fieldKit({ class: "Fighter", armed: false }).melee.weapon).toBeUndefined()
    expect(fieldKit({ class: "Monk" })).toMatchObject({ melee: { mul: 1.5, unarmedOnly: true }, regen: { hp: 1, every: 3 } })
    expect(fieldKit({ class: "Druid" }).beastCalm).toBe(0.75)
    expect(fieldKit({ class: "Paladin" }).special).toMatchObject({ kind: "aura", mul: 3 })
  })
  it("multipliers apply after the dice; the blast is halved but never zero", () => {
    expect(kitDamage(5, { mul: 2 })).toBe(10)
    expect(kitDamage(5, { mul: 1.5 })).toBe(7)
    expect(kitDamage(1, { halve: true })).toBe(1)
    expect(kitDamage(0, { mul: 3 })).toBe(0)
  })
})

describe("spotting herbs", () => {
  it("rates the rare one hardest and big growths easiest", () => {
    expect(herbSpotDC("tongue-of-madness")).toBe(16)
    expect(herbSpotDC("fire-lichen")).toBe(13)
    expect(herbSpotDC("zurkhwood")).toBe(10)
    expect(herbSpotDC(null)).toBe(10)
  })
  it("reads survival from a sheet in any case", () => {
    expect(skillLevel({ Survival: "proficient" })).toBe("proficient")
    expect(skillLevel({ survival: "expertise" })).toBe("expertise")
    expect(skillLevel({ stealth: "expertise" })).toBe("none")
  })
  it("expertise and advantage both raise the odds on the rare herb", () => {
    const base = { abilityMod: 1, prof: 2, dc: 16 }
    const none = spotChance({ ...base, level: "none" })
    const prof = spotChance({ ...base, level: "proficient" })
    const exp = spotChance({ ...base, level: "expertise" })
    const expAdv = spotChance({ ...base, level: "expertise", advantage: true })
    expect(none).toBeCloseTo(0.3)
    expect(prof).toBeCloseTo(0.4)
    expect(exp).toBeCloseTo(0.5)
    expect(expAdv).toBeCloseTo(0.75)
  })
  it("advantage keeps the higher die", () => {
    const seq = [0.1, 0.9]; let i = 0
    const r = spotHerb({ abilityMod: 0, prof: 2, level: "none", advantage: true, dc: 15, name: "Timmask" }, () => seq[i++ % 2])
    expect(r.rolls).toEqual([3, 19]); expect(r.total).toBe(19); expect(r.success).toBe(true)
  })
})

describe("field fights from bestiary rows", () => {
  const orog = { name: "Orog", ac: 18, hp: 42, speed: "30 ft.", actions: [
    { name: "Multiattack", desc: "The orog makes two greataxe attacks." },
    { name: "Greataxe", to_hit: "+6", desc: "Melee Weapon Attack, one target. Hit: 10 (1d12+4) slashing damage.", reach: "5 ft." },
    { name: "Javelin", to_hit: "+6", desc: "Melee or Ranged Weapon Attack, one target. Hit: 7 (1d6+4) piercing damage." }] }
  it("an orog swings its greataxe twice", () => {
    const f = fieldFoe(orog)!
    expect(f.strikes.map((s) => s.damage)).toEqual(["1d12+4", "1d12+4"])
    expect(f.chainIfHit).toBe(false)
  })
  it("a grick's beak only follows a tentacle hit", () => {
    const f = fieldFoe({ name: "Grick", ac: 14, hp: 27, speed: "30 ft., climb 30 ft.", actions: [
      { name: "Multiattack", desc: "One tentacles attack; if it hits, one beak attack against the same target." },
      { name: "Tentacles", to_hit: "+4", desc: "Hit: 9 (2d6+2) slashing." }, { name: "Beak", to_hit: "+4", desc: "Hit: 5 (1d6+2) piercing." }] })!
    expect(f.strikes.map((s) => s.name)).toEqual(["Grick — Tentacles", "Grick — Beak"]); expect(f.chainIfHit).toBe(true)
  })
  it("the spider's poison is a Con save rider; its web is left to the DM", () => {
    const f = fieldFoe({ name: "Giant Spider", ac: 14, hp: 26, speed: "30 ft., climb 30 ft.", actions: [
      { name: "Bite", to_hit: "+5", desc: "Hit: 7 (1d8+3) piercing, plus DC 11 Con save or 9 (2d8) poison (half on success); if reduced to 0 HP, stable but poisoned & paralyzed 1 hr." },
      { name: "Web (Recharge 5-6)", to_hit: "+5", desc: "Range 30/60 ft. Target restrained by webbing." }] })!
    expect(f.strikes[0].rider).toMatchObject({ ability: "CON", dc: 11, dice: "2d8", half: true, type: "poison" })
    expect(f.flags.join(" ")).toMatch(/Web/)
  })
  it("the ochre jelly's acid rides on the hit", () => {
    const f = fieldFoe({ name: "Ochre Jelly", ac: 8, hp: 45, speed: "10 ft., climb 10 ft.", actions: [{ name: "Pseudopod", to_hit: "+4", desc: "Hit: 9 (2d6+2) bludgeoning plus 3 (1d6) acid." }] })!
    expect(f.strikes[0]).toMatchObject({ damage: "2d6+2", extra: "1d6" }); expect(f.speedFt).toBe(10)
    const hit = rollAttack(f.strikes[0], 5, () => 0.99)
    expect(hit.damage).toBe(38) // a natural 20 with every die at 6: 4d6 + 2 = 26, plus the acid doubled 2d6 = 12
  })
  it("a stub row cannot be fought here", () => {
    expect(fieldFoe({ name: "Grell", ac: null, hp: null, actions: [] })).toBeNull()
  })
})
