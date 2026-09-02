// ============================================================================
// SANDBOX SPAWN — putting a creature on the rehearsal board.
//
// Sam: "we need a sandbox where we can take various monsters, we can select
// items, 3d objects, NPCs, characters, and a handful of environments to try
// out interactions and sounds."
//
// The sandbox board already existed — /battle?sandbox=1, its own map row, its
// own "nothing here is canon" banner. What did not exist was any way to PUT
// SOMETHING IN IT. There is no client-side token spawning anywhere in this
// app: every token on every board was placed by hand-written SQL. Trying a
// hook horror against the party meant opening a SQL console.
//
// This module is the rule half of fixing that: given a row from the bestiary,
// the NPC roster or the character list, what token does it become, and where
// does it land. No Supabase, no React, no fetch — so the arithmetic below can
// be read whole and tested on every size in the game.
//
// SPAWNED CREATURES ARE REAL CREATURES
//
// The temptation with a sandbox is to spawn a convenient dummy: 10 hit points,
// AC 10, one attack. That is worse than useless, because the entire point is
// to find out what actually happens when the party meets this thing — and a
// fake goblin teaches you about fake goblins.
//
// So every stat is COPIED FROM THE CATALOGUE ROW. A sandbox drow has the
// drow's 13 hit points and AC 15 because it is reading the same bestiary row
// the live board reads. If a rehearsal goes badly here, it goes badly at the
// table too, which is the only reason to rehearse.
// ============================================================================

/** Where a spawnable thing comes from. Three catalogues, three shapes. */
export type SourceKind = "bestiary" | "npc" | "character"

export type Allegiance = "party" | "ally" | "hostile"

/** The catalogue row, reduced to what a token needs from it. */
export interface SpawnSource {
  kind: SourceKind
  id: string
  label: string
  /** D&D creature size, as the catalogues spell it: "Medium", "large", … */
  size?: string | null
  hpMax?: number | null
  /**
   * Party, ally, or enemy. Read from the row where the row knows (a PC is
   * party; an NPC's disposition says which side it is on) and defaulted to
   * hostile for the bestiary, since the bestiary is a monster manual.
   */
  allegiance?: Allegiance | null
}

/** A square on the board. */
export interface Square { x: number; y: number }

/**
 * How many squares on a side a creature of each size occupies.
 *
 * SRD 5.1, "Movement and Position: Size" — the space a creature controls.
 * Tiny and Small both take a full square in play (Tiny creatures can share,
 * which this board does not model, and pretending otherwise would let two
 * things stand on one square everywhere else in the code).
 */
export const SIZE_SQUARES: Record<string, number> = {
  tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
}

/**
 * The visual scale a model of each size is drawn at.
 *
 * These are NOT invented. Every bestiary row has a null model_scale — the
 * numbers were tuned by hand per token, and the live board's own rows are the
 * record of what looked right:
 *
 *   Stool (small)        0.43      Kenta, Samson, Scott (medium)   1.0
 *   Jimjar, Topsy, Turvy 0.60      Prince Derendil (medium)        1.30
 *   Buppido (small)      0.70      Hook Horror (large)             1.6
 *
 * So: small clusters around 0.6, medium at 1.0, large at 1.6. This ladder is
 * that observation continued outward, and it is a STARTING POINT rather than
 * an answer — a spawned model can be nudged afterwards, and a bestiary row
 * that grows its own model_scale overrides this entirely (see scaleFor).
 *
 * The alternative was to spawn everything at 1.0 and let Sam fix each one by
 * hand, which is the SQL console again with extra steps.
 */
export const SIZE_SCALE: Record<string, number> = {
  tiny: 0.4, small: 0.6, medium: 1.0, large: 1.6, huge: 2.4, gargantuan: 3.2,
}

/** Normalise however a catalogue spelled the size. Unknown → medium. */
export function sizeKey(size: string | null | undefined): string {
  const s = (size ?? "").trim().toLowerCase()
  return s in SIZE_SQUARES ? s : "medium"
}

/** The footprint, in squares on a side. */
export function squaresFor(size: string | null | undefined): number {
  return SIZE_SQUARES[sizeKey(size)]
}

/**
 * The model scale for a spawn.
 *
 * A scale already on the catalogue row always wins: somebody measured that
 * one against the board, and a table of defaults must never overrule a
 * measurement. The ladder is only for rows that have never been tuned.
 */
export function scaleFor(size: string | null | undefined, catalogueScale?: number | null): number {
  if (typeof catalogueScale === "number" && catalogueScale > 0) return catalogueScale
  return SIZE_SCALE[sizeKey(size)]
}

/**
 * Which side a creature is on, read from its bestiary role.
 *
 * THE BUG THIS EXISTS FOR. The first cut defaulted the bestiary to hostile
 * and NPCs to ally, on the reasoning that a bestiary is a monster manual.
 * Both halves were wrong against the actual data:
 *
 *   - all 19 npc_encounters rows have a NULL disposition, so every NPC
 *     spawned as an ally — including Ilvara Mizzrym (CR 8), Shoor Vandree
 *     (CR 5) and the hook horror;
 *   - and this bestiary is not a monster manual. 18 of its 43 rows are
 *     role "ally/prisoner", because it holds the whole Velkynvelve cast:
 *     Stool, Jimjar, Buppido, Prince Derendil, Eldeth. Those all spawned
 *     hostile.
 *
 * So the side comes from bestiary.role, which is the column that has known
 * the answer all along:
 *
 *   ally/prisoner (18)  →  ally
 *   enemy (6), boss (1), named_npc (1), null (17)  →  hostile
 *
 * ONLY "ally/prisoner" IS AN ALLY, and everything else — including a role
 * nobody has written yet — is hostile. That asymmetry is deliberate. An ally
 * spawned as an enemy is obvious the moment you look at the board and takes
 * one click to fix. A hostile spawned as a friend is invisible: it sits in
 * the initiative order on your side, is skipped by every targeting filter,
 * and quietly makes the whole rehearsal meaningless. When the data is
 * missing, be wrong in the direction somebody will notice.
 *
 * "named_npc" is hostile on a sample of ONE (the Drow Elite Warrior), which
 * is not enough to write a rule about — it is hostile here because it is not
 * "ally/prisoner", not because anyone decided named NPCs are enemies.
 */
