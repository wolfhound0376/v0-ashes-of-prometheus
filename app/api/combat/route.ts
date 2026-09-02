import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { normalizeCode, safeEquals } from "@/lib/access-code"
import { decideTurn, walkableFrom, key as cellKey, stepToEdge, speedSquares, usesAlgorithm, type Combatant } from "@/lib/npc-ai"
import { spellEntry, rollDice, knowsSpell, phaseCost, slotsLeft, type Spellcasting } from "@/lib/spellbook"
// The SAME geometry the board draws its template with. Not a second
// implementation that agrees today — the identical function, so an outline a
// player is looking at and the list of creatures this handler damages cannot
// drift apart.
import { areaCells, aimInRange } from "@/lib/aoe"
// Weapons are derived from the inventory by the SAME function the board's rack
// uses, so a weapon the board offers is a weapon this handler accepts — and a
// confiscated one is refused by both.
import { attacksFromInventory } from "@/lib/weapons"
import { announcementFor, justBecameDying } from "@/lib/announcer"

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

/**
 * One word for what happened, so nothing downstream has to reconstruct it
 * from a boolean pair.
 *
 * `hit === false` covers four genuinely different events — a clean miss, a
 * fumble, a save that shrugged the whole spell off, and a save that took
 * half — and every one of them should look and sound different on the
 * board. Collapsing them into !hit is what made every failure render as
 * the same nothing.
 *
 * ONE function, called by both the player's cast verb and the NPC turn, so
 * a goblin's miss and a rogue's miss are the same word and the board draws
 * them with the same defenceFor. lib/__tests__/defence.test.mjs mirrors
 * this expression; change one and change the other.
 */
