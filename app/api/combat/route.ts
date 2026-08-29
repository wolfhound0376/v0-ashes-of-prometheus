import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"

// /api/combat — initiative, rolled once, openly, on the server.
//
//   GET                → the active combat on the active map (anyone may ask)
//   POST {action}      → DM only (x-dm-key, same gate as /api/travel):
//     "start" → roll d20 + DEX mod for every visible token on the active map
//               and freeze the order. PC mods come from characters.dex_modifier
//               (the sheet's own number); NPC mods derive from bestiary.dex as
//               floor((dex-10)/2). A token with neither rolls flat. Every roll
//               is stored: the strip can show the arithmetic, because this
//               campaign does not do hidden numbers after the fake-table era.
//     "next"  → pass the turn; wrapping the top of the order advances the round
//     "end"   → close the fight
//
// SRD 5.1, "Combat: Initiative": one Dexterity check per combatant, standing
// for the whole fight. Ties: higher DEX modifier first, then the dice again.

export const dynamic = "force-dynamic"

function authorized(req: NextRequest): boolean {
  const required = process.env.DM_ACCESS_CODE
  if (!required) return true
  return safeEquals(normalizeCode(req.headers.get("x-dm-key") ?? ""), normalizeCode(required))
}

const d20 = () => 1 + Math.floor(Math.random() * 20)

