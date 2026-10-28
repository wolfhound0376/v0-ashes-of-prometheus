// lib/labor.ts — Hard Labor: the work details that take prisoners out of the Velkynvelve slave pen.
//
// Pure. No Supabase, no THREE, no clock of its own: every random draw comes in through `rng`, every time
// through arguments. The rows it plans live in `work_details` (supabase/migrations/20261026200000_work_details.sql);
// a service-role route (PR 2) runs the plan and writes them.
//
// Design of record: project doc claude/Hard_Labor_Module_2026-10-26.md. Every rule here carries its source:
//   [BOOK]  Out of the Abyss — Encounters ch.1 "Hard Labor" p.12 (campaign_chunks 1173), "Acquisitions" p.19 (1205)
//   [EXP]   OotA Expanded / the Guide — community supplements, not WotC (chunks 214–218, guide p.6)
//   [SAM]   Sam's rulings, 2026-10-26
//   [HOUSE] Claude's numbers — Sam's call, flagged so nobody mistakes them for the book
//
// Sam's rulings this encodes (2026-10-26):
//   1. Manacles stay ON during labor → only verbal-only spells can be cast on a detail (5E: S and M need a hand).
//   2. ALL the main players go on a detail together, plus 0–2 prisoner NPCs by party size. (Replaces the book's
//      three-groups split for the PCs. The NPCs who are not on the party's detail still work the other shifts.)
//   3. No routine pat-down. The drow search only on suspicion.
//   4. Disobedience: a warning (slap / thrown back) first; a second offence rolls — an NPC defuses it by taking
//      the hidden thing and offering it to the guard, or volleys down the PC (the surgeon comes unless she already
//      has this run). The NPC who defused it raises it later in the pen.

// ─── The tasks ────────────────────────────────────────────────────────────────────────────────────────────────

export type TaskKey =
  | "water" | "lift" | "clean" | "pots" | "kitchen" | "dishes" | "laundry"
  | "rocks" | "rope" | "supplies"
  | "lift-trouble" | "quaggoth-hair"

export type Source = "book" | "expanded"

export interface WorkCheck {
  skill: "Athletics" | "Dexterity" | "Survival"
  dc: number                       // [HOUSE] every DC here — the book gives none
}

export interface LaborTask {
  key: TaskKey
  label: string
  source: Source
  /** The book area the work happens in (Velkynvelve key). `stops` lists every plate the crew passes through. */
  area: number
  stops: number[]
  /** True for the drow's pointless cruelty work [BOOK] — always liable to be redone on a whim. */
  cruelty: boolean
  check: WorkCheck | null
  /** A plate that does not exist yet. The scheduler never picks these until the caller says the plate is in. */
  needsPlate?: string
}

export const TASKS: readonly LaborTask[] = [
  { key: "water",    label: "Fill and haul water barrels", source: "book", area: 9,  stops: [9],               cruelty: false, check: { skill: "Athletics", dc: 10 } },
  { key: "lift",     label: "Operate the lift",            source: "book", area: 5,  stops: [5],               cruelty: false, check: { skill: "Athletics", dc: 12 } },
  { key: "clean",    label: "Clean the barracks",          source: "book", area: 2,  stops: [2],               cruelty: false, check: null },
  { key: "pots",     label: "Empty the chamber pots",      source: "book", area: 14, stops: [2, 7, 8, 12, 14], cruelty: false, check: { skill: "Dexterity", dc: 10 } },
  { key: "kitchen",  label: "Food preparation and service", source: "book", area: 3, stops: [3],               cruelty: false, check: { skill: "Survival", dc: 12 } },
  { key: "dishes",   label: "Wash dishes",                 source: "book", area: 3,  stops: [3],               cruelty: false, check: null },
  { key: "laundry",  label: "Laundry",                     source: "book", area: 14, stops: [14],              cruelty: false, check: null },
  { key: "rocks",    label: "Stack rocks",                 source: "book", area: 10, stops: [10],              cruelty: true,  check: null },
  { key: "rope",     label: "Coil rope",                   source: "book", area: 10, stops: [10],              cruelty: true,  check: null },
  { key: "supplies", label: "Organize supplies",           source: "book", area: 10, stops: [10],              cruelty: true,  check: null },
  { key: "lift-trouble",  label: "Lift Trouble (rappel for spilled goods)", source: "expanded", area: 5,  stops: [5],  cruelty: false, check: { skill: "Athletics", dc: 12 }, needsPlate: "lift-cliffside" },
  { key: "quaggoth-hair", label: "Braid quaggoth hair",                    source: "expanded", area: 12, stops: [12], cruelty: true,  check: null },
]

