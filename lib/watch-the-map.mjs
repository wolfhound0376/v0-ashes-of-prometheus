// ============================================================================
// PULL TO THE MAP — when the game gets up and moves, the screen goes with it.
//
// Sam, 2026-10-30: "during dynamic action sequences like that or if someone is
// talking to you (interrupting) it should go to the pixel map."
//
// "Like that" is the gate volleys he had just watched: the drow shot Gandalf
// down five times while whoever was sitting on the Parley saw a line of text
// scroll past. The Underwalk is where the game is ACTED — the bolts, the
// bodies, the NPC who walks up to you — and a player reading about it on the
// dashboard is watching a transcript of a scene happening in the next room.
//
// THE SHAPE. The map is the only surface that knows a sequence has started, so
// the map raises the cue: one key in the shared One World state, which every
// screen already receives. A dashboard that sees a cue it has not followed yet
// goes to /velkynvelve. No new table, no new poll — it rides the sync poll the
// dashboard already makes.
//
// WHO FOLLOWS. A party-wide cue (a fight, volleys at the gate, a surrender)
// pulls every screen. A cue raised for one hero (an NPC walking up to speak to
// them) pulls that hero's screen, and the DM's, and leaves everyone else where
// they are — the same shape as who HEARS an NPC (lib/voice-audience.ts).
//
// WHY IT EXPIRES. A cue is a thing happening now. A browser opened ten minutes
// later must not be thrown onto the map for a fight that is long over, and a
// dashboard reloaded after following one must not be pulled by the same cue
// again — which is what `seen` is for.
//
// Pure plain JavaScript, for the same reason as lib/game-over.mjs: build_walk.py pastes this file
// into the painted map at its WATCH_THE_MAP placeholder, so the map, the dashboard and the test read
// ONE copy of the rules. The map writes `makePull`, the dashboard asks `shouldFollowPull`.
// ============================================================================

// A cue is { seq, at, why, who, whoName }:
//   seq      new for every cue, so a screen can tell one from the next
//   at       when it was raised (ms since the epoch, the map's clock)
//   why      one short line for the player: "the guards are shooting", "Ront wants a word"
//   who      the hero it is for, as the map slugs them ("gandalf"); null = the whole table
//   whoName  the same hero as the dashboard names them ("Gandalf") — the two surfaces key on different things

/** A cue is live for this long. Longer than a page load, shorter than a scene. */
export const PULL_FRESH_MS = 45000

export function makePull(why, opts = {}) {
  const at = typeof opts.at === "number" ? opts.at : Date.now()
  return {
    seq: `p${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at,
    why: String(why || "something is happening").slice(0, 80),
    who: opts.who ?? null,
    whoName: opts.whoName ?? null,
  }
}

const same = (a, b) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

/**
 * Should THIS screen go to the map? `seen` is the last cue it followed (or
 * decided to ignore), `hero` is the name of the character it is showing, and
 * `dm` says it is the DM's screen.
 */
export function shouldFollowPull(pull, me = {}) {
  if (!pull || typeof pull.seq !== "string" || !pull.seq) return false
  if (me.seen === pull.seq) return false
  const now = typeof me.now === "number" ? me.now : Date.now()
  if (typeof pull.at !== "number" || now - pull.at > PULL_FRESH_MS) return false
  if (now - pull.at < -5000) return false            // a clock ahead of ours: ignore rather than loop
  if (!pull.who && !pull.whoName) return true        // the whole table
  if (me.dm) return true                             // the DM sees everything, as with voices
  return same(pull.whoName, me.hero ?? null)
}
