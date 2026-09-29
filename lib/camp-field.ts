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
  /** A catch that lives in water — the mini-game sets it at a river's edge. */
  water?: boolean
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
  /** The map has water to set fish and eels beside. Default true. */
  water?: boolean
  /** Rare fungi already picked tonight — they don't grow back (Sam, 2026-09-29). */
  taken?: ReadonlySet<string>
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
  for (let i = 0; i < Math.max(0, opts.supplies); i++) {
    const c = rng() < CATCH_SHARE ? pickCatch(biome, rng, { catalog: opts.catalog, water: opts.water !== false }) : null
    patches.push(c ? { ...at(), kind: "food", slug: c.slug, name: c.name, water: c.water || undefined } : { ...at(), kind: "food", slug: "edible-mushrooms", name: "A day of food" })
  }
  const pool = FUNGI.filter((f) => f.w[biome] > 0 && (!opts.catalog || opts.catalog.has(f.slug)) && !(f.rare && opts.taken?.has(f.slug)))
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

export type PreyRarity = "common" | "uncommon" | "rare" | "very rare"

export interface Prey {
  /** bestiary.slug */
  slug: string
  name: string
  /** Weight inside its rarity tier, per biome. */
  w: Record<FieldBiome, number>
  rarity: PreyRarity
  /** A catalog item the carcass gives besides the meat, when there is one. */
  byproduct?: string
  /** Days of food a clean kill gives. Absent: the foraging roll decides (DMG p.111). PROPOSED. */
  food?: number
  /** Spotting the hunter starts a fight instead of a bolt. */
  fightsBack?: boolean
}

/**
 * How often each tier turns up on a hunt (Sam, 2026-09-29: "animals of
 * increasing rarity"). The tier is rolled first, then the animal inside it by
 * biome weight. PROPOSED numbers.
 */
export const PREY_RARITY: Readonly<Record<PreyRarity, number>> = { common: 0.85, uncommon: 0.1, rare: 0.04, "very rare": 0.01 }

/**
 * Bestiary beasts whose habitat includes the Underdark wilds and that a hunter
 * would eat. Every byproduct is a catalog item: deep-rothe-leather,
 * cavern-lizard-meat, steeder-silk-spinneret, spider-venom-gland.
 * Steeders are OotA App. C (the duergar's mounts); the lizard and the giant
 * spider are SRD 5.1. Weights and food are PROPOSED.
 */
export const PREY: readonly Prey[] = [
  { slug: "deep-rothe", name: "Deep rothé", rarity: "common", w: { tunnels: 2, fungal: 4, shore: 3 }, byproduct: "deep-rothe-leather", food: 2 },
  { slug: "giant-lizard", name: "Giant lizard", rarity: "common", w: { tunnels: 4, fungal: 2, shore: 3 }, byproduct: "lizard-oil", food: 2 },
  { slug: "giant-rat", name: "Giant rat", rarity: "common", w: { tunnels: 4, fungal: 2, shore: 2 } },
  { slug: "giant-fire-beetle", name: "Giant fire beetle", rarity: "common", w: { tunnels: 3, fungal: 4, shore: 1 } },
  { slug: "giant-bat", name: "Giant bat", rarity: "common", w: { tunnels: 2, fungal: 1, shore: 2 } },
  { slug: "giant-toad", name: "Giant toad", rarity: "common", w: { tunnels: 1, fungal: 2, shore: 4 }, food: 2 },
  { slug: "male-steeder", name: "Male steeder", rarity: "uncommon", w: { tunnels: 2, fungal: 2, shore: 1 }, byproduct: "steeder-silk-spinneret", food: 2 },
  { slug: "female-steeder", name: "Female steeder", rarity: "rare", w: { tunnels: 1, fungal: 1, shore: 1 }, byproduct: "steeder-silk-spinneret", food: 4, fightsBack: true },
  { slug: "chuul", name: "Chuul", rarity: "rare", w: { tunnels: 0.5, fungal: 0.5, shore: 2 }, food: 3, fightsBack: true },
  { slug: "giant-spider", name: "Giant spider", rarity: "very rare", w: { tunnels: 1, fungal: 1, shore: 1 }, byproduct: "spider-venom-gland", food: 3, fightsBack: true },
]

/**
 * What a carcass is eaten as (Sam, 2026-09-29: named meats instead of "days of food"). One item is one day of food.
 * Every slug is a catalog item. Spider meat for steeders and spiders is PROPOSED — Sam's list doesn't name it.
 */
export const MEAT: Readonly<Record<string, { slug: string; name: string }>> = {
  "deep-rothe": { slug: "rothe-meat", name: "Rothé Meat" },
  "giant-lizard": { slug: "cavern-lizard-meat", name: "Cavern Lizard Meat" },
  "giant-rat": { slug: "rat-meat", name: "Rat Meat" },
  "diseased-giant-rat": { slug: "rat-meat", name: "Rat Meat" },
  "giant-fire-beetle": { slug: "beetle-meat", name: "Giant Beetle Meat" },
  "giant-bat": { slug: "bat-meat", name: "Bat Meat" },
  "giant-toad": { slug: "toad-legs", name: "Giant Toad Legs" },
  "chuul": { slug: "chuul-meat", name: "Chuul Meat" },
  "male-steeder": { slug: "spider-meat", name: "Spider Meat" },
  "female-steeder": { slug: "spider-meat", name: "Spider Meat" },
  "giant-spider": { slug: "spider-meat", name: "Spider Meat" },
}
export function meatFor(slug: string): { slug: string; name: string } | null { return MEAT[slug] ?? null }

