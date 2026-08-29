// ============================================================================
// NPC COMBAT AI — the deterministic tier.
//
// Sam's ruling (28 Aug 2026): "NPC action is not picked by the players or DM.
// It is automatic based on the same AI that combatants use which is based on
// intelligence and wisdom (that decides model). 12 and below is just an
// algorithm."
//
// So this file IS the ≤12 tier: no model, no latency, no cost, and — the part
// that matters at a live table — no variance in whether a goblin remembers how
// to swing. A creature with INT or WIS above 12 is meant to route to a Claude
// call instead; that route does not exist yet, and until it does the caller
// falls back here rather than freezing the fight.
//
// Everything below is PURE. No database, no fetch, no clock. That is
// deliberate: the fight logic is the part most likely to be wrong, and pure
// functions are the part you can actually test.
// ============================================================================

export interface Cell { x: number; y: number }

export interface Combatant {
  token_id: string
  label: string
  kind: "pc" | "npc"
  x: number
  y: number
  hp_current: number | null
  hp_max: number | null
  ac: number | null
}

export interface StatBlock {
  int: number | null
  wis: number | null
  speed: string | null
  actions: unknown
}

/** One parsed attack out of a bestiary `actions` blob. */
export interface Attack {
  name: string
  toHit: number
  dice: { count: number; die: number; bonus: number }
  ranged: boolean
  reachFt: number
  rangeFt: number
}

// ---------------------------------------------------------------- dice ----

export const d = (sides: number, rng: () => number = Math.random) => 1 + Math.floor(rng() * sides)

export function rollDamage(a: Attack, rng: () => number = Math.random): number {
  let total = a.dice.bonus
  for (let i = 0; i < a.dice.count; i++) total += d(a.dice.die, rng)
  // A hit always hurts, even when the dice and a negative modifier disagree.
  return Math.max(1, total)
}

// ------------------------------------------------------------ parsing ----
//
// The bestiary stores stat blocks the way the book prints them, not the way a
// program would like them: `to_hit: "+4"` and a prose `desc` carrying
// "Hit: 5 (1d6+2) piercing". Rather than demand a schema migration across
// every creature in the book, we read the book's own shape.

const num = (s: unknown, fallback = 0): number => {
  const n = Number.parseInt(String(s ?? "").replace(/[^0-9-]/g, ""), 10)
  return Number.isFinite(n) ? n : fallback
}

export function parseAttacks(actions: unknown): Attack[] {
  if (!Array.isArray(actions)) return []
  const out: Attack[] = []
  for (const raw of actions) {
    const a = raw as Record<string, unknown>
    const desc = String(a.desc ?? "")
    const toHitRaw = a.to_hit ?? a.toHit
    // No attack bonus means it is not an attack — it is a trait, a recharge
    // note, or a save-based effect this tier does not attempt to adjudicate.
    if (toHitRaw == null) continue
    const dice = desc.match(/\((\d+)d(\d+)\s*([+-]\s*\d+)?\)/i)
    if (!dice) continue
    const rangeMatch = desc.match(/Range\s+(\d+)\s*\/\s*(\d+)\s*ft/i)
    const reachMatch = String(a.reach ?? "").match(/(\d+)/)
    out.push({
      name: String(a.name ?? "Attack"),
      toHit: num(toHitRaw),
      dice: {
        count: Number.parseInt(dice[1], 10),
        die: Number.parseInt(dice[2], 10),
        bonus: dice[3] ? Number.parseInt(dice[3].replace(/\s+/g, ""), 10) : 0,
      },
      ranged: Boolean(rangeMatch),
      reachFt: reachMatch ? Number.parseInt(reachMatch[1], 10) : 5,
      rangeFt: rangeMatch ? Number.parseInt(rangeMatch[1], 10) : 0,
    })
  }
  return out
}

export const speedSquares = (speed: string | null): number => Math.max(1, Math.floor(num(speed, 30) / 5))

// ------------------------------------------------------------ geometry ----

export const key = (x: number, y: number) => `${x},${y}`

/** Chebyshev, in squares. 5e diagonals cost the same as orthogonals. */
export const chebyshev = (a: Cell, b: Cell) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))

/**
 * Walkable squares from a V5 node tile's cell geometry.
 *
 * The tile JSON lists `cells.floor` as the honest walkable set — rock is
 * simply absent, so we never have to reason about what a wall is. Water is
 * excluded here: a fleeing myconid does not swim, and node 9→14 being a
 * vertical water descent is exactly the kind of thing that should NOT be
 * solved by a pathfinder that thinks water is a floor tile.
 */
