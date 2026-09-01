// ============================================================================
// WEAPONS — what a character can actually swing, derived from what they carry.
//
// THE BUG THIS EXISTS TO KILL.
//
// `characters.sheet_attacks` used to be the rack's source of weapons, and the
// comment above rackFor called it "the inventory gate". It was not one. It was
// a SECOND copy of the truth, hand-maintained, and it had already drifted:
//
//   - The drow confiscated the party's gear at Velkynvelve. Every PC's
//     inventory was correctly reduced to rags, a quill and a journal, and the
//     stash row holds each weapon tagged `confiscated_from` its owner.
//   - Their SHEETS still listed Spear, Dagger and Mace. The board cheerfully
//     offered Kenta a spear that was, in the fiction, locked in a drow store
//     room forty feet away.
//   - Scott's sheet was empty, so he could not even punch — and he was the
//     only one whose rack was telling the truth.
//
// Fixing the rows by hand fixes today. It does not survive the party getting
// their gear back, which is a scene that is coming.
//
// So the rack is now a FUNCTION of the inventory. Pick up a rapier and it
// appears; have it taken and it goes. Nobody edits a sheet.
//
// Pure, and shared with the server for the same reason lib/aoe.ts is: the
// board must not be able to offer a weapon that the cast handler will refuse,
// and the cast handler must not accept one the board never offered.
// ============================================================================

/** One weapon a character is carrying, as the item catalog describes it. */
export interface CarriedWeapon {
  name: string
  /** Dice off `items.properties.damage`, e.g. "1d6". Absent for junk. */
  damage?: string | null
  /** `items.properties.damage_type`, e.g. "piercing". */
  damageType?: string | null
  /** `items.properties.range`, e.g. "20/60". Absent for pure melee. */
  rangeSpec?: string | null
  /** `items.properties.weapon_properties`: finesse, light, thrown, reach… */
  properties?: string[] | null
}

/** The wielder's half of the arithmetic. */
export interface Wielder {
  strScore?: number | null
  dexScore?: number | null
  proficiencyBonus?: number | null
}

/** The shape the rack and the cast handler both consume. */
export interface DerivedAttack {
  name: string
  /** "+5" — signed, because that is how a character sheet reads. */
  hit: string
  /** "1d6+1 Piercing", or "1 Bludgeoning" for a fist. */
  damage: string
  /** "5 ft." / "20 ft." — what the board parses into a reach. */
  range: string
}

const mod = (score: number | null | undefined) => Math.floor(((score ?? 10) - 10) / 2)
const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const has = (w: CarriedWeapon, p: string) =>
  (w.properties ?? []).some((x) => String(x).toLowerCase() === p)

/**
 * Which ability swings it.
 *
 * SRD 5.1: ranged weapons use Dexterity; melee weapons use Strength; a finesse
 * weapon may use either, and a character always picks the better one — so this
 * takes the max rather than asking.
 *
 * "ammunition" is the honest test for ranged. A dagger has a thrown range and
 * is still a Strength weapon in the hand; a shortbow is not.
 */
function abilityMod(w: CarriedWeapon, s: Wielder): number {
  const str = mod(s.strScore)
  const dex = mod(s.dexScore)
  if (has(w, "ammunition")) return dex
  if (has(w, "finesse")) return Math.max(str, dex)
  return str
}

/**
 * Reach, in the board's units.
 *
 * A thrown melee weapon still reaches 5 ft in the hand — the throw is a
 * different action and the rack is not offering it. Only an ammunition weapon
 * gets its catalogue range, and only the SHORT half of it: "80/320" means
 * normal to 80, disadvantage beyond, and the board has no notion of
 * disadvantage yet. Offering 320 ft would promise a shot the rules penalise.
 */
function reachFt(w: CarriedWeapon): number {
  if (has(w, "ammunition")) {
    const short = Number.parseInt(String(w.rangeSpec ?? "").split("/")[0] ?? "", 10)
    if (Number.isFinite(short) && short > 0) return short
  }
  if (has(w, "reach")) return 10
  return 5
}

const titleCase = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/**
 * One carried weapon → one rack entry.
 *
 * PROFICIENCY IS ASSUMED. Every weapon any of these four characters owns is
 * one their class is proficient with, so modelling the full proficiency table
 * would add a lot of surface to change nothing. It is a real simplification
 * and it will be wrong the first time somebody loots a weapon outside their
 * class — noted here rather than discovered later.
 */
export function attackFrom(w: CarriedWeapon, s: Wielder): DerivedAttack {
  const ab = abilityMod(w, s)
  const prof = s.proficiencyBonus ?? 2
  const dice = (w.damage ?? "").trim()
  const type = titleCase(String(w.damageType ?? "").trim())

  // "1d6" + (+1) → "1d6+1". A zero modifier is left off rather than written
  // as "+0", which reads as a mistake on a sheet.
  const dmg = dice
    ? `${dice}${ab !== 0 ? sign(ab) : ""}${type ? ` ${type}` : ""}`
    : `${Math.max(1, 1 + ab)}${type ? ` ${type}` : ""}`

  return {
    name: w.name,
    hit: sign(ab + prof),
    damage: dmg,
    range: `${reachFt(w)} ft.`,
  }
}

/**
 * The one attack nobody can be disarmed of.
 *
 * Synthesised rather than stored. It was a row on three sheets and missing
 * from the fourth, which is exactly the drift this file exists to end: a fist
 * is not inventory, so it should never have been data.
 *
 * SRD 5.1: an unarmed strike deals 1 + Strength modifier bludgeoning damage,
 * and every character is proficient with it. Floored at 1 — a weak character
 * still hurts you slightly.
 */
export function unarmedStrike(s: Wielder): DerivedAttack {
  const str = mod(s.strScore)
  return {
    name: "Unarmed Strike",
    hit: sign(str + (s.proficiencyBonus ?? 2)),
    damage: `${Math.max(1, 1 + str)} Bludgeoning`,
    range: "5 ft.",
  }
}

/** A catalog row, however the join happened to shape it. */
interface RawItemJoin {
  name?: string | null
  item_type?: string | null
  items?: { item_type?: string | null; properties?: Record<string, unknown> | null } | null
  properties?: Record<string, unknown> | null
}

/**
 * Everything this character can attack with, in rack order: their weapons,
 * then the fist that is always there.
 *
 * Non-weapons are dropped. A journal is not a mace, and the whole point of
 * reading inventory is that the answer is the truth rather than a list
 * somebody remembered to update.
 */
export function attacksFromInventory(rows: RawItemJoin[] | null | undefined, s: Wielder): DerivedAttack[] {
  const out: DerivedAttack[] = []
  for (const r of rows ?? []) {
    const type = String(r.items?.item_type ?? r.item_type ?? "").toLowerCase()
    if (type !== "weapon") continue
    const props = (r.items?.properties ?? r.properties ?? {}) as Record<string, unknown>
    if (!r.name) continue
    out.push(
      attackFrom(
        {
          name: r.name,
          damage: props.damage as string | undefined,
          damageType: props.damage_type as string | undefined,
          rangeSpec: props.range as string | undefined,
          properties: (props.weapon_properties as string[] | undefined) ?? [],
        },
        s,
      ),
    )
  }
  out.push(unarmedStrike(s))
  return out
}