export async function GET(req: NextRequest) {
  const db = createAdminClient()
  const sandbox = req.nextUrl.searchParams.get("sandbox") === "1"
  const { data: map } = await db.from("vtt_maps").select("id").eq(sandbox ? "is_sandbox" : "is_active", true).limit(1).maybeSingle()
  if (!map) return NextResponse.json({ combat: null })
  const { data } = await db
    .from("combat_state")
    .select("id,map_id,round,active_index,turn_order,turn_state,status,started_at")
    .eq("map_id", map.id)
    .eq("status", "active")
    .maybeSingle()
  return NextResponse.json({ combat: data ?? null })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const action = body?.action
  // The DM gate applies to the verbs that change the SHAPE of the fight —
  // rolling initiative, passing the turn, ending combat. Marking your own
  // action spent is not one of them.
  if (!["spend", "ack", "move"].includes(action) && !authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  }
  // "spend", "ack" and "move" are the PLAYER's verbs and are deliberately
  // NOT DM-gated below: a player must be able to mark their own bonus action
  // used, acknowledge their own turn, and walk their own character, without
  // the DM clicking for them. "move" is still fenced hard server-side: only
  // the ACTIVE turn's own PC token may walk, only within its speed budget.
  const PLAYER_VERBS = ["spend", "ack", "move"]
  if (!["start", "next", "end", ...PLAYER_VERBS].includes(action)) {
    return NextResponse.json({ error: "expected { action: 'start'|'next'|'end'|'spend'|'ack'|'move' }" }, { status: 400 })
  }
  const db = createAdminClient()
  const sandbox = body?.sandbox === true
  const { data: map } = await db
    .from("vtt_maps").select("id").eq(sandbox ? "is_sandbox" : "is_active", true).limit(1).maybeSingle()
  if (!map) return NextResponse.json({ error: sandbox ? "no sandbox board" : "no active battle map" }, { status: 409 })

  if (action === "start") {
    const { data: existing } = await db
      .from("combat_state").select("id").eq("map_id", map.id).eq("status", "active").maybeSingle()
    if (existing) return NextResponse.json({ error: "combat is already running — end it first" }, { status: 409 })

    const { data: tokens } = await db
      .from("vtt_tokens")
      .select("id,label,character_id,bestiary_id,is_visible")
      .eq("map_id", map.id)
      .eq("is_visible", true)
    if (!tokens?.length) return NextResponse.json({ error: "no tokens on the board" }, { status: 409 })

    // Both DEX sources in two queries, not 2N.
    const charIds = tokens.map((t) => t.character_id).filter(Boolean) as string[]
    const beastIds = tokens.map((t) => t.bestiary_id).filter(Boolean) as string[]
    const [chars, beasts] = await Promise.all([
      charIds.length ? db.from("characters").select("id,dex_modifier").in("id", charIds) : Promise.resolve({ data: [] }),
      beastIds.length ? db.from("bestiary").select("id,dex").in("id", beastIds) : Promise.resolve({ data: [] }),
    ])
    const charMod = new Map((chars.data ?? []).map((c: { id: string; dex_modifier: number | null }) => [c.id, c.dex_modifier ?? 0]))
    const beastMod = new Map((beasts.data ?? []).map((b: { id: string; dex: number | null }) => [b.id, Math.floor(((b.dex ?? 10) - 10) / 2)]))

    const order = tokens
      .map((t) => {
        const dex_mod = t.character_id
          ? charMod.get(t.character_id) ?? 0
          : t.bestiary_id
            ? beastMod.get(t.bestiary_id) ?? 0
            : 0
        const roll = d20()
        return {
          token_id: t.id,
          label: t.label,
          kind: t.character_id ? "pc" : "npc",
          dex_mod,
          roll,
          total: roll + dex_mod,
        }
      })
      // SRD tie-breaking: total, then DEX mod, then a fresh die.
      .sort((a, b) => b.total - a.total || b.dex_mod - a.dex_mod || d20() - d20())

    const { data: row, error } = await db
      .from("combat_state")
      .insert({ map_id: map.id, turn_order: order })
      .select("id,round,active_index,turn_order,status")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, combat: row })
  }

  const { data: combat } = await db
    .from("combat_state")
    .select("id,round,active_index,turn_order,turn_state")
    .eq("map_id", map.id)
    .eq("status", "active")
    .maybeSingle()
  if (!combat) return NextResponse.json({ error: "no combat running" }, { status: 409 })

  if (action === "move") {
    // The player's walk. The client computed a real path over walkable
    // squares; the server re-checks everything it can see without the cell
    // geometry: right token, PC token, board bounds, and the speed budget.
    // Chebyshev distance is a floor on any true path cost, so a client
    // understating "feet" to stretch its budget is caught here too. The
    // anti-stacking DB trigger relocates a contested square regardless.
    const token_id = String(body?.token_id ?? "")
    const gx = Number(body?.gx)
    const gy = Number(body?.gy)
    const feet = Number(body?.feet)
    const order = combat.turn_order as { token_id: string; kind: string }[]
    const entry = order[combat.active_index]
    if (!entry || entry.token_id !== token_id) {
      return NextResponse.json({ error: "not this combatant's turn" }, { status: 409 })
    }
    if (entry.kind !== "pc") {
      return NextResponse.json({ error: "NPC movement is not a player verb" }, { status: 403 })
    }
    const { data: token } = await db
      .from("vtt_tokens").select("id,grid_x,grid_y,character_id").eq("id", token_id).maybeSingle()
    const { data: dims } = await db
      .from("vtt_maps").select("grid_width,grid_height").eq("id", map.id).maybeSingle()
    if (!token || !dims) return NextResponse.json({ error: "token or map missing" }, { status: 409 })
    if (!Number.isInteger(gx) || !Number.isInteger(gy) || gx < 0 || gy < 0 || gx >= dims.grid_width || gy >= dims.grid_height) {
      return NextResponse.json({ error: "destination off the board" }, { status: 400 })
    }
    const { data: sheet } = token.character_id
      ? await db.from("characters").select("speed").eq("id", token.character_id).maybeSingle()
      : { data: null }
    const speedFt = Number.parseInt(String(sheet?.speed ?? "30").replace(/[^0-9]/g, ""), 10) || 30
    const state = (combat as { turn_state?: Record<string, unknown> }).turn_state ?? {}
    const usedFt = Number(state.moved_ft ?? 0)
    const cheb = Math.max(Math.abs(gx - token.grid_x), Math.abs(gy - token.grid_y)) * 5
    if (!Number.isFinite(feet) || feet <= 0 || feet < cheb) {
      return NextResponse.json({ error: "path cost does not reach that square" }, { status: 400 })
    }
    if (usedFt + feet > speedFt) {
      return NextResponse.json({ error: `not enough movement — ${speedFt - usedFt} ft left` }, { status: 409 })
    }
    const { error: moveErr } = await db
      .from("vtt_tokens")
      .update({ grid_x: gx, grid_y: gy, updated_by: "player-move", updated_at: new Date().toISOString() })
      .eq("id", token_id)
    if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 500 })
    const next = { ...state, moved_ft: usedFt + feet }
    const { error: stateErr } = await db
      .from("combat_state")
      .update({ turn_state: next, updated_at: new Date().toISOString() })
      .eq("id", combat.id)
    if (stateErr) return NextResponse.json({ error: stateErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, turn_state: next })
  }

  if (action === "spend" || action === "ack") {
    const state = (combat as { turn_state?: Record<string, unknown> }).turn_state ?? {}
    const next = { ...state }
    if (action === "ack") {
      next.acknowledged = true
    } else {
      const kind = body?.kind
      if (!["action", "bonus", "reaction"].includes(kind)) {
        return NextResponse.json({ error: "expected kind: action|bonus|reaction" }, { status: 400 })
      }
      // A toggle, not a one-way latch: players mis-click, and a turn where
      // you cannot un-spend a bonus action you never took is a turn that
      // makes the tracker a liability rather than a help.
      next[kind] = !state[kind]
    }
    const { error } = await db
      .from("combat_state")
      .update({ turn_state: next, updated_at: new Date().toISOString() })
      .eq("id", combat.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, turn_state: next })
  }

  if (action === "next") {
    const count = (combat.turn_order as unknown[]).length
    const nextIndex = (combat.active_index + 1) % count
    const { error } = await db
      .from("combat_state")
      .update({
        turn_state: { action: false, bonus: false, reaction: false, moved_ft: 0, acknowledged: false },
        active_index: nextIndex,
        // Wrapping past the last combatant is a new round — SRD: "a round
        // ends when every participant has taken a turn."
        round: nextIndex === 0 ? combat.round + 1 : combat.round,
        updated_at: new Date().toISOString(),
      })
      .eq("id", combat.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // end
  const { error } = await db
    .from("combat_state")
    .update({ status: "ended", updated_at: new Date().toISOString() })
    .eq("id", combat.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
