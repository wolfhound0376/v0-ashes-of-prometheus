import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/cinematics — create and delete cinematic clip entries. (PR-4)
//
//   POST   json: { location, state?, scope, kind }  → create a clip row
//   DELETE json: { id }                             → remove the clip row
//
// The VIDEO itself never passes through here: uploads go to /api/asset-media
// under the whitelisted target "cinematic.video", same as every other DM asset.
// Deleting a clip removes the database row only — blob bytes are kept, the
// same house rule as clearing any other asset reference.
//
// AUTHORIZATION mirrors /api/asset-media: x-dm-key must carry DM_ACCESS_CODE
// when that env var is set; with it unset the route stays open (fail-open,
// same as the /join gate).

export const dynamic = "force-dynamic"

const SCOPES = ["solo", "party"] as const
const KINDS = ["environment", "action", "filler", "opening"] as const
const TRIGGERS = ["campaign_open", "player_initiated", "event_driven", "dm_override"] as const

// The seven values the cinematic_requests.resolution column is constrained to
// at the database level. Anything outside this set throws on insert.
//
// WHY SEVEN AND NOT FIVE (2 Sep 2026).
//
// `resolution` is the only record of why a cinematic did not play, and three
// unrelated outcomes used to write the same word, "miss":
//
//   the catalogue has nothing for this cue   → a real gap, worth filming
//   the row exists but has no film yet       → already on the shot list
//   this character has already watched it    → the feature working as designed
//
// Sharing a label made cinematic_gaps unreadable: on 28 Aug 2026 the identical
// lockpick-success request logged `exact` at 23:01 and `miss` at 23:03, with
// nothing changed in the catalogue between them. The second was
// repeat-suppression filed as a catalogue hole.
//
// So `unrendered` and `seen` were split out, and "miss" is now reserved for a
// cue the catalogue genuinely could not answer — which is what the gaps report
// ranks on.
//
// ONE EXCEPTION, DELIBERATELY LEFT (2 Sep 2026). When the resolve_cinematic
// RPC itself errors, the handler below still logs "miss". An outage is not a
// catalogue fact and does not belong in a shot list, but the honest fix is its
// own value — `error` — and the check constraint does not accept one yet.
// Writing it before the constraint exists would throw on insert and turn a
// failed cinematic into a failed request. So it waits for the migration, and
// until then "miss" means "the catalogue had nothing" everywhere EXCEPT that
// one branch. Do not describe the invariant as absolute while that is true.
type Resolution =
  | "exact" | "location_fallback" | "generic_fallback"
  | "miss" | "rejected" | "seen" | "unrendered"

function authorized(request: NextRequest): boolean {
  const dmCode = process.env.DM_ACCESS_CODE
  // Fail closed: if no DM access code is configured, nobody is a DM.
  if (!dmCode) return false
  const supplied = normalizeCode(request.headers.get("x-dm-key"))
  return !!supplied && safeEquals(supplied, normalizeCode(dmCode))
}

// Observability write. Records which fallback tier a resolution landed on so
// the cinematic_gaps view can surface clips the catalogue is missing.
//
// Uses the service-role admin client because cinematic_requests has RLS on
// with no policies — an anon-key write would silently no-op. Every failure is
// swallowed and logged: a broken log must never stop a clip from playing.
async function logCinematicRequest(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    req_location: string | null
    req_state: string | null
    req_scope: string
    req_kind: string
    trigger_type: string | null
    session_id: string | null
    character_id: string | null
    resolution: Resolution
    resolved_clip_id: string | null
  },
) {
  try {
    const { error } = await admin.from("cinematic_requests").insert(row)
    if (error) console.error("[cinematics] request-log insert failed:", error.message)
  } catch (e) {
    console.error("[cinematics] request-log insert threw:", e)
  }
}

