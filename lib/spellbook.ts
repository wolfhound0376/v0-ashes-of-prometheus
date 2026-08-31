// ============================================================================
// THE SPELLBOOK — one row per ability, carrying everything the board needs.
//
// Until now three different files each knew a piece of a spell: the icon map
// knew its art, ability-blurbs knew its prose, and token-animation guessed its
// weight from the name. Nothing knew its RANGE, which is why the rack could
// offer Kenta a touch spell against a drow thirty feet away, and nothing knew
// its damage type, which is why every spell would have sounded the same.
//
// So: one registry. A spell that is missing from it still renders and still
// casts — it simply falls back to sensible defaults — because a HUD that hides
// a spell because a developer forgot to type it in is worse than one that
// offers it with a generic sound.
//
// Mechanics are SRD 5.1 (CC-BY-4.0). Where the SRD and the party's sheets
// disagree, the SHEET wins: it is Sam's table, and `sheet_spellcasting` is
// what Malachar reads from.
// ============================================================================

import { blurbFor, type Blurb } from "./ability-blurbs"

/** Which family of windup/release/tail plays. Maps 1:1 to sfx/magic/<school>_*. */
export type School =
  | "arcane" | "cold" | "eldritch" | "fire" | "holy" | "nature" | "necrotic" | "psychic"

/** Which impact_<type> lands on the target. Maps 1:1 to sfx/magic/impact_*. */
export type DamageType =
  | "acid" | "cold" | "fire" | "force" | "lightning"
  | "necrotic" | "poison" | "psychic" | "radiant" | "thunder"

/**
 * What the caster must pick before it goes off.
 *
 *   creature — one target within range; the board lights legal squares
 *   self     — no pick, it lands on the caster
 *   point    — a spot on the floor (Fog Cloud, area spells)
 *   none     — no targeting at all (Thaumaturgy, Minor Illusion, Dash)
 */
export type TargetMode = "creature" | "self" | "point" | "none"

/**
 * The footprint an area spell puts on the floor.
 *
 *   sphere   — a radius around the point. Fireball, Fog Cloud, Sleep.
 *   cylinder — a radius, but it does not care about height. Moonbeam.
 *   cone     — a wedge opening away from the caster. Burning Hands.
 *   cube     — an axis-aligned box. Thunderwave, Web, Grease.
 *   line     — a straight run of squares. Lightning Bolt.
 */
export type AreaShape = "sphere" | "cylinder" | "cone" | "cube" | "line"

export interface AreaSpec {
  shape: AreaShape
  /**
   * Feet. Its meaning follows the shape, exactly as the SRD states each one:
   *   sphere / cylinder → RADIUS
   *   cone / line       → LENGTH from the origin
   *   cube              → EDGE
   * Mixing radius and diameter is the classic way to make Fireball twice the
   * spell it should be, so the unit is named per shape rather than guessed.
   */
  sizeFt: number
  /** A line's width. Only lines have one. */
  widthFt?: number
  /**
   * Where the shape is anchored.
   *   self  — it opens from the caster; the player picks a DIRECTION.
   *   point — it is centred where the player clicks, within rangeFt.
   */
  origin: "self" | "point"
  /**
   * The spell picks its victims and spares everyone else — Spirit Guardians'
   * "creatures of your choice". Absent means the area is indiscriminate,
   * which is the common case and the one that makes friendly fire a decision
   * rather than an accident.
   */
  sparesAllies?: boolean
}

/**
 * How the spell decides whether it lands.
 *   attack — a spell attack roll against the target's AC
 *   save   — the target rolls; on a success it takes half (or nothing)
 *   auto   — it just happens (Magic Missile, healing)
 *   none   — no resolution at all (utility, illusions)
 */
export type Resolution = "attack" | "save" | "auto" | "none"

