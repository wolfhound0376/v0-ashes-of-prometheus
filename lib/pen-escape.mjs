// THE PEN ESCAPE: one phase instead of a matrix of flags.
//
// Design of record: project doc claude/Pen_Escape_Phases_2026-11-13.md.
// [SAM] his words; [HOUSE] Claude's call inside them, open to overrule.
//
// Why this file exists (Sam, 2026-11-13): "We need to come up with a better way to handle this pen, escape matrix,
// problem. It's been a nightmare." In that run Lynkes unlocked the gate, won the fight on the battle plate, rested an
// hour beside the body, and walked back in for the others; the relief watch had taken the bridge as if nothing had
// happened and Jorlan said "Back inside." over a dead, looted guard. Nothing owned the question "where is the escape
// up to?": about 25 flags across walk_world.state, the stage roster and each browser (gateOpen alone is read in 58
// places), and every system answered it its own way.
//
// So the escape has ONE phase, it changes only through escapeStep(), and every system asks policyFor(phase) instead
// of reading gate flags to decide what to do. The old flags may still be written for the door's picture and the floor,
// but they no longer decide behaviour.
//
// Plain JavaScript for the same reason as lib/shakedown.mjs: build_walk.py pastes it into the painted map minus
// `export`, and lib/pen-escape.test.ts holds the map and the tests to the same rules.
//
// Pure: no DOM, no fetch, no Supabase. `now` (ms) and `rotation` (the stage roster's watch count) are passed in.

/** The seven phases. */
export const PHASE = Object.freeze({
  HELD: "held",               // locked in: bars, warnings, volleys, the leaning guard, Jorlan's visits, labor, the doom clock
  UNLOCKED: "unlocked",       // the lock is off, nobody is out, the drow do not know
  FIGHT: "fight",             // the breakout fight, on the battle plate
  OUT_QUIET: "out_quiet",     // out, and nobody alive knows: a window, not a resting place
  HUNTED: "hunted",           // the alarm is up: horn and waves
  GONE: "gone",               // off the Velkynvelve plates, onto the road
  RECAPTURED: "recaptured",   // surrendered or beaten: the surrender scene, then back to HELD
})
export const PHASES = Object.values(PHASE)

/**
 * How long "out, quiet" lasts before someone finds the body. [SAM, 2026-11-13: "Your call."]
 * [HOUSE] The next change of the watch, or 8 real minutes, whichever comes first. The watch change alone is not
 * enough: the roster's count only moves when Malachar or the DM changes the watch, so a quiet table could sit in
 * the window forever.
 */
export const QUIET_WINDOW_MS = 8 * 60 * 1000

/** A fresh escape: everyone in the pen. */
export function newEscape(now = 0, rotation = 0) {
  return { phase: PHASE.HELD, since: now, atRotation: rotation, why: "in the pen", back: null, discoverBy: null }
}

// ─── Moves ──────────────────────────────────────────────────────────────────────────────────────────
// Every event the escape answers to, and where it leads from each phase. Anything not listed is refused (the step
// returns the escape unchanged with `refused` set), so a stray event can never knock the escape into a phase that
// makes no sense — which is exactly what the flag matrix allowed.

export const EVENT = Object.freeze({
  UNLOCK: "unlock",               // key, picked lock, cut ward, Jorlan keeping his word
  RELOCK: "relock",               // the drow lock it again (the watch finds it, the shakedown played)
  SLIP_OUT: "slip_out",           // out unseen (the sneak past to the Quaggoth way)
  FIGHT: "fight",                 // a fight with the watch starts
  WON: "won",                     // the fight is won and no foe got away
  FOE_ESCAPED: "foe_escaped",     // the fight is won but a drow ran (or the horn was blown): they know
  LOST: "lost",                   // the party went down in the fight
  SURRENDER: "surrender",
  DISCOVERED: "discovered",       // the body was found, a survivor raised the alarm, or the window ran out
  LEFT_AREA: "left_area",         // off the Velkynvelve plates (the road, the chain march's escape)
  RETURNED: "returned",           // the surrender scene is over: back in the pen
})

