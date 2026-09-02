// ============================================================================
// HIDING — SRD 5.1, and the one place it is knowingly simplified.
//
// The rule, quoted rather than remembered (Using Ability Scores: Dexterity):
//
//   "When you try to hide, make a Dexterity (Stealth) check. Until you are
//    discovered or you stop hiding, that check's total is contested by the
//    Wisdom (Perception) check of any creature that actively searches for
//    signs of your presence."
//
//   "You CAN'T HIDE FROM A CREATURE THAT CAN SEE YOU CLEARLY."
//
//   "Passive Perception. When you hide, there's a chance someone will notice
//    you even if they aren't searching... the GM compares your Dexterity
//    (Stealth) check with that creature's passive Perception."
//
// Two things follow that are easy to get backwards, and both were in the
// original request:
//
//   1. It is NOT "roll against everyone who can see you". It is the reverse —
//      anyone who can see you clearly makes the attempt unavailable. You hide
//      from the ones who cannot.
//   2. The default contest is against PASSIVE Perception, not a roll. Only a
//      creature taking the Search action rolls.
//
// THE SIMPLIFICATION, STATED OUT LOUD. 5e hides you from PARTICULAR
// creatures: one Stealth total, compared separately against each observer, so
// you can be hidden from the drow and plainly visible to the priestess beside
// it. vtt_tokens.is_hidden is one boolean and cannot hold that.
//
// So the contest is flattened against the HIGHEST passive Perception in the
// room. That is the conservative direction and it is chosen deliberately: the
// failure mode is a rogue who has to hide again, rather than a rogue who is
// invisible to something looking straight at her. A wrong call that costs an
// action is recoverable at the table; one that steals a monster's turn is not.
// ============================================================================

/** What the check needs to know about the creature attempting it. */
export interface Hider {
  dexModifier: number
  proficiencyBonus: number
  /** "proficient" doubles nothing, "expertise" doubles the proficiency bonus. */
  stealth: "none" | "proficient" | "expertise"
}

/** What it needs to know about everyone else. */
export interface Onlooker {
  id: string
  label: string
  passivePerception: number
  /**
   * Can this creature see the hider CLEARLY — line of sight, no cover, not
   * blinded, not in darkness it cannot see through?
   *
   * The board answers this with hasLineOfSight, which is the machinery it
   * already uses to refuse a spell through a wall. That is a coarser notion
   * than 5e's (it knows nothing of light levels or heavy obscurement), and
   * coarser in the STRICT direction: it will say "seen" more often than the
   * table would. Malachar can overrule; the board should not be the one
   * inventing cover that is not on the map.
   */
  seesClearly: boolean
}

/** The bonus a hider adds to the d20. */
export function stealthBonus(h: Hider): number {
  const prof =
    h.stealth === "expertise" ? h.proficiencyBonus * 2
    : h.stealth === "proficient" ? h.proficiencyBonus
    : 0
  return h.dexModifier + prof
}

export type HideOutcome =
  /** Somebody has a clear view. The attempt is not available at all. */
  | { kind: "seen"; by: string[] }
  /** Nobody could have noticed — no onlookers who cannot already see you. */
  | { kind: "unopposed"; roll: number; total: number }
  /** Contested, and the result. */
  | { kind: "resolved"; roll: number; total: number; dc: number; hidden: boolean; keenest: string }

/**
 * Resolve one attempt to hide.
 *
 * `roll` is passed in rather than rolled here so the caller owns the dice —
 * the same discipline the rest of the combat route follows, and what makes
 * this testable without stubbing a random source.
 */
export function resolveHide(
  hider: Hider,
  onlookers: Onlooker[],
  roll: number,
): HideOutcome {
  // Anyone with a clear view stops this before any dice are involved. This is
  // the half of the rule most often skipped, and skipping it is what turns
  // Hide into a free invisibility button in an open room.
  const watchers = onlookers.filter((o) => o.seesClearly)
  if (watchers.length) return { kind: "seen", by: watchers.map((o) => o.label) }

  const total = roll + stealthBonus(hider)
  if (!onlookers.length) return { kind: "unopposed", roll, total }

  // The keenest eye in the room sets the bar — see the note at the top about
  // why one boolean forces this.
  const keenest = onlookers.reduce((a, b) =>
    b.passivePerception > a.passivePerception ? b : a,
  )
  return {
    kind: "resolved",
    roll,
    total,
    dc: keenest.passivePerception,
    // MEETING the passive score is not beating it. 5e contests are won by
    // exceeding; a tie goes to the observer, which is the same direction as
    // every other tie in this file.
    hidden: total > keenest.passivePerception,
    keenest: keenest.label,
  }
}

/**
 * Reasons a hidden creature stops being hidden.
 *
 * Attacking is the one the SRD names outright (Combat: Unseen Attackers and
 * Targets): "If you are hidden — both unseen and unheard — when you make an
 * attack, you give away your location when the attack hits or misses." Note
 * that it is BOTH: a miss reveals you exactly as a hit does, which players
 * consistently expect to be otherwise.
 */
export type RevealReason = "attacked" | "found" | "combat-ended"

/** Parse the sheet's own skill map, which is not consistently cased. */
export function stealthProficiency(
  sheet: Record<string, unknown> | null | undefined,
): Hider["stealth"] {
  if (!sheet) return "none"
  // Fifi's row says "stealth", Kenta's says "Stealth". Neither is wrong and
  // both are in production, so this reads either.
  for (const [k, v] of Object.entries(sheet)) {
    if (k.trim().toLowerCase() !== "stealth") continue
    const val = String(v).trim().toLowerCase()
    return val === "expertise" ? "expertise" : val === "proficient" ? "proficient" : "none"
  }
  return "none"
}

/**
 * Is the line between two squares unobstructed?
 *
 * The board has its own hasLineOfSight and the server had none, so "can this
 * creature see you clearly" had no answer on the side that decides the rule.
 * Asking the CLIENT would mean the browser asserting the fact that determines
 * whether it gets to be invisible, which is the one place not to take its
 * word for it.
 *
 * So: supercover line between the two squares, over the same walkable set the
 * route already loads for NPC movement. A square that cannot be walked is a
 * wall, and a wall between you is what makes hiding possible at all.
 *
 * Deliberately coarse. It knows nothing of light level, heavy obscurement, or
 * a creature crouched behind a crate that is not on the map — and it errs
 * toward SEEN, which is the direction that keeps a rogue honest. Malachar can
 * always rule otherwise; the board should not invent cover the map does not
 * have.
 */
export function lineIsClear(
  from: { x: number; y: number },
  to: { x: number; y: number },
  walkable: ReadonlySet<string>,
): boolean {
  const dx = Math.abs(to.x - from.x)
  const dy = Math.abs(to.y - from.y)
  const sx = from.x < to.x ? 1 : -1
  const sy = from.y < to.y ? 1 : -1
  let x = from.x
  let y = from.y
  let err = dx - dy
  // Bounded: a malformed pair of coordinates must not spin the request.
  for (let guard = 0; guard < 512; guard++) {
    if (x === to.x && y === to.y) return true
    const e2 = 2 * err
    if (e2 > -dy) { err -= dy; x += sx }
    if (e2 < dx) { err += dx; y += sy }
    // The endpoints themselves are creatures, not cover.
    if ((x === to.x && y === to.y) || (x === from.x && y === from.y)) continue
    if (!walkable.has(`${x},${y}`)) return false
  }
  return false
}
