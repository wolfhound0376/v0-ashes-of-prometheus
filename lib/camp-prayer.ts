// The bridge between the PRAY button and the prayer rules.
//
// WHY THIS FILE EXISTS. `pray` has been a camp action since 2026-09-26 and the
// camp screen has rendered a PRAY button ever since — "Speak to your god." But
// `CAMP_ACTION_RULES.pray` said:
//
//     resolves: "dmScene() — no rule; the DM answers or does not"
//
// which means every press handed Malachar a blank page and let him improvise
// what a god does. That is the failure mode AGENTS.md §0 opens with: the fake
// d100 scavenged-items table, the invented Hook Horror attack. A player cannot
// tell an improvised divine ruling from a real one, and neither can the next
// session reading the transcript.
//
// `lib/prayer.ts` is the rule. This file is the ten lines that connect them:
// it reads what the camp already knows (who is praying, where, when, what they
// are giving up) and hands back a resolved tier plus the phrasing contract
// Malachar must narrate within. It owns no rules of its own.
//
// Pure, like lib/camp and lib/prayer — rows and an Rng in, a decision out. The
// route owns the database.
//
// SOURCES: see lib/prayer.ts. The camp-side facts here are Sam's:
//   - the PRAY action and its one-action cost (Sam, 2026-09-26, lib/camp.ts §2)
//   - a prayer is private unless spoken aloud (Sam, 2026-10-01)
//   - a Tier 3 "hand" may save a character from death (Sam, 2026-10-01)

import type { Rng } from "./game-context"
import {
  resolvePrayer,
  standingWord,
  type Deity,
  type Offering,
  type Posture,
  type PrayerContext,
  type PrayerResult,
  type Standing,
} from "./prayer"
import { observanceState, type ObservanceState } from "./devotion"

/** A `character_faith` row, as the route reads it. */
export interface FaithRow {
  deity_slug: string
  attention: number
  accord: number
  debt: number
  vows?: Standing["vows"]
  last_prayer_day?: number | null
}

export interface CampPrayerInput {
  character: { id: string; name: string; class?: string | null; level?: number | null }
  /** Null when the character has no faith on record — they may still pray. */
  faith: FaithRow | null
  deity: Deity | null
  /** What the player typed. Malachar answers THIS, not a category. */
  petition: string
  posture: Posture
  offering: Offering
  context: PrayerContext
  /** `game_clock.game_day`, for the observance. */
  gameDay: number
  /** Camp actions left before this one. A prayer costs one. */
  actionsRemaining: number | null | undefined
}

export interface CampPrayerDecision {
  /** False when the prayer is refused outright; nothing is spent and nothing rolls. */
  ok: boolean
  /** Spend one camp action? Only ever true when `ok`. */
  spend: boolean
  remaining: number
  result: PrayerResult | null
  observance: ObservanceState
  /**
   * The word the sheet shows. Never a number, and never null: a character with
   * no faith row reads "unknown", which is what the vocabulary is for. Two
   * spellings of "nothing yet" would be two cases for the UI to get wrong.
   */
  standing: ReturnType<typeof standingWord>
  /** "private" unless spoken aloud (Sam, 2026-10-01). */
  visibility: "private" | "party"
  /** What Malachar is allowed to do with this. The whole point of the file. */
  narration: NarrationContract
  note: string
}

/**
 * The contract Malachar narrates inside. He owns the prose; he does not own
 * whether the god answered, nor what an answer may contain.
 */
export interface NarrationContract {
  tier: 0 | 1 | 2 | 3 | 4
  tierName: string
  /** Hard "do not" list, written into the prompt verbatim. */
  forbidden: string[]
  /** What this tier may actually deliver. */
  permitted: string[]
  /** True only at tier 2 — the one 5e currency prayer may grant. */
  grantsInspiration: boolean
  /** Who hears it happen at all. */
  audience: "private" | "party"
  /** Non-null when something in the world noticed. */
  overheardBy: string | null
}

/** Never changes by tier: these are the rails from lib/prayer.ts §RAIL 1. */
export const PRAYER_FORBIDDEN: readonly string[] = [
  "do not cast or imitate any spell, at any level",
  "do not restore hit points",
  "do not deal damage",
  "do not grant a bonus to AC, an attack roll, a saving throw or a skill check",
  "do not create, conjure or hand over any item",
  "do not grant a spell slot, a class feature, or a use of one",
  "do not reveal that a prayer was offered unless it was spoken aloud",
]