const MOVES = {
  [PHASE.HELD]: {
    [EVENT.UNLOCK]: PHASE.UNLOCKED,
    [EVENT.FIGHT]: PHASE.FIGHT,             // the gate forced, the strangled guard's alarm, a breakout from the bars
    [EVENT.SURRENDER]: PHASE.RECAPTURED,
    [EVENT.LEFT_AREA]: PHASE.GONE,          // the march out in chains, escaped on the rope bridge
  },
  [PHASE.UNLOCKED]: {
    [EVENT.RELOCK]: PHASE.HELD,
    [EVENT.SLIP_OUT]: PHASE.OUT_QUIET,
    [EVENT.FIGHT]: PHASE.FIGHT,
    [EVENT.SURRENDER]: PHASE.RECAPTURED,
  },
  [PHASE.FIGHT]: {
    [EVENT.WON]: null,                      // back to OUT_QUIET, or to HUNTED if the alarm was already up (see escapeStep)
    [EVENT.FOE_ESCAPED]: PHASE.HUNTED,
    [EVENT.LOST]: PHASE.RECAPTURED,
    [EVENT.SURRENDER]: PHASE.RECAPTURED,
    [EVENT.LEFT_AREA]: PHASE.GONE,          // fled the fight off the plate and out of the area
  },
  [PHASE.OUT_QUIET]: {
    [EVENT.DISCOVERED]: PHASE.HUNTED,
    [EVENT.FIGHT]: PHASE.FIGHT,
    [EVENT.LEFT_AREA]: PHASE.GONE,
    [EVENT.SURRENDER]: PHASE.RECAPTURED,
  },
  [PHASE.HUNTED]: {
    [EVENT.FIGHT]: PHASE.FIGHT,
    [EVENT.LEFT_AREA]: PHASE.GONE,
    [EVENT.SURRENDER]: PHASE.RECAPTURED,
    [EVENT.LOST]: PHASE.RECAPTURED,         // caught by a wave without a fight of their own
  },
  [PHASE.GONE]: {},                         // terminal for Velkynvelve; New Game resets it
  [PHASE.RECAPTURED]: {
    [EVENT.RETURNED]: PHASE.HELD,
  },
}

/** Can `event` happen in this phase? */
export function canStep(escape, event) {
  const m = MOVES[escape && escape.phase]
  return !!m && Object.prototype.hasOwnProperty.call(m, event)
}

/**
 * The one way the phase changes. Returns a NEW escape; a refused event returns the same phase with `refused`
 * naming why, so the caller can log it instead of silently doing nothing.
 * `ctx`: {now, rotation, why}.
 */
export function escapeStep(escape, event, ctx = {}) {
  const e = escape && PHASES.includes(escape.phase) ? escape : newEscape(ctx.now, ctx.rotation)
  if (!canStep(e, event)) return { ...e, refused: `${event} cannot happen while ${e.phase}` }
  const now = ctx.now ?? 0, rotation = ctx.rotation ?? 0
  let to = MOVES[e.phase][event]
  // a won fight goes back to where it came from: a fight won while hunted leaves them hunted [HOUSE]
  if (event === EVENT.WON) to = e.back === PHASE.HUNTED ? PHASE.HUNTED : PHASE.OUT_QUIET
  const next = { phase: to, since: now, atRotation: rotation, why: ctx.why || event, back: null, discoverBy: null }
  if (to === PHASE.FIGHT) next.back = e.phase
  if (to === PHASE.OUT_QUIET) next.discoverBy = now + QUIET_WINDOW_MS
  return next
}

// ─── Discovery ──────────────────────────────────────────────────────────────────────────────────────

/** Is "out, quiet" over? The watch has changed since they got out, or the window ran out. */
export function discoveryDue(escape, now, rotation) {
  if (!escape || escape.phase !== PHASE.OUT_QUIET) return false
  if ((rotation ?? 0) > (escape.atRotation ?? 0)) return true
  return escape.discoverBy != null && now >= escape.discoverBy
}

/** Seconds left in the quiet window, for the countdown on the map (null when there is no window). */
export function quietSecondsLeft(escape, now) {
  if (!escape || escape.phase !== PHASE.OUT_QUIET || escape.discoverBy == null) return null
  return Math.max(0, Math.ceil((escape.discoverBy - now) / 1000))
}