// ---------------------------------------------------------------------------- small catches (Sam, 2026-09-29)
export interface Catch { slug: string; name: string; water: boolean; w: Record<FieldBiome, number>; hazard?: "shock" | "venom" }
/** Found while foraging — each is one day of food and a catalog item. Water catches sit at a river's edge. */
export const CATCHES: readonly Catch[] = [
  { slug: "blind-cave-fish", name: "Blind Cave Fish", water: true, w: { tunnels: 1, fungal: 1, shore: 5 } },
  { slug: "albino-eel", name: "Albino Eel", water: true, w: { tunnels: 0.5, fungal: 0.5, shore: 2 }, hazard: "shock" },
  { slug: "cave-crab", name: "Cave Crab", water: true, w: { tunnels: 0.5, fungal: 0.5, shore: 3 } },
  { slug: "cave-crayfish", name: "Cave Crayfish", water: true, w: { tunnels: 1, fungal: 1, shore: 3 } },
  { slug: "subterranean-puffer-fish", name: "Subterranean Puffer Fish", water: true, w: { tunnels: 0.2, fungal: 0.2, shore: 1 }, hazard: "venom" },
  { slug: "cave-crickets", name: "Cave Crickets", water: false, w: { tunnels: 4, fungal: 2, shore: 1 } },
  { slug: "cave-snails", name: "Cave Snails", water: false, w: { tunnels: 2, fungal: 3, shore: 2 } },
  { slug: "shadow-worms", name: "Shadow Worms", water: false, w: { tunnels: 2, fungal: 3, shore: 1 } },
  { slug: "lizard-eggs", name: "Lizard Eggs", water: false, w: { tunnels: 2, fungal: 1, shore: 1 } },
]
/** Share of a successful forage's food that turns up as a named catch instead of mushrooms. PROPOSED. */
export const CATCH_SHARE = 0.5
export function pickCatch(biome: FieldBiome, rng: Rng, o: { catalog?: ReadonlySet<string>; water?: boolean } = {}): Catch | null {
  const pool = CATCHES.filter((c) => c.w[biome] > 0 && (o.water !== false || !c.water) && (!o.catalog || o.catalog.has(c.slug)))
  return pool.length ? weighted(pool.map((c) => ({ c, w: c.w[biome] })), rng).c : null
}
/** An albino eel shocks whoever grabs it: Dex save DC 12 or 1d6 lightning. PROPOSED. */
export const EEL_SAVE_DC = 12
export function catchHazard(slug: string, o: { dexMod: number }, rng: Rng): { hurt: number; note: string | null } {
  const c = CATCHES.find((x) => x.slug === slug)
  if (!c || !c.hazard) return { hurt: 0, note: null }
  if (c.hazard === "venom") return { hurt: 0, note: "A puffer fish: prepared right it is a delicacy; prepared wrong it is a funeral." }
  const roll = d(20, rng), save = roll + o.dexMod
  if (save >= EEL_SAVE_DC) return { hurt: 0, note: `Dexterity save ${save} vs DC ${EEL_SAVE_DC} — the eel's shock misses.` }
  const hurt = d(6, rng)
  return { hurt, note: `Dexterity save ${save} vs DC ${EEL_SAVE_DC} — failed: the eel's shock, ${hurt} lightning.` }
}

export function choosePrey(biome: FieldBiome, rng: Rng, bestiary?: ReadonlySet<string>): { prey: Prey | null; flags: string[] } {
  const pool = PREY.filter((p) => !bestiary || bestiary.has(p.slug))
  const flags = ["Prey list, rarity odds, weights and food are PROPOSED"]
  if (!pool.length) return { prey: null, flags: [...flags, "No prey in the bestiary — the DM describes the hunt"] }
  const tiers = (Object.keys(PREY_RARITY) as PreyRarity[]).filter((t) => pool.some((p) => p.rarity === t && p.w[biome] > 0))
  const tier = tiers.length ? weighted(tiers.map((t) => ({ t, w: PREY_RARITY[t] })), rng).t : null
  const inTier = pool.filter((p) => p.rarity === tier && p.w[biome] > 0)
  return { prey: weighted((inTier.length ? inTier : pool).map((p) => ({ p, w: Math.max(p.w[biome], 0.001) })), rng).p, flags }
}

/** Days of food from a clean kill: the prey's own figure when it has one, else the foraging roll. */
export function preyFood(prey: Pick<Prey, "food">, rolled: number): number {
  return prey.food ?? rolled
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

export interface Striker { name: string; toHit: number; damage: string; /** Extra dice on a hit ("plus 3 (1d6) acid"). */ extra?: string }

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
    const ex = parseDice(a.extra)
    if (ex) { for (let i = 0; i < ex.n * (crit ? 2 : 1); i++) damage += d(ex.d, rng); damage += ex.mod }
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
export const LANTERN_WORLD_SECONDS = 240 // Sam, 9/29: "drops a little faster" (was 300) — PROPOSED
export const HOUR_SECONDS = 60
export function lostInTheDark(name: string): { exhaustion: 1; note: string; flag: string } {
  return { exhaustion: 1, note: `${name}'s lantern dies far from the fire. Feeling along cold rock for hours, ${name} stumbles back at last — one level of Exhaustion.`, flag: "Lost in the dark costs one level of Exhaustion (SRD condition) — PROPOSED" }
}

/**
 * Put things on the overworld: forage patches, a hunter's quarry. Walkable
 * floor only, at least `spacing` vertices apart, between `near` and `far`
 * steps from camp (walking distance, not as the crow flies — a spot just
 * across the river can be a long way round). Same rng, same places.
 */
/** A floor cell with deep water or a ford beside it — where fish, eels and crabs are found. */
export function isShore(w: ExploreWorld, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w.cols || yy >= w.rows) continue; const t = w.grid[yy * w.cols + xx]; if (t === T.DEEP || t === T.FORD) return true }
  return false
}

