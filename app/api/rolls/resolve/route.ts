import { createAdminClient } from "@/lib/supabase/admin"
import { resultForTransport, type StructuredRollResult } from "@/lib/roll-requests"

type ResolveBody = {
  requestId?: unknown
  characterId?: unknown
  claimToken?: unknown
  result?: Partial<StructuredRollResult> & { timestamp?: unknown }
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function POST(req: Request) {
  let body: ResolveBody
  try {
    body = await req.json()
  } catch {
    return Response.json({ accepted: false, reason: "invalid_json" }, { status: 400 })
  }

  const { requestId, characterId, claimToken, result } = body
  if (!isUuid(requestId) || !isUuid(characterId) || !result) {
    return Response.json({ accepted: false, reason: "invalid_request" }, { status: 400 })
  }
  if (
    typeof result.die !== "string" ||
    !Array.isArray(result.rolls) ||
    !result.rolls.every(Number.isInteger) ||
    !Number.isInteger(result.modifier) ||
    !Number.isInteger(result.total)
  ) {
    return Response.json({ accepted: false, reason: "invalid_result" }, { status: 400 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (error) {
    console.error("[rolls] admin client unavailable:", error)
    return Response.json({ accepted: false, reason: "server_unavailable" }, { status: 500 })
  }

  // Claimed characters must present the same server-only secret used by chat.
  // Shared-table/unclaimed characters remain compatible with the existing app.
  if (claimToken != null) {
    if (!isUuid(claimToken)) {
      return Response.json({ accepted: false, reason: "invalid_claim" }, { status: 403 })
    }
    const { data: secret, error } = await admin
      .from("character_secrets")
      .select("claim_token")
      .eq("character_id", characterId)
      .maybeSingle()
    if (error || !secret || secret.claim_token !== claimToken) {
      return Response.json({ accepted: false, reason: "invalid_claim" }, { status: 403 })
    }
  } else {
    const { data: character } = await admin
      .from("characters")
      .select("id")
      .eq("id", characterId)
      .is("archived_at", null)
      .maybeSingle()
    if (!character) return Response.json({ accepted: false, reason: "invalid_character" }, { status: 403 })
  }

  const transport = resultForTransport(result as StructuredRollResult)
  const { data, error } = await admin.rpc("resolve_roll_request", {
    p_request_id: requestId,
    p_character_id: characterId,
    p_die: transport.die,
    p_rolls: transport.rolls,
    p_modifier: transport.modifier,
    p_total: transport.total,
    p_label: transport.label,
    p_roll_mode: transport.rollMode,
  })

  if (error) {
    console.error("[rolls] resolve RPC failed:", error)
    return Response.json({ accepted: false, reason: "resolve_failed" }, { status: 500 })
  }

  const resolution = Array.isArray(data) ? data[0] : data
  if (!resolution) return Response.json({ accepted: false, reason: "request_not_found" }, { status: 404 })
  if (resolution.outcome === "rejected") {
    return Response.json({ accepted: false, reason: resolution.reason, status: resolution.status }, { status: 422 })
  }
  if (resolution.outcome === "conflict") {
    return Response.json({ accepted: false, reason: resolution.reason, status: resolution.status }, { status: 409 })
  }

  const duplicate = resolution.outcome === "duplicate"
  const label = transport.label || "Roll"
  const message = `[ROLL_RESULT:${requestId}] [Dice Roll] ${label}: ${transport.total} (${transport.die} → [${transport.rolls.join(
    ", ",
  )}]${transport.modifier >= 0 ? ` +${transport.modifier}` : ` ${transport.modifier}`}). Narrate this committed result; do not re-roll or change its numbers.`

  return Response.json({
    accepted: true,
    duplicate,
    shouldDispatch: !duplicate,
    requestId,
    correlationId: resolution.correlation_id,
    status: resolution.status,
    message,
  })
}
