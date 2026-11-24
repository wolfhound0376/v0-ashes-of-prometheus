// THE TITLE SCREEN READS THE TABLE (Sam, 2026-11-10: "a high end solution that is easy and attractive
// (expeditious)"; design of record: project doc claude/One_Door_Entry_Flow_2026-11-10.md).
//
// Before this the title screen showed the same three buttons whether the table was dark, open or
// live, and "Continue" sent a player through the dashboard and the map before the session guard
// bounced them to the table. Now the door looks at two things — who this browser is, and what the
// table is doing — and puts ONE obvious button first.
//
// Sam's labels (2026-11-10): "Saved Game is fine" (not "I Have My Words"); New Hero and Take Your
// Seat approved ("2. Yes"); the DM link reads "Host a Game" ("the 'DM' can be changed to host the game").
//
// Pure: no window, no fetch. app/intro/page.tsx does the reading and the navigating.

import type { DoorIntent } from "@/lib/door-intent"

export type DoorWho = "none" | "player" | "dm"
/** "unknown" = the table could not be read (offline, first paint). Never a reason to block anyone. */
export type DoorTable = "unknown" | "closed" | "lobby" | "live"

/**
 * One button on the door. `door`: this button goes through the DM door (/dm), so the title screen stamps the tab
 * first (lib/dm-door.ts). `intent`: what /table should do on arrival (lib/door-intent.ts). The Join button has
 * no href: it is the room-code field.
 */
export type DoorButton = { key: "continue" | "new" | "load" | "join"; label: string; sub: string; href: string | null; door?: boolean; intent?: DoorIntent }
export type DoorMenu = {
  /** The pill above the buttons. `open` null = say nothing (the table could not be read). */
  status: { open: boolean | null; text: string }
  /** Always in this order: Continue (only for someone who has played here), New Campaign, Load Game, Join a Table. */
  buttons: DoorButton[]
  /** The one lit button: Continue when there is one, otherwise Join a Table. */
  primary: DoorButton["key"]
  /** The small links under the code field: Saved Game and New Hero always; The Table for a host mid-session. */
  links: DoorLink[]
}

export type DoorLink = { label: string; sub: string; href: string }

/** The second small corner link (Sam, 2026-11-10: "a clean way" into the sandbox from the title). It goes to
 *  /rehearsal, which asks for the DM code once and then opens the sandbox map — no table, no host, no save. */
export const REHEARSAL_LINK_LABEL = "Rehearsal"
export const REHEARSAL_HREF = "/rehearsal"

/** The small links under the room-code field, for someone with no link to follow. Sam's label: "Saved Game is fine". */
export const SAVED_GAME_LINK: DoorLink = { label: "Saved Game", sub: "Your three words", href: "/join" }
export const NEW_HERO_LINK: DoorLink = { label: "New Hero", sub: "Choose or forge one", href: "/choose" }
/** The host, mid-session, can always get back to the table to end it or step a player out (2026-11-10). */
export const HOST_TABLE_LINK: DoorLink = { label: "The Table", sub: "End, or step a player out", href: "/table" }

function statusOf(table: DoorTable): DoorMenu["status"] {
  if (table === "lobby") return { open: true, text: "The table is open" }
  if (table === "live") return { open: true, text: "A session is underway" }
  if (table === "closed") return { open: false, text: "The table is dark" }
  return { open: null, text: "" }
}

/**
 * THE FRONT DOOR (Sam, 2026-11-23: "PR3"; research doc claude/Tables_Invites_Saves_Research_2026-11-23.md §3A).
 * The BG3 main menu: Continue, New Campaign, Load Game, Join a Table. Continue still reads the table (2026-11-10)
 * and says where it will take you; the other three never change, so the door is learned once.
 *
 * `seat`: what the table says about this player's own chair. `heroName` is only for the sub-line. `isHost`:
 * this browser's hero hosts the campaign (a label only — the table checks the claim before it obeys).
 */