export function placeOnWorld(w: ExploreWorld, n: number, rng: Rng, opts: { near?: number; far?: number; spacing?: number; shore?: boolean } = {}): { x: number; y: number }[] {
  const near = opts.near ?? 6, far = opts.far ?? Infinity, spacing = opts.spacing ?? 5
  const at = (x: number, y: number) => y * w.cols + x
  const dist = new Int32Array(w.cols * w.rows).fill(-1), q = [w.camp]
  dist[at(w.camp.x, w.camp.y)] = 0
  while (q.length) {
    const c = q.shift()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = c.x + dx, y = c.y + dy
      if (x < 0 || y < 0 || x >= w.cols || y >= w.rows) continue
      const i = at(x, y); if (dist[i] >= 0 || !passable(w.grid[i])) continue
      dist[i] = dist[at(c.x, c.y)] + 1; q.push({ x, y })
    }
  }
  const pool: { x: number; y: number }[] = []
  for (let i = 0; i < w.grid.length; i++) if (w.grid[i] === T.FLOOR && dist[i] >= near && dist[i] <= far && (!opts.shore || isShore(w, i % w.cols, Math.floor(i / w.cols)))) pool.push({ x: i % w.cols, y: Math.floor(i / w.cols) })
  const out: { x: number; y: number }[] = []
  for (let tries = 0; tries < 4000 && out.length < n && pool.length; tries++) {
    const p = pool[Math.floor(rng() * pool.length)]
    if (out.some((o) => Math.abs(o.x - p.x) + Math.abs(o.y - p.y) < spacing)) continue
    if (w.pois.some((o) => Math.abs(o.x - p.x) + Math.abs(o.y - p.y) < 3)) continue
    out.push(p)
  }
  return out
}

// ============================================================================
// CLASS KITS — what each class can do out there (Sam's rules, 2026-09-28)
// ============================================================================
//
// Sam: "Rogues move faster and stab faster. Wizards and sorcerers can fire
// firebolts but can't melee; their cantrip has a cool-down. Warlocks can spam
// eldritch blast but it isn't as strong, and it pushes monsters back. Fighters
// and barbarians hit twice as hard and push back monsters that miss them.
// Clerics can heal themselves three times with healing word and radiate light.
// Bards melee normally and can play music up to three times that puts simple
// monsters to sleep unless attacked. Rangers fire arrows, faster than casters
// cast. Monks melee without weapons at 1.5× and heal 1 HP every 3 seconds of
// meditating. Druids aren't attacked by beasts 75% of the time and can entangle
// a target. Paladins radiate an aura for a few seconds that makes them hit 3×."
//
// These are Sam's house rules for the field game, so they are not flagged as
// proposals. The DICE are the book's: every attack still rolls d20 + bonus
// against AC, and every spell deals its SRD damage before Sam's multiplier.
// A caster fires a ranged attack cantrip they actually KNOW (sheet_spellcasting);
// Fire Bolt is preferred when the sheet has it.

export interface FieldKit {
  cls: string
  /** Walking speed multiplier. */
  moveMul: number
  melee: { can: boolean; cooldown: number; mul: number; unarmedOnly?: boolean; weapon?: { name: string; slug: string; toHit: number; damage: string }; reachMul?: number }
  ranged: null | { name: string; toHit: number; damage: string; cooldown: number; kind: "fire" | "frost" | "necrotic" | "force" | "arrow"; halve?: boolean; knockback?: boolean
    /** Bows only (Sam, 9/28): hold to draw — a shot looses only when fully drawn — and a quiver of 12 for the outing. */
    drawSeconds?: number; ammo?: number }
  heal: null | { name: string; uses: number; dice: string }
  special: null | { kind: "music" | "entangle" | "aura"; name: string; uses?: number; cooldown?: number; seconds?: number; mul?: number; radius?: number }
  /** Extra lantern-light radius, in px. */
  lightBonus: number
  knockbackOnMiss: boolean
  /** Chance a beast leaves this character alone. */
  beastCalm: number
  regen: null | { hp: number; every: number; whileStill: true }
  notes: string[]
}

const mod = (score: number | null | undefined) => Math.floor(((score ?? 10) - 10) / 2)

/** Arrows in a quiver for one outing (Sam, 9/28). */
export const QUIVER = 12

/** SRD ranged attack cantrips, level-1 damage. Order = preference. */
export const RANGED_CANTRIPS: readonly { name: string; damage: string; kind: "fire" | "frost" | "necrotic" | "force" }[] = [
  { name: "Fire Bolt", damage: "1d10", kind: "fire" },
  { name: "Ray of Frost", damage: "1d8", kind: "frost" },
  { name: "Chill Touch", damage: "1d8", kind: "necrotic" },
  { name: "Eldritch Blast", damage: "1d10", kind: "force" },
]

