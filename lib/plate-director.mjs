// THE PLATE DIRECTOR: what the Underdark throws at the party on the cavern plates around Velkynvelve.
//
// Sam, 2026-11-15: "Help me create scary horrors and wonders that are dynamic and not fixed to one game for these
// plates. We need to have traps, magic events, monsters, threat of the chase, hidden area, minigames, exciting
// encounters, lore, and loot." Then: "build the director".
//
// Design of record: project doc claude/Horrors_And_Wonders_Deck_2026-11-15.md (the deck Sam reviews on the Act One
// Plates board). THIS FILE CARRIES ONLY WHAT THE BOOK SAYS. Every table, DC and die below is Out of the Abyss — D&D
// Encounters, chapter 2, pages 29–35 (the same rows live in Supabase encounter_tables / encounter_table_rows, which the
// travel map rolls). The deck's homebrew cards (the minigames, Lolth's eyes, the lich's dreams, the twists' DCs) are NOT
// here: they wait for Sam's Keep / Change / Cut on the board.
//
// [HOUSE] marks Claude's calls inside the book's rules, open to overrule:
//   - WHEN: the book checks once per day of travel. The painted plates are places, not days, so the director checks
//     once per cavern plate per run, the first time the party walks onto it, with the book's own d20 (14+ = something).
//   - WHO ROLLS: every screen at the table rolls the same dice (seeded by the run), so all of them see the same card.
//
// Plain JavaScript for the same reason as lib/shakedown.mjs: build_walk.py pastes it into the painted map minus
// `export`, and lib/plate-director.test.ts holds the map and the tests to the same rules. Pure: no DOM, no fetch.

const SRC = "Out of the Abyss — D&D Encounters, ch.2"

/** The plates the director works on: the caverns round the outpost (spec.py CAVERNS). Not the outpost, not the
 *  road plates (a road plate's fight was already rolled at the travel-map marker). */
export function directorPlate(slug) {
  return typeof slug === "string" && slug.startsWith("biome-")
}

/** Random Encounters, d20 (p.30). */
export function randomEncounter(d20) {
  if (d20 <= 13) return { kind: "none" }
  if (d20 <= 15) return { kind: "terrain" }
  if (d20 <= 17) return { kind: "creature" }
  return { kind: "both" }
}

const row = (lo, hi, v) => ({ lo, hi, ...v })
export function onTable(table, n) {
  return table.find((r) => n >= r.lo && n <= r.hi) || null
}

/**
 * Terrain Encounters, d20 (pp.30–32). `steps` is what the map does; anything the map cannot run (a gorge, a lava
 * swell) is told to Malachar to run from the book, never improvised here.
 *   notice  {passive}           a hero whose passive Perception is at least this sees it: `avoided` is told instead
 *   save    {who, ability, dc, dice, type, half, times}   who: "each" | "one" (a random hero)
 *   pursuit {by}                the drow pursuit level moves (p.29)
 *   madness {ability, dc}       each hero saves or their madness level goes up by 1
 *   table   {key}               roll on a sub-table below
 *   check   {skill, dc, text}   the best hero at it tries once
 *   choice  {options:[{label, steps}]}
 *   tell                        Malachar runs the rest from the book
 */
