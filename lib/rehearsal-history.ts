// ============================================================================
// A REHEARSAL REMEMBERS ITSELF.
// ============================================================================
//
// Sam, 2026-11-13: "When I speak to malachar and he ask me to roll, its as if he doesn't record the roll."
//
// What the live site showed that night: five Malachar turns between 08:01 and 08:03 UTC, two of them roll
// reports ("Roll: 19", "Roll: 15"), and not one row written — no dialogue, no roll request. That is the sandbox
// (/?sandbox=1) doing what it promises: a rehearsal writes nothing. But Malachar's memory of a conversation IS
// the dialogue table (app/api/chat/route.ts reads the last 40 rows every turn). So in a rehearsal he forgot each
// turn as soon as it ended: he asked for a roll, the roll arrived, and he had no record of ever asking.
//
// The fix keeps the promise (still nothing written) and gives him the memory another way: the browser sends the
// rehearsal's own lines — the ones on screen that exist nowhere else — with each sandbox turn, and the route
// appends them to his history. Honoured ONLY on a sandbox turn, which writes nothing, so this can never be used
// to slip invented history into a real game.
//
// Pure, so it can be tested without the route (lib/rehearsal-history.test.ts).

export type RehearsalLine = { speaker: string; text: string }

const MAX_LINES = 30
const MAX_SPEAKER = 60
const MAX_TEXT = 2000

/** Whatever arrived in the request body, cut down to plain speaker/text pairs. Anything malformed is dropped. */
export function cleanRehearsal(raw: unknown): RehearsalLine[] {
  if (!Array.isArray(raw)) return []
  const out: RehearsalLine[] = []
  for (const entry of raw) {
    const speaker = typeof entry?.speaker === "string" ? entry.speaker.trim().slice(0, MAX_SPEAKER) : ""
    const text = typeof entry?.text === "string" ? entry.text.trim().slice(0, MAX_TEXT) : ""
    if (speaker && text) out.push({ speaker, text })
  }
  return out.slice(-MAX_LINES)
}

/**
 * The lines of this rehearsal the browser should send: the ones that exist only on this screen (their ids were
 * made here, never by the database), minus the line being sent right now — the route adds that one itself.
 */
export function rehearsalLinesFor(dialogue: Array<{ id?: string; speaker: string; text: string }>, sending: string): RehearsalLine[] {
  const local = dialogue.filter((entry) => String(entry.id ?? "").startsWith("optimistic-") && entry.text?.trim())
  const last = local[local.length - 1]
  // The line being sent may be dressed on screen ("(…)" to the DM, "@Ront …" to an NPC), so match by containment.
  const said = sending.trim()
  const trimmed = last && said && last.text.includes(said) ? local.slice(0, -1) : local
  return trimmed.slice(-MAX_LINES).map((entry) => ({ speaker: entry.speaker, text: entry.text.slice(0, MAX_TEXT) }))
}

/** A roll request that lives only in a rehearsal: never in the ledger, so the ledger can never be asked to resolve it. */
export const REHEARSAL_ROLL_PREFIX = "rehearsal-"
export const isRehearsalRoll = (id: string | null | undefined) => String(id ?? "").startsWith(REHEARSAL_ROLL_PREFIX)
