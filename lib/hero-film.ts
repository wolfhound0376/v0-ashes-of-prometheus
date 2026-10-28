// lib/hero-film.ts — when a forged hero's own intro film plays (Sam, 2026-10-27: "make sure this plays
// whenever lynkes plays for the first time or restarts campaign").
//
// The film used to live only inside /awaken, gated behind the fortune roll and the Cinematics switch.
// Tonight (2026-10-27) the campaign was restarted at 17:02 and nobody rolled a fortune afterwards, so
// nobody finished /awaken — Lynkes reached the game by a route that never passed the film.
//
// Now "has seen their film" is a fact about ONE RUN of the story, kept in world_flags under
// `hero_film_seen:<characterId>`. A first game has no flag; a restart deletes every flag
// (lib/restart-campaign.ts step 2b), so the film plays again after a restart. Whichever page the hero
// lands on first plays it: /awaken in its own sequence, every other in-game page through
// components/hero-film-gate.tsx. It ignores the Cinematics switch on purpose — this is the hero's one
// film, not ambient show — but Skip always works, and skipping still counts as seen.
//
// Pure: no fetch, no DOM.

export const HERO_FILM_SEEN_PREFIX = "hero_film_seen:"

export function heroFilmSeenKey(characterId: string): string {
  return `${HERO_FILM_SEEN_PREFIX}${characterId}`
}

/**
 * In-game pages where the gate may play the film. /awaken is NOT here: it plays the film inside its own
 * sequence. Doors (/table, /join, /intro, /choose, /forge) are not here either: the film belongs to
 * the first step INTO the story, not to the waiting room.
 */
export const FILM_GATE_PATHS = ["/", "/camp", "/cave", "/map", "/bench", "/velkynvelve"] as const

export function isFilmGatePath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  const p = pathname.replace(/\/+$/, "") || "/"
  return FILM_GATE_PATHS.some((g) => (g === "/" ? p === "/" : p === g || p.startsWith(g + "/")))
}

export type FilmReply = { film?: unknown; seen?: unknown } | null | undefined

/** The film to play now, or null. A reply that could not be read plays nothing (never a guess). */
export function filmToPlay(reply: FilmReply, role: string | null | undefined): string | null {
  if (role === "dm") return null
  if (!reply || typeof reply.film !== "string" || !reply.film) return null
  if (reply.seen === true) return null
  return reply.film
}