export interface SpellEntry {
  /** 0 = cantrip, else the slot level it burns. */
  level: number
  school: School
  /** Absent for spells that deal no damage — no impact sound plays. */
  damage?: DamageType
  /** Feet. 5 means touch/melee. 0 means self. */
  rangeFt: number
  target: TargetMode
  concentration?: boolean
  /** Cast as a bonus action rather than an action. */
  bonus?: boolean
  /** A friendly target: the board should light allies, not enemies. */
  helpful?: boolean
  /** How it lands. Defaults to "none" — an unknown spell never deals damage
   *  by accident, which is the safe direction for a mistake to fall. */
  resolve?: Resolution
  /** Damage or healing dice, e.g. "4d6". Scales with level elsewhere. */
  dice?: string
  /** Which save the target rolls, when resolve is "save". */
  save?: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA"
  /** A successful save takes half rather than none. */
  halfOnSave?: boolean
  /** Heals instead of harming; dice are added to hp. */
  heals?: boolean
  /**
   * The footprint, for spells that cover ground rather than pick a creature.
   * Only ever set alongside target:"point" — an area with nowhere to be put
   * is a contradiction the board cannot draw.
   */
  area?: AreaSpec
}

const S = (e: SpellEntry) => e

// Shape constructors, so the table below stays readable at a glance and the
// radius-vs-diameter trap is sprung once here rather than on every row.
const sphere   = (sizeFt: number, origin: "self" | "point" = "point"): AreaSpec => ({ shape: "sphere", sizeFt, origin })
const cylinder = (sizeFt: number): AreaSpec => ({ shape: "cylinder", sizeFt, origin: "point" })
const cube     = (sizeFt: number, origin: "self" | "point" = "point"): AreaSpec => ({ shape: "cube", sizeFt, origin })
const cone     = (sizeFt: number): AreaSpec => ({ shape: "cone", sizeFt, origin: "self" })
const line     = (sizeFt: number, widthFt = 5): AreaSpec => ({ shape: "line", sizeFt, widthFt, origin: "self" })

