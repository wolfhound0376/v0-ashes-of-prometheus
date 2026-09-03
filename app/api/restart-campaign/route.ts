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
//   - vtt_tokens ROWS. The opening tableau (party at the back of the pen,
//     prisoner NPCs between them and the gates) is canon and hand-placed, so
//     the board is re-pointed at the starting node's map (step 5c) rather than
//     having the tokens swept and rebuilt. Their HP is healed (step 5e), they
//     are made visible again (5f); their SQUARES are not — see the gap below.
//     SUMMONED tokens are the one exception and ARE deleted (5f): a conjured
//     creature is not canon, it is a leftover of a spell that no longer
//     happened.
//   - Ground items nobody dropped. Placed loot is canon; see 5f.
//   - Character rows, stats, XP and levels.
//
// KNOWN GAP, stated rather than implied
//   Nothing returns the party's tokens to their opening squares. This comment
//   used to say "the party simply returns to it", which was never true — no
//   code wrote grid_x/grid_y, so after a restart the party stands wherever the
//   last fight left them, on the starting map. Putting that right means
//   knowing the canonical tableau, which lives in nobody's table yet.
//
//   NOT a gap, though it was reported as one: the SUBNODAL FOG. Step 5b calls
//   subnodal_reset_to_start and it works — verified live on 2026-09-02, which
//   left exactly three rows (the pen explored, its two neighbours sighted).
//   The tactical board's DARKNESS is a client-side toggle with no row behind
//   it and nothing to reset. If "fog" is still visible after a restart it is
//   one of those two, and neither is campaign state.
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

/**
 * The shape the cast handler writes into `characters.sheet_spellcasting`.
 * Deliberately loose: the object also carries ability, DC, attack bonus and
 * known spells, and this route must hand every one of those back untouched.
 */
type SheetSpellcasting = {
  slots?: Record<string, { max?: number; used?: number } | null> | null
  [key: string]: unknown
}

/**
 * Every slot back. Returns the rebuilt `slots` map and how many were handed
 * back, so the restart's report can say it rather than the DM having to open
 * a sheet and count.
 *
 * Zeroes `used` rather than rebuilding from `max`, because `max` is the
 * character's own progression and this route has no business deciding what a
 * level-3 wizard's third-level allowance ought to be.
 */
