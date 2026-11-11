import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { hasDmCookie, isDmRequest } from "@/lib/dm-session"
import { proveHost, readTable } from "@/lib/table-store"
import { cannotLoad, cleanSaveName, saveActionAllowed, type SaveWho } from "@/lib/saves"
import { listSaves, loadSave } from "@/lib/save-store"

// /api/saves — the saved-games shelf (lib/saves.ts has the rules and Sam's words).
//
//   GET  ?characterId=…  (+ x-claim-token)   the shelf: every save's name, session, place, host, party, when it
//                                            was last played, and which one is in play. Host or DM only.
//   POST { action, id, name?, hostId?, hostToken? }
//        load    put a save into play (the world in play is saved first). Only while the table is dark.
//        rename  give a save a new name.
//        delete  take a save off the shelf for good — DM code only, and never the save in play.
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
  return NextResponse.json({ ...shelf, installed: !shelf.missing, tableStatus: table.status, canDelete: w.dmCookie })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const action = typeof body.action === "string" ? body.action : ""
  const id = typeof body.id === "string" ? body.id : ""
  let db
  try { db = createAdminClient() } catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }) }
  const w = await who(req, db, typeof body.hostId === "string" ? body.hostId : "", typeof body.hostToken === "string" ? body.hostToken : "")
  const ok = saveActionAllowed(action, w)
  if (ok !== true) return NextResponse.json({ error: ok }, { status: 403 })
  if (!id) return NextResponse.json({ error: "Which save?" }, { status: 400 })

  const { data: save, error: readErr } = await db.from("campaign_saves").select("id, name, is_loaded").eq("id", id).maybeSingle()
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
    const { error } = await db.from("campaign_saves").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...(await listSaves(db)) })
  }

  // load
  const why = cannotLoad((await readTable(db)).status, save)
  if (why) return NextResponse.json({ error: why }, { status: 409 })
  const loaded = await loadSave(db, id)
  if (!loaded.ok) return NextResponse.json({ error: loaded.missing ? "Saved games are not switched on yet (the migration has not been applied)." : loaded.error }, { status: loaded.missing ? 503 : 500 })
  // Every open screen sees the run change and closes (lib/session-guard.ts wasReset), as after a New Game.
  return NextResponse.json({ ok: true, loaded: save.name, ...(await listSaves(db)) })
}
