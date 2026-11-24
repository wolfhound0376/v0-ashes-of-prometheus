// ============================================================================
// WALK ROLLS — checks the painted map asks for, rolled on the dashboard's dice.
//
// Sam, 2026-10-25, looking at the pen gate card: the player should never see a
// "What did it come to? 20 or more / Under 20" window. The card should "have
// you roll for whatever you need ... trigger the dice animation that is
// appropriate from the dashboard UI with the appropriate modifier, and send
// that to the DM." Then: "Use the dashboard UI dice roll animation and math."
//
// So the map (public/velkynvelve-walk, an iframe) no longer rolls and no longer
// asks. It posts a request naming an ACTION from the closed table below; the
// /velkynvelve page answers it with the one dice engine
// (components/dice/dice-provider.tsx) and the dashboard's own modifier math.
//
// Three rules this file holds:
//   1. CLOSED VOCABULARY. The map sends an action key, never free text. Labels,
//      the check and the DC all come from ACTIONS. A page message can therefore
//      never put words into Malachar's prompt or pick its own difficulty.
//   2. THE DASHBOARD'S MATH. A skill is ability modifier + proficiency, doubled
//      for expertise (character-sheet-slideover.tsx skillBonus, which is
//      lib/game-context.ts skillBonus). A tool check is the tool's ability
//      modifier + proficiency when the sheet lists the tool
//      (characters.sheet_proficiencies.tools, matched as lib/repair.ts hasTool).
//   3. THE DC IS THE DM'S. It is resolved here, on the parent page, and goes to
//      Malachar with the verdict. The player's card shows their action, their
//      modifier and their total, never the DC or the book page.
// ============================================================================

import { SKILL_ABILITY, abilityMod, proficiency, skillBonus, type Ability, type SheetSlice, type Skill } from "@/lib/game-context"
import { hasTool } from "@/lib/repair"

export type WalkCheck =
  | { kind: "skill"; skill: Skill; label: string }
  | { kind: "tool"; tool: string; ability: Ability; label: string }
  /** A plain ability check: no skill, no tool (OotA area 5's spool is "a Strength check"). */
  | { kind: "ability"; ability: Ability; label: string }

export interface WalkAction {
  /** The roll panel's heading: what the player chose, in their words. */
  title: string
  /** What the player is doing, as the log and Malachar read it. */
  label: string
  check: WalkCheck
  /** Difficulty Class. DM-side only: never shown on the player's card. */
  dc: number
  /** Where the DC comes from, for the DM console and the message to Malachar. */
  source: string
  /**
   * The map tells Malachar the outcome itself, with what only it knows (whose pocket, which item, who saw, the rope
   * tearing), so the bridge sends nothing for this roll. Without it Malachar would get the same event twice.
   * Pickpocketing, the cliff rope, pocketing on a work detail.
   */
  mapNarrates?: true
  /**
   * NO SINGLE DC: the map reads the TOTAL against its own ladder (the ward sigil's four tiers). So the roll panel
   * shows no difficulty word and stamps no SUCCESS / FAILURE, and nothing is offered a reroll for having "failed" —
   * the map alone says what the total earned. `dc` is then the ladder's top rung, kept only so the earned-proficiency
   * ledger (lib/walk-check-record.ts) has a number to count the roll against.
   */
  tiered?: true
}