const PERMITTED: Record<number, string[]> = {
  0: [
    "describe the silence itself, in this place, for this god — it is the scene, not an error",
    "the petitioner may not conclude from silence that no one is there",
  ],
  1: [
    "one true thing the DM already knows: an omen, a direction, a warning",
    "information only — nothing in the world moves because of it",
  ],
  2: [
    "the god marks the moment; a co-religionist NPC may later know it happened",
    "grant Inspiration (the SRD's own DM-granted token, and the only one)",
  ],
  3: [
    "ONE of: re-roll a die already rolled; steady an ally's death save; turn one specific thing aside",
    "a death save MAY be saved this way (Sam, 2026-10-01) — by a hand steadying theirs, never by healing",
    "it costs the petitioner Debt, which the engine has already applied",
  ],
  4: [
    "this tier is Divine Intervention and belongs to the class feature, not to prayer",
  ],
}

export function narrationContract(result: PrayerResult, visibility: "private" | "party"): NarrationContract {
  return {
    tier: result.tier,
    tierName: result.tierName,
    forbidden: [...PRAYER_FORBIDDEN],
    permitted: [...(PERMITTED[result.tier] ?? [])],
    grantsInspiration: result.tier === 2,
    audience: visibility,
    overheardBy: result.overheard ? "something in this place heard it" : null,
  }
}

/**
 * Resolve one press of PRAY.
 *
 * The camp action is spent on a prayer that is ACTUALLY OFFERED, including one
 * met with silence — silence is the god's answer, not a failed attempt, and
 * refunding it would teach players to re-press until something happened. A
 * prayer refused before it leaves the lips (no camp action left, not camped)
 * spends nothing.
 */
export function prayAtCamp(input: CampPrayerInput, rng: Rng): CampPrayerDecision {
  const have = Math.max(0, Math.trunc(Number(input.actionsRemaining) || 0))
  const faith = input.faith
  const standing: Standing = faith
    ? { attention: faith.attention, accord: faith.accord, debt: faith.debt, vows: faith.vows }
    : { attention: 0, accord: 0, debt: 0 }

  const observance = observanceState({
    lastPrayerDay: faith?.last_prayer_day ?? null,
    today: input.gameDay,
  })

  const refuse = (note: string): CampPrayerDecision => ({
    ok: false, spend: false, remaining: have, result: null, observance,
    standing: standingWord(standing),
    visibility: input.posture === "aloud" ? "party" : "private",
    narration: {
      tier: 0, tierName: "silence", forbidden: [...PRAYER_FORBIDDEN],
      permitted: ["nothing — the prayer was never offered"],
      grantsInspiration: false,
      audience: input.posture === "aloud" ? "party" : "private",
      overheardBy: null,
    },
    note: `${input.character.name} — ${note}`,
  })

  if (have <= 0) return refuse("no camp action left this rest; the prayer waits.")
  if (!input.petition.trim()) return refuse("a prayer needs words; nothing was said.")

  const isClericOfDeity =
    (input.character.class ?? "").toLowerCase().includes("cleric") &&
    !!input.deity && faith?.deity_slug === input.deity.slug

  const result = resolvePrayer(
    {
      petitioner: { clericLevel: Math.max(0, Math.trunc(input.character.level ?? 0)), isClericOfDeity },
      deity: input.deity,
      standing,
      offering: input.offering,
      posture: input.posture,
      context: input.context,
    },
    rng,
  )

  return {
    ok: true,
    spend: true,
    remaining: have - 1,
    result,
    observance,
    standing: standingWord(standing),
    visibility: result.visibility,
    narration: narrationContract(result, result.visibility),
    note: `${input.character.name} prays${input.deity ? ` to ${input.deity.name}` : ""}: ${result.tierName}.`,
  }
}

/**
 * What the route writes back to `character_faith` after a prayer. Pure, so the
 * arithmetic is testable without a database.
 *
 * Attention rises for the act of praying at all — a god notices being
 * addressed, which is the one thing the petitioner always controls. It rises
 * further when the prayer cost something or the moment was grave.
 */
export function faithPatchAfter(
  standing: Standing,
  result: PrayerResult,
  gameDay: number,
): { attention: number; debt: number; last_prayer_day: number; state: string } {
  const bump = 1 + (result.terms.offering > 0 ? 1 : 0) + (result.terms.extremity > 0 ? 1 : 0)
  const attention = Math.min(100, standing.attention + bump)
  const debt = Math.max(-100, Math.min(100, standing.debt + result.debtDelta))
  const next: Standing = { ...standing, attention, debt }
  return { attention, debt, last_prayer_day: gameDay, state: standingWord(next) }
}
