// The stage roster: who is physically in the area with the party, as Malachar has narrated it.
//
// Narration and the map must agree (Sam, 2026-10-12), and `npc_encounters.is_active` cannot carry
// that: it is the NPC panel's spotlight, and the chat route switches every other row off whenever a
// turn involves someone else (the "focus" rule), so a gray ooze Malachar brought in went inactive the
// moment the party spoke to Jimjar, and the map took it for gone. This roster is written only from
// Malachar's own tags — [NPC_ENCOUNTER:] brings someone on, [NPC_LEAVE:] and death take them off,
// [NPC_MOVE:] places them, [NPC_WANTS_WORD:] has them ask for a word, [UPDATE_LOCATION:] clears the
// area — and nothing about the panel touches it. It rides world_flags
// (key "stage", one row per campaign) so there is no migration; the map polls /api/map-stage.

import type { SupabaseClient } from "@supabase/supabase-js"

export const STAGE_FLAG = "stage"
const CAMPAIGN = "ashes-of-prometheus"

export type StageEntry = {
  name: string
  slug: string
  aliases: string[]            // slugs the map may know this one by ("jorlan" for "Jorlan Duskryn")
  hp: number | null
  hpMax: number | null
  since: string
  dead?: boolean
  /**
   * What killed them, when Malachar's [NPC_DAMAGE: Name 12 necrotic] named a damage type on the killing blow.
   * The map draws some deaths by it (Sam, 2026-10-25: a necrotic kill withers to bones, in a fight or out of one).
   */
  cause?: string | null
  /** Where in the area Malachar last put them, in his words ("on the bridge", "inside the pen"). */
  where?: string | null
  /** Inside the party's own space (the pen) — the map's threshold. Set by [NPC_MOVE:] wording. */
  inside?: boolean
  /**
   * This NPC wants a word — set by [NPC_WANTS_WORD: name | character] (Sam, 2026-10-14: Jorlan "should
   * be able to approach and maybe prompt a player"). `who` is the character they want, or null for
   * anyone. The map shows the "!" and plays the approach; it clears when the talk happens (the chat
   * route hears `talkWith` for this NPC) or when they leave. The WHEN stays Malachar's: nothing on the
   * map decides that someone wants to talk, it only shows it.
   */
  wantsWord?: { who: string | null; since: string } | null
}
/**
 * The outpost's watch on the party (Sam, 2026-10-25: "If there is a guard rotation then they must perform a change.
 * If they leave it unattended they all MUST be gone"). `posted`: the guards are at their posts. `changing`: one
 * watch hands over to the next (the map walks the old pair off and the relief on). `unattended`: nobody is at the
 * posts — every guard and Jorlan off the plate until the watch is posted again. `since` lets the map play a
 * change once, however many times it polls.
 */
export type WatchState = "posted" | "changing" | "unattended"
export type Watch = { state: WatchState; since: string } | null
/**
 * The pen gate as the story has it. The map has its own lock for what the party does with their hands; this is
 * what happens to the gate from OUTSIDE — Jorlan leaving it unlocked, a guard swinging it open — so the door
 * answers the story with no DM button (Sam, 2026-10-25: "I shouldn't have to as the DM prompt the door to escape").
 */
export type GateState = "locked" | "unlocked" | "open"
export type Gate = { state: GateState; since: string } | null
export type Stage = {
  area: string | null
  present: Record<string, StageEntry>   // by slug
  gone: Record<string, StageEntry>      // left or died here, so the map walks them off
  watch?: Watch                         // optional: a stage written before 2026-10-25 has neither
  gate?: Gate
  /** How many times the watch has changed hands this run (every [WATCH: change]). See jorlanOnDuty. */
  rotations?: number
  /** Which rotation brings Jorlan on duty: 2 or 3, rolled once at the first change of the run. */
  jorlanAt?: number | null
  updatedAt: string
}

/**
 * Jorlan is not at the pen when the game begins (Sam, 2026-10-26: "Jorlan shouldn't be present in the beginning of
 * the game. He should come after the 2nd or 3rd guard rotation"). Which of the two is rolled once per run, on the
 * first change of the watch, and kept in the stage so every map and every Malachar turn agree. He arrives with the
 * relief of that rotation and is on the watch from then on. The timing is Sam's ruling, not the book's: Out of the
 * Abyss ch.1 has him on guard duty at the pen without saying when he first takes it.
 */
