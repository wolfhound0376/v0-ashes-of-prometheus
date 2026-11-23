// THE POOL'S WATER (Sam, 2026-11-23: "go water"; design of record claude/Gray_Ooze_Pool_Module_2026-11-23.md §4).
// The rules are the SRD's, read as follows; the readings that are Claude's are marked [CLAUDE].
//
// SWIMMING (SRD 5.1, Movement > Climbing, Swimming, and Crawling): "each foot of movement costs 1 extra foot ... unless a
// creature has a swimming speed". On the map that is the same doubling as the web net's difficult terrain.
//
// UNDERWATER COMBAT (SRD 5.1, Combat > Underwater Combat):
//   - "When making a melee weapon attack, a creature that doesn't have a swimming speed (either natural or granted by
//     magic) has disadvantage on the attack roll unless the weapon is a dagger, javelin, shortsword, spear, or trident."
//   - "A ranged weapon attack automatically misses a target beyond the weapon's normal range. Even against a target
//     within normal range, the attack roll has disadvantage unless the weapon is a crossbow, a net, or a weapon that is
//     thrown like a javelin (including a spear, trident, or dart)."
//   - "Creatures and objects that are fully immersed in water have resistance to fire damage." NOT applied: a hero
//     swimming in the pool is at the surface, not fully immersed [CLAUDE].
// [CLAUDE] When the rules apply: to a WEAPON attack made BY a creature in the pool's deep water (it fights from the
// water). An attack from the shore or the shallows into the water is an ordinary attack. Spells are not weapon attacks
// and are untouched.
//
// THE HUNT (Sam's go, 2026-11-23: the drow hunt reaches the waterfall in 4 rounds). [CLAUDE] If the pool's fight starts
// while the escape is HUNTED, the hunt walks in at the start of round 5 (after four full rounds): Jorlan leading with two
// guards, as the escape's own design has it ("Jorlan leads the hunt"); if Jorlan gave his word and kept it, he stands
// aside and two guards come. They come along the cavern floor (the lift lands by the pool, OotA p.17-18), so they walk in
// from the shore, not down the falls.

export const WATER_SOURCE = "SRD 5.1: Movement (swimming); Combat, Underwater Combat"

/** Melee weapons that fight underwater without disadvantage (SRD 5.1 list). */
export const UW_MELEE_OK = ["dagger", "javelin", "shortsword", "spear", "trident"]
/** Ranged weapons that shoot underwater without disadvantage: crossbows, nets, and the javelin-like throwers. */
export const UW_RANGED_OK = ["crossbow", "net", "javelin", "spear", "trident", "dart"]

/** "Light Crossbow" -> "light crossbow"; "Shortsword (Lolth's Tooth)" -> "shortsword (lolth's tooth)". */
const waterNorm = s => String(s || "").toLowerCase().replace(/[’']/g, "'").trim()
const waterWords = s => waterNorm(s).split(/[^a-z]+/).filter(Boolean)

/** True for a weapon named on a list: a whole word ("shortsword"), or "crossbow" inside "hand crossbow". */
export function weaponOnList(name, list) {
  const w = waterWords(name)
  return list.some(k => w.includes(k) || w.some(x => x.endsWith(k)))
}

/** Each foot costs one more for a creature without a swimming speed. Returns the multiplier on movement. */
export function swimFactor(swimSpeed) {
  return Number(swimSpeed) > 0 ? 1 : 2
}

/**
 * The underwater combat rule for one weapon attack made from the water.
 * @param {{melee?: boolean, weapon?: string, swimSpeed?: number, thrown?: boolean, beyondNormal?: boolean}} [a]
 * @returns {{edge: number, autoMiss: boolean, why: string}} edge -1 = disadvantage, 0 = none
 */
export function underwaterAttack({ melee = true, weapon = "", swimSpeed = 0, thrown = false, beyondNormal = false } = {}) {
  if (melee) {
    if (Number(swimSpeed) > 0) return { edge: 0, autoMiss: false, why: "" }
    if (weaponOnList(weapon, UW_MELEE_OK)) return { edge: 0, autoMiss: false, why: "" }
    return { edge: -1, autoMiss: false, why: "swinging underwater" }
  }
  if (beyondNormal) return { edge: 0, autoMiss: true, why: "underwater, beyond normal range" }
  const javelinLike = thrown && weaponOnList(weapon, ["javelin", "spear", "trident", "dart"])
  if (javelinLike || (!thrown && weaponOnList(weapon, ["crossbow", "net"]))) return { edge: 0, autoMiss: false, why: "" }
  return { edge: -1, autoMiss: false, why: "shooting underwater" }
}

/** Rounds before the drow hunt reaches the pool's fight (Sam's go). */
export const HUNT_ROUNDS = 4

/** Who comes: Jorlan leading two guards, unless he gave his word and kept it. */
export function huntParty({ jorlanStandsAside = false } = {}) {
  return jorlanStandsAside ? ["drow-guard-male", "drow-guard-female"] : ["jorlan", "drow-guard-male", "drow-guard-female"]
}

/** The round the hunt walks in, for a fight that started in round `startRound` (the start of the fifth round). */
export function huntDueRound(startRound = 1) {
  return (Number(startRound) || 1) + HUNT_ROUNDS
}