export function sideForRole(role: string | null | undefined): Allegiance {
  return (role ?? "").trim().toLowerCase() === "ally/prisoner" ? "ally" : "hostile"
}

/**
 * Which side a spawn fights on.
 *
 * An explicit allegiance always wins — the drawer lets you set one before
 * placing, because "what if the drow were on our side" is exactly the sort of
 * question a rehearsal room exists to answer.
 */
export function allegianceFor(src: SpawnSource): Allegiance {
  if (src.allegiance) return src.allegiance
  if (src.kind === "character") return "party"
  // No role reached us — the caller could not find one. Same asymmetry as
  // above: unknown means hostile, because that is the wrong answer somebody
  // will spot.
  return "hostile"
}

/** The insert payload for one spawned token. */
export interface SpawnPayload {
  character_id: string | null
  bestiary_id: string | null
  label: string
  grid_x: number
  grid_y: number
  token_size: string
  model_scale: number
  hp_current: number | null
  hp_max: number | null
  allegiance: Allegiance
  combat_disposition: string
  is_visible: boolean
  updated_by: string
}

/**
 * Turn a catalogue row and a square into a token.
 *
 * NOTE WHAT IS NOT SET: model_url.
 *
 * That is deliberate and it is the most useful line in this file. The board
 * already falls back to the SPECIES model when a token has no model_url of
 * its own (combat-board-3d, the speciesModel map), and to a plain pawn when
 * there is no species model either. Leaving it null therefore means:
 *
 *   - the 9 creatures that have a model get their model;
 *   - the other 34 get an honest pawn instead of nothing, so their mechanics
 *     and sounds can still be rehearsed today;
 *   - and the day a model IS added to a bestiary row, every token already
 *     standing on the board picks it up, with nothing to re-spawn.
 *
 * Copying the URL onto the token instead would freeze each spawn at the art
 * that existed the moment it was placed.
 */
export function spawnPayload(
  src: SpawnSource,
  at: Square,
  opts?: { catalogueScale?: number | null },
): SpawnPayload {
  const hp = typeof src.hpMax === "number" && src.hpMax > 0 ? src.hpMax : null
  return {
    character_id: src.kind === "character" ? src.id : null,
    bestiary_id: src.kind === "bestiary" ? src.id : null,
    label: src.label,
    grid_x: at.x,
    grid_y: at.y,
    token_size: sizeKey(src.size),
    model_scale: scaleFor(src.size, opts?.catalogueScale),
    // Both ends of the bar, so a spawn arrives at full health rather than at
    // whatever the catalogue's last fight left it on.
    hp_current: hp,
    hp_max: hp,
    allegiance: allegianceFor(src),
    // Everything spawned here fights. A creature that flees is a story
    // decision, and the sandbox is where you find out what a fight looks
    // like; "flees" can be set afterwards on the token that needs it.
    combat_disposition: "fights",
    is_visible: true,
    // Provenance, in the same style as "player-move" and "npc-flee". A row
    // stamped this way is a rehearsal row and can be swept without thinking.
    updated_by: "sandbox-spawn",
  }
}

/**
 * The nearest free square to where the user asked, searching outward.
 *
 * Placement has to cope with the obvious: they clicked a square something is
 * already standing on, or they clicked near the wall with a hook horror
 * selected. Refusing with an error would be correct and infuriating — the
 * intent ("put it about there") is perfectly clear.
 *
 * So this walks outward in rings and takes the first square where the whole
 * footprint fits and nothing is in the way. Returns null only when the board
 * genuinely has no room, which is a real answer the caller must handle rather
 * than dropping the creature on top of somebody.
 *
 * Chebyshev rings, because that is the metric the rest of this board thinks
 * in — reach, blasts and movement all count a diagonal as one.
 */
export function freeSquare(opts: {
  want: Square
  occupied: Iterable<Square>
  gridWidth: number
  gridHeight: number
  /** Footprint on a side; a Large creature needs 2x2 clear. */
  squares?: number
  /** Squares that are not floor at all — walls, pits, the outside. */
  blocked?: Iterable<Square>
}): Square | null {
  const n = Math.max(1, opts.squares ?? 1)
  const taken = new Set<string>()
  for (const s of opts.occupied) taken.add(`${s.x},${s.y}`)
  for (const s of opts.blocked ?? []) taken.add(`${s.x},${s.y}`)

  const fits = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x + n > opts.gridWidth || y + n > opts.gridHeight) return false
    for (let dx = 0; dx < n; dx++) {
      for (let dy = 0; dy < n; dy++) if (taken.has(`${x + dx},${y + dy}`)) return false
    }
    return true
  }

  if (fits(opts.want.x, opts.want.y)) return { x: opts.want.x, y: opts.want.y }

  // Ring by ring. The whole board is bounded and small, so the worst case is
  // a few hundred checks — not worth anything cleverer.
  const reach = Math.max(opts.gridWidth, opts.gridHeight)
  for (let r = 1; r <= reach; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Only the ring itself; the inside was covered by smaller r.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = opts.want.x + dx
        const y = opts.want.y + dy
        if (fits(x, y)) return { x, y }
      }
    }
  }
  return null
}
