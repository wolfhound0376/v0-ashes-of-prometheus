// Rage and Wounded Fury — the rules, pure, in one copy.
//
// WHY THIS FILE IS PLAIN JAVASCRIPT. The painted map (scripts/velkynvelve-walk/template.html) is a
// standalone page built by a Python script on Sam's machine, where there is no Node and so no
// TypeScript compiler. build_walk.py pastes this file into the page verbatim at its RAGE placeholder
// (minus the `export` keywords), so the map and the tests read the SAME functions. A TypeScript copy here
// and a hand-typed copy in the page is how a condition ends up written but never read.
// tsconfig has allowJs, so the JSDoc below types the exports for lib/rage.test.ts.
//
// THE SOURCES, both ingested in campaign_chunks (SRD 5.1 is canon-as-ingested; SRD 5.2.1 is canon
// but NOT ingested, so nothing here quotes it):
//
//   SRD 5.1, Classes: Barbarian — Rage.
//     "On your turn, you can enter a rage as a bonus action. While raging, you gain the following
//      benefits if you aren't wearing heavy armor:
//       - You have advantage on Strength checks and Strength saving throws.
//       - When you make a melee weapon attack using Strength, you gain a bonus to the damage roll
//         that increases as you gain levels as a barbarian, as shown in the Rage Damage column.
//       - You have resistance to bludgeoning, piercing, and slashing damage.
//      If you are able to cast spells, you can't cast them or concentrate on them while raging.
//      Your rage lasts for 1 minute. It ends early if you are knocked unconscious or if your turn
//      ends and you haven't attacked a hostile creature since your last turn or taken damage since
//      then. You can also end your rage on your turn as a bonus action.
//      Once you have raged the number of times shown for your barbarian level in the Rages column,
//      you must finish a long rest before you can rage again."
//     The Barbarian table: Rages 2 (1st), 3 (3rd), 4 (6th), 5 (12th), 6 (17th), Unlimited (20th).
//     Rage Damage +2 (1st), +3 (9th), +4 (16th).
//
//   SRD 5.1 / the bestiary row, Quaggoth — Wounded Fury.
//     "While it has 10 hit points or fewer, the quaggoth has advantage on attack rolls. In addition,
//      it deals an extra 7 (2d6) damage to any target it hits with a melee attack."
//     Not a choice: it is on whenever the hit points say so, and off the moment they do not.
//
// KNOWN DIFFERENCE FROM SRD 5.2.1 (from memory, not quoted): 5.2.1's Rage lasts until the end of
// your next turn unless extended by attacking, taking damage or a bonus action, gives advantage on
// Strength checks/saves and the same damage bonus, and the uses table differs. The 5.1 wording is
// what is implemented because it is what is ingested. Flag, not homebrew.

/** One minute of combat, in rounds (SRD: a round is 6 seconds). */
export const RAGE_ROUNDS = 10

/** The three damage types a raging barbarian resists. */
export const RAGE_RESISTS = ["bludgeoning", "piercing", "slashing"]

/** Wounded Fury's extra melee damage, as written. */
export const WOUNDED_FURY_DIE = "2d6"

/**
 * The red a raging or furious body wears. It is the fury red Sam approved on the BERSERK /
 * WOUNDED FURY pop, the burst and the embers (PR #773, 2026-10-15) — not a new colour.
 */
export const RAGE_TINT = "#ff4a2a"

/** @param {unknown} cls */
export function isBarbarian(cls) { return /barbarian/i.test(String(cls || "")) }

/**
 * The Rage Damage column of the Barbarian table.
 * @param {number} level
 */
export function rageDamageBonus(level) {
  const l = Math.max(1, Math.floor(Number(level) || 1))
  return l >= 16 ? 4 : l >= 9 ? 3 : 2
}

/**
 * The Rages column of the Barbarian table: how many times per long rest. Infinity at 20th.
 * @param {number} level
 */
export function ragesPerLongRest(level) {
  const l = Math.max(1, Math.floor(Number(level) || 1))
  return l >= 20 ? Infinity : l >= 17 ? 6 : l >= 12 ? 5 : l >= 6 ? 4 : l >= 3 ? 3 : 2
}

/**
 * Is this attack line "a melee weapon attack using Strength"? A ranged weapon (ammunition, a long
 * range) is not melee; a thrown weapon that leaves the hand is a ranged attack; a finesse weapon
 * swung with Dexterity is not Strength. The map's attack lines carry `str` (true when the modifier
 * used was Strength) once they come from a catalogue weapon; a bare line with no flag — the sheet's
 * own Unarmed Strike — is a Strength melee attack by the rules.
 * @param {{reach?: number, long?: number, str?: boolean, ammo?: boolean, flask?: boolean} | null | undefined} atk
 * @param {boolean} [thrown] true when this swing is the weapon leaving the hand
 */