export const TERRAIN = [
  row(1, 1, { id: "boneyard", title: "Boneyard", page: 30, hook: "An eerie cavern littered with countless bones of every kind of creature.",
    steps: [{ t: "table", key: "boneyard" }], tell: "The bones can be gathered as crafting material." }),
  row(2, 2, { id: "cliff-ladder", title: "Cliff and ladder", page: 30, hook: "A cliff 2d4 × 10 feet high, and a rolled-up rope ladder at the top.",
    steps: [{ t: "check", skill: "athletics", ability: "str", dc: 15, text: "climb the cliff and throw the ladder down",
      pass: [{ t: "choice", options: [{ label: "Pull the ladder up behind you", steps: [{ t: "pursuit", by: -1 }] }, { label: "Leave it" }] }],
      fail: [{ t: "say", text: "Nobody makes the climb. The party loses a day's travel finding another route." }] }] }),
  row(3, 3, { id: "crystal-clusters", title: "Crystal clusters", page: 31, hook: "Crystals glitter in clusters along the walls.",
    steps: [{ t: "choice", options: [{ label: "Harvest the crystals (up to twelve)", steps: [{ t: "pursuit", by: 1 }, { t: "say", text: "The party pries crystals free. It costs time." }] }, { label: "Leave them" }] }] }),
  row(4, 4, { id: "fungus-cavern", title: "Fungus cavern", page: 31, hook: "A cavern filled with fungi and mushrooms of every size.",
    steps: [], tell: "Choose fungi from 'Fungi of the Underdark' for what grows here; foraging as normal." }),
  row(5, 5, { id: "gas-leak", title: "Gas leak", page: 31, hook: "A sweet, rotten smell hangs in the air.",
    steps: [{ t: "notice", passive: 14, avoided: "Someone smells the gas in time. The party goes around (half pace today), and nobody is hurt. An open flame in here would explode (DC 15 DEX, 3d6 fire)." },
      { t: "save", who: "each", ability: "con", dc: 12, dice: "1d10", type: "poison", half: true }] }),
  row(6, 6, { id: "gorge", title: "Gorge", page: 31, hook: "A gorge 2d4 × 100 feet deep blocks the way.", steps: [],
    tell: "A difficult climb down and up, or the long way round: half pace today unless they find a quick way across." }),
  row(7, 7, { id: "high-ledge", title: "High ledge", page: 31, hook: "The way narrows to an 18-inch ledge over a ravine 2d6 × 10 feet deep.",
    steps: [{ t: "pursuit", by: 1 }, { t: "save", who: "each", ability: "dex", dc: 10, fall: "2d6*10" }],
    tell: "Half pace today. Roping everyone together would have given advantage." }),
  row(8, 8, { id: "horrid-sounds", title: "Horrid sounds", page: 31, hook: "Shrieks, moans and gibbering echo from passages nearby. There is no source.",
    steps: [{ t: "madness", ability: "wis", dc: 11 }] }),
  row(9, 9, { id: "lava-swell", title: "Lava swell", page: 31, hook: "Heat rolls up from below. The rock glows.", steps: [],
    tell: "Run the Lava swell terrain encounter from the book." }),
  row(10, 10, { id: "muck-pit", title: "Muck pit", page: 31, hook: "The floor turns to sucking muck.", steps: [],
    tell: "Run the Muck pit terrain encounter from the book." }),
  row(11, 11, { id: "rockfall", title: "Rockfall", page: 31, hook: "A tremor. Dust sifts down, then the ceiling comes with it.",
    steps: [{ t: "save", who: "each", ability: "dex", dc: 12, dice: "3d6", type: "bludgeoning", times: 3 }, { t: "pursuit", by: -1 }],
    tell: "A hero who drops to 0 here is buried: 1d6 bludgeoning at the end of each of their turns until dug out." }),
  row(12, 12, { id: "rope-bridge", title: "Rope bridge", page: 31, hook: "An old rope bridge spans a ravine 2d4 × 10 feet wide and deep.",
    steps: [{ t: "choice", options: [{ label: "Cut the bridge behind you", steps: [{ t: "pursuit", by: -1 }] }, { label: "Leave it standing" }] }] }),
  row(13, 13, { id: "ruins", title: "Ruins", page: 31, hook: "Worked stone: a small ruin, older than anyone who could tell you about it.",
    steps: [{ t: "choice", options: [{ label: "Search the ruins", steps: [{ t: "table", key: "ruins" }] }, { label: "Move on" }] }] }),
  row(14, 14, { id: "shelter", title: "Shelter", page: 31, hook: "A dry cave, sheltered and easy to defend.",
    steps: [{ t: "shelter" }], tell: "A long rest here has no chance of an encounter." }),
  row(15, 15, { id: "sinkhole", title: "Sinkhole", page: 31, hook: "The floor gives under one of you.",
    steps: [{ t: "save", who: "one", ability: "dex", dc: 12, dice: "2d6", type: "bludgeoning", onFail: "falls into a 20-foot pit. Climbing out takes a DC 15 Strength (Athletics) check." }] }),
  row(16, 16, { id: "slime-mold", title: "Slime or mold", page: 31, hook: "Something glistens on the stone ahead.",
    steps: [{ t: "table", key: "slime" }], tell: "Its effects are the DMG's Dungeon Hazards." }),
  row(17, 17, { id: "steam-vent", title: "Steam vent", page: 31, hook: "A hiss underfoot.",
    steps: [{ t: "save", who: "one", ability: "dex", dc: 12, dice: "2d6", type: "fire" }] }),
  row(18, 18, { id: "underground-stream", title: "Underground stream", page: 32, hook: "A stream 2d4 × 5 feet wide cuts across the way, shallow and cold.",
    steps: [{ t: "pursuit", by: -1 }, { t: "say", text: "The party drinks and fills its waterskins. Fish here: foraging DC 10." }] }),
  row(19, 19, { id: "warning-sign", title: "Warning sign", page: 32, hook: "A sigil carved into a stalagmite.",
    steps: [{ t: "notice", passive: 11, missed: "Nobody notices anything." },
      { t: "choice", options: [{ label: "Touch the sigil", steps: [{ t: "madness", ability: "wis", dc: 10, one: true }] }, { label: "Leave it alone" }] }],
    tell: "It is a drow warning sign: \"Demons ahead!\" A long rest within a mile rolls the demon table (p.32)." }),
  row(20, 20, { id: "webs", title: "Webs", page: 32, hook: "Sticky webs fill the passage, as far as the light goes.",
    steps: [{ t: "table", key: "webs" }], tell: "Half pace today unless they find a quick way through." }),
]

