// THE DM'S ROSTER EXCEPTION (Sam, 2026-10-26: "I should be able to add cannon characters in the DM mode if they
// aren't seated. This should prompt a warning box mentioning this exception.")
//
// The roster locks when a session goes live, for the DM too (Sam, 2026-10-25; lib/table.ts). One exception: the
// DM may still bring one of the four canon heroes (lib/canon-heroes.ts) onto the map as a DM-run companion, but
// only after confirming a warning that names the exception. Forge heroes and everyone else stay locked out.
//
// Pure: no Supabase, no window. /api/seat asks this; the map's DM tools show the warning when told to.

import { canonById } from "@/lib/canon-heroes"
import type { TableStatus } from "@/lib/table"

export type SeatDecision =
  | { ok: true; exception: boolean }
  | { ok: false; status: 409; code: "roster_locked" | "table_closed"; canOverride: boolean; error: string }

export const LOCKED_MESSAGE = "The roster is locked once the session begins. Seat companions at the table before you start."

/** The warning the DM confirms before the exception applies. */
export function exceptionWarning(name: string): string {
  return `The session is live and the roster is locked. Adding ${name} now is a DM exception to that rule: ` +
    `${name} joins every player's map as a companion you run, and stays seated until you send them away or end the session.`
}

export function decideSeat(status: TableStatus, characterId: string, override: boolean): SeatDecision {
  if (status === "lobby") return { ok: true, exception: false }
  if (status === "closed") return { ok: false, status: 409, code: "table_closed", canOverride: false, error: "Open the table first (Behind the Screen → Open the table)." }
  const canon = canonById(characterId) != null
  if (canon && override) return { ok: true, exception: true }
  return { ok: false, status: 409, code: "roster_locked", canOverride: canon, error: LOCKED_MESSAGE }
}
