// Which animation clip plays, and when.
//
// Meshy names its clips whatever the source animation was called —
// "Combat_Stance", "Charged_Slash", "mage_soell_cast_3" (sic, and that typo
// is IN the asset). So the board never asks for a clip by exact name. It
// asks for a STATE, and this resolves the best clip the model happens to
// carry, falling back down a chain until something matches. A model with
// only "Walking" still idles — it just idles by standing in its walk pose,
// which is infinitely better than a T-pose.

export type TokenState =
  | "idle" | "walk" | "attack" | "cast" | "hurt" | "dead"
  // ── DEFENCE ───────────────────────────────────────────────────────────
  // A miss is not a small hit. Until now the board had no way to say so:
  // the only reaction state was "hurt", so a sword that went nowhere near
  // a rogue still made her flinch as though it had opened her arm. Two
  // separate playtests read that as "the dodge is broken" — correctly,
  // because what they were watching was a hit animation on a miss.
  //
  // Three states rather than one, because they are not the same motion and
  // the models already carry all three: you get out of the way (dodge), you
  // turn the blade (parry), or you take it on the shield (block).
  | "dodge" | "parry" | "block"

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
  // A flinch, THEN a fall. Leading with fall1 meant every hit read as a
  // collapse: the creature dropped, stood back up, and did it again next
  // round. A stagger is what taking damage looks like; falling is what dying
  // looks like, and the dead clip already covers that.
  // NEITHER `back_jump` NOR `fall1` BELONGS HERE, and both were.
  //
  // Read against the models we actually ship, this chain was playing the
  // wrong motion on two of six:
  //
  //   Kenta (hero-warlock) has no hit clip, so `back_jump` caught him and he
  //   LEAPT BACKWARDS OUT OF REACH every time something connected. A dodge
  //   played on a hit is the same lie as a flinch played on a miss, running
  //   the other way.
  //
  //   Ront has no hit clip either, so `fall1` caught him: he collapsed on
  //   every scratch and stood back up, once a round, at 1 point of damage.
  //
  // The comment this chain used to carry said "a flinch, THEN a fall" and
  // ended in fall1 for exactly that reason - but a fall is what DYING looks
  // like, `dead` already covers it, and reaching for it on a graze reads as a
  // creature that cannot take a hit. A model with no flinch now plays nothing
  // here and the procedural stagger answers instead (see hurtFallback).
  hurt: ["hit", "hurt", "stagger", "impact", "damage"],
  dead: ["dead", "death", "fall1", "fall"],

  // The 20-clip Meshy hero set already has the motions; nothing had ever
  // asked for them. `back_jump` IS a dodge — it is a standing leap backwards
  // out of reach, and it has been sitting at the bottom of the `hurt` chain
  // as a last resort, which is the only place it could ever play. It leads
  // here instead.
  //
  // `backflip` is here because without it the HERO model — the one the
  // players actually watch — resolved dodge to null and stood still. It has
  // no Back_Jump; what it has is Backflip_and_Hooks. An acrobatic evade is a
  // slightly showier dodge than a step back, which for a rogue is arguably
  // the point.
  dodge: ["dodge", "evade", "back_jump", "backflip", "roll", "sidestep", "dive"],
  // `counterstrike` is a parry with a riposte on the end of it — a blade
  // turned aside and answered. That reads as a parry far better than
  // anything else in the set, and it is the clip a fighter should get when
  // an attack misses them by one or two.
  parry: ["parry", "deflect", "counterstrike", "block", "guard"],
  block: ["block", "shield", "guard", "brace", "parry", "counterstrike"],
}

/**
 * States where ANY pose beats a T-pose, so an unmatched state still returns
 * something. The others deliberately return null instead: a model with no
 * death clip holding its stance reads as "standing"; the same model falling
 * back to clip[0] reads as casting a spell as it dies. Wrong is worse than
 * still.
 */
const LAST_RESORT: TokenState[] = ["idle", "walk"]

// Note that dodge/parry/block are deliberately absent from LAST_RESORT, and
// their chains deliberately do not end in "hurt".
//
// A model with no defensive clip returns null and plays NOTHING. That looks
// wrong, and it is still the right answer: the alternative is falling back to
// the flinch, which is precisely the bug these states exist to remove. A
// miniature that stands still on a miss is unfinished. A miniature that
// recoils in pain on a miss is lying about what happened, and the table
// believes it.
//
// The sound still fires either way — combat/parry_blade, combat/block_shield
// and combat/melee_miss are all in the bank — so an unrigged token is not
// silent, just not animated.

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
export const ONE_SHOT: TokenState[] = ["attack", "cast", "hurt", "dodge", "parry", "block"]

/**
 * States that play once and then HOLD their last frame. Death is not a loop
 * and it is not something you come back from: looping it stands the body up
 * to die again every three seconds, and handing it back to idle stands the
 * body up for good. It plays once and stays down.
 */