/** Creature Encounters, d20 (p.32). `fight` names the walk's own sprites; anything the map has no stat block for is
 *  told to Malachar instead of stood in for (the same rule as roadFight). */
export const CREATURES = [
  row(1, 2, { id: "ambushers", title: "Ambushers", page: 32, steps: [{ t: "table", key: "ambushers" }] }),
  row(3, 3, { id: "carrion-crawler", title: "Carrion crawler", page: 32, hook: "Something long and many-legged scours the tunnel for food.", fight: [{ id: "carrion-crawler", n: "1" }] }),
  row(4, 5, { id: "escaped-slaves", title: "Escaped slaves", page: 33, hook: "Ragged figures freeze in your light.", talk: true }),
  row(6, 7, { id: "fungi", title: "Fungi", page: 33, hook: "Some of the fungus here is moving.", talk: true }),
  row(8, 9, { id: "fire-beetles", title: "Giant fire beetles", page: 33, hook: "Red glows, low to the ground, clicking.", tell: "Their glowing glands can be harvested as light." }),
  row(10, 11, { id: "rocktopus", title: "Giant \"rocktopus\"", page: 33, hook: "A rock unfolds into arms.", tell: "A giant octopus adapted to land (walk 20, climb 10, advantage on Stealth)." }),
  row(12, 12, { id: "mad-creature", title: "Mad creature", page: 33, hook: "Someone in the dark is talking to a rock, and the rock is answering.", steps: [{ t: "table", key: "mad" }] }),
  row(13, 13, { id: "ochre-jelly", title: "Ochre jelly", page: 33, hook: "An amber sheet of slime slides down the wall toward you.", fight: [{ id: "ochre-jelly", n: "1" }] }),
  row(14, 15, { id: "raiders", title: "Raiders", page: 34, steps: [{ t: "table", key: "raiders" }] }),
  row(16, 16, { id: "scouts", title: "Scouts", page: 34, steps: [{ t: "table", key: "scouts" }] }),
  row(17, 17, { id: "society", title: "Society of Brilliance", page: 34, steps: [{ t: "table", key: "society" }] }),
  row(18, 18, { id: "spore-servants", title: "Spore servants", page: 35, steps: [{ t: "table", key: "spore" }] }),
  row(19, 20, { id: "traders", title: "Traders", page: 35, hook: "Lantern light, and goods for trade.", talk: true }),
]

