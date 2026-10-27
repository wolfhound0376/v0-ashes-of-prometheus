// ONE WORLD — the Underwalk's shared state (Sam, 2026-10-25: Fifi on Stephanie's browser and Gandalf on Sam's
// computer "were not synced well"; "create a failsafe way to prevent this from ever happening again").
//
// WHAT WENT WRONG. Until this file the painted map kept the whole world in each browser tab (sessionStorage
// `aop_walk_state`): which plate the party is on, where every hero stands, the pen gate, who has been talked to,
// the room dice ("25% chance of 1d4 drow in the hall"). The seat list, Malachar's cast, NPC chatter and floor
// items were shared; the world was not. Two players at the table were walking two different Velkynvelves. On
// 2026-10-25 the session went live at 21:26 and the server heard nothing from the map after 21:26:33.
//
// THE RULE NOW. The server holds the one true copy (table `walk_world`, one row per campaign run) and every
// browser is a window onto it:
//   - each hero has exactly ONE driver at a time — the player who owns it while they are connected; otherwise
//     the DM's map; otherwise the connected player in the lowest seat. Only the driver (or the DM giving an
//     order) publishes that hero's moves; everyone else walks it along the same route.
//   - a plate change is a world event: whoever leads the party out, every screen follows.
//   - the `state` object (gate, door, talked, cleared, room rolls, …) is merged key by key on the server.
//   - THE FAILSAFE: every browser sends a fingerprint of {plate, state} with a heartbeat. If it disagrees with
//     the server's twice running while it has nothing unsent, the browser throws its copy away and snaps to
//     the server's. A light on every screen shows it: in step / catching up / out of touch. Drift can be
//     corrected; it can no longer be silent.
//
// This file is the single source for the rules both sides apply. It is bundled for the static page as
// public/js/aop-one-world.js (scripts/build-one-world-js.mjs) and lib/one-world-bundle-sync.test.ts fails if the
// bundle is stale — so the browser and the server can never fingerprint the same world differently.
//
// Pure: no Next, no Supabase, no DOM.

/** A heartbeat older than this means the seat is not connected. Heartbeats go every 2.5 s. */
export const ONLINE_MS = 12000

/** How many heartbeats in a row may disagree with the server before the browser snaps to it. */
export const MISSES_BEFORE_RESYNC = 2

/** Upper bounds on what one browser may write, so a bug can never flood the row. */
export const LIMITS = { stateBytes: 64000, heroesPerPatch: 12, coord: 4000 }

export type Hero = {
  x: number
  y: number
  /** where the hero is walking to (= x,y when standing) */
  tx: number
  ty: number
  face: number
  plate: PlateId
  /** per-hero order counter: a write with a lower seq than the stored one is stale and dropped */
  seq: number
  /** the client that sent it ("dm" or a characters.id) */
  by: string
  /** the hero's owner (characters.id), when it has one */
  cid: string | null
  /** Hard Labor's work pose while the driver's screen plays it ("carry" | "scrub"); absent when the hero is not working */
  pose?: HeroPose
}

/** The work poses other screens are told about (Sam, 2026-10-27: "no work animations"). Anything else is dropped. */
export const HERO_POSES = ["carry", "scrub"] as const
export type HeroPose = (typeof HERO_POSES)[number]

/**
 * A plate's key in the walk SPEC: "10", "10b", "5c", "3k", "tunnels"… Text, because plates are not all numbers.
 * Until 2026-10-27 this was an integer and every letter plate was refused whole ("bad plate"): Sam climbed the
 * ladder 10 -> 10b, the write bounced, and the next heartbeat pulled him back to 10 ("The party has moved on").
 */
export type PlateId = string

/**
 * `cut`: the crossing is played as a walk out through `zone` and then ONE fade-cut to `to` (a work detail leaving the
 * pen, Sam 2026-10-26), not the walk-and-slide onto a neighbouring plate. Screens that follow play it the same way.
 */
export type Travel = { seq: number; from: PlateId; to: PlateId; zone: number; by: string; at: number; cut?: boolean }

export type Seat = {
  at: number
  slug: string | null
  cid: string | null
  dm: boolean
  seat: number | null
  digest: string
  version: number
  status: SyncStatus
}

export type SyncStatus = "in-step" | "catching-up" | "out-of-touch" | "fight-unshared"

export type WorldRow = {
  campaign_run_id: string
  version: number
  plate: PlateId | null
  state: Record<string, unknown>
  heroes: Record<string, Hero>
  travel: Travel | null
  seats: Record<string, Seat>
  updated_by?: string | null
  updated_at?: string | null
}