export function fieldKit(c: {
  class?: string | null; str?: number | null; dex?: number | null; wis?: number | null; cha?: number | null; int?: number | null
  prof?: number | null; cantrips?: string[] | null; prepared?: string[] | null; spellAbility?: string | null
  /** Carrying a weapon at all (Sam, 9/28: fighters and paladins take a longsword "if armed"). Defaults to true. */
  armed?: boolean | null
}): FieldKit {
  const cls = (c.class ?? "").trim().toLowerCase()
  const prof = c.prof ?? 2
  const notes: string[] = ["Class kit is Sam's field-game house rule (2026-09-28); the dice are the SRD's"]
  const ab = (c.spellAbility ?? "").toLowerCase()
  const castMod = ab.startsWith("int") ? mod(c.int) : ab.startsWith("wis") ? mod(c.wis) : ab.startsWith("cha") ? mod(c.cha) : cls === "wizard" ? mod(c.int) : cls === "cleric" || cls === "druid" ? mod(c.wis) : mod(c.cha)
  const knows = (n: string) => (c.cantrips ?? []).some((x) => x.toLowerCase() === n.toLowerCase())
  const kit: FieldKit = { cls, moveMul: 1, melee: { can: true, cooldown: 0.45, mul: 1 }, ranged: null, heal: null, special: null, lightBonus: 0, knockbackOnMiss: false, beastCalm: 0, regen: null, notes }
  const armed = c.armed !== false
  // Big weapons swing further (Sam, 9/28 — a house rule: the SRD gives longsword and greataxe no reach property).
  const big = (name: string, slug: string, dice: string, reachMul: number) => { kit.melee.weapon = { name, slug, toHit: prof + mod(c.str), damage: `${dice}${mod(c.str) >= 0 ? "+" : ""}${mod(c.str)}` }; kit.melee.reachMul = reachMul }
  // Bows: SRD shortbow 1d6, longbow 1d8, both + DEX.
  const bow = (name: string, dice: string, cooldown: number, drawSeconds: number) => ({ name, toHit: prof + mod(c.dex), damage: `${dice}+${Math.max(0, mod(c.dex))}`, cooldown, kind: "arrow" as const, drawSeconds, ammo: QUIVER })
  if (cls === "rogue") { kit.moveMul = 1.3; kit.melee.cooldown = 0.25; kit.ranged = bow("Shortbow", "1d6", 0.3, 2.3) }
  if (cls === "wizard" || cls === "sorcerer") {
    kit.melee.can = false
    const known = RANGED_CANTRIPS.filter((r) => r.name !== "Eldritch Blast").find((r) => knows(r.name))
    if (known) kit.ranged = { name: known.name, toHit: prof + castMod, damage: known.damage, cooldown: 1.2, kind: known.kind }
    else notes.push("No ranged attack cantrip on the sheet — nothing to fire")
    if (known && known.name !== "Fire Bolt") notes.push(`Fires ${known.name}: the sheet does not know Fire Bolt`)
  }
  if (cls === "warlock") kit.ranged = { name: "Eldritch Blast", toHit: prof + castMod, damage: "1d10", cooldown: 0.35, kind: "force", halve: true, knockback: true }
  if (cls === "fighter" || cls === "barbarian") { kit.melee.mul = 2; kit.knockbackOnMiss = true }
  if (armed && (cls === "fighter" || cls === "paladin")) big("Longsword", "longsword", "1d8", 1.35)
  if (armed && cls === "barbarian") { big("Greataxe", "greataxe", "1d12", 1.6); kit.melee.cooldown = 0.6 }
  if (cls === "cleric") { /* SRD 5.1 Healing Word at 1st level: 1d4 + spellcasting modifier */ kit.heal = { name: "Healing Word", uses: 3, dice: `1d4+${Math.max(0, castMod)}` }; kit.lightBonus = 170 }
  if (cls === "bard") kit.special = { kind: "music", name: "Song of sleep", uses: 3, radius: 280 }
  // Rangers loose twice as fast as a rogue's bow, and beasts leave them be like a druid (Sam, 9/28).
  if (cls === "ranger") { kit.ranged = bow("Longbow", "1d8", 0.15, 1.4); kit.beastCalm = 0.75 }
  if (cls === "monk") { kit.melee = { can: true, cooldown: 0.35, mul: 1.5, unarmedOnly: true }; kit.regen = { hp: 1, every: 3, whileStill: true } }
  if (cls === "druid") { kit.beastCalm = 0.75; kit.special = { kind: "entangle", name: "Entangle", cooldown: 10, seconds: 6 } }
  if (cls === "paladin") kit.special = { kind: "aura", name: "Radiant aura", seconds: 5, cooldown: 20, mul: 3 }
  return kit
}

/** A ranged or melee hit, then Sam's multiplier (and halving for the blast). Never below 1 on a hit. */
export function kitDamage(base: number, opts: { mul?: number; halve?: boolean }): number {
  if (base <= 0) return 0
  let d = base * (opts.mul ?? 1)
  if (opts.halve) d = d / 2
  return Math.max(1, Math.floor(d))
}

// ---------------------------------------------------------------------------------------------------------------
// Spotting herbs (Sam, 2026-09-28: "characters that have advantage and expertise in foraging / wilderness are more
// likely to identify hard to find herbs"). Walking up to a patch rolls Wisdom (Survival) once: proficiency adds the
// bonus, expertise doubles it (SRD 5.1), advantage rolls 2d20 and keeps the higher. A miss means the forager walks
// past it as ordinary mold. The three spot DCs are PROPOSED: big obvious growths 10, small ones 13, the rare one 16.
// ---------------------------------------------------------------------------------------------------------------

export type SkillLevel = "none" | "proficient" | "expertise"

export const HERB_SPOT_DC = { obvious: 10, small: 13, rare: 16 } as const

const OBVIOUS = new Set(["trillimac", "bluecap", "barrelstalk", "zurkhwood", "ripplebark", "torchstalk", "edible-mushrooms"])

/** How hard a patch is to spot. Food (a day of mushrooms) is always obvious. */
export function herbSpotDC(slug: string | null | undefined): number {
  if (!slug) return HERB_SPOT_DC.obvious
  if (FUNGI.some((f) => f.slug === slug && f.rare)) return HERB_SPOT_DC.rare
  return OBVIOUS.has(slug) ? HERB_SPOT_DC.obvious : HERB_SPOT_DC.small
}

/** Survival from a sheet's `sheet_skill_proficiencies` (keys vary in case: "Survival", "survival"). */
export function skillLevel(profs: Record<string, string> | null | undefined, skill = "survival"): SkillLevel {
  const hit = Object.entries(profs ?? {}).find(([k]) => k.toLowerCase().replace(/[\s_]+/g, "") === skill)
  const v = String(hit?.[1] ?? "").toLowerCase()
  return v.startsWith("expert") ? "expertise" : v.startsWith("prof") ? "proficient" : "none"
}

export function skillBonus(o: { abilityMod: number; prof: number; level: SkillLevel }): number {
  return o.abilityMod + (o.level === "expertise" ? 2 * o.prof : o.level === "proficient" ? o.prof : 0)
}

export interface SpotRoll { rolls: number[]; total: number; dc: number; success: boolean; note: string }

