/**
 * NPC AGENTS — the cast's cards and their memory (Sam, 2026-11-23: "make Malachar and the main NPCs smarter and
 * interactive but not obtrusive… make them like agents and train them"). Design of record: project doc
 * claude/NPC_Agents_The_Cast_2026-11-23.md; tables in migrations/20261123190000_npc_agents.sql.
 *
 * "Training" here is not fine-tuning. An agent is trained the way a new hire is: a CARD (who they are, what drives
 * them, how they talk), a MEMORY of this run (one line per thing that mattered, scored on Sam's 0-100 gravity
 * scale), and Sam's COACHING notes. All three are handed to the model every time the NPC acts.
 *
 * THE REMEMBERER writes the memory. It reads a finished stretch of play (the dialogue log and the map's story
 * lines), and for one NPC writes 0-3 memories plus how their feelings toward each hero moved, on the six
 * relationship dimensions Sam designed. This file holds its rules; lib/npc-agents-store.ts does the reading and
 * writing; /api/npc-remember is the door.
 *
 * Pure: no Supabase, no network (lib/npc-agents.test.ts).
 */

export type AgentRole = "dm" | "companion" | "antagonist"

export interface Agenda { wants?: string; fears?: string; secret?: string; turns?: string }

export interface AgentCard {
  key: string
  name: string
  aliases: string[]
  role: AgentRole
  character_id: string | null
  sprite_slug: string | null
  bible: string
  agenda: Agenda
  voice_note: string
  sources: string
  chattiness: number
  remembered_through: string | null
}

export interface Memory {
  id?: string
  agent_key: string
  about_id: string | null
  line: string
  gravity: number
  created_at: string
  last_recalled_at?: string | null
}

export interface Coaching { note: string; scope: "stage" | "offstage" | "both"; active: boolean }

export const DIMS = ["trust", "fear", "respect", "affection", "debt", "resentment"] as const
export type Dim = (typeof DIMS)[number]
export type Deltas = Partial<Record<Dim, number>>

const lc = (s: string) => s.trim().toLowerCase()
const firstWord = (s: string) => lc(s).split(/\s+/)[0] ?? ""
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/** Every name a card answers to: its name, aliases, and the first word of each ("Eldeth Feldrun" → "eldeth"). */
export function namesOf(card: Pick<AgentCard, "name" | "aliases">): string[] {
  const all = [card.name, ...(card.aliases ?? [])].filter(Boolean)
  const out = new Set<string>()
  for (const n of all) {
    out.add(lc(n))
    const fw = firstWord(n)
    // "Prince" is a title, not a name: the first word only counts when it is the name itself.
    if (fw && !TITLES.has(fw)) out.add(fw)
  }
  return [...out]
}
const TITLES = new Set(["prince", "lady", "lord", "the", "sir"])

/** The card for a name as the map or the log gives it, or null. */
export function agentFor<T extends Pick<AgentCard, "name" | "aliases">>(cards: T[], name: string | null | undefined): T | null {
  if (!name) return null
  const want = lc(name)
  const wantFirst = firstWord(name)
  for (const c of cards) if (namesOf(c).includes(want)) return c
  for (const c of cards) if (!TITLES.has(wantFirst) && namesOf(c).includes(wantFirst)) return c
  // "Prince Derendil" asked for, card says "Derendil": try the last word too.
  const last = lc(name).split(/\s+/).pop() ?? ""
  for (const c of cards) if (last && namesOf(c).includes(last)) return c
  return null
}

/** A log line this NPC was part of: they said it, it was said to them, or it names them. */
export function involves(card: Pick<AgentCard, "name" | "aliases">, l: { speaker?: string | null; recipient?: string | null; text?: string | null }): boolean {
  const names = namesOf(card)
  const who = (s?: string | null) => !!s && (names.includes(lc(s)) || names.includes(firstWord(s)))
  if (who(l.speaker) || who(l.recipient)) return true
  const text = l.text ?? ""
  return names.some((n) => n.length >= 3 && new RegExp(`\\b${esc(n)}\\b`, "i").test(text))
}

// --- recall ---------------------------------------------------------------------------------------------------------

/** A memory fades with time unless recalled (Sam's gravity system: "decays over time, refreshed when referenced"). */
export const HALF_LIFE_DAYS = 7

export function recallScore(m: Pick<Memory, "gravity" | "created_at" | "last_recalled_at" | "about_id">, now: number, heroId?: string | null): number {
  const t = Date.parse(m.last_recalled_at || m.created_at)
  const days = Number.isFinite(t) ? Math.max(0, (now - t) / 864e5) : 0
  const fade = Math.pow(0.5, days / HALF_LIFE_DAYS)
  const aboutThem = heroId && m.about_id === heroId ? 1.5 : 1
  return m.gravity * fade * aboutThem
}

/** The memories worth bringing to this moment: the heaviest, freshest, and those about the hero in front of them. */
export function recall<M extends Memory>(memories: M[], opts: { heroId?: string | null; k?: number; now?: number } = {}): M[] {
  const now = opts.now ?? Date.now()
  const k = opts.k ?? 5
  return [...memories]
    .filter((m) => !opts.heroId || m.about_id === null || m.about_id === opts.heroId || m.gravity >= 60)
    .sort((a, b) => recallScore(b, now, opts.heroId) - recallScore(a, now, opts.heroId))
    .slice(0, k)
}

