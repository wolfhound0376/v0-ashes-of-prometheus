import { put } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

// POST /api/forge/media — the Forge's private drop box for a player's own voice and face.
//
//   multipart: kind = "voice" | "face", draft = <draft id>, file = <blob>
//   → { pathname, url }   url is the private proxy (/api/file?pathname=…), never a public URL
//
// Sam, 2026-10-24: "recording your voice for eleven labs use, also taking a few pictures with PC
// camera". These are a family's faces and voices, so: PRIVATE blob storage (served only through
// the proxy), nothing resized or re-encoded on the way in (a voice clone wants the raw take), a
// hard size cap, and only the two kinds the Forge asks for. Nothing is sent to ElevenLabs or
// Runway from here — that happens at activation, after the DM has seen the hero and the consent
// boxes, never at the Forge.

export const dynamic = "force-dynamic"

const KINDS = {
  voice: { types: ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"], max: 15 * 1024 * 1024 },
  face: { types: ["image/jpeg", "image/png", "image/webp"], max: 6 * 1024 * 1024 },
} as const

const EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const kind = String(form.get("kind") ?? "") as keyof typeof KINDS
    const draft = String(form.get("draft") ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48)
    const file = form.get("file")
    if (!(kind in KINDS)) return NextResponse.json({ error: "kind must be voice or face" }, { status: 400 })
    if (!draft) return NextResponse.json({ error: "draft id required" }, { status: 400 })
    if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const rule = KINDS[kind]
    // Some browsers tag a MediaRecorder blob "audio/webm;codecs=opus" — match on the bare type.
    const type = (file.type || "").split(";")[0].trim()
    if (!(rule.types as readonly string[]).includes(type)) return NextResponse.json({ error: `That file type (${type || "unknown"}) is not accepted for ${kind}.` }, { status: 400 })
    if (file.size > rule.max) return NextResponse.json({ error: `Too large — ${kind} files are capped at ${Math.round(rule.max / 1024 / 1024)} MB.` }, { status: 400 })
    if (file.size < 1024) return NextResponse.json({ error: "That file is empty." }, { status: 400 })

    const pathname = `forge/${draft}/${kind}-${Date.now()}.${EXT[type] ?? "bin"}`
    const blob = await put(pathname, file, { access: "private", contentType: type })
    return NextResponse.json({ pathname: blob.pathname, url: `/api/file?pathname=${encodeURIComponent(blob.pathname)}` })
  } catch (e) {
    console.error("[forge/media] upload failed:", e)
    return NextResponse.json({ error: (e as Error).message || "Upload failed" }, { status: 500 })
  }
}
