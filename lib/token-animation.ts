// Which animation clip plays, and when.
//
// Meshy names its clips whatever the source animation was called —
// "Combat_Stance", "Charged_Slash", "mage_soell_cast_3" (sic, and that typo
// is IN the asset). So the board never asks for a clip by exact name. It
// asks for a STATE, and this resolves the best clip the model happens to
// carry, falling back down a chain until something matches. A model with
// only "Walking" still idles — it just idles by standing in its walk pose,
// which is infinitely better than a T-pose.

export type TokenState = "idle" | "walk" | "attack" | "cast" | "hurt" | "dead"

/** Candidate clip names per state, best first. Matched case-insensitively
 *  as substrings, so "Armature|Combat_Stance|baselayer" still hits. */
const CANDIDATES: Record<TokenState, string[]> = {
  idle: ["combat_stance", "axe_stance", "alert", "idle", "stance", "walking"],
  walk: ["walking", "walk", "running", "run"],
  // A caster has no sword swing. When a model carries no attack clip at all,
  // its quick cast IS its attack — Kenta's "Attack" is an Eldritch Blast —
  // so this chain ends in the cast clips rather than in nothing.
  attack: [
    "attack", "charged_slash", "counterstrike", "double_blade_spin", "high_kick",
    "charged_ground_slam", "spell_cast_3", "spell_cast", "soell_cast", "cast",
  ],
  cast: ["charged_spell_cast", "spell_cast", "soell_cast", "cast", "attack"],
  hurt: ["fall1", "fall", "hit", "hurt", "back_jump"],
  dead: ["dead", "death", "fall1", "fall"],
}

/**
 * States where ANY pose beats a T-pose, so an unmatched state still returns
 * something. The others deliberately return null instead: a model with no
 * death clip holding its stance reads as "standing"; the same model falling
 * back to clip[0] reads as casting a spell as it dies. Wrong is worse than
 * still.
 */
const LAST_RESORT: TokenState[] = ["idle", "walk"]

/** Find a clip whose name matches `want` — exact segment first, then substring. */
function match(available: string[], want: string): string | null {
  const lower = available.map((n) => ({ raw: n, key: n.toLowerCase() }))
  // Exact-ish first: a clip whose name IS the candidate (ignoring the
  // "Armature|...|baselayer" wrapper Meshy adds).
  const exact = lower.find((c) => c.key.split("|").some((part) => part === want))
  if (exact) return exact.raw
  const partial = lower.find((c) => c.key.includes(want))
  return partial ? partial.raw : null
}

/**
 * Pick a clip name from what the model actually has.
 * `available` is the list of clip names on the loaded GLTF.
 */
export function clipFor(state: TokenState, available: string[]): string | null {
  if (!available.length) return null
  for (const want of CANDIDATES[state]) {
    const hit = match(available, want)
    if (hit) return hit
  }
  return LAST_RESORT.includes(state) ? available[0] : null
}

/** States that play once and return to idle, rather than looping. */
export const ONE_SHOT: TokenState[] = ["attack", "cast", "hurt"]

// ────────────────────────────────────────────────────────────────────────────
// CASTING
//
// A caster has more than one cast in them, and they are not interchangeable:
// a cantrip is a flick of the wrist, a levelled spell is a two-handed
// overhead discharge. Picking by weight keeps a Fireball from looking like a
// Firebolt.
// ────────────────────────────────────────────────────────────────────────────

export type CastWeight = "quick" | "ranged" | "heavy"

/** Raw Meshy names are in these chains too, so this works on an unmerged
 *  Meshy export as well as on our merged assets. */
const CAST_CANDIDATES: Record<CastWeight, string[]> = {
  quick: ["spell_cast_3", "soell_cast_4", "spell_cast", "soell_cast", "charged_spell_cast", "cast", "attack"],
  ranged: ["spell_cast_2", "soell_cast_3", "spell_cast", "soell_cast", "charged_spell_cast", "cast", "attack"],
  heavy: ["charged_spell_cast", "charged_ground_slam", "spell_cast", "soell_cast", "cast", "attack"],
}

