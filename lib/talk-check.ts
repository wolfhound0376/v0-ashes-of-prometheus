// ============================================================================
// A SKILL ON A LINE IN A CONVERSATION IS A REAL CHECK, AND THE GAME SETS ITS DIFFICULTY.
// ============================================================================
//
// Sam's playtest, 2026-11-15, point 2: "Options in dialogue didn't always match options that went anyway in the
// actual game." The Parley's reply options carry a skill ("Tell him the drow need us whole (Persuasion)"), the
// button's tooltip calls it a "Persuasion check", and the line was sent to the NPC as plain words with the skill
// stuck on the end. No roll was ever made: in run 74 Scott sent five Persuasion lines to Ront and the roll ledger
// shows none. The option promised a check the game never ran.
//
// Now a talk line that ends in a skill is a check:
//   1. The turn the line is sent, the game calls for the roll (Malachar says one short line; the NPC waits). The
//      request carries the hero's own 1d20 + skill bonus, the skill, and a DC the GAME chose.
//   2. The turn the roll comes back, the game reads it against that DC and tells the NPC the outcome; the NPC
//      answers the attempt as the result demands.
//
// WHO SETS THE DC (Sam's check rulings, 2026-10-30, from the Everweave research: "the model that tells the story must
// not also set the DC"). It is read from the NPC's attitude toward the party, which the game already keeps
// (npc_encounters.disposition: hostile / wary / neutral / warm / devoted), on the SRD's typical-DC ladder (SRD 5.1,
// Using Ability Scores: Very easy 5, Easy 10, Medium 15, Hard 20, Very hard 25). Which attitude sits on which rung is
// CLAUDE'S MAPPING, for Sam to retune here. An NPC with no attitude yet is neutral: Medium.
//
// A natural 20 succeeds (Sam, 2026-10-30: a natural 20 IS an auto-success on an ability check, when the option was
// genuinely available, and an option the Parley offers is).
//
// Pure, so it is tested without the route (lib/talk-check.test.ts).

import { normalizeSkillName, type SrdSkill } from "@/lib/roll-requests"

export type Disposition = "hostile" | "wary" | "neutral" | "warm" | "devoted"

/** [CLAUDE'S MAPPING] attitude -> SRD typical DC. */
export const TALK_DC: Record<Disposition, number> = { devoted: 5, warm: 10, neutral: 15, wary: 20, hostile: 25 }

/** The DC for a talk check against an NPC of this attitude; anything unknown is neutral. */
export function talkDc(disposition: string | null | undefined): number {
  const d = String(disposition ?? "").trim().toLowerCase() as Disposition
  return TALK_DC[d] ?? TALK_DC.neutral
}

/** The line and its skill, when a talk line ends in "(Skill)" naming one of the 18 SRD skills; otherwise null. */
export function parseTalkSkill(message: string): { text: string; skill: SrdSkill } | null {
  const m = /^([\s\S]*?)\s*\(([A-Za-z][A-Za-z \-]{2,24})\)\s*$/.exec(String(message ?? ""))
  if (!m) return null
  const skill = normalizeSkillName(m[2])
  if (!skill || !m[1].trim()) return null
  return { text: m[1].trim(), skill }
}

const PURPOSE = /^talk:([a-z_]+):(.+?)(:done)?$/

/** The roll request's purpose, so the result can be read back next turn. */
export function talkPurpose(skill: SrdSkill, npc: string): string {
  return `talk:${skill}:${npc.replace(/:/g, " ").slice(0, 60)}`
}

/** The skill and NPC a purpose names, and whether it was already settled. */
export function parseTalkPurpose(purpose: string | null | undefined): { skill: SrdSkill; npc: string; settled: boolean } | null {
  const m = PURPOSE.exec(String(purpose ?? ""))
  if (!m) return null
  const skill = normalizeSkillName(m[1])
  return skill ? { skill, npc: m[2], settled: !!m[3] } : null
}

/** Pass or fail: the total against the DC; a natural 20 always passes. */
export function settleTalkCheck(total: number, face: number | null | undefined, dc: number): boolean {
  return face === 20 || total >= dc
}

const label = (skill: SrdSkill) => skill.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

/** Told to Malachar the turn the line is sent: the game is calling the roll, the NPC has not answered yet. */
export function talkCallNote(skill: SrdSkill, npc: string): string {
  // Sam, 2026-11-23: in a conversation the NPC answers, not the lich; the dice card is the only sign of the roll.
  return `[THIS LINE IS A ${label(skill).toUpperCase()} CHECK. The game is calling for the roll right now and shows the dice itself. Write NO narration of your own and do not call for the roll. ${npc} reacts in ONE short spoken line, in [NPC_SPEECH] as always: weighing it, wary or curious, neither giving in nor refusing yet. Write no [[dice]] and no number.]`
}

/** Told to Malachar the turn the roll comes back: the outcome the NPC must play. Numbers stay out of the fiction. */
export function talkResultNote(name: string, skill: SrdSkill, npc: string, success: boolean): string {
  return success
    ? `[CHECK RESULT, decided by the game, not by you: ${name}'s ${label(skill)} with ${npc} SUCCEEDED. ${npc} answers the attempt as a success, in their own spoken lines: they are swayed, deceived, cowed or moved as far as the request was reasonable. No narration of your own. Say no numbers.]`
    : `[CHECK RESULT, decided by the game, not by you: ${name}'s ${label(skill)} with ${npc} FAILED. ${npc} answers the attempt as a failure, in their own spoken lines: unmoved, unconvinced or offended, as fits them. No narration of your own. Say no numbers.]`
}
