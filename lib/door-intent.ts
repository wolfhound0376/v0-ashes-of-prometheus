// WHY YOU CAME THROUGH THE DOOR (Sam, 2026-11-23: "PR3" — the front door's four buttons).
//
// New Campaign and Load Game both pass through the DM door (/dm: the code, then your hero) and land on the
// table, because that is where New Game and the shelf of saved games live. Continue, for the host, lands on the
// table too. The table should not make them hunt for what they came for, so the title screen leaves a note in
// this tab saying why, and /table acts on it once:
//   open  the host (or DM) pressed Continue on a dark table → the table opens itself, one click total
//   new   New Campaign → the New Game panel is brought into view and lit
//   load  Load Game    → the shelf of saved games is brought into view and lit
//
// sessionStorage, so it belongs to this tab only; and it goes stale after half an hour, so a note left by an
// abandoned trip never fires the next evening. Pure: the storage calls are in the pages.

export const DOOR_INTENT_KEY = "aop_door_then"
export const DOOR_INTENT_MS = 30 * 60 * 1000

export type DoorIntent = "open" | "new" | "load"

export function intentValue(i: DoorIntent, now = Date.now()): string {
  return `${i}@${now}`
}

export function readIntent(raw: string | null | undefined, now = Date.now()): DoorIntent | null {
  if (!raw) return null
  const [i, at] = raw.split("@")
  const t = Number(at)
  if (i !== "open" && i !== "new" && i !== "load") return null
  if (!Number.isFinite(t) || now - t > DOOR_INTENT_MS || t > now + 60_000) return null
  return i
}
