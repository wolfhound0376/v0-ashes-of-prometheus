// CONDITIONS: WHAT THEY ARE CALLED, WHAT THEY LOOK LIKE AND WHAT THEY DO — one copy.
//
// Sam, 2026-11-23: "the COND_GLYPH needs to be replaced with the upload and we need to insure that the condition is
// shown on hero cards, and its effects is considered during gameplay."
//
// Three readers, one file:
//   - the Underwalk (scripts/velkynvelve-walk/template.html): build_walk.py pastes this in whole, minus the `export`
//     keywords (/*__CONDITION_RULES__*/), the way lib/rage.mjs and lib/traits.mjs go in;
//   - the dashboard (lib/conditions.ts re-exports the art lookup for ConditionBadges, Party Status and the Parley);
//   - lib/condition-rules.test.ts.
// Plain JS on purpose: build_walk.py runs on Sam's machine, where there is no Node to compile TypeScript.
//
// THE RULES are SRD 5.2.1 (the 2024 text), the version the walk's spells were checked against:
//   Incapacitated — no action, bonus action or reaction; concentration is broken.
//   Paralyzed     — Incapacitated; speed 0; fails STR and DEX saves; attacks against it have advantage; a hit from
//                   within 5 ft is a critical hit.
//   Petrified     — Incapacitated; speed 0; attacks against it have advantage; fails STR and DEX saves; resistance
//                   to all damage; immune to the Poisoned condition.
//   Stunned       — Incapacitated; fails STR and DEX saves; attacks against it have advantage.
//   Unconscious   — Incapacitated and Prone; speed 0; fails STR and DEX saves; attacks against it have advantage;
//                   a hit from within 5 ft is a critical hit.
//   Charmed       — can't attack the charmer or target it with damaging abilities or magic.
//   Exhaustion    — levels 1 to 6: each D20 Test takes −2 × the level, speed drops 5 ft × the level; level 6 is death.
// The map's simplification, said plainly: an Incapacitated creature loses its whole turn (no move either). In the 2024
// text it may still move; nobody in this game wants to walk while stunned, and the foe AI has no "move only" turn.

/** The painted art in the "Death Saves, Tombstones & Conditions" pack (Sam, 2026-11-23): icons/conditions/<file>.png. */
export const CONDITION_ART_FILES = [
  "bleeding", "blinded", "burning", "charmed", "concentration", "deafened", "exhaustion", "frightened", "grappled",
  "incapacitated", "invisible", "marked", "paralyzed", "petrified", "poisoned", "prone", "restrained", "slowed",
  "stunned", "unconscious",
]

/**
 * A condition's name as Malachar or the DM writes it ("Poisoned", "Exhaustion 2", "Hunter's Mark", "Manacled") →
 * the map's own key for it. Names the map has no rules for still map to a key so the art can show; `null` means the
 * name is narrative only (Magical Barrier, Acid Burn).
 */
const ALIASES = {
  blinded: "blinded", blind: "blinded",
  charmed: "charmed",
  deafened: "deafened", deaf: "deafened",
  exhaustion: "exhaustion", exhausted: "exhaustion",
  frightened: "frightened", afraid: "frightened", scared: "frightened",
  grappled: "grappled",
  incapacitated: "incapacitated",
  invisible: "invisible",
  paralyzed: "paralyzed", paralysed: "paralyzed", held: "paralyzed",
  petrified: "petrified", "turned to stone": "petrified",
  poisoned: "poisoned",
  prone: "prone",
  restrained: "restrained", webbed: "restrained",
  stunned: "stunned",
  unconscious: "unconscious", "knocked out": "unconscious", "out cold": "unconscious",
  asleep: "asleep", sleeping: "asleep",
  burning: "burning", "on fire": "burning",
  bleeding: "bleeding",
  slowed: "slowed",
  marked: "marked", "hunter's mark": "marked", "hunters mark": "marked",
  concentration: "concentration", concentrating: "concentration",
}

/** The art a map key wears. Asleep is the Sleep spell's Unconscious; Manacled is the chains of Restrained. */
const ART_OF = {asleep: "unconscious", manacled: "restrained", shackled: "restrained", chained: "restrained"}