/** The countdown banner's words, or null. "The watch changes" is honest: whichever comes first ends it. */
export function quietBanner(escape, now) {
  const s = quietSecondsLeft(escape, now)
  if (s == null) return null
  const m = Math.floor(s / 60), r = String(s % 60).padStart(2, "0")
  return `The watch changes in ${m}:${r} — the body will be found`
}

/** What a change of the watch means in each phase. */
export function watchChangeMeans(escape) {
  switch (escape && escape.phase) {
    case PHASE.HELD: return "relief"           // the relief takes the bridge, as today
    case PHASE.UNLOCKED: return "tries_gate"   // the new watch tries the gate: relock + the shakedown (lib/shakedown.mjs)
    case PHASE.OUT_QUIET: return "finds_body"  // → DISCOVERED → HUNTED. Never a calm fresh pair on the bridge.
    case PHASE.HUNTED: return "wave"           // another wave comes
    default: return "none"                     // a fight in progress, gone, or being marched back
  }
}

// ─── Policy: what every system does in each phase ───────────────────────────────────────────────────
// The matrix, written once. A system that wants to know whether to act asks this, never gateOpen/brokeOut.

const OFF = false, ON = true

const POLICY = {
  [PHASE.HELD]: {
    gateWarning: ON, volleys: ON, leaningGuard: ON, whistle: ON, pickpocket: ON,
    jorlanVisits: ON, labor: ON, doomClock: ON, pacingBeats: ON,
    guardsOnSight: "bars",      // the pen's own rule: warning, then volleys
    jorlan: "talk",
    shortRest: { ok: true, why: "" },
    doorCard: "locked",
  },
  [PHASE.UNLOCKED]: {
    gateWarning: ON, volleys: ON, leaningGuard: OFF, whistle: OFF, pickpocket: OFF,
    jorlanVisits: ON, labor: ON, doomClock: ON, pacingBeats: ON,
    guardsOnSight: "bars",
    jorlan: "talk",
    shortRest: { ok: true, why: "" },
    doorCard: "unlocked",      // the sneaking door prompt (PR #1328) / who goes through
  },
  [PHASE.FIGHT]: {
    gateWarning: OFF, volleys: OFF, leaningGuard: OFF, whistle: OFF, pickpocket: OFF,
    jorlanVisits: OFF, labor: OFF, doomClock: OFF, pacingBeats: OFF,
    guardsOnSight: "fight",
    jorlan: "fight",
    shortRest: { ok: false, why: "Not in the middle of a fight." },
    doorCard: "none",
  },
  [PHASE.OUT_QUIET]: {
    gateWarning: OFF, volleys: OFF, leaningGuard: OFF, whistle: OFF, pickpocket: OFF,
    jorlanVisits: OFF, labor: OFF, doomClock: OFF, pacingBeats: OFF,
    guardsOnSight: "fight",     // a drow who sees escaped prisoners attacks (Sam, 2026-10-26); one who runs raises the alarm
    jorlan: "talk_knows",       // he still speaks first, and he knows a guard is dead
    shortRest: { ok: false, why: "Not here. The next watch will find the body, and an hour is far longer than you have." },
    doorCard: "open",           // in and out freely; "call the others out" is offered from the landing
  },
  [PHASE.HUNTED]: {
    gateWarning: OFF, volleys: OFF, leaningGuard: OFF, whistle: OFF, pickpocket: OFF,
    jorlanVisits: OFF, labor: OFF, doomClock: OFF, pacingBeats: OFF,
    guardsOnSight: "fight",
    jorlan: "hunt",             // [SAM, 2026-11-13] "Lead the hunt." — unless he pledged (see jorlanStance)
    shortRest: { ok: false, why: "The alarm is up. Nobody rests with the horn still sounding." },
    doorCard: "open",
  },
  [PHASE.GONE]: {
    gateWarning: OFF, volleys: OFF, leaningGuard: OFF, whistle: OFF, pickpocket: OFF,
    jorlanVisits: OFF, labor: OFF, doomClock: OFF, pacingBeats: OFF,
    guardsOnSight: "fight",
    jorlan: "absent",
    shortRest: { ok: true, why: "" },
    doorCard: "none",
  },
  [PHASE.RECAPTURED]: {
    gateWarning: OFF, volleys: OFF, leaningGuard: OFF, whistle: OFF, pickpocket: OFF,
    jorlanVisits: OFF, labor: OFF, doomClock: OFF, pacingBeats: OFF,
    guardsOnSight: "escort",    // the surrender scene is driving them
    jorlan: "absent",
    shortRest: { ok: false, why: "You are being marched back to the pen." },
    doorCard: "none",
  },
}

