import { NextRequest, NextResponse } from "next/server"
import { pixellabConfigured, readJob, readPreview, startCharacter } from "@/lib/pixellab"

// /api/forge/sprite — the Look step's "draw my figure".
//
//   POST { description }               → { deferred: true } when no PIXELLAB_API_KEY is set, else
//                                        { jobId, characterId } (either may be null; see lib/pixellab.ts)
//   GET  ?jobId=…&characterId=…        → { status, characterId, previewUrl }
//
// Sam, 2026-10-24: character creation includes "the creation of your pixel sprite … through
// pixellab ai". The Forge starts ONE generation per hero — the still figure in rags — and the
// player carries on while it draws. Animations (idle, walk, the standard gestures) are NOT
// started here: they cost eight times as much per set and they wait for the DM to approve the
// figure at activation. Nothing is written to any table from this route; the job handle rides in
// the player's draft and lands in forge_submissions.assets when they hand the hero in.
//
// Art rule (Sam, 2026-09-30): generation at build time is fine as long as HE approves before it
// goes in — the DM review drawer is where this figure gets approved; nothing here reaches the map.

export const dynamic = "force-dynamic"

// One figure per hero, and a stranger cannot spend the PixelLab balance in a loop.
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_WINDOW = 3
const attempts = new Map<string, { count: number; resetAt: number }>()
function tooMany(ip: string): boolean {
  const now = Date.now()
  const e = attempts.get(ip)
  if (!e || now > e.resetAt) { attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS }); return false }
  e.count += 1
  return e.count > MAX_PER_WINDOW
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const description = typeof body?.description === "string" ? body.description.trim().slice(0, 600) : ""
  if (!description) return NextResponse.json({ error: "description required" }, { status: 400 })
  if (!pixellabConfigured()) return NextResponse.json({ deferred: true, reason: "PixelLab is not connected on this server; the DM will draw this figure when the cell is opened." })
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? request.headers.get("x-real-ip") ?? "unknown"
  if (tooMany(ip)) return NextResponse.json({ error: "Too many figures from one place. Wait a few minutes." }, { status: 429 })
  try {
    const started = await startCharacter(description)
    console.log("[forge/sprite] started", JSON.stringify(started.raw).slice(0, 400)) // the first live run tells us the field names
    if (!started.jobId && !started.characterId) return NextResponse.json({ deferred: true, reason: "PixelLab accepted the request but returned no job handle (logged)." })
    return NextResponse.json({ jobId: started.jobId, characterId: started.characterId })
  } catch (e) {
    console.error("[forge/sprite] start failed:", e)
    return NextResponse.json({ deferred: true, reason: "PixelLab did not answer; the DM will draw this figure when the cell is opened." })
  }
}

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId")?.trim() ?? ""
  let characterId = request.nextUrl.searchParams.get("characterId")?.trim() ?? ""
  if (!jobId && !characterId) return NextResponse.json({ error: "jobId or characterId required" }, { status: 400 })
  if (!pixellabConfigured()) return NextResponse.json({ status: "deferred" })
  try {
    let status: "drawing" | "ready" | "failed" = "drawing"
    if (jobId) {
      const job = await readJob(jobId)
      if (job.status === "completed") status = "ready"
      else if (job.status === "failed") return NextResponse.json({ status: "failed", detail: job.detail })
      if (!characterId && job.characterId) characterId = job.characterId
    } else {
      status = "ready"
    }
    const previewUrl = status === "ready" && characterId ? await readPreview(characterId) : null
    return NextResponse.json({ status, characterId: characterId || null, previewUrl })
  } catch (e) {
    console.error("[forge/sprite] poll failed:", e)
    return NextResponse.json({ status: "drawing", characterId: characterId || null, previewUrl: null })
  }
}
