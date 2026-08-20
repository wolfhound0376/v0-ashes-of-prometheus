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
    .select("id, name")
    .eq("is_player", true)
  note("characters read", playersErr)

  const playerIds = (players || []).map((p) => p.id)

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

  console.log("[restart] complete:", JSON.stringify(report))

  return Response.json(
    { ok: problems.length === 0, report, problems },
    { status: 200 },
  )
}
