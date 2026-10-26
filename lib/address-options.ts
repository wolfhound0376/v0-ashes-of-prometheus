// WHO CAN A LINE BE SAID TO (Sam, 2026-10-26: "Give me an option to answer the guard or whomever or the DM").
//
// The "To:" picker beside the send box lists the people a player could plausibly be answering: the face in the
// NPC window, the conversation partner, whoever has spoken lately (the drow guard who just barked "Move." is
// usually NOT in the window — the window belongs to the partner), and everyone else on stage. The DM is always
// offered by the picker itself, after these. Pure, so it is tested without a browser.

import { resolveAddressee } from "@/lib/address"

type Named = { name: string; aliases?: string[] | null }

/** Log speakers that are never a person in the scene. */
const NOT_A_PERSON = /^(malachar|narrator|system|dm|the dm|dungeon master|\?|player)$/i

export interface AddressOptionsInput {
  /** The face in the NPC window right now. */
  window: string | null
  /** Who the player sat down to talk with (map/camp talk), if anyone. */
  partner: string | null
  /** NPCs on stage (is_active). */
  onStage: ReadonlyArray<Named>
  /** The whole NPC roster, to turn a log speaker into a canonical name. */
  roster: ReadonlyArray<Named>
  /** Speakers from the log, NEWEST FIRST. */
  recentSpeakers: ReadonlyArray<string | null | undefined>
  /** Player characters' names: never offered (the picker is for the scene, not the table). */
  players: ReadonlyArray<string>
  max?: number
}

export function addressOptions(input: AddressOptionsInput): string[] {
  const max = input.max ?? 8
  const players = new Set(input.players.map((p) => p.toLowerCase()))
  const out: string[] = []
  const seen = new Set<string>()
  const add = (name: string | null | undefined) => {
    const n = (name ?? "").trim()
    if (!n || NOT_A_PERSON.test(n) || players.has(n.toLowerCase())) return
    const key = n.toLowerCase()
    if (seen.has(key)) return
    // "Eldeth" in the window and "Eldeth Feldrun" in the log are one person: the first spelling wins.
    for (const s of seen) if (s.split(/\s+/)[0] === key.split(/\s+/)[0] && (s.startsWith(key) || key.startsWith(s))) return
    seen.add(key)
    out.push(n)
  }
  add(input.window)
  add(input.partner)
  for (const raw of input.recentSpeakers) {
    if (!raw) continue
    // Only someone the roster knows: a log line from an unknown name is not offered as a person to answer.
    const canon = resolveAddressee(raw, input.roster) ?? resolveAddressee(raw, input.onStage)
    if (canon) add(canon)
  }
  for (const n of input.onStage) add(n.name)
  return out.slice(0, max)
}
