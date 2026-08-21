import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// POST /api/restart-campaign — the real "start over" button.
//
// WHY THIS IS A SERVER ROUTE AND NOT CLIENT CODE
// The old restart lived in app/page.tsx and ran through the browser's anon key.
// Two of the tables it needs to clear — `sessions` and `session_beats` — have
// RLS on with SELECT-only policies (session_beats also allows INSERT). A DELETE
// from the anon key against those tables does not error; it removes zero rows
// and reports success. Malachar's session history therefore survived every
// restart, which is the single biggest reason NPCs "remembered" a wiped
// campaign. The service role bypasses RLS, so the clear actually happens.
//
// WHAT SURVIVES ON PURPOSE
//   - npc_encounters ROWS. They are reset, never deleted. Those rows carry
//     portrait_url, face_url, voice_id, idle_url and talking_url — the assets
//     are keyed by NPC name and are expensive and, once, irrecoverable. Ten
//     NPCs were lost to a direct-SQL delete on 2026-08-01. Never again.
//   - dm_phrasebook. Deliberate. It is Malachar's ban list of his own opening
//     lines, and it exists precisely BECAUSE restart wipes the dialogue table.
//     Clearing it here would restore the bug it was built to fix.
//   - Curated environments (see isCuratedEnvironment below).
//   - cinematic_clips and the films themselves. The LIBRARY survives; only the
//     record of who has watched what is cleared (see step 1b).
//   - cinematic_requests, the diagnostic log of cues asked for and missed.
//   - Character rows, stats, XP and levels.
//
// AUTHORIZATION mirrors /api/asset-media and /api/forge/import: x-dm-key must
// carry DM_ACCESS_CODE. FAIL CLOSED: with the env var unset the route refuses
// everyone — an unset code means the gate is locked, not missing (changed
// 2026-08-20 on Sam's order; the old fail-open rule let anyone in).

export const dynamic = "force-dynamic"
export const maxDuration = 60

/** Where the party stands after a restart. Must match an `environments.name`. */
const STARTING_LOCATION = "Scene_1_Velkynvelve (slave pen)"
// The same starting point expressed for the travel graph and the node map:
// travel_nodes.node_key, then the subnodal map and the area the prisoners wake in.
const STARTING_NODE_KEY = "velkynvelve"
const STARTING_SUBNODAL_MAP = "velkynvelve-nodes"
const STARTING_SUBNODAL_NODE = 11

/** What every character wears out of the gate. Everything else is confiscated. */
const STARTING_GARMENT = {
  name: "Rags",
  description:
    "Filthy strips of coarse cloth, knotted at the waist with a length of rope. Damaged.",
  quantity: 1,
  weight: "2",
  value: "0",
  item_type: "armor",
  equippable_slot: "torso",
  icon_type: "custom",
}

// Sam's ruling (17 Aug 2026): journals are always part of inventory unless
// taken — every prisoner smuggled theirs through confiscation, quill included.
const SMUGGLED_EFFECTS = [
  {
    name: "Tattered Journal",
    description:
      "A battered personal journal, smuggled through the drow confiscation. Its pages remember what its owner survives.",
    quantity: 1,
    weight: "1",
    value: "0",
    item_type: "misc",
  },
  {
    name: "Small Quill",
    description: "A stub of quill and a pinch of soot-ink, hidden in a seam. Enough to keep writing.",
    quantity: 1,
    weight: "0",
    value: "0",
    item_type: "misc",
  },
]

interface EnvironmentRow {
  id: string
  name: string
  description: string | null
  background_image_url: string | null
}

/**
 * A curated environment is one whose background was UPLOADED as an environment.
 *
 * Sam's uploads land at `/api/file?pathname=environments%2F...`. Everything the
 * chat route creates on its own is one of:
 *   - a Fal CDN url (v3b.fal.media) when it generated fresh art,
 *   - a null background when generation failed,
 *   - or a copy of some other row's art, which it stamps with the auto-generated
 *     description "The party has arrived at X."
 *
 * That last case is why the description signature is checked as well as the URL:
 * when resolveExistingSceneArt() matches, the auto-created row inherits a real
 * uploaded URL and would otherwise look curated. The description is the tell.
 *
 * Verified against all 9 live rows on 2026-08-16: keeps the 6 curated scenes,
 * drops Scene_2_Darklake Approach (Fal), Velkynvelve (slave pen) (null art,
 * duplicate) and Slave Pen Drow Prison (auto-created today).
 */
function isCuratedEnvironment(row: EnvironmentRow): boolean {
  if (row.name === STARTING_LOCATION) return true
  if ((row.description || "").startsWith("The party has arrived at ")) return false
  const url = row.background_image_url || ""
  return url.startsWith("/api/file?pathname=environments%")
}