export const JORLAN_ROTATIONS = [2, 3] as const
export function rollJorlanAt(rand: () => number = Math.random): number {
  return JORLAN_ROTATIONS[Math.min(JORLAN_ROTATIONS.length - 1, Math.floor(rand() * JORLAN_ROTATIONS.length))]
}
export function jorlanOnDuty(stage: Pick<Stage, "rotations" | "jorlanAt">): boolean {
  const r = stage.rotations ?? 0
  return r > 0 && !!stage.jorlanAt && r >= stage.jorlanAt
}

export const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const empty = (): Stage => ({ area: null, present: {}, gone: {}, watch: null, gate: null, rotations: 0, jorlanAt: null, updatedAt: new Date().toISOString() })

export async function readStage(db: SupabaseClient): Promise<Stage> {
  const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", STAGE_FLAG).maybeSingle()
  const v = data?.value
  if (!v || typeof v !== "object" || Array.isArray(v)) return empty()
  const s = v as Partial<Stage>
  return {
    area: s.area ?? null, present: s.present ?? {}, gone: s.gone ?? {}, watch: s.watch ?? null, gate: s.gate ?? null,
    rotations: typeof s.rotations === "number" ? s.rotations : 0, jorlanAt: typeof s.jorlanAt === "number" ? s.jorlanAt : null,
    updatedAt: s.updatedAt ?? new Date().toISOString(),
  }
}

async function writeStage(db: SupabaseClient, stage: Stage) {
  stage.updatedAt = new Date().toISOString()
  const { error } = await db.from("world_flags").upsert(
    { campaign_id: CAMPAIGN, key: STAGE_FLAG, value: stage, set_by: "malachar", note: "who is in the area, from the narration" },
    { onConflict: "campaign_id,key" },
  )
  if (error) console.error("[stage] write failed:", error.message)
}

export type StageEvent =
  | { kind: "arrive"; name: string; aliases?: string[] | null; hp?: number | null; hpMax?: number | null }
  | { kind: "leave"; name: string; dead: boolean; cause?: string | null }
  | { kind: "move"; area: string }
  | { kind: "place"; name: string; where: string }
  | { kind: "wantsWord"; name: string; who: string | null }
  | { kind: "heard"; name: string }
  | { kind: "watch"; state: WatchState }
  | { kind: "gate"; state: GateState }

/** [WATCH: change | unattended | posted] — the words Malachar may use, to the one state the map knows. */
export function watchStateOf(word: string): WatchState | null {
  const w = word.toLowerCase().trim()
  if (/^(change|changing|changes|shift|shift[- ]change|rotation|rotate|relief|relieved)$/.test(w)) return "changing"
  if (/^(unattended|empty|abandoned|away|gone|left|deserted|unguarded|unmanned)$/.test(w)) return "unattended"
  if (/^(posted|back|return|returned|returns|guarded|manned|on duty|on watch)$/.test(w)) return "posted"
  return null
}
/** [GATE: unlocked | open | locked]. */
export function gateStateOf(word: string): GateState | null {
  const w = word.toLowerCase().trim()
  if (/^(unlocked|left unlocked|unbarred)$/.test(w)) return "unlocked"
  if (/^(open|opened|ajar|wide open|swung open)$/.test(w)) return "open"
  if (/^(locked|shut|closed|barred|relocked)$/.test(w)) return "locked"
  return null
}
/** Every [WATCH:] and [GATE:] tag in a reply, in order, as stage events. Unknown words are dropped, not guessed. */
export function watchAndGateTags(text: string): StageEvent[] {
  const out: StageEvent[] = []
  for (const m of text.matchAll(/\[(WATCH|GATE):\s*([^\]]+)\]/gi)) {
    const st = m[1].toUpperCase() === "WATCH" ? watchStateOf(m[2]) : gateStateOf(m[2])
    if (!st) continue
    out.push(m[1].toUpperCase() === "WATCH" ? { kind: "watch", state: st as WatchState } : { kind: "gate", state: st as GateState })
  }
  return out
}

/** "inside the pen", "through the bars", "in the cell" → inside the party's space; "bridge", "outside", "beyond the gate" → not. */
export function isInsideWording(where: string): boolean {
  const w = where.toLowerCase()
  if (/\b(outside|beyond|bridge|balcony|walkway|far side|other side)\b/.test(w)) return false
  return /\b(inside|into|in the (pen|cell|cage|room)|through the (bars|gate|door)|among (you|the party|the prisoners)|in here)\b/.test(w)
}

