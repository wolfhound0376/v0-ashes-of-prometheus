/**
 * ONE BRIEF FOR EVERY NPC CALL (NPC agents, PR 2; Sam, 2026-11-23: "Go for PR1 and 2").
 *
 * Before this, each NPC call briefed the model its own way: a fight turn got 400 characters of description, an
 * opener got a 200-character map blurb, the Parley got the six relationship numbers. Eldeth in a fight, Eldeth at
 * camp and Eldeth on the Parley were three strangers with one name. Now every model call that plays a named NPC
 * reads the same thing, built here from the Agent Card, what they remember of this run, and Sam's coaching:
 *
 *   /api/chat        the Parley and camp talks (the NPC being talked to; Malachar's own memory and coaching)
 *   /api/npc-opener  the line they say when they come up to you
 *   /api/npc-mind    a named NPC's turn in a fight
 *
 * The rule-driven NPC routes (npc-ask, npc-help, npc-advice, npc-address) call no model; they already read the same
 * relationship numbers the Rememberer now writes, so they get smarter without a change.
 *
 * formatBrief is pure (lib/npc-brief.test.ts); npcBrief reads the database. Best-effort: "" on any failure, so a
 * turn never waits on it or breaks for it.
 */
import { cardFor, coachingFor, recallFor } from "@/lib/npc-agents-store"
import type { AgentCard, Coaching, Memory } from "@/lib/npc-agents"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export interface BriefParts {
  card: AgentCard
  memories: Memory[]
  coaching: Coaching[]
  heroName?: string | null
  heroId?: string | null
  /** Malachar's persona lives in lib/malachar-persona.ts already; his brief is memory and coaching only. */
  cardText?: boolean
}

export const BRIEF_MAX = 1400

export function formatBrief(p: BriefParts): string {
  const { card, memories, coaching } = p
  const name = card.name
  const out: string[] = []
  if (p.cardText !== false) {
    if (card.bible) out.push(`WHO ${name.toUpperCase()} IS (play them by this): ${card.bible}`)
    const a = card.agenda ?? {}
    const drives = [a.wants && `wants ${a.wants}`, a.fears && `fears ${a.fears}`, a.turns && a.turns].filter(Boolean).join("; ")
    if (drives) out.push(`What drives ${name}: ${drives}.`)
    if (a.secret) out.push(`${name}'s SECRET (never say it outright; let it shape what they do): ${a.secret}.`)
    if (card.voice_note) out.push(`How ${name} talks: ${card.voice_note}`)
  }
  if (memories.length) {
    const who = p.heroName ? ` (what touches ${p.heroName} first)` : ""
    out.push(`What ${name} remembers of this run${who}, heaviest first; bring one up only when it fits, never recite the list:\n${memories.map((m) => `- ${m.line}${m.about_id && p.heroId && m.about_id === p.heroId ? " [about the one in front of them]" : ""}`).join("\n")}`)
  } else if (p.cardText !== false) {
    out.push(`${name} has no memories of this run yet beyond what the log shows.`)
  }
  if (coaching.length) out.push(`The DM's notes on playing ${name} (follow them):\n${coaching.map((c) => `- ${c.note}`).join("\n")}`)
  const text = out.join("\n")
  return text.length > BRIEF_MAX ? text.slice(0, BRIEF_MAX - 1) + "…" : text
}

/** The brief for a named NPC, or "" if they have no card. */
export async function npcBrief(db: Db, npcName: string | null | undefined, opts: { heroId?: string | null; heroName?: string | null; k?: number } = {}): Promise<string> {
  try {
    const card = await cardFor(db, npcName)
    if (!card) return ""
    const [memories, coaching] = await Promise.all([recallFor(db, card.key, opts.heroId ?? null, opts.k ?? 5), coachingFor(db, card.key, "stage")])
    return formatBrief({ card, memories, coaching, heroId: opts.heroId, heroName: opts.heroName })
  } catch (e) {
    console.error("[npc-brief]", e)
    return ""
  }
}

/** Malachar's own: what he remembers of this run and the DM's notes on playing him. His persona is elsewhere. */
export async function malacharBrief(db: Db, opts: { heroId?: string | null; heroName?: string | null } = {}): Promise<string> {
  try {
    const card = await cardFor(db, "Malachar")
    if (!card) return ""
    const [memories, coaching] = await Promise.all([recallFor(db, card.key, opts.heroId ?? null, 4), coachingFor(db, card.key, "stage")])
    if (!memories.length && !coaching.length) return ""
    return formatBrief({ card, memories, coaching, heroId: opts.heroId, heroName: opts.heroName, cardText: false })
  } catch (e) {
    console.error("[npc-brief] malachar", e)
    return ""
  }
}
