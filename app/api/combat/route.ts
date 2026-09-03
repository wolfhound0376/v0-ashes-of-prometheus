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
import { attacksFromInventory, type DerivedAttack } from "@/lib/weapons"
// The gate between the pack and the rack: a dagger you are carrying is
// luggage, a dagger in your hand is what Attack means.
import { equippedWeapons } from "@/lib/equipped"
import { announcementFor, justBecameDying } from "@/lib/announcer"
// Mage Hand and whatever is summoned after it: the spell's own rules, pure.
import {
  MAGE_HAND, summonMageHand, normaliseSummon, expired, withinLeash, withinCastRange, canReach, handUse,
} from "@/lib/summons"
import { normalizeConditions } from "@/lib/conditions"
// Sanctuary and Shield of Faith: the protections that ride on a token until
// their duration runs out or their bearer swings first.
import {
  wardSpellFor, wardRounds, normaliseWard, wardExpired, wardCondition,
  wardAcBonus, needsSanctuarySave, resolveSanctuary, breaksSanctuary,
} from "@/lib/wards"
// What a spell DOES, as data rather than as a branch — and the fallback that
// means no spell is ever silent again.
import { effectsFor, needsRuling, spendHpPool, type SpellEffect } from "@/lib/spell-effects"
// Dropping to 0 hit points, as the SRD writes it. The rule lives in
// lib/death-saves so it can be read whole and tested on every die face;
// this file only owns the rows.
import { normaliseSaves, vitalityOf, conditionsFor, takeDamage, heal, rollDeathSave } from "@/lib/death-saves"
// Whose turn is next when some of them are dead. Pure, so the round
// arithmetic can be tested on a board of corpses without one existing.
import { advanceTurn } from "@/lib/turn-order"
// Blood on the tiles: laid by steel in melee, kept on the map row. Purely a
// mark - the SRD has no bleeding rule and none is invented here.
import { bleeds, poolSize, makeMark, appendMark, normaliseMarks } from "@/lib/blood-marks"
// Hiding, as the SRD writes it: Stealth against passive Perception, and
// refused outright against anyone with a clear view.
import { resolveHide, stealthProficiency, lineIsClear, type Onlooker } from "@/lib/hiding"
// The rogue's feature, as its own testable rule rather than four conditions
// buried in the damage roll.
import { sneakAttackFor, type SneakAttackVerdict } from "@/lib/sneak-attack"

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
    .select("id,label,character_id,bestiary_id,grid_x,grid_y,hp_current,hp_max,combat_disposition,allegiance,is_visible,ward")
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
    ac: (t.character_id
      ? charAc.get(t.character_id) ?? 10
      : ((beast.get(t.bestiary_id ?? "")?.ac as number | undefined) ?? 10))
      // Shield of Faith reaches the AI's own reading of the number too, or an
      // NPC would swing at a creature whose armour it does not believe in.
      + wardAcBonus(normaliseWard((t as { ward?: unknown }).ward)),
    warded: normaliseWard((t as { ward?: unknown }).ward)?.spell === "sanctuary",
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

/**
 * HIT POINTS, SETTLED IN ONE PLACE.
 *
 * Three paths used to write hit points — the player's cast, the area cast,
 * and the NPC turn — and each clamped at 0 and stopped. "A token at 0 is
 * down, not negative; the dying rules are the DM's." The DM has now ruled
 * that the board runs them: SRD 5.1, "Dropping to 0 Hit Points".
 *
 * So this is the only function that changes a hit-point number. For a
 * creature without a sheet it is the old arithmetic. For a player character
 * it also runs the rule: a drop to 0 is Unconscious (or dead outright, when
 * the damage left over equals the maximum); damage at 0 is a failed death
 * save, two on a critical; healing from 0 wakes them and clears the tally.
 * Token and sheet are written together, because the day they were not is
 * the day Kenta's card read 8/8 while his token lay at 0.
 *
 * Returns the sentence the log should add, if the state changed in a way
 * worth a sentence.
 */
async function settleHitPoints(
  db: ReturnType<typeof createAdminClient>,
  a: {
    characterId: string | null
    tokenId: string
    label: string
    cur: number
    max: number
    amount: number
    heals: boolean
    crit?: boolean
    by: string
  },
): Promise<{ hp: number; note: string | null; fell: boolean }> {
  const stamp = new Date().toISOString()
  if (!a.characterId) {
    // No sheet, no death saves. SRD: "Most DMs have a monster die the
    // instant it drops to 0 hit points."
    const hp = a.heals ? Math.min(a.max, a.cur + a.amount) : Math.max(0, a.cur - a.amount)
    await db.from("vtt_tokens").update({ hp_current: hp, updated_by: a.by, updated_at: stamp }).eq("id", a.tokenId)
    const fell = !a.heals && hp === 0 && a.cur > 0
    return { hp, note: fell ? `${a.label} goes down.` : null, fell }
  }
  const { data: ch } = await db
    .from("characters").select("conditions").eq("id", a.characterId).maybeSingle()
  // The tally column arrives by migration. Asked for on its own so that a
  // deploy that beats the migration still writes hit points; it merely
  // cannot remember the count until the column exists.
  const { data: tally } = await db
    .from("characters").select("death_saves").eq("id", a.characterId).maybeSingle()
  const conditions = normalizeConditions(ch?.conditions)
  const saves = normaliseSaves((tally as { death_saves?: unknown } | null)?.death_saves)
  const vitality = vitalityOf(a.cur, conditions)
  const out = a.heals
    ? heal({ hp: a.cur, max: a.max, amount: a.amount, vitality, saves })
    : takeDamage({ label: a.label, hp: a.cur, max: a.max, amount: a.amount, crit: a.crit, saves, vitality })
  await db.from("vtt_tokens").update({ hp_current: out.hp, updated_by: a.by, updated_at: stamp }).eq("id", a.tokenId)
  await db.from("characters")
    .update({ hp_current: out.hp, conditions: conditionsFor(conditions, out.vitality), updated_at: stamp })
    .eq("id", a.characterId)
  await db.from("characters").update({ death_saves: out.saves }).eq("id", a.characterId)
  return { hp: out.hp, note: out.note, fell: !a.heals && a.cur > 0 && out.hp === 0 }
}

/**
 * Is this creature tagged Bleeding? A word the DM puts in the conditions by
 * hand - on the sheet for a player, on the encounter row for a monster. It
 * is not an SRD condition and it does nothing to hit points; it only means
 * the next blade that lands leaves blood on the floor.
 */
async function isBleeding(
  db: ReturnType<typeof createAdminClient>,
  characterId: string | null,
  label: string,
): Promise<boolean> {
  const raw = characterId
    ? (await db.from("characters").select("conditions").eq("id", characterId).maybeSingle()).data?.conditions
    : (await db.from("npc_encounters").select("conditions").eq("name", label).limit(1).maybeSingle()).data?.conditions
  return normalizeConditions(raw).some((c) => c.toLowerCase() === "bleeding")
}

/**
 * Lay a pool of blood on a square. Appended to vtt_maps.meta.marks, which
 * every board reads at load and Realtime carries live, so the whole table
 * sees the same stain and a reload does not clean the floor.
 */
async function layBlood(
  db: ReturnType<typeof createAdminClient>,
  mapId: string,
  x: number,
  y: number,
  size: number,
  salt: string,
): Promise<void> {
  const { data: row } = await db.from("vtt_maps").select("meta").eq("id", mapId).maybeSingle()
  const meta = ((row?.meta as Record<string, unknown> | null) ?? {})
  const marks = appendMark(
    normaliseMarks(meta.marks),
    makeMark({ x, y, size, at: new Date().toISOString(), salt }),
  )
  await db.from("vtt_maps").update({ meta: { ...meta, marks } }).eq("id", mapId)
}

