import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { walkableFrom, key as cellKey } from "@/lib/npc-ai"
import {
  spawnPayload, freeSquare, squaresFor, sideForRole, type SpawnSource, type Allegiance,
} from "@/lib/sandbox-spawn"

// ============================================================================
// /api/sandbox — the rehearsal room's stage door.
//
//   GET            → the roster: every creature, NPC, character and
//                    environment that can be put on the rehearsal board, plus
//                    what is standing on it now.
//   POST {action}  → "spawn"  put one of them on a square
//                    "remove" take one off
//                    "clear"  sweep everything this route ever put there
//                    "scene"  change which environment the board is dressed as
//
// THE FENCE, WHICH IS THE WHOLE POINT
//
// This route NEVER accepts a map id. It resolves the map itself, every time,
// with `.eq("is_sandbox", true)`, and every write is additionally filtered on
// that same id. There is no parameter, header or body field that can aim it at
// the live board — not a wrong one, not a malicious one, not a copy-pasted
// curl from a debugging session six months from now.
//
// That is deliberate and it is worth the repetition in the code below. A
// sandbox whose blast radius is "wherever the client said" is not a sandbox;
// it is the live board with a friendlier name. Sam is going to click 'clear'
// in this thing without reading the button twice, and he should be able to.
//
// It is also why this route is NOT DM-gated. It cannot damage anything that
// matters, and putting the rehearsal room behind the DM key would mean the
// one person who most needs to try a monster out — whoever is holding the
// laptop — has to go and find a password first.
// ============================================================================

export const dynamic = "force-dynamic"

/** Sweeping only ever removes rows this route stamped. */
const STAMP = "sandbox-spawn"

/**
 * The sandbox map, or null.
 *
 * Null is a real answer: a database with no `is_sandbox` row has no rehearsal
 * board, and the honest response is to say so rather than quietly falling back
 * to the active map — which is precisely the fallback that would turn this
 * file into a loaded gun.
 */
async function sandboxMap(db: ReturnType<typeof createAdminClient>) {
  const { data } = await db
    .from("vtt_maps")
    .select("id,name,grid_width,grid_height,environment_id,meta")
    .eq("is_sandbox", true)
    .limit(1)
    .maybeSingle()
  return data ?? null
}

const NO_ROOM = "no room on the board — clear something first"