export function doorMenu(who: DoorWho, table: DoorTable, seat: { seated: boolean; away: boolean } = { seated: false, away: false }, heroName: string | null = null, isHost = false): DoorMenu {
  const status = statusOf(table)
  const as = heroName ? `As ${heroName}.` : "Your hero is remembered on this device."
  const cont = continueButton(who, table, seat, as, isHost)
  const buttons: DoorButton[] = [
    ...(cont ? [cont] : []),
    // Only people with the key start a campaign (Sam, 2026-11-10). The door asks for it.
    { key: "new", label: "New Campaign", sub: "From the first page. Needs the Dungeon Master's code.", href: "/dm", door: true, intent: "new" },
    // The host loads their own saves without the code; anyone else brings it (Sam, 2026-11-23: any key holder may host).
    isHost
      ? { key: "load", label: "Load Game", sub: "Any saved campaign. You are the host.", href: "/table", intent: "load" }
      : { key: "load", label: "Load Game", sub: "Any saved campaign. Needs the Dungeon Master's code.", href: "/dm", door: true, intent: "load" },
    { key: "join", label: "Join a Table", sub: "Four letters from the host.", href: null },
  ]
  const hostMidSession = isHost && table === "live" && seat.seated && !seat.away
  return { status, buttons, primary: cont ? "continue" : "join", links: hostMidSession ? [HOST_TABLE_LINK, SAVED_GAME_LINK, NEW_HERO_LINK] : [SAVED_GAME_LINK, NEW_HERO_LINK] }
}

function continueButton(who: DoorWho, table: DoorTable, seat: { seated: boolean; away: boolean }, as: string, isHost: boolean): DoorButton | null {
  if (who === "dm") return { key: "continue", label: "Continue", sub: "Back behind the screen.", href: "/" }
  if (who !== "player") return null
  // THE HOST (lib/host.ts) opens their own table — and with Continue it opens itself on arrival.
  if (isHost && table === "closed") return { key: "continue", label: "Continue", sub: `${as} You are the host — the table opens as you arrive.`, href: "/table", intent: "open" }
  if (table === "live" && seat.seated && !seat.away) return { key: "continue", label: "Continue", sub: `${as} Back into the game; your seat is kept.`, href: "/" }
  if (table === "lobby" || table === "unknown") return { key: "continue", label: "Continue", sub: `${as} Take your seat at the table.`, href: "/table" }
  // Dark, or live without a seat (the roster locked without them, or the host stepped them out): the table is
  // still the one place to wait, and it says why.
  const why = table === "live" ? (seat.away ? "The host has stepped you out. Your chair is held." : "This session began without you. Wait for the next one.") : "Wait at the table; you are seated the moment the host opens it."
  return { key: "continue", label: "Continue", sub: `${as} ${why}`, href: "/table" }
}

/** Turn /api/table's `state.status` into a DoorTable; anything unexpected is "unknown". */
export function doorTableOf(status: unknown): DoorTable {
  return status === "closed" || status === "lobby" || status === "live" ? status : "unknown"
}

// ---------------------------------------------------------------------------------------------
// THE OPENING FILM — once per device per campaign run, not once per browser session.
//
// Sam, 2026-10-11: sitting through the intro every time is annoying. It used to replay every game
// night (a new browser session each time). Now a device that has watched it under this run of the
// campaign goes straight to the menu; a New Game (a new run) earns it one more showing, and
// "Watch the opening" brings it back any time.

export const FILM_RUN_KEY = "aop_title_film_run"
/** Stored when the film was seen but the run could not be read. */
export const FILM_RUN_UNKNOWN = "seen"

export function shouldPlayFilm(o: { cinematics: boolean; seenThisSession: boolean; seenRun: string | null; currentRun: string | null }): boolean {
  if (!o.cinematics) return false
  if (o.seenThisSession) return false
  if (!o.seenRun) return true
  // Seen on this device before. Without a run to compare against, do not replay: a failed read
  // must never bring back the film Sam asked not to sit through.
  if (!o.currentRun) return false
  return o.seenRun !== o.currentRun
}
