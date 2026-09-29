// Camp field trips — the FORAGE, HUNT and EXPLORE tiles at the fire.
//
// Sam, 2026-09-27:
//   "Explore, forage and hunt should have different icons. Forage should be a
//    cute mini-game of your character foraging. Hunt is similar but there is a
//    risk of being caught by a monster. Explore should open a map the size of a
//    Zelda map if the node permits, with rolls for finds or dead ends."
//
// The mini-games are presentation. The RULES are here, and they are the book's
// wherever the book has one:
//
//   FORAGE   OotA-Enc p.25 — WIS (Survival), DC 15 in the Underdark, 10 beside
//            an underground stream (terrain table row 18), never above 20.
//            DMG p.111 — success yields 1d6 + WIS modifier days of food
//            (lib/camp settleForage owns that; this file only lays the field).
//            What grows: OotA's Underdark fungi, every one a catalog row.
//   HUNT     The same foraging rule (DMG p.111; there is no separate hunting
//            rule). Prey is drawn from bestiary beasts that live in the wilds.
//            The danger is OotA-Enc p.30: the Random Encounters d20, and a
//            creature on it is rolled on Creature Encounters p.32. A hunter who
//            meets one hides or is caught — SRD Hiding: Stealth against the
//            creature's passive Perception.
//   EXPLORE  A room-by-room map, seeded from the node so it is the same map for
//            everyone. Each room's ground is OotA's Terrain Encounters table
//            (p.30); what a search turns up is Ambush Lair Discovery (p.32).
//            1–10 on that table is "Nothing" — the dead end.
//
// Nothing is invented. A find names a catalog row or it names no item and says
// the DM must choose one ("a 50 gp gem": the catalog has none, so it is flagged,
// not conjured). Every house rule is PROPOSED and surfaces in `flags`.
//
// Pure: rows and rolls in, words and grids out. Every draw takes an `Rng`.

import type { EncounterTableRow } from "./camp"

export type Rng = () => number
export type FieldBiome = "tunnels" | "fungal" | "shore"

const d = (n: number, rng: Rng) => 1 + Math.floor(rng() * n)
const pick = <T>(xs: readonly T[], rng: Rng): T => xs[Math.min(xs.length - 1, Math.floor(rng() * xs.length))]
function weighted<T extends { w: number }>(xs: readonly T[], rng: Rng): T {
  const total = xs.reduce((a, b) => a + b.w, 0)
  let r = rng() * total
  for (const x of xs) if ((r -= x.w) < 0) return x
  return xs[xs.length - 1]
}
/** "1d4" → a roll; 3 → 3. */
export function rollCount(spec: number | string | null | undefined, rng: Rng): number {
  if (typeof spec === "number") return Math.max(1, Math.trunc(spec))
  const m = /^(\d*)d(\d+)$/i.exec(String(spec ?? "").trim())
  if (!m) return 1
  let t = 0
  for (let i = 0; i < Math.max(1, Number(m[1] || 1)); i++) t += d(Number(m[2]), rng)
  return t
}

// ============================================================================
// FORAGE — the patch field
// ============================================================================

/** OotA-Enc p.25. The stream row of the terrain table drops it to 10. */
export const FORAGE_DC = { underdark: 15, stream: 10, max: 20 } as const

export interface Fungus {
  /** items.slug — every entry resolves against the catalog. */
  slug: string
  name: string
  /** How often it turns up in each camp biome. PROPOSED weights. */
  w: Record<FieldBiome, number>
  /** Only Tongue of Madness is rare (Sam, 2026-09-28, answering). */
  rare?: boolean
}

/**
 * The Underdark fungi OotA names (ch.2, "Fungi of the Underdark") that exist in
 * the catalog. Waterorb grows only in water; zurkhwood and ripplebark are the
 * big growths of the fungus forests. Weights are PROPOSED.
 */
export const FUNGI: readonly Fungus[] = [
  { slug: "trillimac", name: "Trillimac", w: { tunnels: 4, fungal: 5, shore: 3 } },
  { slug: "bluecap", name: "Bluecap", w: { tunnels: 3, fungal: 4, shore: 2 } },
  { slug: "barrelstalk", name: "Barrelstalk", w: { tunnels: 2, fungal: 4, shore: 2 } },
  { slug: "fire-lichen", name: "Fire lichen", w: { tunnels: 3, fungal: 2, shore: 1 } },
  { slug: "nightlight-fungus", name: "Nightlight", w: { tunnels: 2, fungal: 3, shore: 1 } },
  { slug: "ormu-moss", name: "Ormu", w: { tunnels: 3, fungal: 2, shore: 2 } },
  { slug: "ripplebark", name: "Ripplebark", w: { tunnels: 1, fungal: 3, shore: 1 } },
  { slug: "timmask", name: "Timmask", w: { tunnels: 2, fungal: 3, shore: 1 } },
  { slug: "zurkhwood", name: "Zurkhwood", w: { tunnels: 1, fungal: 3, shore: 1 } },
  { slug: "waterorb", name: "Waterorb", w: { tunnels: 0, fungal: 0, shore: 4 } },
  // Added to the catalog 2026-09-28 from Sam's seed file (OotA p.28).
  { slug: "torchstalk", name: "Torchstalk", w: { tunnels: 2, fungal: 3, shore: 1 } },
  { slug: "nilhoggs-nose", name: "Nilhogg's nose", w: { tunnels: 1, fungal: 2, shore: 1 } },
  { slug: "tongue-of-madness", name: "Tongue of madness", w: { tunnels: 0.4, fungal: 0.6, shore: 0.3 }, rare: true },
]

export interface Patch {
  /** Position in the field, 0..1 each way, for the mini-game to draw. */
  x: number
  y: number
  kind: "food" | "reagent"
  /** Food patches are one day of food each; a reagent patch is one catalog item. */
  slug: string | null
  name: string
}

export interface ForageField {
  dc: number
  patches: Patch[]
  /** Seconds the mini-game allows. PROPOSED. */
  seconds: number
  flags: string[]
  note: string
}