export function spotHerb(o: { abilityMod: number; prof: number; level: SkillLevel; advantage?: boolean; disadvantage?: boolean; dc: number; name: string }, rng: Rng): SpotRoll {
  const adv = !!o.advantage && !o.disadvantage, dis = !!o.disadvantage && !o.advantage
  const rolls = adv || dis ? [d(20, rng), d(20, rng)] : [d(20, rng)]
  const face = adv ? Math.max(...rolls) : dis ? Math.min(...rolls) : rolls[0]
  const total = face + skillBonus(o)
  const success = total >= o.dc
  const how = `${rolls.length > 1 ? `${rolls.join("/")} ${adv ? "adv" : "dis"}` : rolls[0]}${skillBonus(o) >= 0 ? "+" : ""}${skillBonus(o)}${o.level !== "none" ? ` (${o.level})` : ""}`
  return { rolls, total, dc: o.dc, success, note: `Survival ${how} = ${total} vs DC ${o.dc} — ${success ? `spots the ${o.name.toLowerCase()}` : "walks past it: just mold"}` }
}

/** Exact odds of spotting, for the HUD and the tests. */
export function spotChance(o: { abilityMod: number; prof: number; level: SkillLevel; advantage?: boolean; disadvantage?: boolean; dc: number }): number {
  const need = o.dc - skillBonus(o)
  const p = Math.min(1, Math.max(0, (21 - Math.max(1, need)) / 20))
  if (o.advantage && !o.disadvantage) return 1 - (1 - p) * (1 - p)
  if (o.disadvantage && !o.advantage) return p * p
  return p
}


// ---------------------------------------------------------------------------------------------------------------
// Fights on the field map (Sam, 9/28: "fight it right there"). A creature from the encounter tables can be fought in
// the field only when its bestiary row carries a real stat block — AC, HP, speed and at least one melee attack with
// dice. Stub rows (grell, piercer, umber hulk, carrion crawler...) return null: the DM stages those. What the field
// cannot simulate (grapples, paralysis, webs, recharge abilities, thrown javelins) is named in `flags` for the DM.
// ---------------------------------------------------------------------------------------------------------------

export interface FieldRider { ability: string; dc: number; dice: string; half: boolean; type: string }
export interface FieldFoe {
  name: string; ac: number; hp: number; speedFt: number; fly: boolean
  /** One round's attacks, in order. `chainIfHit`: each after the first lands only if the one before hit (the grick). */
  strikes: (Striker & { rider?: FieldRider })[]; chainIfHit: boolean
  flags: string[]
}

const WORDNUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4 }

export function fieldFoe(row: { name: string; ac?: number | null; hp?: number | null; speed?: string | null; actions?: { name?: string; to_hit?: string | number; desc?: string; reach?: string }[] | null }): FieldFoe | null {
  const acts = row.actions ?? []
  if (!row.ac || !row.hp || !acts.length) return null
  const flags: string[] = []
  const toStrike = (a: { name?: string; to_hit?: string | number; desc?: string }) => {
    const desc = a.desc ?? ""
    const dice = /\(\s*(\d+d\d+\s*[+-]?\s*\d*)\s*\)/.exec(desc)
    if (a.to_hit == null || !dice) return null
    const extra = /plus\s+\d+\s*\(\s*(\d+d\d+\s*[+-]?\s*\d*)\s*\)/i.exec(desc)
    const sv = /DC\s*(\d+)\s*(Str|Dex|Con|Int|Wis|Cha)\w*\s*save[^.]*?(\d+)\s*\((\d+d\d+)\)\s*(\w+)(?:[^.]*half)?/i.exec(desc)
    const st: Striker & { rider?: FieldRider } = { name: `${row.name} — ${a.name ?? "attack"}`, toHit: Number(String(a.to_hit).replace("+", "")) || 0, damage: dice[1].replace(/\s+/g, "") }
    if (extra) st.extra = extra[1].replace(/\s+/g, "")
    if (sv) st.rider = { ability: sv[2].toUpperCase().slice(0, 3), dc: Number(sv[1]), dice: sv[4], half: /half/i.test(sv[0]), type: sv[5].toLowerCase() }
    if (/grappl|paralyz|restrain/i.test(desc)) flags.push(`${row.name} ${a.name}: the grapple / paralysis / restraint is not simulated — the DM rules`)
    return st
  }
  const melee = acts.filter((a) => a.to_hit != null && !/recharge/i.test(a.name ?? "") && !/^\s*range\b/i.test(a.desc ?? ""))
  for (const a of acts) if (/recharge/i.test(a.name ?? "") || /^\s*range\b/i.test(a.desc ?? "")) flags.push(`${row.name} ${a.name}: not used in the field — the DM rules`)
  for (const a of melee) if (/ranged/i.test(a.desc ?? "") && /melee or ranged/i.test(a.desc ?? "")) flags.push(`${row.name} ${a.name}: thrown only in melee here`)
  const multi = acts.find((a) => /multiattack/i.test(a.name ?? ""))
  let strikes: (Striker & { rider?: FieldRider })[] = []
  let chainIfHit = false
  if (multi) {
    const desc = (multi.desc ?? "").toLowerCase()
    chainIfHit = /if it hits/.test(desc)
    for (const m of desc.matchAll(/\b(one|two|three|four)\s+([a-z ]+?)\s+attacks?\b/g)) {
      const a = melee.find((x) => m[2].includes((x.name ?? "").toLowerCase()) || (x.name ?? "").toLowerCase().startsWith(m[2].split(" ")[0]))
      const st = a && toStrike(a)
      if (st) for (let i = 0; i < WORDNUM[m[1]]; i++) strikes.push(st)
    }
  }
  if (!strikes.length) { const st = melee.map(toStrike).find(Boolean); if (st) strikes = [st] }
  if (!strikes.length) return null
  const sp = String(row.speed ?? "30 ft.")
  return { name: row.name, ac: row.ac, hp: row.hp, speedFt: Number(/(\d+)\s*ft/.exec(sp)?.[1] ?? 30), fly: /\bfly\b/i.test(sp), strikes, chainIfHit, flags: [...new Set(flags)] }
}