export async function POST(req: Request) {
  // --- auth ---------------------------------------------------------------
  const required = process.env.DM_ACCESS_CODE
  // Fail closed: with no DM code configured, nobody may restart the campaign.
  if (!required) {
    return Response.json({ ok: false, reason: "forbidden" }, { status: 403 })
  }
  const supplied = req.headers.get("x-dm-key") || ""
  if (!supplied || !safeEquals(normalizeCode(supplied), normalizeCode(required))) {
    return Response.json({ ok: false, reason: "forbidden" }, { status: 403 })
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error("[restart] admin client unavailable:", e)
    return Response.json({ ok: false, reason: "server" }, { status: 500 })
  }

  const report: Record<string, unknown> = {}
  const problems: string[] = []
  const note = (step: string, error: unknown) => {
    if (error) {
      console.error(`[restart] ${step}:`, error)
      problems.push(step)
    }
  }

  // --- 1. dialogue --------------------------------------------------------
  {
    const { count, error } = await admin
      .from("dialogue")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000")
    note("dialogue", error)
    report.dialogueDeleted = count ?? 0
  }

  // --- 1b. cinematic memory ----------------------------------------------
  // Which clips each character has already watched. A cinematic plays once per
  // character, so leaving this behind means a restarted campaign never shows
  // its opening film again — the party wakes in Velkynvelve to silence where
  // the first run got the waterfall. Exactly the failure this route's header
  // describes for `sessions`: state surviving a wipe and making the world
  // remember a campaign that no longer exists.
  //
  // cinematic_requests is deliberately NOT cleared. It is the diagnostic log
  // of what was asked for and whether film existed, and it is the only record
  // of gaps worth filming — that value is about the library, not the run.
  {
    const { count, error } = await admin
      .from("cinematic_views")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000")
    note("cinematic_views", error)
    report.cinematicViewsCleared = count ?? 0
  }

  // --- 2. Malachar's session history -------------------------------------
  // The reason this route exists. Beats first: they reference a session.
  {
    // Sam's ruling (17 Aug 2026): a campaign restart burns journal pages.
    // The physical Tattered Journal is re-issued below; its pages are not.
    // Deleted before sessions so the session_id FK never has to set-null.
    const { count, error } = await admin
      .from("journal_entries")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000")
    note("journal_entries", error)
    report.journalPagesBurned = count ?? 0
  }
  {
    const { count, error } = await admin
      .from("session_beats")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000")
    note("session_beats", error)
    report.sessionBeatsDeleted = count ?? 0
  }
  {
    const { count, error } = await admin
      .from("sessions")
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000")
    note("sessions", error)
    report.sessionsDeleted = count ?? 0
  }

  // --- 3. NPC memory ------------------------------------------------------
  // RESET, NOT DELETE. hp_current returns to hp_max via a tiny read-modify-write
  // because PostgREST cannot set a column from another column in one statement.
  {
    const { data: npcs, error: readErr } = await admin
      .from("npc_encounters")
      .select("id, hp_max")
    note("npc_encounters read", readErr)

    let reset = 0
    for (const npc of npcs || []) {
      const { error } = await admin
        .from("npc_encounters")
        .update({
          disposition: null,      // forgets how it felt about the party
          conditions: [],         // no lingering poison, prone, restrained
          hp_current: npc.hp_max, // wounds heal
          is_active: false,       // offstage until the story calls it back
          updated_at: new Date().toISOString(),
        })
        .eq("id", npc.id)
      if (error) note(`npc_encounters ${npc.id}`, error)
      else reset += 1
    }
    report.npcsReset = reset
  }

  // --- 4. inventory + equipment ------------------------------------------
  // Every player starts stripped. Velkynvelve took everything; the gear itself
  // lives on in the "Velkynvelve Equipment Stash" character, which is not a
  // player and is therefore untouched here.
  const { data: players, error: playersErr } = await admin
    .from("characters")
    .select("id, name, hp_max")
    .eq("is_player", true)
  note("characters read", playersErr)

  const playerIds = (players || []).map((p) => p.id)

  // --- 4a. player wounds ---------------------------------------------------
  // RESET, NOT DELETE — the same mercy the NPCs get in step 3. A restart is a
  // fresh start: hp_current returns to hp_max and lingering conditions clear.
  // (Added 2026-08-20: this section didn't exist, so Scott carried 0/9 HP
  // through every restart since the day he first went down.)
  {
    let healed = 0
    for (const p of players || []) {
      const { error } = await admin
        .from("characters")
        .update({
          hp_current: p.hp_max,
          conditions: [],
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)
      if (error) note(`player hp ${p.id}`, error)
      else healed += 1
    }
    report.playersHealed = healed
  }

  if (playerIds.length) {
    {
      const { count, error } = await admin
        .from("inventory_items")
        .delete({ count: "exact" })
        .in("character_id", playerIds)
      note("inventory_items", error)
      report.inventoryDeleted = count ?? 0
    }
    {
      const { count, error } = await admin
        .from("equipment_items")
        .delete({ count: "exact" })
        .in("character_id", playerIds)
      note("equipment_items", error)
      report.equipmentDeleted = count ?? 0
    }

    // Issue Rags. Linked to the canonical `items` row when one exists so the
    // catalog stays the source of truth; a missing catalog row is not fatal.
    const { data: ragsItem } = await admin
      .from("items")
      .select("id")
      .ilike("name", STARTING_GARMENT.name)
      .maybeSingle()

    const { error: ragsErr } = await admin.from("inventory_items").insert(
      playerIds.map((character_id) => ({
        character_id,
        item_id: ragsItem?.id ?? null,
        ...STARTING_GARMENT,
      })),
    )
    note("issue rags", ragsErr)
    report.ragsIssued = ragsErr ? 0 : playerIds.length

    // Re-issue the smuggled journal + quill to every player. Their previous
    // pages were burned above — a restart is a fresh book (Sam's ruling).
    const { error: effectsErr } = await admin.from("inventory_items").insert(
      playerIds.flatMap((character_id) => SMUGGLED_EFFECTS.map((item) => ({ character_id, ...item }))),
    )
    note("issue smuggled effects", effectsErr)
    report.smuggledEffectsIssued = effectsErr ? 0 : playerIds.length * SMUGGLED_EFFECTS.length
  }

  // --- 5. environments ----------------------------------------------------
  // Drop what the AI invented, keep what Sam uploaded, then put the party back
  // in the slave pen. The dashboard reads "current location" as the most
  // recently updated row, so touching updated_at IS the move.
  {
    const { data: envs, error: readErr } = await admin
      .from("environments")
      .select("id, name, description, background_image_url")
    note("environments read", readErr)

    const doomed = (envs || []).filter((e) => !isCuratedEnvironment(e as EnvironmentRow))
    if (doomed.length) {
      const { error } = await admin
        .from("environments")
        .delete()
        .in("id", doomed.map((e) => e.id))
      note("environments delete", error)
    }
    report.environmentsDeleted = doomed.map((e) => e.name)
    report.environmentsKept = (envs || []).length - doomed.length

    const { error: locErr } = await admin
      .from("environments")
      .update({ updated_at: new Date().toISOString() })
      .eq("name", STARTING_LOCATION)
    note("reset location", locErr)
    report.location = STARTING_LOCATION
  }

  // --- 5b. the travel graph ------------------------------------------------
  // Touching a scene row moves the painting, not the party. Malachar and the
  // maps both read the travel graph, so a restart has to walk the party back
  // to the pen there as well — otherwise the story restarts and the map does
  // not, and the DM narrates a place nobody is standing in.
  {
    const { data: startNode, error: nodeErr } = await admin
      .from("travel_nodes")
      .select("id")
      .eq("node_key", STARTING_NODE_KEY)
      .maybeSingle()
    note("travel node read", nodeErr)

    if (startNode?.id) {
      const { data: runs } = await admin
        .from("campaign_runs")
        .select("id")
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(1)
      const runId = runs?.[0]?.id
      if (runId) {
        const { error: posErr } = await admin
          .from("party_position")
          .upsert(
            { campaign_run_id: runId, node_id: startNode.id, node_type: "location", updated_at: new Date().toISOString() },
            { onConflict: "campaign_run_id" },
          )
        note("party position reset", posErr)
        report.partyNode = STARTING_NODE_KEY

        const { error: fogErr } = await admin.rpc("subnodal_reset_to_start", {
          p_slug: STARTING_SUBNODAL_MAP,
          p_node: STARTING_SUBNODAL_NODE,
          p_run_id: runId,
        })
        note("subnodal fog reset", fogErr)
        report.subnodalFogReset = !fogErr
      }
    }
  }

  // --- 10. the tactical board ---------------------------------------------
  // Sending the party home in the fiction while their tokens stand in the room
  // they escaped to leaves Malachar reading exact distances for a fight that no
  // longer exists — and he trusts those numbers over his own narration by
  // design. So the board follows the reset: the map belonging to
  // STARTING_LOCATION becomes the active one, and every other map is stood
  // down.
  //
  // Tokens are NOT deleted. They carry positions a DM arranged by hand, which
  // are expensive to rebuild and are canon for the opening scene; the party
  // simply returns to them. If a restart should also scatter the pieces, that
  // is a separate ruling and a separate change.
  {
    const { data: startEnv } = await admin
      .from("environments")
      .select("id")
      .eq("name", STARTING_LOCATION)
      .maybeSingle()
    const { data: startMap } = startEnv?.id
      ? await admin
          .from("vtt_maps")
          .select("id, name")
          .eq("environment_id", startEnv.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null }

    if (startMap?.id) {
      const { error: onErr } = await admin
        .from("vtt_maps")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", startMap.id)
      note("activate starting map", onErr)
      const { error: offErr } = await admin
        .from("vtt_maps")
        .update({ is_active: false })
        .neq("id", startMap.id)
      note("deactivate other maps", offErr)
      report.tacticalMap = startMap.name
    } else {
      // No board for the starting room is entirely normal — the game ran on
      // prose for months. Recorded, not treated as a failure.
      report.tacticalMap = null
    }
  }

  console.log("[restart] complete:", JSON.stringify(report))

  return Response.json(
    { ok: problems.length === 0, report, problems },
    { status: 200 },
  )
}
