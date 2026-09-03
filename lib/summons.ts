// Summoned things on the board - Mage Hand first.
//
// SRD 5.1, Mage Hand: "A spectral, floating hand appears at a point you
// choose within range. The hand lasts for the duration or until you dismiss
// it as an action. The hand vanishes if it is ever more than 30 feet away
// from you or if you cast this spell again. You can use your action to
// control the hand. You can use the hand to manipulate an object, open an
// unlocked door or container, stow or retrieve an item from an open
// container, or pour the contents out of a vial. You can move the hand up to
// 30 feet each time you use it. The hand can't attack, activate magic items,
// or carry more than 10 pounds." Range 30 feet, duration 1 minute.
//
// What the SRD does NOT give the hand, and this file does not invent: hit
// points, an armour class, an initiative count. It is an effect the caster
// controls with their action, not a creature with a turn. So the hand sits
// on the board as a token - it has a square, it can be looked at, it can be
// in the way - and it acts only when its caster spends an action on it, and
// it is drawn in the rack as a chip on its caster rather than as a seat of
// its own. Asked for with hit points and an initiative card; answered with
// the book, and the reason written here so the choice is not re-litigated by
// the next session.
//
// Pure. The route reads and writes rows; the board draws; this file says
// what the rule is. lib/__tests__/summons.test.mjs covers every branch.

export interface SummonInfo {
  spell: "mage hand"
  /** The token that cast it. Its turn is the hand's turn. */
  caster_token: string
  /** The caster's sheet, for the card that owns the chip. */
  character_id: string | null
  cast_round: number
  /** The hand is gone when the round reaches this number. */
  expires_round: number
}

export interface Cell { x: number; y: number }

export const MAGE_HAND = {
  name: "Mage Hand",
  key: "mage hand",
  /** 1 minute = 10 rounds. Cast in round R, gone at the start of round R+10. */
  durationRounds: 10,
  /** Farther than this from its caster and it vanishes. */
  leashFt: 30,
  /** Each use of the action moves it up to this far. */
  moveFt: 30,
  carryLb: 10,
  /** The cutout the board draws, semi-transparent, floating. */
  sprite: "/tokens/mage-hand.png",
  icon: "/icons/abilities/mage-hand.png",
} as const

export const FEET_PER_SQUARE = 5

export const chebyshevFt = (a: Cell, b: Cell) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) * FEET_PER_SQUARE

export function normaliseSummon(raw: unknown): SummonInfo | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Partial<SummonInfo>
  if (r.spell !== "mage hand" || typeof r.caster_token !== "string") return null
  const cast = Number(r.cast_round)
  const exp = Number(r.expires_round)
  if (!Number.isFinite(cast) || !Number.isFinite(exp)) return null
  return {
    spell: "mage hand",
    caster_token: r.caster_token,
    character_id: typeof r.character_id === "string" ? r.character_id : null,
    cast_round: cast,
    expires_round: exp,
  }
}

/** The row to store when the hand is cast. */
export function summonMageHand(a: { casterToken: string; characterId: string | null; round: number }): SummonInfo {
  return {
    spell: "mage hand",
    caster_token: a.casterToken,
    character_id: a.characterId,
    cast_round: a.round,
    expires_round: a.round + MAGE_HAND.durationRounds,
  }
}

export const roundsLeft = (s: SummonInfo, round: number) => Math.max(0, s.expires_round - round)
export const expired = (s: SummonInfo, round: number) => round >= s.expires_round

/** Within 30 ft of the caster. Beyond it the hand vanishes. */
export const withinLeash = (hand: Cell, caster: Cell) => chebyshevFt(hand, caster) <= MAGE_HAND.leashFt
/** The cast itself: the point must be within range of the caster. */
export const withinCastRange = (point: Cell, caster: Cell) => chebyshevFt(point, caster) <= MAGE_HAND.leashFt
/** One use of the action moves the hand up to 30 ft. */
export const canReach = (from: Cell, to: Cell) => chebyshevFt(from, to) <= MAGE_HAND.moveFt

export type HandUse = "manipulate" | "open" | "stow" | "pour"

/** The four things the SRD lets the hand do, with the line the log gets. */
export const HAND_USES: {
  key: HandUse
  label: string
  line: (caster: string) => string
  /**
   * A glyph, so the hand's abilities read at a glance like everybody else's.
   *
   * Sam: "Give it icons just like anyone else based on what it can do."
   *
   * DRAWN, NOT FETCHED. Every other action icon is a 256px webp in the bucket
   * and there are no files for these four — commissioning them is an art job,
   * and four text buttons in the meantime is exactly the "no icon" Sam
   * objected to. A glyph is legible today and is replaced for free the day
   * real art exists, because the card would read `iconFor` instead.
   */
  glyph: string
}[] = [
  { key: "manipulate", label: "Manipulate", glyph: "✥", line: (c) => `${c}'s spectral hand works at an object.` },
  { key: "open", label: "Open", glyph: "🗝", line: (c) => `${c}'s spectral hand opens an unlocked door or container.` },
  { key: "stow", label: "Stow / Retrieve", glyph: "🎒", line: (c) => `${c}'s spectral hand stows or retrieves an item from an open container.` },
  { key: "pour", label: "Pour", glyph: "🝆", line: (c) => `${c}'s spectral hand pours out the contents of a vial.` },
]

export const handUse = (key: string): (typeof HAND_USES)[number] | null =>
  HAND_USES.find((u) => u.key === key) ?? null

/** What the board hands the HUD for each summon it can see. */
export interface SummonOnBoard {
  token_id: string
  label: string
  x: number
  y: number
  info: SummonInfo
}