/** Which present entries are inside now but were not before: the threshold crossings this turn. */
export function crossedInside(before: Stage, after: Stage): string[] {
  return Object.keys(after.present).filter((slug) => after.present[slug].inside && !before.present[slug]?.inside)
}

/** Apply a turn's events in order, in one read and one write. Best-effort: never throws. */
export async function applyStageEvents(db: SupabaseClient | null, events: StageEvent[]): Promise<{ crossed: string[] }> {
  if (!db || !events.length) return { crossed: [] }
  try {
    const stage = await readStage(db)
    const before: Stage = JSON.parse(JSON.stringify(stage))
    applyEventsTo(stage, events, new Date().toISOString())
    await writeStage(db, stage)
    return { crossed: crossedInside(before, stage) }
  } catch (err) {
    console.error("[stage] apply failed:", err)
    return { crossed: [] }
  }
}

/** The pure half of applyStageEvents: the turn's events applied to a stage in memory, in order. */
export function applyEventsTo(stage: Stage, events: StageEvent[], now: string, rand: () => number = Math.random): Stage {
  for (const e of events) {
    if (e.kind === "move") {
      // A new area: the story places its own cast there, and Malachar's tags fill in the rest. The watch is the
      // old area's; the gate is the pen's and stays what it was (a gate left open does not shut behind them).
      if (stage.area && stage.area.toLowerCase() !== e.area.toLowerCase()) { stage.present = {}; stage.gone = {}; stage.watch = null }
      stage.area = e.area
      continue
    }
    if (e.kind === "watch") {
      if (stage.watch?.state !== e.state || e.state === "changing") stage.watch = { state: e.state, since: now }
      if (e.state === "changing") {
        stage.rotations = (stage.rotations ?? 0) + 1
        if (!stage.jorlanAt) stage.jorlanAt = rollJorlanAt(rand)
      }
      continue
    }
    if (e.kind === "gate") {
      // a gate already open is not "unlocked" again by a later line that only remembers it was left unlocked
      if (!(e.state === "unlocked" && stage.gate?.state === "open") && stage.gate?.state !== e.state) stage.gate = { state: e.state, since: now }
      continue
    }
    const slug = slugOf(e.name)
    if (e.kind === "place") {
      // Someone Malachar moves is on stage by definition. The story's own cast — the guards, Jorlan —
      // stand on the map from story.json without ever being [NPC_ENCOUNTER:]ed, so a move with no entry
      // used to be dropped on the floor and Jorlan could never be walked to the bars. Now it opens one.
      const entry = stage.present[slug] ?? stage.gone[slug] ?? { name: e.name, slug, aliases: [], hp: null, hpMax: null, since: now }
      entry.where = e.where; entry.inside = isInsideWording(e.where); delete entry.dead
      delete stage.gone[slug]; stage.present[slug] = entry
      continue
    }
    if (e.kind === "wantsWord") {
      const entry = stage.present[slug] ?? stage.gone[slug] ?? { name: e.name, slug, aliases: [], hp: null, hpMax: null, since: now }
      entry.wantsWord = { who: e.who, since: now }; delete entry.dead
      delete stage.gone[slug]; stage.present[slug] = entry
      continue
    }
    if (e.kind === "heard") {
      const entry = stage.present[slug]
      if (entry?.wantsWord) entry.wantsWord = null
      continue
    }
    if (e.kind === "arrive") {
      const prev = stage.present[slug] ?? stage.gone[slug]
      delete stage.gone[slug]
      stage.present[slug] = {
        name: e.name, slug,
        aliases: Array.from(new Set([...(prev?.aliases ?? []), ...((e.aliases ?? []).map(slugOf))])).filter(Boolean),
        hp: e.hp ?? prev?.hp ?? null, hpMax: e.hpMax ?? prev?.hpMax ?? null,
        since: prev && stage.present[slug] ? prev.since : now,
        where: prev?.where ?? null, inside: prev?.inside ?? false,
      }
    } else {
      const prev = stage.present[slug] ?? stage.gone[slug]
      delete stage.present[slug]
      stage.gone[slug] = { name: e.name, slug, aliases: prev?.aliases ?? [], hp: e.dead ? 0 : prev?.hp ?? null, hpMax: prev?.hpMax ?? null, since: now, dead: e.dead, cause: e.dead ? (e.cause ?? prev?.cause ?? null) : null, wantsWord: null }
    }
  }
  return stage
}
