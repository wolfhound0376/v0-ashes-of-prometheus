// Shared visual-state logic for character portraits (and, later, 3D panels).
// Both the Phase 1 portrait effects and any future animated character panel
// derive their look from THIS function so the two can never disagree.
//
// Priority order matters — downed beats everything, poison beats a low-HP
// vignette. The rules engine stays authoritative: these visuals reflect state
// that already happened; they never decide outcomes.

export type VisualState =
  | "downed"
  | "restrained"
  | "poisoned"
  | "injured"
  | "idle"

export function characterVisualState(c: {
  hp_current: number
  hp_max: number
  conditions: string[] | null | undefined
}): VisualState {
  const conds = (Array.isArray(c.conditions) ? c.conditions : []).map((s) =>
    String(s).toLowerCase(),
  )
  if (c.hp_current <= 0 || conds.includes("unconscious")) return "downed"
  if (conds.includes("restrained") || conds.includes("paralyzed") || conds.includes("stunned"))
    return "restrained"
  if (conds.includes("poisoned")) return "poisoned"
  if (c.hp_max > 0 && c.hp_current <= c.hp_max * 0.25) return "injured"
  return "idle"
}

/** CSS filter applied to the portrait <img> for each state. */
export const VISUAL_STATE_FILTER: Record<VisualState, string> = {
  downed: "grayscale(0.95) brightness(0.55) contrast(0.9)",
  restrained: "saturate(0.6) brightness(0.75)",
  poisoned: "hue-rotate(40deg) saturate(1.15) brightness(0.85)",
  injured: "saturate(1.1) brightness(0.9)",
  idle: "none",
}

/** Overlay tint (rendered above the portrait) for each state. */
export const VISUAL_STATE_OVERLAY: Record<VisualState, string | null> = {
  downed: "rgba(0, 0, 0, 0.35)",
  restrained: "rgba(90, 70, 140, 0.22)",
  poisoned: "rgba(60, 140, 60, 0.18)",
  injured: null, // injured uses the pulsing red vignette instead of a flat tint
  idle: null,
}