// ---------------------------------------------------------------------------------------------------------------
// Light (Sam, 9/29): "to forage, hunt or explore you need oil or a light source in your party". Catalog slugs only —
// the hooded lantern, a flask of lamp oil, or a torchstalk (OotA p.28: burns a day, but 1 in 6 goes off when lit).
// ---------------------------------------------------------------------------------------------------------------

export interface LightCheck { ok: boolean; source: "lantern" | "oil" | "torchstalk" | null; name: string; note: string }

export function lightFor(packs: readonly Record<string, number>[]): LightCheck {
  const has = (slug: string) => packs.some((p) => (p[slug] ?? 0) > 0)
  if (has("hooded-lantern") && has("lamp-oil")) return { ok: true, source: "lantern", name: "Hooded lantern", note: "A hooded lantern and oil to burn in it." }
  if (has("lamp-oil")) return { ok: true, source: "oil", name: "Flask of lamp oil", note: "Lamp oil and a rag wick — enough light to go out by." }
  if (has("hooded-lantern")) return { ok: false, source: null, name: "Hooded lantern", note: "There's a lantern, but no oil to burn in it." }
  if (has("torchstalk")) return { ok: true, source: "torchstalk", name: "Torchstalk", note: "A torchstalk to light — it burns a full day, if it doesn't go off in your hand (1 in 6)." }
  return { ok: false, source: null, name: "", note: "No one in the party has oil or anything to light. Nobody goes into the Underdark dark." }
}

/** OotA p.28: a lit torchstalk explodes on a 1 in 6 — creatures within 10 ft take 3 (1d6) fire damage. */
export function lightTorchstalk(rng: Rng): { exploded: boolean; damage: number; note: string } {
  if (d(6, rng) !== 1) return { exploded: false, damage: 0, note: "The torchstalk catches and burns steady." }
  const damage = d(6, rng)
  return { exploded: true, damage, note: `The torchstalk goes off in a burst of sparks — ${damage} fire damage.` }
}

// ---------------------------------------------------------------------------------------------------------------
// Morale (Sam, 9/29: "sometimes attacking creatures frightens them and they run"). The DMG's optional morale rule:
// a creature that is hit hard — bloodied (at half its HP or less) or crit — makes a DC 10 Wisdom save or flees.
// Any other hit has a small flat chance to break its nerve (PROPOSED 10%). Mindless things (oozes) never flee.
// ---------------------------------------------------------------------------------------------------------------

export const MORALE_DC = 10
export const MORALE_FLAT = 0.1

export function moraleBreaks(o: { hp: number; max: number; crit?: boolean; wisMod?: number; mindless?: boolean; alreadyTested?: boolean }, rng: Rng): { flees: boolean; note: string } {
  if (o.mindless || o.hp <= 0) return { flees: false, note: "" }
  const bloodied = o.hp <= o.max / 2
  if ((bloodied && !o.alreadyTested) || o.crit) {
    const save = d(20, rng) + (o.wisMod ?? 0)
    return save < MORALE_DC ? { flees: true, note: `Wisdom save ${save} vs DC ${MORALE_DC} — its nerve breaks and it runs` } : { flees: false, note: `Wisdom save ${save} vs DC ${MORALE_DC} — it holds` }
  }
  return rng() < MORALE_FLAT ? { flees: true, note: "the blow spooks it and it bolts" } : { flees: false, note: "" }
}


// ---------------------------------------------------------------------------------------------------------------
// Wild caps and scrub (Sam, 9/29). Picking through the scenery a character did NOT identify:
//   • 1 in 20 it turns up something real — a day of food or a common fungus of the biome.
//   • Otherwise a Constitution save (DC 10, PROPOSED) against whatever it was; on a failure roll 1d4:
//       1 — 4 s of laughing and confusion   2 — lose one heart (2 HP), vomit, poisoned for a minute
//       3 — 5 s of blind fear, running       4 — blind for 4 s
// ---------------------------------------------------------------------------------------------------------------

export const WILD_SAVE_DC = 10
export type WildEffect = "confused" | "poisoned" | "frightened" | "blinded"
export const WILD_EFFECTS: Record<WildEffect, { seconds: number; damage: number; text: string }> = {
  confused: { seconds: 4, damage: 0, text: "laughing and confused" },
  poisoned: { seconds: 60, damage: 2, text: "retching — poisoned" },
  frightened: { seconds: 5, damage: 0, text: "overcome with fear, running blind" },
  blinded: { seconds: 4, damage: 0, text: "blinded" },
}

export function wildForage(o: { conMod: number; biome: FieldBiome; catalog?: ReadonlySet<string> }, rng: Rng): {
  found: null | { slug: string; name: string; kind: "food" | "reagent" }; save: number | null; effect: WildEffect | null; note: string
} {
  if (d(20, rng) === 20) {
    const pool = FUNGI.filter((f) => !f.rare && f.w[o.biome] > 0 && (!o.catalog || o.catalog.has(f.slug)))
    if (!pool.length || rng() < 0.5) return { found: { slug: "edible-mushrooms", name: "a day of food", kind: "food" }, save: null, effect: null, note: "Among the scrub: something edible — a day of food." }
    const f = weighted(pool.map((p) => ({ p, w: p.w[o.biome] })), rng).p
    return { found: { slug: f.slug, name: f.name, kind: "reagent" }, save: null, effect: null, note: `Among the scrub: ${f.name.toLowerCase()}.` }
  }
  const save = d(20, rng) + o.conMod
  if (save >= WILD_SAVE_DC) return { found: null, save, effect: null, note: `Nothing worth taking. Constitution save ${save} vs DC ${WILD_SAVE_DC} — whatever it was, it didn't take.` }
  const effect = (["confused", "poisoned", "frightened", "blinded"] as const)[d(4, rng) - 1]
  return { found: null, save, effect, note: `Constitution save ${save} vs DC ${WILD_SAVE_DC} — failed: ${WILD_EFFECTS[effect].text}.` }
}