// GET /api/cinematics — resolve a cinematic clip and record the outcome.
// Query params:
//   location (required unless cinematicId), state?, scope?, kind?,
//   trigger_type?, session_id?, character_id?, cinematicId?
//
// Two paths, one endpoint (the DM's manual override and Malachar's automatic
// trigger both come through here):
//
//   • cinematicId present → direct load by id, no fallback. ONLY honoured when
//     trigger_type=dm_override; any other caller is refused outright (Malachar
//     may emit only location/state/kind, never a clip id or URL).
//   • otherwise → the Postgres resolve_cinematic() function runs the three-tier
//     fallback (exact → location_fallback → generic_fallback → miss). The
//     function owns weighted-random variant selection and skips unusable rows
//     (null video_url, weight 0), so the resolution it returns is used verbatim.
//
// ONCE PER CHARACTER (Sam's ruling, 18 Aug 2026). A clip a character has
// already watched will not resolve for them again: cinematic_views is checked
// before the clip is handed over, and a repeat is reported as
// { clip: null, resolution: "seen", seen: true }. Two deliberate exceptions:
//   - trigger_type=dm_override ignores the seen-check entirely. DM mode is the
//     only way to replay something.
//   - probe=1 asks "is anything unseen available here?" WITHOUT recording a
//     view or logging a request, so the dashboard can decide whether to offer
//     the button. Nothing is consumed until the player asks to watch.
//
// A miss and a rejection are both normal outcomes: 200, no thrown error. Every
// non-probe request writes exactly one cinematic_requests row.
/** Has this character already watched this clip? */
async function alreadySeen(
  admin: ReturnType<typeof createAdminClient>,
  characterId: string | null,
  clipId: string,
): Promise<boolean> {
  if (!characterId) return false // anonymous seat: nothing to remember it by
  const { data, error } = await admin
    .from("cinematic_views")
    .select("id")
    .eq("character_id", characterId)
    .eq("clip_id", clipId)
    .limit(1)
  if (error) {
    console.error("[cinematics] seen-check failed:", error.message)
    return false
  }
  return !!data?.length
}

/** Record that this character watched this clip. Best-effort, never blocking. */
async function recordView(
  admin: ReturnType<typeof createAdminClient>,
  row: {
    character_id: string | null
    clip_id: string
    location: string | null
    trigger_type: string | null
    session_id: string | null
  },
) {
  if (!row.character_id) return
  try {
    const { error } = await admin.from("cinematic_views").insert(row)
    if (error) console.error("[cinematics] view insert failed:", error.message)
  } catch (e) {
    console.error("[cinematics] view insert threw:", e)
  }
}

