// THE MARCH OUT IN CHAINS — the rules, pure, in one copy.
//
// Design of record: project doc claude/Pen_Pacing_And_Sigil_Revision_2026-11-12.md (the caravan clock, PR #1318).
// [SAM] his words; [BOOK] Out of the Abyss; [CLAUDE] Claude's numbers and lines, his to keep, cut or rewrite.
//
//   [SAM 2026-11-12] the clock "runs 6 watches"; "Yes" to the party being marched out in chains for one last,
//             harder escape on the road when it hits zero (not a flat game over).
//   [SAM 2026-11-12] the plate: the rope bridge ("Road: the rope bridge", his pick from four).
//   [SAM 2026-11-12] if they fail that last escape: GAME OVER. They are delivered to Menzoberranzan, Malachar
//             speaks, and the DM gets the usual restart prompt.
//   [BOOK]    Ilvara means to send the prisoners on to Menzoberranzan (OotA ch.1). The north passage "leads toward
//             Menzoberranzan and Blingdenstone" (OotA p.20), so that is the road the column takes and the road a
//             party that gets away is standing on. The book stages no caravan, no bridge and no escort.
//   [CLAUDE]  What makes it HARDER than the pen: the irons are on every wrist again, whatever the party had done
//             about them; the escort is larger than the gate watch (one more drow than there are heroes, never
//             fewer than three, never more than five); and it is fought on a rope bridge over a drop.
//   [CLAUDE]  The column is halted in the MIDDLE of the bridge with the escort split ahead of it and behind it, so
//             neither end is a free run: getting off the plate means getting past drow first.
//   [CLAUDE]  The escort is plain drow guards (the pen's own stat block). No elite warrior, no priestess: at the
//             level a party is when it is still in the pen, a CR 5 on a bridge is an execution, not a chance.
//   [CLAUDE]  What counts as getting away: the escort is beaten, OR at least one hero runs off the plate (the
//             fight's own Flee). What counts as failing: the fight ends any other way. The DM ending the fight by
//             hand is neither: it is his table and his call, and the map leaves it to him.
//   [CLAUDE]  The party's confiscated gear is NOT on the caravan. The book keeps it in Velkynvelve; nothing here
//             moves it. A party that escapes from the bridge escapes with what it had in the pen.
//
// Plain JavaScript for the same reason as lib/game-over.mjs and lib/shakedown.mjs: build_walk.py pastes this file
// into the painted map at its CHAIN_MARCH placeholder, minus `export`. Every name starts with CHAIN_MARCH
// or chainMarch so the paste cannot collide with the page's names.
//
// Pure: no DOM, no fetch, no Supabase.

export const CHAIN_MARCH = {
  plate: "road-rope-bridge",   // [SAM] the battle plate
  via: "north",                // [BOOK] the way out the column takes (lib/travel/handoff.ts "north")
  biome: "tunnels",            // the camp plate that stands in for the north passage on the travel map
  halt: [1200, 700],           // [CLAUDE] where the column stops: the middle of the bridge, a long run from either end
  flank: 300,                  // [CLAUDE] px from the column to the nearest guard ahead and behind
  rank: 90,                    // [CLAUDE] px between one guard and the next on the same side
  guardsMin: 3,                // [CLAUDE]
  guardsMax: 5,                // [CLAUDE]
  takeMs: 5200,                // [CLAUDE] the drow come into the pen: Malachar's line is read before the cut
  bridgeMs: 4200,              // [CLAUDE] the column halts on the bridge before steel
}

/** The two drow guard sprites the walk has stat blocks for. Alternated so the escort is not five of one figure. */
export const CHAIN_MARCH_GUARDS = ["drow-guard-male", "drow-guard-female"]

// Claude's lines (flagged above).
export const CHAIN_MARCH_LINES = {
  taken: "The caravan is here. Up. Wrists out. You had six watches, and you spent them all.",
  note: "The drow chain the prisoners into a column and march them out of Velkynvelve by the north passage.",
  bridge: "The column halts on the rope bridge. A drow bends to free a snagged chain. This is the last chance there will be.",
  escaped: "The chains are behind you, and so is Velkynvelve. The road is yours. For now.",
  lost: [
    "Menzoberranzan, then. They'll find a use for you. They always do. It is never a good one.",
    "Delivered, counted, sold. You had six watches and a bridge. I gave you every chance to amuse me.",
    "And so to the City of Spiders. Don't worry. You won't be bored. You won't be anything, soon.",
  ],
}

/**
 * Is it time? The clock is spent, the party is still held in the pen, and the march has not already begun.
 * `left` is the caravan clock's watches left; `held` is the page's penHeld(); `march` is state.chainMarch.
 */
export function chainMarchDue(left, held, march) {
  if (!held || march) return false
  return Number.isFinite(left) && left <= 0
}

/** The escort for this many heroes: one more guard than heroes, between guardsMin and guardsMax. Foe ids. */
export function chainMarchEscort(heroes) {
  const h = Math.max(0, Math.floor(Number(heroes) || 0))
  const n = Math.max(CHAIN_MARCH.guardsMin, Math.min(CHAIN_MARCH.guardsMax, h + 1))
  return Array.from({ length: n }, (_, i) => CHAIN_MARCH_GUARDS[i % CHAIN_MARCH_GUARDS.length])
}

/**
 * Where each guard stands when the column halts: split ahead of it (east, +x) and behind it (west, -x), the odd one
 * ahead. Returns one {x, y} per guard, in the escort's order; the page sets each on the nearest free floor.
 */
export function chainMarchPosts(count, halt = CHAIN_MARCH.halt) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const out = []
  let ahead = 0, behind = 0
  for (let i = 0; i < n; i++) {
    const front = i % 2 === 0
    const k = front ? ahead++ : behind++
    out.push({ x: halt[0] + (front ? 1 : -1) * (CHAIN_MARCH.flank + k * CHAIN_MARCH.rank), y: halt[1] })
  }
  return out
}

/**
 * How the fight on the bridge came out.
 *   "escaped"  the escort is beaten, or at least one hero got off the plate
 *   "lost"     it ended any other way: Menzoberranzan
 *   null       the DM ended the fight by hand: his call, the map decides nothing
 */
export function chainMarchOutcome({ won = false, gotAway = 0, byDm = false } = {}) {
  if (won === true) return "escaped"
  if (Number(gotAway) > 0) return "escaped"
  if (byDm) return null
  return "lost"
}

/** Malachar's last word when the march is lost: the same line on every screen, from the shared record's seq. */
export function chainMarchLostLine(seed) {
  const s = String(seed ?? "")
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return CHAIN_MARCH_LINES.lost[h % CHAIN_MARCH_LINES.lost.length]
}

/** Where a party that got away goes: the travel map, out of Velkynvelve by the north passage. */
export function chainMarchMapHref() {
  return `/map?from=velkynvelve&via=${encodeURIComponent(CHAIN_MARCH.via)}&plate=${encodeURIComponent(CHAIN_MARCH.biome)}`
}
