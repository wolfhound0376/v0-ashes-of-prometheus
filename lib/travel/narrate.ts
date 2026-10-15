// lib/travel/narrate.ts — Malachar's line when something happened on the road.
//
// Sam (2026-10-14): "Only when something happens and to comment." A quiet
// marker gets the cue and the chip and nothing else; a halt, a forced march
// that cost someone, or a passive roll that found something earns one or two
// sentences in his voice, written to `dialogue` (channel dm) so every browser
// at the table reads it and the dashboards voice it.
//
// Facts in, flavour out: the line is built from the arrival's own facts (the
// node, the outcome, the roll, the hour). The prompt forbids inventing
// anything else, and Malachar never cites a page, a chapter or "the book"
// (the rule from lib/world-ai/book-retrieval.ts). Haiku, because it must
// arrive before the moment passes; best-effort with a short timeout, and a
// failure is silence, never a stalled march.

import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import type { createAdminClient } from "@/lib/supabase/admin"

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const TIMEOUT_MS = 6000

export interface RoadFacts {
  nodeName: string
  /** "encounter" | "challenge" | "cinematic" | "camp" | "forced_march" | "none" */
  haltKind: string
  title: string | null
  body: string | null
  /** The passive-roll chip, e.g. "Fifi's eyes · passive 13 vs DC 12 · noticed". */
  notice: { chip: string; noticed: boolean; text: string | null; revealedName: string | null } | null
  /** Hours walked today after this leg. */
  hoursToday: number
  pace: string
  /** Names of those who gained exhaustion on a forced march, with the levels gained. */
  exhausted: { name: string; levels: number }[]
}

/** Did anything happen worth a word from him? */
export function worthAWord(f: RoadFacts): boolean {
  return f.haltKind !== "none" || !!f.notice?.noticed && !!(f.notice.text || f.notice.revealedName) || f.exhausted.length > 0
}

export async function malacharRoadLine(f: RoadFacts, personality?: string | null): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const facts: string[] = [`The party has just arrived at ${f.nodeName} on the Underdark road, ${f.pace} pace, ${Math.round(f.hoursToday * 10) / 10} hours into the day's march.`]
  if (f.haltKind === "camp") facts.push("The day's eight hours are spent; they must make camp here.")
  else if (f.haltKind === "forced_march") facts.push("They pushed on past the day's eight hours (a forced march).")
  else if (f.haltKind !== "none") facts.push(`Something stopped them: ${f.title ?? f.haltKind}.${f.body ? " " + f.body : ""}`)
  if (f.exhausted.length) facts.push(`Exhaustion from the forced march: ${f.exhausted.map((e) => `${e.name} +${e.levels}`).join(", ")}.`)
  if (f.notice) {
    facts.push(`Passive Perception: ${f.notice.chip}.`)
    if (f.notice.noticed && f.notice.text) facts.push(`What was noticed: ${f.notice.text}`)
    if (f.notice.noticed && f.notice.revealedName) facts.push(`It reveals: ${f.notice.revealedName}.`)
  }
  const prompt = `You are Malachar, the lich who narrates an Out of the Abyss D&D 5e campaign: theatrical, sly, darkly funny, a little cruel.${personality ? ` Your current manner: ${personality}.` : ""}
Narrate what just happened on the road to the players, in one or two sentences (under 45 words), present tense, in your own voice.
FACTS (use only these; invent nothing — no new creatures, names, places, items or outcomes):
${facts.map((x) => "- " + x).join("\n")}
Never mention pages, chapters, books, rules or dice mechanics; the numbers above are for you, not for them. Address the party directly.
Reply with the line only, no quotes, no JSON.`
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const result = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      messages: [{ role: "user", content: prompt }],
      abortSignal: ctrl.signal,
    })
    clearTimeout(t)
    const line = result.text.trim().replace(/^["“]|["”]$/g, "").slice(0, 320)
    return line || null
  } catch (e) {
    console.warn("[travel] Malachar's road line skipped:", e instanceof Error ? e.message : e)
    return null
  }
}

/** Write his line to the table's log. Best-effort. */
export async function sayOnTheRoad(db: ReturnType<typeof createAdminClient>, line: string): Promise<boolean> {
  const { error } = await db.from("dialogue").insert({ speaker: "Malachar", speaker_type: "dm", text: line, channel: "dm" })
  if (error) console.warn("[travel] road line not written to dialogue:", error.message)
  return !error
}
