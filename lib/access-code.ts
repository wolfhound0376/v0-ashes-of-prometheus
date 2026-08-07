import { randomInt, timingSafeEqual } from "crypto"

// Access-code helpers shared by the /join gate (app/api/claim-code) and the
// Forge importer (app/api/forge/import). Server-side only.

/** Normalise anything a human might type into the canonical stored form.
 *  "  Gloom Tallow  Hush 193 " and "GLOOM_TALLOW-HUSH-193" both become
 *  "gloom-tallow-hush-193". */
export function normalizeCode(raw: unknown): string {
  if (typeof raw !== "string") return ""
  return raw
    .toLowerCase()
    .trim()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/** Constant-time string comparison so a code check can't be timed. */
export function safeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

// ---------------------------------------------------------------------------
// Three-word claim-code generation — same shape as the hand-issued codes
// (`gloom-tallow-hush-193`): word-word-word-NNN, already in normalised form.
// 40 × 40 × 40 × 900 ≈ 57.6 million combinations — the space the original
// gate was sized for. Uses crypto randomness, not Math.random.
// ---------------------------------------------------------------------------

const CODE_WORDS_1 = [
  "ashen", "gilded", "sombre", "ember", "rusted", "hollow", "jagged", "grim",
  "silent", "veiled", "pale", "sunken", "brackish", "molten", "frozen", "umbral",
  "crimson", "leaden", "thorned", "blighted", "cinder", "iron", "obsidian", "marrow",
  "raven", "murk", "fell", "dread", "bleak", "sallow", "gaunt", "stark",
  "wither", "harrowed", "smolder", "dusken", "ghast", "mirthless", "shadowed", "wan",
] as const

const CODE_WORDS_2 = [
  "tallow", "vault", "key", "quill", "sigil", "lantern", "chalice", "censer",
  "idol", "crypt", "altar", "grimoire", "talon", "antler", "bone", "crown",
  "dagger", "mirror", "bell", "coffin", "gallows", "ledger", "locket", "scepter",
  "spindle", "thistle", "goblet", "reliquary", "hourglass", "gargoyle", "pyre", "anvil",
  "brazier", "casket", "chain", "effigy", "gate", "helm", "loom", "torch",
] as const

const CODE_WORDS_3 = [
  "hush", "tide", "murmur", "oracle", "specter", "dirge", "omen", "litany",
  "requiem", "vigil", "whisper", "psalm", "knell", "shroud", "wraith", "echo",
  "riddle", "cipher", "lament", "hymn", "curse", "sorrow", "penance", "reckoning",
  "silence", "shadow", "hunger", "malice", "ruin", "embers", "ash", "gloaming",
  "dusk", "midnight", "howl", "tremor", "fissure", "abyss", "threnody", "wake",
] as const

/** A fresh three-word code in canonical (already-normalised) form. */
export function generateClaimCode(): string {
  const w1 = CODE_WORDS_1[randomInt(CODE_WORDS_1.length)]
  const w2 = CODE_WORDS_2[randomInt(CODE_WORDS_2.length)]
  const w3 = CODE_WORDS_3[randomInt(CODE_WORDS_3.length)]
  const n = randomInt(100, 1000)
  return `${w1}-${w2}-${w3}-${n}`
}
