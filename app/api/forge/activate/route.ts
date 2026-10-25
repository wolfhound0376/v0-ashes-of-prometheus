import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { isDmRequest } from "@/lib/dm-session"
import { importCharacter } from "@/lib/forge-import"
import type { ForgeAssets } from "@/lib/forge-submission"

// /api/forge/activate — the DM opens (or shuts) a Forge hero's cell. DM only.
//
//   GET                              → { pending: [...], recent: [...] }  what the seating screen shows
//   POST { id, action: "activate" }  → runs the shared import with the hero's OWN three words preset,
//                                      links the new character, marks the row activated
//   POST { id, action: "reject", note? }
//
// Sam, 2026-10-24: "You will be assigned a code but will be unable to be seated unless your
// account is activated by the DM." This is the activation. It is deliberately the SAME write as
// /api/forge/import (lib/forge-import.ts), so a Forge hero is exactly as real as an imported one.
//
// What activation does NOT do yet: start animations, clone a voice, or render Runway stills. The
// assets (look, sprite job, voice sample path, face photo paths) are carried over onto the
// characters row's notes below so nothing is lost, and the DM review drawer shows them. Spending
// money on them is the next PR, once Sam has seen a hero come through this door.

export const dynamic = "force-dynamic"

function dmOnly(req: Request): Response | null {
  return isDmRequest(req, normalizeCode, safeEquals) ? null : Response.json({ error: "DM only" }, { status: 403 })
}

export async function GET(req: Request) {
  const no = dmOnly(req); if (no) return no
  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return Response.json({ error: "Server not configured" }, { status: 500 }) }
  const { data, error } = await admin
    .from("forge_submissions")
    .select("id, player_name, hero_name, payload, assets, status, character_id, note, created_at, activated_at")
    .order("created_at", { ascending: false })
    .limit(60)
  if (error) {
    const missing = error.message.includes("forge_submissions")
    return Response.json({ error: missing ? "The forge_submissions table is not there yet — run the forge migration." : error.message, pending: [], recent: [] }, { status: missing ? 200 : 500 })
  }
  const rows = (data ?? []).map((r) => {
    const c = (r.payload as { character?: Record<string, unknown> } | null)?.character ?? {}
    const a = (r.assets ?? {}) as ForgeAssets
    return {
      id: r.id, playerName: r.player_name, heroName: r.hero_name, status: r.status, characterId: r.character_id, note: r.note, createdAt: r.created_at, activatedAt: r.activated_at,
      sheet: { species: c.sheet_species ?? null, clazz: c.class ?? null, background: c.sheet_background ?? null, level: c.level ?? null, ac: c.ac ?? null, hp: c.hp_max ?? null },
      assets: {
        look: a.look?.description ?? null,
        sprite: a.sprite ? { status: a.sprite.status, previewUrl: a.sprite.previewUrl ?? null, characterId: a.sprite.characterId ?? null } : null,
        voice: a.voice ? (a.voice.mode === "library" ? `Library: ${a.voice.voiceName}` : a.voice.mode === "record" ? "Own recording (consented)" : "Skipped") : "Skipped",
        voiceSample: a.voice?.mode === "record" ? `/api/file?pathname=${encodeURIComponent(a.voice.samplePath)}` : null,
        facePhotos: a.face?.mode === "photos" ? a.face.paths.map((p) => `/api/file?pathname=${encodeURIComponent(p)}`) : [],
      },
    }
  })
  return Response.json({ pending: rows.filter((r) => r.status === "pending"), recent: rows.filter((r) => r.status !== "pending").slice(0, 12) })
}

export async function POST(req: Request) {
  const no = dmOnly(req); if (no) return no
  const body = await req.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id : ""
  const action = body?.action === "reject" ? "reject" : body?.action === "activate" ? "activate" : null
  if (!id || !action) return Response.json({ error: "id and action (activate|reject) required" }, { status: 400 })

  let admin: ReturnType<typeof createAdminClient>
  try { admin = createAdminClient() } catch { return Response.json({ error: "Server not configured" }, { status: 500 }) }

  const { data: sub, error } = await admin.from("forge_submissions").select("*").eq("id", id).maybeSingle()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  if (!sub) return Response.json({ error: "No such hero" }, { status: 404 })
  if (sub.status !== "pending") return Response.json({ error: `That hero is already ${sub.status}.` }, { status: 409 })

  if (action === "reject") {
    const note = typeof body?.note === "string" ? body.note.trim().slice(0, 300) : null
    const { error: e2 } = await admin.from("forge_submissions").update({ status: "rejected", note, activated_at: new Date().toISOString(), activated_by: "dm" }).eq("id", id)
    if (e2) return Response.json({ error: e2.message }, { status: 500 })
    return Response.json({ ok: true, status: "rejected" })
  }

  // ACTIVATE — the same import as /api/forge/import, with the player's own words preset.
  const payload = sub.payload as { format?: string; character?: Record<string, unknown>; inventory?: unknown[] }
  const assets = (sub.assets ?? {}) as ForgeAssets
  const out = await importCharacter(admin, payload, { confirmDuplicate: Boolean(body?.confirmDuplicate), presetCode: sub.claim_code })
  if (out.kind === "duplicate") return Response.json({ error: `A player character named "${out.name}" already exists.`, duplicate: true }, { status: 409 })
  if (out.kind !== "created") return Response.json({ error: `Import failed (${out.kind}).` }, { status: 500 })

  // Carry the Forge's choices onto the character so nothing the player gave is lost: the library
  // voice goes straight to voice_id (the same column /api/character-voice writes); the rest is
  // noted on the sheet for the DM's asset pipeline to pick up.
  const patch: Record<string, unknown> = {}
  if (assets.voice?.mode === "library") { patch.voice_id = assets.voice.voiceId; patch.voice_description = `Forge: ${assets.voice.voiceName}` }
  const notes: string[] = []
  if (assets.look?.description) notes.push(`Forge look: ${assets.look.description}`)
  if (assets.sprite?.characterId) notes.push(`PixelLab character: ${assets.sprite.characterId} (${assets.sprite.status})`)
  if (assets.voice?.mode === "record") notes.push(`Voice sample (consented): ${assets.voice.samplePath}`)
  if (assets.face?.mode === "photos") notes.push(`Face photos (consented): ${assets.face.paths.join(", ")}`)
  if (notes.length) {
    const { data: cur } = await admin.from("characters").select("sheet_additional_notes").eq("id", out.characterId).maybeSingle()
    const prev = typeof cur?.sheet_additional_notes === "string" && cur.sheet_additional_notes.trim() ? cur.sheet_additional_notes.trim() + "\n\n" : ""
    patch.sheet_additional_notes = prev + notes.join("\n")
  }
  if (Object.keys(patch).length) {
    const { error: e3 } = await admin.from("characters").update(patch).eq("id", out.characterId)
    if (e3) console.error("[forge/activate] asset carry-over failed:", e3.message)
  }

  const { error: e4 } = await admin.from("forge_submissions").update({ status: "activated", character_id: out.characterId, activated_at: new Date().toISOString(), activated_by: "dm" }).eq("id", id)
  if (e4) console.error("[forge/activate] status write failed:", e4.message)

  return Response.json({
    ok: true,
    status: "activated",
    characterId: out.characterId,
    claimCode: out.claimCode,
    codeKept: out.claimCode === normalizeCode(sub.claim_code),
    warning: out.warning ?? null,
    confiscated: out.confiscation?.confiscated ?? null,
  })
}
