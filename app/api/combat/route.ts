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
    .select("id,map_id,round,active_index,turn_order,status,started_at")
    .eq("map_id", map.id)
    .eq("status", "active")
    .maybeSingle()
  return NextResponse.json({ combat: data ?? null })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  const body = await req.json().catch(() => null)
  const action = body?.action
  if (!["start", "next", "end"].includes(action)) {
    return NextResponse.json({ error: "expected { action: 'start'|'next'|'end' }" }, { status: 400 })
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
    .select("id,round,active_index,turn_order")
    .eq("map_id", map.id)
    .eq("status", "active")
    .maybeSingle()
  if (!combat) return NextResponse.json({ error: "no combat running" }, { status: 409 })

  if (action === "next") {
    const count = (combat.turn_order as unknown[]).length
    const nextIndex = (combat.active_index + 1) % count
    const { error } = await db
      .from("combat_state")
      .update({
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