export type Patch = {
  state?: Record<string, unknown>
  heroes?: Record<string, Hero>
  plate?: PlateId
  travel?: Travel
}

// ---------- plate ids ----------

const PLATE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/

/**
 * A plate id as the shared world stores it (a string), or null when it is not one. Accepts the page's numbers (10)
 * and its strings ("10", "10b", "tunnels"), so 10 and "10" are the same plate. Case is folded ("10B" is "10b").
 */
export function plateId(v: unknown): PlateId | null {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 && v <= 999 ? String(v) : null
  if (typeof v !== "string") return null
  const s = v.trim().toLowerCase()
  return PLATE_ID.test(s) ? s : null
}

/** Are these the same plate? 10 and "10" are; null is never the same as anything. */
export function samePlate(a: unknown, b: unknown): boolean {
  const x = plateId(a)
  return x !== null && x === plateId(b)
}

// ---------- fingerprint ----------

/**
 * Deterministic JSON: object keys sorted at every depth, `undefined` dropped (as JSON.stringify drops it),
 * non-finite numbers as null. Two copies of the same world produce the same string whatever order their
 * keys were written in — which is the whole point: Postgres jsonb does not keep key order.
 */
export function canon(v: unknown): string {
  if (v === null || v === undefined) return "null"
  if (typeof v === "number") return Number.isFinite(v) ? JSON.stringify(v) : "null"
  if (typeof v === "string" || typeof v === "boolean") return JSON.stringify(v)
  if (Array.isArray(v)) return "[" + v.map((x) => (x === undefined || typeof x === "function" ? "null" : canon(x))).join(",") + "]"
  if (typeof v === "object") {
    const o = v as Record<string, unknown>
    const keys = Object.keys(o).filter((k) => o[k] !== undefined && typeof o[k] !== "function").sort()
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canon(o[k])).join(",") + "}"
  }
  return "null"
}

/** FNV-1a, 32-bit, over UTF-16 code units, as 8 hex digits. Not cryptographic; a fingerprint. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}

/**
 * What the heartbeat compares: the plate and the shared state. Positions are not in it — they move.
 * The plate is normalised first, so a page holding 10 and a server row holding "10" agree. A numeric plate digests
 * as the number it always did (so digests from before plates became text still match); a letter plate as its string.
 */
export function worldDigest(plate: PlateId | number | null | undefined, state: Record<string, unknown> | null | undefined): string {
  const id = plateId(plate)
  const p = id === null ? null : /^\d+$/.test(id) ? Number(id) : id
  return fingerprint(canon({ plate: p, state: state ?? {} }))
}

// ---------- seeded dice ----------

