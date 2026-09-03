// ============================================================================
// WARDS — the spells that protect somebody, and what makes them stop.
//
// Sam: "I just casted sanctuary on myself and nothing happened... This spell
// should follow DND 5E rules, have a unique animation, create a condition that
// the NPCs and monsters respect until violated. It is a bonus action so I
// should be able to cast it." And: "Shield of faith did that too."
//
// Both had been crashing outright (#385). With that fixed they resolve, cost
// their bonus action and spend their slot — and still do nothing, because
// this codebase had nowhere to put a lasting protection. Conditions are a
// bare string[]: no duration, no source, no rule. This is the missing shape.
//
// IT FOLLOWS THE SUMMON PRECEDENT deliberately. Mage Hand already solved
// "a spell that persists on a token until a round number" with a jsonb blob on
// vtt_tokens and an expiry swept when the round turns. A ward is the same
// problem, so it gets the same answer rather than a second mechanism that
// expires by different arithmetic.
//
// ── SANCTUARY, SRD 5.1 ──────────────────────────────────────────────────────
//
//   "Until the spell ends, any creature who targets the warded creature with
//    an attack or a harmful spell must first make a Wisdom saving throw. On a
//    failed save, the creature must choose a new target or lose the attack or
//    spell. This spell doesn't protect the warded creature from area effects,
//    such as the explosion of a fireball.
//
//    If the warded creature makes an attack, casts a spell that affects an
//    enemy, or deals damage to another creature, this spell ends."
//
// Three things there are easy to get wrong and all three are load-bearing:
//
//   1. IT IS NOT INVISIBILITY AND NOT A SHIELD. The attacker rolls; on a
//      SUCCESS the attack proceeds completely normally. Sanctuary that always
//      works is a first-level spell that removes a creature from the fight.
//   2. AREA EFFECTS IGNORE IT. A Fireball centred on the square hurts a warded
//      creature exactly as much as anyone else — which is the counterplay, and
//      why the spell is fair.
//   3. THE WARD BREAKS ON THE WARDED CREATURE'S OWN AGGRESSION, not on being
//      hit. You may drink a potion, run, heal a friend, open a door. The
//      moment you attack, you are on your own.
//
// ── SHIELD OF FAITH, SRD 5.1 ────────────────────────────────────────────────
//
//   "A shimmering field appears and surrounds a creature of your choice within
//    range, granting it a +2 bonus to AC for the duration."
//
// Concentration, up to 10 minutes. Simple, and its only subtlety is that it
// must reach the number the ATTACK ROLL is compared against, or it is
// decoration.
// ============================================================================

/** The spells that can ward. Adding one means adding its rule below. */
export type WardSpell = "sanctuary" | "shield of faith"

export interface WardInfo {
  spell: WardSpell
  /** The token that cast it — for concentration, and for the log. */
  caster_token: string
  cast_round: number
  /** Gone when the round reaches this number. */
  expires_round: number
}

/**
 * A minute is ten rounds; Shield of Faith runs ten minutes.
 *
 * The cap on Shield of Faith is not the SRD's number — it is concentration
 * that really ends it, and no fight in this campaign has ever run a hundred
 * rounds. A number that large exists only to be wrong later, so it is written
 * as what it is: longer than any fight.
 */
export const SANCTUARY_ROUNDS = 10
export const SHIELD_OF_FAITH_ROUNDS = 100

/** Shield of Faith's contribution to the number an attack must beat. */
export const SHIELD_OF_FAITH_AC = 2

export function wardRounds(spell: WardSpell): number {
  return spell === "sanctuary" ? SANCTUARY_ROUNDS : SHIELD_OF_FAITH_ROUNDS
}

/** Is this ability one of the warding spells? */
export function wardSpellFor(ability: string | null | undefined): WardSpell | null {
  const a = (ability ?? "").trim().toLowerCase()
  return a === "sanctuary" || a === "shield of faith" ? a : null
}

/** Read whatever jsonb holds, or null. Never throws on a malformed row. */
export function normaliseWard(raw: unknown): WardInfo | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Partial<WardInfo>
  const spell = wardSpellFor(r.spell)
  if (!spell || typeof r.caster_token !== "string") return null
  const cast = Number(r.cast_round)
  const exp = Number(r.expires_round)
  if (!Number.isFinite(cast) || !Number.isFinite(exp)) return null
  return { spell, caster_token: r.caster_token, cast_round: cast, expires_round: exp }
}

/** Has this ward run its duration by the round we are entering? */
export function wardExpired(w: WardInfo, round: number): boolean {
  return round >= w.expires_round
}

/** The condition word the sheet and the board show. */
export function wardCondition(spell: WardSpell): string {
  return spell === "sanctuary" ? "Sanctuary" : "Shield of Faith"
}

/**
 * The AC a ward adds to its bearer.
 *
 * Sanctuary adds nothing — it is not a shield, and giving it armour would be
 * inventing a second, better spell.
 */
export function wardAcBonus(w: WardInfo | null): number {
  return w?.spell === "shield of faith" ? SHIELD_OF_FAITH_AC : 0
}

/**
 * Does attacking this creature require a Wisdom save first?
 *
 * `area` is the SRD's own exception and the reason the spell is fair: a blast
 * that lands on a square is not "targeting" anybody, so it is unaffected.
 */
export function needsSanctuarySave(w: WardInfo | null, opts?: { area?: boolean; helpful?: boolean }): boolean {
  if (w?.spell !== "sanctuary") return false
  if (opts?.area) return false
  // Healing somebody under Sanctuary is not an attack on them. The SRD gates
  // "an attack or a harmful spell"; a helpful one passes through.
  if (opts?.helpful) return false
  return true
}

export interface SanctuaryCheck {
  /** The attacker's d20 + WIS modifier. */
  total: number
  dc: number
  /** True when the attacker may proceed. */
  passed: boolean
}

/**
 * Resolve one attacker's Wisdom save against Sanctuary.
 *
 * The roll is passed in, as everywhere else in this codebase, so the caller
 * owns the dice and this stays testable on every face.
 *
 * A tie GOES TO THE ATTACKER: the SRD says a save succeeds when the total
 * "equals or exceeds" the DC, and Sanctuary is not an exception to that.
 */
export function resolveSanctuary(opts: { roll: number; wisModifier: number; dc: number }): SanctuaryCheck {
  const total = opts.roll + opts.wisModifier
  return { total, dc: opts.dc, passed: total >= opts.dc }
}

/**
 * Does this act break the warded creature's own Sanctuary?
 *
 * SRD: "if the warded creature makes an attack, casts a spell that affects an
 * enemy, or deals damage to another creature". So the test is AGGRESSION, not
 * activity — and getting that wrong in either direction ruins the spell.
 * Ending it on any cast would forbid healing your friends from behind it;
 * never ending it would make a first-level spell into permanent immunity while
 * you shoot people.
 */
export function breaksSanctuary(act: {
  /** A weapon attack, always aggressive. */
  weapon?: boolean
  /** A spell that harms — the opposite of the spellbook's `helpful`. */
  harmful?: boolean
  /** Hit points actually removed from somebody else. */
  damagedSomeone?: boolean
}): boolean {
  return Boolean(act.weapon || act.harmful || act.damagedSomeone)
}
