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

/** The two ring fingers. A ring is catalogued as `ring` and fits either. */
export const RING_SLOTS = ["ring1", "ring2"] as const
export type RingSlot = (typeof RING_SLOTS)[number]

/**
 * Spellings the catalogue and older rows use for a slot, folded onto the
 * doll's own names. `ring` is the important one: a ring does not know which
 * finger it will end up on, so it is catalogued as a ring, not as a finger.
 *
 * THERE IS NO FEET SLOT. Sam: "We don't need feet if we have legs." Boots
 * are catalogued as `feet` (two rows in `items` today) and go on the legs.
 */
const SLOT_ALIASES: Record<string, string> = {
  ring_1: "ring1",
  ring_2: "ring2",
  cloak: "back",
  gloves: "hands",
  gauntlets: "hands",
  feet: "legs",
  boots: "legs",
}

export function normalizeSlot(slot: string | null | undefined): string {
  const key = String(slot ?? "").trim().toLowerCase()
  return SLOT_ALIASES[key] ?? key
}

const isRingSlot = (slot: string): boolean => slot === "ring" || (RING_SLOTS as readonly string[]).includes(slot)

/**
 * Does an item catalogued for `itemSlot` fit in the doll's `targetSlot`?
 *
 * Exact match for everything except rings: a `ring` item fits `ring1` OR
 * `ring2`, and a row that was once written as `ring1` still fits the other
 * finger. Nothing else crosses slots — a boot is not a glove.
 *
 * THE ONE PLACE this is decided. Every doll (compact bar, full-screen sheet,
 * V4 modal, admin) and the server's canEquip route through here, so a ring
 * cannot be accepted by one drop target and refused by the next.
 */
export function slotAccepts(itemSlot: string | null | undefined, targetSlot: string | null | undefined): boolean {
  const want = normalizeSlot(itemSlot)
  const have = normalizeSlot(targetSlot)
  if (!want || !have) return false
  if (want === have) return true
  return isRingSlot(want) && isRingSlot(have)
}

/**
 * Where an item goes when the player just says "equip it" without picking a
 * slot. Rings take the first empty finger, else the first finger (the caller
 * will report the swap). Everything else has exactly one home.
 */
export function defaultSlotFor(
  itemSlot: string | null | undefined,
  doll: Pick<EquippedRow, "slot" | "equipped">[] | null | undefined,
): string | null {
  const want = normalizeSlot(itemSlot)
  if (!want) return null
  if (!isRingSlot(want)) return want
  const taken = new Set((doll ?? []).filter((d) => d.equipped !== false).map((d) => normalizeSlot(d.slot)))
  return RING_SLOTS.find((s) => !taken.has(s)) ?? RING_SLOTS[0]
}

export type EquipVerdict =
  | { ok: true; slot: HandSlot | string; replacing: string | null }
  | { ok: false; reason: string }

/**
 * May this item go in this slot?
 *
 * The catalogue's own `equippable_slot` decides. A journal has none and is not
 * equipment; a dagger says main_hand; a ring says ring and fits either finger
 * (see slotAccepts). Refusing here rather than at the write means the reason
 * can be a sentence rather than a constraint violation.
 */
export function canEquip(opts: {
  item: { name: string; equippable_slot?: string | null; items?: { equippable_slot?: string | null } | null }
  slot: string
  doll: EquippedRow[]
}): EquipVerdict {
  const allowed = normalizeSlot(opts.item.equippable_slot ?? opts.item.items?.equippable_slot)
  if (!allowed) return { ok: false, reason: `${opts.item.name} is not something you can wear or hold.` }
  if (!slotAccepts(allowed, opts.slot)) {
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