function refillSlots(sc: SheetSpellcasting | null): {
  slots: Record<string, { max?: number; used?: number }>
  restored: number
} {
  const src = sc?.slots ?? {}
  const slots: Record<string, { max?: number; used?: number }> = {}
  let restored = 0
  for (const [level, entry] of Object.entries(src)) {
    if (!entry) continue
    restored += entry.used ?? 0
    slots[level] = { ...entry, used: 0 }
  }
  return { slots, restored }
}

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
    .select("id, name, hp_max, sheet_spellcasting")
    .eq("is_player", true)
  note("characters read", playersErr)

  const playerIds = (players || []).map((p) => p.id)

  // --- 4a. player wounds AND everything else they spent --------------------
  // RESET, NOT DELETE — the same mercy the NPCs get in step 3. A restart is a
  // fresh start: hp_current returns to hp_max and lingering conditions clear.
  // (Added 2026-08-20: this section didn't exist, so Scott carried 0/9 HP
  // through every restart since the day he first went down.)
  //
  // 2026-09-02: hit points were the ONLY thing this healed, and hit points are
  // the one resource a party can also get back by resting. Everything a
  // caster had actually spent survived the restart:
  //
  //   - sheet_spellcasting.slots[*].used is only ever INCREMENTED, by the cast
  //     handler. Nothing in the codebase decremented it, so a sorcerer who
  //     emptied himself in the pen woke up after a restart at full health with
  //     no spells, permanently, for the life of the row.
  //   - sheet_hp_temp is a shield somebody put on him three fights ago.
  //   - sheet_heroic_inspiration is a gift the DM gave in a session that no
  //     longer happened.
  //
  // A restart is the campaign not having happened yet. Anything the campaign
  // consumed has to come back with it.
  {
    let healed = 0
    let slotsRestored = 0
    for (const p of players || []) {
      const sc = (p.sheet_spellcasting ?? null) as SheetSpellcasting | null
      const { slots, restored } = refillSlots(sc)
      slotsRestored += restored

      const { error } = await admin
        .from("characters")
        .update({
          hp_current: p.hp_max,
          conditions: [],
          // The whole object back, with only `used` zeroed. Writing just
          // `{slots}` would drop the caster's ability, DC, known spells and
          // everything else the sheet keeps in there.
          ...(sc ? { sheet_spellcasting: { ...sc, slots } } : {}),
          sheet_hp_temp: 0,
          sheet_heroic_inspiration: false,
          updated_at: new Date().toISOString(),
        })
        .eq("id", p.id)
      if (error) note(`player reset ${p.id}`, error)
      else healed += 1
    }
    report.playersHealed = healed
    report.spellSlotsRestored = slotsRestored
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

  // --- 5c. the tactical board ---------------------------------------------
  // 5b walks the party home on the travel graph; the board has to follow, or
  // Malachar reads exact distances for the room they escaped to. is_active is
  // the flag the board falls back on, so point it at the starting node's map.
  //
  // Tokens are NOT deleted. The opening tableau — party at the back of the pen,
  // the prisoner NPCs between them and the gates — is canon and hand-placed,
  // so it is left standing. Their squares are NOT restored; see the known gap
  // at the top of this file.
  {
    const { data: startNode } = await admin
      .from("travel_nodes")
      .select("id")
      .eq("node_key", STARTING_NODE_KEY)
      .maybeSingle()
    let startMapId: string | null = null
    if (startNode?.id) {
      const { data: child } = await admin
        .from("travel_nodes")
        .select("vtt_map_id")
        .eq("parent_id", startNode.id)
        .eq("node_type", "tactical_map")
        .not("vtt_map_id", "is", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      startMapId = (child?.vtt_map_id as string | null) ?? null
    }
    if (startMapId) {
      const { error: onErr } = await admin
        .from("vtt_maps")
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq("id", startMapId)
      note("activate starting board", onErr)
      const { error: offErr } = await admin.from("vtt_maps").update({ is_active: false }).neq("id", startMapId)
      note("stand down other boards", offErr)
      const { count } = await admin
        .from("vtt_tokens")
        .select("id", { count: "exact", head: true })
        .eq("map_id", startMapId)
      report.tacticalTokensWaiting = count ?? 0
    } else {
      // No board for the starting node is entirely normal — the game ran on
      // prose for months. Recorded, never treated as a failure.
      report.tacticalTokensWaiting = null
    }
  }

  // --- 5d. the fight that is still going on --------------------------------
  // `combat_state` survived every restart. Its status stayed 'active', so the
  // board came back into a campaign that had not happened yet and announced
  // round 6, with a turn order of tokens from a dead map and an initiative
  // roll nobody at the table had made. Only `action:"end"` ever wrote that
  // column, and a restart is not an end-of-combat.
  //
  // Ended, not deleted: the row is the record of a fight, and the same
  // instinct that keeps npc_encounters keeps this.
  {
    const { count, error } = await admin
      .from("combat_state")
      .update({ status: "ended", updated_at: new Date().toISOString() }, { count: "exact" })
      // `.neq` alone would skip a null status, and null is not ended.
      .or("status.is.null,status.neq.ended")
    note("stand down combat", error)
    report.combatsEnded = count ?? 0
  }

  // --- 5e. the corpses on the board ----------------------------------------
  // vtt_tokens.hp_current is a SECOND copy of the same fact the sheet holds,
  // and step 4a only healed the sheet. So the board showed a body face-down on
  // the flagstones whose card, two inches to the left, read 9/9 — and the
  // combat route, which reads the TOKEN, went on refusing to let it act.
  //
  // This is the desync scripts/sql/reset-token-hp-from-sheets.sql was written
  // to repair by hand. A restart should not need a DBA.
  //
  // Party tokens are healed from their sheet, which is authoritative for a
  // player. Everything else goes to its own hp_max, which is what step 3 gave
  // the NPC rows.
  {
    const { data: tokens, error: readErr } = await admin
      .from("vtt_tokens")
      .select("id, character_id, hp_current, hp_max")
      .not("hp_current", "is", null)
    note("tokens read", readErr)

    const sheetHp = new Map((players || []).map((p) => [p.id, p.hp_max as number | null]))
    let revived = 0
    for (const t of tokens || []) {
      const full = (t.character_id ? sheetHp.get(t.character_id) : null) ?? t.hp_max
      if (full == null || t.hp_current === full) continue
      const { error } = await admin
        .from("vtt_tokens")
        .update({ hp_current: full, updated_by: "restart", updated_at: new Date().toISOString() })
        .eq("id", t.id)
      if (error) note(`token hp ${t.id}`, error)
      else revived += 1
    }
    report.tokensRevived = revived
  }

  // --- 5f. the state of the room itself ------------------------------------
  // Sam, 2026-09-02: "Reset also needs to reset board state, right now there
  // is still blood and fog."
  //
  // Steps 4a/5e healed the PEOPLE. Nothing had ever touched the ROOM. A
  // restarted campaign opened on a floor that still had six pools of blood on
  // it, a Mage Hand from a spell nobody had cast standing in the middle of the
  // pen, and a Hook Horror the DM had hidden three days earlier still hidden.
  //
  // What is deliberately NOT washed:
  //   - tint_color. The only tinted token today is the summon, which is
  //     deleted outright below. A tint on a real token is a DM's own labelling
  //     and this route has no business guessing which.
  //   - Ground items that nobody dropped. Both live rows are seeded canon
  //     (identical created_at, null dropped_by) — placed loot, not litter. Only
  //     what a character dropped is swept; the rest is merely un-picked-up.
  {
    // Wash the blood. lib/blood-marks keeps it in vtt_maps.meta.marks.
    //
    // The key is REMOVED rather than set to [], and meta is spread rather than
    // replaced, because that same jsonb also carries node, art_url, cells_url
    // and px_per_square. Writing `{ marks: [] }` over it would take the map's
    // artwork off the board — the mirror of layBlood()'s `{ ...meta, marks }`.
    const { data: maps, error: mapsErr } = await admin.from("vtt_maps").select("id, meta")
    note("maps read", mapsErr)

    let washed = 0
    let marksRemoved = 0
    for (const m of maps || []) {
      const meta = (m.meta as Record<string, unknown> | null) ?? {}
      if (!("marks" in meta)) continue
      marksRemoved += Array.isArray(meta.marks) ? meta.marks.length : 0
      const { marks: _dropped, ...rest } = meta
      const { error } = await admin.from("vtt_maps").update({ meta: rest }).eq("id", m.id)
      if (error) note(`wash map ${m.id}`, error)
      else washed += 1
    }
    report.mapsWashed = washed
    report.bloodMarksRemoved = marksRemoved
  }

  {
    // Conjurations. A summoned creature is not canon — it was created at
    // runtime by a spell in a campaign that no longer happened, and unlike
    // every other token on the board there is no hand-placed tableau to
    // preserve. So this is the one place the board is DELETED from.
    //
    // Today's row is a Mage Hand carrying expires_round: 11 from a fight that
    // ended long ago: the token outlived not just its duration but its combat.
    const { count, error } = await admin
      .from("vtt_tokens")
      .delete({ count: "exact" })
      .not("summon", "is", null)
    note("dismiss summons", error)
    report.summonsDismissed = count ?? 0
  }

  {
    // Everything the board can hide a token behind. is_visible is the DM's
    // curtain and is_hidden is the rogue's; ward is a spell effect riding on
    // the token. All three are things the campaign did, so all three go.
    //
    // Read first and pick the rows here rather than sending a three-column
    // .or() with a not.is.null in it. A filter that is subtly wrong does not
    // error — it matches nothing and reports success, which is the exact
    // failure mode described at the top of this file for the RLS deletes.
    // Steps 3 and 5e already work this way; so does this.
    const { data: dressed, error: readErr } = await admin
      .from("vtt_tokens")
      .select("id, is_visible, is_hidden, ward")
    note("tokens read for reveal", readErr)

    let revealed = 0
    for (const t of dressed || []) {
      if (t.is_visible !== false && t.is_hidden !== true && t.ward == null) continue
      const { error } = await admin
        .from("vtt_tokens")
        .update({
          is_visible: true,
          is_hidden: false,
          ward: null,
          updated_by: "restart",
          updated_at: new Date().toISOString(),
        })
        .eq("id", t.id)
      if (error) note(`reveal token ${t.id}`, error)
      else revealed += 1
    }
    report.tokensRevealed = revealed
  }

  {
    // Loot on the flagstones. What a character dropped during the campaign is
    // swept; what was placed there as canon is merely made un-picked-up again,
    // so a restarted party can find it exactly as the first one did.
    const { count: sweptCount, error: sweepErr } = await admin
      .from("vtt_ground_items")
      .delete({ count: "exact" })
      .not("dropped_by", "is", null)
    note("sweep dropped loot", sweepErr)
    report.groundItemsSwept = sweptCount ?? 0

    const { count: restoredCount, error: restoreErr } = await admin
      .from("vtt_ground_items")
      .update({ picked_up_by: null, picked_up_at: null, updated_at: new Date().toISOString() }, { count: "exact" })
      .not("picked_up_at", "is", null)
    note("restore placed loot", restoreErr)
    report.groundItemsRestored = restoredCount ?? 0
  }

  {
    // The NPCs' conditions. Step 3 clears these on `npc_encounters`, and step
    // 4a clears them on players — but a monster or ally that lives in
    // `characters` with is_player=false was covered by neither, so Ront has
    // been lying Prone across every restart since somebody knocked him down.
    //
    // This clears Stool's "Rapport" too. If that spore-link is meant to be
    // true from the first minute rather than something the party earns, it is
    // one UPDATE to put back — flagged rather than assumed.
    // Read-then-write for the same reason as the block above: `.neq` against a
    // jsonb literal is a filter that fails quietly, and a null `conditions`
    // would be excluded by it anyway.
    const { data: npcRows, error: readErr } = await admin
      .from("characters")
      .select("id, name, conditions")
      .eq("is_player", false)
    note("npc characters read", readErr)

    const dirty = (npcRows || []).filter(
      (c) => Array.isArray(c.conditions) && (c.conditions as unknown[]).length > 0,
    )
    let cleared = 0
    for (const c of dirty) {
      const { error } = await admin
        .from("characters")
        .update({ conditions: [], updated_at: new Date().toISOString() })
        .eq("id", c.id)
      if (error) note(`npc conditions ${c.id}`, error)
      else cleared += 1
    }
    report.npcConditionsCleared = cleared
    // Named, not just counted: this is the one step that can quietly undo a
    // condition the DM meant to be permanent, so the report says whose.
    report.npcConditionsClearedFrom = dirty.map((c) => c.name)
  }

  console.log("[restart] complete:", JSON.stringify(report))

  return Response.json(
    { ok: problems.length === 0, report, problems },
    { status: 200 },
  )
}