/**
 * Lay out what is growing, from a settled forage (lib/camp settleForage).
 * The roll decides what is out there; the mini-game decides what makes it back.
 *   • one food patch per day of food the roll earned (DMG p.111), and
 *   • on a success, 1d4 fungus patches drawn from the biome (PROPOSED count).
 * A failed roll still draws a field — every patch in it is inedible scrub, so
 * the walk is honest about the miss instead of skipping the scene.
 */
export function forageField(opts: {
  success: boolean
  supplies: number
  biome: FieldBiome
  rng: Rng
  /** Catalog slugs that exist. A fungus missing from it is left out and flagged. */
  catalog?: ReadonlySet<string>
  stream?: boolean
}): ForageField {
  const { rng, biome } = opts
  const flags = [
    "Fungus patches (1d4 on a success) and their biome weights are PROPOSED",
    "Only what the character reaches in the mini-game is carried home — PROPOSED",
  ]
  const at = () => ({ x: 0.08 + rng() * 0.84, y: 0.22 + rng() * 0.66 })
  const patches: Patch[] = []
  if (!opts.success) {
    const n = 3 + d(3, rng)
    for (let i = 0; i < n; i++) patches.push({ ...at(), kind: "food", slug: null, name: "Scrub — nothing edible" })
    return { dc: opts.stream ? FORAGE_DC.stream : FORAGE_DC.underdark, patches, seconds: 20, flags, note: "The ground is bare. Nothing here will feed anyone." }
  }
  for (let i = 0; i < Math.max(0, opts.supplies); i++) patches.push({ ...at(), kind: "food", slug: "edible-mushrooms", name: "A day of food" })
  const pool = FUNGI.filter((f) => f.w[biome] > 0 && (!opts.catalog || opts.catalog.has(f.slug)))
  if (opts.catalog) for (const f of FUNGI) if (!opts.catalog.has(f.slug)) flags.push(`${f.name} is not in the catalog — left out`)
  const reagents = pool.length ? d(4, rng) : 0
  for (let i = 0; i < reagents; i++) {
    const f = weighted(pool.map((p) => ({ p, w: p.w[biome] })), rng).p
    patches.push({ ...at(), kind: "reagent", slug: f.slug, name: f.name })
  }
  const found = patches.filter((p) => p.kind === "reagent").map((p) => p.name)
  return {
    dc: opts.stream ? FORAGE_DC.stream : FORAGE_DC.underdark,
    patches,
    seconds: 30,
    flags,
    note: `${opts.supplies} day${opts.supplies === 1 ? "" : "s"} of food out there${found.length ? `, and ${found.join(", ")}` : ""}.`,
  }
}

/** What the forager carried home: the patches they reached, as ledger lines. */
export function forageHaul(field: ForageField, picked: number[]): { supplies: number; items: { slug: string; quantity: number }[]; missed: number; note: string } {
  const got = new Set(picked.filter((i) => i >= 0 && i < field.patches.length))
  let supplies = 0
  const items = new Map<string, number>()
  for (const i of got) {
    const p = field.patches[i]
    if (p.kind === "food" && p.slug) supplies += 1
    else if (p.kind === "reagent" && p.slug) items.set(p.slug, (items.get(p.slug) ?? 0) + 1)
  }
  const worth = field.patches.filter((p) => p.slug).length
  const missed = worth - [...got].filter((i) => field.patches[i].slug).length
  const list = [...items].map(([s, q]) => `${q}× ${FUNGI.find((f) => f.slug === s)?.name ?? s}`)
  return {
    supplies,
    items: [...items].map(([slug, quantity]) => ({ slug, quantity })),
    missed,
    note: worth === 0
      ? "Nothing worth carrying."
      : `${supplies} day${supplies === 1 ? "" : "s"} of food${list.length ? ` and ${list.join(", ")}` : ""}${missed ? `; ${missed} left behind` : ""}.`,
  }
}

// ============================================================================
// HUNT — prey, the stalk, and what else is out there
// ============================================================================

export interface Prey {
  /** bestiary.slug */
  slug: string
  name: string
  w: Record<FieldBiome, number>
  /** A catalog item the carcass gives besides the meat, when there is one. */
  byproduct?: string
}

/**
 * Bestiary beasts whose habitat includes the Underdark wilds and that a hunter
 * would eat. Deep rothé yields its leather (catalog: deep-rothe-leather).
 * Weights PROPOSED.
 */
export const PREY: readonly Prey[] = [
  { slug: "giant-rat", name: "Giant rat", w: { tunnels: 4, fungal: 2, shore: 2 } },
  { slug: "giant-fire-beetle", name: "Giant fire beetle", w: { tunnels: 3, fungal: 4, shore: 1 } },
  { slug: "giant-bat", name: "Giant bat", w: { tunnels: 2, fungal: 1, shore: 2 } },
  { slug: "deep-rothe", name: "Deep rothé", w: { tunnels: 1, fungal: 3, shore: 2 }, byproduct: "deep-rothe-leather" },
]

export function choosePrey(biome: FieldBiome, rng: Rng, bestiary?: ReadonlySet<string>): { prey: Prey | null; flags: string[] } {
  const pool = PREY.filter((p) => !bestiary || bestiary.has(p.slug))
  const flags = ["Prey list and weights are PROPOSED"]
  if (!pool.length) return { prey: null, flags: [...flags, "No prey in the bestiary — the DM describes the hunt"] }
  return { prey: weighted(pool.map((p) => ({ p, w: p.w[biome] })), rng).p, flags }
}

/**
 * Noise from the stalk. Every time the prey catches the hunter moving it raises
 * the noise by one. PROPOSED: each point of noise widens the danger roll by one
 * (the book's encounter band is 16–20 for creatures; 3 noise makes it 13–20).
 */
export const MAX_NOISE = 4