const THIEVES_TOOLS: WalkCheck = { kind: "tool", tool: "Thieves' Tools", ability: "dex", label: "Thieves' tools" }
const ATHLETICS: WalkCheck = { kind: "skill", skill: "athletics", label: "Athletics" }
const ACROBATICS: WalkCheck = { kind: "skill", skill: "acrobatics", label: "Acrobatics" }
const PERCEPTION: WalkCheck = { kind: "skill", skill: "perception", label: "Perception" }
const SLEIGHT: WalkCheck = { kind: "skill", skill: "sleight_of_hand", label: "Sleight of Hand" }
const INVESTIGATION: WalkCheck = { kind: "skill", skill: "investigation", label: "Investigation" }
const PERFORMANCE: WalkCheck = { kind: "skill", skill: "performance", label: "Performance" }
const INSIGHT: WalkCheck = { kind: "skill", skill: "insight", label: "Insight" }
const ANIMAL_HANDLING: WalkCheck = { kind: "skill", skill: "animal_handling", label: "Animal Handling" }
const PERSUASION: WalkCheck = { kind: "skill", skill: "persuasion", label: "Persuasion" }
const INTIMIDATION: WalkCheck = { kind: "skill", skill: "intimidation", label: "Intimidation" }
const ARCANA: WalkCheck = { kind: "skill", skill: "arcana", label: "Arcana" }
const HISTORY: WalkCheck = { kind: "skill", skill: "history", label: "History" }
const DEXTERITY: WalkCheck = { kind: "ability", ability: "dex", label: "Dexterity" }
const STRENGTH: WalkCheck = { kind: "ability", ability: "str", label: "Strength" }
const MEDICINE: WalkCheck = { kind: "skill", skill: "medicine", label: "Medicine" }
const COOKS: WalkCheck = { kind: "tool", tool: "Cook's Utensils", ability: "wis", label: "Cook's utensils" }

/**
 * Every roll the map may ask for. Adding a check to the map means adding a row
 * here — the bridge refuses any key it does not find.
 *
 * Pen gate: OotA ch.1, Velkynvelve area 2 (p.18) — picking or forcing the
 * slave-pen gate is a DC 20 check. Forcing is the Strength (Athletics) reading
 * of "forcing it"; the book does not name the skill.
 */
