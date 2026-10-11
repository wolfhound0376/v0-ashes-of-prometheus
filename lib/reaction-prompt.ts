// The pause — combat stops and asks, the way Baldur's Gate 3 does.
//
// Sam's ruling, 2026-10-10: "combat pauses like Baldur's Gate 3 for reactions
// like shield."
//
// WHAT THIS ACTUALLY UNLOCKS, which is not what the plan said it would.
//
// Tier 2 was deferred on the grounds that nobody in the party holds a reaction
// SPELL — true, and beside the point. The reaction every character holds from
// level 1 is the opportunity attack, and until now it fired in one direction
// only: `move` is a player verb, so an NPC walking out of Fifi's reach wrote
// its new square with no provoke check at all. The drow got to swing at the
// party and the party never got to swing back.
//
// A pause is what fixes that, because a PC's opportunity attack is a CHOICE.
// An NPC's can be decided by the server mid-request; a player's cannot — the
// request has to stop, ask, and wait. So this is less a Shield feature than
// the other half of tier 1.
//
// WHERE THE PROMPT LIVES, and why that is not lazy. On `turn_state`, which is
// the ACTIVE combatant's economy and is replaced wholesale at every turn
// change. That looks like the wrong home until you notice the lifetime
// matches exactly: a reaction prompt is raised during one creature's turn and
// must be gone by the next. Storing it anywhere more durable would mean
// writing code to expire it; storing it here means the existing turn change
// already does. No migration, and no stale prompt can outlive its turn.
//
// THE QUEUE. Several creatures can be provoked by one step — a rogue and a
// fighter both standing next to a fleeing drow. They are asked one at a time,
// in board order, because each answer can change the next question: if the
// first opportunity attack drops the mover, there is nothing left to swing at.

export interface Square {
  grid_x: number
  grid_y: number
}

/** One creature still waiting to be asked. */
export interface Watcher {
  token_id: string
  label: string
  /** Null for a monster — only a claimed character can be prompted. */
  character_id: string | null
}

export interface PendingReaction {
  kind: "opportunity_attack"
  /** Watchers not yet asked. The head is the one being asked right now. */
  queue: Watcher[]
  mover_token: string
  mover_label: string
  from: Square
  to: Square
  /**
   * The decision this pause interrupted, carried verbatim so the turn can
   * finish once everyone has answered.
   *
   * The dice inside it were ALREADY ROLLED before the pause. That is
   * deliberate: re-rolling on resume would let a player's reaction choice
   * silently re-roll the drow's attack, which is a way to cheat that nobody
   * would ever see.
   */
  resume: unknown
  /** ISO timestamp, so a DM can see how long a table has been waiting. */
  asked_at: string
}

/** Who is being asked right now, or null when the queue is empty. */
export function currentWatcher(p: PendingReaction | null | undefined): Watcher | null {
  return p?.queue?.[0] ?? null
}

export interface BuildArgs {
  watchers: Watcher[]
  mover_token: string
  mover_label: string
  from: Square
  to: Square
  resume: unknown
  now?: string
}

/**
 * Raise a prompt, or decline to.
 *
 * Returns null when there is nobody to ask — the overwhelmingly common case,
 * and the one that must stay free: a fight where every step pauses for a
 * question nobody can answer is worse than no reactions at all.
 *
 * Monsters are filtered out here rather than at the call site. An NPC's
 * opportunity attack needs no prompt (the server decides it inline, the way
 * tier 1 already does), so putting one in the queue would stop the fight to
 * ask a question with no one on the other end.
 */
export function buildPrompt(args: BuildArgs): PendingReaction | null {
  const queue = args.watchers.filter((w) => w.character_id)
  if (queue.length === 0) return null
  return {
    kind: "opportunity_attack",
    queue,
    mover_token: args.mover_token,
    mover_label: args.mover_label,
    from: args.from,
    to: args.to,
    resume: args.resume,
    asked_at: args.now ?? new Date().toISOString(),
  }
}

/**
 * Drop the head of the queue after it has answered.
 *
 * Returns null once nobody is left, which is the signal to apply `resume` and
 * let the turn carry on.
 */
export function advanceQueue(p: PendingReaction): PendingReaction | null {
  const rest = p.queue.slice(1)
  return rest.length ? { ...p, queue: rest } : null
}

/**
 * Remove everyone from the queue at once — used when the mover goes down
 * mid-queue and there is no longer anything to swing at.
 */
export function clearQueue(): null {
  return null
}

/**
 * May this caller answer the prompt that is currently open?
 *
 * The DM may always answer, because somebody has to be able to unstick a
 * table when a player has walked away from the screen — a live-play show
 * cannot sit on a prompt forever, and a pause with no escape hatch is how a
 * session dies on camera.
 *
 * Otherwise it must be the claimed character of the creature being asked.
 */
export function mayAnswer(
  p: PendingReaction | null | undefined,
  args: { characterId?: string | null; isDm?: boolean },
): boolean {
  if (!p) return false
  if (args.isDm) return true
  const w = currentWatcher(p)
  if (!w?.character_id) return false
  return Boolean(args.characterId) && w.character_id === args.characterId
}

/** One line for the log, so the pause is visible in the transcript. */
export function promptNarration(p: PendingReaction): string {
  const w = currentWatcher(p)
  if (!w) return ""
  return `${p.mover_label} tries to slip away from ${w.label} — opportunity attack?`
}