export interface HuntDanger {
  /** The d20 on OotA's Random Encounters table, before and after noise. */
  roll: number
  adjusted: number
  /** Null when nothing comes. */
  creature: null | {
    result: string
    /** bestiary name, when the row names one — else the DM's to describe. */
    bestiary: string | null
    count: number
    via: string[]
  }
  flags: string[]
  note: string
}

/**
 * Does anything find the hunter? OotA-Enc p.30: 16–20 on the d20 brings
 * creatures (14–15 is terrain only, not a threat to a lone hunter). A creature
 * result rolls on Creature Encounters (p.32); "Ambushers" rolls again on the
 * ambush table. Rows come from the database (encounter_table_rows) so the book
 * is the one in Supabase, not a copy here.
 */
export function huntDanger(rows: readonly EncounterTableRow[], noise: number, rng: Rng): HuntDanger {
  const flags = ["Noise widening the encounter band is PROPOSED"]
  const n = Math.max(0, Math.min(MAX_NOISE, Math.trunc(noise)))
  const roll = d(20, rng)
  const adjusted = Math.min(20, roll + n)
  const threshold = 16
  if (adjusted < threshold) return { roll, adjusted, creature: null, flags, note: "Nothing else is hunting tonight." }
  const via = ["underdark_random"]
  const lookup = (key: string, r: number) => rows.find((x) => x.table_key === key && r >= x.roll_min && r <= x.roll_max)
  let row = lookup("underdark_creature", d(20, rng))
  via.push("underdark_creature")
  if (row && ((row.detail ?? {}) as { rolls?: string[] }).rolls?.includes("underdark_ambush")) {
    row = lookup("underdark_ambush", d(20, rng))
    via.push("underdark_ambush")
  }
  if (!row) return { roll, adjusted, creature: null, flags: [...flags, "Encounter rows missing — the DM decides"], note: "Something moves out there. The DM decides what." }
  const detail = (row.detail ?? {}) as { bestiary?: string; count?: number | string }
  const count = rollCount(detail.count ?? 1, rng)
  const bestiary = detail.bestiary ?? null
  if (!bestiary) flags.push(`"${row.result}" names no stat block — the DM stages it`)
  return {
    roll, adjusted, creature: { result: row.result, bestiary, count, via }, flags,
    note: `The hunter is not alone: ${row.result}${bestiary && count > 1 ? ` (${count})` : ""}.`,
  }
}

/**
 * Passive Perception from a bestiary row: the senses line when it lists one,
 * else 10 + its Perception bonus (skills may be "Perception +4" text or an
 * object), else 10 + WIS modifier. Null when the row has no stats at all —
 * several OotA creatures are still stubs, and a guessed number would be an
 * invented stat block.
 */
export function passivePerception(b: { wis?: number | null; skills?: Record<string, number> | string | null; senses?: string | null }): number | null {
  const listed = /passive perception\s*(\d+)/i.exec(b.senses ?? "")
  if (listed) return Number(listed[1])
  let perc: number | undefined
  if (typeof b.skills === "string") { const m = /perception\s*([+-]\d+)/i.exec(b.skills); if (m) perc = Number(m[1]) }
  else if (b.skills && typeof b.skills === "object") perc = b.skills.Perception ?? b.skills.perception
  if (typeof perc === "number") return 10 + perc
  if (typeof b.wis === "number") return 10 + Math.floor((b.wis - 10) / 2)
  return null
}

/**
 * SRD Hiding: the hunter's Stealth total against the creature's passive
 * Perception. Beat it and the hunter slips back to camp with the kill; fail
 * and they are caught — the fight starts where they stand.
 */
export function slipAway(hunter: string, stealthTotal: number, creature: { name: string; passive: number | null }): { caught: boolean | null; note: string } {
  if (creature.passive == null) return { caught: null, note: `${creature.name} has no stat block yet — the DM rules whether ${hunter} is seen (Stealth ${stealthTotal}).` }
  const caught = Math.trunc(stealthTotal) < creature.passive
  return {
    caught,
    note: caught
      ? `${hunter} is caught — ${creature.name} saw them (Stealth ${stealthTotal} vs passive Perception ${creature.passive}).`
      : `${hunter} slips away from the ${creature.name.toLowerCase()} (Stealth ${stealthTotal} vs passive Perception ${creature.passive}).`,
  }
}

// ============================================================================
// EXPLORE — a room map, seeded from the node
// ============================================================================

export interface ExploreNode {
  node_type: string
  name?: string | null
  metadata?: { explorable?: boolean; seed?: string | number | null } | null
}

/**
 * Whether the fire sits somewhere with ground to explore. PROPOSED rule, no
 * migration: the wild tunnels between places (waypoints) can be explored; a
 * settlement or a tactical map is the DM's scene; `metadata.explorable`
 * overrides either way.
 */
export function explorePermit(node: ExploreNode | null | undefined): { ok: boolean; reason: string } {
  if (!node) return { ok: false, reason: "The party is nowhere the map knows — the DM describes the surroundings." }
  const override = node.metadata?.explorable
  if (override === true) return { ok: true, reason: "The DM opened this place for exploring." }
  if (override === false) return { ok: false, reason: "The DM has closed this place to exploring." }
  if (node.node_type === "waypoint") return { ok: true, reason: "Wild tunnels — there is ground to explore." }
  return { ok: false, reason: `${node.name ?? "This place"} is somewhere people live or a mapped battleground; exploring it is the DM's scene.` }
}

