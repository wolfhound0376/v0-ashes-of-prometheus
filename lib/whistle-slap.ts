/**
 * The slap a bard earns by whistling a gate guard into the pen (Sam, 2026-11-12: "The Bard can also whistle, annoying
 * the guard enough to come in" / "The guard slaps the bard").
 *
 * Pure rule; the write is app/api/walk-whistle. HOMEBREW. Sam ruled the slap; the number is [CLAUDE]: one hit point,
 * and it never drops him — a hero at 1, at 0 or dying is left exactly where they are.
 */
export const WHISTLE_SLAP_DAMAGE = 1

export function hpAfterSlap(hp: number | null | undefined): number {
  const now = Math.floor(Number(hp ?? 0))
  if (!Number.isFinite(now)) return 0
  return now > 1 ? Math.max(1, now - WHISTLE_SLAP_DAMAGE) : Math.max(0, now)
}
