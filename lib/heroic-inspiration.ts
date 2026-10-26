// ============================================================================
// HEROIC INSPIRATION — the reroll, Baldur's Gate 3 style.
//
// Sam, 2026-10-26: the roll panel gets an Inspiration reroll button.
//
// The rule (SRD 5.2.1, Rules Glossary, Heroic Inspiration): "If you have
// Heroic Inspiration, you can expend it to reroll any die immediately after
// rolling it, and you must use the new roll." One at a time: gaining it while
// you already have it gives you nothing more.
//
// Stored as `characters.sheet_heroic_inspiration` (boolean). It is earned at
// camp (lib/camp-rites.ts prayToGod) or granted by the DM
// (/api/dm/character-sheet), and spent by /api/inspiration/spend.
//
// Where the panel offers it: on a FAILED check only, the way BG3 does. The SRD
// allows rerolling any die, but on a check you must keep the new roll, so
// rerolling a success could only lose it — offering it there would be a trap.
// ============================================================================

export interface RerollOfferInput {
  /** characters.sheet_heroic_inspiration as last read. */
  hasInspiration: boolean
  /** The check as it stands. */
  success: boolean
  /** This roll has already been rerolled (Inspiration is spent, and one die gets one reroll). */
  rerolled: boolean
  /** This browser may spend it: the character's own seat, or the DM. */
  canSpend: boolean
}

/** Show the "Reroll with Inspiration" button? */
export function offerReroll(i: RerollOfferInput): boolean {
  return i.hasInspiration && i.canSpend && !i.success && !i.rerolled
}

/**
 * The log line once a reroll has happened. `first` and `second` are the two
 * dice lines (describeRoll output); the second is the one that stands.
 */
export function rerollLogLine(first: string, second: string): string {
  return `${first} — Heroic Inspiration, rerolled: ${second}`
}

/** What Malachar is told about the reroll, ahead of the verdict line. */
export function rerollNote(who: string): string {
  return `${who} spent Heroic Inspiration to reroll the first die and must keep the new one.`
}

// --- the spend --------------------------------------------------------------

export type SpendResult =
  | { ok: true; name: string }
  | { ok: false; status: 400 | 403 | 409 | 500; error: string }

/** The slice of the Supabase client the spend uses. Narrow so it can be faked in tests. */
export interface SpendDb {
  from(table: string): {
    update(values: Record<string, unknown>): {
      eq(col: string, v: string | boolean): {
        eq(col: string, v: string | boolean): {
          select(cols: string): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>
        }
      }
    }
  }
}

/**
 * Spend one Heroic Inspiration, atomically. The update only matches a row that
 * still holds it, so two tabs pressing the button at once spend it once and the
 * second is told it is gone (409) — never a free second reroll.
 *
 * `authorised` is the caller's verdict: the DM, or a claim token that matched.
 */
export async function spendInspiration(db: SpendDb, characterId: string, authorised: boolean): Promise<SpendResult> {
  if (!characterId) return { ok: false, status: 400, error: "characterId required" }
  if (!authorised) return { ok: false, status: 403, error: "Invalid character claim" }
  const { data, error } = await db
    .from("characters")
    .update({ sheet_heroic_inspiration: false })
    .eq("id", characterId)
    .eq("sheet_heroic_inspiration", true)
    .select("id, name")
  if (error) return { ok: false, status: 500, error: error.message }
  const row = data?.[0]
  if (!row) return { ok: false, status: 409, error: "No Heroic Inspiration to spend." }
  return { ok: true, name: typeof row.name === "string" ? row.name : "" }
}
