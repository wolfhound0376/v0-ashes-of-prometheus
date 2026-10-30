// The pen-key shakedown: what the drow do when their key goes missing and nothing happens.
//
// Design of record: project doc claude/Pen_Key_And_Watch_2026-10-30.md.
// Sam's rulings, 2026-10-30. [SAM] his words; [HOUSE] Claude's proposal inside them; [BOOK] Out of the Abyss.
//
// The shape: a prisoner lifts the pen key off a guard (walk-loot pockets, PR #966/#971) and then sits on it. Two
// guard rotations later the drow come in and search everyone. The party may submit — which costs a prisoner's life
// — or fight, which opens the door and raises the alarm.
//
// Pure: no DOM, no fetch, no Supabase. Rotations come from the stage roster (lib/stage-roster.ts `rotations`),
// which is the same counter that brings Jorlan on — so this could not fire at all until the watch could actually
// change (PRs #1139, #1144).

/** The rotation gap between the key going missing (or the last shakedown) and the next one. [SAM] */
export const SHAKEDOWN_ROTATIONS = 2

/**
 * [SAM, 2026-10-30] "Once per every time two rotations pass with a key unaccounted for" — so this is NOT a
 * one-shot. A party that keeps the key and does nothing is shaken down again, and again, each one costing
 * another prisoner under Branch A. Giving the key up or using it is what ends the cycle.
 *
 * `since` is the rotation the clock last restarted from: the rotation at which the key went missing, or the
 * rotation of the last shakedown, whichever is later.
 */
export type KeyWatch = {
  /** The stage's rotation count when the key went missing. null = no key is unaccounted for. */
  takenAtRotation: number | null
  /** The rotation of the most recent shakedown, so the next is due two rotations after THAT, not after the theft. */
  lastShakedownRotation: number | null
  /** The key has been handed back or used: the cycle is over and nothing re-arms it. */
  resolved: boolean
}

export const noKeyWatch = (): KeyWatch => ({ takenAtRotation: null, lastShakedownRotation: null, resolved: false })

/** The key just came off a guard at `rotation`. Re-arming after a resolution is deliberate: they can steal it again. */
export function keyTaken(rotation: number): KeyWatch {
  return { takenAtRotation: rotation, lastShakedownRotation: null, resolved: false }
}

/** The key went back to the drow, or was used on the gate: the drow stop looking. */
export function keyResolved(w: KeyWatch): KeyWatch {
  return { ...w, resolved: true }
}

/** Is a shakedown due at `rotation`? Two rotations since the theft, or since the last one. */
export function shakedownDue(w: KeyWatch, rotation: number): boolean {
  if (w.resolved || w.takenAtRotation === null) return false
  const since = Math.max(w.takenAtRotation, w.lastShakedownRotation ?? w.takenAtRotation)
  return rotation - since >= SHAKEDOWN_ROTATIONS
}

/** Record that one just happened, so the next is due two rotations after this one. */
export function shakedownHappened(w: KeyWatch, rotation: number): KeyWatch {
  return { ...w, lastShakedownRotation: rotation }
}

// ─── Who comes in ─────────────────────────────────────────────────────────────────────────────────────────────
// [SAM, 2026-10-30] "two guards and one quaggoth or one mounted guard and one elite drow."
// The second is the harder draw: the elite's passive Perception is 14 against a regular drow's 12, and the mount
// is the giant lizard already used at the labor plates (SRD, climb 30 ft), so it can follow anyone down the cliff.

export type EnforcerParty = { slugs: string[]; mounted: boolean; passive: number; label: string }

export const ENFORCER_PARTIES: readonly EnforcerParty[] = [
  { slugs: ["drow-guard-male", "drow-guard-female", "quaggoth"], mounted: false, passive: 12, label: "two drow and a quaggoth" },
  { slugs: ["drow-guard-male", "drow-elite-warrior"], mounted: true, passive: 14, label: "a mounted drow and an elite warrior" },
] as const

/** Which pair walks in. `rand` returns [0,1). */
export function rollEnforcers(rand: () => number = Math.random): EnforcerParty {
  return ENFORCER_PARTIES[Math.min(ENFORCER_PARTIES.length - 1, Math.floor(rand() * ENFORCER_PARTIES.length))]
}

