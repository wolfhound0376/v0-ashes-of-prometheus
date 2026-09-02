// ============================================================================
// THE ANNOUNCER — the cabinet voice that calls the table's attention.
//
// Gauntlet did not tell you a turn had changed with a chime. It told you WHO,
// by class, in a voice you could hear over a noisy arcade: "RED WARRIOR NEEDS
// FOOD BADLY." The class is the point — it is what a player identifies as,
// and it is short enough to survive a small speaker.
//
// This module is the naming rule and nothing else. No Supabase, no audio, no
// React: a class in, a bucket key out. It sits in lib/ rather than inside the
// combat route because the route is not the only thing that will ever want to
// announce something, and the moment a second caller reconstructs these names
// by hand they will drift apart.
//
// The clips live in the same bucket as every other sound, under ui/.
// ============================================================================

/**
 * The classes with a recorded line.
 *
 * FOUR, because four is what the party is: Bard, Rogue, Sorcerer, Cleric.
 * A fifth class joining the table needs a recording before it can be
 * announced, and `announcementFor` returning null is how it says so — rather
 * than inventing a key for a file nobody has made, which would fail silently
 * as a sound that never plays.
 */
const VOICED = new Set(["bard", "rogue", "sorcerer", "cleric"])

/** What the announcer can say. */
export type Announcement = "turn" | "dying"

/**
 * The bucket key for a line, or null when there is nothing recorded.
 *
 * Null is a real answer and callers must treat it as one: an NPC's turn, a
 * class with no clip, a creature with no class at all. The caller falls back
 * to the plain cue rather than going silent — the table still needs to know
 * the turn moved.
 */
export function announcementFor(
  kind: Announcement,
  characterClass: string | null | undefined,
): string | null {
  const c = (characterClass ?? "").trim().toLowerCase()
  if (!VOICED.has(c)) return null
  return `ui/${kind === "turn" ? "turn" : "die"}_${c}`
}

/**
 * The fraction of maximum hit points at or below which the announcer warns
 * that somebody is about to die.
 *
 * A tenth, per Sam. Low enough that it means something — a warning that fires
 * at half health is a warning players learn to ignore — and high enough to
 * still be actionable, which a warning at 0 would not be. At 0 they are down
 * and the board says so with a body on the floor; this is the beat BEFORE.
 */
export const DYING_FRACTION = 0.1

/**
 * Did this hit push them across the line, on this hit?
 *
 * Deliberately an EDGE, not a level. Asking "are they below a tenth" would
 * announce it again on every subsequent scratch while they stayed there —
 * four times in a round, in a voice that fills the room. Asking "did they
 * just cross" announces it once, on the hit that did it.
 *
 * Healing back above the line re-arms it, which is correct: being dragged to
 * the brink twice is two different frights.
 */
export function justBecameDying(before: number, after: number, max: number): boolean {
  if (!max || max <= 0) return false
  // Already down is not dying — it is dead, or unconscious and the board has
  // its own language for that. The warning is for the living.
  if (after <= 0) return false
  const line = max * DYING_FRACTION
  return before > line && after <= line
}