/** A small seeded generator, so a node always explores the same way. */
export function seededRng(seed: string | number): Rng {
  let h = 2166136261
  for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Room {
  x: number
  y: number
  /** Doors: north, east, south, west. */
  doors: { n: boolean; e: boolean; s: boolean; w: boolean }
  /** OotA Terrain Encounters row for this room, when it has a feature. */
  terrain: string | null
  terrainNote: string | null
  isCamp: boolean
}

export interface ExploreMap {
  w: number
  h: number
  rooms: Room[]
  camp: { x: number; y: number }
  flags: string[]
}

/** The size of the classic Zelda overworld is 16×8 screens; a night's walk is a corner of that. PROPOSED. */
export const EXPLORE_SIZE = { w: 5, h: 4 } as const
/** Share of rooms that carry a terrain feature. PROPOSED. */
export const TERRAIN_SHARE = 0.4

/**
 * Build the map: a maze of rooms (every room reachable, a few loops), the camp
 * in the middle of the bottom row, and roughly 40% of rooms carrying a row of
 * OotA's Terrain Encounters table. Same seed, same map.
 */
export function buildExploreMap(seed: string | number, terrainRows: readonly EncounterTableRow[], size: { w: number; h: number } = EXPLORE_SIZE): ExploreMap {
  const rng = seededRng(seed)
  const { w, h } = size
  const at = (x: number, y: number) => y * w + x
  const rooms: Room[] = []
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rooms.push({ x, y, doors: { n: false, e: false, s: false, w: false }, terrain: null, terrainNote: null, isCamp: false })
  const camp = { x: Math.floor(w / 2), y: h - 1 }
  rooms[at(camp.x, camp.y)].isCamp = true
  // Randomised depth-first carve from the camp: every room reachable.
  const seen = new Set<number>([at(camp.x, camp.y)])
  const stack = [camp]
  const link = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const A = rooms[at(a.x, a.y)], B = rooms[at(b.x, b.y)]
    if (b.x > a.x) { A.doors.e = true; B.doors.w = true } else if (b.x < a.x) { A.doors.w = true; B.doors.e = true }
    else if (b.y > a.y) { A.doors.s = true; B.doors.n = true } else { A.doors.n = true; B.doors.s = true }
  }
  const nbrs = (p: { x: number; y: number }) => [
    { x: p.x, y: p.y - 1 }, { x: p.x + 1, y: p.y }, { x: p.x, y: p.y + 1 }, { x: p.x - 1, y: p.y },
  ].filter((q) => q.x >= 0 && q.y >= 0 && q.x < w && q.y < h)
  while (stack.length) {
    const cur = stack[stack.length - 1]
    const open = nbrs(cur).filter((q) => !seen.has(at(q.x, q.y)))
    if (!open.length) { stack.pop(); continue }
    const nx = pick(open, rng)
    link(cur, nx)
    seen.add(at(nx.x, nx.y))
    stack.push(nx)
  }
  // A few loops so it is not a single corridor.
  for (let i = 0; i < Math.round((w * h) / 6); i++) {
    const a = { x: Math.floor(rng() * w), y: Math.floor(rng() * h) }
    const b = pick(nbrs(a), rng)
    link(a, b)
  }
  const terrain = terrainRows.filter((r) => r.table_key === "underdark_terrain")
  for (const r of rooms) {
    if (r.isCamp || !terrain.length || rng() >= TERRAIN_SHARE) continue
    const face = d(20, rng)
    const row = terrain.find((t) => face >= t.roll_min && face <= t.roll_max)
    if (row) { r.terrain = row.result; r.terrainNote = ((row.detail ?? {}) as { note?: string }).note ?? null }
  }
  const flags = [
    `Map size (${w}×${h} rooms), loops and the ${Math.round(TERRAIN_SHARE * 100)}% terrain share are PROPOSED`,
    "Room ground is OotA-Enc p.30 Terrain Encounters; searches roll Ambush Lair Discovery (p.32)",
  ]
  if (!terrain.length) flags.push("No terrain rows supplied — rooms are bare tunnel")
  return { w, h, rooms, camp, flags }
}

/** Search DC for a room. PROPOSED: SRD Typical DCs, medium. */
export const SEARCH_DC = 15

export interface CatalogItem { slug: string; name: string; item_type: string; rarity?: string | null; value?: number | null }

export interface RoomFind {
  /** The check. */
  total: number
  dc: number
  searched: boolean
  /** The d20 on Ambush Lair Discovery, when the search succeeded. */
  face: number | null
  deadEnd: boolean
  result: string
  /** Catalog rows the find resolves to. Empty when the DM must choose. */
  items: { slug: string; name: string; quantity: number }[]
  /** Set when the book's find has no catalog row — the DM picks, nothing is auto-awarded. */
  dmPicks: string | null
  flags: string[]
  note: string
}

/**
 * Search a room: WIS (Perception) or INT (Investigation) against SEARCH_DC.
 * A miss, or a 1–10 on Ambush Lair Discovery, is a dead end. Everything found
 * resolves against the catalog the caller passes in:
 *   weapon corpse → a common nonmagical weapon row (the rusted ones first —
 *                   it has lain there a while; that preference is PROPOSED),
 *   armour corpse → a common armour row,
 *   gems          → only if the catalog holds a gem of that value; else DM,
 *   magic item    → always the DM's pick from the catalog (DMG tables B and C).
 */