/** The sub-tables (pp.30–35). */
export const TABLES = {
  boneyard: { die: 20, page: 30, rows: [row(1, 14, { say: "Nothing stirs among the bones." }), row(15, 18, { say: "Skeletons rise out of the bones when the first hero is halfway across.", fight: [{ id: "skeleton-swordsman", n: "3d4" }] }), row(19, 20, { say: "Minotaur skeletons rise out of the bones.", fight: [{ id: "minotaur-skeleton", n: "1d3" }] })] },
  ruins: { die: 100, page: 31, rows: [row(1, 50, { say: "The ruins hold nothing worth carrying." }), row(51, 100, { say: "Among the stones: 1d4 trinkets.", tell: "Roll 1d4 on the PHB Trinkets table." })] },
  slime: { die: 6, page: 31, rows: [row(1, 3, { say: "A patch of green slime." }), row(4, 5, { say: "A patch of yellow mold." }), row(6, 6, { say: "A patch of brown mold." })] },
  webs: { die: 6, page: 32, rows: [row(1, 2, { say: "The webs are not empty.", fight: [{ id: "giant-spider", n: "1d4" }] }), row(3, 6, { say: "Nothing moves in the webs." })] },
  ambushers: { die: 20, page: 32, rows: [
    row(1, 2, { say: "A chuul lurking in a pool of water.", fight: [{ id: "chuul", n: "1" }] }),
    row(3, 3, { say: "Giant spiders clinging to the walls and ceiling.", fight: [{ id: "giant-spider", n: "1d6" }] }),
    row(4, 5, { say: "A grell floating near the high ceiling.", fight: [{ id: "grell", n: "1" }] }),
    row(6, 9, { say: "Gricks hiding in a crevice.", fight: [{ id: "grick", n: "1d4" }] }),
    row(10, 15, { say: "Orogs perching on the ledges.", fight: [{ id: "orog", n: "1d4" }] }),
    row(16, 17, { say: "Piercers masquerading as stalactites.", fight: [{ id: "piercer", n: "1d6" }] }),
    row(18, 20, { say: "An umber hulk bursts out of the wall.", fight: [{ id: "umber-hulk", n: "1" }] })] },
  lair: { die: 20, page: 32, rows: [row(1, 10, { say: "The lair holds nothing of value." }),
    row(11, 12, { say: "A skeleton clutching a salvageable nonmagical weapon." }), row(13, 14, { say: "A skeleton wearing a salvageable suit of nonmagical armor." }),
    row(15, 17, { say: "1d6 gems worth 50 gp each." }), row(18, 19, { say: "A corpse carrying a magic item.", tell: "Roll once on DMG Magic Item Table B." }),
    row(20, 20, { say: "A monster's hoard: 2d6 gems worth 50 gp each, and magic.", tell: "Roll 1d4 times on DMG Magic Item Table C." })] },
  mad: { die: 4, page: 33, rows: [row(1, 1, { say: "A deep gnome." }), row(2, 2, { say: "A drow." }), row(3, 3, { say: "A duergar." }), row(4, 4, { say: "A stone giant." })],
    tell: "Roll the DMG Indefinite Madness table for its madness, and d20 for what it carries (p.33). It does not give that up willingly." },
  raiders: { die: 6, page: 34, rows: [row(1, 2, { say: "Human bandits and their captain.", fight: [{ id: "bandit", n: "1d6" }, { id: "bandit-captain", n: "1" }] }),
    row(3, 4, { say: "Goblins and their boss.", fight: [{ id: "goblin", n: "2d4" }, { id: "goblin-boss", n: "1" }] }),
    row(5, 6, { say: "Orcs and an Eye of Gruumsh.", fight: [{ id: "orc", n: "1d6" }, { id: "orc-eye-of-gruumsh", n: "1" }] })],
    tell: "Raiders start hostile but can be bribed for safe passage or information. Their leader may carry something (p.34)." },
  scouts: { die: 6, page: 34, rows: [row(1, 2, { say: "A lone drow scout, searching for escaped slaves. If he sees you, he slips away to tell the others.", pursuit: 1 }),
    row(3, 4, { say: "Myconid scouts on some errand, indifferent to you." }), row(5, 6, { say: "Shield dwarf scouts. Friendly to surface folk: they may share a day or two of food and water." })] },
  society: { die: 10, page: 34, rows: [row(1, 2, { say: "Y the derro savant." }), row(3, 4, { say: "Blurg the orog." }), row(5, 6, { say: "Grazilaxx the mind flayer." }), row(7, 8, { say: "Skriss the troglodyte." }), row(9, 10, { say: "Sloopidoop the kuo-toa archpriest." })],
    tell: "A member of the Society of Brilliance: neutral, Intelligence 18, prefers debate to violence. It can give directions to any settlement." },
  spore: { die: 10, page: 35, rows: [row(1, 3, { say: "1d4 drow spore servants." }), row(4, 6, { say: "1d6 duergar spore servants." }), row(7, 8, { say: "1d4 hook horror spore servants." }), row(9, 10, { say: "1d8 quaggoth spore servants." })],
    tell: "Spore servants watch and do not attack, except in self-defense." },
}

