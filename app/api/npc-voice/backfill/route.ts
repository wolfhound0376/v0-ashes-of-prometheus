import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { resolveNamedNpcVoiceId, NAMED_NPC_VOICES } from "@/lib/tts"

/**
 * One-shot backfill: assign canon ElevenLabs voice ids to existing NPC rows so
 * named characters (Ront, Eldeth, the Lich, ...) speak with their intended
 * voice the very first time they talk — instead of a keyword-guessed premade.
 *
 * Reuses `resolveNamedNpcVoiceId` (the same matcher the live /api/npc-tts route
 * uses) so the seed can never drift from runtime resolution.
 *
 * Safety:
 *   - DM-only: requires the DM access code (?code= or x-dm-code header).
 *   - Never overwrites an existing voice_id — only fills rows where it is NULL.
 *   - Idempotent: running it again is a no-op once every match is filled.
 *   - `?dryRun=1` reports what WOULD change without writing.
 *
 * GET  → dry run summary (no writes).
 * POST → apply the backfill.
 */
async function handle(request: NextRequest, apply: boolean) {
  const url = new URL(request.url)
  const providedCode =
    url.searchParams.get("code") || request.headers.get("x-dm-code") || ""
  const dmCode = process.env.DM_ACCESS_CODE

  if (!dmCode || providedCode !== dmCode) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = !apply || url.searchParams.get("dryRun") === "1"

  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    return NextResponse.json(
      { error: "Supabase admin client unavailable", detail: (err as Error).message },
      { status: 500 },
    )
  }

  // Pull every NPC row that still has no voice assigned. Substring alias
  // matching happens in code (Postgres can't express our alias table cheaply).
  const { data: rows, error } = await admin
    .from("npc_encounters")
    .select("id, name, voice_id")
    .is("voice_id", null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const planned: { id: string; name: string; voiceId: string }[] = []
  const skipped: string[] = []

  for (const row of rows ?? []) {
    const voiceId = resolveNamedNpcVoiceId(row.name)
    if (voiceId) planned.push({ id: row.id, name: row.name, voiceId })
    else if (row.name) skipped.push(row.name)
  }

  let updated = 0
  const failures: { name: string; error: string }[] = []

  if (!dryRun) {
    for (const item of planned) {
      // Scope by id AND still-null voice_id so we never clobber a voice set
      // between the read and the write.
      const { error: upErr } = await admin
        .from("npc_encounters")
        .update({ voice_id: item.voiceId })
        .eq("id", item.id)
        .is("voice_id", null)
      if (upErr) failures.push({ name: item.name, error: upErr.message })
      else updated += 1
    }
  }

  return NextResponse.json({
    dryRun,
    knownNamedVoices: NAMED_NPC_VOICES.length,
    candidatesWithoutVoice: rows?.length ?? 0,
    matched: planned.length,
    matchedNames: Array.from(new Set(planned.map((p) => p.name))),
    unmatchedNames: Array.from(new Set(skipped)),
    updated,
    failures,
  })
}

export async function GET(request: NextRequest) {
  return handle(request, false)
}

export async function POST(request: NextRequest) {
  return handle(request, true)
}
