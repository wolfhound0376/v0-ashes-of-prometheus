import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { decideTurn, walkableFrom, key as cellKey, stepToEdge, speedSquares, usesAlgorithm, type Combatant } from "@/lib/npc-ai"
import { spellEntry, rollDice } from "@/lib/spellbook"

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
//     "npc-turn" → the creature whose turn it is decides and acts for itself.
//               Sam's ruling: NPC actions are never picked by the players or
//               the DM. INT and WIS both ≤12 run the deterministic algorithm
//               in lib/npc-ai; anything sharper is meant to route to a model,
//               which does not exist yet and falls back to the algorithm
//               rather than stalling the table.
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


/**
 * Everything the AI needs about the board, fetched once.
 *
 * The walkable set comes from the SAME V5 cell geometry the board renders
 * (vtt_maps.meta.cells_url), so the server and the client agree about where a
 * wall is. If that fetch fails we fall back to an open rectangle rather than
 * refusing to take the turn — a fight that stalls is worse at a live table
 * than a goblin that walks through a rock once.
 */
async function loadBoard(db: ReturnType<typeof createAdminClient>, mapId: string) {
  const { data: mapRow } = await db
    .from("vtt_maps").select("grid_width,grid_height,meta").eq("id", mapId).maybeSingle()
  const width = mapRow?.grid_width ?? 12
  const height = mapRow?.grid_height ?? 12
  const cellsUrl = (mapRow?.meta as { cells_url?: string } | null)?.cells_url
  let walkable = new Set<string>()
  if (cellsUrl) {
    try {
      const res = await fetch(cellsUrl, { cache: "no-store" })
      if (res.ok) walkable = walkableFrom((await res.json())?.cells)
    } catch {
      /* fall through to the open rectangle below */
    }
  }
  if (walkable.size === 0) {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) walkable.add(cellKey(x, y))
  }

  const { data: tokens } = await db
    .from("vtt_tokens")
    .select("id,label,character_id,bestiary_id,grid_x,grid_y,hp_current,hp_max,combat_disposition,is_visible")
    .eq("map_id", mapId)
    .eq("is_visible", true)

  // AC lives on the sheet for PCs and the stat block for NPCs.
  const charIds = (tokens ?? []).map((t) => t.character_id).filter(Boolean) as string[]
  const beastIds = (tokens ?? []).map((t) => t.bestiary_id).filter(Boolean) as string[]
  const [chars, beasts] = await Promise.all([
    charIds.length ? db.from("characters").select("id,ac").in("id", charIds) : Promise.resolve({ data: [] }),
    beastIds.length ? db.from("bestiary").select("id,ac,int,wis,speed,actions").in("id", beastIds) : Promise.resolve({ data: [] }),
  ])
  const charAc = new Map((chars.data ?? []).map((c: { id: string; ac: number | null }) => [c.id, c.ac]))
  const beast = new Map((beasts.data ?? []).map((b: Record<string, unknown>) => [b.id as string, b]))

  const combatants: (Combatant & { bestiary_id: string | null; disposition: string })[] = (tokens ?? []).map((t) => ({
    token_id: t.id,
    label: t.label ?? "Something",
    kind: t.character_id ? "pc" : "npc",
    x: t.grid_x ?? 0,
    y: t.grid_y ?? 0,
    hp_current: t.hp_current,
    hp_max: t.hp_max,
    ac: t.character_id
      ? charAc.get(t.character_id) ?? 10
      : ((beast.get(t.bestiary_id ?? "")?.ac as number | undefined) ?? 10),
    bestiary_id: t.bestiary_id,
    disposition: t.combat_disposition ?? "fights",
  }))
  return { width, height, walkable, combatants, beast }
}