export async function GET() {
  const db = createAdminClient()
  const map = await sandboxMap(db)
  if (!map) return NextResponse.json({ error: "no sandbox map" }, { status: 409 })

  // Four catalogues in parallel. The roster is the whole point of the drawer
  // and it is read on every open, so it is one round trip, not four.
  const [creatures, npcs, chars, envs, tokens] = await Promise.all([
    db.from("bestiary")
      .select("id,name,slug,size,cr,hp,ac,role,model_url,model_scale")
      .order("name"),
    db.from("npc_encounters")
      .select("id,character_id,name,hp_max,ac,challenge_rating,monster_type,portrait_url,disposition,bestiary_id")
      .order("name"),
    db.from("characters")
      .select("id,name,class,level,size,hp_max,ac,character_type,avatar_image_url")
      .is("archived_at", null)
      .order("name"),
    db.from("environments")
      .select("id,name,scene_key,time_of_day,background_image_url")
      .order("name"),
    db.from("vtt_tokens")
      .select("id,label,grid_x,grid_y,token_size,allegiance,hp_current,hp_max,updated_by,character_id,bestiary_id")
      .eq("map_id", map.id)
      .order("label"),
  ])

  return NextResponse.json({
    map: {
      id: map.id, name: map.name,
      grid_width: map.grid_width, grid_height: map.grid_height,
      environment_id: map.environment_id,
    },
    bestiary: creatures.data ?? [],
    npcs: npcs.data ?? [],
    characters: chars.data ?? [],
    environments: envs.data ?? [],
    tokens: tokens.data ?? [],
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = body?.action
  const VERBS = ["spawn", "remove", "clear", "scene"]
  if (!VERBS.includes(action)) {
    return NextResponse.json(
      { error: `unknown action ${String(action)} — expected one of ${VERBS.join(", ")}` },
      { status: 400 },
    )
  }

  const db = createAdminClient()
  const map = await sandboxMap(db)
  if (!map) return NextResponse.json({ error: "no sandbox map" }, { status: 409 })

  // ---- clear ---------------------------------------------------------------
  if (action === "clear") {
    // ONLY the rows this route stamped. The sandbox map was seeded by hand
    // with eight tokens long before this file existed, and a sweep that ate
    // them would quietly destroy somebody's setup with no way back — the one
    // irreversible thing a rehearsal room could still do to you.
    const { error, count } = await db
      .from("vtt_tokens")
      .delete({ count: "exact" })
      .eq("map_id", map.id)
      .eq("updated_by", STAMP)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, removed: count ?? 0 })
  }

  // ---- remove --------------------------------------------------------------
  if (action === "remove") {
    const id = String(body?.token_id ?? "")
    if (!id) return NextResponse.json({ error: "token_id required" }, { status: 400 })
    // Filtered on the sandbox map as well as the id: a token id from the live
    // board simply matches nothing.
    const { error } = await db.from("vtt_tokens").delete().eq("id", id).eq("map_id", map.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // ---- scene ---------------------------------------------------------------
  if (action === "scene") {
    // Null is legal and means "no dressing" — the board falls back to its own
    // default, which is how the sandbox map has looked until now.
    const envId = body?.environment_id ? String(body.environment_id) : null
    if (envId) {
      const { data: env } = await db.from("environments").select("id").eq("id", envId).maybeSingle()
      if (!env) return NextResponse.json({ error: "no such environment" }, { status: 404 })
    }
    const { error } = await db
      .from("vtt_maps")
      .update({ environment_id: envId, updated_at: new Date().toISOString() })
      .eq("id", map.id)
      .eq("is_sandbox", true)   // belt and braces: the fence again, on the write
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, environment_id: envId })
  }

  // ---- spawn ---------------------------------------------------------------
  const kind = String(body?.kind ?? "")
  const sourceId = String(body?.source_id ?? "")
  if (!["bestiary", "npc", "character"].includes(kind) || !sourceId) {
    return NextResponse.json({ error: "kind (bestiary|npc|character) and source_id required" }, { status: 400 })
  }

  // Look the row up rather than trusting what the client said it was. The
  // client sends an id; everything else — name, size, hit points — comes from
  // the catalogue, so a spawned drow is the drow the bestiary describes and
  // not a drow somebody typed into a POST body.
  let src: SpawnSource | null = null
  let catalogueScale: number | null = null
  let speciesId: string | null = null

  if (kind === "bestiary") {
    const { data } = await db.from("bestiary")
      .select("id,name,size,hp,role,model_scale").eq("id", sourceId).maybeSingle()
    if (data) {
      src = {
        kind: "bestiary", id: data.id, label: data.name, size: data.size, hpMax: data.hp,
        // 18 of the 43 rows here are "ally/prisoner" — this bestiary holds
        // the whole Velkynvelve cast, not just its monsters.
        allegiance: sideForRole(data.role),
      }
      catalogueScale = data.model_scale
    }
  } else if (kind === "character") {
    const { data } = await db.from("characters")
      .select("id,name,size,hp_max,character_type").eq("id", sourceId).maybeSingle()
    if (data) {
      src = {
        kind: "character", id: data.id, label: data.name, size: data.size, hpMax: data.hp_max,
        // Only an actual PC is on the party's side; a character row of type
        // npc or monster is not, and the roster contains all three.
        allegiance: data.character_type === "player" ? "party" : null,
      }
    }
  } else {
    const { data } = await db.from("npc_encounters")
      .select("id,character_id,name,hp_max,disposition,bestiary_id").eq("id", sourceId).maybeSingle()
    if (data) {
      // An NPC token points at whatever the NPC actually IS — its character
      // row if it has one, its bestiary species otherwise. That is what makes
      // the board find its portrait, its voice and its model, and it is why
      // this branch cannot just insert a label.
      speciesId = data.bestiary_id ?? null
      src = {
        kind: data.character_id ? "character" : "bestiary",
        id: data.character_id ?? data.bestiary_id ?? "",
        label: data.name,
        hpMax: data.hp_max,
        // Every npc_encounters row has a null disposition today, so this
        // almost always falls through to the species role below. Reading the
        // column anyway costs nothing and means the day somebody fills it in,
        // it is believed.
        allegiance: dispositionSide(data.disposition),
      }
      if (!src.id) src = null   // an NPC bound to neither is not placeable
    }
  }
  if (!src) {
    // The one NPC this reaches is Malachar, who is bound to neither a
    // character nor a species. He is the Dungeon Master; he does not stand
    // on a square. Say which of the two it is rather than "no such creature",
    // because the row is plainly there in the list you just clicked.
    return NextResponse.json(
      { error: "that one has no character or species to stand in for it" },
      { status: 404 },
    )
  }

  // An explicit side always wins. "What if the drow were on our side" is the
  // sort of question a rehearsal room exists to answer, so the drawer can set
  // one - but only to a word the board understands.
  const asked = String(body?.allegiance ?? "")
  if (asked) {
    if (!["party", "ally", "hostile"].includes(asked)) {
      return NextResponse.json({ error: "allegiance must be party, ally or hostile" }, { status: 400 })
    }
    src.allegiance = asked as Allegiance
  }

  // Size for an NPC comes from its species, since npc_encounters has no size
  // column of its own.
  if (speciesId) {
    const { data } = await db.from("bestiary").select("size,role,model_scale").eq("id", speciesId).maybeSingle()
    if (data) {
      // npc_encounters has no size column of its own, and no usable
      // disposition, so the species row answers both.
      if (!src.size) src.size = data.size
      if (!src.allegiance) src.allegiance = sideForRole(data.role)
      catalogueScale = data.model_scale
    }
  }

  const width = map.grid_width ?? 12
  const height = map.grid_height ?? 12

  // What is already standing there, and what is not floor. Same source of
  // truth the NPC turn uses, so the sandbox cannot place a creature somewhere
  // the live rules would say it cannot stand.
  const { data: standing } = await db
    .from("vtt_tokens").select("grid_x,grid_y").eq("map_id", map.id)
  const occupied = (standing ?? []).map((t) => ({ x: t.grid_x, y: t.grid_y }))

  const blocked: { x: number; y: number }[] = []
  const cellsUrl = (map.meta as { cells_url?: string } | null)?.cells_url
  if (cellsUrl) {
    try {
      const res = await fetch(cellsUrl, { cache: "no-store" })
      if (res.ok) {
        const walkable = walkableFrom((await res.json())?.cells)
        if (walkable.size > 0) {
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) if (!walkable.has(cellKey(x, y))) blocked.push({ x, y })
          }
        }
      }
    } catch {
      // No cell geometry, no walls. An open rectangle is the same fallback
      // /api/combat takes, and being able to place a creature on a rock beats
      // a drawer that refuses to place anything at all.
    }
  }

  const want = {
    x: clamp(Number(body?.grid_x ?? Math.floor(width / 2)), 0, width - 1),
    y: clamp(Number(body?.grid_y ?? Math.floor(height / 2)), 0, height - 1),
  }
  const at = freeSquare({
    want, occupied, blocked, gridWidth: width, gridHeight: height,
    squares: squaresFor(src.size),
  })
  if (!at) return NextResponse.json({ error: NO_ROOM }, { status: 409 })

  const payload = { ...spawnPayload(src, at, { catalogueScale }), map_id: map.id }
  const { data: made, error } = await db.from("vtt_tokens").insert(payload).select("id").single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The board is not told about this. It is already subscribed to
  // vtt_tokens on this map and will glide the new row in by itself, which is
  // why this whole feature needs no change to the board file.
  return NextResponse.json({ ok: true, token_id: made?.id, grid_x: at.x, grid_y: at.y })
}

/**
 * An NPC's story disposition, in the board's three words, or null.
 *
 * NULL IS THE IMPORTANT RETURN. Every npc_encounters row has a null
 * disposition, and the first cut mapped that to "ally" - which put Ilvara
 * Mizzrym and the hook horror on the party's side. An unset column is not a
 * statement that something is friendly; it is the absence of a statement, and
 * it has to fall through to the species role rather than answer.
 */
function dispositionSide(d: string | null | undefined): Allegiance | null {
  const s = (d ?? "").trim().toLowerCase()
  if (!s) return null
  if (s === "hostile" || s === "enemy" || s === "foe") return "hostile"
  if (s === "party") return "party"
  if (s === "ally" || s === "friendly" || s === "prisoner") return "ally"
  return null
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo
}
