// The party's situation: what they are in the middle of, as the painted walk (/velkynvelve) sees it.
//
// The DM core knows WHERE the party is from party_location_label() (the travel node and, inside a
// place, the subnodal node) and WHO is in the area from the stage roster (lib/stage-roster.ts, which
// Malachar himself writes). The walk knows a third thing neither of those carries: what the party is
// DOING right now — which plate they actually stand on, who leads, who walks with them, who else is
// on the plate, whether they are talking to someone, fighting, or just looking around, and the last
// thing that happened to them. This file is the shape of that account, the checks on what the walk
// may send, and the one line it becomes when someone (the DM screen, a later prompt) needs to read it.
//
// Pure: no I/O. The table is `party_situation` (migrations/20261024000000_party_situation.sql); the
// route is POST /api/party/situation.

export const ACTIVITIES = ["exploring", "travelling", "talking", "fighting", "interacting"] as const
export type Activity = (typeof ACTIVITIES)[number]

export type SituationMember = { slug: string; name: string; characterId: string | null; down: boolean }
export type SituationCompanion = { slug: string; name: string }
export type SituationNearby = { slug: string; name: string; hostile: boolean; down: boolean; body: boolean }
export type SituationFlags = { gateOpen?: boolean; clearedHere?: boolean; penKey?: boolean }

/** What the walk posts. Everything optional but the area; the route fills in the run. */
export interface SituationInput {
  activity: Activity
  place: string
  areaKey: string
  areaNo: number | null
  areaName: string
  talkingTo: string | null
  leader: string | null
  party: SituationMember[]
  company: SituationCompanion[]
  nearby: SituationNearby[]
  flags: SituationFlags
  note: string | null
}

/** One row of public.party_situation. */
export interface PartySituationRow {
  campaign_run_id: string
  source: string
  place: string | null
  area_key: string | null
  area_no: number | null
  area_name: string | null
  activity: Activity
  talking_to: string | null
  leader: string | null
  party: SituationMember[]
  company: SituationCompanion[]
  nearby: SituationNearby[]
  flags: SituationFlags
  note: string | null
  updated_at: string
}

// Caps: a plate never holds more than this, and a payload that claims otherwise is not the walk.
const MAX_PARTY = 8
const MAX_COMPANY = 12
const MAX_NEARBY = 24

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "")
const strOrNull = (v: unknown, max: number): string | null => str(v, max) || null
const uuidish = (v: unknown): string | null => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null)

export type ParseResult = { ok: true; value: SituationInput } | { ok: false; error: string }

/**
 * Check and clamp what the walk sent. Unknown fields are dropped, strings are trimmed and cut to
 * size, lists are capped. The only hard requirements are a known activity and an area key — the row
 * is meaningless without a plate.
 */
