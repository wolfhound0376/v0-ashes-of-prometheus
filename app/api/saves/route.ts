import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { hasDmCookie, isDmRequest } from "@/lib/dm-session"
import { proveHost, readTable } from "@/lib/table-store"
import { cannotCheckpoint, cannotLoad, cannotLoadKind, cannotRewind, cleanSaveName, saveActionAllowed, type SaveRow, type SaveWho } from "@/lib/saves"
import { checkpoint, headInPlay, listSaves, loadSave, rewindTo } from "@/lib/save-store"
import { bookOf, playedFor } from "@/lib/save-book"
import { plateArt } from "@/lib/plate-art"

// /api/saves — the saved-games shelf (lib/saves.ts has the rules and Sam's words).
//
//   GET  ?characterId=…  (+ x-claim-token)   the shelf: every save's name, session, place, host, party, when it
//                                            was last played, and which one is in play. Host or DM only.
//   POST { action, id, name?, hostId?, hostToken? }
//        load    put a save into play (the world in play is saved first). Only while the table is dark.
//        rename  give a save a new name.
//        delete  take a save off the shelf for good — DM code only, and never the save in play. Deleting a
//                campaign takes its checkpoints with it.
//        rewind      { id: checkpoint }  play a checkpoint: its world goes back into its campaign (the campaign as it
//                    stood is kept first as "Before the rewind"). Table dark only; never in Mortal Mode.
//        checkpoint  { name? }  the host's Save now: a named checkpoint of the world in play. Any time, open or live;
//                    never in Mortal Mode.
//
// THE BOOK (Sam, 2026-11-23: "PR4"; lib/save-book.ts). GET also answers `book`: one card per campaign with its
// checkpoints, the painted plate the party stood on (lib/plate-art.ts), the party's portraits and hours played.
//
// The host proves themselves with their own hero's claim (lib/host.ts), so game night needs no code.

export const dynamic = "force-dynamic"
export const maxDuration = 60

async function who(req: NextRequest, db: ReturnType<typeof createAdminClient>, characterId: string, claimToken: string): Promise<SaveWho> {
  return {
    dm: isDmRequest(req, normalizeCode, safeEquals),
    dmCookie: hasDmCookie(req),
    host: await proveHost(db, characterId, claimToken),
  }
}

export async function GET(req: NextRequest) {
  let db
  try { db = createAdminClient() } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
  const w = await who(req, db, req.nextUrl.searchParams.get("characterId") ?? "", req.headers.get("x-claim-token") ?? "")
  const ok = saveActionAllowed("list", w)
  if (ok !== true) return NextResponse.json({ error: ok }, { status: 403 })
  const [shelf, table] = await Promise.all([listSaves(db), readTable(db)])
  return NextResponse.json({ ...shelf, book: await bookWithArt(db, shelf.saves), installed: !shelf.missing, tableStatus: table.status, canDelete: w.dmCookie })
}