const BOOK_ACTIONS = {
  "pen-gate:pick": { title: "Pick the lock", label: "Picking the pen gate's lock", check: THIEVES_TOOLS, dc: 20, source: "OotA p.18" },
  "pen-gate:force": { title: "Force the gate", label: "Forcing the pen gate", check: ATHLETICS, dc: 20, source: "OotA p.18" },
  // Lift Trouble (OotA Expanded p.45, a community supplement): three rappels down the cliff below the lift on tattered
  // ropes; whoever falls lands in the web net with the giant spider. The supplement names no DC: 12 is a house number.
  "cliff:rappel": { title: "Rappel on the rope", label: "Rappelling down the cliff below the lift", check: ATHLETICS, dc: 12, source: "OotA Expanded p.45 · DC house", mapNarrates: true },
  "cliff:climb": { title: "Climb the rope", label: "Climbing the rope up the cliff below the lift", check: ATHLETICS, dc: 12, source: "OotA Expanded p.45 · DC house", mapNarrates: true },
  // Hard Labor (OotA Encounters ch.1 p.12; module doc claude/Hard_Labor_Module_2026-10-26.md). The book lists the chores
  // and sets no DCs: every work and look DC below is a house number (Claude's, Sam's call).
  "labor:water": { title: "Haul the barrels", label: "Filling and hauling water barrels on a work detail", check: ATHLETICS, dc: 10, source: "OotA p.12 chore; DC house" },
  "labor:lift": { title: "Turn the winch", label: "Operating the lift on a work detail", check: ATHLETICS, dc: 12, source: "OotA p.12 chore; DC house" },
  "labor:pots": { title: "Carry the pots across", label: "Carrying chamber pots across the bridge on a work detail", check: ACROBATICS, dc: 10, source: "OotA p.12 chore; balance is Acrobatics (SRD); DC house" },
  "labor:kitchen": { title: "Cook for the drow", label: "Preparing food for the drow on a work detail", check: COOKS, dc: 12, source: "OotA p.12 chore; DC house" },
  // Lift Trouble has no work roll here: the cliff plate's own rappels are the work (feat/cliff-rappels, "cliff:rappel").
  "labor:look": { title: "Look around", label: "Taking in the room while working", check: PERCEPTION, dc: 12, source: "DC house" },
  // Pocketing on a detail: OotA p.19 "Acquisitions" — Sleight of Hand against an observer's passive Perception as the
  // base DC (book). The DC is the sharpest eyes in the escort: a drow, passive 12 (SRD); Jorlan, passive 14 (his row).
  // A hero inside an escort's line of sight cannot try at all (the map's rule): those are the "active observers".
  "labor:pocket": { title: "Pocket it", label: "Pocketing something while the drow guard is not looking", check: SLEIGHT, dc: 12, source: "OotA p.19; drow passive Perception 12 (SRD)", mapNarrates: true },
  "labor:pocket-jorlan": { title: "Pocket it", label: "Pocketing something while Jorlan is not looking", check: SLEIGHT, dc: 14, source: "OotA p.19; Jorlan's passive Perception 14", mapNarrates: true },
  // Searched on suspicion (Sam: never routinely). Keeping it hidden: Sleight of Hand against the searcher's passive
  // Perception as the DC — the book's p.19 rule turned round [HOUSE].
  "labor:hide": { title: "Keep it hidden", label: "Keeping a pocketed thing hidden while a drow guard searches them", check: SLEIGHT, dc: 12, source: "after OotA p.19; drow passive Perception 12; house" },
  "labor:hide-jorlan": { title: "Keep it hidden", label: "Keeping a pocketed thing hidden while Jorlan searches them", check: SLEIGHT, dc: 14, source: "after OotA p.19; Jorlan's passive Perception 14; house" },
  // NO MORE "WHAT DID IT COME TO?" (Sam, 2026-10-27: "Build all of it" — retire every self-reported roll on the map,
  // per his 2026-10-25 ruling that the map never asks the player what they rolled). Each of these used to open a
  // "20 or more / Under 20" window; now the dashboard's dice roll them like the gate.
  "falls:look": { title: "Look over the edge", label: "Leaning out over the falls to see what is below", check: PERCEPTION, dc: 12, source: "house DC (the book sets none), OotA p.14/p.18" },
  "ilvara-chest:search": { title: "Search it for traps", label: "Searching Ilvara's chest for traps", check: INVESTIGATION, dc: 20, source: "OotA ch.1 area 7" },
  "ilvara-chest:disarm": { title: "Disarm the needle", label: "Disarming the poison needle in Ilvara's chest", check: THIEVES_TOOLS, dc: 15, source: "OotA ch.1 area 7" },
  "ilvara-chest:pick": { title: "Pick the lock", label: "Picking the lock of Ilvara's chest", check: THIEVES_TOOLS, dc: 15, source: "OotA ch.1 area 7" },
  "lift:spool": { title: "Turn the spool", label: "Turning the lift's spool", check: STRENGTH, dc: 18, source: "OotA ch.1 area 5" },
  // THE ROPE THROUGH THE BARS (Sam, 2026-11-12: "Rope should be an option to strangle a nearby leaning guard"). 5E has no
  // strangling rule, so each hold is the grapple it is: Strength (Athletics) against the drow's Dexterity (Acrobatics) +2
  // (SRD drow, Dex 14), taken as a passive 12 because the map rolls one die, the hero's. [HOUSE] The map grants advantage
  // on the grab (his back is turned) and tells Malachar the outcome itself.
  "strangle:grab": { title: "Throw the rope", label: "Looping a rope round a guard's throat through the bars", check: ATHLETICS, dc: 12, source: "house: grapple vs drow Acrobatics +2 as passive 12", mapNarrates: true },
  "strangle:hold": { title: "Hold the rope", label: "Holding a strangling rope", check: ATHLETICS, dc: 12, source: "house: grapple vs drow Acrobatics +2 as passive 12", mapNarrates: true },
  // THE WHISTLE (Sam, 2026-11-12: "The Bard can also whistle, annoying the guard enough to come in offering an opportunity
  // for the rogues to steal a key"). The book has no such check: Charisma (Performance), and the DC is a house number
  // [CLAUDE]. The map tells Malachar what came of it (which guard, the slap), so the bridge sends nothing.
  "pen:whistle": { title: "Whistle at the guard", label: "Whistling at a gate guard until he comes in to stop it", check: PERFORMANCE, dc: 12, source: "house (Sam's mechanic, DC Claude's)", mapNarrates: true },
  // JIMJAR'S WIRE (Sam, 2026-11-12/13: Jimjar gives up the wire for "something valuable (gem, gold, or wins a bet with
  // him)"; the rogue "can attempt once per short rest on her manacles"). Both are HOMEBREW with house DCs [CLAUDE].
  // The bet is read as Wisdom (Insight): which fist holds the pebble. The manacles: Dexterity (Sleight of Hand), the
  // wire being no thieves' tools; OotA's own manacle escape is DC 20 Dexterity, and a wire in the lock is worth 5.
  // OLD THESSALY (Sam, 2026-10-24; claude/Old_Thessaly_Module_2026-11-23.md): the Darklake shore's fisherman and his boat
  // THE SIGIL BY THE THRESHOLD'S DOORWAY (first built on the west wall; Sam, 2026-11-24: "Sigil at the door please") (Sam, 2026-11-24: "A successful investigation check will identify a sigil. A
  // successful arcana check will activate it, opening a hidden room to the necromancers laboratory"; "Difficulty
  // medium" -> DC 15, SRD 5.2.1 Typical DCs). Homebrew: the book gives the Ruins no rooms.
  // THE CHASM JUMP on the Gloomwastes (Sam, 2026-11-24: Athletics, "medium" -> DC 15; a rope in the jumper's pack gives
  // advantage and +1). The dice panel rolls the sheet's own Athletics and takes no flat bonus, so the rope's +1 is the
  // same roll against a DC one lower: "gorge:jump-rope" is DC 14, sent with advantage. Homebrew.
  "gorge:jump": { title: "Jump the chasm", label: "Jumping the chasm on the Gloomwastes", check: ATHLETICS, dc: 15, source: "Sam's mechanic and difficulty (medium), 2026-11-24", mapNarrates: true },
  "gorge:jump-rope": { title: "Jump the chasm, roped", label: "Jumping the chasm on the Gloomwastes with a rope tied off", check: ATHLETICS, dc: 14, source: "Sam, 2026-11-24: a rope gives advantage and +1 (DC 15 less the +1)", mapNarrates: true },
  // THE CRYSTAL PASSAGE (Sam, 2026-11-24, on the Act One board: "This area needs some rare crystal you can harvest and
  // upon a successful check of the area, you will find a magic sword in the crystals, triggering a cinematic." He said
  // yes to: harvest a medium check with three tries, the search Investigation at medium). Medium is DC 15. The harvest
  // skill (Sleight of Hand, a careful cut) is CLAUDE'S PICK. "crystal:shard" is the Crystalline Aberration's own rule
  // (EmberDM stat block Sam supplied): DC 12 Wisdom (Medicine) to remove one shard.
  "crystal:harvest": { title: "Cut a crystal free", label: "Cutting a crystal from the Crystal Passage", check: SLEIGHT, dc: 15, source: "Sam 2026-11-24 (medium); skill is Claude's pick", mapNarrates: true },
  "crystal:search": { title: "Search the crystals", label: "Searching the crystal cluster in the Crystal Passage", check: INVESTIGATION, dc: 15, source: "Sam 2026-11-24 (Investigation, medium)", mapNarrates: true },
  "crystal:shard": { title: "Cut out a shard", label: "Cutting a crystalline shard out of a companion", check: MEDICINE, dc: 12, source: "Crystalline Aberration (EmberDM), Unstable Shatter: DC 12 Wisdom (Medicine)", mapNarrates: true },
  "sigil:find": { title: "Search the wall", label: "Searching the wall by the violet doorway", check: INVESTIGATION, dc: 15, source: "Sam's mechanic and difficulty (medium), 2026-11-24" },
  "sigil:wake": { title: "Wake the sigil", label: "Working out the sigil on the wall and waking it", check: ARCANA, dc: 15, source: "Sam's mechanic and difficulty (medium), 2026-11-24" },
  "thessaly:persuade": { title: "Talk him round", label: "Talking Old Thessaly into giving up his keelboat", check: PERSUASION, dc: 15, source: "house DC (Sam's way 2; DC Claude's)" },
  "thessaly:look": { title: "Look at him properly", label: "Studying the old fisherman by the keelboat", check: INVESTIGATION, dc: 14, source: "the bhut's False Alive, DC 14 Intelligence (Investigation) (Sam's stat block)" },
  "jimjar:bet": { title: "Bet Jimjar for it", label: "Betting Jimjar which fist holds the pebble", check: INSIGHT, dc: 13, source: "house (Sam's mechanic, DC Claude's)", mapNarrates: true },
  // STRIKING OFF THE IRONS (Sam's playtest, 2026-11-15: "Samson, even with manacles off, never was able to cast other
  // spells". Malachar narrated the irons falling; the game's manacle flag never moved, so somatic spells stayed dark).
  // BOOK RULES, OotA ch.1 Escape: pick manacles with thieves' tools DC 15 Dexterity; break them DC 20 Strength; a failure
  // can't be retried until after a long rest. Each frees only the hero who rolls. A key that fits needs no roll.
  "manacles:pick": { title: "Pick your manacles", label: "Picking the lock of their own manacles with thieves' tools", check: THIEVES_TOOLS, dc: 15, source: "OotA ch.1 Escape: pick manacles, thieves' tools DC 15", mapNarrates: true },
  // A FRIEND'S IRONS (Sam's playtest, 2026-11-22: Fifi was free with the tools and Kenta stayed in irons): the same lock,
  // worked by someone already out of theirs. OotA ch.1 Escape speaks of picking "the lock on a set of manacles"; DC 15.
  "manacles:friend": { title: "Pick a friend's manacles", label: "Picking the lock of another prisoner's manacles with thieves' tools", check: THIEVES_TOOLS, dc: 15, source: "OotA ch.1 Escape: pick manacles, thieves' tools DC 15", mapNarrates: true },
  "manacles:break": { title: "Break your manacles", label: "Wrenching their own manacles apart", check: STRENGTH, dc: 20, source: "OotA ch.1 Escape: break manacles, DC 20 Strength", mapNarrates: true },
  "manacles:wire": { title: "Work the wire", label: "Working a bent wire into their own manacles", check: SLEIGHT, dc: 15, source: "house (Sam's mechanic; OotA manacles DC 20, the wire worth 5)", mapNarrates: true },
  // THE DRUID'S WORD (Sam, 2026-11-12: "A druid can talk to one of the rats or a spider if they are successful to try to
  // get a key or small weapon"). HOMEBREW. Wisdom (Animal Handling); the DC is a house number [CLAUDE]. The map says
  // what the creature brought back, so the bridge sends nothing.
  "druid:beast": { title: "Speak to the creature", label: "Asking a pen rat or spider to fetch something from a guard", check: ANIMAL_HANDLING, dc: 13, source: "house (Sam's mechanic, DC Claude's)", mapNarrates: true },
  // A PET'S TRUST (Sam, 2026-11-23, creature companions call 1: "Yes"): feeding a pet and a Wisdom (Animal Handling)
  // check against DC 10 raises its bond by one, at most once a game day (lib/companions.mjs). HOMEBREW; the DC is
  // Sam's (he approved the proposed number). The map says what came of it, so the bridge sends nothing.
  "companion:feed": { title: "Feed your companion", label: "Feeding a pet creature to earn its trust", check: ANIMAL_HANDLING, dc: 10, source: "house (Sam 2026-11-23, creature companions)", mapNarrates: true },
  // LIFT ONLY WHAT YOU KNOW ABOUT, AND CAUGHT MEANS A FIGHT (Sam, 2026-11-13: lifting an item "shouldn't be an option
  // unless you know he has these"; "failing any check leads to combat (1:1) unless you pass a persuasion (the offended
  // lets it pass this time only) / intimidation check successfully (gives it to you but at the cost of gravity)").
  // The book has none of these checks, so every DC here is a HOUSE number [CLAUDE] for Sam to set:
  //   size-up   Wisdom (Perception) to see what is loose on someone. DC 10, the DC Sam approved for the pen gate's looks
  //             (2026-10-30: "DC 10 is fine").
  //   persuade / intimidate   Charisma against someone who has just caught your hand in their pocket. DC 15, "Medium"
  //             on the SRD's Typical Difficulty Classes table.
  // The map tells Malachar what came of each (who, which item, whether it is a fight), so the bridge sends nothing.
  "pocket:size-up": { title: "Size them up", label: "Looking over what someone has loose on them", check: PERCEPTION, dc: 10, source: "house (Sam's rule, DC Claude's; matches the pen gate looks)", mapNarrates: true },
  "caught:persuade": { title: "Talk them down", label: "Talking down someone who caught their hand in a pocket", check: PERSUASION, dc: 15, source: "house (Sam's rule, DC Claude's; SRD Medium)", mapNarrates: true },
  // THE WARD SIGIL ON THE DASHBOARD'S DICE (Sam, 2026-11-20: "the ward sigil checks should be performed like the checks
  // at the guard gate, with the roll"). Until then the map rolled these on its own d20 and only logged them: Kenta's
  // study that evening left no 🎲 line and reached no ledger. HOMEBREW throughout (the template's WARD block has the
  // rulings): OotA says only that the pen is "magically warded against casting".
  //   study   Intelligence (Arcana), or (History) for a bard who has seen its like (Sam, 2026-11-12). TIERED on the
  //           total: 10 / 15 / 20 each learn more, so there is no pass or fail and no difficulty word. 20 is the top
  //           rung, the one that reads the seam and unlocks the cut. The map sends disadvantage for a reader who is
  //           not a wizard and advantage for a friend's Help; the two cancel.
  //   cut     Dexterity DC 15 to re-cut the anchor stroke. ONE roll with two endings, both the map's: it breaks the
  //           ward, or the ward throws the cutter back (out cold, 1 hit point). The throw-back has no die of its own,
  //           so it has no row of its own.
  // The map tells Malachar what came of each (the tier's exact words; the break or the bite), so the bridge sends nothing.
  "ward:study-arcana": { title: "Study the ward sigil", label: "Studying the drow ward sigil cut into the pen wall", check: ARCANA, dc: 20, source: "house (Sam's mechanic, tiers Claude's): tiered on the total, 20+ reads the seam", mapNarrates: true, tiered: true },
  "ward:study-history": { title: "Study the ward sigil", label: "Studying the drow ward sigil, knowing its kind from their travels", check: HISTORY, dc: 20, source: "house (Sam's bard ruling 2026-11-12): tiered on the total, 20+ reads the seam", mapNarrates: true, tiered: true },
  "ward:cut": { title: "Alter the ward sigil", label: "Re-cutting an anchor stroke of the drow ward sigil", check: DEXTERITY, dc: 15, source: "house (Sam's mechanic, DC Claude's)", mapNarrates: true },
  "caught:intimidate": { title: "Make them hand it over", label: "Cowing someone who caught their hand in a pocket", check: INTIMIDATION, dc: 15, source: "house (Sam's rule, DC Claude's; SRD Medium)", mapNarrates: true },
} as const satisfies Record<string, WalkAction>

