// What happens when the party stops walking.
//
// Sam's rule: "Depending on the Node there may be a cinematic, challenge,
// nothing, authored event." So an arrival resolves in a fixed order:
//
//   1. AUTHORED. Anything he wrote for this node wins outright — a cinematic,
//      a skill challenge, a scene. Canon beats dice.
//   2. THE ENCOUNTER CHECK, but only once a day's march has been walked.
//   3. NOTHING, and the party walks on.
//
// Only 1 and 2 stop the march. Quiet nodes flash their name and are gone,
// because if the party halts at all fifty-one nodes, halting stops meaning
// anything.
//
// WHY MILES AND NOT NODES. The book is explicit: "Each day of travel through
// the Underdark, check twice to see if the characters encounter anything
// unusual: once while they are traveling, and again while they are camped"
// (Out of the Abyss - D&D Encounters, ch.2 p.30). The painted route carries
// ~51 nodes across 56 miles. Rolling at each one would be about six times the
// published rate: a party ambushed every twenty minutes, and a table that
// stops believing the dice. Miles accumulate instead, and the check fires when
// the party has actually walked a day.
//
// The tables themselves are rows in `encounter_tables` / `encounter_table_rows`,
// transcribed with page numbers. Nothing here invents a result; this file only
// decides WHICH published table to read, and reports every die it rolled.

export interface EncounterTable {
  table_key: string
  die: number
  title: string
  source: string
}

export interface EncounterRow {
  table_key: string
  roll_min: number
  roll_max: number
  result: string
  detail: Record<string, unknown> | null
}

export interface RolledStep {
  table_key: string
  title: string
  source: string
  die: number
  roll: number
  result: string
  detail: Record<string, unknown>
}

export interface NodeEvent {
  id: string
  kind: "cinematic" | "challenge" | "authored" | "encounter" | "none"
  title: string
  body: string | null
  payload: Record<string, unknown>
  fires_once: boolean
  priority: number
}

export interface MarchState {
  miles_since_check: number
  day_miles: number
  checks_made: number
}

export interface ArrivalOutcome {
  /** True when the march stops here and waits for the DM. */
  halt: boolean
  kind: NodeEvent["kind"]
  title: string
  body: string | null
  /** Every die rolled, in order, each naming its table and page. */
  rolls: RolledStep[]
  /** Where this came from, for the DM panel and the audit trail. */
  source: string
  eventId: string | null
  /** The march accumulator as it stands after this arrival. */
  march: MarchState
}

/** Injectable so tests are deterministic; production passes a real d20. */
export type Roll = (die: number) => number

export function rollDie(die: number): number {
  return 1 + Math.floor(Math.random() * die)
}

/** The row whose inclusive range contains `roll`. */
export function rowFor(rows: EncounterRow[], tableKey: string, roll: number): EncounterRow | null {
  for (const r of rows) {
    if (r.table_key === tableKey && roll >= r.roll_min && roll <= r.roll_max) return r
  }
  return null
}

/**
 * Roll one table, then any table its result sends you on to. Random Encounters
 * can send you to Terrain, to Creature, or to both; Creature 1-2 sends you on
 * to Ambushers. Depth is capped so a malformed `rolls` chain in the data can
 * never spin forever.
 */
export function rollChain(
  tables: EncounterTable[],
  rows: EncounterRow[],
  startKey: string,
  roll: Roll,
  depth = 0,
): RolledStep[] {
  if (depth > 4) return []
  const table = tables.find((t) => t.table_key === startKey)
  if (!table) return []
  const value = roll(table.die)
  const row = rowFor(rows, startKey, value)
  if (!row) return []

  const detail = (row.detail ?? {}) as Record<string, unknown>
  const step: RolledStep = {
    table_key: startKey,
    title: table.title,
    source: table.source,
    die: table.die,
    roll: value,
    result: row.result,
    detail,
  }

  const next = Array.isArray(detail.rolls) ? (detail.rolls as string[]) : []
  const rest = next.flatMap((key) => rollChain(tables, rows, key, roll, depth + 1))
  return [step, ...rest]
}

/**
 * Resolve one arrival.
 *
 * `milesWalked` is the length of the leg just completed. `events` are the
 * authored events on this node that have not already fired.
 */
export function resolveArrival(input: {
  nodeName: string
  milesWalked: number
  march: MarchState
  events: NodeEvent[]
  tables: EncounterTable[]
  rows: EncounterRow[]
  roll?: Roll
}): ArrivalOutcome {
  const roll = input.roll ?? rollDie
  const march: MarchState = {
    miles_since_check: Number(input.march.miles_since_check) + Number(input.milesWalked || 0),
    day_miles: Number(input.march.day_miles) || 7,
    checks_made: Number(input.march.checks_made) || 0,
  }

  // 1. Authored canon first. Highest priority, ties broken stably by id.
  const authored = [...input.events].sort(
    (a, b) => b.priority - a.priority || a.id.localeCompare(b.id),
  )[0]
  if (authored && authored.kind !== "none") {
    return {
      halt: true,
      kind: authored.kind,
      title: authored.title,
      body: authored.body,
      rolls: [],
      source: "authored for this node",
      eventId: authored.id,
      march,
    }
  }

  // 2. The published check, once a day's march is behind them.
  //
  // The tolerance is not decoration. Leg lengths are fractions of a mile and
  // they accumulate: 51 hops of 56/51 miles sums to 55.999999999999993, which
  // is a day short of the 8 the guide gives for this route (guide p.9). The
  // party would walk the whole way and lose a check to binary floating point.
  // A thousandth of a mile is five feet - far below any distance the map can
  // express, and enough to make the arithmetic honest.
  const MILE_EPSILON = 1e-3
  if (march.miles_since_check + MILE_EPSILON >= march.day_miles) {
    march.miles_since_check -= march.day_miles
    march.checks_made += 1
    const rolls = rollChain(input.tables, input.rows, "underdark_random", roll)
    const first = rolls[0]
    const quiet = !first || first.result === "No encounter"
    if (quiet) {
      return {
        halt: false,
        kind: "none",
        title: input.nodeName + " - the tunnel stays quiet",
        body: null,
        rolls,
        source: first?.source ?? "Out of the Abyss - D&D Encounters, ch.2, p.30",
        eventId: null,
        march,
      }
    }
    return {
      halt: true,
      kind: "encounter",
      title: rolls.map((r) => r.result).join(" - "),
      body: null,
      rolls,
      source: first.source,
      eventId: null,
      march,
    }
  }

  // 3. Nothing. Keep walking.
  return {
    halt: false,
    kind: "none",
    title: input.nodeName,
    body: null,
    rolls: [],
    source: "no check due - under a day's march since the last one",
    eventId: null,
    march,
  }
}
