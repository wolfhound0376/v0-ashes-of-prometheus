// ============================================================================
// WHICH CONDITIONS THE BOARD DRAWS ON A BODY.
//
// Conditions arrive as free text from three places — Malachar's
// [CONDITION_ADD] tags on characters and npc_encounters, and the combat
// route's timed `vtt_tokens.effects` — and the board has never drawn any of
// them: a creature on fire looked exactly like one that was not. Sam: "if
// the character catches on fire the enemy has flames and the animation
// starts jumping around in pain", "electricity if the character gains
// lightning charge", "webs that stay on the ground", "make them fall and
// stay lying on the ground".
//
// This folds the spellings onto the four looks the board knows how to draw.
// Pure, so the mapping is testable and the board only ever asks one question.
// ============================================================================

export type StatusKind = "burning" | "charged" | "webbed" | "prone"

const LOOKS: { kind: StatusKind; match: RegExp }[] = [
  { kind: "burning", match: /\b(burning|on fire|ablaze|aflame|ignited)\b/ },
  { kind: "charged", match: /\b(charged|lightning charge|electrified|static charge|conductive)\b/ },
  // Restrained is the 5e condition Web and a spider's web both apply; on
  // this board that is what restrained nearly always means. Manacled and
  // grappled are their own words and are not webs.
  { kind: "webbed", match: /\b(webbed|restrained|entangled|enwebbed)\b/ },
  { kind: "prone", match: /\b(prone|knocked down|lying)\b/ },
]

/** The looks a list of condition names calls for, in a stable order. */
export function statusKindsOf(conditions: readonly string[]): StatusKind[] {
  const out = new Set<StatusKind>()
  for (const raw of conditions) {
    const c = String(raw ?? "").trim().toLowerCase()
    if (!c) continue
    for (const { kind, match } of LOOKS) if (match.test(c)) out.add(kind)
  }
  return LOOKS.map((l) => l.kind).filter((k) => out.has(k))
}

/**
 * Condition names out of whatever shape a row carries: a string array, an
 * array of {name} objects, or `vtt_tokens.effects` rows with a `condition`.
 */
export function conditionNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out: string[] = []
  for (const item of raw) {
    if (typeof item === "string") { out.push(item); continue }
    if (item && typeof item === "object") {
      const o = item as { name?: unknown; condition?: unknown }
      const v = o.condition ?? o.name
      if (typeof v === "string") out.push(v)
    }
  }
  return out
}
