// Scattering the scenery, and writing it down.
//
// The piece that was missing. `lib/map-props.ts` has decided what a room
// should wear since PR #537, and `components/tactical/map-prop-decor.ts` has
// known how to draw it since PR #539 — but nothing ever wrote a row, so the
// board read an empty `map_prop_placements` and every map came up bare. This
// route is the hinge between the two: it runs the scatter server-side and
// persists the result.
//
//   GET  ?mapId=…|?sandbox=1   → what is currently placed on that map
//   POST {biome:"cave"}        → re-scatter it (DM only)
//
// WHY SERVER-SIDE AND NOT IN THE BOARD. The scatter is seeded and pure, so in
// principle every client could roll it and agree. In practice they would not:
// the catalogue is read with `status='wired'`, and the moment one prop is
// added or retired, two browsers on different cache states draw different
// rooms and argue about cover. Rows are the single source of truth, and the
// board already reads them that way (see combat-board-3d: "placed rows, not a
// per-client roll, so every seat at the table draws the same room").
//
// WHAT A RE-SCATTER DOES NOT TOUCH. `placed_by` separates the random draw
// from the DM's own hand: this route deletes and rewrites `placed_by='random'`
// rows only. A stalagmite the DM dropped on a specific square to make cover
// for an ambush survives every re-roll. That is the whole reason the column
// has a value other than 'random' in it.
//
// TRAPS CANNOT ARRIVE HERE. `scatter()` draws from `eligible()`, which keeps
// only `spawn_weight > 0`, and every trap row is weight 0. That is structural,
// not a filter this route applies — worth stating because "the random scatter
// put a trap in the corridor" would be a real bug and it cannot happen.
import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { scatter, seedFrom, type MapProp, type PropPlacement } from "@/lib/map-props"
import { scatterMapFrom, type NodeCells } from "@/lib/map-prop-scatter-input"

type Db = ReturnType<typeof createAdminClient>

/** The same gate /api/combat and /api/ground-items keep. */
function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

interface MapRow {
  id: string
  name: string | null
  terrain: { cells_url?: string; biome?: string } | null
}

async function resolveMap(db: Db, mapId: string | null, sandbox: boolean): Promise<MapRow | null> {
  const q = db.from("vtt_maps").select("id,name,terrain")
  const { data } = mapId
    ? await q.eq("id", mapId).maybeSingle()
    : await q.eq(sandbox ? "is_sandbox" : "is_active", true).limit(1).maybeSingle()
  return (data as MapRow | null) ?? null
}

/**
 * The room's geometry, which lives in Storage rather than on the row.
 *
 * `vtt_maps.terrain.walkable_cells` is a COUNT, not a list — the cells
 * themselves are in `vtt-assets/node-maps/v5/node-NN.json`, linked by
 * `cells_url`. A map without one cannot be scattered, and says so rather than
 * silently scattering nothing.
 */
async function nodeCells(url: string): Promise<NodeCells> {
  const res = await fetch(url, { cache: "no-store" })
  if (!res.ok) throw new Error(`cells_url ${res.status}`)
  return (await res.json()) as NodeCells
}

