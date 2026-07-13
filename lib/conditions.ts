// Shared conditions vocabulary + helpers used by the player sheet, NPC views,
// the featured-speaker panel, the admin editors, and the chat route. Conditions
// are stored as a jsonb string[] on both characters.conditions and
// npc_encounters.conditions. Display casing is preserved; matching is always
// case-insensitive.

export const CONDITION_PRESETS = [
  "Manacled",
  "Magical Barrier",
  "Poisoned",
  "Restrained",
  "Frightened",
  "Prone",
  "Invisible",
  "Exhaustion",
] as const

// Tailwind text color per known condition (case-insensitive key). Free-text
// conditions fall back to a neutral tone.
const CONDITION_COLORS: Record<string, string> = {
  manacled: "text-amber-400",
  "magical barrier": "text-sky-400",
  poisoned: "text-green-400",
  restrained: "text-orange-400",
  frightened: "text-purple-400",
  prone: "text-yellow-400",
  invisible: "text-cyan-300",
  exhaustion: "text-amber-600",
  // Additional 5e conditions that may already exist in saved data.
  blinded: "text-stone-400",
  charmed: "text-pink-400",
  deafened: "text-stone-400",
  grappled: "text-orange-400",
  incapacitated: "text-red-400",
  paralyzed: "text-red-500",
  petrified: "text-stone-500",
  stunned: "text-yellow-500",
  unconscious: "text-red-500",
}

export function conditionColor(name: string): string {
  return CONDITION_COLORS[name.trim().toLowerCase()] ?? "text-stone-300"
}

// Coerce arbitrary jsonb / array / string input into a clean, de-duplicated
// (case-insensitive) string list, preserving the first-seen display casing.
export function normalizeConditions(input: unknown): string[] {
  let arr: unknown[] = []
  if (Array.isArray(input)) {
    arr = input
  } else if (typeof input === "string") {
    const s = input.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      arr = Array.isArray(parsed) ? parsed : [s]
    } catch {
      arr = s.split(",")
    }
  }
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of arr) {
    const v = String(raw ?? "").trim()
    if (!v) continue
    const key = v.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

export function hasCondition(list: unknown, condition: string): boolean {
  const key = condition.trim().toLowerCase()
  return normalizeConditions(list).some((c) => c.toLowerCase() === key)
}

export function addCondition(list: unknown, condition: string): string[] {
  return normalizeConditions([...normalizeConditions(list), condition])
}

export function removeCondition(list: unknown, condition: string): string[] {
  const key = condition.trim().toLowerCase()
  return normalizeConditions(list).filter((c) => c.toLowerCase() !== key)
}
