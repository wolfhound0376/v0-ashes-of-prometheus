// Loot on the walk (public/velkynvelve-walk), Act 1, Velkynvelve.
//
// Sam, 2026-10-22: "Build all. Shoor's quarters is good. Some gear might be found on people's bodies after killing
// them or may be stolen."
//
// Every entry here is a catalogue slug with a book source. The map does not decide what is in a chest; this file
// does, from the guide (campaign_chunks, OotA ch.1), and the route resolves each slug against `items`. A slug the
// catalogue does not have yet is shown as "not in the catalogue yet" and cannot be taken: nothing is invented.
//
// The party's confiscated gear stays where it already lives, on the "Velkynvelve Equipment Stash" holder
// (lib/confiscation.ts). The containers below are views over it:
//   - Ilvara's chest shows the VALUABLES. The book, area 7: the chest "contains any valuables once held by the
//     characters and NPCs, including any spellbooks, components, focuses, and magic items lost to the adventurers."
//   - Shoor's chest shows the rest. The book does not say where mundane gear went; Sam ruled Shoor's quarters.
//   - Anything the DM has handed to a drow (the `carry` map in the walk-loot world flag) is on that drow instead:
//     on its body when it dies, and in its pockets for a thief.

export type LootEntry = { slug: string; qty: number; note?: string }
export type BookContainer = { node: string; title: string; source: string; stash?: "valuables" | "gear"; entries: LootEntry[] }

