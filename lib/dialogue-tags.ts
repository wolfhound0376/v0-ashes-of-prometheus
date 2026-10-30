// ============================================================================
// WHICH ARCHIVED LINES CAN BE SAID AGAIN, AND WHAT THEY WERE FOR.
// ============================================================================
//
// Sam, 2026-10-30: "recycling should only cover NPC barks, system flavors, and
// all audio not Malachar."
//
// `dialogue_archive` keeps every line ever spoken. Most of them are of no use
// a second time: Malachar's prose is ruled out outright (the dm_phrasebook ban
// list exists to stop him repeating himself, and feeding him his own archive
// would be that bug with extra steps), and a line naming a hero or a number
// was true once and is wrong the moment the run changes.
//
// What IS worth saying again is the standing stuff — a guard's "Step back", a
// prisoner's mutter, "The gate holds." Those are identical every run, which is
// also exactly what makes them cache in lib/tts-cache.ts. The two halves of
// Sam's rule line up: a line worth recycling is a line already paid for.
//
// This module decides, from a row alone, three things:
//   kind      — who was talking, in recycling terms
//   reusable  — may this line ever be said again
//   trigger   — what moment it belonged to, so a caller can ask for the right one
//
// It is PURE. No database, no network. The archive is tagged by running rows
// through it (scripts/dialogue/tag-archive.mjs); the reader in
// lib/canned-lines.ts queries the result.

/** Who was talking, for recycling purposes. */
export type LineKind = "dm" | "npc" | "player" | "system" | "combat" | "direct"

/** What moment the line belonged to. Deliberately coarse — a bark is filed by
 *  occasion, not by sentence. "unknown" is a legitimate answer. */
export type LineTrigger =
  | "gate_warning"
  | "taunt"
  | "threat"
  | "greeting"
  | "refusal"
  | "arrival"
  | "death"
  | "loot"
  | "rest"
  | "labor"
  | "flavour"
  | "unknown"

export type DialogueRow = {
  speaker?: string | null
  speaker_type?: string | null
  channel?: string | null
  text?: string | null
  recipient?: string | null
}

export type LineTags = {
  kind: LineKind
  trigger: LineTrigger
  reusable: boolean
  /** Why not, in a few words, when reusable is false. Empty when it is true. */
  reason: string
  /** Free-form extras a query might filter on. */
  tags: string[]
}

/** The DM speaks as himself under several spellings; all of them are his. */
const DM_NAMES = new Set(["malachar", "dm", "the dm", "narrator"])

/** The combat log is a system voice wearing a speaker name. */
const COMBAT_SPEAKER = "combat"

/**
 * A line that mentions a specific hero, a number, or a dice roll was true for
 * one moment of one run. It is archived like everything else, and it is never
 * recycled — saying it again puts a dead character's name in a guard's mouth.
 *
 * Names are not hard-coded: the caller passes the roster it knows about, and
 * an unknown roster simply means the name check does not fire (the number and
 * markup checks still do).
 */
export function isSpecific(text: string, heroNames: string[] = []): string {
  // Rolls and engine markup are checked BEFORE the bare digit test: "[[1d20+3]]"
  // contains a number too, and "contains a number" is a true but useless reason
  // for a line that is plainly a roll.
  if (/\[\[|\]\]|🎲/.test(text)) return "contains a roll"
  // Markup the engine inserts for one particular turn.
  if (/\[[A-Z_]+:/.test(text)) return "contains a system tag"
  if (/\d/.test(text)) return "contains a number"
  const lower = text.toLowerCase()
  for (const name of heroNames) {
    const n = name.trim().toLowerCase()
    if (n.length < 3) continue
    if (new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) return `names ${name}`
  }
  return ""
}

/** Coarse occasion, from the words themselves. First match wins, most
 *  specific first — these are ordered on purpose. */
export function triggerOf(text: string): LineTrigger {
  const t = text.toLowerCase()
  if (/\bstep back\b|\baway from the (door|gate)\b|\bback from the bars\b/.test(t)) return "gate_warning"
  if (/\bwork detail\b|\blabou?r\b|\bhaul\b|\bdig\b/.test(t)) return "labor"
  if (/\bdies\b|\bis dead\b|\bbody\b|\bcorpse\b|\bfalls\b/.test(t)) return "death"
  if (/\btakes\b|\bpicks up\b|\bloot\b|\bstores\b/.test(t)) return "loot"
  if (/\brest\b|\bsleep\b|\bcamp\b/.test(t)) return "rest"
  if (/\barrives?\b|\benters?\b|\bcomes? in\b/.test(t)) return "arrival"
  if (/\bno\b\.?$|\bnever\b|\bwon'?t\b|\brefuse\b/.test(t)) return "refusal"
  if (/\bkill\b|\bdie\b|\bbleed\b|\bi'?ll\b.*\b(cut|gut|break)\b/.test(t)) return "threat"
  if (/\bfool\b|\bworm\b|\bfilth\b|\bpathetic\b|\bsurface\b.*\b(scum|filth)\b/.test(t)) return "taunt"
  if (/^(hail|greetings|well met|you there|hey)\b/.test(t)) return "greeting"
  return "flavour"
}

/**
 * Tag one archived line.
 *
 * The reusable rule, in order:
 *   1. Malachar is never reusable. Sam's rule, no exceptions, whatever the
 *      line says.
 *   2. Players are never reusable — their lines are the players', not the
 *      game's, and putting one back in an NPC's mouth would be grotesque.
 *   3. Direct messages between players are never reusable, same reason.
 *   4. The combat log is never reusable: it is all numbers by nature.
 *   5. What is left — NPC lines and system flavour — is reusable unless the
 *      text is specific to one moment (a name, a number, a roll).
 */
export function tagLine(row: DialogueRow, heroNames: string[] = []): LineTags {
  const text = (row.text ?? "").trim()
  const speaker = (row.speaker ?? "").trim()
  const speakerLower = speaker.toLowerCase()
  const type = (row.speaker_type ?? "").trim().toLowerCase()
  const channel = (row.channel ?? "").trim().toLowerCase()

  let kind: LineKind
  if (type === "dm" || DM_NAMES.has(speakerLower)) kind = "dm"
  else if (speakerLower === COMBAT_SPEAKER) kind = "combat"
  else if (channel === "direct") kind = "direct"
  else if (type === "player") kind = "player"
  else if (type === "system") kind = "system"
  else kind = "npc"

  const trigger = text ? triggerOf(text) : "unknown"
  const tags = [kind, trigger, speaker ? `speaker:${speaker}` : ""].filter(Boolean)

  if (!text) return { kind, trigger: "unknown", reusable: false, reason: "empty", tags }
  if (kind === "dm") return { kind, trigger, reusable: false, reason: "Malachar is never recycled", tags }
  if (kind === "player") return { kind, trigger, reusable: false, reason: "a player's own words", tags }
  if (kind === "direct") return { kind, trigger, reusable: false, reason: "a message between players", tags }
  if (kind === "combat") return { kind, trigger, reusable: false, reason: "combat log", tags }

  const specific = isSpecific(text, heroNames)
  if (specific) return { kind, trigger, reusable: false, reason: specific, tags }

  return { kind, trigger, reusable: true, reason: "", tags }
}
