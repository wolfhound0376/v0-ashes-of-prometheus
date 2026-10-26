// ============================================================================
// THE TABLE — who may sit, when the game starts, and who is locked out.
//
// Sam, 2026-10-25, after a playthrough where characters kept walking in mid-game:
//   "You can not enter the game until the DM has entered and started the game. Characters must have
//    a pixel art character, character sheet complete, voice choice, a thumbnail at least for their
//    character, and have an eligible seat in the table."
//   "When everything is ready for that character a green light turns on. Yellow is almost ready and
//    Red means a deficiency. If this isn't remedied he can be removed by the DM or the character
//    himself. The DM light turns yellow when he is in the game but hasn't started the game. When he
//    is green and all the seats are green the game starts."
//   "When the game starts NO other characters from the possible roster will be present from that
//    point on in that gaming session. Another gaming session is required to jump in."
//   "The DM is the only one that can end / save / load / or remove a character if needed."
//
// His answers to the four readings (same day):
//   * Yellow = everything is there but the player has not pressed Ready. Red = something missing,
//     and the seat says what. Green = Ready pressed.
//   * End session IS the save: the world already writes itself as it is played. The next session the
//     DM opens the table again and the run carries on; a new campaign is still the Restart. No rewind.
//   * The roster locks for everyone at the start, the DM included — a DM-run companion is seated at
//     the table before the start like everyone else.
//   * On the map everyone seated walks together; each player moves only their own hero.
//
// THE STATES
//   closed   no DM at the table. Nobody can sit. (No row at all reads as closed, so a Restart — which
//            deletes every world flag — closes the table and empties the seats in one stroke.)
//   lobby    the DM opened the table. Up to five seats; each has a light. DM light yellow.
//   live     the DM went green and every seat was green. The roster is locked for the session.
//
// Pure: no Supabase, so the rules can be tested. lib/table-store.ts reads and writes them.
// ============================================================================

export const MAX_SEATS = 5
/** The table's seven cartoon players (public/table/player-1..7.webp): three women, four men. */
export const FIGURE_COUNT = 7

/**
 * Which figure each seated hero sits as. A choice the player made wins; everyone else gets a stable pick
 * from their id, so they look the same every session. Never two alike at one table.
 */
export function assignFigures(seats: { id: string; seat?: number | null; figure?: number | null }[]): Map<string, number> {
  const out = new Map<string, number>(), used = new Set<number>()
  for (const s of seats) {
    const f = s.figure
    if (typeof f === "number" && f >= 0 && f < FIGURE_COUNT && !used.has(f)) { out.set(s.id, f); used.add(f) }
  }
  const hash = (id: string) => { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }
  for (const s of [...seats].sort((a, b) => (a.seat ?? 9) - (b.seat ?? 9))) {
    if (out.has(s.id)) continue
    let f = hash(s.id) % FIGURE_COUNT
    for (let i = 0; i < FIGURE_COUNT && used.has(f); i++) f = (f + 1) % FIGURE_COUNT
    out.set(s.id, f); used.add(f)
  }
  return out
}

/** Why this figure cannot be taken right now, or null. */
export function cannotChooseFigure(figure: unknown, mineId: string, seats: { id: string; figure?: number | null }[]): string | null {
  if (typeof figure !== "number" || !Number.isInteger(figure) || figure < 0 || figure >= FIGURE_COUNT) return "That player is not at this table."
  if (seats.some((s) => s.id !== mineId && s.figure === figure)) return "Someone else is already sitting as that player."
  return null
}

export type TableStatus = "closed" | "lobby" | "live"
export type Light = "red" | "yellow" | "green"

/** The `table` world flag. */
export type TableState = {
  status: TableStatus
  /** The DM pressed "Start" in the lobby. */
  dmReady: boolean
  /** Counts up each time the table is opened. */
  session: number
  openedAt: string | null
  startedAt: string | null
}

export const CLOSED: TableState = { status: "closed", dmReady: false, session: 0, openedAt: null, startedAt: null }

/** What a character brings to the table. */
export type Readiness = { sprite: boolean; sheet: boolean; voice: boolean; thumbnail: boolean }

export const REQUIREMENT_LABEL: Record<keyof Readiness, string> = {
  sprite: "pixel-art figure",
  sheet: "complete character sheet",
  voice: "voice",
  thumbnail: "portrait thumbnail",
}

/** The things this character still lacks, in the order Sam listed them. */
export function missingOf(r: Readiness): string[] {
  return (Object.keys(REQUIREMENT_LABEL) as (keyof Readiness)[]).filter((k) => !r[k]).map((k) => REQUIREMENT_LABEL[k])
}

export const isComplete = (r: Readiness) => missingOf(r).length === 0

/**
 * A seat's light. Red: something is missing. Yellow: all there, Ready not pressed. Green: Ready.
 * A DM-run companion has no player to press Ready, so it is green as soon as it is complete.
 */
