// lib/situation.ts — the party's situation: where they are and what state they are in.
//
// Pure. No Supabase, no THREE. The row lives in `party_situation` (one per campaign run); the route
// `/api/party/situation` reads and merges it; the walk page, travel, camp, combat, the DM and a restart
// are the writers. The chat route reads the row through `buildSituationBlock` (PR B) instead of the old
// hardcoded "Velkynvelve (slave pen)" ladder.
//
// Rulings this encodes (Sam, 2026-10-24):
//   - `captive` -> `escaping` fires when the characters STEP OUTSIDE the pen, not when the gate opens.
//     Opening the gate only changes `gate_state`.
//   - Stepping outside the pen also lifts the ward: the pen's anti-magic sigil no longer binds them.
//
// Design doc: claude/Talk_Situation_And_Sandbox_Mode_2026-10-24.md

export const STANCES = ["captive", "escaping", "free", "camped", "travelling", "combat"] as const
export type Stance = (typeof STANCES)[number]

export const GATE_STATES = ["locked", "open", "broken"] as const
export type GateState = (typeof GATE_STATES)[number]

export const WRITERS = ["walk", "travel", "camp", "combat", "dm", "restart"] as const
export type Writer = (typeof WRITERS)[number]

export interface Situation {
  campaign_run_id: string
  node_key: string
  sub_location: string | null
  sub_label: string | null
  stance: Stance
  ward_active: boolean
  gate_state: GateState
  party_present: string[]
  updated_by: Writer
  updated_at: string
}

/** The row every run starts on: captive in the Velkynvelve slave pen, gate locked, ward up. */
export function startingSituation(runId: string, now = new Date().toISOString()): Situation {
  return {
    campaign_run_id: runId,
    node_key: "velkynvelve",
    sub_location: "node-11-slave-pen",
    sub_label: "Slave Pen",
    stance: "captive",
    ward_active: true,
    gate_state: "locked",
    party_present: [],
    updated_by: "restart",
    updated_at: now,
  }
}

/**
 * What a writer may send. Fields are optional and merged; `event` carries the moments that change
 * more than one field at once so the client never has to know the rules:
 *   - `step_outside`  the party has left the pen: stance -> escaping (only from captive), ward lifts
 *   - `gate_open`     the gate was unlocked: gate_state -> open (never touches stance)
 *   - `gate_broken`   the gate was forced: gate_state -> broken
 *   - `labor_out`     a work detail takes the party out under escort (Hard Labor, lib/labor.ts): the stance STAYS
 *                     captive — they are prisoners at work, not escapees — and the pen's ward no longer covers them
 *                     (the manacles still do: lib/labor.ts castableInManacles)
 *   - `labor_back`    the detail walks them back into the pen: the ward covers them again
 *   - `recaptured`    the party surrendered to the guards and was marched back into the pen (Sam, 2026-10-28,
 *                     lib/surrender.mjs): stance -> captive from wherever it was, gate -> locked, ward back up
 *   - `ward_broken`   a hero re-cut an anchor stroke on the pen's ward sigil (Sam, 2026-10-30): the nullification is
 *                     gone for EVERY caster in the pen and the sigil is scarred red. The ward does not come back:
 *                     the walk re-asserts this event after labor_back and recaptured, which would otherwise raise it.
 *   - `ward_touched`  a hero botched that cut badly enough for the ward to bite back. The ward HOLDS — ward_active is
 *                     untouched — but Ilvara felt it, so the drow come and search the pen.
 *   - `ward_seen`     a drow walked into the pen and read the red scar. Combat, not a volley: one of exactly two
 *                     exceptions to the volleys-only rule (the other is a refused stolen pen key).
 */
export interface SituationPatch {
  node_key?: string
  sub_location?: string | null
  sub_label?: string | null
  stance?: Stance
  ward_active?: boolean
  gate_state?: GateState
  party_present?: string[]
  event?: "step_outside" | "gate_open" | "gate_broken" | "labor_out" | "labor_back" | "recaptured" | "ward_broken" | "ward_touched" | "ward_seen"
}

/** The fields the walk page (a player's own browser) may change. Everything else needs the DM key. */
export const WALK_FIELDS: ReadonlySet<keyof SituationPatch> = new Set(["sub_location", "sub_label", "party_present", "event"])

