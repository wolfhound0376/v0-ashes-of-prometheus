// Stinking Cloud and Cloudkill — the rules, pure, in one copy.
//
// Plain JavaScript for the same reason as lib/rage.mjs and lib/area-cloud.mjs: build_walk.py pastes this file into
// the painted map at its POISON_CLOUDS placeholder (minus `export`), so the map and lib/poison-clouds.test.ts read the
// SAME functions. tsconfig has allowJs; the JSDoc types the tests.
//
// THE SOURCES, both in campaign_chunks (SRD 5.1, canon-as-ingested):
//
//   SRD 5.1, Spells: Stinking Cloud (3rd-level conjuration; range 90 feet; concentration, up to 1 minute)
//     "You create a 20-foot radius sphere of yellow, nauseating gas centered on a point within range. The cloud
//      spreads around corners, and its area is heavily obscured. The cloud lingers in the air for the duration.
//      Each creature that is completely within the cloud at the start of its turn must make a Constitution saving
//      throw against poison. On a failed save, the creature spends its action that turn retching and reeling.
//      Creatures that don't need to breathe or are immune to poison automatically succeed on this saving throw."
//
//   SRD 5.1, Spells: Cloudkill (5th-level conjuration; range 120 feet; concentration, up to 10 minutes)
//     "You create a 20-foot radius sphere of poisonous, yellow-green fog centered on a point you choose within range.
//      ... Its area is heavily obscured. When a creature enters the spell's area for the first time on a turn or
//      starts its turn there, that creature must make a Constitution saving throw. The creature takes 5d8 poison
//      damage on a failed save, or half as much damage on a successful one. Creatures are affected even if they
//      hold their breath or don't need to breathe. The fog moves 10 feet away from you at the start of each of your
//      turns, rolling along the surface of the ground. ... At Higher Levels. When you cast this spell using a spell
//      slot of 6th level or higher, the damage increases by 1d8 for each slot level above 5th."
//
// WHAT THE MAP DOES NOT MODEL, and why:
//   - Wind (both spells): the plates have no weather. Nothing on them disperses a cloud.
//   - "Heavily obscured": for attacks it cancels itself out under SRD 5.1 (an attacker who cannot see its target has
//     disadvantage; a target that cannot see its attacker grants advantage; the two cancel) for anyone in or looking
//     into the cloud, so leaving it out changes no attack roll. What it would change is targeting "a creature you can
//     see", which the map does not check for any spell yet.
//   - "Sink to the lowest level ... pouring down openings": the plates are flat floors.
//   - Cloudkill's damage for a creature that is already inside when the fog is CREATED: the text triggers on entering
//     or starting a turn there, so a creature caught at the moment of casting takes nothing until one of those.

/** Squares are 5 ft; a Medium body is half a square across its centre. */
export const BODY_FT = 2.5

/**
 * The two spells, as the map needs them.
 *   radiusFt   the sphere's radius
 *   rounds     concentration cap in rounds (1 minute = 10)
 *   whole      Stinking Cloud asks for a creature "completely within"; Cloudkill for one that enters or is there
 *   onEnter    Cloudkill also triggers on entering the area for the first time on a turn
 *   dmg/half   Cloudkill's 5d8 poison, half on a success; none for Stinking Cloud
 *   retch      Stinking Cloud's failed save: the action is spent retching and reeling
 *   breath     true: a creature that doesn't need to breathe (or is immune to poison) succeeds automatically
 *   drift      feet the fog rolls away from the caster at the start of each of the caster's turns
 *   skulls     Sam, 2026-10-25: "skeleton heads showing up in the gas (in and out) depending on the spell" — the deadly
 *              fog shows skulls, the nauseating gas does not
 * @typedef {{level: number, rangeFt: number, radiusFt: number, rounds: number, save: string, whole: boolean,
 *   onEnter: boolean, dmg: string|null, half: boolean, retch: boolean, breath: boolean, drift: number,
 *   upcastDie: string|null, skulls: boolean}} CloudRule
 */
/** @type {Record<string, CloudRule>} */
export const CLOUD_RULES = {
  "Stinking Cloud": {level: 3, rangeFt: 90, radiusFt: 20, rounds: 10, save: "con", whole: true, onEnter: false,
                     dmg: null, half: false, retch: true, breath: true, drift: 0, upcastDie: null, skulls: false},
  "Cloudkill":      {level: 5, rangeFt: 120, radiusFt: 20, rounds: 100, save: "con", whole: false, onEnter: true,
                     dmg: "5d8", half: true, retch: false, breath: false, drift: 10, upcastDie: "d8", skulls: true},
}

