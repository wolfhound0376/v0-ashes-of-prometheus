// ============================================================================
// SPELL EFFECTS — what a spell DOES, as data rather than as a branch.
//
// Sam: "sleep spell doesn't work. I don't want to do all the spells
// individually like that. There should be a way to take care of all the spells
// in mass."
//
// He is describing the actual problem. The spellbook can say a spell's level,
// range, shape, dice and saving throw — everything about how it is AIMED and
// ROLLED — and nothing at all about what happens afterwards. So every spell
// that does something other than move hit points had to be hand-built in the
// route: Mage Hand was a branch, Sanctuary and Shield of Faith were a branch.
// Everything else silently did nothing.
//
// EIGHT OF THE PARTY'S SEVENTEEN SPELLS are in that state right now: Sleep,
// Faerie Fire, Dissonant Whispers, Guidance, Thaumaturgy, Minor Illusion,
// Disguise Self and Fog Cloud. Nearly half the spellbook is decoration.
//
// This is the missing half of the description. A small vocabulary of effects,
// attached to spells as DATA, applied by one generic handler — so adding a
// spell is a row in a table rather than a branch in a 2,000-line route.
//
// THE RULE THAT MAKES IT "IN MASS", and it is the important one:
//
//   A SPELL WITH NO EFFECTS AND NO DICE IS NEVER SILENT AGAIN.
//
// It falls through to `dm` — the spell name and its SRD text handed to
// Malachar, who rules it and narrates. That is what turns "I have to implement
// every spell" into "I implement the mechanical ones and the DM covers the
// tail", which is exactly how a real table works and is why this campaign has
// a DM at all. A spell that does nothing is a bug; a spell the engine cannot
// mechanise is a ruling.
//
// EVERYTHING HERE IS PURE. The route applies these; this file only says what
// they are, so the arithmetic can be tested without a database.
// ============================================================================

export type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA"

/**
 * A condition laid on a creature for a while.
 *
 * The workhorse. Most spells that "do nothing" today are this: Faerie Fire,
 * Hold Person, Bane, Bless, Slow. One shape covers all of them.
 */
export interface ConditionEffect {
  kind: "condition"
  /** The word, in the vocabulary lib/conditions already displays. */
  condition: string
  /** Rounds. Ten to the minute; concentration usually ends it sooner. */
  rounds: number
  /** A save to avoid it landing at all. Omitted means it just lands. */
  save?: Ability
  /** The target may repeat the save at the end of each of its turns. */
  saveEnds?: boolean
  /** Any damage ends it — Sleep, and most charms. */
  endsOnDamage?: boolean
}

/**
 * A pool of hit points, spent on the weakest creatures first.
 *
 * Sleep's mechanic, and Color Spray's. It is unusual enough to need its own
 * kind and common enough to deserve one — and it is the reason Sleep could
 * never be expressed as "damage" or as a plain "condition": it affects a
 * NUMBER OF CREATURES decided by their hit points, not by a saving throw.
 */
export interface HpPoolEffect {
  kind: "hpPool"
  /** The pool, e.g. "5d8" for Sleep. */
  dice: string
  condition: string
  endsOnDamage: boolean
  /**
   * Creature types this cannot touch. SRD Sleep: "Undead and creatures immune
   * to being charmed aren't affected by this spell."
   */
  immuneTypes?: string[]
}

/** A bonus to somebody's rolls for a while — Guidance, Bless. */
export interface BuffEffect {
  kind: "buff"
  /** The die added, e.g. "1d4". */
  dice: string
  /** What it applies to, for the log and for Malachar. */
  applies: string
  rounds: number
}

/**
 * Hand it to the Dungeon Master.
 *
 * Not a failure state. Illusions, disguises, obscurement and every spell whose
 * effect is a conversation belong here, and a table with a DM handles them
 * better than any rules engine — the point is that the player gets a RULING
 * rather than silence.
 */
export interface DmEffect {
  kind: "dm"
  /** What the spell does, so Malachar rules from the book and not from vibes. */
  text: string
}

export type SpellEffect = ConditionEffect | HpPoolEffect | BuffEffect | DmEffect

/**
 * What each spell does, beyond its dice.
 *
 * Keyed by the same normalised name the spellbook uses. Only spells whose
 * effect is NOT already covered by dice/resolve need a row — Guiding Bolt and
 * Healing Word are complete without one.
 */
