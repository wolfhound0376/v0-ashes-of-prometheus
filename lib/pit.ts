// lib/pit.ts — THE PIT, the prologue before the pen (Sam, 2026-11-16: a pixel arena fight that "begins BEFORE
// the heroes wake in the pen"; "the video sequence plays before the fight, fades into the pixel fight, then
// fades out into the Awakening").
//
// The fight itself is a self-contained canvas game in public/pit-arena/ (framed by app/pit/page.tsx the way
// /cave frames public/cave-pov/). This file is the small set of rules the game shares about it:
//
//   WHO GOES     a seated hero starting a NEW game (fortune not rolled yet) whose pixel art exists in the Pit.
//                Today that is the four originals. Anyone else walks straight on to /awaken.
//   ONCE         once per campaign run, per hero. Winning writes PIT_DONE_KEY = "<run>:<characterId>" in this
//                browser; /awaken reads it. A run the table could not name sends nobody to the Pit, so a
//                network blip can never loop a player through it.
//   TOGETHER     (Sam, 2026-11-20: "Fifi tried to play with me but was waiting and didn't enter the pit with us." Kenta
//                was new to a campaign Fifi had already woken in, so he got the Pit and she stood at the gate.) When
//                a session starts and ANY seated hero still owes the Pit, every seated hero with Pit art goes in,
//                the ones who have already rolled their fortune too: once per session for them
//                (pitSessionDoneValue). They roll nothing afterwards; /awaken shows them the Act card as before.
//   WHO IS IN IT only the characters who enter (Sam, 2026-11-16): the seated heroes with Pit art, this
//                browser's hero first. Each player fights on their own screen; the other heroes are played by
//                the Pit itself. Nothing about the fight is written to the world.
//
// Pure: no Supabase, no window.

export const PIT_PATH = "/pit"
/** The framed game (public/pit-arena/index.html). Not /pit/…: that is the page's own route. */
export const PIT_FRAME = "/pit-arena/index.html"
export const PIT_DONE_KEY = "aop_pit_done"

/** Heroes the Pit has pixel art, attacks and voices for. Keys are the hero's first name, lower-case. */
export const PIT_HEROES = ["fifi", "kenta", "samson", "scott"] as const
export type PitHero = (typeof PIT_HEROES)[number]