/**
 * THE START OF A DOWNED CHARACTER'S TURN.
 *
 * SRD: "Whenever you start your turn with 0 hit points, you must make a
 * special saving throw, called a death saving throw." The die is rolled
 * here, where it cannot be argued with, the moment the turn passes to them.
 * Nothing else is theirs to do that turn: an unconscious character cannot
 * move or act, so the economy is written as spent and the DM ends the turn.
 *
 * Returns true when the turn belonged to someone at 0, so the caller knows
 * the economy has been written.
 */
async function deathSaveOnTurnStart(
  db: ReturnType<typeof createAdminClient>,
  combatId: string,
  tokenId: string,
  characterId: string,
): Promise<boolean> {
  const { data: ch } = await db
    .from("characters").select("name,hp_current,hp_max,conditions").eq("id", characterId).maybeSingle()
  if (!ch) return false
  const conditions = normalizeConditions(ch.conditions)
  const vitality = vitalityOf(ch.hp_current, conditions)
  if (vitality === "up") return false
  const label = (ch.name as string | null) ?? "Someone"
  const stamp = new Date().toISOString()
  if (vitality === "dead") {
    await narrate(db, label, `${label} lies dead.`)
  } else if (vitality === "stable") {
    await narrate(db, label, `${label} is stable, and still unconscious.`)
  } else {
    const { data: tally } = await db
      .from("characters").select("death_saves").eq("id", characterId).maybeSingle()
    const saves = normaliseSaves((tally as { death_saves?: unknown } | null)?.death_saves)
    const out = rollDeathSave({ label, roll: d20(), saves })
    await db.from("characters")
      .update({ hp_current: out.hp, conditions: conditionsFor(conditions, out.vitality), updated_at: stamp })
      .eq("id", characterId)
    await db.from("characters").update({ death_saves: out.saves }).eq("id", characterId)
    if (out.hp > 0) {
      // A 20: back on their feet with 1 hit point, on the token too.
      await db.from("vtt_tokens").update({ hp_current: out.hp, updated_by: "death-save", updated_at: stamp }).eq("id", tokenId)
    }
    await narrate(db, label, out.note ?? "")
    if (out.vitality === "up") return false
  }
  // Down for the turn: nothing to spend. The DM passes it on.
  await db.from("combat_state")
    .update({
      turn_state: { action: true, bonus: true, reaction: true, moved_ft: 0, acknowledged: true },
      updated_at: stamp,
    })
    .eq("id", combatId)
  return true
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
  // THE PLAYER'S VERBS — one list, used twice, deliberately.
  //
  // A player must be able to mark their own bonus action used, acknowledge
  // their own turn, walk their own character, cast, hide and summon without
  // the DM clicking for them. Everything else — rolling initiative, passing
  // the turn, ending the fight, and "npc-turn", which swings on the monsters'
  // behalf — is the DM's chair and stays behind the key.
  //
  // These were TWO hand-written lists, and keeping them in step was left to
  // whoever added a verb next. Two of us in a row failed to: "hide" was in
  // neither, "summon" (Mage Hand, #373) is in the accepted list but not the
  // gate. Both shipped complete, tested, and unreachable — a 403 before the
  // first line of their handler.
  //
  // That failure is silent in the worst way. The hide handler narrates even
  // when it REFUSES, so a player would see "somebody has a clear view of
  // you" — but the one refusal it could not narrate was the one that stopped
  // it running, which is why the evidence was an empty log rather than a
  // wrong row.
  //
  // So: one list. A verb added here is accepted AND ungated, and the third
  // person to add one cannot make this mistake, because there is no longer a
  // second place to forget.
  //
  // Ungated means the player may ASK, not that the answer is yes. Every
  // handler still fences server-side: only the ACTIVE turn's own PC token
  // moves, and only within its speed budget.
  const PLAYER_VERBS = ["spend", "ack", "move", "cast", "hide", "summon"]
  const DM_VERBS = ["start", "next", "end", "npc-turn"]
  if (!PLAYER_VERBS.includes(action) && !authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 403 })
  }
  if (![...DM_VERBS, ...PLAYER_VERBS].includes(action)) {
    // Derived, not hand-written. The old message listed the verbs as a string
    // literal that had already drifted from the list it described, and a 400
    // that lies about what the endpoint accepts is how the next verb goes
    // missing quietly.
    return NextResponse.json(
      { error: `unknown action ${String(action)} — expected one of ${[...DM_VERBS, ...PLAYER_VERBS].join(", ")}` },
      { status: 400 },
    )
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
      .select("id,label,character_id,bestiary_id,is_visible,combat_disposition,summon")
      .eq("map_id", map.id)
      .eq("is_visible", true)
    if (!allTokens?.length) return NextResponse.json({ error: "no tokens on the board" }, { status: 409 })
    // The prisoners who will not fight are not IN the fight. Sam's ruling:
    // the twins, Stool, Jimjar, Shuushar and Buppido "never fight but runaway
    // to the edge of the game map. They can still be hit and targeted but
    // they don't roll initiative." So they are excluded here and moved by the
    // end-of-round world step instead — present on the board, absent from the
    // order, which is exactly how a panicking bystander behaves.
    // A summoned effect - a Mage Hand - is a token but not a creature: the
    // SRD gives it no turn. Its caster's action is its turn.
    const tokens = allTokens.filter((t) => t.combat_disposition !== "flees" && !(t as { summon?: unknown }).summon)
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
    // SRD, Mage Hand: "The hand vanishes if it is ever more than 30 feet
    // away from you." The caster walking away is the usual way that happens.
    const { data: hands } = await db
      .from("vtt_tokens").select("id,label,grid_x,grid_y").eq("summon->>caster_token", token_id)
    for (const h of hands ?? []) {
      if (withinLeash({ x: h.grid_x ?? 0, y: h.grid_y ?? 0 }, { x: gx, y: gy })) continue
      await db.from("vtt_tokens").delete().eq("id", h.id)
      await narrate(db, h.label ?? MAGE_HAND.name, `${h.label ?? MAGE_HAND.name} is left more than ${MAGE_HAND.leashFt} ft behind, and fades.`)
    }
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
        // Token and sheet together, and the dying rules with them — see
        // settleHitPoints. THIS is the path that hurts players: a drow crit
        // Kenta for 11 once and his card went on reading 8/8.
        const settled = await settleHitPoints(db, {
          characterId: (target as { character_id?: string | null }).character_id ?? null,
          tokenId: target.token_id,
          label: target.label,
          cur: target.hp_current ?? target.hp_max ?? 0,
          max: target.hp_max ?? 0,
          amount: decision.damage,
          heals: false,
          crit: decision.crit,
          by: "npc-ai",
        })
        if (settled.note) decision.narration += ` ${settled.note}`
        // Steel in melee leaves its mark on the floor: the blow that drops
        // someone, or any blow on someone the DM has tagged Bleeding.
        if (!decision.attack.ranged) {
          const bleeding = await isBleeding(db, (target as { character_id?: string | null }).character_id ?? null, target.label)
          if (bleeds({ melee: true, amount: decision.damage, fell: settled.fell, bleeding })) {
            await layBlood(db, map.id, target.x, target.y, poolSize({ amount: decision.damage, fell: settled.fell }), target.token_id)
          }
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

  if (action === "summon") {
    // THE HAND ANSWERS TO ITS CASTER'S ACTION. SRD: "You can use your action
    // to control the hand ... move the hand up to 30 feet each time you use
    // it ... dismiss it as an action." Three ops - move, use, dismiss - and
    // every one of them spends the caster's action, on the caster's turn.
    const op = String(body?.op ?? "")
    const token_id = String(body?.token_id ?? "")
    const { data: hand } = await db
      .from("vtt_tokens").select("id,map_id,label,grid_x,grid_y,summon").eq("id", token_id).maybeSingle()
    const info = hand ? normaliseSummon(hand.summon) : null
    if (!hand || !info) return NextResponse.json({ error: "that is not a summoned effect" }, { status: 409 })
    const order = combat.turn_order as { token_id: string }[]
    const entry = order[combat.active_index]
    if (!entry || entry.token_id !== info.caster_token) {
      return NextResponse.json({ error: "the hand moves on its caster's turn" }, { status: 409 })
    }
    const state = (combat.turn_state ?? {}) as { action?: boolean; bonus?: boolean; reaction?: boolean; moved_ft?: number; acknowledged?: boolean }
    if (state.action) return NextResponse.json({ error: "the action is already spent this turn" }, { status: 409 })
    const { data: casterTok } = await db
      .from("vtt_tokens").select("id,label,grid_x,grid_y").eq("id", info.caster_token).maybeSingle()
    const casterName = casterTok?.label ?? "The caster"
    const stamp = new Date().toISOString()

    if (op === "move") {
      const gx = Number(body?.gx)
      const gy = Number(body?.gy)
      const { data: dims } = await db.from("vtt_maps").select("grid_width,grid_height").eq("id", hand.map_id).maybeSingle()
      if (!Number.isInteger(gx) || !Number.isInteger(gy) || gx < 0 || gy < 0 || !dims || gx >= dims.grid_width || gy >= dims.grid_height) {
        return NextResponse.json({ error: "destination off the board" }, { status: 400 })
      }
      const from = { x: hand.grid_x ?? 0, y: hand.grid_y ?? 0 }
      if (!canReach(from, { x: gx, y: gy })) {
        return NextResponse.json({ error: `the hand moves up to ${MAGE_HAND.moveFt} ft at a time` }, { status: 409 })
      }
      const casterAt = { x: casterTok?.grid_x ?? 0, y: casterTok?.grid_y ?? 0 }
      if (!withinLeash({ x: gx, y: gy }, casterAt)) {
        // Sent past the leash: the SRD says it vanishes, so it vanishes.
        await db.from("vtt_tokens").delete().eq("id", hand.id)
        await narrate(db, casterName, `${casterName} sends the hand past ${MAGE_HAND.leashFt} ft — it fades.`)
      } else {
        await db.from("vtt_tokens")
          .update({ grid_x: gx, grid_y: gy, updated_by: "summon-move", updated_at: stamp })
          .eq("id", hand.id)
        await narrate(db, casterName, `${casterName}'s spectral hand drifts ${Math.max(Math.abs(gx - from.x), Math.abs(gy - from.y)) * 5} ft.`)
      }
    } else if (op === "use") {
      const use = handUse(String(body?.what ?? ""))
      if (!use) return NextResponse.json({ error: "the hand can manipulate, open, stow or pour — nothing else" }, { status: 400 })
      await narrate(db, casterName, use.line(casterName))
    } else if (op === "dismiss") {
      await db.from("vtt_tokens").delete().eq("id", hand.id)
      await narrate(db, casterName, `${casterName} dismisses the spectral hand.`)
    } else {
      return NextResponse.json({ error: "summon needs op: 'move'|'use'|'dismiss'" }, { status: 400 })
    }

    const spent = { ...state, action: true }
    await db.from("combat_state").update({ turn_state: spent, updated_at: stamp }).eq("id", combat.id)
    return NextResponse.json({ ok: true, turn_state: spent })
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
      .select("id,map_id,label,character_id,bestiary_id,hp_current,hp_max,allegiance,grid_x,grid_y,is_visible,ward")
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
    // ATTACKING GIVES YOU AWAY — hit OR miss.
    //
    // SRD 5.1, Combat: Unseen Attackers and Targets — "If you are hidden,
    // both unseen and unheard, when you make an attack, you give away your
    // location when the attack hits or misses."
    //
    // BOTH. Players consistently expect a miss to leave them hidden, and it
    // is the single most-forgotten clause in the hiding rules. Cleared here,
    // before the roll rather than after it, so it happens whatever the dice
    // say and however this handler returns.
    if (caster) {
      void db.from("vtt_tokens")
        .update({ is_hidden: false, updated_by: "reveal-on-attack", updated_at: new Date().toISOString() })
        .eq("id", caster_token)
        .eq("is_hidden", true)
    }

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
    let sheetAttacks: DerivedAttack[] = []
    let casterSc: Spellcasting | null = null
    // Hoisted out of the block below because SNEAK ATTACK needs them at the
    // damage roll, three hundred lines down. `cs` itself is block-scoped and
    // stays that way; only the two fields the rule asks for travel.
    let casterClass: string | null = null
    let casterLevel = 1
    if (caster.character_id) {
      const { data: cs } = await db.from("characters")
        .select("sheet_spellcasting,str_score,dex_score,proficiency_bonus,class,level")
        .eq("id", caster.character_id).maybeSingle()
      casterSc = (cs?.sheet_spellcasting ?? null) as Spellcasting | null
      casterClass = (cs?.class as string | null) ?? null
      casterLevel = Number(cs?.level ?? 1) || 1
      const { data: inv } = await db.from("inventory_items")
        .select("name,item_key,item_type,equippable_slot,items(item_type,properties,equippable_slot)")
        .eq("character_id", caster.character_id)
      // WHAT IS IN THEIR HANDS, not what is in their pack. Sam: "This should
      // just trigger as a standard attack as long as it is equipped."
      //
      // The anti-drift rule lib/weapons was built on is unchanged — the rack
      // is still a FUNCTION of state, never a hand-kept list. This only
      // narrows which state, from "carried" to "carried AND equipped", so a
      // browser naming a sheathed weapon is refused by the same function the
      // board built its rack with.
      const { data: doll } = await db.from("equipment_items")
        .select("slot,item_key,name,equipped")
        .eq("character_id", caster.character_id)
      const inHand = equippedWeapons(
        inv as Parameters<typeof equippedWeapons>[0],
        doll as Parameters<typeof equippedWeapons>[1],
      )
      sheetAttacks = attacksFromInventory(inHand as Parameters<typeof attacksFromInventory>[0], {
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
    // DECLARED ABOVE payFor, WHICH CLOSES OVER IT — and that ordering is the
    // whole bug.
    //
    // This `let` used to sit 300 lines further down, next to the attack roll
    // that assigns it. payFor references `sneak.applies`, and payFor is called
    // from FOUR places: the attack path (after that declaration — fine), and
    // the Mage Hand summon, the no-dice area path and the no-dice utility
    // path (all BEFORE it). A `let` read before its line runs is a temporal
    // dead zone, and the runtime says so:
    //
    //   ReferenceError: Cannot access 'eu' before initialization
    //
    // Five of those in Vercel's logs on 2026-09-03 between 02:16:58 and
    // 02:20:00, every one a POST /api/combat 500, every one Sam pressing
    // Sanctuary or Shield of Faith and watching nothing happen. Guiding Bolt
    // at 02:16:39 on the same deployment returned 200, because an attack
    // reaches the declaration first. tsc cannot see this: a closure over a
    // later `let` is legal TypeScript.
    //
    // Since the rogue's sneak-attack PR landed, every spell with no dice to
    // roll — and every Mage Hand — has crashed on payment.
    let sneak: SneakAttackVerdict = { applies: false, dice: "", reason: "" }

    /**
     * The caster's OWN Sanctuary, if the thing they just did was aggressive.
     *
     * SRD: "If the warded creature makes an attack, casts a spell that affects
     * an enemy, or deals damage to another creature, this spell ends."
     *
     * Aggression, not activity — and that distinction is the spell. Ending it
     * on any cast would forbid a warded cleric from healing their friends,
     * which is the only thing they are still good for; never ending it would
     * make one first-level slot into permanent immunity while you shoot
     * people. `helpful` is the spellbook's own flag, so a Cure Wounds passes
     * through and a Guiding Bolt does not.
     */
    const breakOwnSanctuary = async () => {
      const mine = normaliseWard((caster as { ward?: unknown }).ward)
      if (mine?.spell !== "sanctuary") return
      if (!breaksSanctuary({ weapon: Boolean(weapon), harmful: Boolean(entry && !entry.helpful) })) return
      const stamp = new Date().toISOString()
      await db.from("vtt_tokens").update({ ward: null, updated_by: "sanctuary-broken", updated_at: stamp }).eq("id", caster.id)
      if (caster.character_id) {
        const { data: ch } = await db.from("characters").select("conditions").eq("id", caster.character_id).maybeSingle()
        const conds = normalizeConditions(ch?.conditions).filter((c) => c.toLowerCase() !== "sanctuary")
        await db.from("characters").update({ conditions: conds, updated_at: stamp }).eq("id", caster.character_id)
      }
      await narrate(db, caster.label ?? "Someone", `${caster.label} strikes out, and the sanctuary around them fails.`)
    }

    /**
     * Lay a spell's declared effects on some creatures, and stamp the
     * conditions where the sheets already show them.
     *
     * One writer for every spell, which is the whole point: adding Hold Person
     * is a row in SPELL_EFFECTS, not a branch in this file.
     *
     * `dm` effects are not applied here — they are carried back to the caller
     * for Malachar, because a ruling is a conversation and this function only
     * writes rows.
     */
    const layEffects = async (
      effects: SpellEffect[],
      targets: { id: string; label: string | null; character_id: string | null }[],
    ): Promise<number> => {
      const timed = effects.filter((e) => e.kind === "condition" || e.kind === "buff")
      if (!timed.length || !targets.length) return 0
      const stamp = new Date().toISOString()
      let laid = 0
      for (const t of targets) {
        const { data: row } = await db.from("vtt_tokens").select("effects").eq("id", t.id).maybeSingle()
        const existing = Array.isArray(row?.effects) ? (row!.effects as unknown[]) : []
        const added = timed.map((e) => ({
          condition: e.kind === "condition" ? e.condition : `${ability} (${e.dice} ${e.applies})`,
          spell: ability,
          caster_token: caster.id,
          cast_round: combat.round,
          expires_round: combat.round + (e.kind === "condition" ? e.rounds : e.rounds),
          ends_on_damage: e.kind === "condition" ? Boolean(e.endsOnDamage) : false,
          save: e.kind === "condition" ? (e.save ?? null) : null,
          save_ends: e.kind === "condition" ? Boolean(e.saveEnds) : false,
        }))
        const { error } = await db.from("vtt_tokens")
          .update({ effects: [...existing, ...added], updated_by: "player-cast", updated_at: stamp })
          .eq("id", t.id)
        // Never swallowed: an effect that failed to write is a spell the
        // player paid for and did not get.
        if (error) continue
        laid += 1
        // And the word, where the sheet already knows how to show it.
        if (t.character_id) {
          const { data: ch } = await db.from("characters").select("conditions").eq("id", t.character_id).maybeSingle()
          const conds = normalizeConditions(ch?.conditions)
          const want = added.map((a) => a.condition).filter((w) => !conds.some((c) => c.toLowerCase() === w.toLowerCase()))
          if (want.length) {
            await db.from("characters").update({ conditions: [...conds, ...want], updated_at: stamp }).eq("id", t.character_id)
          }
        }
      }
      return laid
    }

    const payFor = async () => {
      await breakOwnSanctuary()
      await db.from("combat_state")
        .update({
          // `sneak_used` is the ONCE PER TURN latch. It rides in turn_state
          // because that object is already wiped wholesale when the turn
          // passes (action:"next" rewrites it), so the latch clears itself
          // and there is no second thing to remember to reset.
          turn_state: { ...st, [phase]: true, ...(sneak.applies ? { sneak_used: true } : {}) },
          updated_at: new Date().toISOString(),
        })
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
        // MAGE HAND puts a token on the square. SRD: "A spectral, floating
        // hand appears at a point you choose within range ... The hand
        // vanishes if ... you cast this spell again." So: range checked,
        // the previous hand (if any) gone, a new one placed, no dice.
        if (ability.toLowerCase() === MAGE_HAND.key) {
          const origin = { x: caster.grid_x ?? 0, y: caster.grid_y ?? 0 }
          if (!withinCastRange(aim, origin)) {
            return NextResponse.json(
              { error: `${MAGE_HAND.name} reaches ${MAGE_HAND.leashFt} ft — that square is further than that.` },
              { status: 409 },
            )
          }
          await db.from("vtt_tokens").delete().eq("map_id", caster.map_id).eq("summon->>caster_token", caster.id)
          const { error: handErr } = await db.from("vtt_tokens").insert({
            map_id: caster.map_id,
            label: MAGE_HAND.name,
            model_url: MAGE_HAND.sprite,
            model_scale: 1,
            grid_x: aim.x,
            grid_y: aim.y,
            token_size: "small",
            tint_color: "#4fa8ff",
            allegiance: caster.allegiance ?? "party",
            is_visible: true,
            hp_current: null,
            hp_max: null,
            combat_disposition: "fights",
            updated_by: "player-cast",
            summon: summonMageHand({ casterToken: caster.id, characterId: caster.character_id ?? null, round: combat.round }),
          })
          if (handErr) return NextResponse.json({ error: handErr.message }, { status: 500 })
          await payFor()
          await narrate(db, caster.label ?? "Someone", `${caster.label} casts ${MAGE_HAND.name} — a spectral hand appears ${Math.max(Math.abs(aim.x - origin.x), Math.abs(aim.y - origin.y)) * 5} ft away.`)
          return NextResponse.json({ ok: true, resolved: false, note: "summoned", summoned: true })
        }
        // A point spell with no shape lands on its square and does nothing to
        // anybody — Misty Step, Minor Illusion. Real spells with nothing to
        // roll.
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
      // nothing. They are real spells that have already cost a slot, and
      // until now that is ALL they did.
      if (!entry.dice || !entry.resolve || entry.resolve === "none") {
        const areaEffects = effectsFor(ability)
        let handled = false
        const parts: string[] = []

        // A POOL OF HIT POINTS, SPENT ON THE WEAKEST FIRST — Sleep.
        //
        // It could never be expressed as damage or as a plain condition: it
        // takes a NUMBER OF CREATURES decided by their hit points rather than
        // by a saving throw, which is why it sat here doing nothing.
        const pool = areaEffects.find((e) => e.kind === "hpPool")
        if (pool && pool.kind === "hpPool") {
          const total = rollDice(pool.dice)
          // The species word, for the undead exclusion.
          const typeById = new Map<string, string | null>()
          const beastIds = caught.map((t) => t.bestiary_id).filter(Boolean) as string[]
          if (beastIds.length) {
            const { data: bs } = await db.from("bestiary").select("id,creature_type").in("id", beastIds)
            for (const b of bs ?? []) typeById.set(b.id, b.creature_type as string | null)
          }
          const { affected } = spendHpPool({
            pool: total,
            candidates: caught.map((t) => ({
              id: t.id, label: t.label ?? "Something", hp: t.hp_current ?? t.hp_max ?? null,
              creatureType: t.bestiary_id ? typeById.get(t.bestiary_id) ?? null : null,
            })),
            immuneTypes: pool.immuneTypes,
          })
          if (affected.length) {
            const stamp = new Date().toISOString()
            for (const a of affected) {
              const t = caught.find((c) => c.id === a.id)
              const { data: row } = await db.from("vtt_tokens").select("effects").eq("id", a.id).maybeSingle()
              const existing = Array.isArray(row?.effects) ? (row!.effects as unknown[]) : []
              await db.from("vtt_tokens").update({
                effects: [...existing, {
                  condition: pool.condition, spell: ability, caster_token: caster.id,
                  cast_round: combat.round, expires_round: combat.round + 10,
                  ends_on_damage: pool.endsOnDamage, save: null, save_ends: false,
                }],
                updated_by: "player-cast", updated_at: stamp,
              }).eq("id", a.id)
              if (t?.character_id) {
                const { data: ch } = await db.from("characters").select("conditions").eq("id", t.character_id).maybeSingle()
                const conds = normalizeConditions(ch?.conditions)
                if (!conds.some((c) => c.toLowerCase() === pool.condition.toLowerCase())) {
                  await db.from("characters").update({ conditions: [...conds, pool.condition], updated_at: stamp }).eq("id", t.character_id)
                }
              }
            }
            parts.push(`${total} hit points of sleep: ${affected.map((a) => a.label).join(", ")} ${affected.length === 1 ? "falls" : "fall"} unconscious`)
          } else {
            parts.push(`${total} hit points of sleep, and nobody weak enough to take it`)
          }
          handled = true
        }

        // Everything else declared — Faerie Fire's outline, and any condition
        // added to the table later.
        const laid = await layEffects(areaEffects, caught.map((t) => ({ id: t.id, label: t.label, character_id: t.character_id })))
        if (laid) { handled = true; parts.push(`${caught.map((t) => t.label).join(", ")} are affected`) }

        const line = parts.length
          ? `${caster.label} casts ${ability} — ${parts.join("; ")}.`
          : `${caster.label} casts ${ability} — it covers ${caught.map((t) => t.label).join(", ")}.`
        await narrate(db, caster.label ?? "Someone", line)

        // AND IF NOTHING MECHANISED IT, THE DM RULES IT. See lib/spell-effects:
        // silence is a bug, a ruling is not.
        const ruling = needsRuling({ effects: areaEffects, handled })
          ? { spell: ability, text: areaEffects.find((e) => e.kind === "dm")?.text ?? null }
          : null
        if (ruling) {
          await narrate(db, "Board", `${ability} needs a ruling from Malachar.${ruling.text ? ` (${ruling.text})` : ""}`)
        }
        return NextResponse.json({
          ok: true, resolved: Boolean(handled), area: true, line,
          victims: caught.map((t) => ({ id: t.id, label: t.label ?? "", amount: 0, outcome: "hit", fell: false, heals: false })),
          ...(ruling ? { ruling } : {}),
          note: handled ? "effects" : "ruling",
        })
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
        /**
         * Did THIS blast put them on the floor?
         *
         * settleHitPoints has always known - it is what decides whether blood
         * is laid and how big the pool is - and the answer was thrown away at
         * the edge of the handler. The banner needs it to say "burns" rather
         * than guessing from a hit-point number it would have to fetch again
         * and could race with the next write.
         */
        fell: boolean
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

        // Hoisted out of the block below, where settleHitPoints lives: a
        // creature that took nothing cannot have fallen, so `false` is the
        // right answer for every branch that never gets there.
        let fell = false
        if (amount > 0) {
          const cur = t.hp_current ?? t.hp_max ?? 0
          const max = t.hp_max ?? cur
          // Token and sheet together, dying rules included — the same
          // function the single-target path and the NPC turn use, so a
          // Fireball drops a character exactly the way a sword does.
          const settled = await settleHitPoints(db, {
            characterId: t.character_id ?? null, tokenId: t.id, label: t.label ?? "Someone",
            cur, max, amount, heals: Boolean(entry.heals), by: "player-cast",
          })
          const next = settled.hp
          fell = settled.fell
          if (settled.note) parts.push(settled.note.replace(/\.$/, ""))
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
          id: t.id, label: t.label ?? "", amount, saved, fell,
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

      // A WARD IS A UTILITY SPELL THAT DOES SOMETHING.
      //
      // Sam: "This spell should ... create a condition that the NPCs and
      // monsters respect until violated." Sanctuary and Shield of Faith go on
      // the TOKEN, beside Mage Hand's summon and swept by the same round
      // turn, so the NPC AI and the attack roll can both see them.
      const ward = wardSpellFor(ability)
      if (ward) {
        const stamp = new Date().toISOString()
        const info = {
          spell: ward,
          caster_token: caster.id,
          cast_round: combat.round,
          expires_round: combat.round + wardRounds(ward),
        }
        const { error: wardErr } = await db.from("vtt_tokens")
          .update({ ward: info, updated_by: "player-cast", updated_at: stamp })
          .eq("id", victim.id)
        // Never swallowed: a ward that failed to write is a spell the player
        // paid for and did not get, and they must be told rather than left to
        // discover it when a drow walks through it.
        if (wardErr) {
          return NextResponse.json({ error: `${ability} could not take hold: ${wardErr.message}` }, { status: 500 })
        }
        // The word the sheet and the board already know how to show.
        if (victim.character_id) {
          const { data: ch } = await db.from("characters").select("conditions").eq("id", victim.character_id).maybeSingle()
          const conds = normalizeConditions(ch?.conditions)
          const word = wardCondition(ward)
          if (!conds.some((c) => c.toLowerCase() === word.toLowerCase())) {
            await db.from("characters").update({ conditions: [...conds, word], updated_at: stamp }).eq("id", victim.character_id)
          }
        }
        const line = ward === "sanctuary"
          ? `${caster.label} wards ${victim.id === caster.id ? "themself" : victim.label} with Sanctuary — attackers must make a Wisdom save to strike them.`
          : `${caster.label} raises a shimmering field around ${victim.id === caster.id ? "themself" : victim.label} — +2 AC.`
        await narrate(db, caster.label ?? "Someone", line)
        return NextResponse.json({
          ok: true, resolved: false, warded: ward, line,
          target_token: victim.id, caster_token: caster.id,
          note: "ward",
        })
      }

      // The same two steps as the area path: lay whatever is declared, and
      // hand anything unmechanised to the DM rather than going quiet.
      const single = effectsFor(ability)
      const laid = await layEffects(single, [{ id: victim.id, label: victim.label, character_id: victim.character_id }])
      const line = laid
        ? `${caster.label} casts ${ability} on ${victim.id === caster.id ? "themself" : victim.label}.`
        : `${caster.label} casts ${ability}.`
      await narrate(db, caster.label ?? "Someone", line)
      const ruling = needsRuling({ effects: single, handled: laid > 0 })
        ? { spell: ability, text: single.find((e) => e.kind === "dm")?.text ?? null }
        : null
      if (ruling) {
        await narrate(db, "Board", `${ability} needs a ruling from Malachar.${ruling.text ? ` (${ruling.text})` : ""}`)
      }
      return NextResponse.json({
        ok: true, resolved: laid > 0, line,
        target_token: victim.id, caster_token: caster.id,
        ...(ruling ? { ruling } : {}),
        note: laid > 0 ? "effects" : "ruling",
      })
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

    // ---- THE TARGET'S WARDS -------------------------------------------
    //
    // Read from the token, because that is where a ward lives and where the
    // round turn sweeps it.
    const victimWard = normaliseWard((victim as { ward?: unknown }).ward)

    // SHIELD OF FAITH reaches the number the attack is compared against, or
    // it is decoration. +2, exactly as the SRD writes it.
    ac += wardAcBonus(victimWard)

    // SANCTUARY makes the attacker roll BEFORE anything else happens: before
    // the attack roll, before the slot is spent by the paths below, because a
    // lost attack is lost, not merely missed.
    //
    // Not for an area spell - the SRD's own exception, and the counterplay
    // that makes a first-level spell fair - and not for a helpful one, since
    // healing somebody is not an attack on them.
    if (needsSanctuarySave(victimWard, { helpful: Boolean(entry.helpful) })) {
      // The ATTACKER's Wisdom, against the warded creature's caster DC. The
      // caster's own save_dc is the right number: it is their spell.
      let attackerWis = 0
      if (caster.character_id) {
        const { data: cw } = await db.from("characters").select("wis_score").eq("id", caster.character_id).maybeSingle()
        attackerWis = Math.floor((((cw?.wis_score as number | null) ?? 10) - 10) / 2)
      } else if (caster.bestiary_id) {
        const { data: bw } = await db.from("bestiary").select("wis").eq("id", caster.bestiary_id).maybeSingle()
        attackerWis = Math.floor((((bw?.wis as number | null) ?? 10) - 10) / 2)
      }
      // THE DC BELONGS TO WHOEVER CAST THE SANCTUARY, not to the attacker.
      //
      // tsc caught the first version of this using `saveDc` — the ATTACKER's
      // own spell save DC — which would have made a drow's Sanctuary save
      // harder the better a caster the drow was. The number is the warding
      // cleric's, off their sheet, because it is their spell.
      let wardDc = 13
      const wardCasterTok = victimWard?.caster_token
      if (wardCasterTok) {
        const { data: wc } = await db.from("vtt_tokens").select("character_id").eq("id", wardCasterTok).maybeSingle()
        if (wc?.character_id) {
          const { data: wsheet } = await db.from("characters").select("sheet_spellcasting").eq("id", wc.character_id).maybeSingle()
          const sc = (wsheet?.sheet_spellcasting ?? null) as { save_dc?: number } | null
          if (typeof sc?.save_dc === "number") wardDc = sc.save_dc
        }
      }
      const check = resolveSanctuary({ roll: d20(), wisModifier: attackerWis, dc: wardDc })
      if (!check.passed) {
        // The attack is LOST. It still costs the action - that is what makes
        // Sanctuary worth a slot - so payFor runs before the refusal.
        await payFor()
        const line = `${caster.label} turns on ${victim.label} and falters — Wisdom ${check.total} vs DC ${check.dc}: the sanctuary holds, and the attack is lost.`
        await narrate(db, caster.label ?? "Someone", line)
        return NextResponse.json({
          ok: true, resolved: false, sanctuary: true, line,
          roll: check.total, dc: check.dc,
          target_token: victim.id, caster_token: caster.id,
        })
      }
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
    // The rogue's verdict, so the log line and the response can both read it.
    // Declared not-applying, because most attacks are not sneak attacks.

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

        // ---- SNEAK ATTACK ------------------------------------------------
        // Fifi's sheet has carried this feature, in full, from the day she
        // was imported. Nothing has ever read it: the extra dice were never
        // rolled and the sound recorded for it was never played.
        //
        // The condition needs one fact this path did not have — who is
        // standing next to the target — so it is fetched here rather than
        // for every cast, because only a rogue's landed weapon hit can
        // possibly qualify and that is a small fraction of the traffic.
        const mightSneak =
          !sneak.applies &&
          /\brogue\b/i.test(casterClass ?? "") &&
          Boolean(weapon && (weapon.finesse || weapon.ranged)) &&
          st.sneak_used !== true
        if (mightSneak) {
          const { data: near } = await db.from("vtt_tokens")
            .select("id,allegiance,grid_x,grid_y,is_visible,hp_current")
            .eq("map_id", caster.map_id)
          const mySide = caster.allegiance === "party" || caster.allegiance === "ally"
          const allies = (near ?? [])
            // The rogue is not her own ally. Counting her would qualify every
            // attack she ever made, which is the feature given away.
            .filter((t) => t.id !== caster.id && t.id !== victim.id)
            .filter((t) => t.is_visible !== false)
            // "the ally isn't Incapacitated" — a body at 0 is not helping.
            .filter((t) => (t.hp_current ?? 1) > 0)
            .filter((t) => {
              const theirSide = t.allegiance === "party" || t.allegiance === "ally"
              return theirSide === mySide
            })
            .map((t) => ({ x: t.grid_x as number, y: t.grid_y as number }))

          sneak = sneakAttackFor({
            attackerClass: casterClass,
            attackerLevel: casterLevel,
            hit: true,
            weaponFinesse: Boolean(weapon?.finesse),
            weaponRanged: Boolean(weapon?.ranged),
            alreadyUsedThisTurn: st.sneak_used === true,
            // Advantage is not modelled anywhere in this route — five roll
            // sites, one d20 each. Passed explicitly so the gap is visible.
            hasAdvantage: false,
            target: { x: victim.grid_x as number, y: victim.grid_y as number },
            allies,
          })

          if (sneak.applies) {
            // A critical doubles sneak-attack dice too — they are dice of the
            // attack's damage, and the rule doubles all of them.
            amount += rollDice(sneak.dice)
            if (crit) amount += rollDice(sneak.dice)
          }
        }
      }
      // The sneak attack is NAMED in the log. A rogue's damage doubling with
      // no explanation reads as a bug; "Sneak Attack (2d6) - an ally has them
      // occupied" reads as the rule it is.
      const sneakNote = sneak.applies ? ` Sneak Attack (${sneak.dice}) — ${sneak.reason}.` : ""
      line = `${caster.label} strikes at ${victim.label} with ${weapon.name} — ${roll}${toHit >= 0 ? "+" : ""}${toHit} = ${total} vs AC ${ac}: ${crit ? "CRITICAL" : hit ? "hit" : "miss"}${hit ? ` for ${amount}` : ""}.${sneakNote}`
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

    // Hoisted for the same reason as the area path: settleHitPoints lives
    // inside the block below, and a blow that dealt nothing cannot have
    // felled anybody.
    let fellHere = false
    if (amount > 0) {
      const cur = victim.hp_current ?? victim.hp_max ?? 0
      const max = victim.hp_max ?? cur
      // Healing cannot exceed the maximum; damage cannot go below zero. A
      // token at 0 is down, not negative — the dying rules are the DM's.
      // Token and sheet together — writing only the token is how the board
      // once believed Kenta was at 0 while his sheet read 8/8 — and the dying
      // rules run on the way: a drop to 0 is Unconscious, damage at 0 is a
      // failed death save (two on a critical), healing from 0 wakes them.
      const settled = await settleHitPoints(db, {
        characterId: victim.character_id ?? null, tokenId: victim.id, label: victim.label ?? "Someone",
        cur, max, amount, heals: Boolean(entry.heals), crit, by: "player-cast",
      })
      fellHere = settled.fell
      const next = settled.hp
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
      if (settled.note) line += ` ${settled.note}`
      // Steel in melee leaves its mark on the floor: the blow that drops
      // someone, or any blow on someone the DM has tagged Bleeding. A spell
      // that drops someone does not - there is no blade in it.
      if (weapon && !weapon.ranged && !entry.heals) {
        const bleeding = await isBleeding(db, victim.character_id ?? null, victim.label ?? "")
        if (bleeds({ melee: true, amount, fell: settled.fell, bleeding })) {
          await layBlood(db, map.id, victim.grid_x ?? 0, victim.grid_y ?? 0, poolSize({ amount, fell: settled.fell }), victim.id)
        }
      }
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
      /**
       * Did this blow put them on the floor? Known all along by
       * settleHitPoints, and discarded here until the banner needed to say
       * HOW something died rather than merely that it took damage.
       */
      fell: fellHere,
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
      /**
       * The rogue's moment, for the board's ear. `combat/sneak_attack` has
       * been in the bucket since the sound pack was recorded and there has
       * never been a field on the wire that could ask for it.
       */
      sneak: sneak.applies,
      sneakDice: sneak.applies ? sneak.dice : null,
      /** Echoed so a late response cannot be applied to the wrong miniature. */
      target_token: victim.id,
      caster_token: caster.id,
    })
  }

  if (action === "hide") {
    // THE HIDE ACTION, SRD 5.1.
    //
    // Dexterity (Stealth), contested by the PASSIVE Perception of anyone who
    // might notice - and refused outright against anyone who can see you
    // clearly. See lib/hiding.ts for the rule text and for the one place a
    // single boolean forces a simplification.
    const token_id = String(body?.token_id ?? "")
    const order = combat.turn_order as { token_id: string; kind: string }[]
    const entry = order[combat.active_index]
    if (!entry || entry.token_id !== token_id) {
      return NextResponse.json({ error: "not this combatant's turn" }, { status: 409 })
    }
    const board = await loadBoard(db, map.id)

    const { data: tok } = await db
      .from("vtt_tokens").select("id,label,character_id,grid_x,grid_y,allegiance")
      .eq("id", token_id).maybeSingle()
    if (!tok?.character_id) {
      return NextResponse.json({ error: "only a player character hides here" }, { status: 403 })
    }
    const { data: sheet } = await db
      .from("characters")
      .select("dex_modifier,proficiency_bonus,sheet_skill_proficiencies")
      .eq("id", tok.character_id).maybeSingle()

    // WHO MIGHT NOTICE. The other side, still standing, still on the board.
    // Allies are not onlookers: you are not hiding from your own party, and
    // rolling against Samson's passive Perception would make a rogue's own
    // cleric the reason she is seen.
    const { data: others } = await db
      .from("vtt_tokens")
      .select("id,label,character_id,bestiary_id,grid_x,grid_y,hp_current,is_visible,allegiance")
      .eq("map_id", map.id)
      .neq("id", token_id)
    const foes = (others ?? []).filter(
      (o) => o.is_visible && (o.hp_current ?? 1) > 0 && o.allegiance !== tok.allegiance,
    )

    // Passive Perception: from the sheet for a character, from the stat
    // block's own senses line for a monster. Parsed rather than derived -
    // "passive Perception 14" is what the book prints, and recomputing it
    // from WIS would quietly disagree with the page.
    const charIds = foes.map((f) => f.character_id).filter(Boolean) as string[]
    const beastIds = foes.map((f) => f.bestiary_id).filter(Boolean) as string[]
    const [{ data: chars }, { data: beasts }] = await Promise.all([
      charIds.length ? db.from("characters").select("id,passive_perception").in("id", charIds) : Promise.resolve({ data: [] as { id: string; passive_perception: number | null }[] }),
      beastIds.length ? db.from("bestiary").select("id,senses").in("id", beastIds) : Promise.resolve({ data: [] as { id: string; senses: string | null }[] }),
    ])
    const ppOfChar = new Map((chars ?? []).map((c) => [c.id, c.passive_perception ?? 10]))
    const ppOfBeast = new Map(
      (beasts ?? []).map((b) => {
        const m = /passive Perception\s+(\d+)/i.exec(String(b.senses ?? ""))
        return [b.id, m ? Number(m[1]) : 10]
      }),
    )

    const onlookers: Onlooker[] = foes.map((f) => ({
      id: f.id,
      label: f.label ?? "something",
      passivePerception:
        (f.character_id ? ppOfChar.get(f.character_id) : undefined) ??
        (f.bestiary_id ? ppOfBeast.get(f.bestiary_id) : undefined) ??
        10,
      seesClearly: lineIsClear(
        { x: tok.grid_x ?? 0, y: tok.grid_y ?? 0 },
        { x: f.grid_x ?? 0, y: f.grid_y ?? 0 },
        board.walkable,
      ),
    }))

    const roll = 1 + Math.floor(Math.random() * 20)
    const outcome = resolveHide(
      {
        dexModifier: sheet?.dex_modifier ?? 0,
        proficiencyBonus: sheet?.proficiency_bonus ?? 2,
        stealth: stealthProficiency(sheet?.sheet_skill_proficiencies as Record<string, unknown> | null),
      },
      onlookers,
      roll,
    )

    if (outcome.kind === "seen") {
      await narrate(db, tok.label ?? "Someone",
        `${tok.label} looks for somewhere to hide, and finds none — ${outcome.by.join(", ")} ${outcome.by.length > 1 ? "have" : "has"} a clear view.`)
      return NextResponse.json({ ok: true, hidden: false, reason: "seen", seenBy: outcome.by })
    }

    const hidden = outcome.kind === "unopposed" ? true : outcome.hidden
    await db.from("vtt_tokens")
      .update({ is_hidden: hidden, updated_by: "player-hide", updated_at: new Date().toISOString() })
      .eq("id", token_id)

    const line = outcome.kind === "unopposed"
      ? `${tok.label} slips out of sight — there is no one to see it. (Stealth ${outcome.total})`
      : `${tok.label} rolls Stealth ${outcome.roll} for ${outcome.total} against ${outcome.keenest}'s passive ${outcome.dc} — ${hidden ? "and is gone" : "and is spotted"}.`
    await narrate(db, tok.label ?? "Someone", line)

    return NextResponse.json({
      ok: true,
      hidden,
      roll: outcome.kind === "unopposed" ? outcome.roll : outcome.roll,
      total: outcome.total,
      dc: outcome.kind === "resolved" ? outcome.dc : null,
      line,
      // Only the vanish is worth a sound. A failed hide is a rogue standing
      // in the open looking foolish, and the log already says so.
      ...(hidden ? { sfxCues: [{ type: "raw" as const, scope: "party" as const, key: "ui/hide_vanish" }] } : {}),
    })
  }

  if (action === "next") {
    const order = combat.turn_order as { token_id: string; kind?: string }[]
    const count = order.length

    // WHO IS STILL PARTICIPATING.
    //
    // From the log of Sam's first sandbox trial: the Drow Elite Warrior died
    // in round one and was still being dealt a turn six rounds later, saying
    // "lies still" each time. Fifi, killed outright, said "lies dead." once a
    // round forever. Nothing was wrong with either line — the mistake was
    // asking a body anything at all.
    //
    // THE DYING ARE NOT THE DEAD, and this is the whole subtlety. A character
    // at 0 who is dying rolls a death save every turn; that roll IS their
    // turn and it is how they come back. Samson rolled three across three
    // rounds in that same log and stabilised. So `vitalityOf` decides, not
    // hp <= 0: only "dead" is skipped, while "dying" and "stable" keep their
    // turns.
    //
    // A monster has no death saves — SRD: "most GMs have a monster die the
    // instant it drops to 0" — so 0 hit points is dead for anything without a
    // character sheet. Null hit points are UNTRACKED, never dead.
    const dead = new Set<number>()
    {
      const ids = order.map((e) => e.token_id)
      const { data: rows } = await db
        .from("vtt_tokens").select("id,character_id,hp_current").in("id", ids)
      const byId = new Map((rows ?? []).map((r) => [r.id, r]))
      const charIds = (rows ?? []).map((r) => r.character_id).filter(Boolean) as string[]
      const sheets = new Map<string, { hp_current: number | null; conditions: unknown }>()
      if (charIds.length) {
        const { data: chars } = await db
          .from("characters").select("id,hp_current,conditions").in("id", charIds)
        for (const c of chars ?? []) sheets.set(c.id, { hp_current: c.hp_current, conditions: c.conditions })
      }
      order.forEach((entry, i) => {
        const tok = byId.get(entry.token_id)
        // A token that has left the board entirely is not a participant.
        if (!tok) { dead.add(i); return }
        if (tok.character_id) {
          const sheet = sheets.get(tok.character_id)
          if (!sheet) return
          if (vitalityOf(sheet.hp_current, normalizeConditions(sheet.conditions)) === "dead") dead.add(i)
          return
        }
        if (tok.hp_current != null && tok.hp_current <= 0) dead.add(i)
      })
    }

    const step = advanceTurn({ from: combat.active_index, count, isDead: (i) => dead.has(i) })
    const nextIndex = step.index
    // Crossing the top is what turns the round — NOT landing on index 0. If
    // the first combatant in the order is a corpse the turn lands on 1, and a
    // new round has still begun; keying on the landing would silently skip
    // the round increment, the summon expiry and the world step below.
    const roundTurned = step.roundsCrossed > 0

    // A minute is ten rounds. When the round turns, anything summoned for a
    // duration that has run out fades - SRD, "The hand lasts for the
    // duration". Checked against the round we are about to enter.
    if (roundTurned) {
      const entering = combat.round + 1
      const { data: summoned } = await db
        .from("vtt_tokens").select("id,label,summon").eq("map_id", map.id).not("summon", "is", null)
      for (const t of summoned ?? []) {
        const info = normaliseSummon(t.summon)
        if (!info || !expired(info, entering)) continue
        await db.from("vtt_tokens").delete().eq("id", t.id)
        await narrate(db, t.label ?? MAGE_HAND.name, `${t.label ?? MAGE_HAND.name} fades — the spell has run its minute.`)
      }

      // AND THE WARDS, swept by the same round turn and for the same reason:
      // one expiry mechanism, one piece of arithmetic. A Sanctuary that
      // outlived its minute would be a first-level spell that never ends.
      const { data: warded } = await db
        .from("vtt_tokens").select("id,label,character_id,ward").eq("map_id", map.id).not("ward", "is", null)
      for (const t of warded ?? []) {
        const info = normaliseWard(t.ward)
        // A ward that cannot be read is a ward nobody can rely on: clear it
        // rather than leaving a creature protected by a malformed blob.
        if (info && !wardExpired(info, entering)) continue
        const stamp = new Date().toISOString()
        await db.from("vtt_tokens").update({ ward: null, updated_by: "ward-expired", updated_at: stamp }).eq("id", t.id)
        if (t.character_id && info) {
          const { data: ch } = await db.from("characters").select("conditions").eq("id", t.character_id).maybeSingle()
          const word = wardCondition(info.spell).toLowerCase()
          const conds = normalizeConditions(ch?.conditions).filter((c) => c.toLowerCase() !== word)
          await db.from("characters").update({ conditions: conds, updated_at: stamp }).eq("id", t.character_id)
        }
        if (info) {
          await narrate(db, t.label ?? "Someone", info.spell === "sanctuary"
            ? `The sanctuary around ${t.label} fades.`
            : `The shimmering field around ${t.label} winks out.`)
        }
      }

      // AND THE TIMED EFFECTS, in the same loop and by the same arithmetic —
      // Faerie Fire's outline, Sleep's Unconscious, a disguise. Three columns
      // (summon, ward, effects) and ONE notion of when a round has turned.
      const { data: affected } = await db
        .from("vtt_tokens").select("id,label,character_id,effects").eq("map_id", map.id)
        .neq("effects", "[]")
      for (const t of affected ?? []) {
        const list = Array.isArray(t.effects) ? (t.effects as { condition?: string; expires_round?: number }[]) : []
        const live = list.filter((e) => Number(e?.expires_round ?? 0) > entering)
        if (live.length === list.length) continue
        const gone = list.filter((e) => !live.includes(e))
        const stamp = new Date().toISOString()
        await db.from("vtt_tokens").update({ effects: live, updated_by: "effect-expired", updated_at: stamp }).eq("id", t.id)
        if (t.character_id) {
          const { data: ch } = await db.from("characters").select("conditions").eq("id", t.character_id).maybeSingle()
          const drop = gone.map((e) => String(e?.condition ?? "").toLowerCase())
          const conds = normalizeConditions(ch?.conditions).filter((c) => !drop.includes(c.toLowerCase()))
          await db.from("characters").update({ conditions: conds, updated_at: stamp }).eq("id", t.character_id)
        }
        for (const e of gone) {
          await narrate(db, t.label ?? "Someone", `${e?.condition} fades from ${t.label}.`)
        }
      }
    }

    // END OF ROUND — the world step. Sam's ruling: the non-combatants move at
    // the end of each round, automatically, toward the edge of the map. They
    // never took a turn in the order; this is the fight happening AROUND them.
    if (roundTurned) {
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
        round: roundTurned ? combat.round + 1 : combat.round,
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
    // A MONSTER'S TURN GETS ITS OWN CUE, not the players' bell.
    //
    // Gauntlet never announced the monsters and neither does this — but the
    // table still needs to know the turn moved, and hearing the SAME sound
    // for "you are up" and "something else is up" makes four people look up
    // every time anything happens. ui/turn_foe is the same cabinet saying the
    // opposite thing: the players' figure rises through a major triad, this
    // one falls through a minor third into a tritone, an octave lower and
    // half as long. No voice, because nobody is being addressed.
    let cue = "ui/turn_foe"
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
        // A character at 0 starts their turn with a death saving throw, and
        // with nothing else. Rolled here, the moment the turn is theirs.
        await deathSaveOnTurnStart(db, combat.id, nextEntry.token_id, tok.character_id)
      }
    }
    return NextResponse.json({
      ok: true,
      sfxCues: [{ type: "raw" as const, scope: "party" as const, key: cue }],
    })
  }

  // end
  // Nobody stays hidden after the fight. A flag left set means a rogue who is
  // translucent in the next scene for reasons no one remembers - the same
  // shape of bug as the combat_state row that survived every restart.
  await db.from("vtt_tokens")
    .update({ is_hidden: false, updated_by: "combat-ended", updated_at: new Date().toISOString() })
    .eq("is_hidden", true)
  const { error } = await db
    .from("combat_state")
    .update({ status: "ended", updated_at: new Date().toISOString() })
    .eq("id", combat.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Ending combat is deliberately silent. The bank has no clip for it, and a
  // turn chime here would say the wrong thing - the fight is over, nobody is up.
  return NextResponse.json({ ok: true })
}