// ============================================================================
// CARCASSES — what a kill leaves behind (Sam, 2026-09-29)
// ============================================================================
// "When a monster falls a corpse with arrow or blood should be on the ground. You then can forage to see if any
// meat or rations can be salvaged. This should be a hard roll… Having nature/wilderness skills should help.
// After harvesting, only bones are left. If you don't forage their bodies within a little time their bodies become
// bones. Between bones and bodies there's a stage when flies are around the meat… likely to get spoiled meat…
// which may poison you." Neither the SRD nor the DMG has a butchering rule; every number here is PROPOSED.

export type CarcassStage = "fresh" | "flies" | "bones"

/** Field seconds (the lantern clock) a body stays fresh, and when it is only bones. PROPOSED. */
export const CARCASS_FRESH_SECONDS = 45
export const CARCASS_BONES_SECONDS = 120

export function carcassStage(ageSeconds: number, harvested = false): CarcassStage {
  if (harvested || ageSeconds >= CARCASS_BONES_SECONDS) return "bones"
  return ageSeconds >= CARCASS_FRESH_SECONDS ? "flies" : "fresh"
}

/** Days of food a clean butchering gives, by the creature's size. PROPOSED. */
export const MEAT_BY_SIZE: Readonly<Record<string, number>> = { Tiny: 0, Small: 1, Medium: 1, Large: 2, Huge: 4, Gargantuan: 8 }

/** Creature types nobody eats: nothing to salvage but bones. Humanoids included — the party does not butcher people. */
export const INEDIBLE_TYPES = ["ooze", "undead", "construct", "elemental", "fiend", "celestial", "humanoid", "plant"] as const

/** A hard roll (Sam). Stranger flesh — monstrosities and aberrations — is harder still. PROPOSED. */
export const BUTCHER_DC = 17
export const BUTCHER_STRANGE_DC = 19
/** On a fly-blown body any meat is probably spoiled; spoiled meat calls for a Con save or poisoned. PROPOSED. */
export const SPOILED_CHANCE = 0.6
export const SPOILED_SAVE_DC = 10

export function isEdible(creatureType: string | null | undefined): boolean {
  const t = (creatureType || "").toLowerCase()
  return !INEDIBLE_TYPES.some((x) => t.startsWith(x))
}

export interface ButcherResult {
  /** The named meat, when there is any (one item per day). */
  meat?: { slug: string; name: string } | null
  /** Creature parts cut free (Sam's table) — alchemy and ritual components. */
  parts?: { slug: string; name: string }[]
  stage: CarcassStage
  /** "survival" or "nature" — whichever the character is better at. */
  skill: "survival" | "nature" | null
  check: { rolls: number[]; bonus: number; total: number; dc: number; success: boolean } | null
  food: number
  spoiled: boolean
  poisonSave: { roll: number; total: number; dc: number; success: boolean } | null
  poisoned: boolean
  note: string
}

/**
 * Butcher a carcass. The roll is Wisdom (Survival) or Intelligence (Nature), whichever bonus is higher, so training
 * and expertise count. A fresh body gives meat by size; a fly-blown one gives the same on a success but it is
 * probably spoiled, and handling spoiled meat is a Con save or poisoned. Bones give nothing.
 */
export function butcher(o: {
  stage: CarcassStage; size: string; creatureType?: string | null; name: string
  /** bestiary slug, so the meat can be named */
  slug?: string
  survival: number; nature: number; conMod: number; advantage?: boolean
}, rng: Rng): ButcherResult {
  const none = (note: string): ButcherResult => ({ stage: o.stage, skill: null, check: null, food: 0, spoiled: false, poisonSave: null, poisoned: false, note })
  if (o.stage === "bones") return none(`Only bones are left of the ${o.name.toLowerCase()}.`)
  const parts = partsFor(o.slug)
  const edible = isEdible(o.creatureType)
  if (!edible && !parts.length) return none(`Nothing on the ${o.name.toLowerCase()} anyone would eat.`)
  const meat = edible ? (MEAT_BY_SIZE[o.size] ?? 1) : 0
  if (meat <= 0 && !parts.length) return none(`The ${o.name.toLowerCase()} is too small to be worth the knife.`)
  const skill: "survival" | "nature" = o.nature > o.survival ? "nature" : "survival"
  const bonus = Math.max(o.survival, o.nature)
  const t = (o.creatureType || "").toLowerCase()
  const dc = t.startsWith("monstrosity") || t.startsWith("aberration") ? BUTCHER_STRANGE_DC : BUTCHER_DC
  const rolls = o.advantage ? [d(20, rng), d(20, rng)] : [d(20, rng)]
  const total = Math.max(...rolls) + bonus
  const check = { rolls, bonus, total, dc, success: total >= dc }
  const label = skill === "nature" ? "Intelligence (Nature)" : "Wisdom (Survival)"
  if (!check.success) return { ...none(`${label} ${total} vs DC ${dc} — the ${o.name.toLowerCase()} is hacked apart for nothing worth keeping.`), skill, check }
  const partNote = parts.length ? ` Cut free: ${parts.map((p) => p.name).join(", ")}.` : ""
  if (meat <= 0) return { stage: o.stage, skill, check, food: 0, spoiled: false, poisonSave: null, poisoned: false, meat: null, parts: [...parts], note: `${label} ${total} vs DC ${dc} — no meat worth eating.${partNote}` }
  const named = o.slug ? meatFor(o.slug) : null
  if (o.stage === "fresh") return { meat: named, parts: [...parts], stage: o.stage, skill, check, food: meat, spoiled: false, poisonSave: null, poisoned: false, note: `${label} ${total} vs DC ${dc} — ${meat} day${meat === 1 ? "" : "s"} of meat cut from the ${o.name.toLowerCase()}.${partNote}` }
  const spoiled = rng() < SPOILED_CHANCE
  if (!spoiled) return { meat: named, parts: [...parts], stage: o.stage, skill, check, food: meat, spoiled: false, poisonSave: null, poisoned: false, note: `${label} ${total} vs DC ${dc} — under the flies, ${meat} day${meat === 1 ? "" : "s"} of meat still good.` }
  const roll = d(20, rng), save = roll + o.conMod
  const poisonSave = { roll, total: save, dc: SPOILED_SAVE_DC, success: save >= SPOILED_SAVE_DC }
  return { parts: [...parts], stage: o.stage, skill, check, food: 0, spoiled: true, poisonSave, poisoned: !poisonSave.success,
    note: `${label} ${total} vs DC ${dc} — the meat is spoiled. Constitution save ${save} vs DC ${SPOILED_SAVE_DC}${poisonSave.success ? " — the stench, nothing worse" : " — failed: poisoned"}.` }
}