export function castClipFor(weight: CastWeight, available: string[]): string | null {
  if (!available.length) return null
  for (const want of CAST_CANDIDATES[weight]) {
    const hit = match(available, want)
    if (hit) return hit
  }
  return clipFor("cast", available)
}

export type CastHand = "LeftHand" | "RightHand"

/**
 * When the spell actually LEAVES the hand, and which hand throws it.
 *
 * These are measured off the clips, not guessed: the release is the frame
 * where the casting hand reaches full extension. Firing the effect at t=0
 * instead is the tell that separates a game from a tech demo — the light
 * leaves his palm before he has moved.
 *
 * Measured 2026-08-27 by sampling the clips' forward kinematics — the release
 * is where the casting hand peaks in reach. Order matters: the longest name
 * wins, because "charged_spell_cast_1" is a DIFFERENT clip from
 * "charged_spell_cast" (4.30s right-handed vs 2.67s two-handed overhead) and
 * a substring match would otherwise hand it the wrong hand and the wrong
 * frame.
 */
const CAST_EVENTS: { match: string; release: number; hand: CastHand }[] = [
  // hero-rogue.glb's cast — the 20-clip Meshy set every hero currently uses.
  { match: "charged_spell_cast_1", release: 2.19, hand: "RightHand" },
  { match: "charged_spell_cast", release: 1.95, hand: "LeftHand" }, // both hands overhead
  { match: "spell_cast_2", release: 1.1, hand: "RightHand" },
  { match: "soell_cast_3", release: 1.1, hand: "RightHand" },
  { match: "spell_cast_3", release: 0.6, hand: "RightHand" },
  { match: "soell_cast_4", release: 0.6, hand: "RightHand" },
]

/**
 * Release time (seconds into the clip) and emitter bone for a cast clip.
 * An unknown clip releases at 45% of its length from the right hand, which
 * is roughly where a windup peaks and is never embarrassingly wrong.
 */
export function castEventFor(clipName: string, duration: number): { release: number; hand: CastHand } {
  const key = clipName.toLowerCase()
  for (const e of CAST_EVENTS) {
    if (key.includes(e.match)) {
      return { release: Math.min(e.release, Math.max(0, duration - 0.05)), hand: e.hand }
    }
  }
  return { release: duration * 0.45, hand: "RightHand" }
}

// ────────────────────────────────────────────────────────────────────────────
// WHAT THE HUD ASKED FOR
// ────────────────────────────────────────────────────────────────────────────

/** Spells whose casting should read as heavy, whatever level the sheet says. */
const HEAVY_SPELLS = [
  "web", "fireball", "hunger of hadar", "darkness", "cloud of daggers",
  "shatter", "thunderwave", "spirit guardians", "flame strike", "sleet storm",
  "wall of", "summon", "conjure", "circle of",
]

/** Actions that are not a swing or a spell get no animation at all — a Dash
 *  is footwork the board already shows by moving the token. */
const MUTE_ACTIONS = ["dash", "disengage", "hide", "search", "help", "ready", "use an object"]

export interface CastPlan {
  state: TokenState
  weight: CastWeight
}

/**
 * Turn an ability-bar press into a state + a cast weight, or null when the
 * action should not animate the miniature.
 *
 * `kind` comes straight off the HUD's ability list: "action" for the core
 * five, "cantrip" and "prepared" for the character's real spells.
 */
export function castPlanFor(ability: string, kind: string): CastPlan | null {
  const name = ability.trim().toLowerCase()
  if (kind === "action") {
    if (MUTE_ACTIONS.includes(name)) return null
    if (name === "dodge") return { state: "hurt", weight: "quick" }
    // "Attack" — the attack chain ends in the cast clips, so a caster
    // attacking still performs a cast rather than freezing.
    return { state: "attack", weight: "quick" }
  }
  if (kind === "cantrip") return { state: "cast", weight: "quick" }
  const heavy = HEAVY_SPELLS.some((h) => name.includes(h))
  return { state: "cast", weight: heavy ? "heavy" : "ranged" }
}