// PICKPOCKETING WHILE UNSEEN (Sam, 2026-10-27: "pick pocket should be an option when sneaking and near a character.
// If not spotted they may see what that character has in his inventory but NOT equipped. They may select something
// to steal and must roll a successful slight of hand."). The DC is the mark's own passive Perception — OotA p.19's
// "an observer's passive Wisdom (Perception) score as the base DC" — so there is one row per score the map can send,
// and the table stays closed: the bridge still refuses any key it does not find.
export const PICKPOCKET_PASSIVE_MIN = 5
export const PICKPOCKET_PASSIVE_MAX = 30
type PickpocketKey = `pickpocket:pp${number}`
const PICKPOCKET_ACTIONS = Object.fromEntries(
  Array.from({ length: PICKPOCKET_PASSIVE_MAX - PICKPOCKET_PASSIVE_MIN + 1 }, (_, i) => {
    const pp = PICKPOCKET_PASSIVE_MIN + i
    const row: WalkAction = {
      title: "Pick their pocket",
      label: "Picking a pocket while unseen",
      check: SLEIGHT,
      dc: pp,
      source: `the mark's passive Perception ${pp} (OotA p.19)`,
      mapNarrates: true,
    }
    return [`pickpocket:pp${pp}`, row]
  }),
) as Record<PickpocketKey, WalkAction>