export function walkableFrom(cells: unknown): Set<string> {
  const set = new Set<string>()
  const floor = (cells as { floor?: { sq?: [number, number] }[] })?.floor ?? []
  for (const c of floor) {
    const sq = c?.sq
    if (Array.isArray(sq) && sq.length === 2) set.add(key(sq[0], sq[1]))
  }
  return set
}

const NEIGHBOURS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
]

/**
 * Breadth-first step count from `from` to every reachable square, walking
 * 8-way over walkable cells and refusing to pass THROUGH occupied ones.
 *
 * Occupied squares are still recorded at their own distance, so "how far is
 * that enemy" stays answerable even though you cannot stand on them.
 */
export function reach(from: Cell, walkable: Set<string>, blocked: Set<string>): Map<string, number> {
  const dist = new Map<string, number>([[key(from.x, from.y), 0]])
  const queue: Cell[] = [from]
  while (queue.length) {
    const cur = queue.shift()!
    const curKey = key(cur.x, cur.y)
    const step = dist.get(curKey)!
    // You may reach an occupied square (to measure it) but never move past it.
    if (step > 0 && blocked.has(curKey)) continue
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = cur.x + dx
      const ny = cur.y + dy
      const k = key(nx, ny)
      if (!walkable.has(k) || dist.has(k)) continue
      dist.set(k, step + 1)
      queue.push({ x: nx, y: ny })
    }
  }
  return dist
}

/** Retrace the BFS field to the furthest square toward `goal` within budget. */
export function stepToward(
  from: Cell,
  goal: Cell,
  walkable: Set<string>,
  blocked: Set<string>,
  budget: number,
): Cell {
  if (budget <= 0) return from
  // Distances FROM the goal: any square's value is how far it still is, so
  // "closest to the goal" is a lookup rather than a second search.
  const fromGoal = reach(goal, walkable, blocked)
  const mine = reach(from, walkable, blocked)
  let best = from
  let bestRemaining = fromGoal.get(key(from.x, from.y)) ?? Number.POSITIVE_INFINITY
  let bestCost = 0
  for (const [k, cost] of mine) {
    if (cost === 0 || cost > budget || blocked.has(k)) continue
    const remaining = fromGoal.get(k)
    if (remaining === undefined) continue
    // Closer to the target wins; ties go to the square that spent less.
    if (remaining < bestRemaining || (remaining === bestRemaining && cost < bestCost)) {
      const [x, y] = k.split(",").map(Number)
      best = { x, y }
      bestRemaining = remaining
      bestCost = cost
    }
  }
  return best
}

/**
 * The square nearest the edge of the board that this coward can actually
 * reach this round. Sam: "they never fight but runaway to the edge of the
 * game map. They can still be hit and targeted."
 */
export function stepToEdge(
  from: Cell,
  walkable: Set<string>,
  blocked: Set<string>,
  budget: number,
  width: number,
  height: number,
): Cell {
  const edgeness = (c: Cell) => Math.min(c.x, c.y, width - 1 - c.x, height - 1 - c.y)
  if (budget <= 0) return from
  const mine = reach(from, walkable, blocked)
  let best = from
  let bestEdge = edgeness(from)
  let bestCost = 0
  for (const [k, cost] of mine) {
    if (cost === 0 || cost > budget || blocked.has(k)) continue
    const [x, y] = k.split(",").map(Number)
    const e = edgeness({ x, y })
    if (e < bestEdge || (e === bestEdge && cost < bestCost)) {
      best = { x, y }
      bestEdge = e
      bestCost = cost
    }
  }
  return best
}

// ------------------------------------------------------------ decision ----

export type Decision =
  | { kind: "attack"; target: Combatant; attack: Attack; roll: number; total: number; hit: boolean; crit: boolean; damage: number; narration: string }
  | { kind: "move"; to: Cell; narration: string }
  | { kind: "move-attack"; to: Cell; target: Combatant; attack: Attack; roll: number; total: number; hit: boolean; crit: boolean; damage: number; narration: string }
  | { kind: "flee"; to: Cell; narration: string }
  | { kind: "none"; narration: string }

/** INT and WIS both ≤ 12 means this creature is handled here, per Sam's rule. */
export const usesAlgorithm = (s: StatBlock) => (s.int ?? 10) <= 12 && (s.wis ?? 10) <= 12

