/**
 * Server-only downtime time-tracking + story-advancement pacing.
 *
 * The database owns ALL the math. Three tables + a trigger (apply_time_log)
 * created in Supabase directly:
 *   - time_advancement_rules : event_type -> minutes_advanced default
 *   - time_log               : append-only event log; the trigger fills in
 *                              minutes and updates game_clock on every insert
 *   - game_clock             : one row per session with the running day,
 *                              minutes_of_day, exchanges_since_advance and the
 *                              advance_threshold
 *
 * This module NEVER computes elapsed time or mutates game_clock. It only:
 *   - reads game_clock for a session (for the prompt + DM display)
 *   - inserts rows into time_log (the trigger does the rest)
 *   - derives player-safe / DM-only descriptors from the clock
 *   - parses the inline time tags Malachar emits in his prose
 *   - after the clock moves, hands the new time to anything that keeps a
 *     deadline on it (lib/gas-spore-clock: poisoned at halfway, dead at the end)
 *
 * All callers MUST use a service-role client: the three tables have RLS enabled
 * with no policies, so the anon key can neither read nor write them.
 */

import { advanceGasSporeInfections } from "./gas-spore-clock"

// The event types the app logs. Every one except `cinematic_cut` is expected to
// have a matching row in time_advancement_rules, so the trigger can fill in
// minutes_advanced automatically. `cinematic_cut` is open-ended, so it MUST
// carry an explicit minutes value or the trigger rejects it.
export const TIME_EVENT_TYPES = [
  "dialogue_exchange",
  "combat_encounter",
  "short_rest",
  "long_rest",
  "labor_shift",
  "cinematic_cut",
  "story_advance",
  // The camp module (lib/camp.ts §13). No rule rows: they are logged at zero
  // minutes so time_log can say whether the party is camping.
  "make_camp",
  "break_camp",
  // Earned proficiency (lib/camp.ts §17): hours of instruction at camp. No
  // rule row — the minutes are the hours banked, passed explicitly.
  "training",
] as const

/** Event types that take no time and are logged with an explicit 0. */
export const ZERO_MINUTE_EVENTS: ReadonlySet<TimeEventType> = new Set<TimeEventType>(["make_camp", "break_camp"])

export type TimeEventType = (typeof TIME_EVENT_TYPES)[number]

/** Event types that require an explicit minutes_advanced value on insert. */
export const MINUTES_REQUIRED: ReadonlySet<TimeEventType> = new Set<TimeEventType>(["cinematic_cut", "training"])

/** A hidden roll recorded against a story-advancement event. Never shown to players. */
export interface HiddenRoll {
  die: string
  result: number
  purpose: string
  source: string
}

export interface TimeEventInput {
  eventType: TimeEventType
  /** Required for cinematic_cut; ignored for rule-backed events. */
  minutesAdvanced?: number
  /** Only meaningful for story_advance. */
  hiddenRoll?: HiddenRoll
}

/** Normalized game_clock snapshot the rest of the app consumes. */
export interface GameClock {
  day: number
  minutesOfDay: number
  exchangesSinceAdvance: number
  advanceThreshold: number
}

const DEFAULT_ADVANCE_THRESHOLD = 6

/** First defined numeric value among candidate keys, else fallback. */
function pickNumber(row: Record<string, unknown>, keys: string[], fallback: number): number {
  for (const k of keys) {
    const v = row[k]
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v)
  }
  return fallback
}

/**
 * Read the game_clock row for a session and normalize it. Column names are
 * resolved defensively (the table was created outside this repo) so a rename
 * of e.g. `day` -> `game_day` does not silently break the read.
 *
 * Returns null when there is no session or no clock row yet.
 */