// ============================================================================
// FISHING GEAR, REGROWTH, SPEAKING WITH ROTHÉ, CREATURE PARTS (Sam, 2026-09-29)
// ============================================================================

/**
 * "Fish can not be caught without a spear, a net, or a fishing rod … won't start unless it is in your inventory."
 * Catalog slugs: fishing-tackle (SRD adventuring gear), net, spear. The best one carried is used. Seconds PROPOSED.
 */
export const FISHING_GEAR = [
  { slug: "fishing-tackle", method: "rod", seconds: 4.2, name: "fishing rod" },
  { slug: "net", method: "net", seconds: 3.2, name: "net" },
  { slug: "spear", method: "spear", seconds: 2.6, name: "spear" },
] as const
export type FishingMethod = (typeof FISHING_GEAR)[number]["method"]
export function fishingGear(pack: Readonly<Record<string, number>> | null | undefined): (typeof FISHING_GEAR)[number] | null {
  return FISHING_GEAR.find((g) => (pack?.[g.slug] ?? 0) > 0) ?? null
}
export function isWaterCatch(slug: string | null | undefined): boolean {
  return !!slug && CATCHES.some((c) => c.slug === slug && c.water)
}

/** "Most common mushrooms will respawn at different places over time. Rare ones don't." Seconds PROPOSED. */
export const COMMON_REGROW_SECONDS = 60
export function regrows(slug: string | null | undefined): boolean {
  if (!slug) return false
  if (slug === "edible-mushrooms") return true
  const f = FUNGI.find((x) => x.slug === slug)
  return !!f && !f.rare
}
export function isRareFungus(slug: string | null | undefined): boolean {
  return !!slug && FUNGI.some((f) => f.slug === slug && f.rare)
}

/**
 * Rothé milk and cheese are delicacies — "a druid or someone able to talk to animals may be awarded it."
 * Speak with Animals is on the bard, druid and ranger lists (SRD); a druid always has it to prepare.
 */
export function canSpeakWithAnimals(o: { cls?: string | null; spells?: readonly string[] | null; effects?: readonly string[] | null }): boolean {
  if ((o.cls || "").toLowerCase() === "druid") return true
  // "If you've consumed a speak to animals ability or somehow can speak to animals" — a potion, a cast spell, a charm
  if ((o.effects ?? []).some((e) => /speak.with.animals/i.test(e))) return true
  return (o.spells ?? []).some((s) => /speak with animals/i.test(s))
}
/**
 * What a calm rothé gives someone it will talk to. "It's still a roll if they even have milk to offer" (Sam):
 * a d20 of ROTHE_MILK_DC or more and it has milk; then, now and then, cheese. Odds PROPOSED.
 */
export const ROTHE_MILK_DC = 11
export const ROTHE_CHEESE_CHANCE = 0.25
export function rotheGift(rng: Rng): { roll: number; hasMilk: boolean; items: { slug: string; name: string; quantity: number }[]; note: string } {
  const roll = d(20, rng)
  if (roll < ROTHE_MILK_DC) return { roll, hasMilk: false, items: [], note: "The rothé listens, but it has no milk to give." }
  const items: { slug: string; name: string; quantity: number }[] = [{ slug: "deep-rothe-milk", name: "Deep Rothé Milk (skin)", quantity: 1 }]
  if (rng() < ROTHE_CHEESE_CHANCE) items.push({ slug: "rothe-cheese", name: "Rothé Cheese", quantity: 1 })
  return { roll, hasMilk: true, items, note: items.length > 1 ? "The rothé lets you milk it — and shows you where the herders left a wheel of cheese." : "The rothé stands still and lets you milk it." }
}

/**
 * Parts harvested from a carcass besides meat (Sam's table, 2026-09-29) — taken on a successful butchering,
 * even from creatures nobody eats. Every slug is a catalog item.
 */
export const PARTS: Readonly<Record<string, readonly { slug: string; name: string }[]>> = {
  "carrion-crawler": [{ slug: "carrion-crawler-mucus", name: "Carrion Crawler Mucus" }],
  "purple-worm": [{ slug: "purple-worm-egg", name: "Purple Worm Egg" }],
  "beholder": [{ slug: "beholder-central-eye", name: "Beholder's Central Eye" }],
  "goristro": [{ slug: "goristro-heart", name: "Goristro Heart" }],
  "giant-spider": [{ slug: "giant-spider-silk", name: "Giant Spider Silk" }],
  "roper": [{ slug: "roper-digestive-juices", name: "Roper Digestive Juices" }],
  "basilisk": [{ slug: "basilisk-phlegm", name: "Basilisk Phlegm" }],
}
export function partsFor(slug: string | null | undefined): readonly { slug: string; name: string }[] { return (slug && PARTS[slug]) || [] }