export function seatLight(r: Readiness, ready: boolean, dmRun = false): Light {
  if (!isComplete(r)) return "red"
  return ready || dmRun ? "green" : "yellow"
}

/** The DM's light: dark (null) when no table is open, yellow in the lobby, green once Start is pressed. */
export function dmLight(t: TableState): Light | null {
  if (t.status === "closed") return null
  if (t.status === "live") return "green"
  return t.dmReady ? "green" : "yellow"
}

/** The game starts when the DM is green, at least one seat is taken, and every seat is green. */
export function shouldStart(t: TableState, lights: Light[]): boolean {
  return t.status === "lobby" && t.dmReady && lights.length > 0 && lights.every((l) => l === "green")
}

/** Why a player may not sit right now, or null if they may. */
export function cannotSit(t: TableState, seatsTaken: number, alreadySeated: boolean): string | null {
  if (alreadySeated) return null
  if (t.status === "closed") return "The table is not set yet. Wait for the Dungeon Master."
  if (t.status === "live") return "This session has already begun. You can join the next one."
  if (seatsTaken >= MAX_SEATS) return "Every seat at the table is taken."
  return null
}

/** The lowest seat number (1..MAX_SEATS) nobody holds, or null if the table is full. */
export function freeSeatNumber(taken: (number | undefined)[]): number | null {
  const held = new Set(taken.filter((n): n is number => typeof n === "number"))
  for (let n = 1; n <= MAX_SEATS; n++) if (!held.has(n)) return n
  return null
}

/** Normalise whatever is stored in the flag into a TableState (an absent or garbled row is closed). */
export function readTableState(value: unknown): TableState {
  const v = (value && typeof value === "object" ? value : {}) as Partial<TableState>
  const status: TableStatus = v.status === "lobby" || v.status === "live" ? v.status : "closed"
  return {
    status,
    dmReady: status !== "closed" && Boolean(v.dmReady),
    session: typeof v.session === "number" ? v.session : 0,
    openedAt: typeof v.openedAt === "string" ? v.openedAt : null,
    startedAt: typeof v.startedAt === "string" ? v.startedAt : null,
  }
}

// --- What counts as ready -----------------------------------------------------------------------

/**
 * The four canon heroes whose pixel figures are baked into the map (template.html PLAYS_AS), keyed BY
 * characters.id — the canon heroes are being renamed (Sam, 2026-10-25: "Kenta of Neverwinter", "Fifi of
 * Waterdeep", … — lib/canon-heroes.ts on the hero-chooser lane), and a name match would turn all four red
 * the moment the rows change. A hero made at the Forge has a figure only once it is listed in
 * scripts/velkynvelve-walk/heroes.json; until then the map dresses them in their class's stand-in, which is
 * not "their" pixel art.
 */
export const PREMADE_SPRITE_IDS = [
  "51e4202d-b4d5-4658-a9c1-6102713e77f1", // Kenta
  "d00aa5b8-ced1-477d-9ec8-0861cca55498", // Fifi
  "88cc9dd1-b0fe-4e62-9829-f84aafe3c066", // Scott
  "be060806-9938-4afd-9cf6-ad298d9eaa97", // Samson
]

export type CharacterRowForReadiness = {
  id: string
  name: string
  class?: string | null
  level?: number | null
  sheet_species?: string | null
  hp_max?: number | null
  ac?: number | null
  str_score?: number | null
  dex_score?: number | null
  con_score?: number | null
  int_score?: number | null
  wis_score?: number | null
  cha_score?: number | null
  voice_id?: string | null
  portrait_image_url?: string | null
  avatar_image_url?: string | null
  face_image_url?: string | null
  idle_url?: string | null
}

export const READINESS_COLUMNS =
  "id, name, class, level, sheet_species, hp_max, ac, str_score, dex_score, con_score, int_score, wis_score, cha_score, voice_id, portrait_image_url, avatar_image_url, face_image_url, idle_url"

const filled = (s: string | null | undefined) => typeof s === "string" && s.trim().length > 0
const positive = (n: number | null | undefined) => typeof n === "number" && n > 0

/**
 * "Complete" is the minimum the game reads to play a character: class, species, level, hit points,
 * armour class and all six ability scores. Backstory and personality are welcome but not required.
 */
export function sheetComplete(c: CharacterRowForReadiness): boolean {
  return filled(c.class) && filled(c.sheet_species) && positive(c.level) && positive(c.hp_max) && positive(c.ac)
    && [c.str_score, c.dex_score, c.con_score, c.int_score, c.wis_score, c.cha_score].every(positive)
}

export function readinessOf(c: CharacterRowForReadiness, heroSprites: Record<string, string>): Readiness {
  return {
    sprite: PREMADE_SPRITE_IDS.includes(c.id) || typeof heroSprites[c.id] === "string",
    sheet: sheetComplete(c),
    voice: filled(c.voice_id),
    thumbnail: filled(c.portrait_image_url) || filled(c.avatar_image_url) || filled(c.face_image_url),
  }
}
