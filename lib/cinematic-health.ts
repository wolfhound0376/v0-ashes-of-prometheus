// lib/cinematic-health.ts — what the request log says about each film, for the DM's Cinematics tab.
//
// Sam (2026-11-10): "have a better way to add them." Adding a film is only half of it; the other half is
// being able to SEE what the films are doing — which fired, for whom, what was asked for and is not shot
// yet. cinematic_requests already records every ask (it is how the road film in the slave pen was found);
// this turns those rows into the three things the tab shows. Pure: no fetch, no DOM.

import PLATES from "@/lib/walk-plates.json"

export const FIRED_BY = ["malachar", "engine", "map", "look", "system", "dm"] as const
export type FiredBy = (typeof FIRED_BY)[number]

/** What each door means, in the words the tab shows. */
export const FIRED_BY_LABEL: Record<FiredBy, string> = {
  malachar: "Malachar names it in his narration",
  engine: "The rules fire it when a check resolves",
  map: "The Underwalk fires it after its own roll",
  look: "A player looks around",
  system: "The game plays it (hero intro)",
  dm: "Only the DM, by hand",
}

export function isFiredBy(v: unknown): v is FiredBy {
  return typeof v === "string" && (FIRED_BY as readonly string[]).includes(v)
}

/** Every Underwalk plate a film can be pinned to: the slug party_situation.sub_location carries, and its name. */
export const PLATE_OPTIONS: { slug: string; name: string }[] = Object.values(
  PLATES as Record<string, { slug?: string | null; name?: string | null }>,
)
  .filter((p): p is { slug: string; name?: string | null } => !!p && typeof p.slug === "string" && !!p.slug)
  .map((p) => ({ slug: p.slug, name: p.name || p.slug }))
  .filter((p, i, all) => all.findIndex((q) => q.slug === p.slug) === i)
  .sort((a, b) => a.name.localeCompare(b.name))

export function isPlate(v: unknown): v is string {
  return typeof v === "string" && PLATE_OPTIONS.some((p) => p.slug === v)
}

export type RequestRow = {
  req_location: string | null
  req_state: string | null
  req_kind: string | null
  resolution: string | null
  resolved_clip_id: string | null
  character_id: string | null
  created_at: string
}

export type ClipUse = { served: number; last: string; to: string[] }
export type Miss = { location: string; state: string | null; kind: string; asked: number; last: string }
export type Health = { byClip: Record<string, ClipUse>; misses: Miss[] }

type FilmedClip = { location: string; state: string | null; kind: string; video_url: string | null }

/**
 * byClip — for every film that was actually served: how often, when last, and to which heroes.
 * misses — asks that found no film and STILL have none: the shooting list, most-asked first.
 *          An ask that has since been filmed drops off; an ask with no location is noise and is skipped.
 */
export function summarizeRequests(
  rows: ReadonlyArray<RequestRow>,
  names: Readonly<Record<string, string>>,
  clips: ReadonlyArray<FilmedClip>,
): Health {
  const byClip: Record<string, ClipUse> = {}
  const missMap = new Map<string, Miss>()
  const filmed = new Set(clips.filter((c) => !!c.video_url).map((c) => `${c.location}|${c.state ?? ""}|${c.kind}`))
  for (const r of rows) {
    if (r.resolved_clip_id) {
      const u = (byClip[r.resolved_clip_id] ??= { served: 0, last: r.created_at, to: [] })
      u.served += 1
      if (r.created_at > u.last) u.last = r.created_at
      const who = r.character_id ? names[r.character_id] || "an unknown hero" : "an unseated window"
      if (!u.to.includes(who)) u.to.push(who)
      continue
    }
    if (r.resolution !== "miss" || !r.req_location) continue
    const kind = r.req_kind || "environment"
    const key = `${r.req_location}|${r.req_state ?? ""}|${kind}`
    if (filmed.has(key)) continue
    const m = missMap.get(key)
    if (m) { m.asked += 1; if (r.created_at > m.last) m.last = r.created_at }
    else missMap.set(key, { location: r.req_location, state: r.req_state, kind, asked: 1, last: r.created_at })
  }
  const misses = [...missMap.values()].sort((a, b) => b.asked - a.asked || (a.last < b.last ? 1 : -1))
  return { byClip, misses }
}

/**
 * A film whose FILE is named for a hero but whose row is not bound to anyone — how Gandalf came to be served
 * Velkynvelve_Fifi_StealthFail.mp4. Returns that hero's name, or null. Matches a hero's first name as a whole
 * word in the file name; a bound row never warns.
 */
export function heroNamedButUnbound(
  clip: { video_url: string | null; character_id: string | null },
  heroes: ReadonlyArray<{ name: string }>,
): string | null {
  if (!clip.video_url || clip.character_id) return null
  const file = (clip.video_url.split("/").pop() || "").toLowerCase()
  const words = file.split(/[^a-z]+/).filter(Boolean)
  for (const h of heroes) {
    const first = (h.name || "").trim().split(/\s+/)[0]?.toLowerCase()
    if (first && first.length >= 3 && words.includes(first)) return h.name
  }
  return null
}

/** What stops a film doing its job, in the order the DM should fix it. Empty = healthy. */
export function clipWarnings(
  clip: { video_url: string | null; character_id: string | null; moment: string | null; retired: boolean; fired_by: string },
  heroes: ReadonlyArray<{ name: string }>,
): string[] {
  if (clip.retired) return []
  const out: string[] = []
  if (!clip.video_url) out.push("Awaiting film")
  if (!(clip.moment || "").trim()) out.push(clip.fired_by === "malachar" ? "No moment: Malachar is guessing from the name" : "No moment written")
  const hero = heroNamedButUnbound(clip, heroes)
  if (hero) out.push(`File is named for ${hero} but anyone can be shown it`)
  return out
}