/** The pickpocketing row for a mark with this passive Perception (clamped to the table). */
export function pickpocketKey(passive: number): PickpocketKey {
  const pp = Math.min(PICKPOCKET_PASSIVE_MAX, Math.max(PICKPOCKET_PASSIVE_MIN, Math.round(Number(passive) || 12)))
  return `pickpocket:pp${pp}`
}

export const WALK_ACTIONS: typeof BOOK_ACTIONS & Record<PickpocketKey, WalkAction> = { ...BOOK_ACTIONS, ...PICKPOCKET_ACTIONS }

export type WalkActionKey = keyof typeof WALK_ACTIONS

export function isWalkActionKey(v: unknown): v is WalkActionKey {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(WALK_ACTIONS, v)
}

/** The columns walkCheckModifier reads. Select exactly these. */
export const WALK_ROLL_COLUMNS =
  "id, name, level, proficiency_bonus, str_score, dex_score, con_score, int_score, wis_score, cha_score, " +
  "sheet_skill_proficiencies, sheet_proficiencies, sheet_heroic_inspiration, " +
  // the species, for roll-changing traits (lib/traits.mjs: Halfling Luck)
  "sheet_species"

type Row = Record<string, unknown>

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : NaN
  return Number.isFinite(n) ? n : fallback
}