export const SPELL_EFFECTS: Record<string, SpellEffect[]> = {
  // SRD: "Each creature in a 20-foot radius ... falls unconscious ... Starting
  // with the creature that has the lowest current hit points". Roll 5d8; the
  // total is how many hit points of creatures this can take.
  sleep: [{
    kind: "hpPool", dice: "5d8", condition: "Unconscious", endsOnDamage: true,
    immuneTypes: ["undead", "construct"],
  }],

  // SRD: outlined in light, "Any attack roll against an affected creature or
  // object has advantage if the attacker can see it, and the affected creature
  // or object can't benefit from being invisible."
  "faerie fire": [{
    kind: "condition", condition: "Faerie Fire", rounds: 10, save: "DEX",
  }],

  // The 3d6 psychic is dice the spellbook already carries. What it could not
  // say is the flight: "it must immediately use its reaction, if available, to
  // move as far as its speed allows away from you."
  "dissonant whispers": [{
    kind: "dm",
    text: "On a failed WIS save the target must immediately use its reaction, if available, to move as far as its speed allows away from the caster. On a success it takes half damage and does not flee.",
  }],

  guidance: [{ kind: "buff", dice: "1d4", applies: "one ability check of its choice", rounds: 10 }],

  // Conversations, not calculations. Handed over with the book in hand.
  thaumaturgy: [{
    kind: "dm",
    text: "A minor wonder within 30 ft for up to 1 minute: the caster's voice booms three times as loud, flames flicker/change colour/brighten/dim, harmless tremors, an unnerving sound, a door or window flies open or slams, or the caster's eyes turn a black void.",
  }],
  "minor illusion": [{
    kind: "dm",
    text: "A sound OR an image of an object no larger than a 5-foot cube, within 30 ft, for 1 minute. A creature that uses its action to Investigate (INT vs the caster's spell save DC) discerns the illusion. The image cannot create sound, light, smell or any other sensory effect.",
  }],
  "disguise self": [{
    kind: "condition", condition: "Disguised", rounds: 100,
  }, {
    kind: "dm",
    text: "The caster's appearance, including clothing and equipment, changes for 1 hour. Height may change by up to a foot and build may change, but body shape stays. A creature that uses its action to inspect makes an INT (Investigation) check against the caster's spell save DC.",
  }],
  "fog cloud": [{
    kind: "dm",
    text: "A 20-foot-radius sphere of fog spreads round corners and lasts for the duration (concentration, up to 1 hour). Its area is HEAVILY OBSCURED: a creature in it is effectively blinded for the purpose of seeing anything within or through it. A wind of moderate speed or greater disperses it.",
  }],
}

/** The effects for a spell, or an empty list. */
export function effectsFor(spell: string | null | undefined): SpellEffect[] {
  return SPELL_EFFECTS[(spell ?? "").trim().toLowerCase()] ?? []
}

/**
 * Should this cast be handed to the DM?
 *
 * The rule that makes the whole thing work. A spell that rolls nothing, heals
 * nothing, summons nothing, wards nobody and has no declared effect used to
 * narrate "X casts Y." and stop. Now it reaches Malachar, who rules it.
 *
 * `handled` is what the route already did with it — so a spell that DID
 * something is never second-guessed by the DM.
 */
export function needsRuling(opts: {
  effects: SpellEffect[]
  handled: boolean
}): boolean {
  if (opts.handled) return false
  return !opts.effects.some((e) => e.kind !== "dm")
}

/**
 * Sleep, and anything else that spends a pool of hit points.
 *
 * SRD 5.1: "Starting with the creature that has the lowest current hit points,
 * each creature affected by this spell falls unconscious until the spell ends
 * ... Subtract each creature's hit points from the total before moving on to
 * the creature with the next lowest hit points. A creature's hit points must
 * be equal to or less than the remaining total for that creature to be
 * affected."
 *
 * Three things people get wrong, all of them tested:
 *   - ASCENDING hit points, so the pool takes the many weak rather than the
 *     one strong. That ordering IS the spell.
 *   - A creature is skipped, NOT partially affected, when it does not fit —
 *     and the pool keeps going to see whether a smaller one further down
 *     does. (The SRD says "before moving on"; it does not stop.)
 *   - The already-unconscious are not candidates, and neither is anything
 *     immune. Spending the pool on a corpse is how Sleep does nothing.
 */
export function spendHpPool(opts: {
  pool: number
  candidates: { id: string; label: string; hp: number | null; creatureType?: string | null }[]
  immuneTypes?: string[]
}): { affected: { id: string; label: string; hp: number }[]; remaining: number } {
  const immune = (opts.immuneTypes ?? []).map((t) => t.toLowerCase())
  const eligible = opts.candidates
    .filter((c) => typeof c.hp === "number" && c.hp > 0)
    .filter((c) => !immune.some((t) => (c.creatureType ?? "").toLowerCase().includes(t)))
    .map((c) => ({ id: c.id, label: c.label, hp: c.hp as number }))
    .sort((a, b) => a.hp - b.hp)

  const affected: { id: string; label: string; hp: number }[] = []
  let remaining = opts.pool
  for (const c of eligible) {
    if (c.hp > remaining) continue   // skip, do not stop — a smaller one may follow
    affected.push(c)
    remaining -= c.hp
  }
  return { affected, remaining }
}