export function parseSituationInput(body: unknown): ParseResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "expected a JSON object" }
  const b = body as Record<string, unknown>

  const activity = str(b.activity, 20)
  if (!(ACTIVITIES as readonly string[]).includes(activity)) return { ok: false, error: `activity must be one of ${ACTIVITIES.join(", ")}` }

  const areaKey = str(b.areaKey, 80)
  if (!areaKey) return { ok: false, error: "areaKey is required" }

  const areaNoRaw = typeof b.areaNo === "number" ? b.areaNo : typeof b.areaNo === "string" ? Number(b.areaNo) : NaN
  const areaNo = Number.isInteger(areaNoRaw) && areaNoRaw >= 0 && areaNoRaw < 1000 ? areaNoRaw : null

  const party: SituationMember[] = []
  for (const m of Array.isArray(b.party) ? b.party.slice(0, MAX_PARTY) : []) {
    if (!m || typeof m !== "object") continue
    const r = m as Record<string, unknown>
    const slug = str(r.slug, 60), name = str(r.name, 60) || slug
    if (!slug) continue
    party.push({ slug, name, characterId: uuidish(r.characterId), down: !!r.down })
  }

  const company: SituationCompanion[] = []
  for (const c of Array.isArray(b.company) ? b.company.slice(0, MAX_COMPANY) : []) {
    if (!c || typeof c !== "object") continue
    const r = c as Record<string, unknown>
    const slug = str(r.slug, 60), name = str(r.name, 60) || slug
    if (slug) company.push({ slug, name })
  }

  const nearby: SituationNearby[] = []
  for (const n of Array.isArray(b.nearby) ? b.nearby.slice(0, MAX_NEARBY) : []) {
    if (!n || typeof n !== "object") continue
    const r = n as Record<string, unknown>
    const slug = str(r.slug, 60), name = str(r.name, 60) || slug
    if (slug) nearby.push({ slug, name, hostile: !!r.hostile, down: !!r.down, body: !!r.body })
  }

  const f = b.flags && typeof b.flags === "object" && !Array.isArray(b.flags) ? (b.flags as Record<string, unknown>) : {}
  const flags: SituationFlags = {}
  if ("gateOpen" in f) flags.gateOpen = !!f.gateOpen
  if ("clearedHere" in f) flags.clearedHere = !!f.clearedHere
  if ("penKey" in f) flags.penKey = !!f.penKey

  // While talking, the partner is required: a "talking" row with no one named is a bug upstream.
  const talkingTo = activity === "talking" ? strOrNull(b.talkingTo, 60) : null
  if (activity === "talking" && !talkingTo) return { ok: false, error: "talkingTo is required while talking" }

  return {
    ok: true,
    value: {
      activity: activity as Activity,
      place: str(b.place, 60) || "Velkynvelve",
      areaKey,
      areaNo,
      areaName: str(b.areaName, 80) || areaKey,
      talkingTo,
      leader: strOrNull(b.leader, 60),
      party,
      company,
      nearby,
      flags,
      note: strOrNull(b.note, 240),
    },
  }
}

/** The upsert for one run. `updated_at` is set here so a stale write never looks fresh. */
export function situationRow(input: SituationInput, campaignRunId: string, source = "walk"): PartySituationRow {
  return {
    campaign_run_id: campaignRunId,
    source,
    place: input.place,
    area_key: input.areaKey,
    area_no: input.areaNo,
    area_name: input.areaName,
    activity: input.activity,
    talking_to: input.talkingTo,
    leader: input.leader,
    party: input.party,
    company: input.company,
    nearby: input.nearby,
    flags: input.flags,
    note: input.note,
    updated_at: new Date().toISOString(),
  }
}