export async function GET(req: NextRequest) {
  const db = createAdminClient()
  const map = await resolveMap(
    db,
    req.nextUrl.searchParams.get("mapId"),
    req.nextUrl.searchParams.get("sandbox") === "1",
  )
  if (!map) return NextResponse.json({ error: "no map" }, { status: 404 })

  const { data } = await db
    .from("map_prop_placements")
    .select("prop_slug,grid_x,grid_y,rotation,flip_x,placed_by,seed")
    .eq("map_kind", "vtt")
    .eq("map_id", map.id)

  const rows = data ?? []
  return NextResponse.json({
    map: { id: map.id, name: map.name },
    total: rows.length,
    random: rows.filter((r) => r.placed_by === "random").length,
    byHand: rows.filter((r) => r.placed_by !== "random").length,
    placements: rows,
  })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as {
    mapId?: string
    sandbox?: boolean
    biome?: string
    density?: number
    limit?: number
    seed?: number
    dryRun?: boolean
  }

  const db = createAdminClient()
  const map = await resolveMap(db, body.mapId ?? null, body.sandbox === true)
  if (!map) return NextResponse.json({ error: "no map" }, { status: 404 })

  // The biome decides the whole draw, and nothing on `vtt_maps` records one
  // yet, so it is the caller's to state. Falling back to a guess from the map
  // name would quietly dress a drow outpost in fungal forest.
  const biome = (body.biome ?? map.terrain?.biome ?? "").trim()
  if (!biome) {
    return NextResponse.json(
      { error: "biome required", hint: "e.g. velkynvelve, cave, drow_outpost, water, fungal_forest" },
      { status: 400 },
    )
  }

  const cellsUrl = map.terrain?.cells_url
  if (!cellsUrl) {
    return NextResponse.json(
      { error: "map has no cells_url", hint: "only V5 node maps carry cell geometry" },
      { status: 422 },
    )
  }

  let node: NodeCells
  try {
    node = await nodeCells(cellsUrl)
  } catch (e) {
    return NextResponse.json({ error: `could not read cell geometry: ${String(e)}` }, { status: 502 })
  }

  // Everything already standing on the board. Scenery under a token would be
  // drawn and then covered, and worse, would claim cover the token is using.
  const { data: tokens } = await db
    .from("vtt_tokens")
    .select("grid_x,grid_y")
    .eq("map_id", map.id)

  const occupied = (tokens ?? [])
    .filter((t) => Number.isInteger(t.grid_x) && Number.isInteger(t.grid_y))
    .map((t) => [t.grid_x, t.grid_y] as [number, number])

  const scatterMap = scatterMapFrom(node, { occupied })
  if (!scatterMap.floor.length) {
    return NextResponse.json({ error: "no walkable squares in cell geometry" }, { status: 422 })
  }

  const { data: catalog } = await db
    .from("map_props")
    .select(
      "slug,render_class,footprint_w,footprint_h,biomes,blocks_movement,difficult_terrain,spawn_weight,max_per_map,min_spacing",
    )
    .eq("status", "wired")

  const props = (catalog ?? []) as unknown as MapProp[]

  // Seeded off the map id by default, so the same room redraws the same floor
  // tomorrow and a re-roll is a deliberate act (pass a seed to force one).
  const seed = Number.isInteger(body.seed) ? (body.seed as number) : seedFrom(map.id)

  const placements: PropPlacement[] = scatter(props, scatterMap, biome, seed, {
    density: body.density,
    limit: body.limit,
  })

  if (body.dryRun) {
    return NextResponse.json({
      dryRun: true,
      map: { id: map.id, name: map.name },
      biome,
      seed,
      floor: scatterMap.floor.length,
      occupied: scatterMap.occupied?.length ?? 0,
      exits: scatterMap.exits?.length ?? 0,
      eligible: props.filter((p) => p.spawn_weight > 0 && p.biomes.includes(biome)).length,
      placed: placements.length,
      placements,
    })
  }

  // Clear the previous draw, keep the DM's own hand (see the header note).
  const { error: delErr } = await db
    .from("map_prop_placements")
    .delete()
    .eq("map_kind", "vtt")
    .eq("map_id", map.id)
    .eq("placed_by", "random")
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  if (placements.length) {
    const { error: insErr } = await db.from("map_prop_placements").insert(
      placements.map((p) => ({
        map_kind: "vtt",
        map_id: map.id,
        prop_slug: p.prop_slug,
        grid_x: p.grid_x,
        grid_y: p.grid_y,
        rotation: p.rotation,
        flip_x: p.flip_x,
        placed_by: p.placed_by,
        seed: p.seed,
      })),
    )
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  return NextResponse.json({
    map: { id: map.id, name: map.name },
    biome,
    seed,
    floor: scatterMap.floor.length,
    eligible: props.filter((p) => p.spawn_weight > 0 && p.biomes.includes(biome)).length,
    placed: placements.length,
  })
}