/** The board's log is the dialogue feed; the HUD is already subscribed to it. */
async function narrate(db: ReturnType<typeof createAdminClient>, speaker: string, text: string) {
  await db.from("dialogue").insert({ speaker, text, channel: "dm" })
}

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
  // "npc-turn" is DM-gated: it moves and swings on the NPCs' behalf, which is
  // the DM's chair even when no human chooses the action.
  if (!["spend", "ack", "move", "cast"].includes(action) && !authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  }
  // "spend", "ack" and "move" are the PLAYER's verbs and are deliberately
  // NOT DM-gated below: a player must be able to mark their own bonus action
  // used, acknowledge their own turn, and walk their own character, without
  // the DM clicking for them. "move" is still fenced hard server-side: only
  // the ACTIVE turn's own PC token may walk, only within its speed budget.
  const PLAYER_VERBS = ["spend", "ack", "move", "cast"]
  if (!["start", "next", "end", "npc-turn", ...PLAYER_VERBS].includes(action)) {
    return NextResponse.json({ error: "expected { action: 'start'|'next'|'end'|'npc-turn'|'spend'|'ack'|'move'|'cast' }" }, { status: 400 })
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

    const { data: allTokens } = await db
      .from("vtt_tokens")
      .select("id,label,character_id,bestiary_id,is_visible,combat_disposition")
      .eq("map_id", map.id)
      .eq("is_visible", true)
    if (!allTokens?.length) return NextResponse.json({ error: "no tokens on the board" }, { status: 409 })
    // The prisoners who will not fight are not IN the fight. Sam's ruling:
    // the twins, Stool, Jimjar, Shuushar and Buppido "never fight but runaway
    // to the edge of the game map. They can still be hit and targeted but
    // they don't roll initiative." So they are excluded here and moved by the
    // end-of-round world step instead — present on the board, absent from the
    // order, which is exactly how a panicking bystander behaves.
    const tokens = allTokens.filter((t) => t.combat_disposition !== "flees")
    if (!tokens.length) return NextResponse.json({ error: "nobody on this board is willing to fight" }, { status: 409 })

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

  if (action === "npc-turn") {
    const order = combat.turn_order as { token_id: string; label: string; kind: string }[]
    const entry = order[combat.active_index]
    if (!entry) return NextResponse.json({ error: "no active combatant" }, { status: 409 })
    if (entry.kind !== "npc") {
      return NextResponse.json({ error: "it is a player's turn — the AI does not take those" }, { status: 409 })
    }

    const board = await loadBoard(db, map.id)
    const self = board.combatants.find((c) => c.token_id === entry.token_id)
    if (!self) return NextResponse.json({ error: "that combatant is no longer on the board" }, { status: 409 })
    if ((self.hp_current ?? 1) <= 0) {
      await narrate(db, self.label, `${self.label} lies still.`)
      return NextResponse.json({ ok: true, decision: { kind: "none" }, note: "down" })
    }

    const stat = (board.beast.get(self.bestiary_id ?? "") ?? {}) as Record<string, unknown>
    const stats = {
      int: (stat.int as number | null) ?? 10,
      wis: (stat.wis as number | null) ?? 10,
      speed: (stat.speed as string | null) ?? "30 ft.",
      actions: stat.actions,
    }

    // Hostility is simply the other side of the PC line. A campaign with
    // NPC-vs-NPC fights would need factions; this one does not yet, and
    // inventing them now would be a schema nobody asked for.
    const hostiles = board.combatants.filter((c) => c.kind === "pc" && (c.hp_current ?? 1) > 0)
    const blocked = new Set(
      board.combatants.filter((c) => c.token_id !== self.token_id).map((c) => cellKey(c.x, c.y)),
    )

    const decision = decideTurn({
      self, stats, hostiles, walkable: board.walkable, blocked,
      width: board.width, height: board.height,
    })

    // Apply. Movement and damage are the only two things this writes.
    if (decision.kind === "move" || decision.kind === "move-attack" || decision.kind === "flee") {
      await db.from("vtt_tokens")
        .update({ grid_x: decision.to.x, grid_y: decision.to.y, updated_by: "npc-ai", updated_at: new Date().toISOString() })
        .eq("id", self.token_id)
    }
    if ((decision.kind === "attack" || decision.kind === "move-attack") && decision.hit && decision.damage > 0) {
      const target = board.combatants.find((c) => c.token_id === decision.target.token_id)
      if (target) {
        const left = Math.max(0, (target.hp_current ?? target.hp_max ?? 0) - decision.damage)
        await db.from("vtt_tokens")
          .update({ hp_current: left, updated_by: "npc-ai", updated_at: new Date().toISOString() })
          .eq("id", target.token_id)
      }
    }
    await narrate(db, self.label, decision.narration)

    // The creature's whole turn is spent in one call, so the economy reads
    // honestly for anyone watching the tray.
    const spent = { action: decision.kind !== "none", bonus: false, reaction: false, moved_ft: 0, acknowledged: true }
    await db.from("combat_state")
      .update({ turn_state: spent, updated_at: new Date().toISOString() })
      .eq("id", combat.id)

    return NextResponse.json({
      ok: true,
      tier: usesAlgorithm(stats) ? "algorithm" : "algorithm-fallback",
      decision,
    })
  }

  if (action === "cast") {
    // A player's spell, resolved where the dice cannot be argued with.
    //
    // The client already played the animation and the sound; this is the part
    // that changes the world, so it happens on the server with the service
    // key and is written to the same log everyone reads. The client is never
    // told "you hit" — it is told what happened.
    const caster_token = String(body?.caster_token ?? "")
    const target_token = String(body?.target_token ?? "")
    const ability = String(body?.ability ?? "")
    if (!caster_token || !target_token || !ability) {
      return NextResponse.json({ error: "cast needs caster_token, target_token and ability" }, { status: 400 })
    }
    const entry = spellEntry(ability)
    if (!entry.dice || entry.resolve === "none" || !entry.resolve) {
      // Utility spells are real spells; they simply have nothing to roll.
      return NextResponse.json({ ok: true, resolved: false, note: "no dice to roll for this spell" })
    }

    const { data: rows } = await db
      .from("vtt_tokens")
      .select("id,label,character_id,bestiary_id,hp_current,hp_max")
      .in("id", [caster_token, target_token])
    const caster = rows?.find((r) => r.id === caster_token)
    const victim = rows?.find((r) => r.id === target_token)
    if (!caster || !victim) return NextResponse.json({ error: "token missing" }, { status: 409 })

    // AC and saves come from whichever sheet the target actually has.
    let ac = 10
    let saveMod = 0
    if (victim.character_id) {
      const { data: c } = await db.from("characters")
        .select("ac,str_score,dex_score,con_score,int_score,wis_score,cha_score")
        .eq("id", victim.character_id).maybeSingle()
      ac = c?.ac ?? 10
      const scores: Record<string, number | undefined> = {
        STR: c?.str_score, DEX: c?.dex_score, CON: c?.con_score,
        INT: c?.int_score, WIS: c?.wis_score, CHA: c?.cha_score,
      }
      saveMod = Math.floor(((scores[entry.save ?? "WIS"] ?? 10) - 10) / 2)
    } else if (victim.bestiary_id) {
      const { data: b } = await db.from("bestiary")
        .select("ac,str,dex,con,int,wis,cha").eq("id", victim.bestiary_id).maybeSingle()
      ac = b?.ac ?? 10
      const scores: Record<string, number | undefined> = {
        STR: b?.str, DEX: b?.dex, CON: b?.con, INT: b?.int, WIS: b?.wis, CHA: b?.cha,
      }
      saveMod = Math.floor(((scores[entry.save ?? "WIS"] ?? 10) - 10) / 2)
    }

    // The caster's own numbers, off the sheet — never invented here.
    let attackBonus = 4
    let saveDc = 13
    if (caster.character_id) {
      const { data: c } = await db.from("characters")
        .select("sheet_spellcasting").eq("id", caster.character_id).maybeSingle()
      const sc = c?.sheet_spellcasting as { attack_bonus?: number; save_dc?: number } | null
      attackBonus = sc?.attack_bonus ?? attackBonus
      saveDc = sc?.save_dc ?? saveDc
    }

    let hit = true
    let crit = false
    let amount = 0
    let line = ""

    if (entry.resolve === "attack") {
      const roll = d20()
      crit = roll === 20
      const total = roll + attackBonus
      hit = crit || (roll !== 1 && total >= ac)
      if (hit) {
        amount = rollDice(entry.dice)
        if (crit) amount += rollDice(entry.dice)
      }
      line = `${caster.label} casts ${ability} at ${victim.label} — ${roll}+${attackBonus} = ${total} vs AC ${ac}: ${crit ? "CRITICAL" : hit ? "hit" : "miss"}${hit ? ` for ${amount}` : ""}.`
    } else if (entry.resolve === "save") {
      const roll = d20()
      const total = roll + saveMod
      const saved = total >= saveDc
      const full = rollDice(entry.dice)
      amount = saved ? (entry.halfOnSave ? Math.floor(full / 2) : 0) : full
      hit = amount > 0
      line = `${caster.label} casts ${ability} — ${victim.label} rolls ${roll}${saveMod >= 0 ? "+" : ""}${saveMod} = ${total} vs DC ${saveDc}: ${saved ? "saves" : "fails"}${amount ? ` and takes ${amount}` : ""}.`
    } else {
      amount = rollDice(entry.dice)
      line = `${caster.label} casts ${ability} on ${victim.label} for ${amount}.`
    }

    if (amount > 0) {
      const cur = victim.hp_current ?? victim.hp_max ?? 0
      const max = victim.hp_max ?? cur
      // Healing cannot exceed the maximum; damage cannot go below zero. A
      // token at 0 is down, not negative — the dying rules are the DM's.
      const next = entry.heals ? Math.min(max, cur + amount) : Math.max(0, cur - amount)
      await db.from("vtt_tokens")
        .update({ hp_current: next, updated_by: "player-cast", updated_at: new Date().toISOString() })
        .eq("id", victim.id)
      if (!entry.heals && next === 0) line += ` ${victim.label} goes down.`
    }
    await narrate(db, caster.label ?? "Someone", line)

    // The action is spent by the same call that resolved it, so a hit and its
    // cost can never drift apart.
    const st = (combat as { turn_state?: Record<string, unknown> }).turn_state ?? {}
    const slot = entry.bonus ? "bonus" : "action"
    await db.from("combat_state")
      .update({ turn_state: { ...st, [slot]: true }, updated_at: new Date().toISOString() })
      .eq("id", combat.id)

    return NextResponse.json({ ok: true, resolved: true, hit, crit, amount, heals: Boolean(entry.heals), line })
  }

  if (action === "next") {
    const count = (combat.turn_order as unknown[]).length
    const nextIndex = (combat.active_index + 1) % count

    // END OF ROUND — the world step. Sam's ruling: the non-combatants move at
    // the end of each round, automatically, toward the edge of the map. They
    // never took a turn in the order; this is the fight happening AROUND them.
    if (nextIndex === 0) {
      const board = await loadBoard(db, map.id)
      const fleeing = board.combatants.filter((c) => c.disposition === "flees" && (c.hp_current ?? 1) > 0)
      for (const runner of fleeing) {
        const blocked = new Set(
          board.combatants.filter((c) => c.token_id !== runner.token_id).map((c) => cellKey(c.x, c.y)),
        )
        const stat = (board.beast.get(runner.bestiary_id ?? "") ?? {}) as Record<string, unknown>
        const budget = speedSquares((stat.speed as string | null) ?? "30 ft.")
        const to = stepToEdge(runner, board.walkable, blocked, budget, board.width, board.height)
        if (to.x === runner.x && to.y === runner.y) continue
        await db.from("vtt_tokens")
          .update({ grid_x: to.x, grid_y: to.y, updated_by: "npc-flee", updated_at: new Date().toISOString() })
          .eq("id", runner.token_id)
        // Their own square is now taken, so the next runner routes around them.
        runner.x = to.x
        runner.y = to.y
        const atEdge = Math.min(to.x, to.y, board.width - 1 - to.x, board.height - 1 - to.y) === 0
        await narrate(db, runner.label, atEdge
          ? `${runner.label} presses against the far wall, as far from the fighting as the cavern allows.`
          : `${runner.label} scrambles away from the fighting.`)
      }
    }
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