const isStance = (v: unknown): v is Stance => typeof v === "string" && (STANCES as readonly string[]).includes(v)
const isGate = (v: unknown): v is GateState => typeof v === "string" && (GATE_STATES as readonly string[]).includes(v)
const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null
  const s = v.replace(/[^\w\s\-'().,]/g, "").trim().slice(0, max)
  return s || null
}

/** Reads an untrusted body into a patch, dropping anything it does not understand. */
export function parsePatch(body: unknown): SituationPatch {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const p: SituationPatch = {}
  const nk = clean(b.node_key, 60)
  if (nk) p.node_key = nk
  if ("sub_location" in b) p.sub_location = clean(b.sub_location, 80)
  if ("sub_label" in b) p.sub_label = clean(b.sub_label, 80)
  if (isStance(b.stance)) p.stance = b.stance
  if (typeof b.ward_active === "boolean") p.ward_active = b.ward_active
  if (isGate(b.gate_state)) p.gate_state = b.gate_state
  if (Array.isArray(b.party_present)) p.party_present = b.party_present.map((n) => clean(n, 60)).filter((n): n is string => !!n).slice(0, 12)
  if (b.event === "step_outside" || b.event === "gate_open" || b.event === "gate_broken" || b.event === "labor_out" || b.event === "labor_back" || b.event === "recaptured"
    || b.event === "ward_broken" || b.event === "ward_touched" || b.event === "ward_seen") p.event = b.event
  return p
}

/** True when the patch only touches what a player's browser is allowed to touch. */
export function isWalkPatch(p: SituationPatch): boolean {
  return (Object.keys(p) as (keyof SituationPatch)[]).every((k) => WALK_FIELDS.has(k))
}

/** Applies a patch to the current row. Events are applied first, explicit fields after, so the DM can override. */
export function mergeSituation(prev: Situation, patch: SituationPatch, by: Writer, now = new Date().toISOString()): Situation {
  const next: Situation = { ...prev, party_present: [...prev.party_present] }
  if (patch.event === "gate_open") {
    if (next.gate_state !== "broken") next.gate_state = "open"
  } else if (patch.event === "gate_broken") {
    next.gate_state = "broken"
  } else if (patch.event === "step_outside") {
    if (next.stance === "captive") next.stance = "escaping"
    next.ward_active = false
  } else if (patch.event === "labor_out") {
    next.ward_active = false                                   // out of the pen, still captive
  } else if (patch.event === "labor_back") {
    if (next.stance === "captive") next.ward_active = true     // back inside the ward
  } else if (patch.event === "recaptured") {
    next.stance = "captive"                                    // prisoners again, whatever they were a moment ago
    next.gate_state = "locked"
    next.ward_active = true
  } else if (patch.event === "ward_broken") {
    next.ward_active = false                                   // cut open: it does not come back on its own
  }
  // ward_touched and ward_seen change nothing on this row on purpose. A botched cut leaves the ward HOLDING, and a
  // drow reading the red scar changes who is fighting, not where the party is. Both are here so the walk can tell
  // the DM core what happened in one vocabulary; the row itself only tracks the ward being up or down.
  if (patch.node_key !== undefined) next.node_key = patch.node_key
  if (patch.sub_location !== undefined) next.sub_location = patch.sub_location
  if (patch.sub_label !== undefined) next.sub_label = patch.sub_label
  if (patch.stance !== undefined) next.stance = patch.stance
  if (patch.ward_active !== undefined) next.ward_active = patch.ward_active
  if (patch.gate_state !== undefined) next.gate_state = patch.gate_state
  if (patch.party_present !== undefined) next.party_present = patch.party_present
  next.updated_by = by
  next.updated_at = now
  return next
}

/** True when the merge would change nothing the NPCs care about — the route skips the write then. */
export function sameSituation(a: Situation, b: Situation): boolean {
  return (
    a.node_key === b.node_key &&
    a.sub_location === b.sub_location &&
    a.sub_label === b.sub_label &&
    a.stance === b.stance &&
    a.ward_active === b.ward_active &&
    a.gate_state === b.gate_state &&
    a.party_present.length === b.party_present.length &&
    a.party_present.every((n, i) => n === b.party_present[i])
  )
}

const STANCE_LINE: Record<Stance, string> = {
  captive: "CAPTIVE. The party is imprisoned in the slave pen — manacled, watched, stripped of their gear.",
  escaping: "ESCAPING. The party has LEFT the slave pen and is loose inside the outpost. They are fugitives, not prisoners.",
  free: "FREE. The party is clear of Velkynvelve and its guards.",
  camped: "CAMPED. The party has made camp here and is resting.",
  travelling: "TRAVELLING. The party is on the road between places.",
  combat: "IN COMBAT. Blades are out; this is not a conversation.",
}

/**
 * The prompt block the chat route prints instead of the old keyword ladder. Authoritative on purpose:
 * it tells the model to ignore any older note about the pen once the party is out of it.
 */
export function buildSituationBlock(s: Situation, placeName?: string): string {
  const where = [placeName || s.node_key, s.sub_label || s.sub_location].filter(Boolean).join(" — ")
  const lines = [
    "=== PARTY SITUATION (authoritative — overrides any older note about where the party is) ===",
    `Where: ${where}`,
    `Stance: ${STANCE_LINE[s.stance]}`,
  ]
  if (s.stance === "captive" || s.stance === "escaping" || s.node_key === "velkynvelve") {
    lines.push(`The pen gate is ${s.gate_state.toUpperCase()}. ${s.ward_active ? "The ward sigil still drinks any spell cast here." : "The ward sigil no longer binds them; they may cast."}`)
  }
  if (s.party_present.length) lines.push(`Present here: ${s.party_present.join(", ")}`)
  if (s.stance !== "captive") lines.push("Do NOT refer to the party as prisoners or as still inside the pen. Speak to where they are NOW.")
  return lines.join("\n")
}

/**
 * What the chat route folds into its stage context (PR B). Null when the row is not about the place the travel
 * graph says the party is in — a party that has walked out onto the road leaves the row behind, and the graph
 * is the authority on which place they are in; this row is the authority on where INSIDE it they stand.
 *   note   the authoritative block from buildSituationBlock
 *   where  the location string the route's stage ladder keys on: the pen while captive, the outpost once out,
 *          and the graph's own label for every other stance (camped, travelling, free, combat)
 */
export function situationForChat(s: Situation | null | undefined, currentLocation: string): { note: string; where: string } | null {
  if (!s) return null
  const loc = currentLocation.toLowerCase()
  const key = s.node_key.toLowerCase().replace(/[-_]+/g, " ").trim()
  if (!key || !loc.includes(key)) return null
  const place = currentLocation.replace(/\s*\(.*\)\s*$/, "").trim() || s.node_key
  const where = s.stance === "captive" ? `${place} (slave pen)` : s.stance === "escaping" ? `${place} outpost` : currentLocation
  return { note: buildSituationBlock(s, place), where }
}
