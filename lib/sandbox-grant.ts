// ============================================================================
// SPELLS ON LOAN — handing a character a spell to rehearse with.
//
// Sam: "make sure I have the ability on the sandbox to give spells to
// characters to test them out."
//
// The rack only offers what `sheet_spellcasting` holds, and the server refuses
// a cast the sheet does not carry (knowsSpell, in /api/combat). That is the
// right rule for the live table and it makes the rehearsal room useless for
// the one thing it exists for: a Fireball cannot be watched landing if nobody
// on the board can cast one.
//
// So a spell can be LENT. It goes onto the sheet like any other prepared
// spell — the rack, the tray and the cast handler all see it the ordinary way,
// nothing special-cases a loan — and the loan is written down in a ledger on
// the same sheet, so it can be given back exactly: the spell comes off, and a
// slot level that was only opened for it closes again.
//
// WHAT THIS DOES NOT DO is decide what a character is allowed. A level-3
// sorcerer has no level-3 slots and Fireball is a level-3 spell; the loan
// opens the level anyway, because the question the room answers is "what does
// this look like", not "is this legal". The ledger is what keeps that from
// leaking into the campaign: return the loan and the sheet is what it was.
//
// Pure functions over the sheet object. The route reads, calls, writes.
// ============================================================================

import { type Spellcasting, knowsSpell, normSpell } from "./spellbook"

/** How many slots a level gets when the loan has to open it. Two: one to cast, one to cast again without a Reset. */
export const LOAN_SLOTS = 2

/**
 * What the drawer lent, kept ON the sheet so it survives a reload and can be
 * undone by anyone holding the laptop, not just the browser that lent it.
 */
export interface LoanLedger {
  /** Spell names as written onto the sheet. */
  spells: string[]
  /**
   * Per slot level opened by a loan: the `max` that was there before, 0 when
   * the level did not exist. Restored when the last loan at that level goes.
   */
  slots: Record<string, number>
}

/** The sheet, with the ledger the loan writes. */
export interface LoanableSheet extends Spellcasting {
  sandbox?: LoanLedger
}

export interface LoanResult {
  sheet: LoanableSheet
  changed: boolean
  /** Why nothing changed, when nothing did. */
  reason?: string
}

const ledgerOf = (sc: LoanableSheet): LoanLedger => ({
  spells: [...(sc.sandbox?.spells ?? [])],
  slots: { ...(sc.sandbox?.slots ?? {}) },
})

const isLoan = (sc: LoanableSheet, name: string): boolean =>
  (sc.sandbox?.spells ?? []).some((n) => normSpell(n) === normSpell(name))

/**
 * Lend `name` (a spell of `level`, 0 for a cantrip) to this sheet.
 *
 * A spell already on the sheet is left alone — including one lent earlier,
 * which is why lending twice is not two ledger lines. The sheet object passed
 * in is never mutated; the returned one is what to write.
 */
export function grantSpell(sc: LoanableSheet | null | undefined, name: string, level: number): LoanResult {
  const base: LoanableSheet = { ...(sc ?? {}) }
  if (knowsSpell(base, name)) return { sheet: base, changed: false, reason: "already on the sheet" }

  const ledger = ledgerOf(base)
  ledger.spells.push(name)

  const next: LoanableSheet = { ...base, sandbox: ledger }
  if (level === 0) {
    next.cantrips = [...(base.cantrips ?? []), name]
  } else {
    next.prepared = [...(base.prepared ?? []), name]
    const key = String(level)
    const have = base.slots?.[key]
    const max = have?.max ?? 0
    if (max < 1) {
      // Open the level, and remember it was this loan that did. Only the
      // first loan at a level records the old max; a second loan at the same
      // level must not overwrite it with the number the first one invented.
      if (!(key in ledger.slots)) ledger.slots[key] = max
      next.slots = { ...(base.slots ?? {}), [key]: { ...(have ?? {}), max: LOAN_SLOTS, used: 0 } }
    }
  }
  return { sheet: next, changed: true }
}

/**
 * Take a lent spell back. `levelOf` answers what level a name is, because the
 * ledger stores names only and the slot bookkeeping needs to know whether any
 * OTHER loan still holds the level open.
 *
 * A spell the character owns outright is refused: the room lends, it does not
 * confiscate.
 */
export function revokeSpell(
  sc: LoanableSheet | null | undefined,
  name: string,
  levelOf: (name: string) => number,
): LoanResult {
  const base: LoanableSheet = { ...(sc ?? {}) }
  if (!isLoan(base, name)) {
    return {
      sheet: base, changed: false,
      reason: knowsSpell(base, name) ? "that one is theirs, not a loan" : "not on the sheet",
    }
  }
  const want = normSpell(name)
  const drop = (list: string[] | undefined) => (list ?? []).filter((n) => normSpell(n) !== want)

  const ledger = ledgerOf(base)
  ledger.spells = ledger.spells.filter((n) => normSpell(n) !== want)

  const next: LoanableSheet = {
    ...base,
    cantrips: drop(base.cantrips),
    prepared: drop(base.prepared),
    always_prepared: drop(base.always_prepared),
  }

  const level = levelOf(name)
  const key = String(level)
  if (level > 0 && key in ledger.slots && !ledger.spells.some((n) => levelOf(n) === level)) {
    // The last loan at this level. Put the slot row back the way it was:
    // gone if it never existed, its old max otherwise.
    const before = ledger.slots[key]
    const slots = { ...(base.slots ?? {}) }
    if (before < 1) delete slots[key]
    else slots[key] = { ...(slots[key] ?? {}), max: before, used: Math.min(slots[key]?.used ?? 0, before) }
    next.slots = slots
    delete ledger.slots[key]
  }

  next.sandbox = ledger.spells.length || Object.keys(ledger.slots).length ? ledger : undefined
  if (next.sandbox === undefined) delete next.sandbox
  return { sheet: next, changed: true }
}

/** Every loan back at once. Idempotent on a sheet with no ledger. */
export function revokeAll(
  sc: LoanableSheet | null | undefined,
  levelOf: (name: string) => number,
): LoanResult {
  let cur: LoanableSheet = { ...(sc ?? {}) }
  const loans = [...(cur.sandbox?.spells ?? [])]
  if (!loans.length) return { sheet: cur, changed: false, reason: "nothing on loan" }
  for (const n of loans) cur = revokeSpell(cur, n, levelOf).sheet
  return { sheet: cur, changed: true }
}

/** The names currently on loan, for the drawer to mark. */
export function loanedSpells(sc: LoanableSheet | null | undefined): string[] {
  return [...(sc?.sandbox?.spells ?? [])]
}
