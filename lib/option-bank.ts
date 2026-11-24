/**
 * OPTION BANKS — the files-first half of Sam's ruling (2026-11-23): Malachar and the main NPCs "must use [their]
 * agentic AI intelligence for things that are required, otherwise from informational files to save tokens."
 * Design of record: project doc claude/Malachar_Options_2026-11-23.md, PR 2 of 3.
 *
 * Each agent card (npc_agents.option_bank) holds a short list of options already written and tagged: where they
 * fit (plates), when (talking to them, a fight on, who must be present), what they need (an item carried, no
 * manacles), and why they are there (germane or bait). /api/suggestions tries the bank FIRST; only when the beat
 * is new (a player just said something the bank cannot know about) or the bank has too little for this moment does
 * it pay for a model call. The same law holds either way: every option germane or bait on purpose, at most one bait.
 *
 * Pure: no Supabase (lib/option-bank.test.ts). Sam edits banks on The Cast > Actor.
 */
import { OBSERVE_FALLBACK, type Suggestion } from "@/lib/suggestions"
import type { Moment } from "@/lib/moment"

export interface BankEntry {
  text: string
  skill?: string | null
  /** Laid on the table on purpose because it is worse than it looks. */
  bait?: boolean
  /** The look-around option (exactly one per set; never bait). */
  observe?: boolean
  when?: {
    /** Plate keys this fits ("11" the slave pen, "battle-pen-gate", "ruins-great-hall"). Absent: any plate. */
    plates?: string[]
    /** true: only while a fight is on; false: only when none is. Absent: either. */
    fight?: boolean
    /** true: only when the hero is talking to this agent; false: only when not. Absent: either. */
    talking?: boolean
    /** Agent keys or company slugs that must all be with the hero ("buppido"). */
    with?: string[]
  }
  /** A word the hero's carried items must contain ("rope", "dagger"). */
  needs?: string
  /** Conditions that rule it out ("manacled", "restrained"). */
  notIf?: string[]
}

export const BANK_MAX = 40
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
const words = (v: unknown, n = 12) => (Array.isArray(v) ? v.map((x) => clip(x, 40).toLowerCase()).filter(Boolean).slice(0, n) : undefined)

/** A bank as typed on The Cast (or seeded), cleaned. Anything malformed is dropped, never guessed at. */
export function parseBank(raw: unknown): BankEntry[] {
  if (!Array.isArray(raw)) return []
  const out: BankEntry[] = []
  for (const r of raw.slice(0, BANK_MAX)) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const text = clip(o.text, 60)
    if (text.length < 3) continue
    const w = (o.when && typeof o.when === "object" ? o.when : {}) as Record<string, unknown>
    const when: BankEntry["when"] = {}
    const plates = words(w.plates); if (plates?.length) when.plates = plates
    if (typeof w.fight === "boolean") when.fight = w.fight
    if (typeof w.talking === "boolean") when.talking = w.talking
    const withs = words(w.with, 6); if (withs?.length) when.with = withs
    const e: BankEntry = { text, skill: clip(o.skill, 30) || null }
    if (o.observe === true) e.observe = true
    else if (o.bait === true) e.bait = true
    if (Object.keys(when).length) e.when = when
    const needs = clip(o.needs, 30).toLowerCase(); if (needs) e.needs = needs
    const notIf = words(o.notIf, 6); if (notIf?.length) e.notIf = notIf
    out.push(e)
  }
  return out
}

export interface HeroNow { items: string[]; conditions: string[] }

const norm = (s: string) => s.toLowerCase().trim()

/** Does this entry fit this moment, for this hero? */
export function fits(e: BankEntry, m: Moment, hero: HeroNow, presentKeys: string[]): boolean {
  const w = e.when ?? {}
  if (w.plates && !(m.plate && w.plates.includes(norm(m.plate)))) return false
  if (w.fight === true && !m.fight) return false
  if (w.fight === false && m.fight) return false
  const talkingToAuthor = !!m.talkingTo && norm(m.author.name).split(/\s+/)[0] === norm(m.talkingTo).split(/\s+/)[0]
  if (w.talking === true && !talkingToAuthor) return false
  if (w.talking === false && talkingToAuthor) return false
  if (w.with && !w.with.every((k) => presentKeys.includes(k))) return false
  if (e.needs && !hero.items.some((i) => norm(i).includes(e.needs!))) return false
  const conds = hero.conditions.map(norm)
  if (e.notIf && e.notIf.some((c) => conds.some((h) => h.includes(c)))) return false
  return true
}

/** A small stable hash, so the same beat always draws the same options (a reload must not reshuffle them). */
function seed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/**
 * Options from the bank for this moment, or null when the bank cannot honestly answer it (fewer than two fitting
 * non-observe options). Three non-observe options at most, one bait at most, one observe last.
 */
export function bankSet(bank: BankEntry[], m: Moment, hero: HeroNow, presentKeys: string[], beatKey: string): Suggestion[] | null {
  const fit = bank.filter((e) => fits(e, m, hero, presentKeys))
  const observe = fit.find((e) => e.observe)
  const rest = fit.filter((e) => !e.observe)
  // The most specific first (an option written for THIS plate and THIS person beats a general one), then a stable
  // per-beat order inside each tier, so two beats in the same room do not always show the same three.
  const spec = (e: BankEntry) => (e.when?.plates ? 2 : 0) + (e.when?.talking ? 2 : 0) + (e.when?.with ? 1 : 0) + (e.when?.fight !== undefined ? 1 : 0)
  const s = seed(beatKey)
  rest.sort((a, b) => spec(b) - spec(a) || (seed(a.text) ^ s) - (seed(b.text) ^ s))
  const picked: BankEntry[] = []
  let baits = 0
  for (const e of rest) {
    if (picked.length === 3) break
    if (e.bait) { if (baits) continue; baits++ }
    picked.push(e)
  }
  if (picked.length < 2) return null
  const out: Suggestion[] = picked.map((e) => ({ text: e.text, skill: e.skill ?? null, intent: e.bait ? "bait" : "germane" }))
  out.push(observe ? { text: observe.text, skill: observe.skill ?? null, kind: "observe", intent: "germane" } : { ...OBSERVE_FALLBACK, intent: "germane" })
  return out
}

/**
 * Is this beat one the bank may answer? Not when a player has just spoken and the DM or an NPC answered: that is a
 * new turn in the story the bank cannot know about, and it is exactly what the model is for. Everything else
 * (arriving on a plate, an NPC's opener or bark, narration with no player line before it, or a player line now three
 * or more lines behind) the bank may answer.
 * `npcNames` are the cast's names; "Narration" is the DM; any other speaker is a player.
 */
export function bankMayAnswer(sceneText: string, npcNames: string[]): boolean {
  const lines = sceneText.split("\n").map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return true
  const speaker = (l: string) => { const i = l.indexOf(":"); return i > 0 ? l.slice(0, i).trim() : "" }
  const npc = new Set(npcNames.map(norm))
  const isNpc = (s: string) => npc.has(norm(s)) || npc.has(norm(s).split(/\s+/)[0])
  // Walk back past the beat's own speaker block (the DM's prose and the NPC lines it carried) to the line before.
  let i = lines.length - 1
  while (i >= 0) {
    const sp = speaker(lines[i])
    if (sp === "Narration" || isNpc(sp)) { i--; continue }
    break
  }
  if (i < 0) return true                     // no player line in view: routine
  // A player line just before the answer: a new turn, use the model. Unless the world has since moved on by three
  // or more lines of its own (night passed, someone new walked up), and the player's words are no longer the matter.
  return lines.length - 1 - i >= 3
}
