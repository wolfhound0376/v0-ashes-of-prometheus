// SAFE-MOMENT RELOAD — when a stale tab may refresh itself (components/build-watch.tsx does it).
//
// Sam, 2026-11-23, asking for a fix to "cache memory": a tab keeps the code it loaded until something makes it let
// go. BuildWatch has always noticed a newer build and shown a notice, and never reloaded by itself, because reloading
// a page out from under someone mid-scene at a live table is worse than old code. Research of record: project doc
// claude/Tables_Invites_Saves_Research_2026-11-23.md, section E.3.
//
// So the tab reloads itself only at a SAFE MOMENT: on a page between scenes, where everything worth keeping already
// lives on the server — the title, the table, a room-code landing page, the hero chooser, the code door — and never
// while someone is typing into a box there. Everywhere else (the map, the Pit, the cave, camp, the dashboard, the
// Forge) the polite notice stays, and the tab refreshes itself the next time it reaches one of these pages.
//
// It reloads once per new build. If the reload comes back still old (the new build has not reached this browser's
// edge yet), it falls back to the notice instead of reloading in a loop.

/** Pages where a reload loses nothing. "/t/" is the room-code landing page (/t/VKRT). */
export const SAFE_RELOAD_PATHS = ["/intro", "/table", "/join", "/choose"] as const
export const SAFE_RELOAD_PREFIXES = ["/t/"] as const

/** sessionStorage: the live build this tab already reloaded itself for. */
export const RELOADED_FOR_KEY = "aop_reloaded_for"

export function isSafePage(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const path = pathname.replace(/\/+$/, "") || "/"
  return (SAFE_RELOAD_PATHS as readonly string[]).includes(path) || SAFE_RELOAD_PREFIXES.some((p) => path.startsWith(p))
}

/** Is someone typing? A focused text box, list or editable area. */
export function isTyping(el: { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined): boolean {
  if (!el || !el.tagName) return false
  if (el.isContentEditable) return true
  const tag = el.tagName.toUpperCase()
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag !== "INPUT") return false
  const type = (el.type || "text").toLowerCase()
  return !["button", "submit", "reset", "checkbox", "radio", "range", "color", "file", "image"].includes(type)
}

export type ReloadInput = {
  mine: string              // this tab's build, baked in when it was compiled
  live: string | null       // what production serves now (null before the first answer)
  pathname: string | null
  typing: boolean
  reloadedFor: string | null // RELOADED_FOR_KEY
}

/** Stale at all? Quiet in development, quiet before the first answer. */
export function isStale(mine: string, live: string | null): boolean {
  return Boolean(live) && live !== mine && mine !== "dev"
}

/** "reload" now, "wait" (safe page, someone typing — ask again shortly), or "notice" (show the banner). */
export function reloadDecision(i: ReloadInput): "none" | "reload" | "wait" | "notice" {
  if (!isStale(i.mine, i.live)) return "none"
  if (i.reloadedFor && i.reloadedFor === i.live) return "notice"   // already tried for this build: no loop
  if (!isSafePage(i.pathname)) return "notice"
  return i.typing ? "wait" : "reload"
}