/** A `characters` row as the game-context maths reads it. A missing score is 10 (modifier 0), never a guess. */
export function sheetSliceFromRow(row: Row): SheetSlice {
  const skills = row.sheet_skill_proficiencies
  return {
    id: String(row.id ?? ""),
    name: typeof row.name === "string" ? row.name : "",
    level: num(row.level, 1),
    str_score: num(row.str_score, 10),
    dex_score: num(row.dex_score, 10),
    con_score: num(row.con_score, 10),
    int_score: num(row.int_score, 10),
    wis_score: num(row.wis_score, 10),
    cha_score: num(row.cha_score, 10),
    proficiency_bonus: row.proficiency_bonus == null ? null : num(row.proficiency_bonus, 2),
    sheet_skill_proficiencies:
      skills && typeof skills === "object" && !Array.isArray(skills) ? (skills as Record<string, string>) : null,
  }
}

export function toolsFromRow(row: Row): string[] {
  const t = (row.sheet_proficiencies as { tools?: unknown } | null | undefined)?.tools
  return Array.isArray(t) ? t.filter((x): x is string => typeof x === "string") : []
}

export interface WalkModifierPart {
  /** "DEX", "Proficiency", "Expertise", "Thieves' tools" — what the roll panel's chips say. */
  label: string
  value: number
}