export const BOOK_CONTAINERS: Record<string, BookContainer> = {
  "ilvara-chest": {
    node: "7", title: "Ilvara's chest", stash: "valuables",
    source: "OotA ch.1 area 7: \"a silver chain headdress set with small onyx stones, worth 50 gp, and a drawstring bag containing two potions of healing. A small leather purse contains 24 gp, 30 sp, and a small moonstone worth 20 gp, while another purse is Ilvara's spare spell component pouch.\"",
    entries: [
      { slug: "silver-chain-headdress", qty: 1, note: "set with small onyx stones, 50 gp" },
      { slug: "potion-of-healing", qty: 2, note: "in a drawstring bag" },
      { slug: "gold-coin", qty: 24, note: "from the leather purse" },
      { slug: "silver-coin", qty: 30, note: "from the leather purse" },
      { slug: "moonstone", qty: 1, note: "small, 20 gp" },
      { slug: "spell-component-pouch", qty: 1, note: "Ilvara's spare" },
    ],
  },
  "shoor-chest": {
    node: "8", title: "Shoor's chest", stash: "gear",
    source: "Sam's ruling, 2026-10-22: the party's confiscated weapons, armour and packs are kept in Shoor's quarters (the book does not say where).",
    entries: [],
  },
  "barracks-west": {
    node: "2", title: "The west barracks chests",
    source: "OotA ch.1 area 2: \"Each of the six chests in each barracks contains a flask of drow poison used to treat crossbow bolts ... One flask has enough poison to treat 20 bolts. Each chest also contains two sets of clothing and 1d4 items from the Trinkets table.\"",
    entries: [
      { slug: "drow-poison", qty: 6, note: "a flask per chest, each treats 20 bolts" },
      { slug: "common-clothes", qty: 12, note: "two sets per chest" },
    ],
  },
  "barracks-east": {
    node: "2", title: "The east barracks chests",
    source: "OotA ch.1 area 2 (the same six chests, the other cave).",
    entries: [
      { slug: "drow-poison", qty: 6, note: "a flask per chest, each treats 20 bolts" },
      { slug: "common-clothes", qty: 12, note: "two sets per chest" },
    ],
  },
  // The armory, area 10's upper chamber (walk plate "10c"; Sam's editor, 2026-10-24). OotA ch.1 area 10, Treasure: "The
  // armory holds six hand crossbows, twenty cases of twenty hand crossbow bolts each, six chain shirts, six suits of studded
  // leather armor, six shields, six shortswords, ten daggers, four 100-foot coils of silk rope, six bags of caltrops (20 each),
  // two bags of iron spikes (10 each), and two building hammers (not usable as weapons)." Catalogue slugs where the catalogue
  // has the thing (a case of bolts is the catalogue's "bolts-20"); the rest are shown "not in the catalogue yet" until it does.
  "armory-crossbows": {
    node: "10c", title: "The crossbow rack",
    source: "OotA ch.1 area 10, Treasure: six hand crossbows.",
    entries: [{ slug: "hand-crossbow", qty: 6 }],
  },
  "armory-bolts": {
    node: "10c", title: "The cases of bolts",
    source: "OotA ch.1 area 10, Treasure: twenty cases of twenty hand crossbow bolts each.",
    entries: [{ slug: "bolts-20", qty: 20, note: "a case of 20 hand crossbow bolts" }],
  },
  "armory-rope-sacks": {
    node: "10c", title: "Rope and sacks",
    source: "OotA ch.1 area 10, Treasure: four 100-foot coils of silk rope, six bags of caltrops (20 each), two bags of iron spikes (10 each).",
    entries: [
      { slug: "silk-rope", qty: 4, note: "a 100-foot coil (the catalogue's silk rope is 50 ft)" },
      { slug: "bag-of-caltrops", qty: 6, note: "20 caltrops to a bag" },
      { slug: "iron-spikes-bag", qty: 2, note: "10 iron spikes to a bag" },
    ],
  },
  "armory-chain": {
    node: "10c", title: "The chain shirts",
    source: "OotA ch.1 area 10, Treasure: six chain shirts.",
    entries: [{ slug: "chain-shirt", qty: 6 }],
  },
  "armory-studded": {
    node: "10c", title: "The studded leather",
    source: "OotA ch.1 area 10, Treasure: six suits of studded leather armor.",
    entries: [{ slug: "studded-leather-armor", qty: 6 }],
  },
  "armory-shields": {
    node: "10c", title: "The shields",
    source: "OotA ch.1 area 10, Treasure: six shields.",
    entries: [{ slug: "shield", qty: 6 }],
  },
  // ── Hard Labor plates (Sam's paintings, 2026-10-26; claude/Hard_Labor_Module_2026-10-26.md) ──
  // Lift Trouble, OotA Expanded p.45 (community supplement, NOT WotC): "a pouch of vials of sleep poison, a container of
  // fresh fruit, a weapon's belt (containing small throwing darts)". The book gives no counts: the 3 vials and 5 darts
  // are Claude's numbers. "Sleep poison" is read as drow poison, the catalogue row whose effect is unconsciousness.
  // Fresh fruit has no catalogue row, so it shows as "not in the catalogue yet" and cannot be taken.
  "cliff-top-sack": {
    node: "5c", title: "Snagged sack",
    source: "OotA Expanded p.45, Lift Trouble: a container of fresh fruit fell off the lift.",
    entries: [{ slug: "fresh-fruit", qty: 1, note: "a container of it" }],
  },
  "cliff-crate": {
    node: "5c", title: "Split crate",
    source: "OotA Expanded p.45, Lift Trouble: a weapon's belt containing small throwing darts. Count (5) is Claude's.",
    entries: [{ slug: "dart", qty: 5, note: "on a weapon belt" }],
  },
  "cliff-low-sack": {
    node: "5c", title: "Snagged sack, low on the cliff",
    source: "OotA Expanded p.45, Lift Trouble: a pouch of vials of sleep poison. Read as drow poison; count (3) is Claude's.",
    entries: [{ slug: "drow-poison", qty: 3, note: "vials in a pouch" }],
  },
  // The kitchen (plate 3k): what is painted on Sam's plate. The book (OotA p.12) names the chores, not the kit.
  "kitchen-knives": {
    node: "3k", title: "Kitchen knives",
    source: "Sam's kitchen plate, 2026-10-26: three knives and a cleaver painted by the cutting board; the catalogue's nearest row is the dagger.",
    entries: [{ slug: "dagger", qty: 3, note: "kitchen knives" }],
  },
  "kitchen-mushrooms": {
    node: "3k", title: "Mushrooms on the worktable",
    source: "Sam's kitchen plate, 2026-10-26: a pile of pale mushrooms on the worktable.",
    entries: [{ slug: "edible-mushrooms", qty: 1, note: "a handful" }],
  },
  "kitchen-card-table": {
    node: "3k", title: "The card table",
    source: "Sam's kitchen plate, 2026-10-26: a card game left mid-hand.",
    entries: [{ slug: "gaming-set-cards", qty: 1, note: "the drow's deck" }],
  },
  "armory-blades": {
    node: "10c", title: "The blade racks",
    source: "OotA ch.1 area 10, Treasure: six shortswords and ten daggers.",
    entries: [{ slug: "shortsword", qty: 6 }, { slug: "dagger", qty: 10 }],
  },
  "armory-hammers": {
    node: "10c", title: "The building hammers",
    source: "OotA ch.1 area 10, Treasure: two building hammers (not usable as weapons). The two chests beside them are in the painting only; the book lists nothing in them.",
    entries: [{ slug: "building-hammer", qty: 2, note: "a tool, not a weapon" }],
  },
}

