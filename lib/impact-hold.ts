// ============================================================================
// IMPACT HOLD — do not drop the body before the spell gets there.
//
// Sam: "Too much of a delay between shot and target response. Sometimes target
// drops but windup is still happening. This looks strange."
//
// THE RACE. A cast has two independent paths to the same hit points:
//
//   THE LOCAL ONE     the board queues the effect, plays the windup, flies the
//                     bolt, and on the IMPACT FRAME applies the damage — the
//                     number, the flinch, the death. This is correct and was
//                     made so deliberately (#374).
//
//   THE REALTIME ONE  the server writes vtt_tokens.hp_current BEFORE it
//                     responds, so Postgres pushes that UPDATE to every board
//                     immediately. The subscription calls glideToken with it,
//                     unfiltered, and glideToken drops anything that reached 0.
//
// The second path is short — one round trip — and the first is long: a windup,
// a charge, a flight. So on a fast connection the corpse arrives before the
// spell does, and Sam watches a drow fall over while the bolt is still in
// Kenta's hand. On a slow one it looks fine. "Sometimes" is the signature of a
// race, and this is the race.
//
// The impact handler already assumed the ordering it needed — its comment says
// "when the realtime row for the same damage arrives A MOMENT LATER, glideToken
// sees no change and draws no second number". Nothing enforced that. This does.
//
// THE FIX IS A HOLD, NOT A DELAY. Delaying the realtime row by a fixed number
// of milliseconds would be guessing at flight times that differ per spell and
// per distance. Instead a token with a cast in flight is HELD: its hit points
// stop tracking the wire until the effect lands, and the impact frame releases
// it. Everything else about the row — where it is standing, whether it is
// hidden — still applies at once, because none of that is waiting on an impact.
//
// EVERY HOLD HAS A DEADLINE, and that is the important part. If the effect
// never lands — a texture fails, a tab is backgrounded and the animation loop
// stops, an exception eats the impact callback — a held token whose hold never
// expired would ignore its own hit points for the rest of the session and stand
// there at full health while the log says it died. A hold that outlives its
// spell must lapse on its own.
// ============================================================================

export interface Hold {
  /** When this hold lapses on its own, in ms since epoch. */
  until: number
}

/**
 * The tokens whose hit points are waiting for an impact.
 *
 * Deliberately a plain object over a Map rather than a class: the board keeps
 * it in a ref, and every method takes `now` so the tests do not have to mock a
 * clock.
 */
export class ImpactHold {
  private readonly holds = new Map<string, Hold>()

  /**
   * Hold this token's hit points until an impact, or until `ms` has passed.
   *
   * Re-holding an already-held token EXTENDS it rather than being ignored:
   * two spells can be in the air at the same creature, and the later one
   * should not be released by the earlier one's impact deadline.
   */
  hold(id: string, now: number, ms: number): void {
    const until = now + Math.max(0, ms)
    const cur = this.holds.get(id)
    if (cur && cur.until >= until) return
    this.holds.set(id, { until })
  }

  /** Is this token's wire value being ignored right now? */
  held(id: string, now: number): boolean {
    const h = this.holds.get(id)
    if (!h) return false
    // A lapsed hold is not a hold. Checked on read as well as swept, so a
    // board whose animation loop has stopped still recovers the moment
    // anything asks.
    if (h.until <= now) { this.holds.delete(id); return false }
    return true
  }

  /**
   * The impact landed: this token tracks the wire again.
   *
   * Safe on a token that was never held — the swing path releases without
   * holding, because a sword's contact frame IS its impact and there was
   * never a flight to wait through.
   */
  release(id: string): void {
    this.holds.delete(id)
  }

  /**
   * Milliseconds left on a hold, or 0 if it is not held.
   *
   * A caller that puts truth aside for the length of a hold needs to know when
   * to come back for it. Without this, a row whose impact never arrived was
   * simply forgotten: the initiative rail kept the hit points from before the
   * blow, and since a dead creature is never written again, no later row ever
   * corrected it. Sam saw Samson listed at 1/9, on his feet, while his own
   * card read 0/9 UNCONSCIOUS.
   */
  remaining(id: string, now: number): number {
    const h = this.holds.get(id)
    if (!h) return 0
    const left = h.until - now
    if (left <= 0) { this.holds.delete(id); return 0 }
    return left
  }

  /** Drop every lapsed hold. Cheap enough to call each frame. */
  sweep(now: number): void {
    for (const [id, h] of this.holds) if (h.until <= now) this.holds.delete(id)
  }

  /** How many holds are live. For tests and for a debug read-out. */
  size(now: number): number {
    this.sweep(now)
    return this.holds.size
  }

  /** Let go of everything — the fight ended, or the board is unmounting. */
  clear(): void {
    this.holds.clear()
  }
}

/**
 * How long to hold, given what the effect is expected to take.
 *
 * The deadline is the effect's own duration plus a margin, because the hold
 * exists to be ended by the impact and only lapses when something has gone
 * wrong. The margin is generous for that reason — releasing early would
 * reintroduce the exact bug this file exists for — and the ceiling is what
 * stops a bad duration parking a creature's health forever.
 */
export function holdMsFor(effectSeconds: number | null | undefined): number {
  const s = Number(effectSeconds)
  const base = Number.isFinite(s) && s > 0 ? s * 1000 : 900
  return Math.min(4000, base + 900)
}