export interface WalkModifier {
  modifier: number
  /** True when proficiency (or expertise) went into it. */
  proficient: boolean
  /** The modifier, itemised the way the roll panel shows it. Always sums to `modifier`. */
  parts: WalkModifierPart[]
}

const ABBR: Record<Ability, string> = { str: "STR", dex: "DEX", con: "CON", int: "INT", wis: "WIS", cha: "CHA" }

/** The modifier the dashboard's sheet would use for this check. */
export function walkCheckModifier(row: Row, check: WalkCheck): WalkModifier {
  const sheet = sheetSliceFromRow(row)
  if (check.kind === "skill") {
    const { mod, prof, level } = skillBonus(sheet, check.skill)
    const parts: WalkModifierPart[] = [{ label: ABBR[SKILL_ABILITY[check.skill]], value: mod }]
    if (prof) parts.push({ label: level === "expertise" ? "Expertise" : level === "proficient" ? "Proficiency" : "Jack of all trades", value: prof })
    return { modifier: mod + prof, proficient: level !== "none", parts }
  }
  if (check.kind === "ability") {
    const mod = abilityMod(sheet[`${check.ability}_score` as const])
    return { modifier: mod, proficient: false, parts: [{ label: ABBR[check.ability], value: mod }] }
  }
  const mod = abilityMod(sheet[`${check.ability}_score` as const])
  const has = hasTool(toolsFromRow(row), check.tool)
  const prof = has ? proficiency(sheet) : 0
  const parts: WalkModifierPart[] = [{ label: ABBR[check.ability], value: mod }]
  if (prof) parts.push({ label: check.label, value: prof })
  return { modifier: mod + prof, proficient: has, parts }
}