export function searchRoom(opts: { who: string; total: number; dc?: number; catalog: readonly CatalogItem[]; discoveryRows: readonly EncounterTableRow[]; rng: Rng; advantage?: boolean }): RoomFind {
  const dc = Math.max(1, Math.trunc(opts.dc ?? SEARCH_DC))
  const flags = [`Search DC ${dc} is PROPOSED (SRD Typical DCs, medium)`]
  const total = Math.trunc(opts.total)
  const base = { total, dc, searched: true, items: [] as RoomFind["items"], dmPicks: null as string | null, flags }
  if (total < dc) return { ...base, face: null, deadEnd: true, result: "Nothing", note: `${opts.who} searches and finds nothing but rock. A dead end.` }
  // A cleared or sneaked-past ambusher lair is what the table is written for; searching one rolls twice, keeps the higher (PROPOSED).
  const face = opts.advantage ? Math.max(d(20, opts.rng), d(20, opts.rng)) : d(20, opts.rng)
  if (opts.advantage) flags.push("Advantage on the lair's discovery roll is PROPOSED")
  const row = opts.discoveryRows.find((r) => r.table_key === "underdark_discovery" && face >= r.roll_min && face <= r.roll_max)
  if (!row || face <= 10) return { ...base, face, deadEnd: true, result: row?.result ?? "Nothing", note: `${opts.who} searches carefully. There is nothing here — a dead end.` }
  const common = (types: string[], prefer?: RegExp) => {
    const pool = opts.catalog.filter((c) => types.includes(c.item_type) && (c.rarity ?? "common") === "common")
    const preferred = prefer ? pool.filter((c) => prefer.test(c.slug)) : []
    return (preferred.length ? preferred : pool)
  }
  const detail = (row.detail ?? {}) as { count?: string | number; value_gp?: number; dmg_table?: string }
  if (/weapon/i.test(row.result)) {
    const pool = common(["weapon"], /^rusted-/)
    if (!pool.length) return { ...base, face, deadEnd: false, result: row.result, dmPicks: "a nonmagical weapon", note: `${opts.who} finds a corpse still gripping a weapon. The DM names it.` }
    const it = pick(pool, opts.rng)
    flags.push("Preferring the rusted weapons for a corpse's blade is PROPOSED")
    return { ...base, face, deadEnd: false, result: row.result, items: [{ slug: it.slug, name: it.name, quantity: 1 }], note: `${opts.who} prises a ${it.name.toLowerCase()} from a dead hand.` }
  }
  if (/armou?r/i.test(row.result)) {
    const pool = common(["armor"]).filter((c) => c.slug !== "rags")
    if (!pool.length) return { ...base, face, deadEnd: false, result: row.result, dmPicks: "a suit of nonmagical armour", note: `${opts.who} finds a corpse in armour. The DM names it.` }
    const it = pick(pool, opts.rng)
    return { ...base, face, deadEnd: false, result: row.result, items: [{ slug: it.slug, name: it.name, quantity: 1 }], note: `${opts.who} strips ${it.name.toLowerCase()} from a corpse that no longer needs it.` }
  }
  if (detail.dmg_table) {
    return { ...base, face, deadEnd: false, result: row.result, dmPicks: row.result, flags: [...flags, "Magic items are the DM's pick from the catalog — nothing is auto-awarded"], note: `${opts.who} finds something that hums. The DM decides what it is.` }
  }
  if (detail.value_gp) {
    const count = rollCount(detail.count ?? 1, opts.rng)
    const gem = opts.catalog.find((c) => /gem/.test(c.slug) && c.value === detail.value_gp)
    if (!gem) return { ...base, face, deadEnd: false, result: row.result, dmPicks: `${count} gem${count === 1 ? "" : "s"} worth ${detail.value_gp} gp each (no such gem in the catalog)`, flags: [...flags, `The catalog has no ${detail.value_gp} gp gem — the DM adds one or picks another`], note: `${opts.who} finds ${count} gem${count === 1 ? "" : "s"} in the dust.` }
    return { ...base, face, deadEnd: false, result: row.result, items: [{ slug: gem.slug, name: gem.name, quantity: count }], note: `${opts.who} finds ${count} ${gem.name.toLowerCase()}${count === 1 ? "" : "s"} in the dust.` }
  }
  return { ...base, face, deadEnd: false, result: row.result, dmPicks: row.result, note: `${opts.who} finds: ${row.result.toLowerCase()}. The DM describes it.` }
}

/**
 * The walk itself is not free. PROPOSED: every third new room entered, the
 * explorer rolls OotA's Random Encounters (the hunt's danger roll, no noise).
 */
export const EXPLORE_ENCOUNTER_EVERY = 3
export function exploreEncounterDue(roomsEntered: number): boolean {
  return roomsEntered > 0 && roomsEntered % EXPLORE_ENCOUNTER_EVERY === 0
}

// ============================================================================
// THE ZELDA LAYER — hearts, a lantern, things that bite, and a lair (Sam, 9/28:
// "make this game more challenging and fun like a zelda game")
// ============================================================================
//
// Every bite and every swing is a real attack roll: the creature's to-hit and
// damage come from its bestiary row, the hero's from sheet_attacks, AC from the
// sheet. Hit points lost here are hit points lost. What is house rule is how
// the scene is paced (the lantern, the roamers, the lair) and it is flagged.

export interface Striker { name: string; toHit: number; damage: string }

/** "1d4+3", "1d6-1", "2d6", "2" → dice. Null when there is nothing to roll. */
export function parseDice(expr: string | null | undefined): { n: number; d: number; mod: number } | null {
  const t = String(expr ?? "").replace(/\s+/g, "")
  const m = /(\d+)d(\d+)([+-]\d+)?/i.exec(t)
  if (m) return { n: Number(m[1]), d: Number(m[2]), mod: Number(m[3] ?? 0) }
  const flat = /^([+-]?\d+)/.exec(t)
  return flat ? { n: 0, d: 0, mod: Number(flat[1]) } : null
}

