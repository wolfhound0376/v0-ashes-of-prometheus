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
  isDm?: boolean
  state?: { status?: string } | null
  mine?: unknown
} | null

/**
 * "stay" or "leave". The DM (signed in as DM on this browser) always stays. A player stays only while the
 * session is live and they hold a seat. A table that could not be read never throws anyone out — a network
 * blip must not kick the family mid-scene.
 */
export function guardVerdict(reply: TableReply, role: string | null | undefined): "stay" | "leave" {
  if (!reply || reply.error) return "stay"
  if (reply.isDm && role === "dm") return "stay"
  if (reply.state?.status === "live" && reply.mine) return "stay"
  return "leave"
}