/**
 * The DC as a word, never a number: the player sees how hard it is, not the DC
 * (Sam's ruling). The words are the DMG's Typical Difficulty Classes:
 * very easy 5, easy 10, medium 15, hard 20, very hard 25, nearly impossible 30.
 */
export function difficultyWord(dc: number): string {
  if (dc <= 5) return "Very easy"
  if (dc <= 10) return "Easy"
  if (dc <= 15) return "Medium"
  if (dc <= 20) return "Hard"
  if (dc <= 25) return "Very hard"
  return "Nearly impossible"
}

/** A tiered roll has no single DC to put a word to (WalkAction.tiered). */
export function isTiered(action: WalkAction): boolean {
  return action.tiered === true
}

/** What goes on the dice and in the log: "Pick the lock — Thieves' tools". */
export function rollLabel(action: WalkAction): string {
  return action.check.label
}

/**
 * SRD 5.1, Ability Checks: total ≥ DC succeeds. A natural 20 or 1 is not an
 * automatic success or failure on a check.
 */
export function walkVerdict(action: WalkAction, total: number): boolean {
  return total >= action.dc
}

/**
 * The line Malachar receives. He gets the verdict so his narration matches
 * what the map does next (the gate opens or it does not), and he is told the
 * same thing every dashboard roll tells him: never say the numbers.
 */
export function walkRollMessage(who: string, action: WalkAction, rollText: string, success: boolean): string {
  return (
    `[Dice Roll] ${who} — ${action.label} (${action.check.label}). ${rollText}. ` +
    `Against DC ${action.dc} (${action.source}) this ${success ? "SUCCEEDS" : "FAILS"}, and the map has already shown it. ` +
    `Narrate that outcome only - never say the roll, the total, the DC or the AC; do not re-roll.`
  )
}

// --- the message contract between the map and the page ----------------------

/** Map → page. */
export interface WalkRollRequest {
  type: "aop:roll"
  id: string
  action: WalkActionKey
  /** The map's guess at who is acting (its leader's character row). Used only when this browser holds no seat. */
  characterId?: string | null
  /** Roll with advantage: a friend's Help, as the map grants it (the spool, OotA area 5). */
  advantage?: boolean
  /**
   * Roll with DISADVANTAGE, because of something the map knows and the sheet does not — manacles, above all
   * (Sam, 2026-10-30: picking or forcing the pen gate in cuffs "should show disadvantaged because of
   * [manacled]"). The map sends the fact; `reason` is the words the roll panel shows for it.
   * Advantage and disadvantage cancel, as 5e has them cancel: neither is applied.
   */
  disadvantage?: boolean
  /** Why it is at disadvantage, in the player's words ("manacled"). Shown on the roll panel. */
  edgeReason?: string
}

/** Page → map: "I have it, the roll panel is open." After this the map waits as long as the player does. */
export interface WalkRollAck {
  type: "aop:roll-ack"
  id: string
}

/** Page → map. `cancelled` is the player stepping back from the roll panel: no roll, nothing to say. */
export interface WalkRollReply {
  type: "aop:roll-result"
  id: string
  ok: boolean
  success?: boolean
  total?: number
  natural?: number
  cancelled?: boolean
  error?: string
}

/** Shape-check a postMessage payload. Anything else is ignored. */
export function parseWalkRollRequest(data: unknown): WalkRollRequest | null {
  if (!data || typeof data !== "object") return null
  const d = data as Record<string, unknown>
  if (d.type !== "aop:roll") return null
  if (typeof d.id !== "string" || d.id.length === 0 || d.id.length > 64) return null
  if (!isWalkActionKey(d.action)) return null
  const characterId = typeof d.characterId === "string" && d.characterId.length <= 64 ? d.characterId : null
  const advantage = d.advantage === true, disadvantage = d.disadvantage === true
  const reason = typeof d.edgeReason === "string" && d.edgeReason.length <= 60 ? d.edgeReason : undefined
  // 5e: advantage and disadvantage cancel each other out, however many of each there are.
  return { type: "aop:roll", id: d.id, action: d.action, characterId,
    advantage: advantage && !disadvantage, disadvantage: disadvantage && !advantage,
    edgeReason: disadvantage && !advantage ? reason : undefined }
}
