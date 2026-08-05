import { timingSafeEqual } from "crypto"

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