export function isStrengthMelee(atk, thrown) {
  if (!atk || thrown || atk.flask || atk.ammo || atk.long) return false
  if ((atk.reach || 5) > 10) return false
  return atk.str !== false
}

/**
 * May this hero enter a rage right now? `{ok, why}` — `why` is the menu's own words when not.
 * @param {{cls?: string, level?: number, bonus?: boolean, raging?: unknown, used?: number, heavyArmor?: boolean}} st
 */
export function canRage(st) {
  if (!isBarbarian(st.cls)) return { ok: false, why: "not a barbarian" }
  if (st.raging) return { ok: false, why: "already raging" }
  if (!st.bonus) return { ok: false, why: "bonus action used" }
  const max = ragesPerLongRest(st.level || 1), used = st.used || 0
  if (used >= max) return { ok: false, why: "no rage left until a long rest" }
  if (st.heavyArmor) return { ok: false, why: "not in heavy armor" }
  return { ok: true, why: "" }
}

/**
 * The state a rage starts in. `since` is the round it began; the two flags are what the SRD's
 * end-of-turn test reads ("attacked a hostile creature since your last turn or taken damage since then").
 * @param {number} round
 */
export function beginRage(round) { return { since: Number(round) || 0, attacked: false, hurt: false } }

/**
 * The SRD's end-of-turn test, run when the raging barbarian's own turn ends.
 * Returns the rage to carry forward (flags reset for the next turn), or null with the reason it ended.
 * @param {{since: number, attacked: boolean, hurt: boolean} | null | undefined} rage
 * @param {number} round the round whose turn just ended
 * @returns {{rage: {since: number, attacked: boolean, hurt: boolean} | null, ended: string | null}}
 */
export function rageAfterTurn(rage, round) {
  if (!rage) return { rage: null, ended: null }
  if (!rage.attacked && !rage.hurt) return { rage: null, ended: "a turn passed with no attack made and no damage taken" }
  if ((Number(round) || 0) - rage.since >= RAGE_ROUNDS) return { rage: null, ended: "a minute has passed" }
  return { rage: { since: rage.since, attacked: false, hurt: false }, ended: null }
}

/**
 * Advantage on Strength checks and Strength saving throws while raging: +1 for the map's d20(adv), else 0.
 * @param {unknown} raging truthy while raging
 * @param {string} ability "str", "dex", ...
 */
export function rageAdvantage(raging, ability) { return raging && String(ability).toLowerCase() === "str" ? 1 : 0 }

/**
 * Resistance to bludgeoning, piercing and slashing while raging.
 * @param {unknown} raging
 * @param {string} type
 */
export function rageResists(raging, type) { return !!raging && RAGE_RESISTS.includes(String(type || "").toLowerCase()) }

/**
 * Wounded Fury's own test: "while it has 10 hit points or fewer". A body at 0 is down, not furious.
 * @param {number} hp
 * @param {number | null | undefined} threshold the trait's number (10 for a quaggoth); nothing without the trait
 */
export function woundedFury(hp, threshold) {
  if (!threshold) return false
  return hp > 0 && hp <= threshold
}

/**
 * What one attacker adds to one melee/ranged attack right now, read in one place by the resolver.
 *   adv:   +1 when Wounded Fury is on (advantage on attack rolls); rage gives none
 *   dice:  extra damage dice with their label (Wounded Fury's 2d6, melee hits only)
 *   flat:  flat extra damage with its label (Rage Damage, Strength melee only)
 * @param {{hp: number, woundedFury?: number | null, raging?: unknown, level?: number}} att
 * @param {{reach?: number, long?: number, str?: boolean, ammo?: boolean, flask?: boolean} | null | undefined} atk
 * @param {boolean} [thrown]
 */
export function attackRiders(att, atk, thrown) {
  const melee = !!atk && !thrown && !atk.flask && !atk.ammo && !atk.long && (atk.reach || 5) <= 10
  const fury = woundedFury(att.hp, att.woundedFury)
  /** @type {{label: string, dice: string}[]} */ const dice = []
  /** @type {{label: string, amount: number}[]} */ const flat = []
  if (fury && melee) dice.push({ label: "wounded fury", dice: WOUNDED_FURY_DIE })
  if (att.raging && isStrengthMelee(atk, thrown)) flat.push({ label: "rage", amount: rageDamageBonus(att.level || 1) })
  return { adv: fury ? 1 : 0, dice, flat }
}

/**
 * The colour a body is drawn through while raging or in Wounded Fury, or null for none.
 * @param {{hp: number, woundedFury?: number | null, raging?: unknown}} a
 */
export function tintFor(a) { return a.raging || woundedFury(a.hp, a.woundedFury) ? RAGE_TINT : null }
