// CARRYING CAPACITY (Sam, 2026-11-10: "Is weight getting factored into these items?" — it was stored and never used;
// then "Weight next.").
//
// The rule is the SRD 5.1 one (Using Ability Scores > Strength > Lifting and Carrying): "Carrying Capacity. Your
// carrying capacity is your Strength score multiplied by 15. This is the weight (in pounds) that you can carry."
// A character's `weight_max` already holds that number (Fifi, STR 8: 120). What they carry is every row of
// `inventory_items` that is theirs (worn pieces are rows there too) and not sitting confiscated on the stash:
// weight × quantity.
//
// PAST THE NUMBER THEY ARE ENCUMBERED, NOT REFUSED (Sam, 2026-11-10: "over capacity should create the encumbered variant
// but function as slowed effectively"). HOUSE RULE: the threshold is the carrying capacity itself (not the variant's
// 5 × STR), and the price is the walk's "slowed" — 10 ft off their speed (ENCUMBERED_SLOW_FT), nothing else: no
// disadvantage, no second tier. The one hard stop left is the SRD's own ceiling in the same passage — "Push, Drag, or
// Lift. You can push, drag, or lift a weight in pounds up to twice your carrying capacity" — past 30 × STR the thing
// does not go into the pack at all.
//
// One copy: /api/walk-loot (take), /api/walk-items (pickup, give) all ask this file.

export type CarryVerdict = { ok: boolean; carried: number; max: number | null; add: number; why: string | null; encumbered: boolean }
export const ENCUMBERED_SLOW_FT = 10
/** Twice the carrying capacity: the most anyone can lift at all (SRD, Push, Drag, or Lift). */
export const liftLimit = (max: number) => max * 2
/** Over their carrying capacity: slowed by ENCUMBERED_SLOW_FT. */
export const isEncumbered = (carried: number, max: number | null | undefined) => max != null && Number(max) > 0 && carried > Number(max) + 1e-9

const lb = (n: number) => String(Math.round(n * 10) / 10)

/** The weight of a pack: each row's weight × quantity. A row with no weight weighs nothing. */
export function packWeight(rows: { weight?: number | string | null; quantity?: number | null }[]): number {
  let t = 0
  for (const r of rows) {
    const w = Number(r.weight ?? 0), q = r.quantity == null ? 1 : Number(r.quantity)
    if (Number.isFinite(w) && w > 0 && Number.isFinite(q) && q > 0) t += w * q
  }
  return Math.round(t * 100) / 100
}

/** May `add` more pounds go into a pack that holds `carried`, for someone whose carrying capacity is `max`? Refused only
 * past twice the capacity; `encumbered` says whether they will be over the capacity afterwards. No capacity on the row = no refusal. */
export function carryVerdict(who: string, carried: number, max: number | null | undefined, add: number, itemName: string, qty = 1): CarryVerdict {
  const cap = max != null && Number(max) > 0 ? Number(max) : null
  const more = Number.isFinite(add) && add > 0 ? add : 0
  if (cap == null || more === 0 || carried + more <= liftLimit(cap) + 1e-9) return { ok: true, carried, max: cap, add: more, why: null, encumbered: isEncumbered(carried + more, cap) }
  const what = qty > 1 ? `${qty} × ${itemName} weigh` : `the ${itemName} weighs`
  return { ok: false, carried, max: cap, add: more, encumbered: isEncumbered(carried, cap),
    why: `${who} cannot lift that: ${lb(carried)} lb carried, ${what} ${lb(more)} lb, and ${lb(liftLimit(cap))} lb is the most they can lift at all. Drop or hand something off first.` }
}

type Db = { from: (t: string) => any }   // eslint-disable-line @typescript-eslint/no-explicit-any

/** What this character carries right now, in pounds, and their limit. */
export async function carriedNow(db: Db, characterId: string): Promise<{ name: string; carried: number; max: number | null; isPlayer: boolean }> {
  const [{ data: who }, { data: rows }] = await Promise.all([
    db.from("characters").select("name,weight_max,is_player").eq("id", characterId).maybeSingle(),
    db.from("inventory_items").select("weight,quantity").eq("character_id", characterId).is("confiscated_from", null),
  ])
  const max = who?.weight_max != null && Number(who.weight_max) > 0 ? Number(who.weight_max) : null
  return { name: String(who?.name ?? "They"), carried: packWeight(rows ?? []), max, isPlayer: who?.is_player === true }
}

/** The check a route makes before it stows something. */
export async function canCarry(db: Db, characterId: string, addLb: number, itemName: string, qty = 1): Promise<CarryVerdict> {
  const now = await carriedNow(db, characterId)
  return carryVerdict(now.name, now.carried, now.max, addLb, itemName, qty)
}

/** Keep `characters.weight_current` true after a pack changed (it was only ever written by the confiscation). Best effort. */
export async function syncCarried(db: Db, ...characterIds: (string | null | undefined)[]): Promise<void> {
  for (const id of new Set(characterIds.filter(Boolean) as string[])) {
    try {
      const { data: rows } = await db.from("inventory_items").select("weight,quantity").eq("character_id", id).is("confiscated_from", null)
      await db.from("characters").update({ weight_current: packWeight(rows ?? []) }).eq("id", id)
    } catch { /* the pack itself is the truth; this number is a convenience */ }
  }
}