export async function readGameClock(admin: any, sessionId: string | null): Promise<GameClock | null> {
  if (!admin || !sessionId) return null
  try {
    const { data, error } = await admin.from("game_clock").select("*").eq("session_id", sessionId).maybeSingle()
    if (error) {
      console.error("[time] readGameClock failed:", error.message)
      return null
    }
    if (!data) return null
    const row = data as Record<string, unknown>
    return {
      day: pickNumber(row, ["day", "game_day", "current_day", "day_number"], 1),
      minutesOfDay: pickNumber(row, ["minutes_of_day", "minute_of_day", "day_minutes"], 0),
      exchangesSinceAdvance: pickNumber(
        row,
        ["exchanges_since_advance", "exchange_since_advance", "exchanges"],
        0,
      ),
      advanceThreshold: pickNumber(row, ["advance_threshold", "advancement_threshold"], DEFAULT_ADVANCE_THRESHOLD),
    }
  } catch (e) {
    console.error("[time] readGameClock threw:", e)
    return null
  }
}

/**
 * Insert one row into time_log. The apply_time_log trigger fills in minutes and
 * updates game_clock. Best-effort: a logging failure never breaks the turn.
 */
export async function logTimeEvent(admin: any, sessionId: string | null, event: TimeEventInput): Promise<void> {
  if (!admin || !sessionId) return
  if (MINUTES_REQUIRED.has(event.eventType) && typeof event.minutesAdvanced !== "number") {
    console.warn(`[time] skipped ${event.eventType}: requires an explicit minutes_advanced value`)
    return
  }
  const payload: Record<string, unknown> = { session_id: sessionId, event_type: event.eventType }
  if (typeof event.minutesAdvanced === "number") payload.minutes_advanced = Math.max(0, Math.round(event.minutesAdvanced))
  if (event.hiddenRoll) payload.hidden_roll = event.hiddenRoll
  try {
    const { error } = await admin.from("time_log").insert(payload)
    if (error) {
      console.error(`[time] logTimeEvent(${event.eventType}) failed:`, error.message)
      return
    }
    // The clock just moved. Read where the trigger put it and let the
    // deadlines that ride on it catch up — every path that advances time
    // comes through here, so nothing that keeps time can be skipped by one.
    const clock = await readGameClock(admin, sessionId)
    if (clock) await advanceGasSporeInfections(admin, { day: clock.day, minutesOfDay: clock.minutesOfDay })
  } catch (e) {
    console.error(`[time] logTimeEvent(${event.eventType}) threw:`, e)
  }
}

// ============================================================================
// DESCRIPTORS
// ============================================================================

/**
 * Player-safe, deliberately vague time-of-day label derived ONLY from the
 * clock. Buckets per spec: 0–359 night, 360–719 morning, 720–1079 afternoon,
 * 1080–1439 evening. Capitalized to match the existing environment labels.
 */
export function describeTimeOfDay(minutesOfDay: number): "Night" | "Morning" | "Afternoon" | "Evening" {
  const m = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440
  if (m < 360) return "Night"
  if (m < 720) return "Morning"
  if (m < 1080) return "Afternoon"
  return "Evening"
}

