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
/**
 * `visitUntil` (Sam, 2026-11-12: "The door open without anyone actually unlocking it"): a gate the STORY opened —
 * Malachar's [GATE: open], or the stage director reading "the gate opens" in his prose — is a drow VISIT. A guard
 * opens it from the bridge, looks, and the drow lock up behind themselves; the drow never leave their slaves' gate
 * standing open. Past `visitUntil` the gate reads as locked again (gateNow). The DM's own button and
 * [FLAG: pen-door-open] carry no visitUntil: those stand open until changed.
 */
export type Gate = { state: GateState; since: string; visitUntil?: string } | null
/** How long a story-opened gate stands open before the drow lock it again. House number. */
export const GATE_VISIT_MS = 60_000
/** The gate as it stands at `nowMs`: a visit that has run out is locked again, from the moment it ran out. Pure. */
export function gateNow(gate: Gate | undefined, nowMs: number = Date.now()): Gate {
  if (!gate) return null
  if (gate.state === "open" && gate.visitUntil && nowMs >= Date.parse(gate.visitUntil)) return { state: "locked", since: gate.visitUntil }
  return gate
}
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
  /** Jorlan's word to a prisoner, held by the game until he keeps it (JorlanPledge). */
  jorlanPledge?: JorlanPledge | null
  updatedAt: string
}

/**
 * JORLAN'S WORD (Sam, 2026-11-12, after Jorlan said "The gate. Next watch change." to Kenta's "yes" and nothing
 * happened: "Jorlan's yes is a real thing that the game holds. You hear it get unlocked. If persuaded he even leaves a
 * dagger."). His offer is the book's (OotA ch.1, Jorlan's gambit); WHEN he keeps it is the game's, not Malachar's:
 * a prisoner's yes is recorded by Malachar's [JORLAN_PLEDGE: <character>] (with "| dagger" when that prisoner won him
 * over), and at the first change of the watch after it with Jorlan on duty the gate is unlocked — shut, the lock off —
 * whatever else is happening. Jorlan dead, or the gate already open, and there is nothing left to keep.
 */
export type JorlanPledge = {
  by: string | null          // the prisoner who said yes, as Malachar named them
  dagger: boolean            // persuaded: he leaves a dagger by the gate too
  since: string
  atRotation: number         // the watch count when he gave it: he keeps it at a LATER change
  keptAt?: string | null
  daggerPlaced?: boolean
}
/** Is a kept pledge's dagger still owed to the floor? (the write that places it is the route's, not this file's) */
export const pledgeDaggerDue = (s: Pick<Stage, "jorlanPledge">) => !!(s.jorlanPledge?.keptAt && s.jorlanPledge.dagger && !s.jorlanPledge.daggerPlaced)
/** Where the dagger is left: on the pen floor just inside the gate (plate 11's own pixels, story.json gate.balcony.inside). */
export const PLEDGE_DAGGER_SPOT = { node: "11", x: 796, y: 912 } as const

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
    area: s.area ?? null, present: s.present ?? {}, gone: s.gone ?? {}, watch: s.watch ?? null, gate: gateNow(s.gate),
    rotations: typeof s.rotations === "number" ? s.rotations : 0, jorlanAt: typeof s.jorlanAt === "number" ? s.jorlanAt : null,
    jorlanPledge: s.jorlanPledge && typeof s.jorlanPledge === "object" ? s.jorlanPledge : null,
    updatedAt: s.updatedAt ?? new Date().toISOString(),
  }
}

