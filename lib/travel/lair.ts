// SEARCH THE LAIR (Sam, 2026-11-25: "Add the ambush lair discovery table to this" / "Build it there").
//
// OotA ch.2 p.32, Ambushers: once the creatures lying in wait are dealt with, the party may search their lair and
// roll on Ambush Lair Discovery (d20: 1-10 nothing, corpses with a weapon or armour, 50 gp gems, a magic item from
// DMG Table B, a hoard). On the road this is offered on the encounter card, once per encounter, only when the dice
// named Ambushers, and only after the party slipped past them or came to a fight with them.
//
// The search is one check and one d20 on the book's table (lib/camp-field.ts searchRoom, which the camp's room
// search also uses): the hero on the march with the best Perception or Investigation searches, against the
// searchRoom DC. Everything found resolves against the items catalog; a magic item is always the DM's pick.
// No advantage on the d20: the book rolls it flat.

import { skillBonus, type SheetSlice, type Skill } from "@/lib/game-context"
import type { StanceResult } from "@/lib/travel/stance"

export const LAIR_SOURCE = "OotA ch.2 p.32 (Ambushers: Ambush Lair Discovery). Search DC: SRD Typical DCs, medium (PROPOSED)."

/** The dice named Ambushers: some rolled step came from the Ambushers sub-table. */
export function isAmbushLair(rolls: readonly { table_key?: unknown }[] | null | undefined): boolean {
  return (rolls ?? []).some((r) => r?.table_key === "underdark_ambush")
}

/**
 * May the party search now? Only once the encounter is behind them: they slipped past unseen, or it came to a fight
 * (the card stays up while the fight is fought; the search is for after). Never while a choice is still open, after a
 * parley, or while spotted and still choosing. With no encounter box at all (nobody to choose about), a fight is assumed.
 */
export function lairSearchOpen(stance: Pick<StanceResult, "outcome"> | null | undefined, choicesLeft: number): boolean {
  if (choicesLeft > 0) return false
  if (!stance) return true
  return stance.outcome === "passed" || stance.outcome === "fight"
}

/** Who searches: the hero with the best Perception or Investigation bonus, and which of the two. Ties go to Investigation (searching is a deduction). */
export function searcherOf<T extends SheetSlice>(sheets: readonly T[]): { sheet: T; skill: Skill; bonus: number } | null {
  let best: { sheet: T; skill: Skill; bonus: number } | null = null
  for (const s of sheets) {
    for (const skill of ["investigation", "perception"] as const) {
      const b = skillBonus(s, skill)
      const bonus = b.mod + b.prof
      if (!best || bonus > best.bonus) best = { sheet: s, skill, bonus }
    }
  }
  return best
}