export const SPELLBOOK: Record<string, SpellEntry> = {
  // ---- Kenta, sorcerer ----------------------------------------------------
  "ray of frost":      S({ level: 0, school: "cold",     damage: "cold",      rangeFt: 60,  target: "creature", resolve: "attack", dice: "1d8" }),
  "shocking grasp":    S({ level: 0, school: "arcane",   damage: "lightning", rangeFt: 5,   target: "creature", resolve: "attack", dice: "1d8" }),
  "chill touch":       S({ level: 0, school: "necrotic", damage: "necrotic",  rangeFt: 120, target: "creature", resolve: "attack", dice: "1d8" }),
  "minor illusion":    S({ level: 0, school: "arcane",                        rangeFt: 30,  target: "point", area: cube(5) }),
  "disguise self":     S({ level: 1, school: "arcane",                        rangeFt: 0,   target: "self" }),
  "fog cloud":         S({ level: 1, school: "nature",                        rangeFt: 120, target: "point", concentration: true, area: sphere(20) }),

  // ---- Samson, cleric -----------------------------------------------------
  guidance:            S({ level: 0, school: "holy",                          rangeFt: 5,   target: "creature", concentration: true, helpful: true }),
  "toll the dead":     S({ level: 0, school: "necrotic", damage: "necrotic",  rangeFt: 60,  target: "creature", resolve: "save", save: "WIS", dice: "1d8" }),
  thaumaturgy:         S({ level: 0, school: "holy",                          rangeFt: 30,  target: "none" }),
  sanctuary:           S({ level: 1, school: "holy",                          rangeFt: 30,  target: "creature", bonus: true, helpful: true }),
  "healing word":      S({ level: 1, school: "holy",                          rangeFt: 60,  target: "creature", bonus: true, helpful: true, resolve: "auto", dice: "1d4", heals: true }),
  "guiding bolt":      S({ level: 1, school: "holy",     damage: "radiant",   rangeFt: 120, target: "creature", resolve: "attack", dice: "4d6" }),
  "shield of faith":   S({ level: 1, school: "holy",                          rangeFt: 60,  target: "creature", bonus: true, helpful: true, concentration: true }),

  // ---- Scott, bard --------------------------------------------------------
  // Mage Hand and Misty Step are point-target with NO area: the player picks
  // a square, and the square is the whole answer. An `area` here would have
  // the board draw a blast template around a floating hand.
  "mage hand":         S({ level: 0, school: "arcane",                        rangeFt: 30,  target: "point" }),
  "vicious mockery":   S({ level: 0, school: "psychic",  damage: "psychic",   rangeFt: 60,  target: "creature", resolve: "save", save: "WIS", dice: "1d4" }),
  "dissonant whispers":S({ level: 1, school: "psychic",  damage: "psychic",   rangeFt: 60,  target: "creature", resolve: "save", save: "WIS", dice: "3d6", halfOnSave: true }),
  "faerie fire":       S({ level: 1, school: "arcane",                        rangeFt: 60,  target: "point", concentration: true, save: "DEX", area: cube(20) }),
  sleep:               S({ level: 1, school: "arcane",                        rangeFt: 90,  target: "point", area: sphere(20) }),

  // ---- commonly reached for, so the registry does not go stale the first
  //      time somebody levels ------------------------------------------------
  "eldritch blast":    S({ level: 0, school: "eldritch", damage: "force",     rangeFt: 120, target: "creature", resolve: "attack", dice: "1d10" }),
  "sacred flame":      S({ level: 0, school: "holy",     damage: "radiant",   rangeFt: 60,  target: "creature", resolve: "save", save: "DEX", dice: "1d8" }),
  "fire bolt":         S({ level: 0, school: "fire",     damage: "fire",      rangeFt: 120, target: "creature", resolve: "attack", dice: "1d10" }),
  "cure wounds":       S({ level: 1, school: "holy",                          rangeFt: 5,   target: "creature", helpful: true, resolve: "auto", dice: "1d8", heals: true }),
  "magic missile":     S({ level: 1, school: "arcane",   damage: "force",     rangeFt: 120, target: "creature", resolve: "auto", dice: "3d4+3" }),
  // Self-origin shapes. rangeFt is 0 because the spell reaches nowhere on its
  // own — the SHAPE is its reach, and the player picks a direction rather than
  // a distant point. Leaving rangeFt at 15 made the board offer a 15 ft
  // "range" it then had no way to honour.
  "burning hands":     S({ level: 1, school: "fire",     damage: "fire",      rangeFt: 0,   target: "point", save: "DEX", area: cone(15) }),
  "thunderwave":       S({ level: 1, school: "arcane",   damage: "thunder",   rangeFt: 0,   target: "point", save: "CON", area: cube(15, "self") }),
  "color spray":       S({ level: 1, school: "arcane",                        rangeFt: 0,   target: "point", area: cone(15) }),
  "inflict wounds":    S({ level: 1, school: "necrotic", damage: "necrotic",  rangeFt: 5,   target: "creature", resolve: "attack", dice: "3d10" }),
  "hellish rebuke":    S({ level: 1, school: "fire",     damage: "fire",      rangeFt: 60,  target: "creature" }),
  "misty step":        S({ level: 2, school: "arcane",                        rangeFt: 30,  target: "point", bonus: true }),
  "spiritual weapon":  S({ level: 2, school: "holy",     damage: "force",     rangeFt: 60,  target: "creature", bonus: true }),
  "hex":               S({ level: 1, school: "eldritch", damage: "necrotic",  rangeFt: 90,  target: "creature", bonus: true, concentration: true }),
  fireball:            S({ level: 3, school: "fire",     damage: "fire",      rangeFt: 150, target: "point", save: "DEX", halfOnSave: true, area: sphere(20) }),

  // ---- THE AREA SPELLS ----------------------------------------------------
  // The ground-covering half of the book, gathered so the shapes can be read
  // against each other. Every size below is stated in the unit AreaSpec names
  // for that shape — radius for spheres and cylinders, edge for cubes, length
  // for cones and lines — taken from SRD 5.1.
  //
  // Deliberately carrying NO dice or resolve yet. The cast handler resolves
  // against exactly one victim; give Fireball 8d6 today and it would roll
  // that against a single drow and call the other four untouched. The dice
  // arrive with multi-target resolution, in the same change, so a spell can
  // never know how to hurt more people than the server knows how to count.
  shatter:             S({ level: 2, school: "arcane",   damage: "thunder",   rangeFt: 60,  target: "point", save: "CON", halfOnSave: true, area: sphere(10) }),
  silence:             S({ level: 2, school: "holy",                          rangeFt: 120, target: "point", concentration: true, area: sphere(20) }),
  web:                 S({ level: 2, school: "nature",                        rangeFt: 60,  target: "point", concentration: true, save: "DEX", area: cube(20) }),
  grease:              S({ level: 1, school: "arcane",                        rangeFt: 60,  target: "point", save: "DEX", area: cube(10) }),
  entangle:            S({ level: 1, school: "nature",                        rangeFt: 90,  target: "point", concentration: true, save: "STR", area: cube(20) }),
  // Spike Growth deals PIERCING, which is not one of the magical damage types
  // this registry names — so it carries none, and makes no impact sound. That
  // is the honest answer, not a shrug.
  "spike growth":      S({ level: 2, school: "nature",                        rangeFt: 150, target: "point", concentration: true, area: sphere(20) }),
  moonbeam:            S({ level: 2, school: "holy",     damage: "radiant",   rangeFt: 120, target: "point", concentration: true, save: "CON", halfOnSave: true, area: cylinder(5) }),
  "cloud of daggers":  S({ level: 2, school: "arcane",   damage: "force",     rangeFt: 60,  target: "point", concentration: true, area: cube(5) }),
  // A 5-foot-DIAMETER sphere, so the radius is 2.5. Exactly the trap the
  // shape constructors exist to make visible.
  "flaming sphere":    S({ level: 2, school: "fire",     damage: "fire",      rangeFt: 60,  target: "point", concentration: true, save: "DEX", halfOnSave: true, area: sphere(2.5) }),
  // Spares your own: "creatures of your choice that you can see". The only
  // area in the book that does, which is why friendly fire is a decision
  // everywhere else.
  "spirit guardians":  S({ level: 3, school: "holy",     damage: "radiant",   rangeFt: 0,   target: "point", concentration: true, save: "WIS", halfOnSave: true, area: { shape: "sphere", sizeFt: 15, origin: "self", sparesAllies: true } }),
  "lightning bolt":    S({ level: 3, school: "arcane",   damage: "lightning", rangeFt: 0,   target: "point", save: "DEX", halfOnSave: true, area: line(100, 5) }),
}

