/**
 * OPENER BANKS — PR 3 of 3 of Sam's ruling (2026-11-23): the main NPCs "must use [their] agentic AI intelligence for
 * things that are required, otherwise from informational files to save tokens." Design of record: project doc
 * claude/Malachar_Options_2026-11-23.md.
 *
 * When an NPC calls a hero over on the map (/api/npc-opener), it says an opening line in a balloon, and then, the
 * moment the hero steps over, the matter itself (`next`, Sam 2026-11-13: no pause). A FIRST approach to a stranger
 * needs no intelligence beyond who the NPC is, so it comes from the card (npc_agents.opener_bank), written ahead of
 * time from their agenda: every `next` is the NPC's real business (Eldeth's way home, Buppido's lonely ledges).
 *
 * The model is still paid for when the moment is NOT a first approach:
 *   - something just happened that they are reacting to (the map sends a `situation`: caught sneaking, a surrender);
 *   - they know this hero (knows the name, has standing with them, or remembers something about them).
 * Those lines have to come from what happened, and no file can know it.
 *
 * Pure: no Supabase (lib/opener-bank.test.ts). Sam edits banks on The Cast > Actor.
 */

export interface OpenerEntry {
  /** How they approach: one short sentence, present tense, no dialogue. */
  narration: string
  /** The balloon line, in their voice, to someone whose name they do not know. "{race}" becomes the hero's race. */
  line: string
  /** The matter itself, the moment the hero steps over: one question or one statement from their agenda. */
  next: string
  when?: {
    /** Plate names this fits, matched loosely ("slave pen"). Absent: anywhere. */
    areas?: string[]
    /** Hero races this fits ("dwarf", "half-elf"). Absent: anyone. */
    races?: string[]
  }
}

export const OPENER_MAX = 30
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, n) : "")
const words = (v: unknown, n = 8) => (Array.isArray(v) ? v.map((x) => clip(x, 40).toLowerCase()).filter(Boolean).slice(0, n) : undefined)

/** A bank as typed on The Cast (or seeded), cleaned. Anything malformed is dropped, never guessed at. */
export function parseOpenerBank(raw: unknown): OpenerEntry[] {
  if (!Array.isArray(raw)) return []
  const out: OpenerEntry[] = []
  for (const r of raw.slice(0, OPENER_MAX)) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const line = clip(o.line, 200), next = clip(o.next, 240), narration = clip(o.narration, 200)
    if (line.length < 3 || next.length < 3 || narration.length < 3) continue
    if (line.toLowerCase() === next.toLowerCase()) continue
    const w = (o.when && typeof o.when === "object" ? o.when : {}) as Record<string, unknown>
    const e: OpenerEntry = { narration, line, next }
    const areas = words(w.areas), races = words(w.races)
    if (areas?.length || races?.length) e.when = { ...(areas?.length ? { areas } : {}), ...(races?.length ? { races } : {}) }
    out.push(e)
  }
  return out
}

export interface OpenerMoment {
  /** what just happened, when the NPC opens because of it (the map's talkSituation) */
  situation?: string | null
  /** the NPC has been told this hero's name */
  knowsName?: boolean
  /** the gravity system's summary of how the NPC feels about this hero, null when they have no history */
  standing?: string | null
  /** how many of the NPC's memories this run are about this hero */
  memoriesAbout?: number
}

/** Bank or model, and why (the why is logged so The Cast can show where the tokens went). */
export function openerRoute(m: OpenerMoment): { source: "bank" | "model"; why: string } {
  if (m.situation && m.situation.trim()) return { source: "model", why: "reacting to what just happened" }
  if (m.knowsName) return { source: "model", why: "knows the hero by name" }
  if (m.standing && m.standing.trim()) return { source: "model", why: "has history with the hero" }
  if ((m.memoriesAbout ?? 0) > 0) return { source: "model", why: "remembers something about the hero" }
  return { source: "bank", why: "first approach to a stranger" }
}

function fits(e: OpenerEntry, area: string, race: string): boolean {
  const a = area.toLowerCase(), r = race.toLowerCase()
  if (e.when?.areas && !e.when.areas.some((x) => a.includes(x))) return false
  if (e.when?.races && !(r && e.when.races.some((x) => r === x))) return false
  return true
}
const specificity = (e: OpenerEntry) => (e.when?.areas ? 1 : 0) + (e.when?.races ? 1 : 0)

/**
 * One opener for this moment, or null when nothing fits (the model writes it then). The most specific entries that
 * fit win (a line written for the pen beats one for anywhere); among those, one at random, skipping any line in
 * `exclude` (what they said lately) unless that would leave nothing. "{race}" is filled in, or "stranger".
 */
export function pickOpener(
  bank: OpenerEntry[],
  at: { area?: string; race?: string; exclude?: string[] },
  random: () => number = Math.random,
): OpenerEntry | null {
  const area = at.area ?? "", race = (at.race ?? "").trim()
  const fit = bank.filter((e) => fits(e, area, race))
  if (!fit.length) return null
  const top = Math.max(...fit.map(specificity))
  const tier = fit.filter((e) => specificity(e) === top)
  const said = new Set((at.exclude ?? []).map((s) => s.trim().toLowerCase()))
  const fresh = tier.filter((e) => !said.has(fill(e.line, race).toLowerCase()) && !said.has(fill(e.next, race).toLowerCase()))
  const pool = fresh.length ? fresh : tier
  const e = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  return { narration: fill(e.narration, race), line: fill(e.line, race), next: fill(e.next, race), ...(e.when ? { when: e.when } : {}) }
}

export function fill(text: string, race: string): string {
  return text.replace(/\{race\}/g, race.trim() || "stranger")
}