/** The drow pursuit level (p.29). Starts at 4 once the party is out; 5 = the forward scouts catch up; 0 = eluded. */
export const PURSUIT_START = 4, PURSUIT_CAUGHT = 5
export function pursuitAfter(level, by) {
  const n = (Number.isFinite(level) ? level : PURSUIT_START) + by
  return Math.max(0, Math.min(PURSUIT_CAUGHT, n))
}
export function pursuitWord(level) {
  if (level >= PURSUIT_CAUGHT) return "The drow scouts have caught up."
  if (level <= 0) return "The drow have lost your trail."
  return ["", "The drow are far behind.", "The drow are behind you.", "The drow are close behind.", "The drow are not far behind."][level] || ""
}

/** Dice: "3d4", "1", "2d6*10". `rand` returns [0,1). */
export function rollDice(expr, rand) {
  const m = String(expr).match(/^(\d+)(?:d(\d+))?(?:\*(\d+))?$/)
  if (!m) return 0
  const n = +m[1], d = m[2] ? +m[2] : 0, k = m[3] ? +m[3] : 1
  if (!d) return n * k
  let s = 0
  for (let i = 0; i < n; i++) s += 1 + Math.floor(rand() * d)
  return s * k
}
export const d = (die, rand) => 1 + Math.floor(rand() * die)

/** Falling (SRD 5.1, Adventuring: Falling): 1d6 bludgeoning per 10 feet, at most 20d6. */
export function fallDamage(feet, rand) {
  return rollDice(`${Math.min(20, Math.floor(feet / 10))}d6`, rand)
}

/**
 * What the director brings when the party first walks onto a cavern plate this run. Returns null when nothing does.
 * { roll, kind, terrain?, creature? } — the rows themselves; the map resolves their steps.
 */
export function drawFor(rand) {
  const roll = d(20, rand), r = randomEncounter(roll)
  if (r.kind === "none") return null
  const out = { roll, kind: r.kind, source: `${SRC}, p.30` }
  if (r.kind === "terrain" || r.kind === "both") { const t = d(20, rand); out.terrain = { roll: t, ...onTable(TERRAIN, t) } }
  if (r.kind === "creature" || r.kind === "both") { const c = d(20, rand); out.creature = { roll: c, ...onTable(CREATURES, c) } }
  return out
}

/** A sub-table roll. */
export function rollTable(key, rand) {
  const t = TABLES[key]
  if (!t) return null
  const n = d(t.die, rand)
  return { key, die: t.die, roll: n, page: t.page, tell: t.tell, ...onTable(t.rows, n) }
}

/** One hero's saving throw. `mod` is their save bonus; `edge` 1 advantage, -1 disadvantage. */
export function savingThrow(mod, dc, rand, edge = 0) {
  const a = d(20, rand), b = d(20, rand)
  const die = edge > 0 ? Math.max(a, b) : edge < 0 ? Math.min(a, b) : a
  return { die, total: die + mod, ok: die + mod >= dc }
}

/** Damage for one failed (or, with `half`, passed) save. */
export function hazardDamage(step, ok, rand) {
  if (!step.dice) return 0
  const full = rollDice(step.dice, rand)
  return ok ? (step.half ? Math.floor(full / 2) : 0) : full
}

/** Foes the fight names, counts rolled; split into the ones the map can field and the ones it cannot. */
export function fieldFoes(fight, rand, canField) {
  const ids = [], missing = []
  for (const f of fight || []) {
    const n = Math.max(1, rollDice(f.n, rand))
    for (let i = 0; i < n; i++) (canField(f.id) ? ids : missing).push(f.id)
  }
  return { ids, missing: [...new Set(missing)] }
}