export const taskOf = (key: TaskKey): LaborTask => {
  const t = TASKS.find((x) => x.key === key)
  if (!t) throw new Error(`unknown labor task ${key}`)
  return t
}

// ─── Shifts ───────────────────────────────────────────────────────────────────────────────────────────────────

/** [BOOK] each group works a third of the day. [HOUSE] the three shifts start at 06:00, 14:00 and 22:00. */
export const SHIFT_STARTS = [6 * 60, 14 * 60, 22 * 60] as const
export type Shift = 1 | 2 | 3

/** Which shift is running at `minutesOfDay` (game_clock.minutes_of_day). */
export function shiftAt(minutesOfDay: number): Shift {
  const m = ((Math.floor(minutesOfDay) % 1440) + 1440) % 1440
  if (m >= SHIFT_STARTS[2] || m < SHIFT_STARTS[0]) return 3
  return m >= SHIFT_STARTS[1] ? 2 : 1
}

/**
 * [SAM] 2026-10-27: "the work detail should not start for at least 3 cycles (shift changes)". The party is not put to
 * work until at least this many shift changes have passed since it reached the pen (the run's start on the game clock).
 * The other prisoners keep working their shifts meanwhile.
 */
export const SHIFTS_BEFORE_FIRST_DETAIL = 3

export interface ClockTime { day: number; minutes: number }

/**
 * The earliest shift the party may work: the one that begins at the `n`th shift change after `from`. A start exactly on
 * a shift change does not count that change (the party has to sit through `n` more).
 */
export function firstWorkShift(from: ClockTime, n = SHIFTS_BEFORE_FIRST_DETAIL): { day: number; shift: Shift } {
  const t = (Math.max(1, Math.floor(from.day)) - 1) * 1440 + Math.floor(from.minutes)
  let day = Math.floor(t / 1440) + 1, seen = 0
  for (;;) {
    for (let i = 0; i < SHIFT_STARTS.length; i++) {
      const at = (day - 1) * 1440 + SHIFT_STARTS[i]
      if (at > t && ++seen >= Math.max(1, n)) return { day, shift: (i + 1) as Shift }
    }
    day++
  }
}

// ─── Who goes ─────────────────────────────────────────────────────────────────────────────────────────────────

export type Rng = () => number   // [0, 1)

export interface CrewMember { kind: "pc" | "npc"; id: string; name: string }

/**
 * [SAM] how many prisoner NPCs walk with the party. [HOUSE] the split by party size:
 * 4+ heroes → 0–1, 2–3 heroes → 1–2, a lone hero → 2, nobody → 0.
 */
export function npcCountFor(pcCount: number, rng: Rng): number {
  if (pcCount <= 0) return 0
  if (pcCount === 1) return 2
  const [lo, hi] = pcCount >= 4 ? [0, 1] : [1, 2]
  return lo + Math.floor(rng() * (hi - lo + 1))
}

/** A pair the guards have SEEN being friendly ([BOOK] "prisoners known to be friendly … are usually kept apart"). */
export type SeenFriends = ReadonlyArray<readonly [string, string]>

const friends = (seen: SeenFriends, a: string, b: string) =>
  seen.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

/**
 * Picks the NPCs who go with the party. Prefers NPCs the party has spent the fewest details with ([EXP]: each
 * detail should spotlight one NPC), never puts two NPCs the guards know are friends on one detail [BOOK].
 */
