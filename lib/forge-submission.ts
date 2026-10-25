// The shape of a hero handed in at the Forge, and the checks a submission must pass before it
// is written. Pure: no Supabase, no window — the route (app/api/forge/submit) and the wizard
// (app/forge/page.tsx) both import from here so the two never disagree about what "complete" means.
//
// Sam, 2026-10-24: character creation includes "the creation of your pixel sprite, assigning
// standard rags attire and gestures through pixellab ai, and recording your voice for eleven labs
// use, also taking a few pictures with PC camera". Every one of those is OPTIONAL at the Forge —
// skip is always offered — and nothing expensive runs before the DM opens the cell. The Forge
// collects choices and raw material; activation spends the money.

export const FORGE_FORMAT = "aop-character-v1"

export type VoiceChoice =
  | { mode: "library"; voiceId: string; voiceName: string }
  | { mode: "record"; samplePath: string; consent: true; consentBy: string }
  | { mode: "skip" }

export type FaceChoice =
  | { mode: "photos"; paths: string[]; consent: true; consentBy: string }
  | { mode: "skip" }

export interface LookChoice {
  hair: string
  skin: string
  build: string
  mark: string
  /** The description handed to PixelLab — composed by describeSprite(), kept so the DM sees exactly what was asked. */
  description: string
}

export interface SpriteJob {
  /** PixelLab background job id, when the Forge started one. */
  jobId?: string
  /** PixelLab character id, when known. */
  characterId?: string
  /** A south-facing preview URL, when the job finished before the hero was handed in. */
  previewUrl?: string
  status: "queued" | "drawing" | "ready" | "failed" | "deferred"
}

export interface ForgeAssets {
  look?: LookChoice
  sprite?: SpriteJob
  voice?: VoiceChoice
  face?: FaceChoice
}

export interface ForgeSubmissionInput {
  playerName: string
  heroName: string
  payload: { format: string; character: Record<string, unknown>; inventory?: unknown[] }
  assets: ForgeAssets
}

/** Trim and bound a name a human typed. */
export function cleanName(raw: unknown, max = 40): string {
  if (typeof raw !== "string") return ""
  return raw.replace(/\s+/g, " ").trim().slice(0, max)
}

/** The checks a submission must pass. Returns a human sentence, or null when it is good. */
export function validateSubmission(input: unknown): string | null {
  if (!input || typeof input !== "object") return "Nothing was handed in."
  const s = input as Partial<ForgeSubmissionInput>
  if (!cleanName(s.playerName)) return "Tell the Forge your name (the player)."
  if (!cleanName(s.heroName)) return "Your hero needs a name."
  const p = s.payload
  if (!p || typeof p !== "object") return "The hero's sheet is missing."
  if (p.format !== FORGE_FORMAT && (p.character as { format?: string } | undefined)?.format !== FORGE_FORMAT) return "The hero's sheet is not a Character Forge export."
  const c = p.character
  if (!c || typeof c !== "object") return "The hero's sheet is empty."
  if (!cleanName(c.name)) return "The hero's sheet has no name."
  if (c.level !== undefined && (typeof c.level !== "number" || c.level < 1 || c.level > 20)) return "The hero's level is out of range."
  if (!s.assets || typeof s.assets !== "object") return "The look, voice and face choices are missing (skipping them is fine, but they must be present)."
  const a = s.assets as ForgeAssets
  if (a.voice && a.voice.mode === "record" && (!a.voice.samplePath || a.voice.consent !== true)) return "A recorded voice needs the recording and the consent box."
  if (a.face && a.face.mode === "photos") {
    if (!Array.isArray(a.face.paths) || a.face.paths.length < 1 || a.face.paths.length > 3) return "Face photos: one to three, no more."
    if (a.face.consent !== true) return "Face photos need the consent box."
  }
  return null
}

/** Size guard: a submission is a few KB of sheet plus a few blob paths, never megabytes. */
export const MAX_SUBMISSION_BYTES = 256 * 1024

// ---------------------------------------------------------------------------------------------
// The sprite description. Out of the Abyss, chapter 1: the party begins stripped of its gear in
// the Velkynvelve slave pen, so every Forge sprite wears rags (Sam: "assigning standard rags
// attire"). The species, class and the player's four chips go in; weapons and armour never do.
// ---------------------------------------------------------------------------------------------

export const LOOK_OPTIONS = {
  hair: ["black", "dark brown", "chestnut", "auburn", "blond", "silver-white", "grey", "shaved"],
  skin: ["pale", "fair", "olive", "tan", "brown", "dark brown", "ebony", "ashen grey"],
  build: ["slight", "lean", "average", "broad", "heavy", "towering"],
  mark: ["none", "a scar across the cheek", "a broken nose", "tattooed arms", "a missing ear tip", "an eyepatch", "freckles", "a shaved stripe"],
} as const

export type LookInput = { species?: string | null; clazz?: string | null; hair: string; skin: string; build: string; mark: string; sex?: string | null }

export function describeSprite(l: LookInput): string {
  const who = [l.sex, l.species, l.clazz].filter((x) => typeof x === "string" && x.trim()).join(" ").trim() || "adventurer"
  const bits = [
    `${who}`,
    l.build && l.build !== "average" ? `${l.build} build` : null,
    l.hair === "shaved" ? "shaved head" : l.hair ? `${l.hair} hair` : null,
    l.skin ? `${l.skin} skin` : null,
    l.mark && l.mark !== "none" ? l.mark : null,
  ].filter(Boolean)
  return `${bits.join(", ")}; a captive in ragged torn grey tunic and bare feet, no weapons, no armor, no cloak, empty hands; dark fantasy pixel art`
}
