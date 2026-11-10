// lib/session-guard.ts — who may stay on an in-game page (Sam, 2026-10-25: "we need a button that gets me
// to end the game and kicks everyone out").
//
// The DM's End button (/api/table action "end") empties the seats and closes the table. Every in-game page
// then re-reads /api/table every few seconds and sends anyone without a live seat back to the table — the
// Underwalk already did this (app/velkynvelve/page.tsx); components/session-guard.tsx does it for the rest.
// Pure: the component does the fetching and the navigating.

/** In-game pages a player may only be on while their seat is live. The Underwalk guards itself. */
export const GUARDED_PATHS = ["/", "/awaken", "/camp", "/cave", "/map", "/bench"] as const

export function isGuardedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const p = pathname.replace(/\/+$/, "") || "/"
  return GUARDED_PATHS.some((g) => (g === "/" ? p === "/" : p === g || p.startsWith(g + "/")))
}

export type TableReply = {
  error?: string
  /** The id of the campaign run the server is on right now (changes on every New Game). */
  run?: string | null
  isDm?: boolean
  state?: { status?: string } | null
  mine?: { away?: boolean; id?: string } | null
} | null

/**
 * "stay" or "leave". The DM (signed in as DM on this browser) always stays. A player stays only while the
 * session is live and they hold a seat the DM has not stepped them out of. A table that could not be read never throws anyone out — a network
 * blip must not kick the family mid-scene.
 */
export function guardVerdict(reply: TableReply, role: string | null | undefined): "stay" | "leave" {
  if (!reply || reply.error) return "stay"
  if (reply.isDm && role === "dm") return "stay"
  if (reply.state?.status === "live" && reply.mine && !reply.mine.away) return "stay"
  return "leave"
}

/**
 * Has the campaign been reset under this screen? (Sam, 2026-11-10: a reset should "close out all instances
 * of the game everywhere even DM screens".) Every New Game ends the run and opens the next one, so a page
 * that loaded under one run and now hears of another is showing a world that no longer exists. Unlike
 * guardVerdict this has NO exception for the DM: his map and dashboard windows close too.
 * `seen` is the run this page first heard of; either side unknown means "cannot tell", which is never a reset.
 */
export function wasReset(seen: string | null | undefined, reply: TableReply): boolean {
  if (!reply || reply.error) return false
  if (!seen || !reply.run) return false
  return seen !== reply.run
}

/**
 * Where a screen goes when the campaign was reset under it. A window the game opened itself (the DM's second
 * window) can simply close; a browser refuses to close a tab the person opened by hand, so that one falls
 * back to the table, which after a reset is the clean lobby.
 */
export const AFTER_RESET_PATH = "/table"