/** A bestiary action row → a striker. The damage is the dice in brackets: "Hit: 4 (1d4+2) piercing." */
export function strikerFromBestiary(row: { name: string; actions?: { name?: string; to_hit?: string | number; desc?: string }[] | null }): Striker | null {
  const a = (row.actions ?? []).find((x) => x && x.to_hit != null && /\(\s*\d+d\d+/.test(x.desc ?? ""))
  if (!a) return null
  const dice = /\(\s*(\d+d\d+\s*[+-]?\s*\d*)\s*\)/.exec(a.desc ?? "")
  return { name: `${row.name} — ${a.name ?? "attack"}`, toHit: Number(String(a.to_hit).replace("+", "")) || 0, damage: (dice?.[1] ?? "").replace(/\s+/g, "") }
}

/** A sheet_attacks row ({hit:"+5", damage:"1d4+3 piercing"}) → a striker. */
export function strikerFromSheet(att: { name: string; hit: string | number; damage: string }): Striker {
  return { name: att.name, toHit: Number(String(att.hit).replace("+", "")) || 0, damage: String(att.damage).split(/\s/)[0] }
}

export interface AttackRoll { face: number; total: number; hit: boolean; crit: boolean; damage: number; note: string }

/** SRD: d20 + to-hit against AC; a 20 always hits and doubles the dice, a 1 always misses. Damage never below 1 on a hit... unless the dice say 0. */
export function rollAttack(a: Striker, targetAC: number, rng: Rng): AttackRoll {
  const face = d(20, rng)
  const total = face + a.toHit
  const crit = face === 20
  const hit = face !== 1 && (crit || total >= targetAC)
  let damage = 0
  const dice = parseDice(a.damage)
  if (hit && dice) {
    for (let i = 0; i < dice.n * (crit ? 2 : 1); i++) damage += d(dice.d, rng)
    damage = Math.max(0, damage + dice.mod)
  }
  return { face, total, hit, crit, damage, note: hit ? `${a.name}: ${total} vs AC ${targetAC} — ${crit ? "critical, " : ""}${damage} damage` : `${a.name}: ${total} vs AC ${targetAC} — miss` }
}

/** Vermin that roam the tunnels near camp. Bestiary slugs; PROPOSED weights. */
export const ROAMERS: readonly { slug: string; name: string; w: Record<FieldBiome, number> }[] = [
  { slug: "giant-rat", name: "Giant rat", w: { tunnels: 4, fungal: 2, shore: 3 } },
  { slug: "giant-fire-beetle", name: "Giant fire beetle", w: { tunnels: 2, fungal: 4, shore: 1 } },
  { slug: "giant-bat", name: "Giant bat", w: { tunnels: 1, fungal: 1, shore: 2 } },
]

/** 0–3 roamers in a room, usually some (PROPOSED), seeded by room so a room keeps its vermin. None in camp. */
export function roomRoamers(seed: string | number, biome: FieldBiome, isCamp: boolean): string[] {
  if (isCamp) return []
  const rng = seededRng(`${seed}:roam`)
  const n = rng() < 0.2 ? 0 : 1 + Math.floor(rng() * 3)
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(weighted(ROAMERS.map((r) => ({ r, w: r.w[biome] })), rng).r.slug)
  return out
}

/** Lantern oil for one evening's walk, in seconds of play. PROPOSED. */
export const LANTERN_SECONDS = 150

/**
 * The lair — the room farthest from camp (by doors walked, then by seed). Its
 * occupant is rolled on OotA's Ambushers table; the Ambush Lair Discovery
 * table is literally written for searching it.
 */
export function lairRoom(map: ExploreMap): { x: number; y: number } {
  const key = (x: number, y: number) => `${x},${y}`
  const dist = new Map<string, number>([[key(map.camp.x, map.camp.y), 0]])
  const q = [map.camp]
  let far = map.camp
  while (q.length) {
    const c = q.shift()!
    const r = map.rooms[c.y * map.w + c.x]
    const next = [r.doors.n && { x: c.x, y: c.y - 1 }, r.doors.e && { x: c.x + 1, y: c.y }, r.doors.s && { x: c.x, y: c.y + 1 }, r.doors.w && { x: c.x - 1, y: c.y }].filter(Boolean) as { x: number; y: number }[]
    for (const n of next) {
      if (dist.has(key(n.x, n.y))) continue
      dist.set(key(n.x, n.y), dist.get(key(c.x, c.y))! + 1)
      q.push(n)
      if (dist.get(key(n.x, n.y))! > dist.get(key(far.x, far.y))!) far = n
    }
  }
  return far
}

/** Who lurks in the lair: OotA-Enc p.32 Ambushers, from the database rows. */
export function lairOccupant(rows: readonly EncounterTableRow[], rng: Rng): { result: string; bestiary: string | null; count: number; face: number } | null {
  const face = d(20, rng)
  const row = rows.find((r) => r.table_key === "underdark_ambush" && face >= r.roll_min && face <= r.roll_max)
  if (!row) return null
  const det = (row.detail ?? {}) as { bestiary?: string; count?: number | string }
  return { result: row.result, bestiary: det.bestiary ?? null, count: rollCount(det.count ?? 1, rng), face }
}

// ============================================================================
// THE OVERWORLD — one big cave map, screen by screen (Sam, 9/28: "much larger
// maps where a large grid does not guarantee finding anything … tunnels and
// rivers (harder to cross), more terrain … like a Zelda map … timing is an
// issue")
// ============================================================================
//
// The world is a grid of VERTICES (the Wang tiles are drawn between them).
// Caverns joined by winding tunnels are carved out of solid rock; underground
// rivers run across it (deep water stops you; fords let you wade, slowly); a
// chasm splits it (rope bridges cross it). A handful of places are worth
// searching and most of the map is not. Everything is seeded: same seed, same
// world. All of it — sizes, counts, speeds, the clock — is PROPOSED.

export const T = { WALL: 0, FLOOR: 1, DEEP: 2, FORD: 3, CHASM: 4, BRIDGE: 5, WEB: 6, MUCK: 7 } as const
export type Tile = (typeof T)[keyof typeof T]
export const passable = (t: number) => t === T.FLOOR || t === T.FORD || t === T.BRIDGE || t === T.WEB || t === T.MUCK
/** Wading, webs and muck slow you (PROPOSED: half speed, webs a third — the book halves travel pace in webs). */
export const slowFactor = (t: number) => (t === T.FORD ? 0.45 : t === T.WEB ? 0.35 : t === T.MUCK ? 0.4 : 1)

/** One screen is 15×9 cells (a Zelda screen); the world is 8×6 screens. PROPOSED. */
export const SCREEN = { cw: 15, ch: 9 } as const
export const WORLD_SCREENS = { nx: 8, ny: 6 } as const

export interface WorldPoi { x: number; y: number; kind: "cache" | "lair"; look: string }
export interface WorldFeature { x: number; y: number; terrain: string }
export interface ExploreWorld {
  cols: number; rows: number; grid: number[]
  camp: { x: number; y: number }
  pois: WorldPoi[]; lair: { x: number; y: number }
  features: WorldFeature[]
  screens: { nx: number; ny: number; cw: number; ch: number }
  flags: string[]
}

export function tileAt(w: ExploreWorld, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= w.cols || y >= w.rows) return T.WALL
  return w.grid[y * w.cols + x]
}

