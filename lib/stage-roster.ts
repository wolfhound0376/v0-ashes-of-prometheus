// The stage roster: who is physically in the area with the party, as Malachar has narrated it.
//
// Narration and the map must agree (Sam, 2026-10-12), and `npc_encounters.is_active` cannot carry
// that: it is the NPC panel's spotlight, and the chat route switches every other row off whenever a
// turn involves someone else (the "focus" rule), so a gray ooze Malachar brought in went inactive the
// moment the party spoke to Jimjar, and the map took it for gone. This roster is written only from
// Malachar's own tags — [NPC_ENCOUNTER:] brings someone on, [NPC_LEAVE:] and death take them off,
// [UPDATE_LOCATION:] clears the area — and nothing about the panel touches it. It rides world_flags
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

/** Apply a turn's events in order, in one read and one write. Best-effort: never throws. */
export async function applyStageEvents(db: SupabaseClient | null, events: StageEvent[]) {
  if (!db || !events.length) return
  try {
    const stage = await readStage(db)
    const now = new Date().toISOString()
    for (const e of events) {
      if (e.kind === "move") {
        // A new area: the story places its own cast there, and Malachar's tags fill in the rest.
        if (stage.area && stage.area.toLowerCase() !== e.area.toLowerCase()) { stage.present = {}; stage.gone = {} }
        stage.area = e.area
        continue
      }
      const slug = slugOf(e.name)
      if (e.kind === "arrive") {
        const prev = stage.present[slug] ?? stage.gone[slug]
        delete stage.gone[slug]
        stage.present[slug] = {
          name: e.name, slug,
          aliases: Array.from(new Set([...(prev?.aliases ?? []), ...((e.aliases ?? []).map(slugOf))])).filter(Boolean),
          hp: e.hp ?? prev?.hp ?? null, hpMax: e.hpMax ?? prev?.hpMax ?? null,
          since: prev && stage.present[slug] ? prev.since : now,
        }
      } else {
        const prev = stage.present[slug] ?? stage.gone[slug]
        delete stage.present[slug]
        stage.gone[slug] = { name: e.name, slug, aliases: prev?.aliases ?? [], hp: e.dead ? 0 : prev?.hp ?? null, hpMax: prev?.hpMax ?? null, since: now, dead: e.dead }
      }
    }
    await writeStage(db, stage)
  } catch (err) {
    console.error("[stage] apply failed:", err)
  }
}
