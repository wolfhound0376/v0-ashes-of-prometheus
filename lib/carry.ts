// CARRYING CAPACITY (Sam, 2026-11-10: "Is weight getting factored into these items?" — it was stored and never used;
// then "Weight next.").
//
// The rule is the SRD 5.1 one (Using Ability Scores > Strength > Lifting and Carrying): "Carrying Capacity. Your
// carrying capacity is your Strength score multiplied by 15. This is the weight (in pounds) that you can carry."
// A character's `weight_max` already holds that number (Fifi, STR 8: 120). What they carry is every row of
// `inventory_items` that is theirs (worn pieces are rows there too) and not sitting confiscated on the stash:
// weight × quantity. A thing that would take them past the number does not go into the pack.
//
// NOT here, on purpose: the variant Encumbrance rule (slowed at 5 × STR, heavily at 10 × STR). Sam was asked "block or
// slow" and has not chosen; the plain rule above is the default until he does.
//
// One copy: /api/walk-loot (take), /api/walk-items (pickup, give) all ask this file.

export type CarryVerdict = { ok: boolean; carried: number; max: number | null; add: number; why: string | null }

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

/** May `add` more pounds go into a pack that holds `carried`, under a limit of `max`? No limit on the row = no refusal. */
export function carryVerdict(who: string, carried: number, max: number | null | undefined, add: number, itemName: string, qty = 1): CarryVerdict {
  const cap = max != null && Number(max) > 0 ? Number(max) : null
  const more = Number.isFinite(add) && add > 0 ? add : 0
  if (cap == null || more === 0 || carried + more <= cap + 1e-9) return { ok: true, carried, max: cap, add: more, why: null }
  const what = qty > 1 ? `${qty} × ${itemName} weigh` : `the ${itemName} weighs`
  return { ok: false, carried, max: cap, add: more,
    why: `${who} cannot carry that: ${lb(carried)} of ${lb(cap)} lb carried, and ${what} ${lb(more)} lb. Drop or hand something off first.` }
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