// A drow warrior's kit. OotA ch.1 area 2, of a resting drow: "a shortsword, a hand crossbow with a case of 20 hand
// crossbow bolts, a chain shirt, and a 100-foot coil of silk rope with a small grappling hook at the end." The same
// stat block stands guard, so the same kit is on a guard's body. Jorlan, Shoor and Ilvara are not given it: their
// own gear is not listed, so only what the DM has handed them is found.
const DROW_KIT: LootEntry[] = [
  { slug: "shortsword", qty: 1 },
  { slug: "hand-crossbow", qty: 1 },
  { slug: "bolts-20", qty: 1, note: "a case of 20 hand crossbow bolts" },
  { slug: "chain-shirt", qty: 1 },
  { slug: "silk-rope", qty: 2, note: "a 100-foot coil (the catalogue's silk rope is 50 ft)" },
  { slug: "grappling-hook", qty: 1, note: "small, tied to the rope" },
]
export const BODY_KIT: Record<string, LootEntry[]> = { "drow-guard-male": DROW_KIT, "drow-guard-female": DROW_KIT }

// What a quick hand can lift from a living guard. OotA ch.1 ("Acquisitions"): working outside the pen lets the
// characters "acquire and hide small items, including makeshift weapons or tools, or even lift a key to the slave
// pen from a guard ... Taking something without being noticed requires a successful Dexterity (Sleight of Hand)
// check contested by the Wisdom (Perception) checks of any active observers, or using an observer's passive Wisdom
// (Perception) score as the base DC. A prisoner that fails the check is commanded to relinquish the item, on pain
// of death." There is one pen key: once lifted from any guard it is gone from them all.
export const POCKETS: Record<string, LootEntry[]> = {
  // OotA ch.1 area 7: "Ilvara keeps the key in a hidden pocket on the inside of her belt" (her chest's)
  "ilvara": [{ slug: "ilvara-chest-key", qty: 1, note: "from a hidden pocket inside her belt" }],
  // OotA ch.1: "Jorlan used to have a wand that shot globs of sticky material ... Now Shoor carries it" (App B: wand of
  // viscid globs; the catalogue row already names him as its carrier)
  "shoor": [{ slug: "wand-of-viscid-globs", qty: 1, note: "Jorlan's old wand, at his belt" }],
}

