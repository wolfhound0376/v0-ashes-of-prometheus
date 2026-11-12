// lib/travel/meeting.ts — who sees whom first when the dice put something on the road.
//
// Sam, 2026-11-12: "at each node there should be a passive roll to determine if an encounter occurs per our
// rules. It should be like Solasta 2 but better." Then "go" to this rule:
//
//   WHETHER something is out there stays the book's: the encounter check, once per day's march
//   (lib/travel/arrival.ts — rolling it at every marker would be about six times the published rate).
//   HOW the party meets it is the passive roll's. The roll already runs at every marker (lib/travel/notice.ts):
//   the sharpest passive Perception on the march, pace applied, against the marker's DC (Sam's default 12).
//   When the day's dice name creatures at this marker:
//     noticed -> the party sees them first. Nobody is surprised; how to meet them is the party's choice.
//     missed  -> they see the party first. If it comes to a fight, the party is surprised.
//
// "Surprised" is SRD 5.2.1 (this campaign's canon, AGENTS.md §7): Disadvantage on the Initiative roll. Under
// SRD 5.1 it would be losing the first turn; the two differ, and 5.2.1 is the one that applies here.
//
// Only creatures are met. A terrain result has no eyes of its own and keeps the book's own text. On the water
// the passive roll does not run (lib/travel/notice.ts is skipped for a sail), so there is no verdict there.
//
// Pure: the notice result and the dice already rolled in, a verdict out. Nothing here rolls or invents.

import type { RolledStep } from "./arrival"
import type { NoticeResult } from "./notice"

export const MEETING_SOURCE =
  "Passive Perception against the marker's DC (lib/travel/notice.ts; Sam, 2026-10-14) decides who notices whom; surprise per SRD 5.2.1 (Disadvantage on Initiative). Ruling: Sam, 2026-11-12."

/** The published tables whose results are creatures (encounter_tables.table_key). */
export const CREATURE_TABLES: readonly string[] = ["underdark_creature", "underdark_ambush", "darklake_creature"]

export interface Meeting {
  /** Who noticed whom. */
  first: "party" | "them"
  /** Who starts a fight surprised, if it comes to one. Nobody, when the party saw them first. */
  surprised: "party" | null
  /** The chip on the card: "Fifi saw them first" / "They saw the party first". */
  chip: string
  /** One sentence for the card and for Malachar, stating the consequence in rules terms. */
  line: string
  source: string
}

/** Did the dice name creatures? True when any step was rolled on a creature table. */
export function metCreatures(rolls: readonly Pick<RolledStep, "table_key">[] | null | undefined): boolean {
  return (rolls ?? []).some((r) => CREATURE_TABLES.includes(r.table_key))
}

/**
 * The verdict for an encounter at this marker, or null when there is nothing to meet: no creatures rolled, or
 * no passive roll was made here (a sail, or nobody on the march).
 */
export function meetingAt(
  notice: Pick<NoticeResult, "noticed" | "best" | "dc"> | null | undefined,
  rolls: readonly Pick<RolledStep, "table_key">[] | null | undefined,
): Meeting | null {
  if (!notice || !notice.best || !metCreatures(rolls)) return null
  const who = notice.best.name
  if (notice.noticed) {
    return {
      first: "party",
      surprised: null,
      chip: `${who} saw them first`,
      line: `${who} sees them before they see the party (passive ${notice.best.passive} vs DC ${notice.dc}). Nobody is surprised, and how to meet them is the party's choice.`,
      source: MEETING_SOURCE,
    }
  }
  return {
    first: "them",
    surprised: "party",
    chip: "They saw the party first",
    line: `They see the party first (best passive ${notice.best.passive} vs DC ${notice.dc}). If it comes to a fight, the party is surprised: Disadvantage on Initiative.`,
    source: MEETING_SOURCE,
  }
}
