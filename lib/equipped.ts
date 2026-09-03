// ============================================================================
// WHAT YOU ARE HOLDING — the gate between the pack and the rack.
//
// Sam: "Unfortunately it has dagger as an independent icon. This should just
// trigger as a standard attack as long as it is equipped." And: "Doll sheet
// should ... permit me to equip the dagger or unequip it. These do take an
// action though."
//
// THIS REVERSES AN EARLIER BRIEF, DELIBERATELY. lib/spellbook still quotes it:
// "A cleric with a mace gets Mace, not a generic 'Attack' button." That gave
// every carried weapon its own rack slot — which was right when the rack was
// the only place a weapon could be seen, and became wrong the moment Fifi
// picked up a dagger and got a button labelled "DAGGER · PREPARED SPELL".
//
// The new model is better because it makes a decision out of something that
// was bookkeeping: what is in your hands. A dagger in the pack is luggage. A
// dagger in your hand is what Attack means.
//
// WHAT DOES NOT CHANGE is the anti-drift rule lib/weapons was built on. The
// rack is still a FUNCTION of state, never a hand-kept list — the drow
// confiscated the party's gear once and the sheets went on offering it. This
// only narrows which state: from "carried" to "carried AND equipped".
//
// Pure, and shared by the board and the server, so the rack cannot offer a
// weapon the cast handler will refuse.
// ============================================================================

/** The two hands a weapon can be in. Armour and the rest are not this file's. */
export type HandSlot = "main_hand" | "off_hand"

export const HAND_SLOTS: HandSlot[] = ["main_hand", "off_hand"]

/** A row of the doll: one thing worn or held, in one slot. */
export interface EquippedRow {
  slot: string
  /** The catalogue key, when the row has one — the reliable join. */
  item_key?: string | null
  name: string
  equipped?: boolean | null
}

/** A row of the pack. */
export interface CarriedRow {
  name: string
  item_key?: string | null
  item_type?: string | null
  equippable_slot?: string | null
  items?: { item_type?: string | null; properties?: Record<string, unknown> | null } | null
  properties?: Record<string, unknown> | null
}

/** Match a pack row to a doll row: by catalogue key, else by name. */
export function sameItem(a: { item_key?: string | null; name: string }, b: { item_key?: string | null; name: string }): boolean {
  if (a.item_key && b.item_key) return a.item_key === b.item_key
  return a.name.trim().toLowerCase() === b.name.trim().toLowerCase()
}

/**
 * The weapons actually in hand.
 *
 * NOTHING EQUIPPED IS A REAL ANSWER, and it is the common one today:
 * equipment_items is empty for all four players, so before the doll is used
 * everybody is empty-handed. The caller adds the unarmed strike — a fist is
 * always available and is not equipment — so an empty result means "you have
 * only your hands", never "you cannot attack".
 */
export function equippedWeapons(carried: CarriedRow[] | null | undefined, doll: EquippedRow[] | null | undefined): CarriedRow[] {
  const held = (doll ?? []).filter((d) => d.equipped !== false && HAND_SLOTS.includes(d.slot as HandSlot))
  if (!held.length) return []
  return (carried ?? []).filter((c) => {
    const type = String(c.items?.item_type ?? c.item_type ?? "").toLowerCase()
    if (type !== "weapon") return false
    return held.some((h) => sameItem({ item_key: h.item_key, name: h.name }, { item_key: c.item_key, name: c.name }))
  })
}

export type EquipVerdict =
  | { ok: true; slot: HandSlot | string; replacing: string | null }
  | { ok: false; reason: string }

/**
 * May this item go in this slot?
 *
 * The catalogue's own `equippable_slot` decides. A journal has none and is not
 * equipment; a dagger says main_hand. Refusing here rather than at the write
 * means the reason can be a sentence rather than a constraint violation.
 */
export function canEquip(opts: {
  item: { name: string; equippable_slot?: string | null; items?: { equippable_slot?: string | null } | null }
  slot: string
  doll: EquippedRow[]
}): EquipVerdict {
  const allowed = (opts.item.equippable_slot ?? opts.item.items?.equippable_slot ?? "").trim().toLowerCase()
  if (!allowed) return { ok: false, reason: `${opts.item.name} is not something you can wear or hold.` }
  if (allowed !== opts.slot.trim().toLowerCase()) {
    return { ok: false, reason: `${opts.item.name} does not go in the ${opts.slot.replace("_", " ")}.` }
  }
  // A slot holds one thing. Naming what is being displaced lets the log say
  // "sheathes the mace and draws the dagger" rather than silently swapping.
  const taken = opts.doll.find((d) => d.slot === opts.slot && d.equipped !== false)
  return { ok: true, slot: opts.slot, replacing: taken ? taken.name : null }
}

/**
 * How many object interactions a change of gear costs.
 *
 * SRD 5.1, "Other Activity on Your Turn": one free object interaction per
 * turn — "draw or sheathe a sword" is the book's own example — and a second
 * costs the Use an Object action.
 *
 * SAM ASKED FOR "these do take an action". This is that, made slightly
 * kinder and considerably more correct: the FIRST change on a turn is free,
 * as it is at a real table, and the second is the action. It is also the
 * identical rule lib/ground-items already applies to picking things up, and
 * two different costs for "reach for a thing" would be the drift this
 * codebase keeps having to undo.
 *
 * A SWAP IS TWO INTERACTIONS — sheathing one weapon and drawing another —
 * which is exactly why a character cannot re-arm freely mid-fight.
 */
export function interactionsFor(verdict: { replacing: string | null }): number {
  return verdict.replacing ? 2 : 1
}
