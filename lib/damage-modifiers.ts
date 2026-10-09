// ============================================================================
// DAMAGE RESISTANCE, VULNERABILITY AND IMMUNITY — SRD 5.1, "Damage Resistance
// and Vulnerability".
//
//   "If a creature or an object has resistance to a damage type, damage of
//    that type is halved against it. If a creature or an object has
//    vulnerability to a damage type, damage of that type is doubled against
//    it. Resistance and then vulnerability are applied after all other
//    modifiers to damage. ... Multiple instances of resistance or
//    vulnerability that affect the same damage type count as only one
//    instance."
//
// Immunity is the third word in the same stat-block family: none of it.
//
// WHERE THE WORDS LIVE
//   bestiary.damage_immunities / damage_resistances   free text, SRD-printed
//   characters.damage_immunities / damage_resistances free text
//   bestiary.traits, a trait named "Damage Vulnerabilities"
//     There is no vulnerabilities column on either table. An earlier session
//     put the Skeleton's "bludgeoning" in a trait of that name so the rules
//     engine could see it; this reads that convention rather than inventing
//     a column. Characters have no vulnerability field at all.
//
// THE CONDITIONAL HALF
//   SRD lines come in two parts: "cold, fire; bludgeoning, piercing, and
//   slashing from nonmagical attacks". The part after the semicolon only
//   applies to an attack that is NOT magical. The caller says which:
//     spells                          → magical
//     a player's weapon               → magical when its catalogue rarity is
//                                       above common (every mundane weapon in
//                                       `items` is "common"; every magic one
//                                       is uncommon or rarer)
//     a creature's stat-block attack  → nonmagical, unless it has the
//                                       "Magic Weapons" trait (SRD)
//   "…that aren't silvered" / "…not made with silvered weapons": nothing in
//   the game marks a weapon silvered, so none is, and the resistance holds.
//   Any other conditional clause ("except…", "while…") is not applied —
//   it names a circumstance the engine cannot see.
//
// Pure: text in, numbers out. No Supabase, no React.
// ============================================================================

export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const

/** What hit them: its damage word, and whether the attack was magical. */
export interface DamageSource {
  type: string | null | undefined
  magical: boolean
}

/** The three free-text lists, as the tables hold them. */
export interface Defences {
  immunities?: unknown
  resistances?: unknown
  vulnerabilities?: unknown
}

const asText = (v: unknown): string =>
  Array.isArray(v) ? v.map(String).join(", ") : String(v ?? "")

/** "from nonmagical attacks…", with or without the silvered tail. */
const NONMAGICAL = /\bnonmagical\b/i
/** A clause naming some other circumstance the engine does not model. */
const OTHER_CONDITION = /\b(except|while|unless|if)\b/i

/**
 * Does this SRD list cover this damage, from this source?
 *
 * Each semicolon-separated part is read on its own. A plain list counts.
 * A "from nonmagical attacks" part counts only against a nonmagical source.
 * Anything else conditional is left alone rather than guessed at.
 */
export function listCovers(list: unknown, source: DamageSource): boolean {
  const type = String(source.type ?? "").trim().toLowerCase()
  if (!type) return false
  const word = new RegExp(`\\b${type}\\b`, "i")
  return asText(list)
    .split(";")
    .some((part) => {
      if (!word.test(part)) return false
      if (NONMAGICAL.test(part)) return !source.magical
      if (/\bfrom\b/i.test(part) || OTHER_CONDITION.test(part)) return false
      return true
    })
}

/**
 * The vulnerability list held in a "Damage Vulnerabilities" trait, or "".
 * The trait's text is the list, optionally followed by a bracketed note.
 */
export function vulnerabilitiesFromTraits(traits: unknown): string {
  if (!Array.isArray(traits)) return ""
  const t = (traits as { name?: unknown; desc?: unknown }[])
    .find((x) => /damage vulnerabilit/i.test(String(x?.name ?? "")))
  return t ? String(t.desc ?? "").split("(")[0].trim() : ""
}

/** SRD "Magic Weapons": "The X's weapon attacks are magical." */
export function hasMagicWeapons(traits: unknown): boolean {
  return Array.isArray(traits) &&
    (traits as { name?: unknown }[]).some((t) => /^magic weapons?$/i.test(String(t?.name ?? "").trim()))
}

/** A catalogue rarity above common is a magic item. */
export function isMagicRarity(rarity: string | null | undefined): boolean {
  const r = String(rarity ?? "").trim().toLowerCase()
  return r !== "" && r !== "common" && r !== "mundane"
}

/** "1d6+1 Piercing" → "piercing"; null when the string names no type. */
export function damageTypeOf(text: string | null | undefined): string | null {
  const m = String(text ?? "").toLowerCase().match(new RegExp(`\\b(${DAMAGE_TYPES.join("|")})\\b`))
  return m ? m[1] : null
}

export interface Mitigated {
  amount: number
  /** What changed it, for the log: "resists fire", "vulnerable to bludgeoning", "immune to poison". */
  why: string | null
}

/**
 * The damage after immunity, resistance and vulnerability, in the SRD's
 * order: immunity is none of it; otherwise resistance halves (rounded down)
 * and THEN vulnerability doubles. Both at once: half, then double.
 */
export function mitigate(amount: number, source: DamageSource, d: Defences): Mitigated {
  const type = String(source.type ?? "").trim().toLowerCase()
  if (amount <= 0 || !type) return { amount, why: null }
  if (listCovers(d.immunities, source)) return { amount: 0, why: `immune to ${type}` }
  const resists = listCovers(d.resistances, source)
  const vulnerable = listCovers(d.vulnerabilities, source)
  let out = amount
  if (resists) out = Math.floor(out / 2)
  if (vulnerable) out = out * 2
  const why = resists && vulnerable
    ? `resists and is vulnerable to ${type}`
    : resists ? `resists ${type}` : vulnerable ? `vulnerable to ${type}` : null
  return { amount: out, why }
}

/** " (resists fire: 12 → 6)" for the log; "" when nothing changed. */
export function mitigationNote(before: number, m: Mitigated): string {
  return m.why ? ` (${m.why}: ${before} → ${m.amount})` : ""
}
