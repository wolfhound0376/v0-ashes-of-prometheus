// THE GAME DIES WITH THE PARTY — the rule, pure (route: app/api/game-over/route.ts).
//
// Sam, 2026-11-15: "If everyone dies, then the game is deleted after game over. It's also a hard reset."
//
// So a wiped table is not a save you can go back to. When every hero seated at the table is dead:
//   1. the campaign is hard-reset: the same wipe as New Game (lib/restart-campaign.ts: a new run, every world flag
//      cleared, heroes back on their starting sheets, the party back in the slave pen);
//   2. the save that was in play is DELETED from the shelf (lib/save-store.ts), not shelved as New Game does;
//   3. the table closes and its seats empty, so every open screen goes back to the table (lib/session-guard.ts);
//   4. the fresh world goes on the shelf as a new save, ready for the host to open.
// A rehearsal (sandbox) keeps resetting itself on the map and never comes here. A game over that is not a death
// (the march out in chains lost: lib/game-over.mjs `why`) is not covered by this rule and keeps the DM's restart.
//
// The server decides, never the page: a screen asks, and the route checks the shared world (walk_world: who has
// fallen, which seat plays which hero) against the seats before anything is touched.

export type SeatLite = { id: string; dm?: boolean }
export type HeroLite = { cid?: string | null } | null | undefined

/** The world flag that claims the wipe for this run (world_flags is keyed by campaign + key, so only one screen wins). */
export const WIPE_FLAG = "game_over_wipe"

/**
 * Is every hero at the table dead, as the shared world records it? `seats` are the table's seats (the DM's is not a
 * hero), `heroes` the map's walkers by slug (each with the seat's character id), `fallen` the slugs of the dead.
 * A seat whose hero the world does not know cannot be shown dead, so it keeps the game alive.
 */
export function wipeVerdict(seats: readonly SeatLite[], heroes: Record<string, HeroLite>, fallen: readonly unknown[]):
  { ok: true; dead: string[] } | { ok: false; why: string } {
  const players = seats.filter((s) => s && typeof s.id === "string" && !s.dm)
  if (!players.length) return { ok: false, why: "Nobody is seated at the table." }
  const dead = new Set(fallen.filter((f): f is string => typeof f === "string"))
  const slugOf = new Map<string, string>()
  for (const [slug, h] of Object.entries(heroes ?? {})) if (h && typeof h.cid === "string") slugOf.set(h.cid, slug)
  const out: string[] = []
  for (const s of players) {
    const slug = slugOf.get(s.id)
    if (!slug) return { ok: false, why: "A seated hero is not on the map, so the table cannot be shown dead." }
    if (!dead.has(slug)) return { ok: false, why: "Not every hero at the table is dead." }
    out.push(slug)
  }
  return { ok: true, dead: out }
}