const list = (names: string[]): string => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`)

/**
 * The situation as one short paragraph, for a human reading the DM screen or a prompt that needs the
 * facts in prose. Says only what the row says; nothing is inferred. Null for no row.
 */
export function describeSituation(row: PartySituationRow | null | undefined): string | null {
  if (!row) return null
  const parts: string[] = []

  const where = [row.place, row.area_name].filter(Boolean).join(" — ")
  parts.push(`${where || "Somewhere"}${row.area_no != null ? ` (area ${row.area_no})` : ""}.`)

  const up = row.party.filter((m) => !m.down).map((m) => m.name)
  const down = row.party.filter((m) => m.down).map((m) => m.name)
  if (row.leader) parts.push(`${row.leader} leads${up.filter((n) => n !== row.leader).length ? `, with ${list(up.filter((n) => n !== row.leader))}` : ""}.`)
  else if (up.length) parts.push(`The party: ${list(up)}.`)
  if (down.length) parts.push(`${list(down)} ${down.length > 1 ? "are" : "is"} down.`)

  if (row.company.length) parts.push(`Walking with them: ${list(row.company.map((c) => c.name))}.`)

  const standing = row.nearby.filter((n) => !n.down && !n.body)
  const bodies = row.nearby.filter((n) => n.body)
  const fallen = row.nearby.filter((n) => n.down && !n.body)
  if (standing.length) parts.push(`Also here: ${list(standing.map((n) => (n.hostile ? `${n.name} (hostile)` : n.name)))}.`)
  if (fallen.length) parts.push(`Down: ${list(fallen.map((n) => n.name))}.`)
  if (bodies.length) parts.push(`Dead on the ground: ${list(bodies.map((n) => n.name))}.`)

  switch (row.activity) {
    case "talking": parts.push(`They are talking with ${row.talking_to ?? "someone"}.`); break
    case "fighting": parts.push("They are in a fight."); break
    case "travelling": parts.push("They are on the move between areas."); break
    case "interacting": parts.push("They are busy with something in the room."); break
    default: parts.push("They are looking around.")
  }

  if (row.flags.gateOpen) parts.push("The pen gate is open.")
  if (row.flags.penKey) parts.push("They hold the pen key.")
  if (row.note) parts.push(`Last: ${row.note}`)
  return parts.join(" ")
}

// ---------------------------------------------------------------------------
// What Malachar is told (PR B). The row is the walk's account; this decides whether to trust it for
// this turn and puts it into words he can act on.
// ---------------------------------------------------------------------------

/** A talk or a fight the map reported this long ago has had time to end; the row keeps the place. */
export const TRANSIENT_AFTER_MS = 30 * 60 * 1000

/** "Velkynvelve — Shoor's Quarters": the finer location, in the travel graph's own label style. */
export function situationWhere(row: PartySituationRow): string {
  return [row.place, row.area_name].filter(Boolean).join(" — ") || "an unknown place"
}

export function ageWords(ms: number): string {
  if (!Number.isFinite(ms) || ms < 90_000) return "just now"
  const m = Math.round(ms / 60_000)
  if (m < 60) return `${m} minutes ago`
  const h = Math.round(m / 60)
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`
  return `${Math.round(h / 24)} days ago`
}

export interface SituationNoteOptions {
  /** Where the travel graph says the party is (party_location_label's label or location), if known. */
  location?: string | null
  now?: Date
}

/**
 * The prompt block for one turn, or null when the row should not be trusted for it.
 *
 * Trusted only while the travel graph agrees on the PLACE: the walk writes the row from inside
 * Velkynvelve, and a party that has since walked out onto the road (which moves party_position, not
 * this table) leaves it behind. A talk or fight older than TRANSIENT_AFTER_MS is read as over —
 * the place stands, the activity does not — because the walk only writes on change and a tab closed
 * mid-fight would otherwise keep the party fighting for a week.
 */
export function situationPromptNote(row: PartySituationRow | null | undefined, opts: SituationNoteOptions = {}): { note: string; where: string } | null {
  if (!row) return null
  const place = (row.place ?? "").trim()
  if (opts.location && place && !opts.location.toLowerCase().includes(place.toLowerCase())) return null

  const now = opts.now ?? new Date()
  const age = now.getTime() - Date.parse(row.updated_at)
  const ageText = Number.isNaN(age) ? "at an unknown time" : ageWords(age)

  let shown = row
  let lapsed = ""
  if (!Number.isNaN(age) && age > TRANSIENT_AFTER_MS && (row.activity === "talking" || row.activity === "fighting")) {
    lapsed = row.activity === "talking" ? " The talk it reported has had time to end." : " The fight it reported has had time to end."
    shown = { ...row, activity: "exploring", talking_to: null }
  }

  const where = situationWhere(row)
  const note = [
    `PARTY SITUATION — the painted map's own account, reported ${ageText}: ${describeSituation(shown)}${lapsed}`,
    "Treat this as where the party stands, who leads, and who is within arm's reach; the ON STAGE list is still yours for anyone you brought in.",
    "Narrate THIS room. Do not move the party to another area yourself — the map moves them.",
    "Only those listed here or on stage can be seen or spoken to; no one else is in the room.",
  ].join(" ")
  return { note, where }
}
