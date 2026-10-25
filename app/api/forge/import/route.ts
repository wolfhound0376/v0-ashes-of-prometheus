import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { importCharacter } from "@/lib/forge-import"
import { isDmRequest } from "@/lib/dm-session"

// POST /api/forge/import — the Character Forge importer.
//
// Accepts an `aop-character-v1` payload { character, inventory, forge },
// writes real rows into `characters` and `inventory_items`, and returns a
// claim link. Uses the SERVICE-ROLE client (same pattern as verify-claim)
// because the response includes the freshly-generated claim URL — the anon
// client must never be able to read claim_token.
//
// The write itself lives in lib/forge-import.ts since 2026-10-25, shared with
// /api/forge/activate (a Forge hero's cell being opened). Responses here are
// unchanged from before the move.

export async function POST(req: Request) {
  let body: any
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Validate the format tag and the one non-negotiable field.
  if (body?.format !== "aop-character-v1" && body?.character?.format !== "aop-character-v1") {
    return Response.json(
      { error: "Unsupported format — expected an aop-character-v1 export from the Character Forge." },
      { status: 400 },
    )
  }
  const character = body.character
  if (!character || typeof character.name !== "string" || character.name.trim().length === 0) {
    return Response.json({ error: "Character name is required." }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[v0] forge/import: admin client unavailable:", e)
    return Response.json({ error: "Server not configured" }, { status: 500 })
  }

  // ---- Authorization ------------------------------------------------------
  // When a gate is armed (FORGE_ACCESS_CODE or DM_ACCESS_CODE set), an import
  // must carry ONE of:
  //   1. the DM's session cookie (lib/dm-session.ts) or x-dm-key;
  //   2. x-forge-key — the forge or DM access code (normalised, timing-safe);
  //   3. x-character-id + x-claim-token — a claimed player's own verified pair.
  // With NEITHER env var set the importer FAILS CLOSED — an unset code means
  // the forge is barred, not open (changed 2026-08-20 on Sam's order).
  const forgeCode = process.env.FORGE_ACCESS_CODE
  const dmCode = process.env.DM_ACCESS_CODE
  if (!forgeCode && !dmCode) {
    return Response.json(
      { error: "The forge is barred: no access code is configured on the server." },
      { status: 403 },
    )
  }
  {
    let authorized = isDmRequest(req, normalizeCode, safeEquals)
    const suppliedKey = normalizeCode(req.headers.get("x-forge-key"))
    if (!authorized && suppliedKey) {
      if (forgeCode && safeEquals(suppliedKey, normalizeCode(forgeCode))) authorized = true
      if (!authorized && dmCode && safeEquals(suppliedKey, normalizeCode(dmCode))) authorized = true
    }
    if (!authorized) {
      const ownCharacterId = req.headers.get("x-character-id")
      const ownClaimToken = req.headers.get("x-claim-token")
      if (ownCharacterId && ownClaimToken) {
        const { data: ownSecret } = await admin
          .from("character_secrets")
          .select("claim_token")
          .eq("character_id", ownCharacterId)
          .maybeSingle()
        if (ownSecret?.claim_token && ownSecret.claim_token === ownClaimToken) authorized = true
      }
    }
    if (!authorized) {
      return Response.json(
        { error: "The forge is barred. Enter through /join with a forge code, or claim your seat first." },
        { status: 403 },
      )
    }
  }

  const url = new URL(req.url)
  const confirmDuplicate = url.searchParams.get("confirm") === "duplicate"
  const out = await importCharacter(admin, body, { confirmDuplicate })

  if (out.kind === "bad_format") return Response.json({ error: "Unsupported format — expected an aop-character-v1 export from the Character Forge." }, { status: 400 })
  if (out.kind === "no_name") return Response.json({ error: "Character name is required." }, { status: 400 })
  if (out.kind === "duplicate") return Response.json({ duplicate: true, error: `A player character named "${out.name}" already exists. Confirm to create a second copy.` }, { status: 409 })
  if (out.kind === "insert_failed") return Response.json({ error: "Failed to create character" }, { status: 500 })

  if (!out.claimToken) {
    return Response.json({ characterId: out.characterId, warning: out.warning ?? "Character created, but no claim link could be issued." }, { status: 207 })
  }
  if (out.warning) {
    return Response.json({ characterId: out.characterId, warning: out.warning }, { status: 207 })
  }

  const claimUrl = `${url.origin}/?c=${out.characterId}&k=${out.claimToken}`
  return Response.json(
    {
      characterId: out.characterId,
      claimUrl,
      claimCode: out.claimCode,
      ...(out.confiscation
        ? {
            confiscated: out.confiscation.confiscated,
            issuedRags: out.confiscation.issuedRags,
            ...(out.confiscation.notes.length > 0 ? { confiscationNotes: out.confiscation.notes } : {}),
          }
        : {}),
    },
    { status: 200 },
  )
}