// THE OTHER PRISONERS' POCKETS (Sam, 2026-10-27: "Give NPCs something to steal" — built under "Build all of it").
// The book's Scavenged Possessions (campaign_chunks "Velkynvelve Mechanics - Scavenged Possessions"): each prisoner
// rolls 1d20 and adds the days they have been held (1d10), 2-30:
//   2-9 nothing · 10-12 a gold coin · 13-15 a living spider the size of a tarantula · 16-18 five feet of silk rope ·
//   19-21 a flawed carnelian worth 10 gp · 22-24 a rusted iron bar (a club) · 25-27 a flint shard (a dagger) ·
//   28-30 ONE hand crossbow bolt coated in drow poison (a single bolt; no crossbow).
// The roll is made once per prisoner from a seed of their name, so every screen, every session and every reload agree
// what Eldeth has scraped together — and it stays gone once taken (the walk-loot `taken` flag, as for any pocket).
export const PRISONERS = ["eldeth", "ront", "derendil", "sarith", "buppido", "jimjar", "topsy", "turvy", "shuushar", "stool"] as const
const SCAVENGE: { upTo: number; entry: LootEntry | null }[] = [
  { upTo: 9, entry: null },
  { upTo: 12, entry: { slug: "gold-coin", qty: 1, note: "scavenged" } },
  { upTo: 15, entry: { slug: "small-spider", qty: 1, note: "alive, about the size of a tarantula" } },
  { upTo: 18, entry: { slug: "silk-rope", qty: 1, note: "a five-foot strand" } },
  { upTo: 21, entry: { slug: "carnelian-gem", qty: 1, note: "flawed, 10 gp" } },
  { upTo: 24, entry: { slug: "rusted-iron-bar", qty: 1, note: "usable as a club" } },
  { upTo: 27, entry: { slug: "flint-shard", qty: 1, note: "usable as a dagger" } },
  { upTo: 30, entry: { slug: "hand-crossbow-bolt-drow-poison", qty: 1, note: "a single bolt, nothing to fire it with" } },
]
/** A die from a name: the same name always rolls the same (FNV-1a, then the low bits mixed). */
function seededDie(seed: string, sides: number): number {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12
  return 1 + ((h >>> 0) % sides)
}
/** The book's roll for one prisoner: {days, d20, total, entry}. Pure and stable. */
export function scavengedRoll(slug: string): { days: number; d20: number; total: number; entry: LootEntry | null } {
  const days = seededDie(`velkynvelve:days:${slug}`, 10), d20 = seededDie(`velkynvelve:scavenge:${slug}`, 20), total = d20 + days
  const row = SCAVENGE.find((r) => total <= r.upTo) ?? SCAVENGE[SCAVENGE.length - 1]
  return { days, d20, total, entry: row.entry }
}
// THE GUARDS' POCKETS. Sam, 2026-10-27: guards "should also have a 1D6 set of items, maybe drow poison, dagger, bolts,
// GP, the key to the pen, potion or elixir, food ration, etc". So each guard is their OWN pocket
// (`pocket:<sprite>:<which>`, the map sends plate + post), and the first time anyone looks, 1d6 draws are made on
// POCKET_TABLE and kept in the walk-loot world flag for the run: the same guard holds the same things every time.
// The table, its weights and the dice per row are Claude's, from Sam's list (the book lists no pocket contents);
// "elixir" has no catalogue row, so that row is a potion of healing. The pen key: once the party holds one, no other
// guard offers it. The guards posted on the pen plate (`:pen-…`: they keep that gate, and one leans at the bars so a
// sneaking prisoner can try for it, PR #966) and the labor escort (`:escort`, "the pen key, OotA p.19") always carry
// it; anyone else may roll it.
export type PocketRow = { slug: string; dice: [number, number]; note: string; max?: number }
export const POCKET_TABLE: PocketRow[] = [
  { slug: "drow-poison", dice: [1, 1], note: "a flask on the belt, treats 20 bolts" },
  { slug: "dagger", dice: [1, 1], note: "a spare, tucked in a boot", max: 1 },
  { slug: "crossbow-bolt", dice: [1, 6], note: "loose hand crossbow bolts" },
  { slug: "gold-coin", dice: [1, 10], note: "in a coin purse" },
  { slug: "slave-pen-key", dice: [1, 1], note: "the key to the slave pen", max: 1 },
  { slug: "potion-of-healing", dice: [1, 1], note: "a stoppered vial", max: 1 },
  { slug: "rations-1-day", dice: [1, 1], note: "a day's dried rations" },
  { slug: "mushroom-wine", dice: [1, 1], note: "a small flask" },
]
export const POCKET_SPRITES = new Set(["drow-guard-male", "drow-guard-female"])
/** Roll a guard's pockets: 1d6 draws on POCKET_TABLE, duplicates merged. `rng` returns [0,1). */
export function rollPockets(which: string, rng: () => number = Math.random): LootEntry[] {
  const d = (n: number, k: number) => { let t = 0; for (let i = 0; i < n; i++) t += 1 + Math.floor(rng() * k); return t }
  const out = new Map<string, LootEntry>()
  const put = (r: PocketRow, q: number) => out.set(r.slug, { slug: r.slug, qty: Math.min(r.max ?? Infinity, (out.get(r.slug)?.qty ?? 0) + q), note: r.note })
  for (let i = d(1, 6); i > 0; i--){ const r = POCKET_TABLE[Math.floor(rng() * POCKET_TABLE.length)]; put(r, d(r.dice[0], r.dice[1])) }
  if (/^(pen|escort)/.test(which) && !out.has("slave-pen-key")) put(POCKET_TABLE.find((r) => r.slug === "slave-pen-key")!, 1)
  return [...out.values()]
}

/** What the book puts in this character's pockets: the named pockets above, or a prisoner's scavenged find. */
export function pocketEntries(slug: string): LootEntry[] {
  if (POCKETS[slug]) return POCKETS[slug]
  if ((PRISONERS as readonly string[]).includes(slug)) { const e = scavengedRoll(slug).entry; return e ? [e] : [] }
  return []
}
// Its own catalogue row (migrations/walk_loot_catalog.sql): the catalogue's "Iron key" opens manacles, not the pen gate.
export const PEN_KEY_SLUG = "slave-pen-key"

/** Valuables (Ilvara's chest) versus gear (Shoor's chest), for a row on the stash. */
export function isValuable(name: string, type: string | null | undefined, rarity?: string | null): boolean {
  if ((type || "") === "focus") return true
  if (rarity && rarity !== "common") return true
  return /spellbook|component|focus|holy symbol|wand|staff of|rod of|ring of|amulet|cloak of|boots of/i.test(name)
}

/** Which container a request names, and how its id is read. */
// A pocket is one per character (`pocket:ilvara`), except the rank-and-file guards, who are one per guard
// (`pocket:drow-guard-male:<plate-post>`); a guard id with no `:<which>` (an old page) is their shared pocket.
export function parseContainer(id: string): { kind: "book" | "body" | "pocket"; key: string; slug?: string; which?: string } | null {
  if (BOOK_CONTAINERS[id]) return { kind: "book", key: id }
  const m = /^(body|pocket):([a-z0-9-]+)(?::([A-Za-z0-9:._-]+))?$/.exec(id)
  if (!m) return null
  if (m[1] === "body") return { kind: "body", key: id, slug: m[2] }
  const which = m[3] || "default"
  return { kind: "pocket", key: m[3] ? `pocket:${m[2]}:${m[3]}` : `pocket:${m[2]}`, slug: m[2], which }
}