/**
 * Is a creature whose centre is `distFt` from the cloud's centre in it?
 * "Completely within" (Stinking Cloud) means its whole body is inside; "enters the area" / "starts its turn there"
 * (Cloudkill) means any of it is. `bodyFt` is half its space: 2.5 for Small or Medium, 5 for Large.
 * @param {number} distFt @param {CloudRule} rule @param {number} [bodyFt] @returns {boolean}
 */
export function inCloud(distFt, rule, bodyFt = BODY_FT) {
  return rule.whole ? distFt + bodyFt <= rule.radiusFt + 1e-6 : distFt - bodyFt <= rule.radiusFt + 1e-6
}

/**
 * Does this creature pass without rolling? Stinking Cloud only: "Creatures that don't need to breathe or are immune
 * to poison automatically succeed." Cloudkill affects them "even if they hold their breath or don't need to breathe"
 * — but a creature immune to poison damage still takes none, which damage() already applies.
 *
 * "Don't need to breathe": an explicit `noBreath` on the sheet, or an undead or construct. SRD 5.1 has no general
 * rule that undead or constructs don't breathe; this is the common table reading, Sam's to overrule.
 * @param {CloudRule} rule
 * @param {{immune?: string[], immuneCond?: string[], noBreath?: boolean, ctype?: string}} sheet
 * @returns {boolean}
 */
export function autoSucceeds(rule, sheet) {
  if (!rule.breath) return false
  const s = sheet || {}
  if ((s.immune || []).includes("poison") || (s.immuneCond || []).includes("poisoned")) return true
  return !!s.noBreath || s.ctype === "undead" || s.ctype === "construct"
}

/**
 * Cloudkill's damage expression for the slot it was cast with: 5d8, plus 1d8 for each slot level above 5th.
 * @param {CloudRule} rule @param {number} [slot] @returns {string|null}
 */
export function cloudDamage(rule, slot) {
  if (!rule.dmg) return null
  const extra = rule.upcastDie && slot ? Math.max(0, slot - rule.level) : 0
  if (!extra) return rule.dmg
  const m = /^(\d+)d(\d+)$/.exec(rule.dmg)
  return m ? `${+m[1] + extra}d${m[2]}` : rule.dmg
}

/** What a save does: the damage dealt (0 if none) and whether the action is lost. @returns {{dmg: number, retch: boolean}} */
export function saveOutcome(/** @type {CloudRule} */ rule, /** @type {boolean} */ saved, /** @type {number} */ rolled = 0) {
  if (rule.retch) return {dmg: 0, retch: !saved}
  return {dmg: saved ? (rule.half ? Math.floor(rolled / 2) : 0) : rolled, retch: false}
}

/**
 * Should this creature roll now? `event` is "start" (it starts its turn there) or "enter" (it moved in).
 * At most once per turn for Cloudkill: "for the first time on a turn or starts its turn there" — a creature that
 * starts its turn inside, steps out and back in, rolls once. `lastTurn` is the turn number it last rolled on.
 * @param {CloudRule} rule @param {"start"|"enter"} event @param {number|undefined} lastTurn @param {number} turn
 */
export function shouldRoll(rule, event, lastTurn, turn) {
  if (event === "enter" && !rule.onEnter) return false
  return lastTurn !== turn
}

/**
 * Where Cloudkill's fog is after it "moves 10 feet away from you": straight away from the caster along the line from
 * the caster through the centre. A caster standing on the very centre gives no direction; the fog keeps the one it
 * last rolled in (`last`), or stays put. Plain units in, same units out (the map passes plate px and px-per-ft).
 * @param {{x: number, y: number}} centre @param {{x: number, y: number}} caster @param {number} distance
 * @param {{x: number, y: number}|null} [last]
 * @returns {{x: number, y: number, dir: {x: number, y: number}|null}}
 */
export function driftAway(centre, caster, distance, last = null) {
  let dx = centre.x - caster.x, dy = centre.y - caster.y
  const d = Math.hypot(dx, dy)
  let dir = d > 1e-6 ? {x: dx / d, y: dy / d} : last
  if (!dir || !distance) return {x: centre.x, y: centre.y, dir: dir || null}
  return {x: centre.x + dir.x * distance, y: centre.y + dir.y * distance, dir}
}
