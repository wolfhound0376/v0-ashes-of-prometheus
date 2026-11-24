// ONE TAB PLAYS. A browser holds one hero (localStorage is shared by every tab), so two game tabs in the same
// browser are the same hero twice: two screens moving one sprite, two tables, two awakenings. That is how a New
// Game on 2026-11-13 dropped Gandalf straight into the slave pen: a second tab was already on the map and walked
// him in before the first tab's awakening ran.
//
// Rule (Sam said "go PR1" to it, 2026-11-23): the NEWEST game tab wins. When a game page opens or a player
// presses "Play here", it says so on a BroadcastChannel; every other game tab in that browser dims behind a card
// with its own "Play here" button. The dimmed tab keeps running (it stays in step with the table), it just
// cannot be played until it is taken back. Sound needs nothing extra: public/test-copy-silence.js already mutes
// a page that is not the one in use.
//
// Pure: the channel itself is in components/one-tab.tsx.

export const ONE_TAB_CHANNEL = "aop-one-tab"

/** The pages that play as your hero, or seat you. DM tool pages (/cinematics, /admin, previews), the Forge
 *  and the builder are free to sit beside the game. */
export const ONE_TAB_PATHS = [
  "/", "/intro", "/choose", "/join", "/dm", "/table", "/rehearsal",
  "/awaken", "/pit", "/velkynvelve", "/cave", "/camp", "/map",
] as const

/** Does this page take part? A DM rehearsal tab (?sandbox=1) never does: the DM opens it from the live
 *  map on purpose, beside the game. */
export function isOneTabPage(pathname: string | null | undefined, search = ""): boolean {
  if (!pathname) return false
  if (/(^|[?&])sandbox=1(&|$)/.test(search)) return false
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
  return ONE_TAB_PATHS.some((g) => (g === "/" ? p === "/" : p === g || p.startsWith(g + "/")))
}

export type OneTabMessage = { type: "here"; tab: string }

/** Should this tab step aside on hearing `msg`? Only for another tab's claim. */
export function shouldStepAside(msg: unknown, myTab: string): boolean {
  if (!msg || typeof msg !== "object") return false
  const m = msg as Partial<OneTabMessage>
  return m.type === "here" && typeof m.tab === "string" && m.tab !== myTab
}