/** What every system does in this phase. Unknown or missing → HELD, the safe default. */
export function policyFor(escape) {
  const p = escape && POLICY[escape.phase]
  return p || POLICY[PHASE.HELD]
}

/**
 * Jorlan's stance. A pledge he gave (PR #1324, Malachar's [JORLAN_PLEDGE:]) holds through the hunt: he stands
 * aside rather than leading the drow onto the prisoner he freed. [HOUSE]
 */
export function jorlanStance(escape, { pledged = false } = {}) {
  const s = policyFor(escape).jorlan
  return s === "hunt" && pledged ? "aside" : s
}

// ─── What Malachar is told ──────────────────────────────────────────────────────────────────────────
// Every hand-off carries this line, so no NPC answers a breakout as if it had not happened.

const TOLD = {
  [PHASE.HELD]: "The prisoners are locked in the pen. The drow believe it is secure.",
  [PHASE.UNLOCKED]: "The pen gate's lock is off, but nobody has gone out and the drow do not know it yet.",
  [PHASE.FIGHT]: "The prisoners are breaking out: a fight with the gate watch is under way.",
  [PHASE.OUT_QUIET]: "The prisoners are OUT. They killed the gate watch and nobody alive knows yet; the next watch will find the body. Any drow who sees them knows exactly what happened.",
  [PHASE.HUNTED]: "The prisoners have escaped and the alarm is up. The drow are hunting them; Jorlan leads the hunt.",
  [PHASE.GONE]: "The prisoners have escaped Velkynvelve and are on the road.",
  [PHASE.RECAPTURED]: "The escape failed. The prisoners are being beaten and marched back to the pen.",
}

/** One line for Malachar's prompt. `facts`: {dead: ["the male gate guard"], pledged}. */
export function malacharLine(escape, facts = {}) {
  const e = escape && PHASES.includes(escape.phase) ? escape : newEscape()
  let line = `ESCAPE: ${e.phase}. ${TOLD[e.phase]}`
  if (e.phase === PHASE.HUNTED && facts.pledged) line = line.replace("Jorlan leads the hunt.", "Jorlan, who gave his word, stands aside.")
  const dead = Array.isArray(facts.dead) ? facts.dead.filter(Boolean) : []
  if (dead.length && e.phase !== PHASE.HELD && e.phase !== PHASE.UNLOCKED) line += ` Dead: ${dead.join(", ")}.`
  return line
}

// ─── Reading an old save ────────────────────────────────────────────────────────────────────────────
// A run saved before the phase existed has only the flags. Work out the phase from them once, then the phase is
// the truth. `now`/`rotation` stamp it; an old OUT_QUIET gets a fresh window rather than an instant discovery.

export function escapeFromFlags(s = {}, now = 0, rotation = 0) {
  const stamp = (phase, why, extra = {}) => ({ phase, since: now, atRotation: rotation, why, back: null, discoverBy: null, ...extra })
  if (s.escape && PHASES.includes(s.escape.phase)) return s.escape
  const B = s.battle
  if (B && !B.over) return stamp(PHASE.FIGHT, "a fight was under way", { back: s.brokeOut ? PHASE.OUT_QUIET : PHASE.UNLOCKED })
  if (s.brokeOut) {
    if (s.alarm || s.hunted) return stamp(PHASE.HUNTED, "the alarm was up")
    return stamp(PHASE.OUT_QUIET, s.brokeOut.why || "they broke out", { discoverBy: now + QUIET_WINDOW_MS })
  }
  if (s.gateOpen) return stamp(PHASE.UNLOCKED, s.doorShut ? "shut but unlocked" : "the gate stands open")
  return stamp(PHASE.HELD, "in the pen")
}