// ─── Branch A: give up the key ────────────────────────────────────────────────────────────────────────────────
// [SAM] "it is gone from inventory and an NPC is murdered at random, leaving a RIP tombstone for them - only
// Buppido is spared during this interaction. The RIP tombstone replaces their body."
// [SAM, 2026-10-30] Prisoner NPCs only — never a player character.

/** Spared by name, always. [SAM] Buppido and no one else. */
export const SPARED = ["Buppido"] as const

export type Candidate = { name: string; dead?: boolean; gone?: boolean }

/**
 * Who can be the one killed: a living prisoner NPC who is still here, minus Buppido.
 *
 * Player characters are not in this pool at all — the caller passes prisoner NPCs (lib/labor-walk PRISONERS),
 * never the party. That is a ruling, not an oversight: the shakedown must never be able to delete someone's hero.
 */
export function victimPool(present: Candidate[]): string[] {
  return present
    .filter((c) => !c.dead && !c.gone)
    .map((c) => c.name)
    .filter((n) => !(SPARED as readonly string[]).includes(n))
}

/** The one who dies, or null when there is nobody left to kill (every prisoner dead, or only Buppido remains). */
export function pickVictim(present: Candidate[], rand: () => number = Math.random): string | null {
  const pool = victimPool(present)
  if (!pool.length) return null
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))]
}

// ─── Branch B: fight ──────────────────────────────────────────────────────────────────────────────────────────
// [SAM] "If the group wins the fight then the door is left open to escape but now they will need to fight through
// with the alarm on; soon drow will start pouring in from the map."
// [SAM, 2026-10-30] Approved: two-minute waves, three waves, a countdown banner on the pixel map.
//
// [HOUSE] The numbers. Velkynvelve garrisons 19 drow and 12 quaggoths [BOOK], so the response must be finite or
// the outpost abandons every post it has. Three waves commit 6 drow and 2 quaggoths; with the enforcers already
// in the pen that is 8 of 19 — heavy, survivable, and it leaves the rest of the outpost plausibly manned.
//
// Two minutes is roughly 6-8 rounds: a full wave-gap to clear the plate. Sam's constraint was "make it reasonable
// or this will be impossible to get out", and the banner is what makes that legible BEFORE the first bolt flies.

export const WAVE_INTERVAL_MS = 2 * 60 * 1000
export const WAVE_COUNT = 3

export type Wave = { n: number; atMs: number; slugs: string[]; from: string[] }

export const WAVES: readonly Wave[] = [
  { n: 1, atMs: 1 * WAVE_INTERVAL_MS, slugs: ["drow-guard-male", "drow-guard-female"], from: ["bridge"] },
  { n: 2, atMs: 2 * WAVE_INTERVAL_MS, slugs: ["drow-guard-male", "drow-guard-female", "quaggoth"], from: ["bridge", "stairs"] },
  { n: 3, atMs: 3 * WAVE_INTERVAL_MS, slugs: ["drow-guard-male", "drow-guard-female", "quaggoth"], from: ["bridge", "stairs"] },
] as const

/** Waves whose time has come but which have not landed yet, given how long the alarm has been up. */
export function wavesDue(elapsedMs: number, landed: number): Wave[] {
  return WAVES.filter((w) => w.n > landed && elapsedMs >= w.atMs)
}

/** The next wave still to come, or null once all three have landed. */
export function nextWave(landed: number): Wave | null {
  return WAVES.find((w) => w.n > landed) ?? null
}

/**
 * What the banner reads. `null` once the last wave has landed — nothing more is coming, and a countdown to
 * nothing is a lie the players would plan around.
 */
export function bannerText(elapsedMs: number, landed: number): string | null {
  const w = nextWave(landed)
  if (!w) return null
  const left = Math.max(0, w.atMs - elapsedMs)
  const mm = Math.floor(left / 60000)
  const ss = Math.floor((left % 60000) / 1000)
  const when = `${mm}:${String(ss).padStart(2, "0")}`
  return w.n === 1 ? `ALARM RAISED — first spears in ${when}` : `WAVE ${w.n} in ${when}`
}

/**
 * The alarm stops sending anyone once the party is off the pen plate and one plate beyond it [HOUSE] — the escape
 * is through the outpost, not a last stand in the pen. Survivors still follow; nothing new spawns.
 */
export const PEN_PLATE = "11"
export function wavesStopped(plate: string, platesLeft: number): boolean {
  return String(plate) !== PEN_PLATE && platesLeft >= 1
}
