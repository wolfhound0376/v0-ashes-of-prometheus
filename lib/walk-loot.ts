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
  "drow-guard-male": [{ slug: "slave-pen-key", qty: 1, note: "the key to the slave pen" }],
  "drow-guard-female": [{ slug: "slave-pen-key", qty: 1, note: "the key to the slave pen" }],
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
export function parseContainer(id: string): { kind: "book" | "body" | "pocket"; key: string; slug?: string } | null {
  if (BOOK_CONTAINERS[id]) return { kind: "book", key: id }
  const m = /^(body|pocket):([a-z0-9-]+)(?::[A-Za-z0-9:._-]+)?$/.exec(id)
  if (!m) return null
  return { kind: m[1] as "body" | "pocket", key: m[1] === "pocket" ? `pocket:${m[2]}` : id, slug: m[2] }
}