function verdictWord(v: {
  heals?: boolean | null
  weapon?: boolean
  crit: boolean
  fumble: boolean
  saved: boolean | null
  amount: number
  hit: boolean
}): string {
  return v.heals && !v.weapon
    ? "heal"
    : v.crit
      ? "crit"
      : v.fumble
        ? "fumble"
        : v.saved === true
          ? (v.amount > 0 ? "saved-half" : "saved")
          : v.saved === false
            ? "failed-save"
            : v.hit
              ? "hit"
              : "miss"
}

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
    .select("id,label,character_id,bestiary_id,grid_x,grid_y,hp_current,hp_max,combat_disposition,allegiance,is_visible")
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

  const combatants: (Combatant & {
    bestiary_id: string | null
    character_id: string | null
    disposition: string
    /** 'party' | 'ally' | 'hostile' | 'neutral' | null — whose side the AI fights for. */
    allegiance: string | null
  })[] = (tokens ?? []).map((t) => ({
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
    // Carried so damage can reach the sheet as well as the token.
    character_id: t.character_id,
    disposition: t.combat_disposition ?? "fights",
    allegiance: (t as { allegiance?: string | null }).allegiance ?? null,
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
    // Initiative is rolled and the order is written. Party-scoped: every seat
    // should hear the fight start, not only whoever pressed it. Derived from
    // the row this route has just committed, never from narration.
    return NextResponse.json({
      ok: true,
      combat: row,
      sfxCues: [{ type: "raw" as const, scope: "party" as const, key: "ui/initiative_start" }],
    })
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

    // DASH.
    //
    // The board has drawn an azure band at speed x2 since the movement overlay
    // shipped, but nothing here ever agreed to it: the fence below was a hard
    // cap at speed, so every square in that band was refused. The overlay was
    // promising movement the server would not sell.
    //
    // `dash` is requested by the client only after the player confirms the
    // dialog. It is granted here, and the action is spent in the SAME write as
    // the move, so a Dash can never be taken twice or taken for free. Once
    // dashed, the doubled ceiling persists for the rest of the turn — you may
    // keep moving into it without confirming again, because you already paid.
    const alreadyDashed = state.dashed === true
    const wantsDash = body?.dash === true
    const dashing = alreadyDashed || wantsDash

    if (wantsDash && !alreadyDashed && state.action === true) {
      return NextResponse.json({ error: "your action is already spent — no Dash this turn" }, { status: 409 })
    }

    const ceilingFt = dashing ? speedFt * 2 : speedFt
    if (usedFt + feet > ceilingFt) {
      const left = ceilingFt - usedFt
      return NextResponse.json(
        {
          error: dashing
            ? `not enough movement — ${left} ft left`
            : `not enough movement — ${left} ft left without a Dash`,
          // Tells the client the square is reachable IF the player dashes, so
          // it can offer the confirm rather than just failing.
          dash_would_reach: !dashing && usedFt + feet <= speedFt * 2 && state.action !== true,
        },
        { status: 409 },
      )
    }

    const { error: moveErr } = await db
      .from("vtt_tokens")
      .update({ grid_x: gx, grid_y: gy, updated_by: "player-move", updated_at: new Date().toISOString() })
      .eq("id", token_id)
    if (moveErr) return NextResponse.json({ error: moveErr.message }, { status: 500 })
    const next = { ...state, moved_ft: usedFt + feet }
    // Spending the action in the same write as the move: no window exists in
    // which the player has the extra movement but has not yet paid for it.
    if (wantsDash && !alreadyDashed) {
      next.dashed = true
      next.action = true
    }
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
    // A token with no stat block has nothing to fight with, and the AI used
    // to say so as if it were a trait — "has no attack it knows how to make"
    // — every round, as if the orc had forgotten. It is a wiring fault, not
    // a character trait, so the line names the fault and the fix, for the DM.
    // Same speaker as every other board note, so the chat route does not
    // mistake it for one of Malachar's own lines.
    if (!self.bestiary_id) {
      await narrate(db, self.label, `${self.label} stands its ground — no stat block is linked to this token. Link one in the bestiary and it will fight.`)
      return NextResponse.json({ ok: true, decision: { kind: "none" }, note: "no-stat-block" })
    }

    const stat = (board.beast.get(self.bestiary_id ?? "") ?? {}) as Record<string, unknown>
    const stats = {
      int: (stat.int as number | null) ?? 10,
      wis: (stat.wis as number | null) ?? 10,
      speed: (stat.speed as string | null) ?? "30 ft.",
      actions: stat.actions,
    }

    // WHOSE SIDE. Hostility used to be "the other side of the PC line": every
    // NPC turn went looking for player characters. That was fine while the
    // only NPCs who fought were drow and a hook horror. Ront, Eldeth,
    // Derendil and Sarith are ALLIES that fight, and the moment they have an
    // attack to make, that rule sends it at the party — the only thing that
    // stopped them until now was having no stat block linked at all.
    //
    // So the AI draws the same line the cast fence and the client's
    // targetStatus draw: 'party' and 'ally' are one side, 'hostile' the other,
    // and a null allegiance reads as hostile. 'neutral' stands aside — nobody's
    // AI goes after a bystander, and a neutral's own turn finds no one to fight.
    const side = (a: string | null | undefined) => a === "party" || a === "ally"
    const mine = side(self.allegiance)
    const hostiles = board.combatants.filter((c) =>
      c.token_id !== self.token_id &&
      (c.hp_current ?? 1) > 0 &&
      self.allegiance !== "neutral" &&
      c.allegiance !== "neutral" &&
      side(c.allegiance) !== mine,
    )
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
        const stamp = new Date().toISOString()
        await db.from("vtt_tokens")
          .update({ hp_current: left, updated_by: "npc-ai", updated_at: stamp })
          .eq("id", target.token_id)
        // The token and the sheet are one creature — and THIS is the path that
        // hurts players. Found in a live rehearsal: a drow crit Kenta for 11,
        // his token went to 0, and his card went on reading 8/8 because the
        // plates, the globes and the sheet overlay all read `characters`. The
        // player could not see that he was unconscious.
        const victimCharId = (target as { character_id?: string | null }).character_id
        if (victimCharId) {
          await db.from("characters")
            .update({ hp_current: left, updated_at: stamp })
            .eq("id", victimCharId)
        }
      }
    }
    await narrate(db, self.label, decision.narration)

    // The creature's whole turn is spent in one call, so the economy reads
    // honestly for anyone watching the tray.
    const spent = { action: decision.kind !== "none", bonus: false, reaction: false, moved_ft: 0, acknowledged: true }
    await db.from("combat_state")
      .update({ turn_state: spent, updated_at: new Date().toISOString() })
      .eq("id", combat.id)

    // THE SWING, FOR THE BOARD.
    //
    // decideTurn already rolled the d20 and compared it to AC; until now the
    // response threw that away behind `decision`, and the board had nothing
    // to animate for an NPC attack — the target neither flinched nor dodged,
    // and the only evidence a goblin had swung was a number over a head half
    // a second later. This reports the blow in exactly the vocabulary the
    // player's cast verb uses (outcome, margin, hit, crit), so the board can
    // hand it to the same performCast / defenceFor and a goblin's near miss
    // is turned aside the same way a rogue's is.
    //
    // Only the DM's seat receives this response — npc-turn is DM-gated. The
    // board relays it to the other seats itself (lib/combat-relay), the same
    // client-side pattern sfx cues use, so no server channel is needed.
    const swung = decision.kind === "attack" || decision.kind === "move-attack" ? decision : null
    const swing = swung
      ? (() => {
          // The same default resolveAttack measured against.
          const dc = swung.target.ac ?? 10
          const fumble = swung.roll === 1
          return {
            caster_token: self.token_id,
            target_token: swung.target.token_id,
            weapon: swung.attack.name,
            ranged: swung.attack.ranged,
            // Where the creature ended up before it struck, so a seat whose
            // miniature is still gliding there can wait for it to arrive.
            to: swung.kind === "move-attack" ? swung.to : null,
            hit: swung.hit,
            crit: swung.crit,
            fumble,
            amount: swung.damage,
            roll: swung.roll,
            total: swung.total,
            dc,
            margin: swung.total - dc,
            outcome: verdictWord({
              weapon: true, crit: swung.crit, fumble, saved: null, amount: swung.damage, hit: swung.hit,
            }),
            // Read off the stat block's own "Hit: 5 (1d6+2) piercing damage".
            // The player's cast response has carried this for weeks; the NPC's
            // swing never did, so every monster attack in the game produced the
            // same corpse.
            damageType: swung.attack.damageType ?? null,
            sandbox: Boolean(sandbox),
          }
        })()
      : null

    return NextResponse.json({
      ok: true,
      tier: usesAlgorithm(stats) ? "algorithm" : "algorithm-fallback",
      decision,
      swing,
    })
  }

  if (action === "cast") {
    // A player's spell, resolved where the dice cannot be argued with.
    //
    // The client already played the animation and the sound; this is the part
    // that changes the world, so it happens on the server with the service
    // key and is written to the same log everyone reads. The client is never
    // told "you hit" — it is told what happened.
    /**
     * Announcer warnings raised while resolving this cast.
     *
     * Collected rather than sent as they happen, because a cast has one
     * response and an area spell can push several people to the brink at
     * once. Each is party-scoped: a warning only the wounded player hears is
     * not a warning, it is a private notification.
     */
    const dyingCues: { type: "raw"; scope: "party"; key: string }[] = []
    const caster_token = String(body?.caster_token ?? "")
    const target_token = String(body?.target_token ?? "")
    const ability = String(body?.ability ?? "")
    // A POINT cast names a SQUARE instead of a creature. Both forms arrive
    // here and part company below, after the shared fence: the turn, the
    // sheet, the slot and the action are the same questions whether the spell
    // is thrown at one drow or at the floor between four of them.
    const px = Number(body?.target_x)
    const py = Number(body?.target_y)
    const aim = Number.isFinite(px) && Number.isFinite(py)
      ? { x: Math.trunc(px), y: Math.trunc(py) }
      : null
    if (!caster_token || !ability || (!target_token && !aim)) {
      return NextResponse.json(
        { error: "cast needs caster_token, ability, and either target_token or target_x/target_y" },
        { status: 400 },
      )
    }
    const { data: rows } = await db
      .from("vtt_tokens")
      .select("id,map_id,label,character_id,bestiary_id,hp_current,hp_max,allegiance,grid_x,grid_y,is_visible")
      .in("id", [caster_token, target_token].filter(Boolean))
    const caster = rows?.find((r) => r.id === caster_token)
    // An aimed square wins over a token id if both somehow arrive: a point
    // spell has no single victim, and picking one would quietly turn Fireball
    // back into a dart.
    const victim = aim ? null : rows?.find((r) => r.id === target_token)
    if (!caster || (!aim && !victim)) return NextResponse.json({ error: "token missing" }, { status: 409 })

    // ---- THE FENCE ---------------------------------------------------
    // Up to here we have only proved the two tokens exist. "move" is
    // already fenced hard a hundred lines above; "cast" was not, and the
    // gap was total: any browser could POST this verb on someone else's
    // turn, name a spell that is not on the sheet, and repeat it until
    // the target fell over. Nothing was read before it was overwritten.
    //
    // Same shape as the move fence, deliberately: right combatant, PC
    // token, and only then the 5E resource questions.
    const order = combat.turn_order as { token_id: string; kind: string }[]
    const turn = order?.[combat.active_index]
    if (!turn || turn.token_id !== caster_token) {
      return NextResponse.json({ error: "not this combatant's turn" }, { status: 409 })
    }
    if (turn.kind !== "pc") {
      return NextResponse.json({ error: "NPC actions are not a player verb" }, { status: 403 })
    }

    // One read of the caster's sheet, used for all three things that need
    // it: which weapons they carry, which spells they hold, and their own
    // attack bonus and save DC. Read from the sheet, never from the
    // request — a browser claiming a dagger deals 40d6 gets a dagger.
    // WEAPONS COME FROM THE INVENTORY, NOT FROM A LIST ON THE SHEET.
    //
    // `sheet_attacks` was a second copy of what a character carries, kept by
    // hand, and it had already drifted: the drow confiscated the party's gear
    // and the sheets went on listing it. A browser naming "Spear" would have
    // been believed by this handler for a spear locked in a store room.
    //
    // Derived through the same function the board builds its rack with, so the
    // two cannot disagree about what exists.
    let sheetAttacks: { name?: string; hit?: string; damage?: string }[] = []
    let casterSc: Spellcasting | null = null
    if (caster.character_id) {
      const { data: cs } = await db.from("characters")
        .select("sheet_spellcasting,str_score,dex_score,proficiency_bonus")
        .eq("id", caster.character_id).maybeSingle()
      casterSc = (cs?.sheet_spellcasting ?? null) as Spellcasting | null
      const { data: inv } = await db.from("inventory_items")
        .select("name,item_type,items(item_type,properties)")
        .eq("character_id", caster.character_id)
      sheetAttacks = attacksFromInventory(inv as Parameters<typeof attacksFromInventory>[0], {
        strScore: cs?.str_score,
        dexScore: cs?.dex_score,
        proficiencyBonus: cs?.proficiency_bonus,
      })
    }
    const weapon = sheetAttacks.find((a) => (a?.name ?? "").toLowerCase() === ability.toLowerCase()) ?? null

    const entry = spellEntry(ability)

    // ---- WHOSE SIDE ---------------------------------------------------
    // A heal reaches your own side; a harmful spell reaches the other.
    //
    // The client draws the same rule (targetStatus), but a client-only fence
    // is not a fence — the dash band proved that twice. Nothing stops a
    // browser POSTing any token id it likes, and until now this handler
    // accepted whatever arrived: Healing Word on a drow healed the drow.
    //
    // 'neutral' is neither side: attackable, not healable. A null allegiance
    // reads as hostile, because a wrongly-hostile token merely cannot be
    // healed while a wrongly-friendly one cannot be attacked.
    // An AREA does not choose sides. It covers ground, and whoever is standing
    // on that ground is in it — which is exactly what makes aiming one a
    // decision. So this fence guards the single-creature path only.
    //
    // CROSSING SIDES IS ALLOWED — WITH CONSENT. Sam: "Sometimes you want to
    // heal an enemy; that's ok. We just need confirmation." The client asks,
    // and the answer travels as `allow_cross_side: true`. That flag is the
    // record of consent and nothing else stands in for it: it is never
    // defaulted, never inferred from the target, and must be the boolean
    // true — so a stray or replayed POST without it meets the same 409 it
    // always did. `cross_side: true` on those bodies lets the client tell a
    // side refusal from a range or resource one.
    if (entry && victim) {
      const side = (a: string | null | undefined) => a === "party" || a === "ally"
      const isSelf = victim.id === caster.id
      const friendlyTarget = isSelf || side((victim as { allegiance?: string | null }).allegiance)
      // A harmful spell on YOURSELF is the one cross-side act consent does not
      // unlock — there is no tactical reading of it, so no flag opens it.
      if (!entry.helpful && isSelf) {
        return NextResponse.json(
          { error: `${ability} is not for turning on yourself.` },
          { status: 409 },
        )
      }
      if (body?.allow_cross_side !== true) {
        if (entry.helpful && !friendlyTarget) {
          return NextResponse.json(
            { error: `${ability} only helps your own — ${victim.label} is not one of yours.`, cross_side: true },
            { status: 409 },
          )
        }
        if (!entry.helpful && friendlyTarget) {
          return NextResponse.json(
            { error: `${victim.label} is on your side. ${ability} is not for them.`, cross_side: true },
            { status: 409 },
          )
        }
      }
    }

    // Does the caster actually have this? A spell absent from the
    // spellbook registry falls back to DEFAULT_ENTRY and still casts —
    // that fallback is deliberate — but it must still be on the sheet.
    if (!weapon && !knowsSpell(casterSc, ability)) {
      return NextResponse.json(
        { error: `${caster.label} does not have ${ability} prepared` },
        { status: 403 },
      )
    }

    // Is the half of the turn it costs still there?
    const st = (combat as { turn_state?: Record<string, unknown> }).turn_state ?? {}
    const phase = phaseCost(entry, Boolean(weapon))
    if (st[phase] === true) {
      return NextResponse.json(
        { error: `${caster.label} has already used their ${phase === "bonus" ? "bonus action" : "action"} this turn` },
        { status: 409 },
      )
    }

    // Is there a slot? Cantrips are at will, so slotsLeft returns Infinity.
    if (!weapon && slotsLeft(casterSc, entry.level) <= 0) {
      return NextResponse.json(
        { error: `no level ${entry.level} slots left` },
        { status: 409 },
      )
    }

    /**
     * Pay for the cast: the turn phase, and the slot if it burned one.
     *
     * Both writes happen here so a resolution and its cost can never drift
     * apart, and so the utility-spell path below pays too. Sanctuary and
     * Shield of Faith have no dice to roll and used to return early having
     * cost the caster nothing at all — they were free, all day, forever.
     */
    const payFor = async () => {
      await db.from("combat_state")
        .update({ turn_state: { ...st, [phase]: true }, updated_at: new Date().toISOString() })
        .eq("id", combat.id)
      if (weapon || entry.level === 0 || !caster.character_id || !casterSc) return
      const slots = (casterSc.slots ?? {}) as Record<string, { max?: number; used?: number }>
      const lvl = String(entry.level)
      const cur = slots[lvl] ?? {}
      await db.from("characters")
        .update({
          sheet_spellcasting: {
            ...casterSc,
            slots: { ...slots, [lvl]: { ...cur, used: (cur.used ?? 0) + 1 } },
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", caster.character_id)
    }

    // ---- THE AREA CAST ------------------------------------------------
    //
    // Everything above this line was the same question for every spell. Here
    // the point cast leaves: it has no single victim to roll against, it has
    // a SHAPE, and everyone standing in that shape rolls their own save.
    //
    // The cells come from lib/aoe — the identical function the board drew the
    // template with. That is deliberate and load-bearing: a player watching a
    // drow glow inside the Fireball outline and then take nothing is the exact
    // failure this codebase has already shipped twice by other means.
    if (aim) {
      if (!entry.area) {
        // A point spell with no shape lands on its square and does nothing to
        // anybody — Mage Hand, Misty Step, Minor Illusion. Real spells with
        // nothing to roll.
        await payFor()
        await narrate(db, caster.label ?? "Someone", `${caster.label} casts ${ability}.`)
        return NextResponse.json({ ok: true, resolved: false, note: "no dice to roll for this ability" })
      }

      const origin = { x: caster.grid_x ?? 0, y: caster.grid_y ?? 0 }
      // Range is checked HERE and not only on the board. Nothing stops a
      // browser posting a square on the far side of the map.
      if (!aimInRange(entry.area, entry.rangeFt, origin, aim)) {
        return NextResponse.json(
          { error: `${ability} reaches ${entry.rangeFt} ft — that square is further than that.` },
          { status: 409 },
        )
      }

      const covered = new Set(areaCells(entry.area, origin, aim).map((c) => `${c.x},${c.y}`))

      // Everyone standing on the map, so the shape can be tested against them.
      // Scoped to the caster's map: a Fireball must not reach a token parked
      // on another board at the same coordinates.
      const { data: onMap } = await db
        .from("vtt_tokens")
        .select("id,label,character_id,bestiary_id,hp_current,hp_max,allegiance,grid_x,grid_y,is_visible")
        .eq("map_id", caster.map_id)

      const side = (a: string | null | undefined) => a === "party" || a === "ally"
      const caught = (onMap ?? []).filter((t) => {
        if (!t.is_visible) return false
        if (!covered.has(`${t.grid_x},${t.grid_y}`)) return false
        // Spirit Guardians and its kin: "creatures of your choice". The
        // caster's own side walks through it untouched.
        if (entry.area?.sparesAllies && (t.id === caster.id || side(t.allegiance))) return false
        return true
      })

      await payFor()

      if (caught.length === 0) {
        await narrate(db, caster.label ?? "Someone", `${caster.label} casts ${ability} — it catches no one.`)
        return NextResponse.json({ ok: true, resolved: true, area: true, hit: false, victims: [] })
      }

      // Utility areas — Fog Cloud, Web, Silence — cover the ground and roll
      // nothing. They are real spells that have already cost a slot.
      if (!entry.dice || !entry.resolve || entry.resolve === "none") {
        await narrate(
          db, caster.label ?? "Someone",
          `${caster.label} casts ${ability} — it covers ${caught.map((t) => t.label).join(", ")}.`,
        )
        return NextResponse.json({ ok: true, resolved: false, area: true, note: "no dice to roll for this ability" })
      }

      const scNumsArea = casterSc as { save_dc?: number } | null
      const dcArea = scNumsArea?.save_dc ?? 13
      // ONE roll of the damage dice for the whole blast, as 5E does it: a
      // Fireball is one explosion, and everyone in it is measured against the
      // same fire. Rolling per creature would make a wide blast statistically
      // gentler than a narrow one, which is not the spell.
      const full = rollDice(entry.dice)

      // Per victim, the same words the single-target verdict uses (outcome,
      // margin, roll, total, dc), so the board can hand each body in the
      // blast to the same defenceFor: the drow who saved steps out of the
      // fire, the one who failed is caught in it. `saved` stays a boolean
      // for anyone already reading it; `outcome` is the honest version,
      // since a spell that never asked for a save has not been "not saved".
      const victims: {
        id: string; label: string; amount: number; saved: boolean
        outcome: string; margin: number; roll: number; total: number; dc: number; heals: boolean
      }[] = []
      const parts: string[] = []

      for (const t of caught) {
        let saveMod = 0
        if (t.character_id) {
          const { data: c } = await db.from("characters")
            .select("str_score,dex_score,con_score,int_score,wis_score,cha_score")
            .eq("id", t.character_id).maybeSingle()
          const sc: Record<string, number | undefined> = {
            STR: c?.str_score, DEX: c?.dex_score, CON: c?.con_score,
            INT: c?.int_score, WIS: c?.wis_score, CHA: c?.cha_score,
          }
          saveMod = Math.floor(((sc[entry.save ?? "DEX"] ?? 10) - 10) / 2)
        } else if (t.bestiary_id) {
          const { data: b } = await db.from("bestiary")
            .select("str,dex,con,int,wis,cha").eq("id", t.bestiary_id).maybeSingle()
          const sc: Record<string, number | undefined> = {
            STR: b?.str, DEX: b?.dex, CON: b?.con, INT: b?.int, WIS: b?.wis, CHA: b?.cha,
          }
          saveMod = Math.floor(((sc[entry.save ?? "DEX"] ?? 10) - 10) / 2)
        }

        let amount = full
        let saved = false
        let roll = 0
        let total = 0
        if (entry.resolve === "save") {
          roll = d20()
          total = roll + saveMod
          saved = total >= dcArea
          amount = saved ? (entry.halfOnSave ? Math.floor(full / 2) : 0) : full
          parts.push(
            `${t.label} ${roll}${saveMod >= 0 ? "+" : ""}${saveMod} vs DC ${dcArea} ${saved ? "saves" : "fails"}${amount ? ` (${amount})` : ""}`,
          )
        } else {
          parts.push(`${t.label} takes ${amount}`)
        }

        if (amount > 0) {
          const cur = t.hp_current ?? t.hp_max ?? 0
          const max = t.hp_max ?? cur
          const next = entry.heals ? Math.min(max, cur + amount) : Math.max(0, cur - amount)
          await db.from("vtt_tokens")
            .update({ hp_current: next, updated_by: "player-cast", updated_at: new Date().toISOString() })
            .eq("id", t.id)
          // The token and the sheet are one creature — the same rule the
          // single-target path learned the hard way.
          if (t.character_id) {
            await db.from("characters")
              .update({ hp_current: next, updated_at: new Date().toISOString() })
              .eq("id", t.character_id)
          }
          // Same rule as the single-target path, through the same function.
          // A Fireball that leaves three people on the brink says so about
          // each of them.
          if (!entry.heals && t.character_id && justBecameDying(cur, next, max)) {
            const { data: ch } = await db
              .from("characters").select("class").eq("id", t.character_id).maybeSingle()
            const warn = announcementFor("dying", ch?.class as string | null)
            if (warn) dyingCues.push({ type: "raw" as const, scope: "party" as const, key: warn })
          }
        }
        victims.push({
          id: t.id, label: t.label ?? "", amount, saved,
          // The TARGET rolled, so a positive margin is how well they got out
          // of the way — the same reading the single-target save path asks
          // for. A spell with no save has no margin to speak of.
          outcome: verdictWord({
            heals: entry.heals, crit: false, fumble: false,
            saved: entry.resolve === "save" ? saved : null, amount, hit: amount > 0,
          }),
          margin: entry.resolve === "save" ? total - dcArea : 0,
          roll, total, dc: entry.resolve === "save" ? dcArea : 0,
          heals: Boolean(entry.heals),
        })
      }

      const line = `${caster.label} casts ${ability} — ${parts.join("; ")}.`
      await narrate(db, caster.label ?? "Someone", line)
      // The blast's damage type travels with it. Without this a Fireball kill
      // produced a bone-white number and a generic corpse, because the board
      // had no word for what had just happened to five creatures at once —
      // the single-target path has carried `damageType` for weeks and the
      // area path simply never did.
      return NextResponse.json({
        ok: true, resolved: true, area: true, line, victims,
        damageType: entry.damage ?? null,
        ...(dyingCues.length ? { sfxCues: dyingCues } : {}),
      })
    }

    // Past here the spell has exactly one victim. Narrowing it once, out
    // loud, rather than asserting it at each of the dozen uses below.
    if (!victim) return NextResponse.json({ error: "token missing" }, { status: 409 })

    if (!weapon && (!entry.dice || entry.resolve === "none" || !entry.resolve)) {
      // Utility spells are real spells; they simply have nothing to roll.
      // They still cost a slot and half a turn.
      await payFor()
      await narrate(db, caster.label ?? "Someone", `${caster.label} casts ${ability}.`)
      return NextResponse.json({ ok: true, resolved: false, note: "no dice to roll for this ability" })
    }

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

    // The caster's own numbers, off the sheet read above — never invented here.
    const scNums = casterSc as { attack_bonus?: number; save_dc?: number } | null
    const attackBonus = scNums?.attack_bonus ?? 4
    const saveDc = scNums?.save_dc ?? 13

    let hit = true
    let crit = false
    let amount = 0
    let line = ""

    // ---- WHAT THE BOARD IS TOLD ---------------------------------------
    //
    // Everything below this point was already computed and then thrown away.
    // The response said { hit, crit, amount } and nothing else, so the board
    // knew an attack had missed but not whether it missed by one or by nine —
    // and a miss that is never explained can only be drawn one way, which is
    // why a dodge has been borrowing the flinch clip since the board was
    // built.
    //
    // These are FACTS, not instructions. The server does not name an
    // animation: it cannot know which clips a given model carries, and the
    // one time it guessed it would be wrong on every token that had been
    // rigged differently. It reports the dice and the margin; the board
    // decides what that looks like on the miniature actually standing there.
    // Same division of labour lib/sfx-cues.ts already argues for at length.
    let roll = 0
    let total = 0
    let dc = 0
    let saved: boolean | null = null
    let fumble = false
    // Weapons carry their type in the damage string ("1d6+1 Piercing");
    // spells carry it on the registry entry. Either way the board gets one
    // lowercase word and does not have to parse a sheet to find it.
    let damageType: string | null = entry.damage ?? null

    if (weapon) {
      // "1d6+1 Piercing" → dice and a type. The type is only used to colour
      // the log; weapons make their noise from their own name.
      const dmgSpec = String(weapon.damage ?? "")
      // "1d6+1 Piercing" → "piercing". Anything unrecognised stays null rather
      // than guessing: a wrong damage type would pick a wrong impact sound,
      // and silence is the better failure.
      damageType = dmgSpec.match(
        /\b(bludgeoning|piercing|slashing|acid|cold|fire|force|lightning|necrotic|poison|psychic|radiant|thunder)\b/i,
      )?.[1]?.toLowerCase() ?? null
      const dicePart = dmgSpec.match(/\d+d\d+\s*(?:[+-]\s*\d+)?/)?.[0] ?? ""
      const flat = dicePart ? 0 : Number.parseInt(dmgSpec.replace(/[^0-9]/g, ""), 10) || 1
      const toHit = Number.parseInt(String(weapon.hit ?? "+0").replace(/[^0-9-]/g, ""), 10) || 0
      roll = d20()
      crit = roll === 20
      fumble = roll === 1
      total = roll + toHit
      dc = ac
      hit = crit || (roll !== 1 && total >= ac)
      if (hit) {
        amount = dicePart ? rollDice(dicePart) : flat
        // A critical rolls the dice again, never the modifier.
        if (crit && dicePart) amount += rollDice(dicePart.replace(/\s*[+-]\s*\d+$/, ""))
        else if (crit) amount += flat
      }
      line = `${caster.label} strikes at ${victim.label} with ${weapon.name} — ${roll}${toHit >= 0 ? "+" : ""}${toHit} = ${total} vs AC ${ac}: ${crit ? "CRITICAL" : hit ? "hit" : "miss"}${hit ? ` for ${amount}` : ""}.`
    } else if (entry.resolve === "attack") {
      roll = d20()
      crit = roll === 20
      fumble = roll === 1
      total = roll + attackBonus
      dc = ac
      hit = crit || (roll !== 1 && total >= ac)
      if (hit) {
        amount = rollDice(entry.dice)
        if (crit) amount += rollDice(entry.dice)
      }
      line = `${caster.label} casts ${ability} at ${victim.label} — ${roll}+${attackBonus} = ${total} vs AC ${ac}: ${crit ? "CRITICAL" : hit ? "hit" : "miss"}${hit ? ` for ${amount}` : ""}.`
    } else if (entry.resolve === "save") {
      // NOTE: on a save it is the TARGET rolling, not the caster. `margin`
      // below is therefore the target's margin of success, and the board must
      // read it as "how well did they get out of the way", not "how badly did
      // the caster miss". The outcome field disambiguates so nothing has to
      // infer this from the sign.
      roll = d20()
      total = roll + saveMod
      dc = saveDc
      saved = total >= saveDc
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
      // The token and the sheet are one creature. Writing only the token is
      // how the board came to believe Kenta was at 0 while his sheet still
      // read 8/8 — the plates, the globes and the character sheet overlay all
      // read `characters`, and none of them had heard about the fight.
      if (victim.character_id) {
        await db.from("characters")
          .update({ hp_current: next, updated_at: new Date().toISOString() })
          .eq("id", victim.character_id)
      }
      // THE CABINET WARNS BEFORE IT MOURNS.
      //
      // Announced on the hit that CROSSES the line, not while they sit below
      // it — see justBecameDying. Asking "are they low" would say it again on
      // every scratch afterwards, four times a round, in a voice that fills
      // the room. The board already marks 0 with a body on the floor; this is
      // the beat before that.
      if (!entry.heals && victim.character_id && justBecameDying(cur, next, max)) {
        const { data: ch } = await db
          .from("characters").select("class").eq("id", victim.character_id).maybeSingle()
        const warn = announcementFor("dying", ch?.class as string | null)
        if (warn) dyingCues.push({ type: "raw" as const, scope: "party" as const, key: warn })
      }
      if (!entry.heals && next === 0) line += ` ${victim.label} goes down.`
    }
    await narrate(db, caster.label ?? "Someone", line)

    // Paid by the same call that resolved it, so a hit and its cost can never
    // drift apart.
    await payFor()

    // One word for what happened — see verdictWord at the top of the file.
    const outcome: string = verdictWord({
      heals: entry.heals, weapon: Boolean(weapon), crit, fumble, saved, amount, hit,
    })

    return NextResponse.json({
      ok: true, resolved: true, hit, crit, amount,
      heals: Boolean(!weapon && entry.heals),
      weapon: Boolean(weapon),
      line,
      // Empty unless this hit put somebody on the brink. Spread rather than
      // sent as [] so a cast that changed nothing carries no sound key at
      // all — the cue reader ignores unknown and absent alike, but an empty
      // array in every response is noise in the logs.
      ...(dyingCues.length ? { sfxCues: dyingCues } : {}),

      // ---- ADDED: the facts behind the verdict -------------------------
      // Every field here was already computed above. None of it is new
      // rolling; it is the same dice, no longer discarded on the way out.
      outcome,
      /** The d20 face. On a save this is the TARGET's die, not the caster's. */
      roll,
      /** Roll plus the relevant modifier. */
      total,
      /** What `total` was measured against — AC for attacks, save DC for saves. */
      dc,
      /**
       * How far the roll cleared or fell short of `dc`. Negative is a failure.
       *
       * This is the field that lets a miss mean something. A martial who is
       * missed by 2 was very nearly hit and should turn the blade aside; one
       * missed by 9 was never in danger and should simply not be where the
       * sword went. Same event, same `hit: false`, two different pictures —
       * and the board can only tell them apart if it is given the number.
       */
      margin: total - dc,
      /** True only on a natural 1. A fumble is not merely a large miss. */
      fumble,
      /** null when the ability was not resolved by a saving throw. */
      saved,
      /** Lowercase 5E damage type, or null when the ability deals none. */
      damageType,
      /** Echoed so a late response cannot be applied to the wrong miniature. */
      target_token: victim.id,
      caster_token: caster.id,
    })
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
    // THE TURN HAS PASSED — AND THE CABINET SAYS WHOSE.
    //
    // This rang a bell. A bell tells the table that SOMETHING happened and
    // makes each of four people check whether it was them; the arcade solved
    // that in 1985 by saying the class out loud. So: look up who is up, and
    // if they are a player with a recorded line, play it.
    //
    // Falls back to the old chime for an NPC's turn, deliberately. Gauntlet
    // never announced the monsters, but the table still needs to know the
    // turn moved — silence there would read as the board having hung.
    let cue = "ui/turn_chime"
    const nextEntry = (combat.turn_order as { token_id: string }[])[nextIndex]
    if (nextEntry?.token_id) {
      const { data: tok } = await db
        .from("vtt_tokens")
        .select("character_id")
        .eq("id", nextEntry.token_id)
        .maybeSingle()
      if (tok?.character_id) {
        const { data: ch } = await db
          .from("characters")
          .select("class")
          .eq("id", tok.character_id)
          .maybeSingle()
        cue = announcementFor("turn", ch?.class as string | null) ?? cue
      }
    }
    return NextResponse.json({
      ok: true,
      sfxCues: [{ type: "raw" as const, scope: "party" as const, key: cue }],
    })
  }

  // end
  const { error } = await db
    .from("combat_state")
    .update({ status: "ended", updated_at: new Date().toISOString() })
    .eq("id", combat.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Ending combat is deliberately silent. The bank has no clip for it, and a
  // turn chime here would say the wrong thing - the fight is over, nobody is up.
  return NextResponse.json({ ok: true })
}