export function pickCompanions(
  npcs: readonly CrewMember[], count: number, rng: Rng,
  opts: { seenFriends?: SeenFriends; timesWithParty?: Readonly<Record<string, number>> } = {},
): CrewMember[] {
  const seen = opts.seenFriends ?? []
  const times = opts.timesWithParty ?? {}
  // Shuffle first so equal counts break randomly, then a stable sort on how often each has come along.
  const pool = shuffle([...npcs], rng).sort((a, b) => (times[a.id] ?? 0) - (times[b.id] ?? 0))
  const out: CrewMember[] = []
  for (const n of pool) {
    if (out.length >= count) break
    if (out.some((o) => friends(seen, o.id, n.id))) continue
    out.push(n)
  }
  return out
}

// ─── Which task ───────────────────────────────────────────────────────────────────────────────────────────────

export interface TaskPickOptions {
  /** Areas this crew has already worked in. [EXP] each detail should show the crew a new part of the outpost. */
  areasSeen?: readonly number[]
  /** Day of captivity. [HOUSE] the drow get bored: cruelty work weighs more each day. */
  day?: number
  /** Plates that exist. A task with `needsPlate` is only drawn when its plate is listed here. */
  platesReady?: readonly string[]
  /** Leave out the Expanded supplement's extra tasks entirely. */
  bookOnly?: boolean
  /** Tasks already handed out this shift — [BOOK] no more than two or three prisoners on any one task. */
  exclude?: readonly TaskKey[]
}

export function taskWeight(t: LaborTask, o: TaskPickOptions): number {
  if (o.bookOnly && t.source !== "book") return 0
  if (t.needsPlate && !(o.platesReady ?? []).includes(t.needsPlate)) return 0
  if ((o.exclude ?? []).includes(t.key)) return 0
  let w = 1
  if (!(o.areasSeen ?? []).includes(t.area)) w += 2              // a room they have not seen
  if (t.cruelty) w += Math.min(3, Math.max(0, (o.day ?? 1) - 1) * 0.5)  // boredom
  return w
}

export function pickTask(rng: Rng, o: TaskPickOptions = {}): LaborTask {
  const weighted = TASKS.map((t) => [t, taskWeight(t, o)] as const).filter(([, w]) => w > 0)
  if (!weighted.length) throw new Error("no labor task is available")
  const total = weighted.reduce((s, [, w]) => s + w, 0)
  let r = rng() * total
  for (const [t, w] of weighted) {
    if ((r -= w) < 0) return t
  }
  return weighted[weighted.length - 1][0]
}

// ─── The escort ───────────────────────────────────────────────────────────────────────────────────────────────

export interface Observer {
  bestiary: "drow" | "quaggoth" | "drow-elite-warrior" | "jorlan-duskryn"
  name: string
  /** Live `bestiary` row: drow 12 (SRD 5.1), quaggoth 11, drow elite warrior 14 (OotA). */
  passivePerception: number
  /** Wisdom (Perception) modifier for an active check: +2 drow, +1 quaggoth, +4 elite (passive − 10). */
  perceptionMod: number
}

export const OBSERVERS: Readonly<Record<Observer["bestiary"], Omit<Observer, "name">>> = {
  "drow":               { bestiary: "drow",               passivePerception: 12, perceptionMod: 2 },
  "quaggoth":           { bestiary: "quaggoth",           passivePerception: 11, perceptionMod: 1 },
  "drow-elite-warrior": { bestiary: "drow-elite-warrior", passivePerception: 14, perceptionMod: 4 },
  // Live row filled 2026-10-26 from the stat block Sam supplied (Drow Elite Warrior block + his scars).
  "jorlan-duskryn":     { bestiary: "jorlan-duskryn",     passivePerception: 14, perceptionMod: 4 },
}

/**
 * [BOOK] supervised by quaggoths; drow come along to boast. [HOUSE] one drow + one quaggoth per detail — the
 * Expanded's 2 + 2 per detail would need more drow and quaggoths than the outpost has.
 *
 * Jorlan takes the drow's place on some details once he is on duty (lib/stage-roster.ts jorlanOnDuty — Sam: he
 * comes after the 2nd or 3rd rotation). [BOOK] "Shoor delights in giving Jorlan such menial work" (p.19).
 * [HOUSE] one detail in three. He watches with passive Perception 14 (bestiary row, 2026-10-26).
 */
export const JORLAN_ESCORT_CHANCE = 1 / 3

