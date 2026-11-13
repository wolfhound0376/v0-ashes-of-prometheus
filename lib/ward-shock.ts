/**
 * The pen ward's bite (Sam, 2026-11-12: "If it shocks you after you fail … you blackout and your HP drops to one").
 *
 * Pure rule; the write is app/api/walk-ward. HOMEBREW: Out of the Abyss says only that the slave pen is "magically
 * warded against casting" (ch.1) and gives no rule for tampering with the ward.
 *
 * The shock never kills and never heals: a hero above 1 hit point goes to 1; a hero at 1, at 0 or dying is left
 * exactly where they are.
 */
export const WARD_SHOCK_HP = 1

export function hpAfterWardShock(hp: number | null | undefined): number {
  const now = Math.floor(Number(hp ?? 0))
  if (!Number.isFinite(now)) return 0
  return now > WARD_SHOCK_HP ? WARD_SHOCK_HP : Math.max(0, now)
}
