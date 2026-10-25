// A thin PixelLab REST client for the Forge's Look step. Server-side only (needs PIXELLAB_API_KEY).
//
// WHAT THIS IS BUILT ON — and how sure we are. The endpoint paths and the auth header come from
// PixelLab's published OpenAPI document (https://api.pixellab.ai/v2/openapi.json, read 2026-10-25):
//   POST /v2/create-character-pro        description, image_size, method ("create_with_style"),
//                                         style_character_id … "Generation job submitted"
//   GET  /v2/background-jobs/{job_id}     status: processing | completed | failed; last_response
//   GET  /v2/characters/{character_id}    rotation_urls per direction
//   Authorization: Bearer <token>
// The RESPONSE SHAPES (which field carries the character id on a job, where last_response puts
// it) were NOT visible in the part of the schema we could read, so this client reads them
// DEFENSIVELY — several likely field names, and the raw body is kept on the job record so the
// first real run tells us which one it was. Flagged in the PR; verify on the first live hero.
//
// Style anchor: every actor is style-transferred from Fifi's PixelLab character (HD-2D pivot,
// 2026-09-24), so the Forge asks for "create_with_style" from her id unless the env overrides it.

const BASE = "https://api.pixellab.ai/v2"
const DEFAULT_STYLE_ANCHOR = "8691d89b-ee60-4c8d-afb6-721eab1ddb47" // Fifi, the style anchor

export function pixellabConfigured(): boolean {
  return Boolean(process.env.PIXELLAB_API_KEY)
}

function headers(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.PIXELLAB_API_KEY ?? ""}`, "Content-Type": "application/json" }
}

/** Pull a string out of a loosely-typed response by trying several keys, nested or not. */
export function pickString(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null
  const o = obj as Record<string, unknown>
  for (const k of keys) {
    const v = o[k]
    if (typeof v === "string" && v) return v
  }
  for (const v of Object.values(o)) {
    if (v && typeof v === "object") {
      const inner = pickString(v, keys)
      if (inner) return inner
    }
  }
  return null
}

export interface SpriteStart { jobId: string | null; characterId: string | null; raw: unknown }

/** Ask PixelLab for a 128 px, 8-direction character in Fifi's style. Returns the job handle. */
export async function startCharacter(description: string, size = 128): Promise<SpriteStart> {
  const styleId = process.env.PIXELLAB_STYLE_CHARACTER_ID || DEFAULT_STYLE_ANCHOR
  const res = await fetch(`${BASE}/create-character-pro`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ description, image_size: { width: size, height: size }, method: "create_with_style", style_character_id: styleId }),
  })
  const raw = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`PixelLab ${res.status}: ${JSON.stringify(raw).slice(0, 300)}`)
  return {
    jobId: pickString(raw, ["background_job_id", "job_id", "id"]),
    characterId: pickString(raw, ["character_id"]),
    raw,
  }
}

export type JobState = { status: "processing" | "completed" | "failed" | "unknown"; characterId: string | null; detail: string | null; raw: unknown }

export async function readJob(jobId: string): Promise<JobState> {
  const res = await fetch(`${BASE}/background-jobs/${encodeURIComponent(jobId)}`, { headers: headers(), cache: "no-store" })
  const raw = await res.json().catch(() => null)
  if (!res.ok) return { status: "unknown", characterId: null, detail: `PixelLab ${res.status}`, raw }
  const status = pickString(raw, ["status"]) as JobState["status"] | null
  const last = (raw as { last_response?: unknown } | null)?.last_response
  return {
    status: status === "processing" || status === "completed" || status === "failed" ? status : "unknown",
    characterId: pickString(last, ["character_id"]) ?? pickString(raw, ["character_id"]),
    detail: pickString(last, ["detail"]),
    raw,
  }
}

/** The south-facing rotation of a finished character, for the preview. */
export async function readPreview(characterId: string): Promise<string | null> {
  const res = await fetch(`${BASE}/characters/${encodeURIComponent(characterId)}`, { headers: headers(), cache: "no-store" })
  const raw = await res.json().catch(() => null)
  if (!res.ok || !raw) return null
  const rot = (raw as { rotation_urls?: Record<string, string> }).rotation_urls
  if (rot && typeof rot === "object") return rot.south ?? Object.values(rot)[0] ?? null
  return pickString(raw, ["south", "image_url", "url"])
}
