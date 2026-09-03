// ============================================================================
// THE SPELL BANNER — what the table reads when something is cast.
//
// Sam: "When a spell is shot it should briefly pop up in the center in highly
// stylized and large letters with the fail or succeed showing up on the bottom
// of the letters. 'Bard Casts Fireball! Drow hit with 6 fire damage... Drow
// guard hit with 4 damage and is burned to death.'"
//
// EVERY FACT THIS NEEDS IS ALREADY ON THE WIRE. The cast response has carried
// outcome, roll, total, dc, margin, crit, fumble, saved, damageType and the
// per-victim amounts for weeks; the combat log has been printing them in
// prose the whole time — "Kenta casts Ray of Frost at Drow Elite Warrior —
// 20+5 = 25 vs AC 18: CRITICAL for 12." Nobody looks at a log during a fight.
// This is that same sentence, put where the eye already is.
//
// So this module invents nothing and rolls nothing. It is a formatter, and it
// lives apart from React so the wording can be tested without a canvas.
//
// TWO DELIBERATE CHOICES
//
// 1. THE CLASS, NOT THE NAME, in the headline — "BARD CASTS FIREBALL", as Sam
//    wrote it. That is the same voice the Gauntlet announcer uses for whose
//    turn it is (lib/announcer), and the table has already learned to hear
//    itself named that way. A creature with no class falls back to its name,
//    because "CASTS FIREBALL" alone names nobody.
//
// 2. ONE DEATH VOCABULARY. "burned to death" is not written here. The board
//    already owns a table of how a body ends by damage type — DEATH_LABEL in
//    lib/damage-type, which the corpse itself is dressed by — so fire gives
//    "burns", cold "freezes solid", necrotic "withers to bone". Writing a
//    second list would let the banner say a creature burned while the model
//    on the floor froze.
// ============================================================================

import { deathKindFor, DEATH_LABEL } from "./damage-type"

/** The verdict words the server sends, from verdictWord in the combat route. */
export type CastOutcome =
  | "heal" | "crit" | "fumble" | "saved-half" | "saved" | "failed-save" | "hit" | "miss"

/** One creature the spell reached, as the wire describes it. */
export interface BannerVictim {
  label: string
  /** Hit points moved. Zero on a miss or a clean save. */
  amount: number
  outcome: CastOutcome | string
  /** True when this hit put them on the floor. */
  fell?: boolean
  heals?: boolean
  /**
   * Is this a player character?
   *
   * It changes what falling MEANS, and the board already draws the
   * distinction: a monster at 0 is dead and is dressed by whatever killed it,
   * while a player is unconscious and rolling death saves, and gets the
   * "collapse" treatment that keeps their colour. A downed friend must not be
   * dressed as a corpse — and must not be described as one either. Without
   * this a Bard put on the floor by a spear reads "is run through", which is
   * both wrong and a rather bleak thing to put on screen about someone who
   * has three death saves left.
   */
  isPlayer?: boolean
}

export interface BannerModel {
  /** The big line. Already upper-cased for display. */
  headline: string
  /** One per creature, in the order the server resolved them. */
  lines: BannerLine[]
}

export interface BannerLine {
  text: string
  /**
   * How this line should read at a glance, before anybody parses a word:
   * a kill is not a graze and a save is not a miss.
   */
  tone: "kill" | "hit" | "crit" | "save" | "miss" | "heal"
}

/**
 * The headline: who cast what.
 *
 * `casterClass` is preferred and `casterLabel` is the fallback, never the
 * other way round — see the note at the top about the announcer's voice.
 */
export function headlineFor(opts: {
  casterClass?: string | null
  casterLabel?: string | null
  ability: string
  /** A weapon swing is a STRIKE, not a cast. The rack sends both here. */
  weapon?: boolean
}): string {
  // TRIM BEFORE CHOOSING, not after. A class of "  " is truthy, so trimming
  // afterwards let a whitespace-only class beat a perfectly good name and
  // produce "CASTS JAVELIN!" — a headline that names nobody. Caught by the
  // test, which is why it asks about "  " and not just null.
  const who = [opts.casterClass, opts.casterLabel, "Someone"]
    .map((s) => (s ?? "").trim())
    .find((s) => s.length > 0) as string
  const verb = opts.weapon ? "STRIKES WITH" : "CASTS"
  return `${who} ${verb} ${opts.ability}!`.toUpperCase()
}

/**
 * One creature's fate, in a phrase.
 *
 * Reads the outcome first and the numbers second, because the outcome is the
 * only field that can tell a 0 that was a miss from a 0 that was a save — and
 * at a table those are opposite feelings.
 */
export function lineFor(v: BannerVictim, damageType?: string | null): BannerLine {
  const name = v.label || "Something"
  const type = (damageType ?? "").trim().toLowerCase()
  // "6 fire" reads better than "6 fire damage" at this size, and the word
  // "damage" is the one word on the line carrying no information.
  const hurt = type && type !== "physical" ? `${v.amount} ${type}` : `${v.amount}`

  if (v.heals || v.outcome === "heal") {
    return { text: `${name} healed ${v.amount}`, tone: "heal" }
  }
  if (v.outcome === "miss" || v.outcome === "fumble") {
    return { text: `${name} — ${v.outcome === "fumble" ? "FUMBLE" : "miss"}`, tone: "miss" }
  }
  // A clean save took nothing; a half save still hurt, and saying only
  // "saved" about a creature that lost 12 hit points is a lie the table can
  // see on the health bar.
  if (v.outcome === "saved" || (v.outcome === "saved-half" && v.amount <= 0)) {
    return { text: `${name} — saved`, tone: "save" }
  }

  // A player goes DOWN; a monster dies of whatever hit it. Same table, and
  // the same "collapse" entry the board's own death treatment uses.
  const fate = v.fell
    ? `, ${DEATH_LABEL[v.isPlayer ? "collapse" : deathKindFor(type || null)]}`
    : ""
  const tone: BannerLine["tone"] = v.fell ? "kill" : v.outcome === "crit" ? "crit" : "hit"
  const lead =
    v.outcome === "crit" ? "CRIT" :
    v.outcome === "saved-half" ? "saved, still" :
    "hit for"
  return { text: `${name} — ${lead} ${hurt}${fate}`, tone }
}

/** The whole banner for one cast. */
export function bannerFor(opts: {
  casterClass?: string | null
  casterLabel?: string | null
  ability: string
  weapon?: boolean
  damageType?: string | null
  victims: BannerVictim[]
}): BannerModel {
  return {
    headline: headlineFor(opts),
    lines: opts.victims.map((v) => lineFor(v, opts.damageType)),
  }
}

/**
 * How long a banner stays up, in seconds.
 *
 * Long enough to read, short enough that it is gone before the next turn —
 * Sam asked for "briefly", and a banner still on screen when the drow swings
 * back is worse than no banner. It grows a little with the number of lines,
 * because a Fireball that caught five creatures is five things to read.
 */
export function lifeFor(lines: number): number {
  return Math.min(4.2, 1.9 + Math.max(0, lines - 1) * 0.35)
}