// ---------- THE RUINS: six rooms, one roll each (Sam, 2026-11-23) ----------
// Sam: "each room passive rolls a dice for what you will find" and "Have some hidden item that are only available on a
// passive perception success." The first time the party walks into a room of the Ruins this run, the map rolls that
// room's d20 by itself and shows what came up; then it checks the best passive Perception in the party against the
// room's hidden thing, and says nothing at all on a miss.
//
// WHOSE NUMBERS THESE ARE
//   THE BOOK'S (OotA D&D Encounters ch.2): the Ruins terrain encounter, p.31: "If the characters search the ruins, there
//     is a 50 percent chance of them finding 1d4 trinkets" -> the Reliquary's row, 11-20 on a d20. The rockfall's DC 12
//     Dexterity save, p.31. The foes and their counts are rows of the book's own Ambushers table, p.32 ("Gricks hiding
//     in a crevice" 1d4, "A chuul lurking in a pool of water", "A grell floating near the high ceiling"). The madness
//     save is the book's madness rule at the DC its own terrain rows use (11).
//   SAM'S: one roll per room; skeletons that come out; a horror somewhere; hidden things on passive Perception.
//   CLAUDE'S, OPEN TO OVERRULE: which room gets which row, every row's odds, the skeletons' count (2d3; the book's
//     boneyard is 3d4), the falling stone's 1d6 on one hero (the book's rockfall is 3d6 three times, on everyone), and
//     the three passive Perception scores (12, 13, 15). What the hidden things hold is lib/walk-loot.ts, labelled there.
// Trinkets are not catalogue items, so the map does not hand them out: Malachar is told to roll the PHB table.
export function ruinPlate(slug) {
  return typeof slug === "string" && slug.startsWith("ruins-")
}
export const RUIN_ROOMS = {
  "ruins-threshold": {
    hook: "Dust lies unbroken between the columns. Nobody has walked here in a very long time.",
    rows: [row(1, 12, { say: "Nothing but dust and fallen stone." }),
      row(13, 20, { say: "Up in the dark a column drum shifts, and comes down.", steps: [{ t: "save", who: "one", ability: "dex", dc: 12, dice: "1d6", type: "bludgeoning" }] })],
    hidden: { id: "ruins-cache-threshold", passive: 12, found: "One flagstone beside the fallen column sits a finger proud of the rest, and the dust round it has been swept by a hand." } },
  "ruins-ossuary": {
    hook: "Skulls to the ceiling on both walls, and six stone coffins down the middle. Two of them are already open.",
    rows: [row(1, 5, { say: "The dead lie as they were laid." }),
      row(6, 20, { say: "Stone grinds on stone. The lids are moving, and what climbs out still holds its sword.", fight: [{ id: "skeleton-swordsman", n: "2d3" }] })] },
  "ruins-great-hall": {
    hook: "The roof came down here long ago. A crack splits the floor from wall to wall, and water runs into it.",
    rows: [row(1, 11, { say: "Only the water, falling a long way." }),
      row(12, 20, { say: "Gricks hiding in a crevice.", fight: [{ id: "grick", n: "1d4" }] })] },
  "ruins-flooded-crypt": {
    hook: "Black water, flat as glass, and a causeway across it. The drowned statues all face the same way.",
    rows: [row(1, 15, { say: "Nothing breaks the water." }),
      row(16, 20, { say: "A chuul lurking in a pool of water.", fight: [{ id: "chuul", n: "1" }] })],
    hidden: { id: "ruins-cache-crypt", passive: 13, found: "Something that is not stone is wedged under the lip of the causeway, just above the waterline: a satchel, gone soft with rot." } },
  "ruins-sanctum": {
    hook: "A chained thing with too many arms hangs over a pit that glows the wrong colour. The benches all face it.",
    rows: [row(1, 4, { say: "The pit is quiet. The idol only watches." }),
      row(5, 14, { say: "The light in the pit leans toward you, and something in it says your name the way your mother did.", steps: [{ t: "madness", ability: "wis", dc: 11 }] }),
      row(15, 20, { say: "The light in the pit says your name. Then something rises out of it. A grell floating near the high ceiling.", steps: [{ t: "madness", ability: "wis", dc: 11 }], fight: [{ id: "grell", n: "1" }] })] },
  "ruins-reliquary": {
    hook: "A vault of small arched shelves, most of them swept bare. Whoever emptied it left in a hurry.",
    rows: [row(1, 10, { say: "The ruins hold nothing worth carrying." }),
      row(11, 20, { say: "Among the stones: 1d4 trinkets.", tell: "Roll 1d4 on the PHB Trinkets table." })],
    hidden: { id: "ruins-cache-reliquary", passive: 15, found: "The plinth's bowl is cracked through, and the crack is too straight. Behind it, in a hollow cut for the purpose, sits a small bronze casket." } },
}
/** One room's roll: { roll, hook, hidden?, say, tell?, steps?, fight? }, or null for a plate that is not a room. */
export function ruinDraw(slug, rand) {
  const room = RUIN_ROOMS[slug]
  if (!room) return null
  const roll = d(20, rand)
  return { roll, hook: room.hook, hidden: room.hidden || null, ...onTable(room.rows, roll) }
}
/** Does the party's best passive Perception find the room's hidden thing? Equal is enough (a passive score meets a DC). */
export function ruinNotices(hidden, bestPassive) {
  return !!hidden && Number.isFinite(bestPassive) && bestPassive >= hidden.passive
}
