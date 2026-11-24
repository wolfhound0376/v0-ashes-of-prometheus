/**
 * The cast's cards and memory, against the database (rules in lib/npc-agents.ts; tables in
 * migrations/20261123190000_npc_agents.sql). Service role only: the cards carry DM secrets.
 *
 * rememberDue(db, key) is the Rememberer's whole job for one NPC:
 *   1. read what happened since their watermark: the dialogue log and the map's story lines (walk_log) they were in;
 *   2. under MIN_NEW_LINES, stop (no model call, nothing written);
 *   3. claim the stretch by moving the watermark first, so two callers never remember the same scene twice;
 *   4. ask Haiku what they will remember; keep only what parses (lib/npc-agents.ts parseRemembered);
 *   5. write the memories, and for an NPC with a characters row, the relationship events and the moved numbers.
 * Best-effort by contract: every failure is logged and returns a reason, never throws into a turn.
 */
import { generateText } from "ai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { activeRun } from "@/lib/situation-store"
import {
  MIN_NEW_LINES, agentFor, applyDeltas, dedupeLines, involves, parseRemembered, recall, rememberPrompt, weighDeltas,
  DIMS, type AgentCard, type Coaching, type Memory, type SceneLine,
} from "@/lib/npc-agents"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const CARD_COLS = "key, name, aliases, role, character_id, sprite_slug, bible, agenda, voice_note, sources, chattiness, remembered_through"

// Cards change only when Sam edits one in The Cast; a minute's cache keeps every NPC turn from re-reading them.
let cardCache: { at: number; cards: AgentCard[] } | null = null
export function forgetCardCache() { cardCache = null }

export async function loadCards(db: Db): Promise<AgentCard[]> {
  if (cardCache && Date.now() - cardCache.at < 60_000) return cardCache.cards
  const { data, error } = await db.from("npc_agents").select(CARD_COLS).order("key")
  if (error) { console.error("[npc-agents] cards:", error.message); return cardCache?.cards ?? [] }
  const cards = ((data ?? []) as AgentCard[]).map((c) => ({ ...c, aliases: c.aliases ?? [], agenda: c.agenda ?? {} }))
  cardCache = { at: Date.now(), cards }
  return cards
}

export async function cardFor(db: Db, name: string | null | undefined): Promise<AgentCard | null> {
  return agentFor(await loadCards(db), name)
}

export async function coachingFor(db: Db, key: string, scope: "stage" | "offstage"): Promise<Coaching[]> {
  const { data } = await db.from("npc_coaching").select("note, scope, active").eq("agent_key", key).eq("active", true).in("scope", [scope, "both"]).order("created_at")
  return (data ?? []) as Coaching[]
}

/** The memories this NPC brings to a moment with this hero. Marks them recalled (recalling refreshes a memory). */
export async function recallFor(db: Db, key: string, heroId: string | null, k = 5): Promise<Memory[]> {
  const { data } = await db.from("npc_memories").select("id, agent_key, about_id, line, gravity, created_at, last_recalled_at").eq("agent_key", key).order("created_at", { ascending: false }).limit(200)
  const picked = recall((data ?? []) as Memory[], { heroId, k })
  const ids = picked.map((m) => m.id).filter(Boolean)
  if (ids.length) {
    const { error } = await db.from("npc_memories").update({ last_recalled_at: new Date().toISOString() }).in("id", ids)
    if (error) console.error("[npc-agents] recall mark:", error.message)
  }
  return picked
}

// One run per NPC at a time, per server instance; the watermark claim covers the rest.
const lastRun = new Map<string, number>()
const THROTTLE_MS = 90_000

export type RememberResult = { key: string; ok: boolean; reason: string; written?: number }

