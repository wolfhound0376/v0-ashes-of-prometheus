/**
 * THE HEAL LINE — how a heal is written into the combat log, and read back.
 *
 * Sam: "Healing should show a golden '+ [number of HP] + modifiers' over the
 * character."
 *
 * Two jobs, one format:
 *
 *  1. The rule. A 5e healing spell heals its dice PLUS the caster's
 *     spellcasting ability modifier (Cure Wounds 1d8 + mod, Healing Word
 *     1d4 + mod). The combat route rolled the dice alone: on 26 Sep 2026
 *     Scott (CHA +2) healed Prince Derendil for 1 and Samson (WIS +3) healed
 *     Eldeth for 3, both below the lowest total the spell allows.
 *     healAmount() is the one place the sum is made.
 *
 *  2. The number over the head. The board draws it off the hit-point diff,
 *     which every browser sees, but a diff knows only the total. The
 *     breakdown travels in the log line the route writes anyway — every seat
 *     already listens to it — and parseHealLine() reads it back, so every
 *     screen shows the same "2 + 3 WIS", not only the caster's.
 *
 * Pure: no database, no DOM. Covered by heal-line.test.ts.
 */

/** "Wisdom" → "WIS". Unknown names fall back to their first three letters. */
export function abilityShort(ability: string | null | undefined): string {
  const a = (ability ?? "").trim().toLowerCase()
  const known: Record<string, string> = {
    strength: "STR", dexterity: "DEX", constitution: "CON",
    intelligence: "INT", wisdom: "WIS", charisma: "CHA",
  }
  return known[a] ?? a.slice(0, 3).toUpperCase()
}

/**
 * The caster's spellcasting modifier, from the sheet's own numbers. A spell
 * attack bonus is proficiency + the ability modifier (PHB/SRD "Spellcasting"),
 * so the modifier is the one minus the other. Null when the sheet is missing
 * either — the heal then adds nothing rather than a guessed number.
 */
export function spellcastingMod(attackBonus: unknown, proficiency: unknown): number | null {
  const a = Number(attackBonus)
  const p = Number(proficiency)
  if (attackBonus == null || proficiency == null || !Number.isFinite(a) || !Number.isFinite(p)) return null
  return a - p
}

export interface HealRoll {
  /** What was thrown, e.g. "1d4". */
  dice: string
  /** The dice's own total. */
  rolled: number
  /** Spellcasting modifier added; 0 when unknown. */
  mod: number
  /** Short ability name for the modifier, e.g. "WIS". Empty when there is none. */
  ability: string
  /** Hit points restored before the maximum caps them: rolled + mod, never below 0. */
  total: number
}

/** Dice plus modifier. A negative modifier can shrink a heal, never below zero. */
export function healAmount(dice: string, rolled: number, mod: number | null, ability: string | null): HealRoll {
  const m = mod ?? 0
  return {
    dice,
    rolled,
    mod: m,
    ability: m !== 0 ? abilityShort(ability) : "",
    total: Math.max(0, rolled + m),
  }
}

/** "2 + 3 WIS", "2 − 1 CHA", or just "2" when there is no modifier. */
export function healDetail(r: Pick<HealRoll, "rolled" | "mod" | "ability">): string {
  if (!r.mod) return `${r.rolled}`
  const sign = r.mod > 0 ? "+" : "−"
  return `${r.rolled} ${sign} ${Math.abs(r.mod)}${r.ability ? ` ${r.ability}` : ""}`
}

/**
 * The log line. Reads naturally at the table and ends in a fixed shape the
 * board parses:
 *   "Samson casts Healing Word on Eldeth Feldrun — 1d4 (2) + 3 WIS = 5 hit points."
 */
export function formatHealLine(caster: string, spell: string, target: string, r: HealRoll): string {
  const mod = r.mod ? ` ${r.mod > 0 ? "+" : "−"} ${Math.abs(r.mod)}${r.ability ? ` ${r.ability}` : ""}` : ""
  return `${caster} casts ${spell} on ${target} — ${r.dice} (${r.rolled})${mod} = ${r.total} hit points.`
}

const LINE = /^.+? casts .+? on (.+?) — (\d+d\d+) \((\d+)\)(?: ([+−-]) (\d+)(?: ([A-Z]{2,4}))?)? = (\d+) hit points\./

/** Read a heal line back: who was healed, the total, and the breakdown to show. Null for any other line. */
export function parseHealLine(text: string | null | undefined): { target: string; total: number; detail: string } | null {
  const m = (text ?? "").match(LINE)
  if (!m) return null
  const [, target, , rolledS, sign, modS, ability, totalS] = m
  const mod = modS ? (sign === "+" ? 1 : -1) * Number(modS) : 0
  return {
    target,
    total: Number(totalS),
    detail: healDetail({ rolled: Number(rolledS), mod, ability: ability ?? "" }),
  }
}

/** How long a number and its log line may be apart and still be paired, ms. */
export const PAIR_WINDOW_MS = 4000

/**
 * The breakdown to print under a number that shows `gained` hit points. A
 * heal that topped someone off gains less than it rolled; the number says
 * what they actually got, and the breakdown says why the sums differ.
 */
export function detailForGain(detail: string, total: number, gained: number): string {
  return gained < total ? `${detail}, at max` : detail
}

/**
 * Pairs each golden number with its log line, whichever arrives first.
 *
 * The route saves the hit points before it writes the line, so on most seats
 * the number rises first and its breakdown is written in a beat later; on a
 * slow seat the line can win. Keyed by the healed creature's name, the only
 * thing both carry. Unpaired entries simply age out: a potion or Malachar's
 * [HEAL] has no line in this shape, and gets the golden total alone.
 */
export class HealPairing {
  private notes = new Map<string, { total: number; detail: string; at: number }>()
  private live = new Map<string, { write: (detail: string) => void; gained: number; at: number }>()

  private static key(name: string | null | undefined): string {
    return (name ?? "").trim().toLowerCase()
  }

  /**
   * A heal number is about to rise over `name`. Returns the breakdown to draw
   * now if its line already arrived; otherwise remembers `write` so the line
   * can fill it in.
   */
  onNumber(name: string | null | undefined, gained: number, now: number, write: (detail: string) => void): string | undefined {
    const k = HealPairing.key(name)
    const note = this.notes.get(k)
    if (note && now - note.at <= PAIR_WINDOW_MS) {
      this.notes.delete(k)
      return detailForGain(note.detail, note.total, gained)
    }
    this.live.set(k, { write, gained, at: now })
    return undefined
  }

  /** A log line arrived. If it is a heal line, pair it with its number or keep it for one. */
  onLine(text: string | null | undefined, now: number): void {
    const heal = parseHealLine(text)
    if (!heal) return
    const k = HealPairing.key(heal.target)
    const waiting = this.live.get(k)
    if (waiting && now - waiting.at <= PAIR_WINDOW_MS) {
      this.live.delete(k)
      waiting.write(detailForGain(heal.detail, heal.total, waiting.gained))
      return
    }
    this.notes.set(k, { total: heal.total, detail: heal.detail, at: now })
  }
}
