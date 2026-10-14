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
export type Stage = {
  area: string | null
  present: Record<string, StageEntry>   // by slug
  gone: Record<string, StageEntry>      // left or died here, so the map walks them off
  updatedAt: string
}

export const slugOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

const empty = (): Stage => ({ area: null, present: {}, gone: {}, updatedAt: new Date().toISOString() })

export async function readStage(db: SupabaseClient): Promise<Stage> {
  const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", STAGE_FLAG).maybeSingle()
  const v = data?.value
  if (!v || typeof v !== "object" || Array.isArray(v)) return empty()
  const s = v as Partial<Stage>
  return { area: s.area ?? null, present: s.present ?? {}, gone: s.gone ?? {}, updatedAt: s.updatedAt ?? new Date().toISOString() }
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
  | { kind: "leave"; name: string; dead: boolean }
  | { kind: "move"; area: string }
  | { kind: "place"; name: string; where: string }
  | { kind: "wantsWord"; name: string; who: string | null }
  | { kind: "heard"; name: string }

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
    const now = new Date().toISOString()
    for (const e of events) {
      if (e.kind === "move") {
        // A new area: the story places its own cast there, and Malachar's tags fill in the rest.
        if (stage.area && stage.area.toLowerCase() !== e.area.toLowerCase()) { stage.present = {}; stage.gone = {} }
        stage.area = e.area
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
        stage.gone[slug] = { name: e.name, slug, aliases: prev?.aliases ?? [], hp: e.dead ? 0 : prev?.hp ?? null, hpMax: prev?.hpMax ?? null, since: now, dead: e.dead, wantsWord: null }
      }
    }
    await writeStage(db, stage)
    return { crossed: crossedInside(before, stage) }
  } catch (err) {
    console.error("[stage] apply failed:", err)
    return { crossed: [] }
  }
}