/**
 * Every spell that puts a shape on the floor, for the board's template code
 * and for anyone reading the book to see what it can already draw.
 *
 * DERIVED, never typed twice. A hand-kept second list is a list that drifts.
 */
export const AREA_SPELLS: { name: string; area: AreaSpec; entry: SpellEntry }[] =
  Object.entries(SPELLBOOK)
    .filter(([, e]) => e.area)
    .map(([name, entry]) => ({ name, area: entry.area as AreaSpec, entry }))

const norm = (n: string) => n.toLowerCase().replace(/['’]/g, "").trim()

/** Unknown spells still work — ranged, arcane, no impact sound. */
export const DEFAULT_ENTRY: SpellEntry = { level: 0, school: "arcane", rangeFt: 60, target: "creature" }

export const spellEntry = (name: string): SpellEntry => SPELLBOOK[norm(name)] ?? DEFAULT_ENTRY

/** Everything the rack and the board need about one pressable thing. */
export interface RackItem {
  name: string
  /** action = universal, weapon = from THIS character's inventory, else magic. */
  kind: "action" | "weapon" | "cantrip" | "prepared"
  entry: SpellEntry
  blurb: Blurb | null
  /** False when it cannot be used right now, with `why` explaining. */
  usable: boolean
  why?: string
  /** Weapons carry their own to-hit and damage off the sheet. */
  toHit?: string
  damage?: string
}

export interface Spellcasting {
  slots?: Record<string, { max?: number; used?: number }>
  cantrips?: string[]
  prepared?: string[]
  always_prepared?: string[]
}
interface SheetAttack {
  name?: string
  hit?: string
  damage?: string
  range?: string
  type?: string
}

/**
 * Is this ability on the character's sheet at all?
 *
 * The rack already only OFFERS what the sheet holds, but the rack is a
 * browser and a browser can be told to say anything. The server calls this
 * before it resolves a cast, so "Samson casts Fireball" is refused at the
 * only place that matters rather than merely being hard to click.
 */
export function knowsSpell(sc: Spellcasting | null | undefined, name: string): boolean {
  const want = norm(name)
  return [...(sc?.cantrips ?? []), ...(sc?.always_prepared ?? []), ...(sc?.prepared ?? [])]
    .some((n) => norm(n) === want)
}

/** Which half of the turn economy this costs. Weapons always cost the action. */
export function phaseCost(entry: SpellEntry, isWeapon: boolean): "action" | "bonus" {
  return !isWeapon && entry.bonus ? "bonus" : "action"
}

/** Slots left at a given level, per the sheet. */
export function slotsLeft(sc: Spellcasting | null | undefined, level: number): number {
  if (level === 0) return Infinity // cantrips are at will
  const s = sc?.slots?.[String(level)]
  if (!s) return 0
  return Math.max(0, (s.max ?? 0) - (s.used ?? 0))
}

/**
 * What THIS character can actually press, right now.
 *
 * Sam's brief: "The spell and actions need to be specific to the character,
 * only available spells based on DND 5E, inventory for that character."
 *
 * So the rack is composed, in order:
 *   1. their real weapons, off sheet_attacks — the inventory gate. A cleric
 *      with a mace gets Mace, not a generic "Attack" button.
 *   2. their cantrips, always available
 *   3. their prepared spells, DIMMED rather than hidden when the slots are
 *      gone: a player needs to see that Guiding Bolt exists and is spent, not
 *      wonder where it went.
 *   4. the universal actions anyone may take.
 */
export function rackFor(args: {
  spellcasting?: Spellcasting | null
  attacks?: SheetAttack[] | null
  coreActions: string[]
}): RackItem[] {
  const { spellcasting: sc, attacks, coreActions } = args
  const out: RackItem[] = []

  for (const a of attacks ?? []) {
    if (!a?.name) continue
    out.push({
      name: a.name,
      kind: "weapon",
      entry: { level: 0, school: "arcane", rangeFt: parseInt(String(a.range ?? "5").replace(/[^0-9]/g, ""), 10) || 5, target: "creature" },
      blurb: blurbFor(a.name),
      usable: true,
      toHit: a.hit,
      damage: a.damage,
    })
  }

  for (const n of sc?.cantrips ?? []) {
    out.push({ name: n, kind: "cantrip", entry: spellEntry(n), blurb: blurbFor(n), usable: true })
  }

  const prepared = [...(sc?.always_prepared ?? []), ...(sc?.prepared ?? [])]
  for (const n of prepared) {
    const entry = spellEntry(n)
    const left = slotsLeft(sc, entry.level)
    out.push({
      name: n,
      kind: "prepared",
      entry,
      blurb: blurbFor(n),
      usable: left > 0,
      why: left > 0 ? undefined : `No level ${entry.level} slots left`,
    })
  }

  for (const n of coreActions) {
    out.push({
      name: n,
      kind: "action",
      entry: { level: 0, school: "arcane", rangeFt: 0, target: "none" },
      blurb: blurbFor(n),
      usable: true,
    })
  }

  return out
}


/** "3d4+3" → rolled total. Unknown shapes roll nothing rather than guessing. */
export function rollDice(spec: string, rng: () => number = Math.random): number {
  const m = spec.trim().match(/^(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?$/i)
  if (!m) return 0
  const [, countS, dieS, sign, bonusS] = m
  let total = 0
  for (let i = 0; i < Number(countS); i++) total += 1 + Math.floor(rng() * Number(dieS))
  if (bonusS) total += (sign === "-" ? -1 : 1) * Number(bonusS)
  return Math.max(0, total)
}