// --- relationships ---------------------------------------------------------------------------------------------------

/** Palliation is harder than aggravation: positive gravity lands at 60-70% weight (Sam's design). */
export const PALLIATION = 0.65
/** One scene moves a feeling by at most this much. */
export const SCENE_CAP = 20

/** The deltas one scene may actually apply: warmth discounted, everything capped. Debt is signed, not "good". */
export function weighDeltas(d: Deltas): Deltas {
  const out: Deltas = {}
  for (const k of DIMS) {
    const v = Number(d[k])
    if (!Number.isFinite(v) || v === 0) continue
    const capped = Math.max(-SCENE_CAP, Math.min(SCENE_CAP, v))
    // A softening is a rise in trust/respect/affection, or a fall in fear/resentment. Debt has no direction of "good".
    const softens = (k === "trust" || k === "respect" || k === "affection") ? capped > 0 : (k === "fear" || k === "resentment") ? capped < 0 : false
    const w = Math.round(softens ? capped * PALLIATION : capped)
    if (w !== 0) out[k] = w
  }
  return out
}

export function applyDeltas(current: Partial<Record<Dim, number>>, d: Deltas): Record<Dim, number> {
  const out = {} as Record<Dim, number>
  for (const k of DIMS) out[k] = Math.max(-100, Math.min(100, (Number(current[k]) || 0) + (Number(d[k]) || 0)))
  return out
}

// --- the Rememberer --------------------------------------------------------------------------------------------------

/** Below this many new lines there is nothing worth a model call. */
export const MIN_NEW_LINES = 6
/** At most this many memories from one scene, for one NPC. */
export const MAX_PER_SCENE = 3

export interface SceneLine { at: string; speaker: string; text: string }
export interface Hero { id: string; name: string }

export function rememberPrompt(card: AgentCard, lines: SceneLine[], heroes: Hero[]): string {
  const heroList = heroes.map((h) => `- ${h.id}: ${h.name}`).join("\n") || "- none"
  const log = lines.map((l) => `${l.speaker}: ${l.text}`).join("\n")
  return `You keep the memory of ONE character in an Out of the Abyss D&D 5e game: ${card.name}.
Who they are: ${card.bible}
What drives them: wants ${card.agenda.wants || "?"}; fears ${card.agenda.fears || "?"}; ${card.agenda.turns || ""}

Below is a stretch of play they were part of. Decide what ${card.name} will REMEMBER from it: at most ${MAX_PER_SCENE} things, only what would still matter to them weeks from now. Ordinary chatter is nothing. Most scenes leave 0 or 1 memory.

For each memory:
- "line": one short sentence in third person, past tense, concrete ("Kenta shared his last ration with Eldeth."). Only what the log shows. Never invent an event, an item or a name.
- "about": the id of the hero it is about, from the list, or null if it is about no hero.
- "gravity": 0-100, how much it matters to ${card.name}: immediate impact, near-future weight, and how it could shape the rest of the campaign. A kindness 30-55, a betrayal or a life saved 60-90, a death 80-100.
- "deltas": how ${card.name}'s feelings toward that hero moved, each -20..20, only the ones that moved: trust, fear, respect, affection, debt (positive = the hero owes ${card.name}; negative = ${card.name} owes the hero), resentment. {} if none, or if "about" is null.

Heroes (id: name):
${heroList}

The log:
${log}

Answer with JSON only: {"memories":[{"line":"...","about":"<id or null>","gravity":0,"deltas":{}}]}`
}

export interface Remembered { line: string; about: string | null; gravity: number; deltas: Deltas }

/** The model's reply → memories that obey the rules, or []. Anything malformed is dropped, never guessed at. */
export function parseRemembered(text: string, heroIds: Set<string>): Remembered[] {
  const m = String(text || "").match(/\{[\s\S]*\}/)
  if (!m) return []
  let raw: unknown
  try { raw = JSON.parse(m[0]) } catch { return [] }
  const list = (raw as { memories?: unknown })?.memories
  if (!Array.isArray(list)) return []
  const out: Remembered[] = []
  for (const r of list.slice(0, MAX_PER_SCENE)) {
    if (!r || typeof r !== "object") continue
    const o = r as Record<string, unknown>
    const line = typeof o.line === "string" ? o.line.trim().replace(/\s+/g, " ") : ""
    if (line.length < 3 || line.length > 300) continue
    const g = Number(o.gravity)
    if (!Number.isFinite(g)) continue
    const about = typeof o.about === "string" && heroIds.has(o.about) ? o.about : null
    const deltas: Deltas = {}
    if (about && o.deltas && typeof o.deltas === "object") {
      for (const k of DIMS) {
        const v = Number((o.deltas as Record<string, unknown>)[k])
        if (Number.isFinite(v) && v !== 0) deltas[k] = Math.max(-SCENE_CAP, Math.min(SCENE_CAP, Math.round(v)))
      }
    }
    out.push({ line, about, gravity: Math.max(0, Math.min(100, Math.round(g))), deltas })
  }
  return out
}

/** The same line posted by every screen on the plate counts once. */
export function dedupeLines(lines: SceneLine[]): SceneLine[] {
  const seen = new Set<string>()
  return lines.filter((l) => {
    const k = `${lc(l.speaker)}|${lc(l.text)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