export function escortFor(opts: { jorlanOnDuty?: boolean; rng?: Rng } = {}): Observer[] {
  const jorlan = !!opts.jorlanOnDuty && !!opts.rng && opts.rng() < JORLAN_ESCORT_CHANCE
  return [
    jorlan ? { ...OBSERVERS["jorlan-duskryn"], name: "Jorlan Duskryn" } : { ...OBSERVERS.drow, name: "Drow Guard" },
    { ...OBSERVERS.quaggoth, name: "Quaggoth" },
  ]
}

// ─── Planning a day ───────────────────────────────────────────────────────────────────────────────────────────

export interface PlannedDetail {
  day: number
  shift: Shift
  task: TaskKey
  area_no: number
  crew: CrewMember[]
  escort: { bestiary: Observer["bestiary"]; name: string }[]
  /** True for the party's own detail; the others are NPC-only and run off-screen as a one-line result. */
  party: boolean
}

export interface DayInput {
  day: number
  pcs: readonly CrewMember[]
  npcs: readonly CrewMember[]         // prisoner NPCs still alive and in the pen
  seenFriends?: SeenFriends
  timesWithParty?: Readonly<Record<string, number>>
  areasSeen?: readonly number[]       // by the party
  platesReady?: readonly string[]
  bookOnly?: boolean
  /** Jorlan is on the watch (stage-roster jorlanOnDuty). He can then escort the party's detail. */
  jorlanOnDuty?: boolean
  /** The shift running now. A day planned part-way through puts the party's detail in this shift or a later one. */
  fromShift?: Shift
  /** The first shift the party may work (firstWorkShift). Before it, the day has no party detail at all. */
  notBefore?: { day: number; shift: Shift }
}

/**
 * The day's rota. [SAM] the party goes as one crew, on one shift, with its companions. [BOOK] everyone else is
 * split across the other two shifts, two or three to a task, friends kept apart. Returns the details in shift order.
 */
export function planDay(input: DayInput, rng: Rng): PlannedDetail[] {
  const nb = input.notBefore
  if (nb && input.day < nb.day) return planNpcsOnly(input, rng)        // too soon after reaching the pen: only the NPCs work
  const first = (nb && input.day === nb.day ? Math.max(input.fromShift ?? 1, nb.shift) : input.fromShift ?? 1) as Shift
  const partyShift = (first + Math.floor(rng() * (4 - first))) as Shift
  const companions = pickCompanions(input.npcs, npcCountFor(input.pcs.length, rng), rng, {
    seenFriends: input.seenFriends, timesWithParty: input.timesWithParty,
  })
  const base = { platesReady: input.platesReady, bookOnly: input.bookOnly, day: input.day }
  const out: PlannedDetail[] = []
  if (input.pcs.length) {
    const t = pickTask(rng, { ...base, areasSeen: input.areasSeen })
    out.push(detail(input.day, partyShift, t, [...input.pcs, ...companions], true, escortFor({ jorlanOnDuty: input.jorlanOnDuty, rng })))
  }

  // Everyone else, dealt across the two remaining shifts, then into crews of 2–3 inside each shift.
  const rest = shuffle(input.npcs.filter((n) => !companions.some((c) => c.id === n.id)), rng)
  const otherShifts = ([1, 2, 3] as Shift[]).filter((s) => s !== partyShift)
  const byShift: Record<number, CrewMember[]> = { [otherShifts[0]]: [], [otherShifts[1]]: [] }
  rest.forEach((n, i) => byShift[otherShifts[i % 2]].push(n))
  for (const s of otherShifts) {
    const used: TaskKey[] = []
    for (const crew of crews(byShift[s], input.seenFriends ?? [])) {
      const t = pickTask(rng, { ...base, exclude: used })
      used.push(t.key)
      out.push(detail(input.day, s, t, crew, false, escortFor()))
    }
  }
  return out.sort((a, b) => a.shift - b.shift)
}