export async function GET(request: NextRequest) {
  // Un-keyed resolution (PR-5) covers the two triggers that originate at the
  // table rather than from the DM console: player_initiated (the look-around
  // chip) and event_driven (a cue Malachar emitted mid-narration). Both can
  // only reach the fallback resolver — never an explicit clip id, which stays
  // dm_override-only below — and everything they can return (cinematic_clips
  // rows, public storage URLs) is already anon-readable under RLS. The cue name
  // itself grants nothing extra: it selects among rows the same caller could
  // already reach by other states. Every other caller still needs the DM key.
  const UNKEYED_TRIGGERS = ["player_initiated", "event_driven"]
  const isPlayerResolution =
    UNKEYED_TRIGGERS.includes(request.nextUrl.searchParams.get("trigger_type") || "") &&
    !request.nextUrl.searchParams.get("cinematicId")
  if (!isPlayerResolution && !authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[cinematics] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const params = request.nextUrl.searchParams
  const location = (params.get("location") || "").trim().slice(0, 80)
  const state = (params.get("state") || "").trim().slice(0, 40) || null
  const scope = SCOPES.includes(params.get("scope") as (typeof SCOPES)[number])
    ? (params.get("scope") as (typeof SCOPES)[number])
    : "party"
  const kind = KINDS.includes(params.get("kind") as (typeof KINDS)[number])
    ? (params.get("kind") as (typeof KINDS)[number])
    : "environment"
  const triggerType = TRIGGERS.includes(params.get("trigger_type") as (typeof TRIGGERS)[number])
    ? (params.get("trigger_type") as (typeof TRIGGERS)[number])
    : null
  const sessionId = params.get("session_id") || null
  const characterId = params.get("character_id") || null
  const cinematicId = (params.get("cinematicId") || "").trim() || null
  const probe = params.get("probe") === "1"

  // Common request metadata attached to whatever resolution we record.
  const reqMeta = {
    req_location: location || null,
    req_state: state,
    req_scope: scope,
    req_kind: kind,
    trigger_type: triggerType,
    session_id: sessionId,
    character_id: characterId,
  }

  // === EXPLICIT CLIP ID PATH ===
  if (cinematicId) {
    // Guard (acceptance test #9): an explicit id is only ever legitimate from
    // the DM's manual override. Enforcing by CALLER — not by whether the id
    // happens to exist — is deliberately stricter: it prevents Malachar from
    // ever playing a clip it picked directly, even if it copied a real uuid
    // from context. A rejection is a normal outcome, not an error.
    if (triggerType !== "dm_override") {
      await logCinematicRequest(admin, { ...reqMeta, resolution: "rejected", resolved_clip_id: null })
      return NextResponse.json({ clip: null, resolution: "rejected" })
    }

    const { data: clip } = await admin
      .from("cinematic_clips")
      .select("id, location, state, scope, kind, video_url")
      .eq("id", cinematicId)
      .maybeSingle()

    // id does not exist → rejected. id exists but not yet rendered → unrendered.
    if (!clip) {
      await logCinematicRequest(admin, { ...reqMeta, resolution: "rejected", resolved_clip_id: null })
      return NextResponse.json({ clip: null, resolution: "rejected" })
    }
    if (!clip.video_url) {
      // The clip is catalogued and correctly tagged; only the film is missing.
      // That is a shot-list item, not a catalogue hole, and the player UI reads
      // this to say "not cut yet" rather than "we have nothing".
      await logCinematicRequest(admin, { ...reqMeta, resolution: "unrendered", resolved_clip_id: null })
      return NextResponse.json({ clip: null, resolution: "unrendered" })
    }

    // dm_override is the only caller allowed on this path, and DM override is
    // precisely the sanctioned way to replay — so no seen-check here. The view
    // is still recorded so the history stays honest about what was watched.
    await logCinematicRequest(admin, { ...reqMeta, resolution: "exact", resolved_clip_id: clip.id })
    await recordView(admin, {
      character_id: characterId, clip_id: clip.id, location: location || null,
      trigger_type: triggerType, session_id: sessionId,
    })
    return NextResponse.json({ clip, resolution: "exact" })
  }

  // === FALLBACK RESOLUTION PATH ===
  if (!location) {
    await logCinematicRequest(admin, { ...reqMeta, resolution: "rejected", resolved_clip_id: null })
    return NextResponse.json({ error: "Location is required" }, { status: 400 })
  }

  // CHARACTER BINDING (migration 20260821030000). cinematic_clips rows may be
  // bound to a character (character_id) or a class (character_class), and the
  // resolver HIDES bound rows from any caller that does not identify a matching
  // character. Passing the id is therefore not optional book-keeping: without it,
  // every bound clip — Fifi's manacles, the bard's first song — silently misses
  // for everyone, including its owner.
  //
  // The class is looked up server-side from the character id rather than read
  // from the query string: a clip bound to "Bard" must not be unlockable by
  // anyone willing to append &character_class=Bard to a URL. The id is already
  // the trusted handle everywhere else in this route. A lookup failure degrades
  // to null, which can cost a character their own personal footage but can never
  // show them someone else's.
  let characterClass: string | null = null
  if (characterId) {
    const { data: who, error: whoError } = await admin
      .from("characters")
      .select("class")
      .eq("id", characterId)
      .maybeSingle()
    if (whoError) console.error("[cinematics] class lookup failed:", whoError.message)
    characterClass = (who?.class as string | null) ?? null
  }

  // The Postgres function owns the tiered fallback, weighted-random variant
  // selection, and skipping unusable rows. EXECUTE is granted only to
  // service_role, so this must run on the admin client. It returns zero or one
  // row shaped { clip_id, video_url, resolution }; zero rows means a miss.
  const { data, error } = await admin.rpc("resolve_cinematic", {
    p_location: location,
    p_state: state ?? null,
    p_scope: scope ?? "party",
    p_kind: kind ?? "environment",
    p_character_id: characterId,
    p_character_class: characterClass,
  })

  if (error) {
    // KNOWN MISLABEL, waiting on a constraint. This is an outage, not a
    // catalogue gap, and logging it as "miss" puts an infrastructure failure
    // into a creative to-do list. It wants its own value — `error` — which the
    // check constraint does not accept yet; writing one now would throw on
    // insert. See the Resolution type above.
    console.error("[cinematics] resolve_cinematic rpc failed:", error.message)
    await logCinematicRequest(admin, { ...reqMeta, resolution: "miss", resolved_clip_id: null })
    return NextResponse.json({ clip: null, resolution: "miss" })
  }

  // rpc() returns an array for a set-returning function; take the first row.
  const row = Array.isArray(data) ? data[0] : data
  const resolution: Resolution = row?.resolution ?? "miss"
  const clip = row?.clip_id
    ? { id: row.clip_id as string, video_url: (row.video_url as string) ?? null }
    : null

  // resolve_cinematic treats p_scope as a PREFERENCE, not a filter: asking for
  // "solo" can still return a party clip when that is the only film for the
  // cue. Echoing the requested scope back therefore mislabels those clips and
  // silently suppresses the broadcast, so read the resolved row's real scope.
  let clipScope: (typeof SCOPES)[number] = scope
  if (clip) {
    const { data: scopeRow } = await admin
      .from("cinematic_clips")
      .select("scope")
      .eq("id", clip.id)
      .maybeSingle()
    if (scopeRow?.scope === "solo" || scopeRow?.scope === "party") clipScope = scopeRow.scope
  }

  // === ONCE PER CHARACTER ===
  if (clip && triggerType !== "dm_override" && (await alreadySeen(admin, characterId, clip.id))) {
    // Suppression is the rule doing its job, not a failure to find film. The
    // response already carried `seen: true`; the resolution now agrees with it,
    // so the log and the body tell the same story.
    if (!probe) {
      await logCinematicRequest(admin, { ...reqMeta, resolution: "seen", resolved_clip_id: null })
    }
    return NextResponse.json({ clip: null, resolution: "seen", seen: true })
  }

  // A probe stops here: nothing logged, nothing recorded, nothing consumed.
  if (probe) return NextResponse.json({ available: !!clip, scope: clipScope, resolution })

  await logCinematicRequest(admin, {
    ...reqMeta,
    resolution,
    resolved_clip_id: clip ? clip.id : null,
  })

  if (clip) {
    await recordView(admin, {
      character_id: characterId, clip_id: clip.id, location: location || null,
      trigger_type: triggerType, session_id: sessionId,
    })
  }

  // scope travels with the clip so the client knows whether this is a personal
  // moment or a group one that must be broadcast to the other seats.
  return NextResponse.json({ clip: clip ? { ...clip, scope: clipScope } : null, resolution })
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[cinematics] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const location = typeof body?.location === "string" ? body.location.trim().slice(0, 80) : ""
  const state = typeof body?.state === "string" && body.state.trim() ? body.state.trim().slice(0, 40) : null
  const scope = SCOPES.includes(body?.scope) ? (body.scope as (typeof SCOPES)[number]) : null
  const kind = KINDS.includes(body?.kind) ? (body.kind as (typeof KINDS)[number]) : null

  if (!location) return NextResponse.json({ error: "Location is required" }, { status: 400 })
  if (!scope) return NextResponse.json({ error: "Scope must be solo or party" }, { status: 400 })
  if (!kind) return NextResponse.json({ error: "Kind must be environment, action or filler" }, { status: 400 })

  // SCENE REGISTRY GUARD: clips may only be filed under a registered
  // environment (or the literal "generic" tier). The location is snapped to
  // the registry row's exact display name; scene_key itself is filled by the
  // database trigger — no code path ever writes a key by hand.
  let canonicalLocation = location
  if (location.toLowerCase() !== "generic") {
    const { data: keyData, error: keyError } = await admin.rpc("scene_key", { p_name: location })
    if (keyError || !keyData) {
      console.error("[cinematics] scene_key rpc failed:", keyError?.message)
      return NextResponse.json({ error: "Could not derive the scene key" }, { status: 500 })
    }
    const { data: env } = await admin
      .from("environments")
      .select("name")
      .eq("scene_key", keyData as string)
      .maybeSingle()
    if (!env) {
      return NextResponse.json(
        { error: `Unknown scene "${location}" — create the environment first, then file clips under it.` },
        { status: 400 },
      )
    }
    canonicalLocation = env.name as string
  } else {
    canonicalLocation = "generic"
  }

  const { data, error } = await admin
    .from("cinematic_clips")
    .insert({ location: canonicalLocation, state, scope, kind })
    .select("id, location, state, scope, kind, video_url")
    .single()
  if (error) {
    console.error("[cinematics] insert failed:", error.message)
    return NextResponse.json({ error: "Could not create the clip" }, { status: 500 })
  }
  return NextResponse.json({ clip: data })
}

export async function DELETE(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Not authorized" }, { status: 403 })

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[cinematics] admin client unavailable:", e)
    return NextResponse.json({ error: "Server not configured" }, { status: 500 })
  }

  const body = await request.json().catch(() => null)
  const id = typeof body?.id === "string" ? body.id : ""
  if (!id) return NextResponse.json({ error: "Clip id is required" }, { status: 400 })

  const { error } = await admin.from("cinematic_clips").delete().eq("id", id)
  if (error) {
    console.error("[cinematics] delete failed:", error.message)
    return NextResponse.json({ error: "Could not delete the clip" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
