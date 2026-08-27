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
  attack: ["attack", "charged_slash", "counterstrike", "double_blade_spin", "high_kick", "charged_ground_slam"],
  cast: ["charged_spell_cast", "spell_cast", "soell_cast", "cast", "attack"],
  hurt: ["fall1", "fall", "hit", "hurt", "back_jump"],
  dead: ["dead", "death", "fall1", "fall"],
}

/**
 * Pick a clip name from what the model actually has.
 * `available` is the list of clip names on the loaded GLTF.
 */
export function clipFor(state: TokenState, available: string[]): string | null {
  if (!available.length) return null
  const lower = available.map((n) => ({ raw: n, key: n.toLowerCase() }))
  for (const want of CANDIDATES[state]) {
    // Exact-ish first: a clip whose name IS the candidate (ignoring the
    // "Armature|...|baselayer" wrapper Meshy adds).
    const exact = lower.find((c) => c.key.split("|").some((part) => part === want))
    if (exact) return exact.raw
    const partial = lower.find((c) => c.key.includes(want))
    if (partial) return partial.raw
  }
  return available[0] // something is better than a frozen T-pose
}

/** States that play once and return to idle, rather than looping. */
export const ONE_SHOT: TokenState[] = ["attack", "cast", "hurt"]