/** A day with no party detail: every prisoner NPC is dealt across all three shifts, crews of 2–3, friends kept apart. */
function planNpcsOnly(input: DayInput, rng: Rng): PlannedDetail[] {
  const base = { platesReady: input.platesReady, bookOnly: input.bookOnly, day: input.day }
  const rest = shuffle([...input.npcs], rng), shifts: Shift[] = [1, 2, 3]
  const byShift: Record<number, CrewMember[]> = { 1: [], 2: [], 3: [] }
  rest.forEach((n, i) => byShift[shifts[i % 3]].push(n))
  const out: PlannedDetail[] = []
  for (const s of shifts) {
    const used: TaskKey[] = []
    for (const crew of crews(byShift[s], input.seenFriends ?? [])) {
      const t = pickTask(rng, { ...base, exclude: used })
      used.push(t.key)
      out.push(detail(input.day, s, t, crew, false, escortFor()))
    }
  }
  return out
}

function detail(day: number, shift: Shift, t: LaborTask, crew: CrewMember[], party: boolean, escort: Observer[]): PlannedDetail {
  return { day, shift, task: t.key, area_no: t.area, crew, party, escort: escort.map(({ bestiary, name }) => ({ bestiary, name })) }
}

/** Deals prisoners into crews of 2–3 [BOOK], moving a prisoner on when a known friend is already in the crew. */
export function crews(members: readonly CrewMember[], seen: SeenFriends): CrewMember[][] {
  if (!members.length) return []
  const n = members.length
  const count = n <= 3 ? 1 : Math.ceil(n / 3)
  const out: CrewMember[][] = Array.from({ length: count }, () => [])
  for (const m of members) {
    const room = out.filter((c) => c.length < 3).sort((a, b) => a.length - b.length)
    const clean = room.find((c) => !c.some((o) => friends(seen, o.id, m.id)))
    ;(clean ?? room[0] ?? out[0]).push(m)
  }
  return out.filter((c) => c.length)
}

// ─── Pocketing something ──────────────────────────────────────────────────────────────────────────────────────

export interface Watcher {
  observer: Observer
  /** True when this observer's vision cone covers the thief: [BOOK] they roll an active check. */
  watching: boolean
  /** Their d20 for that active check (only read when `watching`). */
  d20?: number
}

export interface PocketResult {
  kept: boolean
  /** Who saw it, when caught. */
  caughtBy: string | null
  /** Smallest margin over any observer — [HOUSE] 2 or less makes the drow suspicious. */
  margin: number
  suspicious: boolean
}

/**
 * [BOOK] Dexterity (Sleight of Hand) contested by the Wisdom (Perception) checks of any active observers, or their
 * passive Perception as the DC. Failure = ordered to give it up. A tie on a contest leaves things as they were —
 * the item stays where it was, so the thief does not get it (SRD contest rule); against a passive score, meeting
 * it succeeds (SRD DC rule).
 */
export function resolvePocket(sleightOfHandTotal: number, watchers: readonly Watcher[]): PocketResult {
  let margin = Infinity
  for (const w of watchers) {
    if (w.watching) {
      const theirs = (w.d20 ?? 10) + w.observer.perceptionMod
      if (sleightOfHandTotal <= theirs) return { kept: false, caughtBy: w.observer.name, margin: sleightOfHandTotal - theirs, suspicious: true }
      margin = Math.min(margin, sleightOfHandTotal - theirs)
    } else {
      if (sleightOfHandTotal < w.observer.passivePerception) return { kept: false, caughtBy: w.observer.name, margin: sleightOfHandTotal - w.observer.passivePerception, suspicious: true }
      margin = Math.min(margin, sleightOfHandTotal - w.observer.passivePerception)
    }
  }
  if (margin === Infinity) margin = 99   // nobody there at all
  return { kept: true, caughtBy: null, margin, suspicious: margin <= SUSPICION_MARGIN }
}

/** [HOUSE] a steal that clears the watcher by this much or less leaves "something off" — grounds for a search. */
export const SUSPICION_MARGIN = 2

// ─── Suspicion and the search ─────────────────────────────────────────────────────────────────────────────────

export type ItemSize = "tiny" | "small" | "dagger" | "large"