/** Jorlan's dagger onto the Underwalk floor by the gate: a catalogue Dagger as a `walk-floor` pile (app/api/walk-items). */
async function leaveDagger(db: SupabaseClient): Promise<boolean> {
  try {
    const { data: item } = await db.from("items").select("id,slug,name,pixel_icon_url").eq("slug", "dagger").maybeSingle()
    if (!item) return false
    const { data } = await db.from("world_flags").select("value").eq("campaign_id", CAMPAIGN).eq("key", "walk-floor").maybeSingle()
    const piles = Array.isArray((data?.value as { piles?: unknown[] } | null)?.piles) ? (data!.value as { piles: unknown[] }).piles : []
    const pile = { id: crypto.randomUUID(), ...PLEDGE_DAGGER_SPOT, itemId: item.id, slug: item.slug, name: item.name, pixel: item.pixel_icon_url ?? null, at: new Date().toISOString() }
    const { error } = await db.from("world_flags").upsert(
      { campaign_id: CAMPAIGN, key: "walk-floor", value: { piles: [...piles, pile] }, set_by: "walk", note: "Jorlan left a dagger by the pen gate" },
      { onConflict: "campaign_id,key" },
    )
    return !error
  } catch { return false }
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
  | { kind: "gate"; state: GateState; visit?: boolean }   // visit: opened by the story, so the drow lock it again (Gate)
  | { kind: "pledge"; by: string | null; dagger: boolean }

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

/** [JORLAN_PLEDGE: <character>] or [JORLAN_PLEDGE: <character> | dagger] — the first in a reply, or null. */
export function pledgeTag(text: string): StageEvent | null {
  const m = /\[JORLAN_PLEDGE:\s*([^\]|]*?)\s*(?:\|\s*([^\]]*?)\s*)?\]/i.exec(text)
  if (!m) return null
  const by = m[1].trim()
  return { kind: "pledge", by: by && !/^(anyone|someone|the party|party)$/i.test(by) ? by : null, dagger: /^(dagger|persuaded|yes|with dagger)$/i.test((m[2] || "").trim()) }
}

/**
 * A DM map's `POST /api/map-stage` body → the stage events it asks for, or the reason it is refused (2026-10-30).
 *
 * Pure, so the vocabulary the DM button speaks is tested in one place and is exactly the vocabulary Malachar's
 * [WATCH:] / [GATE:] tags speak — `watchStateOf` / `gateStateOf`, the same functions. The button and the prose
 * cannot drift apart, and an unrecognised word is refused rather than guessed at, the same way a tag is dropped
 * rather than guessed at.
 */
export function watchWriteEvents(body: unknown): { events: StageEvent[]; error: null } | { events: null; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { events: null, error: "body must be an object" }
  const b = body as { watch?: unknown; gate?: unknown }
  const events: StageEvent[] = []
  if (typeof b.watch === "string") {
    const state = watchStateOf(b.watch)
    if (!state) return { events: null, error: `unknown watch state: ${b.watch}` }
    events.push({ kind: "watch", state })
  }
  if (typeof b.gate === "string") {
    const state = gateStateOf(b.gate)
    if (!state) return { events: null, error: `unknown gate state: ${b.gate}` }
    events.push({ kind: "gate", state })
  }
  if (!events.length) return { events: null, error: "nothing to change: send watch and/or gate" }
  return { events, error: null }
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
    if (pledgeDaggerDue(stage) && await leaveDagger(db)) stage.jorlanPledge!.daggerPlaced = true
    await writeStage(db, stage)
    return { crossed: crossedInside(before, stage) }
  } catch (err) {
    console.error("[stage] apply failed:", err)
    return { crossed: [] }
  }
}

const jorlanDead = (stage: Stage) => Object.values(stage.gone).some((e) => e.dead && /jorlan/i.test(e.name))
/** A change of the watch: is this the one where Jorlan keeps his word? A later rotation than the one he gave it at, him on duty. */
export function keepPledge(stage: Stage, now: string): boolean {
  const p = stage.jorlanPledge
  if (!p || p.keptAt || jorlanDead(stage)) return false
  if ((stage.rotations ?? 0) <= p.atRotation || !jorlanOnDuty(stage)) return false
  p.keptAt = now
  if (stage.gate?.state !== "open") stage.gate = { state: "unlocked", since: now }
  return true
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
        keepPledge(stage, now)
      }
      continue
    }
    if (e.kind === "pledge") {
      const p = stage.jorlanPledge
      if (jorlanDead(stage) || (p && !p.keptAt)) {                 // dead men keep nothing; a second yes is the same word
        if (p && !p.keptAt && e.dagger) p.dagger = true            // ... though he can still be won over to the dagger
        continue
      }
      if (p?.keptAt) continue                                      // one gambit per run: he has already kept it
      stage.jorlanPledge = { by: e.by, dagger: e.dagger, since: now, atRotation: stage.rotations ?? 0, keptAt: null }
      continue
    }
    if (e.kind === "gate") {
      // a gate already open is not "unlocked" again by a later line that only remembers it was left unlocked
      if (!(e.state === "unlocked" && stage.gate?.state === "open") && stage.gate?.state !== e.state) {
        stage.gate = e.state === "open" && e.visit ? { state: e.state, since: now, visitUntil: new Date(Date.parse(now) + GATE_VISIT_MS).toISOString() } : { state: e.state, since: now }
      }
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