/** DM-only 24h clock string (HH:MM) from minutes-of-day. */
export function formatClockTime(minutesOfDay: number): string {
  const m = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`
}

// ============================================================================
// PACING
// ============================================================================

/** The verbatim directive appended to Malachar's prompt when pacing stalls. */
export const PACING_DIRECTIVE = `PACING: The conversation has stalled. This turn you MUST advance the story with a concrete event — a guard rotation, a summons from Ilvara, a meal, a labor-shift call, an interruption — not more idle chat. Ground events in the book: Velkynvelve prisoners work a third of the day in quaggoth-supervised groups. If a rule or table exists, use it; if the book is silent, improvise openly as homebrew. If an outcome is uncertain, resolve it with a real hidden roll against a real DC or table — never an invented one. Do not reveal the roll or the clock to players; in narration time stays vague ("the torches burn lower"). Remember: short rest = 1+ hour, long rest = 8+ hours, one long rest per 24 hours, and failed escape attempts can only be retried after a long rest — the clock is what makes that enforceable.`

/**
 * Build the block injected into Malachar's system prompt describing the current
 * clock (day + vague time + exchange counter) and, when the pacing threshold is
 * reached, the tag protocol he uses to log time and the mandatory advance
 * directive. Returns an empty string when there is no clock (feature dormant).
 */
export function buildPacingBlock(clock: GameClock | null): string {
  if (!clock) return ""
  const stalled = clock.exchangesSinceAdvance >= clock.advanceThreshold
  const timeOfDay = describeTimeOfDay(clock.minutesOfDay)

  const header = `════════════════════════════════════════════════════════════════════
WORLD CLOCK & PACING (never reveal numbers or rolls to players)
════════════════════════════════════════════════════════════════════
It is Day ${clock.day}, ${timeOfDay.toLowerCase()} in the Underdark. ${clock.exchangesSinceAdvance} exchange(s) have passed since the story last moved forward (the world grows restless at ${clock.advanceThreshold}).

TIME TAGS — emit these inline in your prose; the system strips them before the
players ever see them, and the database advances the clock:
- [TIME:short_rest|spend=Kenta:1,Samson:max] — the party takes a short rest (1+ hour).
  spend= lists each character who chooses to spend Hit Dice and how many, or
  "max" to heal as far as their dice allow; a character you do not name spends
  none, so carry exactly what the players said. Add |song=<bard name> if a bard
  performs Song of Rest, or |song=none to skip it. The system rolls the dice
  and applies hit points, Hit Dice and warlock pact slots — never invent those
  totals in your prose.
- [TIME:long_rest] — the party takes a long rest (8+ hours; only one per 24h)
- [TIME:make_camp] — the party stops to camp: each character gets camp actions
  and the rations decide which rest they can afford (see CAMP if present). End
  the camp with a rest tag, or [TIME:break_camp] if they pack up without one.
- [TIME:combat_encounter] — a fight has just concluded
- [TIME:labor_shift] — a Velkynvelve forced-labor shift passes
- [TIME:cinematic_cut|minutes=NN] — you deliberately skip ahead; NN is required
When you advance the story with a concrete event, emit:
- [STORY_ADVANCE] — resets the pacing counter
  If a hidden roll decided the outcome, record it:
  [STORY_ADVANCE|die=d20|result=14|purpose=guard rotation vs DC 12|source=homebrew]
Keep every tag on its own, never inside dialogue, and NEVER describe the tag,
the clock, or the roll in the visible narration.`

  return stalled ? `${header}\n\n${PACING_DIRECTIVE}` : header
}

// ============================================================================
// TAG PARSING
// ============================================================================

// Matches [TIME:event], [TIME:cinematic_cut|minutes=90] or
// [TIME:short_rest|spend=Kenta:1,Samson:max|song=Scott]. Group 2 is the whole
// `|key=value|...` body; `parseTagArgs` splits it.
const TIME_TAG_RE = /\[TIME:\s*([a-z_]+)\s*((?:\|[^\]]*)?)\]/gi
// Matches [STORY_ADVANCE] or [STORY_ADVANCE|die=d20|result=14|purpose=...|source=...]
const STORY_ADVANCE_RE = /\[STORY_ADVANCE\s*((?:\|[^\]]*)?)\]/gi

/** Regexes used to strip the time tags from any player-facing text. */
export const TIME_TAG_STRIP_PATTERNS: RegExp[] = [
  /\[TIME:[^\]]*\]/gi,
  /\[STORY_ADVANCE[^\]]*\]/gi,
]

/** Remove all time tags from a string (for player-facing text and TTS). */
export function stripTimeTags(text: string): string {
  let out = text
  for (const re of TIME_TAG_STRIP_PATTERNS) out = out.replace(re, "")
  return out
}

/** `|die=d20|result=14|purpose=...` → `{ die: "d20", result: "14", purpose: "..." }`. Keys are lower-cased. */
function parseTagArgs(body: string): Record<string, string> {
  const kv: Record<string, string> = {}
  for (const part of body.split("|").map((p) => p.trim()).filter(Boolean)) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const value = part.slice(eq + 1).trim()
    if (key) kv[key] = value
  }
  return kv
}

function parseHiddenRoll(body: string): HiddenRoll | undefined {
  // body looks like: |die=d20|result=14|purpose=guard rotation|source=homebrew
  const kv = parseTagArgs(body)
  if (Object.keys(kv).length === 0) return undefined
  const result = Number(kv.result)
  if (!kv.die || !Number.isFinite(result)) return undefined
  return {
    die: kv.die,
    result,
    purpose: kv.purpose || "unspecified",
    source: kv.source || "homebrew",
  }
}

// ============================================================================
// SHORT REST ARGUMENTS
// ============================================================================
//
// Spending Hit Dice is a player's choice (SRD 5.1, Resting: "A character can
// spend one or more Hit Dice at the end of a short rest"), so the route never
// decides it. Malachar carries what the players said into the tag:
//
//   [TIME:short_rest|spend=Kenta:1,Samson:max|song=Scott]
//
// `spend` names each character and a count, or `max` for "as many as it takes
// to reach full hit points". A character not named spends nothing. `song`
// names the bard who performs Song of Rest; `song=none` means no bard sings.
// With no `song` argument, the route lets a bard in the party sing.

export interface ShortRestArgs {
  /** Character name (as written) → dice to spend, or "max". */
  spend: Record<string, number | "max">
  /** Bard's name, `null` when the tag said `song=none`, `undefined` when it said nothing. */
  song: string | null | undefined
}

const SHORT_REST_TAG_RE = /\[TIME:\s*short_rest\s*((?:\|[^\]]*)?)\]/i

/** The `spend=` and `song=` arguments of the first [TIME:short_rest] tag, or null when there is no such tag. */
export function parseShortRestArgs(rawText: string): ShortRestArgs | null {
  const m = SHORT_REST_TAG_RE.exec(rawText)
  if (!m) return null
  const kv = parseTagArgs(m[1] || "")
  const spend: Record<string, number | "max"> = {}
  for (const entry of (kv.spend ?? "").split(",").map((e) => e.trim()).filter(Boolean)) {
    const colon = entry.lastIndexOf(":")
    if (colon === -1) continue
    const name = entry.slice(0, colon).trim()
    const raw = entry.slice(colon + 1).trim().toLowerCase()
    if (!name) continue
    if (raw === "max" || raw === "all") spend[name] = "max"
    else if (/^\d+$/.test(raw)) spend[name] = Number(raw)
    else console.warn(`[time] ignoring short_rest spend "${entry}" — not a number or max`)
  }
  const songRaw = kv.song?.trim()
  const song = songRaw == null || songRaw === "" ? undefined : /^(none|no|nobody)$/i.test(songRaw) ? null : songRaw
  return { spend, song }
}

/**
 * Parse the time tags Malachar emitted this turn into a list of log inserts.
 * Deduplicates trivially repeated tags; caps at a sane number so a runaway
 * response cannot spam the clock.
 */
export function parseTimeEvents(rawText: string): TimeEventInput[] {
  const events: TimeEventInput[] = []

  for (const m of rawText.matchAll(TIME_TAG_RE)) {
    const type = (m[1] || "").toLowerCase() as TimeEventType
    if (!TIME_EVENT_TYPES.includes(type)) {
      console.warn(`[time] ignoring unknown [TIME:${m[1]}] tag`)
      continue
    }
    if (type === "story_advance" || type === "dialogue_exchange") continue // handled elsewhere
    if (type === "cinematic_cut") {
      const minutes = Number(parseTagArgs(m[2] || "").minutes ?? NaN)
      if (!Number.isFinite(minutes)) {
        console.warn("[time] ignoring [TIME:cinematic_cut] without a minutes value")
        continue
      }
      events.push({ eventType: "cinematic_cut", minutesAdvanced: minutes })
    } else if (ZERO_MINUTE_EVENTS.has(type)) {
      events.push({ eventType: type, minutesAdvanced: 0 })
    } else {
      events.push({ eventType: type })
    }
    if (events.length >= 8) break
  }

  for (const m of rawText.matchAll(STORY_ADVANCE_RE)) {
    events.push({ eventType: "story_advance", hiddenRoll: parseHiddenRoll(m[1] || "") })
    break // one story advance per turn resets the counter; ignore extras
  }

  return events
}
