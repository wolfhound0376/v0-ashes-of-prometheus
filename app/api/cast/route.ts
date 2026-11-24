import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { forgetCardCache, rememberDue } from "@/lib/npc-agents-store"
import { namesOf, DIMS } from "@/lib/npc-agents"
import { BUCKET, MEDIA_FOLDERS, abilitiesOf, agentFolder, searchWords, uploadPath } from "@/lib/cast"

// /api/cast — THE CAST, the DM's page for each agent's whole package (Sam, 2026-11-23). DM ONLY, every method:
// the cards hold DM secrets (Buppido's, Sarith's), so even reading is behind the DM code.
//
//   GET                       → {agents: [...]}  the eight, with portrait and counts
//   GET  ?agent=<key>         → the package: card, abilities (from the code), stat block, voice and video, films,
//                               pixel art, files, memories, standing, coaching, recent lines
//   PATCH {agent, bible?, agenda?, voice_note?, chattiness?}            edit the card (Sam's own words win)
//   POST {action:"coach", agent, note, scope}                          a coaching note ("Less talk at camp")
//   POST {action:"coach-toggle", id, active}                           switch a note off or back on
//   POST {action:"forget", id}                                         strike one memory
//   POST {action:"remember", agent}                                    the Rememberer, now
//   POST {action:"upload-url", agent, filename}                        a signed upload to agents/<key>/
//
// Nothing here generates art or voice; the page plays what exists.

export const dynamic = "force-dynamic"
export const maxDuration = 60

type Db = ReturnType<typeof createAdminClient>
const deny = () => NextResponse.json({ error: "DM only" }, { status: 403 })
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")

function publicUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`
}

export async function GET(req: NextRequest) {
  if (!isDmRequest(req, normalizeCode, safeEquals)) return deny()
  let db: Db
  try { db = createAdminClient() } catch { return NextResponse.json({ error: "no database" }, { status: 503 }) }
  const key = clip(req.nextUrl.searchParams.get("agent"), 32)
  if (!key) return NextResponse.json({ agents: await listAgents(db) })
  const pkg = await agentPackage(db, key)
  return pkg ? NextResponse.json(pkg) : NextResponse.json({ error: "no such agent" }, { status: 404 })
}

async function listAgents(db: Db) {
  const { data: cards } = await db.from("npc_agents").select("key, name, aliases, role, sprite_slug, chattiness").order("role").order("key")
  const out = []
  for (const c of cards ?? []) {
    const [{ count: mem }, { count: coach }, enc] = await Promise.all([
      db.from("npc_memories").select("id", { count: "exact", head: true }).eq("agent_key", c.key),
      db.from("npc_coaching").select("id", { count: "exact", head: true }).eq("agent_key", c.key).eq("active", true),
      db.from("npc_encounters").select("face_url").ilike("name", c.name).not("face_url", "is", null).limit(1),
    ])
    out.push({ ...c, memories: mem ?? 0, coaching: coach ?? 0, face: enc.data?.[0]?.face_url ?? null })
  }
  return out
}

async function agentPackage(db: Db, key: string) {
  const { data: card } = await db.from("npc_agents").select("*").eq("key", key).maybeSingle()
  if (!card) return null
  const names = namesOf(card)
  const words = searchWords(card.name, card.aliases ?? [])

  const [enc, character, memories, coaching, archive, recent, heroes] = await Promise.all([
    db.from("npc_encounters").select("name, description, disposition, face_url, idle_url, talking_url, voice_id, voice_description, languages, ac, hp_max, challenge_rating, bestiary_id").ilike("name", card.name).limit(1),
    card.character_id ? db.from("characters").select("*").eq("id", card.character_id).maybeSingle() : Promise.resolve({ data: null }),
    db.from("npc_memories").select("id, about_id, line, gravity, run_id, source, created_at, last_recalled_at").eq("agent_key", key).order("created_at", { ascending: false }).limit(150),
    db.from("npc_coaching").select("id, note, scope, active, created_at").eq("agent_key", key).order("created_at", { ascending: false }),
    db.from("dialogue_archive").select("id", { count: "exact", head: true }).in("speaker", [card.name, ...(card.aliases ?? [])]),
    db.from("dialogue_archive").select("text, created_at, recipient").in("speaker", [card.name, ...(card.aliases ?? [])]).order("created_at", { ascending: false }).limit(12),
    db.from("characters").select("id, name").eq("is_player", true).is("archived_at", null),
  ])
  const heroName = new Map(((heroes.data ?? []) as { id: string; name: string }[]).map((h) => [h.id, h.name]))
  const e = enc.data?.[0] ?? null

  // How they feel about each hero (the six numbers), and the last things that moved them.
  let standing: Record<string, unknown>[] = []
  let events: Record<string, unknown>[] = []
  if (card.character_id) {
    const [s, ev] = await Promise.all([
      db.from("character_relationships").select(`object_id, ${DIMS.join(", ")}, last_reason, updated_at`).eq("subject_id", card.character_id),
      db.from("relationship_events").select("object_id, kind, gravity, deltas, note, source, created_at").eq("subject_id", card.character_id).order("created_at", { ascending: false }).limit(20),
    ])
    standing = ((s.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ ...r, hero: heroName.get(String(r.object_id)) ?? "someone" }))
    events = ((ev.data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({ ...r, hero: heroName.get(String(r.object_id)) ?? "someone" }))
  }

  // Bestiary block where the row points at one.
  let bestiary: Record<string, unknown> | null = null
  if (e?.bestiary_id) {
    const { data } = await db.from("bestiary").select("*").eq("id", e.bestiary_id).maybeSingle()
    bestiary = data ?? null
  }

  // Films: their cinematic clips (by name in the cue or its moment); the lich's own animations for Malachar.
  const filmOr = words.map((w) => `state.ilike.%${w}%,moment.ilike.%${w}%`).join(",")
  const films = filmOr ? (await db.from("cinematic_clips").select("state, location, video_url, moment, retired").or(filmOr).limit(40)).data ?? [] : []
  const lich = key === "malachar" ? (await db.from("lich_animations").select("state, video_url, duration").limit(60)).data ?? [] : []

  // Files: their own shelf, and the game's media folders searched by their names.
  const files: { path: string; url: string; size: number | null; updated: string | null; shelf: boolean }[] = []
  const listed = async (folder: string, search?: string, shelf = false) => {
    const { data } = await db.storage.from(BUCKET).list(folder, { limit: 200, search, sortBy: { column: "updated_at", order: "desc" } })
    for (const f of data ?? []) {
      if (!f.id) continue // a sub-folder
      const path = `${folder}/${f.name}`
      if (files.some((x) => x.path === path)) continue
      files.push({ path, url: publicUrl(path), size: (f.metadata as { size?: number } | null)?.size ?? null, updated: f.updated_at ?? null, shelf })
    }
  }
  await listed(agentFolder(key), undefined, true)
  if (words.length) await Promise.all(MEDIA_FOLDERS.flatMap((folder) => words.map((w) => listed(folder, w))))

  const memRows = ((memories.data ?? []) as { about_id: string | null }[]).map((m) => ({ ...m, about: m.about_id ? heroName.get(m.about_id) ?? "someone" : null }))
  const c = character.data as Record<string, unknown> | null
  const sheet = c ? {
    name: c.name, class: c.class, level: c.level, species: c.sheet_species, ac: c.ac, hp_current: c.hp_current, hp_max: c.hp_max,
    scores: { str: c.str_score, dex: c.dex_score, con: c.con_score, int: c.int_score, wis: c.wis_score, cha: c.cha_score },
    attacks: c.sheet_attacks ?? null, spellcasting: c.sheet_spellcasting ?? null, languages: c.languages ?? null, conditions: c.conditions ?? [],
  } : null

  return {
    card,
    names,
    abilities: abilitiesOf(key, card.name),
    sheet,
    bestiary,
    media: e ? { face: e.face_url, idle: e.idle_url, talking: e.talking_url, voice_id: e.voice_id, voice_description: e.voice_description, languages: e.languages, description: e.description, disposition: e.disposition } : null,
    films,
    lich,
    sprite: card.sprite_slug ? `/sprites/${card.sprite_slug}/sprite.json` : null,
    files,
    memories: memRows,
    standing,
    events,
    coaching: coaching.data ?? [],
    lines: { archived: archive.count ?? 0, recent: recent.data ?? [] },
  }
}

export async function PATCH(req: NextRequest) {
  if (!isDmRequest(req, normalizeCode, safeEquals)) return deny()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const key = clip(body.agent, 32)
  if (!key) return NextResponse.json({ error: "agent required" }, { status: 400 })
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.bible === "string") patch.bible = clip(body.bible, 2000)
  if (typeof body.voice_note === "string") patch.voice_note = clip(body.voice_note, 600)
  if (typeof body.sources === "string") patch.sources = clip(body.sources, 600)
  if (typeof body.chattiness === "number") patch.chattiness = Math.max(0, Math.min(10, Math.round(body.chattiness)))
  if (body.agenda && typeof body.agenda === "object") {
    const a = body.agenda as Record<string, unknown>
    patch.agenda = { wants: clip(a.wants, 300), fears: clip(a.fears, 300), secret: clip(a.secret, 300), turns: clip(a.turns, 300) }
  }
  const db = createAdminClient()
  const { error } = await db.from("npc_agents").update(patch).eq("key", key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  forgetCardCache()
  return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
  if (!isDmRequest(req, normalizeCode, safeEquals)) return deny()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const db = createAdminClient()
  const action = clip(body.action, 20)
  const key = clip(body.agent, 32)

  if (action === "coach") {
    const note = clip(body.note, 500)
    const scope = ["stage", "offstage", "both"].includes(String(body.scope)) ? String(body.scope) : "both"
    if (!key || note.length < 3) return NextResponse.json({ error: "agent and a note required" }, { status: 400 })
    const { error } = await db.from("npc_coaching").insert({ agent_key: key, note, scope })
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  if (action === "coach-toggle") {
    const { error } = await db.from("npc_coaching").update({ active: body.active === true }).eq("id", clip(body.id, 40))
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  if (action === "forget") {
    const { error } = await db.from("npc_memories").delete().eq("id", clip(body.id, 40))
    return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true })
  }
  if (action === "remember") {
    if (!key) return NextResponse.json({ error: "agent required" }, { status: 400 })
    return NextResponse.json({ result: await rememberDue(db, key, { force: true }) })
  }
  if (action === "upload-url") {
    const path = uploadPath(key, clip(body.filename, 200))
    if (!path) return NextResponse.json({ error: "bad agent or file name" }, { status: 400 })
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) return NextResponse.json({ error: error?.message ?? "no upload url" }, { status: 500 })
    return NextResponse.json({ path, token: data.token, url: publicUrl(path) })
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
