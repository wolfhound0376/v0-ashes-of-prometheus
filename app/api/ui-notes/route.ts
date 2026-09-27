import { type NextRequest, NextResponse } from "next/server"
import { del, get, list, put } from "@vercel/blob"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/ui-notes — layout notes Sam draws on the live UI so the next coding
// pass knows exactly which box he meant.
//
//   GET                → { notes: UiNote[] } newest first
//   POST { note }      → { note }       create
//   PATCH { id, status } → { note }     mark open / done
//   DELETE ?id=        → { ok: true }
//
// One private JSON blob per note under ui-notes/. DM-only, gated like the
// other DM panels: x-dm-key must equal DM_ACCESS_CODE, and it fails closed.

export const dynamic = "force-dynamic"

const PREFIX = "ui-notes/"
const MAX_COMMENT = 2000
const MAX_TEXT = 600

export interface UiNote {
  id: string
  createdAt: string
  status: "open" | "done"
  path: string
  view: string
  viewport: { w: number; h: number }
  rect: { x: number; y: number; w: number; h: number }
  comment: string
  targets: string[]
  text: string
}

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  if (!dmCode) return false
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0)
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "")

async function readNote(pathname: string): Promise<UiNote | null> {
  const result = await get(pathname, { access: "private" })
  if (!result || result.statusCode !== 200) return null
  try {
    return JSON.parse(await new Response(result.stream).text()) as UiNote
  } catch {
    return null
  }
}

async function writeNote(note: UiNote) {
  await put(`${PREFIX}${note.id}.json`, JSON.stringify(note), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  const { blobs } = await list({ prefix: PREFIX })
  const notes = (await Promise.all(blobs.map((b) => readNote(b.pathname)))).filter((n): n is UiNote => !!n)
  notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return NextResponse.json({ notes })
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  const body = await request.json().catch(() => null)
  const raw = body?.note
  const comment = str(raw?.comment, MAX_COMMENT).trim()
  if (!raw || !comment) return NextResponse.json({ error: "A note needs a comment." }, { status: 400 })

  const note: UiNote = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    status: "open",
    path: str(raw.path, 300) || "/",
    view: str(raw.view, 40) || "full",
    viewport: { w: num(raw.viewport?.w), h: num(raw.viewport?.h) },
    rect: { x: num(raw.rect?.x), y: num(raw.rect?.y), w: num(raw.rect?.w), h: num(raw.rect?.h) },
    comment,
    targets: Array.isArray(raw.targets) ? raw.targets.slice(0, 12).map((t: unknown) => str(t, 160)).filter(Boolean) : [],
    text: str(raw.text, MAX_TEXT),
  }
  await writeNote(note)
  return NextResponse.json({ note })
}

export async function PATCH(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  const body = await request.json().catch(() => null)
  const id = str(body?.id, 64)
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })
  const note = await readNote(`${PREFIX}${id}.json`)
  if (!note) return NextResponse.json({ error: "Not found" }, { status: 404 })
  note.status = body?.status === "done" ? "done" : "open"
  await writeNote(note)
  return NextResponse.json({ note })
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })
  const id = request.nextUrl.searchParams.get("id") ?? ""
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 })
  await del(`${PREFIX}${id}.json`)
  return NextResponse.json({ ok: true })
}