export async function rememberDue(db: Db, key: string, opts: { force?: boolean } = {}): Promise<RememberResult> {
  try {
    if (!opts.force && Date.now() - (lastRun.get(key) ?? 0) < THROTTLE_MS) return { key, ok: true, reason: "throttled" }
    lastRun.set(key, Date.now())
    const { data: card } = await db.from("npc_agents").select(CARD_COLS).eq("key", key).maybeSingle()
    if (!card) return { key, ok: false, reason: "no such agent" }
    const since: string = card.remembered_through ?? new Date(Date.now() - 6 * 3600_000).toISOString()

    const [dlg, walk] = await Promise.all([
      db.from("dialogue").select("speaker, recipient, text, created_at").gt("created_at", since).order("created_at").limit(400),
      // a rehearsal is not the run: its story lines are never remembered
      db.from("walk_log").select("text, created_at, hero").eq("kind", "story").or("mode.is.null,mode.not.ilike.rehearsal*").gt("created_at", since).order("created_at").limit(400),
    ])
    const lines: SceneLine[] = dedupeLines([
      ...((dlg.data ?? []) as { speaker: string; recipient: string | null; text: string; created_at: string }[])
        .filter((l) => involves(card, l))
        .map((l) => ({ at: l.created_at, speaker: l.speaker || "?", text: String(l.text || "").slice(0, 400) })),
      ...((walk.data ?? []) as { text: string; created_at: string }[])
        .filter((l) => involves(card, { text: l.text }))
        .map((l) => ({ at: l.created_at, speaker: "(on the map)", text: String(l.text || "").slice(0, 300) })),
    ]).sort((a, b) => a.at.localeCompare(b.at)).slice(-80)

    if (lines.length < MIN_NEW_LINES && !(opts.force && lines.length > 0)) return { key, ok: true, reason: `only ${lines.length} new lines` }

    // Claim the stretch: move the watermark only if nobody else moved it since we read it.
    const through = lines[lines.length - 1].at
    let claim = db.from("npc_agents").update({ remembered_through: through }).eq("key", key)
    claim = card.remembered_through ? claim.eq("remembered_through", card.remembered_through) : claim.is("remembered_through", null)
    const { data: claimed, error: claimErr } = await claim.select("key")
    if (claimErr) return { key, ok: false, reason: claimErr.message }
    if (!claimed?.length) return { key, ok: true, reason: "another caller is remembering this scene" }

    const { data: heroRows } = await db.from("characters").select("id, name").eq("is_player", true).is("archived_at", null)
    const heroes = ((heroRows ?? []) as { id: string; name: string }[])
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      prompt: rememberPrompt(card, lines, heroes),
      maxOutputTokens: 600,
      abortSignal: AbortSignal.timeout(20_000),
    })
    const items = parseRemembered(text, new Set(heroes.map((h) => h.id)))
    if (!items.length) return { key, ok: true, reason: "nothing worth remembering", written: 0 }

    const run = await activeRun(db).catch(() => null)
    const { error: memErr } = await db.from("npc_memories").insert(items.map((m) => ({ agent_key: key, about_id: m.about, line: m.line, gravity: m.gravity, run_id: run, source: "rememberer" })))
    if (memErr) return { key, ok: false, reason: memErr.message }

    // The six numbers move only for an NPC with their own characters row (Malachar has none, and feels nothing).
    if (card.character_id) {
      for (const m of items) {
        if (!m.about) continue
        const deltas = weighDeltas(m.deltas)
        if (!Object.keys(deltas).length) continue
        const { error: evErr } = await db.from("relationship_events").insert({ subject_id: card.character_id, object_id: m.about, kind: "scene", gravity: m.gravity, deltas, note: m.line, source: "rememberer" })
        if (evErr) { console.error("[rememberer] event:", evErr.message); continue }
        const { data: cur } = await db.from("character_relationships").select(DIMS.join(", ")).eq("subject_id", card.character_id).eq("object_id", m.about).maybeSingle()
        const next = applyDeltas((cur ?? {}) as Record<string, number>, deltas)
        const { error: upErr } = await db.from("character_relationships").upsert(
          { subject_id: card.character_id, object_id: m.about, ...next, last_reason: m.line.slice(0, 200), updated_at: new Date().toISOString() },
          { onConflict: "subject_id,object_id" },
        )
        if (upErr) console.error("[rememberer] standing:", upErr.message)
      }
    }
    return { key, ok: true, reason: "remembered", written: items.length }
  } catch (e) {
    console.error(`[rememberer] ${key}:`, e)
    return { key, ok: false, reason: String(e instanceof Error ? e.message : e) }
  }
}

/** Every card in turn (the map's story lines can involve anyone). Cheap when nothing is due: no model call. */
let lastAll = 0
export async function rememberAllDue(db: Db, opts: { throttle?: boolean } = {}): Promise<RememberResult[]> {
  // The map posts its log every few seconds from every screen; the sweep itself runs at most once a minute here.
  if (opts.throttle && Date.now() - lastAll < 60_000) return []
  lastAll = Date.now()
  const cards = await loadCards(db)
  const out: RememberResult[] = []
  for (const c of cards) out.push(await rememberDue(db, c.key))
  return out
}
