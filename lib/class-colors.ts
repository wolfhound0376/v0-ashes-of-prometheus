/**
 * Class → accent color map. (PR-2)
 *
 * One muted family, all at similar saturation, meant to sit against the dark
 * ground without fighting the existing gold/ember. No migration needed —
 * class already lives on the character row, so this is a lookup, not a column.
 *
 * Hex values are a deliberate first pass: eyeball them against the live
 * background before anything user-facing leans on them hard (PR-3 tints the
 * suggestion-chip skill parentheticals with these).
 */

const CLASS_COLORS: Record<string, string> = {
  rogue: "#5C7A99", // cold slate blue
  sorcerer: "#7E5FA6", // violet
  cleric: "#E3D9B4", // pale gold-white
  bard: "#C4788A", // warm rose
  monk: "#5FA382", // jade green
  fighter: "#A85238", // rust red
  paladin: "#D9C878", // bright silver-gold
  ranger: "#7A8C4F", // moss green — deliberately distinct from Monk jade
  druid: "#A87C4F", // amber-brown
  barbarian: "#9C6B2F", // deep ochre
  warlock: "#7B6E86", // sickly purple-green — tune greener if it reads too clean
  wizard: "#4F5D99", // deep indigo
  artificer: "#B08D57", // brass
}

/** Muted neutral grey for anything unmapped (multiclass strings, NPC oddities). */
export const CLASS_COLOR_FALLBACK = "#8C8C94"

/**
 * Accent color for a class name. Case-insensitive; tolerates decorated
 * strings like "Rogue (Thief)" or "High Elf Wizard" by matching any known
 * class word. Unmapped values get the neutral fallback, never an error.
 */
export function getClassColor(className: string): string {
  const key = (className ?? "").trim().toLowerCase()
  if (key in CLASS_COLORS) return CLASS_COLORS[key]
  for (const [name, color] of Object.entries(CLASS_COLORS)) {
    if (new RegExp("\\b" + name + "\\b").test(key)) return color
  }
  return CLASS_COLOR_FALLBACK
}