export interface SuspicionInput {
  /** Every successful pocket this detail. */
  pockets?: readonly PocketResult[]
  /** Turns the PC spent outside every escort's vision cone. */
  turnsOutOfSight?: number
  /** The biggest thing the PC is hiding. [HOUSE] anything bigger than a dagger cannot hide in rags. */
  biggestHidden?: ItemSize | null
  /** A crewmate NPC with a grudge told the guard. */
  informed?: boolean
}

export type SuspicionReason = "close-call" | "out-of-sight" | "too-big" | "informed"

/** [SAM] no routine pat-down — only these. Empty means the crew walks back unsearched. */
export function suspicionReasons(s: SuspicionInput): SuspicionReason[] {
  const out: SuspicionReason[] = []
  if ((s.pockets ?? []).some((p) => p.kept && p.suspicious)) out.push("close-call")
  if ((s.turnsOutOfSight ?? 0) >= 1) out.push("out-of-sight")
  if (s.biggestHidden === "large") out.push("too-big")
  if (s.informed) out.push("informed")
  return out
}

/** The search itself: the drow's Wisdom (Perception) check against the PC's Sleight of Hand to keep it hidden. */
export function searchFinds(drowCheckTotal: number, sleightOfHandTotal: number): boolean {
  return drowCheckTotal >= sleightOfHandTotal   // ties go to the searcher: he is looking for it [HOUSE]
}

// ─── Disobedience ─────────────────────────────────────────────────────────────────────────────────────────────

export type Disobedience = "keep-item" | "refuse-work" | "cast" | "back-talk"

/** [HOUSE] a second offence is defused by a crewmate NPC on this d20 or higher. */
export const DEFUSE_ON = 11

export type DisobeyOutcome =
  | { kind: "warning" }                                               // strike 1: slapped / thrown back, prone, 0 damage
  | { kind: "defused"; by: string }                                   // the NPC hands it over; they talk about it later
  | { kind: "volleys"; surgeon: boolean }                             // downed by volleys; Liana comes if she has not yet

/**
 * [SAM] The ladder: strike 1 is always the warning. From strike 2 on, Malachar rolls a d20: DEFUSE_ON or higher with
 * a crewmate NPC present and they defuse it; otherwise volleys until the PC drops — no formal combat, same as the pen.
 * The surgeon comes only if she has not come before this run.
 */
export function disobey(
  strikesSoFar: number,
  d20: number,
  companions: readonly CrewMember[],
  surgeonAlreadyCame: boolean,
  rng: Rng,
): DisobeyOutcome {
  if (strikesSoFar <= 0) return { kind: "warning" }
  const npcs = companions.filter((c) => c.kind === "npc")
  if (d20 >= DEFUSE_ON && npcs.length) return { kind: "defused", by: npcs[Math.floor(rng() * npcs.length)].name }
  return { kind: "volleys", surgeon: !surgeonAlreadyCame }
}

// ─── Casting in manacles ──────────────────────────────────────────────────────────────────────────────────────

/**
 * [SAM] manacles stay on. 5E (SRD 5.1, Spellcasting: Components): a somatic component needs at least one free hand,
 * and a material component needs a hand to handle it. So on a detail only a VERBAL-ONLY spell can be cast — and
 * casting it in front of the escort counts as disobedience ("cast").
 */
export function castableInManacles(components: readonly string[]): boolean {
  const c = components.map((x) => x.trim().toUpperCase().charAt(0))
  return c.includes("V") && !c.includes("S") && !c.includes("M")
}

// ─── The party's stance while working ─────────────────────────────────────────────────────────────────────────

/**
 * The fix the module needs from the situation layer (wired in PR 2, when labor first takes anyone off the pen plate):
 * lib/situation.ts flips `captive` → `escaping` on `step_outside`. A work detail takes captives out legally, so while
 * a detail is running the party stays CAPTIVE; it becomes ESCAPING only when a PC breaks from the escort.
 */
export function stanceDuringLabor(brokeFromEscort: boolean): "captive" | "escaping" {
  return brokeFromEscort ? "escaping" : "captive"
}

// ─── helpers ──────────────────────────────────────────────────────────────────────────────────────────────────

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** A seeded generator for tests and for replaying a day exactly (mulberry32). */
export function seeded(seed: number): Rng {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