/** A seeded 0..1 generator (mulberry32). Same seed, same numbers, on every screen. */
export function seededRandom(seed: string): () => number {
  let a = parseInt(fingerprint(seed), 16) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Roll a dice expression ("1d4", "2d6+1", "1d20-2") from a seed. A room's dice are seeded by run + plate + roll
 * name, so every screen in the same run finds the same drow in the same hall — even before the server answers.
 */
export function seededRoll(expr: string, seed: string): number {
  const rnd = seededRandom(seed)
  let total = 0
  for (const term of String(expr).replace(/\s+/g, "").match(/[+-]?[^+-]+/g) || []) {
    const sign = term[0] === "-" ? -1 : 1
    const t = term.replace(/^[+-]/, "")
    const m = t.match(/^(\d*)d(\d+)$/)
    if (m) {
      const n = +m[1] || 1
      for (let i = 0; i < n; i++) total += sign * (1 + Math.floor(rnd() * +m[2]))
    } else total += sign * (+t || 0)
  }
  return Math.max(0, total)
}

// ---------- who drives whom ----------

export function isOnline(seat: Seat | undefined | null, now: number): boolean {
  return !!seat && typeof seat.at === "number" && now - seat.at <= ONLINE_MS
}

/**
 * The one client that drives a hero right now (its key in `seats`), or null when nobody is connected:
 *   1. its owner, while their browser is connected;
 *   2. else the DM's map, while it is open;
 *   3. else the connected player in the lowest seat (so an empty chair's hero does not wander differently
 *      on every screen).
 */
export function driverOf(ownerCid: string | null | undefined, seats: Record<string, Seat> | null | undefined, now: number): string | null {
  const s = seats || {}
  if (ownerCid && isOnline(s[ownerCid], now)) return ownerCid
  if (isOnline(s.dm, now)) return "dm"
  let best: string | null = null
  let bestSeat = Infinity
  for (const k of Object.keys(s).sort()) {
    if (k === "dm" || !isOnline(s[k], now)) continue
    const n = typeof s[k].seat === "number" ? (s[k].seat as number) : 99
    if (n < bestSeat) { bestSeat = n; best = k }
  }
  return best
}

/** May this client write this hero? The DM may move anyone; a player only what they drive. */
export function mayWriteHero(hero: Pick<Hero, "cid">, caller: string, callerIsDm: boolean, seats: Record<string, Seat> | null | undefined, now: number): boolean {
  if (callerIsDm) return true
  if (hero.cid && hero.cid === caller) return true
  return driverOf(hero.cid, seats, now) === caller
}

// ---------- heartbeat verdict ----------

export type Verdict = { status: SyncStatus; resync: boolean; misses: number }

/**
 * What a heartbeat answer means for the browser. Agreement = in step. A disagreement while the browser still
 * has unsent changes, or is mid-walk between plates, is expected and waits. Otherwise each disagreement counts;
 * at MISSES_BEFORE_RESYNC the browser must snap to the server.
 */
export function heartbeatVerdict(
  local: { digest: string; dirty: boolean; travelling: boolean },
  server: { digest: string },
  misses: number,
): Verdict {
  if (local.digest === server.digest) return { status: "in-step", resync: false, misses: 0 }
  if (local.dirty || local.travelling) return { status: "catching-up", resync: false, misses }
  const m = misses + 1
  if (m >= MISSES_BEFORE_RESYNC) return { status: "catching-up", resync: true, misses: 0 }
  return { status: "catching-up", resync: false, misses: m }
}

// ---------- patch hygiene (server side) ----------

const SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/
const num = (v: unknown, lim = LIMITS.coord): number | null => (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim ? v : null)
const int = (v: unknown, lo: number, hi: number): number | null => (typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi ? v : null)

/**
 * Check and normalise what a browser sent. Anything malformed is refused whole — a half-applied patch is how
 * two screens drift. Returns the clean patch, or an error naming the first problem.
 */
export function cleanPatch(raw: unknown, by: string): { patch: Patch } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "patch must be an object" }
  const r = raw as Record<string, unknown>
  const out: Patch = {}
  if (r.state !== undefined) {
    if (!r.state || typeof r.state !== "object" || Array.isArray(r.state)) return { error: "state must be an object" }
    let size = 0
    try { size = JSON.stringify(r.state).length } catch { return { error: "state is not JSON" } }
    if (size > LIMITS.stateBytes) return { error: "state too large" }
    out.state = JSON.parse(JSON.stringify(r.state)) as Record<string, unknown>
  }
  if (r.plate !== undefined) {
    const p = plateId(r.plate)
    if (p === null) return { error: "bad plate" }
    out.plate = p
  }
  if (r.travel !== undefined) {
    const t = r.travel as Record<string, unknown>
    const seq = num(t?.seq, Number.MAX_SAFE_INTEGER), from = plateId(t?.from), to = plateId(t?.to), zone = int(t?.zone, -1, 999)
    if (!t || seq === null || from === null || to === null || zone === null) return { error: "bad travel" }
    out.travel = { seq, from, to, zone, by, at: Date.now() }
    if (t.cut === true) out.travel.cut = true
  }
  if (r.heroes !== undefined) {
    if (!r.heroes || typeof r.heroes !== "object" || Array.isArray(r.heroes)) return { error: "heroes must be an object" }
    const entries = Object.entries(r.heroes as Record<string, unknown>)
    if (entries.length > LIMITS.heroesPerPatch) return { error: "too many heroes" }
    const heroes: Record<string, Hero> = {}
    for (const [slug, v] of entries) {
      if (!SLUG.test(slug)) return { error: `bad hero ${slug}` }
      const h = v as Record<string, unknown>
      const x = num(h?.x), y = num(h?.y), tx = num(h?.tx), ty = num(h?.ty)
      const face = int(h?.face, 0, 7), plate = plateId(h?.plate), seq = num(h?.seq, Number.MAX_SAFE_INTEGER)
      if (x === null || y === null || tx === null || ty === null || face === null || plate === null || seq === null) return { error: `bad hero ${slug}` }
      const cid = typeof h.cid === "string" && h.cid.length <= 64 ? h.cid : null
      const hero: Hero = { x, y, tx, ty, face, plate, seq, by, cid }
      if ((HERO_POSES as readonly unknown[]).includes(h.pose)) hero.pose = h.pose as HeroPose
      heroes[slug] = hero
    }
    out.heroes = heroes
  }
  if (!out.state && !out.heroes && out.plate === undefined && !out.travel) return { error: "nothing to change" }
  return { patch: out }
}

/** The world a run starts with: the pen, gate locked, nobody placed yet. */
export function emptyWorld(runId: string): WorldRow {
  return { campaign_run_id: runId, version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
}