export function buildExploreWorld(seed: string | number, terrainRows: readonly EncounterTableRow[], size: { nx: number; ny: number } = WORLD_SCREENS): ExploreWorld {
  const rng = seededRng(`${seed}:world`)
  const cols = size.nx * SCREEN.cw + 1, rows = size.ny * SCREEN.ch + 1
  const g = new Array<number>(cols * rows).fill(T.WALL)
  const at = (x: number, y: number) => y * cols + x
  const inside = (x: number, y: number) => x >= 2 && y >= 2 && x < cols - 2 && y < rows - 2
  const set = (x: number, y: number, t: number) => { if (inside(x, y)) g[at(x, y)] = t }
  const get = (x: number, y: number) => (x < 0 || y < 0 || x >= cols || y >= rows ? T.WALL : g[at(x, y)])
  const carveTo = (x: number, y: number) => {
    if (!inside(x, y)) return
    const t = g[at(x, y)]
    g[at(x, y)] = t === T.DEEP ? T.FORD : t === T.CHASM ? T.BRIDGE : t === T.WALL ? T.FLOOR : t
  }
  const disc = (cx: number, cy: number, r: number, t: number, rough = 1.2) => {
    for (let y = Math.floor(cy - r - 2); y <= cy + r + 2; y++) for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
      if (Math.hypot(x - cx, (y - cy) * 1.15) <= r + rng() * rough) (t === T.FLOOR ? carveTo(x, y) : set(x, y, t))
    }
  }
  // 1. Caverns. Camp sits bottom-middle.
  const camp = { x: Math.floor(size.nx / 2) * SCREEN.cw - 8, y: rows - 6 }
  const centers = [camp]
  for (let i = 0; i < size.nx * size.ny * 0.8; i++) centers.push({ x: 5 + Math.floor(rng() * (cols - 10)), y: 5 + Math.floor(rng() * (rows - 10)) })
  centers.forEach((c, i) => disc(c.x, c.y, i === 0 ? 4 : 2.5 + rng() * 3.5, T.FLOOR))
  // 2. Tunnels: a spanning tree over the caverns, plus a few loops; each tunnel wanders.
  const linked = new Set([0]), edges: [number, number][] = []
  while (linked.size < centers.length) {
    let best: [number, number] | null = null, bd = Infinity
    for (const a of linked) for (let b = 0; b < centers.length; b++) if (!linked.has(b)) { const d2 = Math.hypot(centers[a].x - centers[b].x, centers[a].y - centers[b].y); if (d2 < bd) { bd = d2; best = [a, b] } }
    edges.push(best!); linked.add(best![1])
  }
  for (let i = 0; i < 4; i++) edges.push([Math.floor(rng() * centers.length), Math.floor(rng() * centers.length)])
  const tunnel = (a: { x: number; y: number }, b: { x: number; y: number }, wide = rng() < 0.3) => {
    let x = a.x, y = a.y, n = 0
    while ((x !== b.x || y !== b.y) && n++ < 2000) {
      if (rng() < 0.72) { if (rng() < 0.5 && x !== b.x) x += Math.sign(b.x - x); else if (y !== b.y) y += Math.sign(b.y - y); else x += Math.sign(b.x - x) }
      else { x += rng() < 0.5 ? -1 : 1; y += rng() < 0.5 ? -1 : 1 }
      x = Math.max(2, Math.min(cols - 3, x)); y = Math.max(2, Math.min(rows - 3, y))
      carveTo(x, y); carveTo(x + 1, y); if (wide) { carveTo(x, y + 1); carveTo(x + 1, y + 1) }
    }
  }
  for (const [a, b] of edges) if (a !== b) tunnel(centers[a], centers[b])
  // 3. Rivers: meander left→right; deep water with fords. Banks are opened so water never touches rock.
  const riverCount = 1 + (rng() < 0.6 ? 1 : 0)
  const rivers: { x: number; y: number }[][] = []
  for (let r = 0; r < riverCount; r++) {
    const base = Math.floor(rows * (r === 0 ? 0.33 : 0.66) + (rng() - 0.5) * 6)
    let y = base, drift = 0
    const path: { x: number; y: number }[] = []
    for (let x = 3; x < cols - 3; x++) {
      drift = Math.max(-1, Math.min(1, drift + (rng() - 0.5) * 0.7 - (y - base) * 0.03)); y = Math.max(5, Math.min(rows - 6, Math.round(y + drift)))
      path.push({ x, y })
      if (Math.abs(x - camp.x) < 6 && Math.abs(y - camp.y) < 6) continue
      for (let dy = -1; dy <= 1; dy++) set(x, y + dy, T.DEEP)
    }
    rivers.push(path)
  }
  // 4. A chasm top→bottom, crossed by rope bridges.
  const cbase = Math.floor(cols * (0.2 + rng() * 0.6))
  let cx = cbase, cdrift = 0
  const chasm: { x: number; y: number }[] = []
  for (let y = 3; y < rows - 3; y++) {
    cdrift = Math.max(-1, Math.min(1, cdrift + (rng() - 0.5) * 0.8 - (cx - cbase) * 0.04)); cx = Math.max(6, Math.min(cols - 7, Math.round(cx + cdrift)))
    chasm.push({ x: cx, y })
    if (Math.abs(y - camp.y) < 5 && Math.abs(cx - camp.x) < 8) continue
    for (let dx = 0; dx <= 1; dx++) if (get(cx + dx, y) !== T.DEEP) set(cx + dx, y, T.CHASM)
  }
  // 5. Every cavern gets its feature from OotA's Terrain Encounters (p.30). Webs and muck are ground you wade through.
  const terr = terrainRows.filter((t) => t.table_key === "underdark_terrain")
  const features: WorldFeature[] = []
  centers.slice(1).forEach((c) => {
    if (!terr.length || rng() < 0.35) return
    const face = 1 + Math.floor(rng() * 20)
    const row = terr.find((t) => face >= t.roll_min && face <= t.roll_max)
    if (!row) return
    features.push({ x: c.x, y: c.y, terrain: row.result })
    if (/web/i.test(row.result)) disc(c.x, c.y, 3, T.WEB, 1.5)
    if (/muck/i.test(row.result)) disc(c.x, c.y, 2.2, T.MUCK, 1)
  })
  // 6. Banks: rock never touches water or the chasm edge (the tileset draws one transition per cell).
  const bank = () => {
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const t = g[at(x, y)]
      if (t === T.DEEP || t === T.FORD || t === T.CHASM || t === T.BRIDGE) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (get(x + dx, y + dy) === T.WALL) set(x + dx, y + dy, T.FLOOR)
    }
  }
  bank()
  // 7. Fords and bridges where tunnels meet water, then make sure everything is reachable from camp.
  for (const path of rivers) for (let k = 0; k < 3; k++) { const p = path[Math.floor((k + 0.3 + rng() * 0.4) / 3 * path.length)]; for (let dx = 0; dx < 3; dx++) for (let dy = -2; dy <= 2; dy++) if (get(p.x + dx, p.y + dy) === T.DEEP) set(p.x + dx, p.y + dy, T.FORD) }
  for (let k = 0; k < 2; k++) { const p = chasm[Math.floor((k + 0.3 + rng() * 0.4) / 2 * chasm.length)]; for (let dx = -1; dx <= 2; dx++) if (get(p.x + dx, p.y) === T.CHASM) set(p.x + dx, p.y, T.BRIDGE) }
  const reach = () => {
    const seen = new Uint8Array(cols * rows), q = [camp]; seen[at(camp.x, camp.y)] = 1
    while (q.length) { const c = q.shift()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = c.x + dx, ny = c.y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const i = at(nx, ny); if (seen[i] || !passable(g[i])) continue; seen[i] = 1; q.push({ x: nx, y: ny }) } }
    return seen
  }
  set(camp.x, camp.y, T.FLOOR)
  for (let pass = 0; pass < 6; pass++) {
    const seen = reach()
    let lost: { x: number; y: number } | null = null
    for (let i = 0; i < g.length && !lost; i++) if (passable(g[i]) && !seen[i]) lost = { x: i % cols, y: Math.floor(i / cols) }
    if (!lost) break
    let near = camp, nd = Infinity
    for (let i = 0; i < g.length; i += 3) if (seen[i]) { const x = i % cols, y = Math.floor(i / cols), d2 = Math.abs(x - lost.x) + Math.abs(y - lost.y); if (d2 < nd) { nd = d2; near = { x, y } } }
    tunnel(lost, near, true); bank()
  }
  // Anything still cut off goes back to rock, so the map never shows ground you cannot reach.
  const seen = reach()
  for (let i = 0; i < g.length; i++) if (passable(g[i]) && !seen[i]) g[i] = T.WALL
  bank()
  // 8. Places worth a look: few, far apart, far from camp. The lair is the farthest reachable ground.
  const dist = new Int32Array(cols * rows).fill(-1); { const q = [camp]; dist[at(camp.x, camp.y)] = 0; while (q.length) { const c = q.shift()!; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = c.x + dx, ny = c.y + dy; if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue; const i = at(nx, ny); if (dist[i] >= 0 || !passable(g[i])) continue; dist[i] = dist[at(c.x, c.y)] + 1; q.push({ x: nx, y: ny }) } } }
  let lair = camp, ld = 0
  for (let i = 0; i < g.length; i++) if (g[i] === T.FLOOR && dist[i] > ld) { ld = dist[i]; lair = { x: i % cols, y: Math.floor(i / cols) } }
  const pois: WorldPoi[] = [{ ...lair, kind: "lair", look: "skull-pile" }]
  const looks = ["remains-bone-pile", "dead-human", "dead-drow", "dead-duergar", "sack-pile", "rubble-pile", "dead-orc"]
  for (let tries = 0; tries < 4000 && pois.length < 1 + CACHE_COUNT; tries++) {
    const x = 3 + Math.floor(rng() * (cols - 6)), y = 3 + Math.floor(rng() * (rows - 6)), i = at(x, y)
    if (g[i] !== T.FLOOR || dist[i] < 14) continue
    if (pois.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < 16)) continue
    pois.push({ x, y, kind: "cache", look: looks[Math.floor(rng() * looks.length)] })
  }
  return {
    cols, rows, grid: g, camp, pois, lair, features: features.filter((f) => passable(tileAt({ cols, rows, grid: g } as ExploreWorld, f.x, f.y))),
    screens: { nx: size.nx, ny: size.ny, cw: SCREEN.cw, ch: SCREEN.ch },
    flags: [
      `World ${size.nx}×${size.ny} screens, ${riverCount} river${riverCount > 1 ? "s" : ""}, one chasm, ${CACHE_COUNT} searchable spots — all PROPOSED`,
      "Wading a ford, webs and muck slow you; deep water and the chasm stop you — PROPOSED",
      "Cavern terrain is OotA-Enc p.30; a spot's search rolls Ambush Lair Discovery (p.32), and most spots hold nothing",
    ],
  }
}

/** Searchable spots on the map besides the lair. Few on purpose (Sam: a big map need not give anything). PROPOSED. */
export const CACHE_COUNT = 7

/**
 * The clock. The lantern holds LANTERN_WORLD_SECONDS of oil; every
 * HOUR_SECONDS of walking is an hour of the night and brings OotA's Random
 * Encounters roll. Caught out when the oil runs dry, the explorer stumbles
 * back and takes a level of exhaustion (SRD). All PROPOSED.
 */
export const LANTERN_WORLD_SECONDS = 300
export const HOUR_SECONDS = 60
export function lostInTheDark(name: string): { exhaustion: 1; note: string; flag: string } {
  return { exhaustion: 1, note: `${name}'s lantern dies far from the fire. Feeling along cold rock for hours, ${name} stumbles back at last — one level of Exhaustion.`, flag: "Lost in the dark costs one level of Exhaustion (SRD condition) — PROPOSED" }
}