/** "Fifi Nightbreeze" → "fifi"; a hero the Pit cannot draw → null. */
export function pitHeroKey(name: string | null | undefined): PitHero | null {
  const first = (name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? ""
  return (PIT_HEROES as readonly string[]).includes(first) ? (first as PitHero) : null
}

export const pitDoneValue = (run: string, characterId: string) => `${run}:${characterId}`
/** A hero who had already woken in this campaign and went in with the table: done for this SESSION only. */
export const pitSessionDoneValue = (run: string, session: number, characterId: string) => `${run}:s${session}:${characterId}`
/** What winning writes for this hero, and what sends them past the Pit next time. */
export const pitDoneFor = (run: string, session: number | null | undefined, characterId: string, rolled: boolean) =>
  rolled ? pitSessionDoneValue(run, typeof session === "number" ? session : 0, characterId) : pitDoneValue(run, characterId)

/** Does anyone seated still owe the Pit? Seated, not DM-run, not excused, has Pit art, and has not rolled their fortune. */
export function pitOwedBy(seats: readonly { id: string; name: string; dm?: boolean; away?: boolean }[], rolledIds: ReadonlySet<string>): string[] {
  return seats.filter((s) => !s.dm && !s.away && pitHeroKey(s.name) !== null && !rolledIds.has(s.id)).map((s) => s.id)
}

export type PitFirstInput = {
  /** The campaign run the table reports (changes on every New Game). Unknown → never the Pit. */
  run: string | null | undefined
  characterId: string
  name: string | null | undefined
  /** Has this hero already rolled their fortune this run? Then it is a saved game: no Pit, unless the table goes. */
  rolled: boolean
  /** Does another seated hero still owe the Pit (the table's `pitDue`)? Then a hero who has rolled goes in with them. */
  partyDue?: boolean
  /** The table's session number: a hero who has rolled goes in once per session. */
  session?: number | null
  /** What PIT_DONE_KEY holds in this browser. */
  done: string | null | undefined
}

/** Does this hero fight in the Pit before the awakening? */
export function pitComesFirst(i: PitFirstInput): boolean {
  if (!i.run || !i.characterId) return false
  if (!pitHeroKey(i.name)) return false
  if (i.rolled) return i.partyDue === true && i.done !== pitDoneFor(i.run, i.session, i.characterId, true)
  return i.done !== pitDoneValue(i.run, i.characterId)
}

export type PitSeat = { id: string; name: string; away?: boolean }

/** Who enters, this browser's hero first. `me` null: this hero has no Pit art. */
export function pitParty(myId: string, myName: string | null | undefined, seats: readonly PitSeat[]): { me: PitHero | null; party: PitHero[] } {
  const me = pitHeroKey(myName)
  if (!me) return { me: null, party: [] }
  const others = seats
    .filter((s) => s.id !== myId && !s.away)
    .map((s) => pitHeroKey(s.name))
    .filter((k): k is PitHero => k !== null && k !== me)
  return { me, party: [me, ...Array.from(new Set(others))] }
}

/** The frame's address. `film` off skips the entrance film (Cinematics off); `sound` off starts it silent.
 *  `net` on: this screen joins the table's ONE shared fight (public/pit-arena: THE PIT, TOGETHER). */
export function pitSrc(me: PitHero, party: readonly PitHero[], opts: { film: boolean; sound: boolean; net?: boolean }): string {
  const q = new URLSearchParams({ embed: "1", me, party: party.join(","), film: opts.film ? "1" : "0", snd: opts.sound ? "1" : "0" })
  if (opts.net) q.set("net", "1")
  return `${PIT_FRAME}?${q.toString()}`
}

// THE PIT, TOGETHER (Sam, 2026-11-20: "Fifi and Kenta playing together were not synced. We played different instances.")
// Every screen of a table joins one realtime channel for the run's session. One of them runs the fight (the HOST) and the
// rest show it and send their hero's moves. The host is the player who has been in the Pit longest: it stays the host while
// it is here, and passes to the next when it leaves. Every screen works this out from the same presence list, so they agree.

/** The realtime channel a table's Pit fight runs on. */
export const pitChannel = (run: string, session: number | null | undefined) => `pit:${run}:s${typeof session === "number" ? session : 0}`

export type PitMember = { key: string; at: number }

/** Who is here (heroes of this party, once each, earliest first) and which of them runs the fight. */
export function pitRoles(members: readonly PitMember[], party: readonly string[], me: string): { host: string | null; role: "host" | "client" | null; present: string[] } {
  const first = new Map<string, number>()
  for (const m of members) {
    if (!m || !party.includes(m.key) || typeof m.at !== "number") continue
    const was = first.get(m.key)
    if (was === undefined || m.at < was) first.set(m.key, m.at)
  }
  const order = (k: string) => (PIT_HEROES as readonly string[]).indexOf(k)
  const present = Array.from(first.keys()).sort((a, b) => (first.get(a)! - first.get(b)!) || order(a) - order(b))
  const host = present[0] ?? null
  return { host, role: host === null ? null : host === me ? "host" : "client", present }
}

/** A DM trying the Pit without a seat: /pit?try=fifi,kenta. Unknown names are dropped; nothing usable → null. */
export function pitTryParty(raw: string | null | undefined): PitHero[] | null {
  const list = (raw ?? "").split(",").map((s) => pitHeroKey(s)).filter((k): k is PitHero => k !== null)
  const uniq = Array.from(new Set(list))
  return uniq.length ? uniq : null
}
