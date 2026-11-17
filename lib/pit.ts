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

export type PitFirstInput = {
  /** The campaign run the table reports (changes on every New Game). Unknown → never the Pit. */
  run: string | null | undefined
  characterId: string
  name: string | null | undefined
  /** Has this hero already rolled their fortune this run? Then it is a saved game: no Pit. */
  rolled: boolean
  /** What PIT_DONE_KEY holds in this browser. */
  done: string | null | undefined
}

/** Does this hero fight in the Pit before the awakening? */
export function pitComesFirst(i: PitFirstInput): boolean {
  if (!i.run || !i.characterId) return false
  if (i.rolled) return false
  if (!pitHeroKey(i.name)) return false
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

/** The frame's address. `film` off skips the entrance film (Cinematics off); `sound` off starts it silent. */
export function pitSrc(me: PitHero, party: readonly PitHero[], opts: { film: boolean; sound: boolean }): string {
  const q = new URLSearchParams({ embed: "1", me, party: party.join(","), film: opts.film ? "1" : "0", snd: opts.sound ? "1" : "0" })
  return `${PIT_FRAME}?${q.toString()}`
}

/** A DM trying the Pit without a seat: /pit?try=fifi,kenta. Unknown names are dropped; nothing usable → null. */
export function pitTryParty(raw: string | null | undefined): PitHero[] | null {
  const list = (raw ?? "").split(",").map((s) => pitHeroKey(s)).filter((k): k is PitHero => k !== null)
  const uniq = Array.from(new Set(list))
  return uniq.length ? uniq : null
}
