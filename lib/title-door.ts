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

export type DoorWho = "none" | "player" | "dm"
/** "unknown" = the table could not be read (offline, first paint). Never a reason to block anyone. */
export type DoorTable = "unknown" | "closed" | "lobby" | "live"

export type DoorButton = { key: string; label: string; sub: string; href: string }
export type DoorMenu = {
  /** The pill above the buttons. `open` null = say nothing (the table could not be read). */
  status: { open: boolean | null; text: string }
  primary: DoorButton
  others: DoorButton[]
}

export const HOST_LINK_LABEL = "Host a Game"

const NEW_HERO: DoorButton = { key: "new", label: "New Hero", sub: "Choose one of six, or forge your own.", href: "/choose" }
const SAVED_GAME: DoorButton = { key: "saved", label: "Saved Game", sub: "Played before? Three words bring your hero back.", href: "/join" }

function statusOf(table: DoorTable): DoorMenu["status"] {
  if (table === "lobby") return { open: true, text: "The table is open" }
  if (table === "live") return { open: true, text: "A session is underway" }
  if (table === "closed") return { open: false, text: "The table is dark" }
  return { open: null, text: "" }
}

/**
 * The menu for this browser, right now.
 *
 * `seat`: what the table says about this player's own chair — held (`seated`) and not stepped out
 * by the host (`away`). `heroName` is only for the sub-line; null reads fine.
 */
export function doorMenu(who: DoorWho, table: DoorTable, seat: { seated: boolean; away: boolean } = { seated: false, away: false }, heroName: string | null = null): DoorMenu {
  const status = statusOf(table)
  const as = heroName ? `As ${heroName}.` : "Your hero is remembered on this device."

  if (who === "dm") {
    // Unchanged in this PR: the host model (the host plays, no second window) is the next one.
    return {
      status,
      primary: { key: "continue", label: "Continue", sub: "Back behind the screen", href: "/" },
      others: [NEW_HERO, SAVED_GAME],
    }
  }

  if (who === "player") {
    const elsewhere = [{ ...NEW_HERO, sub: "Play someone else." }, { ...SAVED_GAME, sub: "A different hero? Three words bring them back." }]
    if (table === "live" && seat.seated && !seat.away) {
      return { status, primary: { key: "return", label: "Return to the Game", sub: `${as} Your seat is kept.`, href: "/" }, others: elsewhere }
    }
    if (table === "lobby" || table === "unknown") {
      return { status, primary: { key: "seat", label: "Take Your Seat", sub: `${as} Straight to the table.`, href: "/table" }, others: elsewhere }
    }
    // Dark, or live without a seat (the roster locked without them, or the host stepped them out):
    // the table is still the one place to wait, and it says why.
    const why = table === "live" ? (seat.away ? "The host has stepped you out. Your chair is held." : "This session began without you. Wait for the next one.") : "You are seated the moment the host opens it."
    return { status, primary: { key: "wait", label: "Wait at the Table", sub: `${as} ${why}`, href: "/table" }, others: elsewhere }
  }

  return { status, primary: NEW_HERO, others: [SAVED_GAME] }
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