/** The book, dressed: each card's painting, the plate's name (where the party stands) and the party's portraits. */
async function bookWithArt(db: ReturnType<typeof createAdminClient>, saves: SaveRow[]) {
  const book = bookOf(saves)
  const names = [...new Set(book.flatMap((c) => c.party ?? []))]
  const faces = new Map<string, string>()
  if (names.length) {
    const { data } = await db.from("characters").select("name, portrait_image_url, avatar_image_url, face_image_url").eq("is_player", true).in("name", names)
    for (const c of data ?? []) {
      const url = (c.portrait_image_url || c.face_image_url || c.avatar_image_url) as string | null
      if (url && !faces.has(c.name as string)) faces.set(c.name as string, url)
    }
  }
  return book.map((c) => {
    const { name, art } = plateArt(c.plate)
    return {
      ...c,
      art,
      where: c.place || name,
      played: playedFor(c.play_seconds),
      faces: (c.party ?? []).map((n) => ({ name: n, url: faces.get(n) ?? null })),
      checkpoints: c.checkpoints.map((k) => ({ ...k, where: plateArt(k.plate).name })),
    }
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : ""
  const id = typeof body.id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) ? body.id : ""
  let db
  try { db = createAdminClient() } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
  const w = await who(req, db, typeof body.hostId === "string" ? body.hostId : "", typeof body.hostToken === "string" ? body.hostToken : "")
  const ok = saveActionAllowed(action, w)
  if (ok !== true) return NextResponse.json({ error: ok }, { status: 403 })

  if (action === "checkpoint") {
    // SAVE NOW (the host, any time). The name defaults to when it was made.
    const head = await headInPlay(db)
    const why = cannotCheckpoint(head)
    if (why) return NextResponse.json({ error: why }, { status: 409 })
    const name = cleanSaveName(body.name) ?? `Saved ${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}`
    const made = await checkpoint(db, "named", name)
    if (!made.ok) return NextResponse.json({ error: made.missing ? "Checkpoints are not switched on yet (the migration has not been applied)." : made.error }, { status: made.missing ? 503 : 500 })
    return NextResponse.json({ ok: true, saved: name })
  }

  if (!id) return NextResponse.json({ error: "Which save?" }, { status: 400 })

  type Row = { id: string; name: string; is_loaded: boolean; kind?: SaveRow["kind"]; campaign_id?: string | null }
  let read: { data: unknown; error: { code?: string; message: string } | null } = await db.from("campaign_saves").select("id, name, is_loaded, kind, campaign_id").eq("id", id).maybeSingle()
  if (read.error?.code === "42703") read = await db.from("campaign_saves").select("id, name, is_loaded").eq("id", id).maybeSingle()
  const save = read.data as Row | null
  const readErr = read.error
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!save) return NextResponse.json({ error: "There is no save by that name." }, { status: 404 })

  if (action === "rename") {
    const name = cleanSaveName(body.name)
    if (!name) return NextResponse.json({ error: "Give the save a name." }, { status: 400 })
    const { error } = await db.from("campaign_saves").update({ name }).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...(await listSaves(db)) })
  }

  if (action === "delete") {
    if (save.is_loaded) return NextResponse.json({ error: "That is the game in play. Load another save first, then delete this one." }, { status: 409 })
    // A campaign goes with all its checkpoints; a checkpoint goes alone.
    const isHead = !save.kind || save.kind === "head"
    let { error } = isHead
      ? await db.from("campaign_saves").delete().or(`id.eq.${id},campaign_id.eq.${id}`)
      : await db.from("campaign_saves").delete().eq("id", id)
    if (error?.code === "42703") ({ error } = await db.from("campaign_saves").delete().eq("id", id)) // before the checkpoints migration
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...(await listSaves(db)) })
  }

  if (action === "rewind") {
    const { data: head } = save.campaign_id ? await db.from("campaign_saves").select("id, mortal").eq("kind", "head").eq("campaign_id", save.campaign_id).maybeSingle() : { data: null }
    const why = cannotRewind((await readTable(db)).status, { kind: save.kind }, head ? { mortal: Boolean(head.mortal) } : null)
    if (why) return NextResponse.json({ error: why }, { status: 409 })
    const done = await rewindTo(db, id)
    if (!done.ok) return NextResponse.json({ error: done.missing ? "Checkpoints are not switched on yet (the migration has not been applied)." : done.error }, { status: done.missing ? 503 : 500 })
    // As after a load: every open screen sees the run change and closes.
    return NextResponse.json({ ok: true, rewound: save.name, ...(await listSaves(db)) })
  }

  // load
  const notHead = cannotLoadKind(save)
  if (notHead) return NextResponse.json({ error: notHead }, { status: 409 })
  const why = cannotLoad((await readTable(db)).status, save)
  if (why) return NextResponse.json({ error: why }, { status: 409 })
  const loaded = await loadSave(db, id)
  if (!loaded.ok) return NextResponse.json({ error: loaded.missing ? "Saved games are not switched on yet (the migration has not been applied)." : loaded.error }, { status: loaded.missing ? 503 : 500 })
  // Every open screen sees the run change and closes (lib/session-guard.ts wasReset), as after a New Game.
  return NextResponse.json({ ok: true, loaded: save.name, ...(await listSaves(db)) })
}