/** "Exhaustion 2" → {key: "exhaustion", level: 2}; "Poisoned" → {key: "poisoned", level: 0}; "Magical Barrier" → null. */
export function conditionKeyOf(name) {
  const raw = String(name ?? "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ")
  if (!raw) return null
  const lvl = raw.match(/^(exhaust(?:ion|ed))\s*(?:level\s*)?\(?(\d)\)?$/)
  if (lvl) return {key: "exhaustion", level: Math.max(1, Math.min(6, parseInt(lvl[2], 10)))}
  const key = ALIASES[raw]
  if (!key) return null
  return {key, level: key === "exhaustion" ? 1 : 0}
}

/** The art file (no extension) for a condition by its name or its map key, or null when the pack has none. */
export function conditionArtFile(name) {
  const raw = String(name ?? "").trim().toLowerCase()
  if (ART_OF[raw]) return ART_OF[raw]
  const k = conditionKeyOf(raw)
  const key = k ? (ART_OF[k.key] || k.key) : raw
  return CONDITION_ART_FILES.includes(key) ? key : null
}

/**
 * A character's saved conditions (characters.conditions, a string list) → what the map seeds a fighter with:
 * the keys it has rules for, and the exhaustion level (the highest written, capped at 6).
 */
export function conditionsForMap(list) {
  const keys = new Set()
  let exhaustion = 0
  for (const name of Array.isArray(list) ? list : []) {
    const k = conditionKeyOf(name)
    if (!k || k.key === "concentration") continue   // concentration is a spell held, not a condition to seed
    if (k.key === "exhaustion") { exhaustion = Math.max(exhaustion, k.level); continue }
    keys.add(k.key)
    if (k.key === "unconscious") keys.add("prone")  // SRD 5.2.1: an Unconscious creature also has the Prone condition
  }
  return {keys: [...keys], exhaustion}
}

const condHas = (conds, k) => !!conds && (typeof conds.has === "function" ? conds.has(k) : conds.includes(k))

/** The conditions that make a creature Incapacitated (each of these includes it in the SRD). */
export const INCAPACITATING = ["incapacitated", "paralyzed", "petrified", "stunned", "unconscious", "asleep"]

/** SRD 5.2.1: it automatically fails Strength and Dexterity saving throws. */
export function autoFailsSave(conds, ability) {
  if (ability !== "str" && ability !== "dex") return false
  return ["paralyzed", "petrified", "stunned", "unconscious", "asleep"].some(k => condHas(conds, k))
}

/** SRD 5.2.1: attack rolls against it have advantage (paralyzed and asleep the map already counted). */
export function attackedWithAdvantage(conds) {
  return ["stunned", "unconscious", "petrified"].some(k => condHas(conds, k))
}

/** SRD 5.2.1: any attack that hits it is a critical hit if the attacker is within 5 feet. */
export function critFromAdjacent(conds) {
  return ["paralyzed", "unconscious", "asleep"].some(k => condHas(conds, k))
}

/** Its speed is 0. */
export function speedZero(conds) {
  return ["paralyzed", "petrified", "unconscious", "asleep", "grappled", "restrained"].some(k => condHas(conds, k))
}

/** Resistance to all damage (Petrified). */
export function resistsAllDamage(conds) {
  return condHas(conds, "petrified")
}

/**
 * The turn it loses to a condition with no save of its own, and the words for it; null when it may act.
 * (Asleep, Hold Person, a hold, Hideous Laughter and Turn Undead keep their own turn code with their saves.)
 */
export function turnLostTo(conds) {
  if (condHas(conds, "petrified")) return "is stone, and does nothing"
  if (condHas(conds, "unconscious")) return "lies unconscious"
  if (condHas(conds, "stunned")) return "is stunned and loses the turn"
  if (condHas(conds, "paralyzed")) return "is paralyzed and cannot act"
  if (condHas(conds, "incapacitated")) return "is incapacitated and cannot act"
  return null
}

/** Exhaustion (SRD 5.2.1): −2 per level on every D20 Test. */
export function exhaustionPenalty(level) {
  const n = Math.max(0, Math.min(6, Math.floor(Number(level) || 0)))
  return n ? -2 * n : 0
}

/** Exhaustion (SRD 5.2.1): speed −5 ft per level. */
export function exhaustionSpeedCut(level) {
  const n = Math.max(0, Math.min(6, Math.floor(Number(level) || 0)))
  return 5 * n
}

/** Charmed (SRD 5.2.1): it can't attack its charmer. With no charmer known, nothing is forbidden. */
export function charmForbids(attackerConds, charmedBy, target) {
  return condHas(attackerConds, "charmed") && !!charmedBy && charmedBy === target
}
