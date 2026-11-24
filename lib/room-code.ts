// THE ROOM CODE — four letters that let a friend into the table (Sam, 2026-11-23: "PR2"; four letters was
// Claude's suggestion and Sam's pick: "your suggestion"). Research of record: project doc
// claude/Tables_Invites_Saves_Research_2026-11-23.md, section C.
//
// HOW IT WORKS (the Jackbox / Roll20 pattern)
//   - Opening the table makes a code, e.g. VKRT, and a link ashes.playacartagena.com/t/VKRT. The host sees the
//     code big, a Copy link button, a Share button (texts it from a phone) and a QR code for the screen.
//   - The link IS the invitation: a hero who arrives with a live code has their seat opened, exactly as if the
//     host had pressed "Open a seat" for them. A friend with no hero yet is sent to their words or to make one.
//   - The code dies when the table closes. Removing, withdrawing or excusing someone makes a NEW code, so an old
//     link cannot walk them back in (Roll20 changes its join link when a player is kicked, for the same reason).
//   - Only the DM and the host ever see the code; the table answers everyone else without it.
//
// THE LETTERS. Consonants only, so a code can never spell a word (rude or otherwise), and none that are easy to
// misread or mishear: no vowels (and so no I or O to mistake for 1 and 0), no Y. 20 letters, 160,000 codes.
//
// Pure: no Supabase, so it can be tested.

export const ROOM_CODE_LENGTH = 4
export const ROOM_CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ"

/** localStorage: the code a followed link brought, kept for the trip through /join or the hero chooser. */
export const PENDING_CODE_KEY = "aop_table_code"
/** A followed link counts for this long; a code still sitting in a browser next week is not an invitation. */
export const PENDING_CODE_MS = 2 * 60 * 60 * 1000

/** A fresh code. `rand` is injectable for tests; defaults to crypto randomness where the platform has it. */
export function makeRoomCode(rand: () => number = secureRandom): string {
  let out = ""
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_CODE_LETTERS[Math.floor(rand() * ROOM_CODE_LETTERS.length) % ROOM_CODE_LETTERS.length]
  return out
}

/** A different code from `old` (a kick must actually change it). */
export function freshRoomCode(old: string | null | undefined, rand: () => number = secureRandom): string {
  for (let i = 0; i < 20; i++) {
    const c = makeRoomCode(rand)
    if (c !== old) return c
  }
  return makeRoomCode(rand)
}

/** What someone typed or followed, cleaned up: upper case, letters only. Null if it cannot be a code. */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null
  const c = raw.toUpperCase().replace(/[^A-Z]/g, "")
  return isRoomCode(c) ? c : null
}

export function isRoomCode(c: unknown): c is string {
  return typeof c === "string" && c.length === ROOM_CODE_LENGTH && [...c].every((ch) => ROOM_CODE_LETTERS.includes(ch))
}

/** Does this followed code open this table? Only a live code on an open table does. */
export function codeOpens(tableCode: string | null | undefined, status: string, given: unknown): boolean {
  const g = normalizeRoomCode(given)
  return Boolean(g && tableCode && status !== "closed" && g === tableCode)
}

/** The link the host shares. */
export function roomLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/t/${code}`
}

/** The pending code a link left in this browser, if it is still fresh. Stored as "<code>@<ms>". */
export function readPendingCode(raw: string | null | undefined, now = Date.now()): string | null {
  if (!raw) return null
  const [code, at] = raw.split("@")
  const c = normalizeRoomCode(code)
  const t = Number(at)
  if (!c || !Number.isFinite(t) || now - t > PENDING_CODE_MS || t > now + 60_000) return null
  return c
}

export function pendingCodeValue(code: string, now = Date.now()): string {
  return `${code}@${now}`
}

function secureRandom(): number {
  try {
    const a = new Uint32Array(1)
    globalThis.crypto.getRandomValues(a)
    return a[0] / 2 ** 32
  } catch {
    return Math.random()
  }
}