export const HOLD_LAST: TokenState[] = ["dead"]

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
  quick: ["spell_cast_3", "soell_cast_4", "spell_cast_4", "spell_cast", "soell_cast", "spell_cast_2", "charged_spell_cast"],
  ranged: ["spell_cast_2", "soell_cast_3", "spell_cast", "soell_cast", "spell_cast_3", "charged_spell_cast"],
  heavy: ["charged_spell_cast", "charged_ground_slam", "spell_cast_2", "spell_cast", "soell_cast", "spell_cast_3"],
}

/**
 * Clips that are a cast only because nothing better exists.
 *
 * These stay OUT of the variety pool. "attack" on a martial is a sword swing,
 * and rotating spells onto it would have a cleric bless someone with an axe.
 * They are reached only when a model has no spell clip at all.
 */
const CAST_GENERIC = ["cast", "attack"]

/**
 * A stable number from a string.
 *
 * Deliberately not Math.random(). A spell must look the SAME every time it is
 * cast — that is how a player learns to recognise Fireball across the table —
 * while DIFFERENT spells of the same weight should look different. A hash of
 * the spell's name gives both: fixed per spell, spread across spells.
 */
function hashOf(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0)
}

/**
 * Which cast motion this spell plays on this model.
 *
 * The old version took the FIRST candidate that matched, so every spell of a
 * given weight played the identical clip — a caster with four spell clips
 * still only ever used one of them per weight, and every cantrip looked the
 * same. Now every clip the weight would accept goes into a pool, and the
 * spell's own name chooses from it.
 *
 * The chain order still matters: it is a preference, not a filter, so a heavy
 * spell still leans toward the charged clips. `spellName` is optional — with
 * no name this behaves exactly as it always did and returns the best match.
 */
export function castClipFor(
  weight: CastWeight,
  available: string[],
  spellName?: string,
): string | null {
  if (!available.length) return null

  const pool: string[] = []
  for (const want of CAST_CANDIDATES[weight]) {
    const hit = match(available, want)
    if (hit && !pool.includes(hit)) pool.push(hit)
  }
  if (!pool.length) {
    for (const want of CAST_GENERIC) {
      const hit = match(available, want)
      if (hit) return hit
    }
    return clipFor("cast", available)
  }
  if (!spellName || pool.length === 1) return pool[0]
  return pool[hashOf(spellName.toLowerCase()) % pool.length]
}

// ────────────────────────────────────────────────────────────────────────────
// DEFENCE
//
// How the server's verdict becomes a motion on the target's miniature.
//
// /api/combat's "cast" verb reports facts — outcome, margin, whether a shield
// was involved — and never names a clip, because it has no idea which clips
// this particular model was rigged with. This function is the other half of
// that contract and it lives client-side for the same reason.
// ────────────────────────────────────────────────────────────────────────────

/** The verdict strings /api/combat returns as `outcome`. */
export type AttackOutcome =
  | "hit" | "crit" | "miss" | "fumble"
  | "saved" | "saved-half" | "failed-save" | "heal"

/**
 * What the TARGET does about it.
 *
 * `margin` is the server's `total - dc`, so it is negative on a miss and the
 * magnitude is how badly the attack fell short.
 *
 * The threshold is the whole idea. A miss by 1 or 2 was very nearly a hit and
 * has to be actively turned aside — steel, or a shield if they carry one. A
 * miss by more than that was never going to land, and a fighter who "parries"
 * a sword that passed a foot wide looks ridiculous; they simply were not
 * there. Three is where that flips in play: it is one step of a d20, roughly
 * the difference between a good roll and a bad one, and it keeps parries
 * uncommon enough to still register as an event.
 *
 * A natural 1 gets nothing at all. The attacker fumbled it themselves; the
 * target did not have to do a single thing, and giving them a heroic dodge
 * for it steals the joke.
 */
export function defenceFor(
  outcome: AttackOutcome,
  margin: number,
  opts: { hasShield?: boolean } = {},
): TokenState | null {
  switch (outcome) {
    case "fumble":
      return null
    case "miss":
      // Near miss → turn it. Wide miss → step out of it.
      if (margin >= -3) return opts.hasShield ? "block" : "parry"
      return "dodge"
    case "saved":
      // Got entirely out of the way of a spell. Never a parry: you do not
      // parry a fireball, and a shield does not help you here either.
      return "dodge"
    case "saved-half":
      // Took some of it anyway. Bracing behind a shield reads better than a
      // clean evade, since they visibly did not fully escape it.
      return opts.hasShield ? "block" : "dodge"
    case "hit":
    case "crit":
    case "failed-save":
      return "hurt"
    case "heal":
      return null
    default:
      return null
  }
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
// "sneak" alongside "hide": the action was renamed and the verb was not, so
// both names reach here depending on which half deployed first.
const MUTE_ACTIONS = ["dash", "disengage", "hide", "sneak", "search", "help", "ready", "use an object"]

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
  // A weapon SWINGS. Falling through to the spell branch below made Samson's
  // mace play a spell-cast clip, which is how a cleric ends up conjuring his
  // own mace at somebody.
  if (kind === "weapon") return { state: "attack", weight: "quick" }
  if (kind === "cantrip") return { state: "cast", weight: "quick" }
  const heavy = HEAVY_SPELLS.some((h) => name.includes(h))
  return { state: "cast", weight: heavy ? "heavy" : "ranged" }
}