function resolveAttack(self: Combatant, target: Combatant, attack: Attack, rng: () => number) {
  const roll = d(20, rng)
  const total = roll + attack.toHit
  const crit = roll === 20
  // Natural 1 always misses, natural 20 always hits — SRD, and the only two
  // rules a table will notice you got wrong.
  const hit = crit || (roll !== 1 && total >= (target.ac ?? 10))
  let damage = 0
  if (hit) {
    damage = rollDamage(attack, rng)
    // Critical: roll the damage dice twice, modifier once.
    if (crit) damage += rollDamage({ ...attack, dice: { ...attack.dice, bonus: 0 } }, rng)
  }
  const verb = crit ? "critically hits" : hit ? "hits" : "misses"
  return {
    roll, total, hit, crit, damage,
    narration: `${self.label} ${verb} ${target.label} with ${attack.name} (${roll}${attack.toHit >= 0 ? "+" : ""}${attack.toHit} = ${total} vs AC ${target.ac ?? "—"})${hit ? ` for ${damage} damage` : ""}.`,
  }
}

/**
 * One NPC's whole turn, decided.
 *
 * 1. Broken nerve first: below a quarter of its HP with WIS under 8, it runs.
 * 2. Adjacent enemy → hit it.
 * 3. Otherwise close the distance, and swing if the move brings it into reach.
 * 4. A ranged attacker with line of numbers (not sight — see the caveat) may
 *    shoot from where it stands rather than closing.
 */
export function decideTurn(args: {
  self: Combatant
  stats: StatBlock
  hostiles: Combatant[]
  walkable: Set<string>
  blocked: Set<string>
  width: number
  height: number
  rng?: () => number
}): Decision {
  const { self, stats, hostiles, walkable, blocked, width, height } = args
  const rng = args.rng ?? Math.random
  const living = hostiles.filter((h) => (h.hp_current ?? 1) > 0)
  if (!living.length) return { kind: "none", narration: `${self.label} finds no one left to fight.` }

  const hpFrac = self.hp_max && self.hp_max > 0 ? (self.hp_current ?? self.hp_max) / self.hp_max : 1
  if (hpFrac < 0.25 && (stats.wis ?? 10) < 8) {
    const to = stepToEdge(self, walkable, blocked, speedSquares(stats.speed), width, height)
    return { kind: "flee", to, narration: `${self.label}, bloodied and witless with panic, breaks and runs.` }
  }

  // Nearest by true path length, ties to the most wounded — a wolf's logic,
  // not a tactician's, which is exactly the tier this is.
  const field = reach(self, walkable, blocked)
  const scored = living
    .map((h) => ({ h, dist: field.get(key(h.x, h.y)) ?? chebyshev(self, h) }))
    .sort((a, b) => a.dist - b.dist || (a.h.hp_current ?? 99) - (b.h.hp_current ?? 99))
  const target = scored[0].h

  const attacks = parseAttacks(stats.actions)
  const melee = attacks.find((a) => !a.ranged) ?? attacks[0]
  const ranged = attacks.find((a) => a.ranged)
  if (!melee && !ranged) return { kind: "none", narration: `${self.label} has no attack it knows how to make.` }

  const adjacent = chebyshev(self, target) <= 1
  if (adjacent && melee) {
    const r = resolveAttack(self, target, melee, rng)
    return { kind: "attack", target, attack: melee, ...r }
  }

  // Out of reach: shoot if it can, otherwise close.
  if (ranged && chebyshev(self, target) * 5 <= ranged.rangeFt) {
    const r = resolveAttack(self, target, ranged, rng)
    return { kind: "attack", target, attack: ranged, ...r }
  }

  const to = stepToward(self, target, walkable, blocked, speedSquares(stats.speed))
  const nowAdjacent = chebyshev(to, target) <= 1
  if (nowAdjacent && melee) {
    const r = resolveAttack({ ...self, ...to }, target, melee, rng)
    return { kind: "move-attack", to, target, attack: melee, ...r, narration: `${self.label} closes on ${target.label}. ${r.narration}` }
  }
  if (to.x === self.x && to.y === self.y) {
    return { kind: "none", narration: `${self.label} snarls, unable to reach anyone.` }
  }
  return { kind: "move", to, narration: `${self.label} advances on ${target.label}.` }
}
