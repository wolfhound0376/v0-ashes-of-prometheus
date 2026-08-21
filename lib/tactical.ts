/**
 * The tactical board, as Malachar is allowed to know it.
 *
 * WHY THE SERVER DOES THE ARITHMETIC
 * Grid distance is not straight-line distance, and a language model asked to
 * count squares will produce a confident wrong number — the exact failure this
 * campaign has a documented history of (a fabricated attack line once reached
 * production and shaped months of play). So nothing here is left to Malachar:
 * the server measures every pair and hands him finished English. He narrates
 * what he is told and never calculates.
 *
 * READ-ONLY, DELIBERATELY. Nothing in this module writes to vtt_tokens. Malachar
 * can see the board; he cannot move a piece on it. Moving comes later, behind
 * its own tags, once seeing has proved itself at the table.
 */

/** 5e's square. Note vtt_maps.cell_size is a render scale and is NOT this. */
export const FEET_PER_SQUARE = 5

/**
 * How a diagonal is counted.
 *
 * NOT CITED FROM THE SRD — the grid rules are PHB/DMG material and the SRD 5.1
 * in campaign_chunks does not carry them, so this is stated knowledge, not a
 * quotation. Flagged rather than presented as canon.
 *
 *   "phb"        every square costs 5 ft, diagonals included (PHB, Playing on
 *                a Grid). The common default, and what most tables use.
 *   "alternating" every SECOND diagonal costs 10 ft (the DMG optional rule).
 *                Slower to reason about, closer to real geometry.
 *
 * One constant, one line to change, and every distance in the game follows.
 */
export const DIAGONAL_RULE: "phb" | "alternating" = "phb"

/** Distance in feet between two grid squares, per DIAGONAL_RULE. */
export function gridDistanceFeet(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx)
  const dy = Math.abs(ay - by)
  if (DIAGONAL_RULE === "phb") return Math.max(dx, dy) * FEET_PER_SQUARE
  const diagonals = Math.min(dx, dy)
  const straights = Math.max(dx, dy) - diagonals
  // Every second diagonal costs an extra square.
  return (straights + diagonals + Math.floor(diagonals / 2)) * FEET_PER_SQUARE
}

/** Compass bearing from A to B, for narration ("north-east of you"). */
export function bearing(ax: number, ay: number, bx: number, by: number): string {
  const dx = bx - ax
  // Screen rows increase downward, so a smaller y is north.
  const dy = by - ay
  if (dx === 0 && dy === 0) return "the same square"
  const ns = dy < 0 ? "north" : dy > 0 ? "south" : ""
  const ew = dx > 0 ? "east" : dx < 0 ? "west" : ""
  return ns && ew ? `${ns}-${ew}` : ns || ew
}

export interface BoardToken {
  label: string
  gridX: number
  gridY: number
  isPlayer: boolean
  hpCurrent: number | null
  hpMax: number | null
}

export interface TacticalBoard {
  mapName: string
  gridWidth: number
  gridHeight: number
  tokens: BoardToken[]
}

/**
 * Render the board as prose Malachar can use directly. Every distance here is
 * already measured; there is nothing left for him to work out.
 *
 * Pairs are capped because the count grows quadratically and a wall of numbers
 * buries the few that matter. Nearest-first is the useful order in play.
 */
export function formatTacticalSection(board: TacticalBoard | null, maxPairs = 12): string[] {
  if (!board || board.tokens.length === 0) return []
  const lines: string[] = []
  lines.push(`=== TACTICAL BOARD ===`)
  lines.push(
    `${board.mapName} — ${board.gridWidth}x${board.gridHeight} squares, ${FEET_PER_SQUARE} ft per square.`,
  )
  lines.push(`Positions (grid x,y):`)
  for (const t of board.tokens) {
    const hp = t.hpCurrent != null && t.hpMax != null ? `, ${t.hpCurrent}/${t.hpMax} HP` : ""
    lines.push(`- ${t.label} (${t.isPlayer ? "player" : "NPC"}) at ${t.gridX},${t.gridY}${hp}`)
  }

  const pairs: Array<{ a: BoardToken; b: BoardToken; ft: number }> = []
  for (let i = 0; i < board.tokens.length; i++) {
    for (let j = i + 1; j < board.tokens.length; j++) {
      const a = board.tokens[i]
      const b = board.tokens[j]
      pairs.push({ a, b, ft: gridDistanceFeet(a.gridX, a.gridY, b.gridX, b.gridY) })
    }
  }
  pairs.sort((p, q) => p.ft - q.ft)

  if (pairs.length) {
    lines.push(`\nMeasured distances (already calculated — use these, never your own):`)
    for (const p of pairs.slice(0, maxPairs)) {
      const dir = bearing(p.a.gridX, p.a.gridY, p.b.gridX, p.b.gridY)
      const reach = p.ft <= FEET_PER_SQUARE ? " — adjacent, within melee reach" : ""
      lines.push(`- ${p.a.label} to ${p.b.label}: ${p.ft} ft (${dir} of ${p.a.label})${reach}`)
    }
    if (pairs.length > maxPairs) lines.push(`- (${pairs.length - maxPairs} further pairs not listed)`)
  }

  lines.push(
    `\nUse these positions and distances when they matter — who can be reached, who is too far, who is exposed. NEVER calculate a distance yourself and never contradict a number above. If something is not on this board, it has no position: describe it without one rather than inventing coordinates.`,
  )
  lines.push("")
  return lines
}
