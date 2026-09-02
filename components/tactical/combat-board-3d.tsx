"use client"

// ============================================================================
// THE COMBAT BOARD — the V5 canon node tile, in 3D, in the game.
//
// Ported from C:\ashes-maps\map_viewer_3d.html (the buildSquare path), which
// until now ran only on Sam's machine over localhost:8741. Everything it drew
// locally now comes from Supabase:
//
//   the painted tile   vtt_maps.meta.art_url    (node-art/v5/node-NN.webp)
//   cell geometry      vtt_maps.meta.cells_url  (node-maps/v5/node-NN.json)
//   textures           vtt-assets/map-tiles/diablo-gothic/*
//   the combatants     vtt_tokens               (live, via realtime)
//
// WHAT THE PLAYERS SEE is the drawn map standing up: the tile art as one
// uncut floor plane (slicing it per-cell is what mangled the artwork in the
// hex era), rock as boxes wearing their own patch of the art, the pen's
// cage as see-through bars, doors that are really there. Tokens are discs
// with HP arcs, or the creature's own GLB where one is wired.
//
// WHO MOVES THINGS: the DM, only. Click a token, click a square — the row
// updates, and every other browser sees the move by realtime subscription.
// Sam's ruling (22 Aug 2026): DM moves everything; players watch it live.
//
// API DIFFERENCES from the r128 original, so the next porter doesn't
// rediscover them: outputEncoding→outputColorSpace, sRGBEncoding→SRGBColorSpace
// on textures via .colorSpace, GLTFLoader/OrbitControls from three/addons.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js"
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { createClient } from "@/lib/supabase/client"
import { CombatHud, type HudCharacter, type HudLogLine } from "./combat-hud"
import { TurnBanner, type TurnEconomy } from "./turn-banner"
import {
  castClipFor,
  castEventFor,
  castPlanFor,
  clipFor,
  defenceFor,
  HOLD_LAST,
  ONE_SHOT,
  type AttackOutcome,
  type CastHand,
  type TokenState,
} from "@/lib/token-animation"
import { castSpellVfx, paletteForSpell, type VfxHandle } from "./spell-vfx"
import { castSpellKitVfx, deathVfx, kitVfxTypeFor, prewarmKit, type DamageType } from "./spell-vfx-kit"
import { layAreaDecal, type AreaDecalHandle } from "./aoe-decal"
import { normaliseSummon, type SummonOnBoard, type HandUse } from "@/lib/summons"
import { layBloodDecals, type BloodDecalHandle } from "./blood-decal"
import { layGroundItems, type GroundItemHandle } from "./ground-item-props"
import { withinReach, type GroundItemRow } from "@/lib/ground-items"
import { defenceMotion } from "./defence-motion"
import { areaVisualFor } from "@/lib/aoe-visual"
import { damageNumberVfx } from "./damage-numbers"
// Twelve deaths, one per way of being killed - see death-vfx.ts.
import { deathSceneVfx } from "./death-vfx"
import { deathKindFor, type DeathKind } from "@/lib/damage-type"
// A zero is an outcome, not an absence — see outcome-word.ts.
import { outcomeWordVfx } from "./outcome-word"
import { spellEntry, type SpellEntry } from "@/lib/spellbook"
// The same geometry the SERVER resolves the blast with. One function, so the
// outline a player is looking at and the creatures that actually take damage
// are the same set by construction rather than by agreement.
import { areaCells, aimInRange, type Cell } from "@/lib/aoe"
// The rack's weapons are DERIVED from what a character carries, not read from
// a hand-kept list on the sheet. Shared with the cast handler so the board
// cannot offer a weapon the server will refuse.
import { attacksFromInventory } from "@/lib/weapons"
import { equipOnRig, unequipSlot } from "@/lib/equipment"
import { playSfx, windupFor, releaseFor, tailFor, impactFor, preloadSfx, weaponSounds, meleeHit, variedRate, SNEAK_ATTACK, type PlayHandle, type SfxName } from "@/lib/sfx"
import { packSoundFor, packKey } from "@/lib/spell-sfx-pack"
import { dmHeaders, getDmKey, onDmKeyChange } from "@/lib/dm-key"
import { playCues, subscribeSfxCues } from "@/lib/sfx-cues"
// An NPC's swing, carried from the DM's seat to the rest of the table.
import { parseSwing, relaySwing, subscribeSwings, type SwingEvent } from "@/lib/combat-relay"
// The interface's own click — synthesised, so a targeting tick never waits on
// a fetch. Deliberately not part of lib/sfx, which is the campaign's sound.
import { uiTick } from "@/lib/ui-tick"
// FEET_PER_SQUARE only, deliberately. gridDistanceFeet is straight-line
// (Chebyshev) and this overlay measures a PATH that bends around rock, so the
// two disagree the moment a wall is involved - and the server rejects a client
// that under-reports cost. The BFS counts squares; this constant turns them
// into feet. One definition of a square, shared with the server.
import { FEET_PER_SQUARE } from "@/lib/tactical"

const TILE_BASE =
  "https://ppadxmvvvxmnnejeaoer.supabase.co/storage/v1/object/public/vtt-assets/map-tiles/diablo-gothic"

// 1 world unit = one 5-ft square, exactly as the local viewer had it.
const SQ = 1.0

interface MapRow {
  id: string
  name: string
  grid_width: number
  grid_height: number
  cell_size: number
  meta: { node?: number; art_url?: string; cells_url?: string; marks?: unknown } | null
}

interface TokenRow {
  id: string
  map_id: string
  character_id: string | null
  bestiary_id: string | null
  label: string
  model_url: string | null
  model_scale: number | null
  model_y_offset: number | null
  grid_x: number
  grid_y: number
  rotation_y: number | null
  token_size: string | null
  tint_color: string | null
  /**
   * Who this token fights FOR, right now. Nothing else in the row answers it:
   * character_id marks only the 4 PCs, so Eldeth and Derendil looked like
   * enemies, and combat_disposition holds 'fights'/'flees' — behaviour, not
   * side. Mutable mid-fight: Ront and Sarith are allies until they aren't.
   */
  allegiance: "party" | "ally" | "hostile" | "neutral" | null
  is_visible: boolean
  /**
   * Took the Hide action and beat every onlooker. Drawn as a translucent
   * body rather than a removed one: the table still needs to know where she
   * IS — this is a VTT, not a fog-of-war shooter, and a rogue who vanishes
   * from her own player's screen cannot be moved.
   */
  is_hidden: boolean | null
  hp_current: number | null
  hp_max: number | null
  /** Set when this token is a spell effect (Mage Hand), see lib/summons. */
  summon?: unknown
}

interface CellsJson {
  meta: { grid: { width: number; height: number } }
  render?: {
    cage?: boolean
    cage_height?: number
    cage_texture?: string
    edge?: "rail" | "wall"
    rail_height?: number
    wall_height?: number
    door_texture?: string
    ceiling?: boolean
  }
  cells: {
    floor: { sq: [number, number]; water?: boolean; island?: boolean }[]
    water?: { sq: [number, number]; water?: boolean; island?: boolean }[]
    doors?: { sq: [number, number]; dir?: [number, number]; type?: string; locked?: boolean; initially_open?: boolean; texture?: string; lock_dc?: number; lock_note?: string }[]
  }
  exits?: { type?: string; cells: [number, number][] }[]
}

/** Storage URLs for the gothic tile textures the local viewer loaded from disk. */
const storageTex = (file: string) => `${TILE_BASE}/${file.replace(/^tiles\//, "")}`

const sqCentre = (x: number, y: number) => ({ x: (x + 0.5) * SQ, z: (y + 0.5) * SQ })
const sq4 = (x: number, y: number): [number, number][] => [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]

/** Token disc radius by 5e size category. Medium fills most of its square. */
function radiusFor(size: string | null): number {
  const s = (size || "medium").toLowerCase()
  if (s === "tiny") return 0.18
  if (s === "small") return 0.3
  if (s === "large") return 0.8
  if (s === "huge") return 1.2
  return 0.38
}

// ── Sam's combat baseline (8/29): the board opens in FREE camera with the
// darkness lifted and DM move off — "This should be the baseline for combat
// for now." Flip these two constants to change the opening state; the
// buttons still toggle everything live.
const DEFAULT_CLASSIC_CAM = false // false = FREE camera
const DEFAULT_DARKNESS_ON = false // false = darkness lifted

/**
 * One button in the board's control bar.
 *
 * `on` is for the toggles that have a state worth seeing at a glance — the
 * log being open, darkness being down, DM move being armed. A button with no
 * `on` (the scene exit) simply never lights, which is correct: it is a door,
 * not a switch.
 */
function BoardBtn({
  children, onClick, on = false, title,
}: {
  children: React.ReactNode
  onClick: () => void
  on?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={
        "pointer-events-auto rounded border px-2 py-[3px] font-mono text-[9px] tracking-wider transition " +
        (on
          ? "border-[#c99a49] bg-[#2a1f09] text-[#f3c94b] shadow-[0_0_8px_#c9a22755]"
          : "border-[#6b5123] bg-black/70 text-[#cdb276] hover:border-[#c99a49] hover:text-[#f0d9a4]")
      }
    >
      {children}
    </button>
  )
}

/**
 * What the server said when the cast verb was asked to resolve a throw.
 *
 * `ok` is whether it resolved at all — a refusal has already been said out
 * loud by then. `hurt` is whether hit points moved. `verdict` is the rest of
 * the story, outcome and margin from the widened cast response, and is null
 * against an older server, in which case the target has only `hurt` to go
 * on. `weapon` carries what a swing needs to make its own noise at the frame
 * the arm actually gets there, rather than the moment the fetch returned.
 */
type CastAnswer = {
  ok: boolean
  hurt?: boolean
  verdict?: { outcome: AttackOutcome; margin: number } | null
  /**
   * `targetAc` is the number the attack was measured against, which for a
   * weapon IS the target's armour class. The server has always sent it as
   * `dc`; nothing read it. It is what lets the impact sound know whether the
   * blow landed on plate, on mail, or on a robe.
   */
  weapon?: { hit: boolean; crit: boolean; targetAc?: number | null } | null
  /**
   * An AREA cast: everyone the server found standing in the shape, each with
   * their own verdict. Null or absent for a cast with one target.
   */
  victims?: AreaVictim[] | null
}

/**
 * One body in an area cast, as the server reports it — the single-target
 * verdict's vocabulary, per creature. The target rolled the save, so a
 * positive margin is how well THEY got out of the way.
 */
type AreaVictim = { id: string; amount: number; heals: boolean; outcome: string; margin: number }

/** `victims` off the wire → the ones with enough fields to draw. */
const parseVictims = (v: unknown): AreaVictim[] => {
  if (!Array.isArray(v)) return []
  const out: AreaVictim[] = []
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue
    const r = raw as Record<string, unknown>
    if (typeof r.id !== "string" || !r.id) continue
    out.push({
      id: r.id,
      amount: typeof r.amount === "number" ? r.amount : 0,
      heals: r.heals === true,
      outcome: typeof r.outcome === "string" ? r.outcome : "",
      margin: typeof r.margin === "number" ? r.margin : 0,
    })
  }
  return out
}

const ATTACK_OUTCOMES: readonly string[] = [
  "hit", "crit", "miss", "fumble", "saved", "saved-half", "failed-save", "heal",
]
/** The server's `outcome` is a string on the wire; only the eight words the
 *  board knows how to draw are let through. Anything else is "no verdict". */
const isAttackOutcome = (v: unknown): v is AttackOutcome =>
  typeof v === "string" && ATTACK_OUTCOMES.includes(v)

export default function CombatBoard3D({ onBack, sandbox = false }: { onBack?: () => void; sandbox?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState("Summoning the board…")
  const [mapName, setMapName] = useState("")
  const [dm, setDm] = useState(false)
  const [selected, setSelected] = useState<TokenRow | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  // The darkness is the players' truth, not the DM's. Malachar can lift it
  // to place tokens and read the room, the way the local viewer hid its
  // DM markers at eye level.
  const [darknessOn, setDarknessOn] = useState(DEFAULT_DARKNESS_ON)
  // The DM's hand on the pieces is a MODE, not a default: with it off, a
  // stray click on the floor selects and inspects but never teleports.
  const [dmMove, setDmMove] = useState(false)
  /**
   * Is the combat log window open?
   *
   * Closed by default. It used to be nailed to the right edge permanently,
   * covering a third of the dungeon with what is mostly scrollback — and the
   * one line that matters arrives as a toast anyway.
   */
  const [showLog, setShowLog] = useState(false)
  // "15 ft" floating under the cursor while a walk is being lined up.
  const [moveHint, setMoveHint] = useState<string | null>(null)
  const [combat, setCombat] = useState<{
    id: string
    round: number
    active_index: number
    turn_order: { token_id: string; label: string; kind: "pc" | "npc"; dex_mod: number; roll: number; total: number }[]
    turn_state?: TurnEconomy
  } | null>(null)
  // Which character THIS browser is sitting behind. The dashboard stores it
  // when a player picks or claims a character; the DM's browser has none,
  // which is exactly right — the DM drives the order, they do not take turns.
  const [myCharacterId, setMyCharacterId] = useState<string | null>(null)
  const [combatBusy, setCombatBusy] = useState(false)
  const [sheets, setSheets] = useState<HudCharacter[]>([])
  /** Spell effects standing on the board - Mage Hand - for the HUD's chips and cards. */
  const [summons, setSummons] = useState<SummonOnBoard[]>([])
  /** MOVE pressed on a summon card: the next floor click is where it goes. */
  const [summonMove, setSummonMove] = useState<string | null>(null)
  const summonMoveRef = useRef<string | null>(null)
  useEffect(() => { summonMoveRef.current = summonMove }, [summonMove])
  /** The hover hum, while any hand is on the board. */
  const summonHumRef = useRef<ReturnType<typeof playSfx> | null>(null)
  const summonVerbRef = useRef<(body: Record<string, unknown>) => Promise<void>>(async () => {})
  // The hum. While a hand is on the board the arcane windup loops low under
  // it - the "flying sound" - and stops the moment the last one is gone.
  useEffect(() => {
    if (summons.length > 0 && !summonHumRef.current) {
      summonHumRef.current = playSfx("magic/arcane_windup", { loop: true, volume: 0.14, fadeIn: 0.8 })
    } else if (summons.length === 0 && summonHumRef.current) {
      summonHumRef.current.stop(0.6)
      summonHumRef.current = null
    }
  }, [summons.length])
  useEffect(() => () => { summonHumRef.current?.stop(0.2); summonHumRef.current = null }, [])
  // Escape puts the MOVE away, the way it puts a spell away.
  useEffect(() => {
    if (!summonMove) return
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setSummonMove(null) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [summonMove])
  const syncSummons = () => {
    const list: SummonOnBoard[] = []
    tokensRef.current.forEach((e) => {
      const info = normaliseSummon(e.row.summon)
      if (info) list.push({ token_id: e.row.id, label: e.row.label, x: e.row.grid_x, y: e.row.grid_y, info })
    })
    setSummons(list)
  }
  // Each character's weapons, by character id. Read when a model finishes
  // loading so the figure can be given the thing it fights with.
  const sheetAttacksRef = useRef<Record<string, { name?: string; rarity?: string }[]>>({})
  /**
   * Who carries a shield, by character id, from the same inventory pass that
   * arms the rack.
   *
   * A shield changes what a near miss looks like — the blow is taken on the
   * boss rather than turned aside with steel — and it is the one thing
   * defenceFor asks about the target that the server does not report.
   * Detected by name, exactly as lib/armor-class.ts does, so the miniature
   * and the AC arithmetic agree on who has one. NPCs have no inventory rows
   * and so never block; they parry, which is wrong but not absurd.
   */
  const shieldRef = useRef<Map<string, { name: string; rarity: string; itemType: string | null }>>(new Map())
  const [tokenToCharacter, setTokenToCharacter] = useState<Record<string, string>>({})
  /** token_id -> portrait URL for NPCs, so the rail shows Ront's face and not "R". */
  const [tokenPortrait, setTokenPortrait] = useState<Record<string, string>>({})
  const [tokenConditions, setTokenConditions] = useState<Record<string, unknown>>({})
  const [log, setLog] = useState<HudLogLine[]>([])
  const [focusId, setFocusId] = useState<string | null>(null)
  const darknessRef = useRef<((on: boolean) => void) | null>(null)
  const [classicCam, setClassicCam] = useState(DEFAULT_CLASSIC_CAM)
  const classicRef = useRef<((on: boolean) => void) | null>(null)

  // Refs bridging React and the imperative three scene.
  const tokensRef = useRef<
    Map<string, { row: TokenRow; obj: THREE.Object3D; hpArc?: THREE.Mesh; anim?: TokenAnim }>
  >(new Map())
  const selectedRef = useRef<TokenRow | null>(null)
  const dmRef = useRef(false)
  const mapRef = useRef<MapRow | null>(null)
  // ---- movement reach (BG3-style): who may walk, how far, over what ----
  // The scene effect runs once; these refs are how per-render truth reaches
  // its closures, the same trick dmRef and selectedRef already play.
  const dmMoveRef = useRef(false)
  const combatRef = useRef<{ active_index: number; turn_order: { token_id: string; kind: string }[]; turn_state?: TurnEconomy } | null>(null)
  const myCharRef = useRef<string | null>(null)
  const speedFtRef = useRef(30)
  const walkableRef = useRef<Set<string>>(new Set())
  // Which squares sound different underfoot. Both are read from the node's own
  // cell geometry, so a footstep is a fact about where the party is standing
  // rather than a guess from the map's name.
  const waterRef = useRef<Set<string>>(new Set())
  const bridgeRef = useRef<Set<string>>(new Set())
  const reachRef = useRef<{
    tokenId: string
    /** cost is PATH length in squares (around walls), not straight-line. */
    cells: Map<string, { cost: number; tier: "move" | "dash" }>
    /** Movement left this turn, in feet — what the label measures "over". */
    moveFt: number
    /** Total reach including a Dash, in feet — what the frontier sits beyond. */
    dashFt: number
  } | null>(null)
  const refreshReachRef = useRef<() => void>(() => {})
  /**
   * WHICH TOKEN HAS ITS MOVEMENT OPEN.
   *
   * Sam: "When I click the character then movement options open."
   *
   * The reach overlay used to paint itself the moment a turn began, which
   * meant the board lit up forty squares of gold before the player had said
   * they were thinking about walking — and it stayed lit while they read the
   * rack, aimed a spell, or talked. Movement is a CHOICE now: click your own
   * miniature and the squares appear, click it again and they go away.
   *
   * Holds a token id rather than a boolean so a stale open state cannot
   * survive the turn passing to somebody else.
   */
  const reachOpenRef = useRef<string | null>(null)
  /**
   * A move that has been sent and not yet answered.
   *
   * THE BUG THIS EXISTS TO KILL. Committing a walk clears the overlay and
   * relies on it being repainted "with the new budget when the server
   * echoes". Two things echo, though, and they do not arrive in a fixed
   * order: the vtt_tokens realtime row (fast, and carrying no economy) and
   * the move endpoint's own reply (carrying the authoritative turn_state).
   *
   * When the realtime row won that race the overlay repainted from the OLD
   * moved_ft — so a character who had walked 15 of 30 was shown a full 30 ft
   * band again, and the next click inside it was refused by the server with
   * "not enough movement". Intermittent, and only ever after a partial move,
   * which is exactly how it was reported from the table.
   *
   * While this is set, reach does not repaint. The server's reply clears it,
   * and the repaint that follows is the one holding real numbers.
   */
  const moveInFlightRef = useRef(false)
  /**
   * Open (or close) movement for the active combatant.
   *
   * THREE doors into the same room: click the miniature on the board, click
   * the character's plate on the left, or press M. They all land here rather
   * than each re-deriving who may move and re-painting in its own way — three
   * copies of that rule is three chances for them to disagree, which is the
   * bug this codebase keeps re-learning.
   *
   * Returns why it refused, so a caller can say so out loud instead of
   * appearing broken.
   */
  const toggleReachRef = useRef<(characterId?: string) => "ok" | "not-your-turn" | "no-claim" | "no-combat">(
    () => "no-combat",
  )
  const playerMoveRef = useRef<(tokenId: string, gx: number, gy: number, feet: number, dash?: boolean) => void>(() => {})
  /**
   * A move the player has asked for that would cost their Dash, parked here
   * until they confirm. Blue squares are no longer clicked-and-refused: the
   * board asks first, because spending your action is not something to
   * discover from an error toast after the fact.
   */
  const [pendingDash, setPendingDash] = useState<
    { feet: number; commit: () => void } | null
  >(null)
  /**
   * A cast that CROSSES SIDES — a heal aimed at a hostile, a harmful spell
   * aimed at your own — parked here until the player confirms it.
   *
   * Sam's ruling: "Sometimes you want to heal an enemy; that's ok. We just
   * need confirmation." So crossing the line is a question, not a refusal.
   * Same shape as the Dash confirm above, for the same reason: the cost is
   * real, so the board asks before it sends anything.
   *
   * `commit` captures shooter, victim and the armed spell BY VALUE at the
   * moment the dialog opens. The dialog can sit open while armedRef changes
   * underneath it, and re-reading refs inside the commit is exactly the bug
   * that once made the wrong miniature answer.
   */
  const [pendingCross, setPendingCross] = useState<
    { kind: "foe" | "friend"; spell: string; target: string; verb: string; commit: () => void } | null
  >(null)
  /**
   * A POINT cast — a spell thrown at a SQUARE — parked here until the player
   * confirms it.
   *
   * A floor click used to be the throw. That is also what a floor click is
   * when you are trying to WALK, and with Minor Illusion armed Kenta spent
   * his action on a patch of empty floor he had meant to step onto. A
   * creature spell already asks before it crosses sides; the floor asked
   * nothing at all, and the floor is the one target you can hit by accident.
   *
   * Same shape as the two confirms above. `commit` captures the shooter, the
   * spell and the square BY VALUE when the dialog opens, for the same reason
   * pendingCross does. CANCEL leaves the spell armed and the turn untouched.
   */
  const [pendingPoint, setPendingPoint] = useState<
    { spell: string; feet: number; caught: string[]; mine: boolean; commit: () => void } | null
  >(null)
  const moveTokenRef = useRef<(id: string, x: number, y: number) => void>(() => {})
  /** The HUD's ability bar reaches the scene through here, the same way
   *  moves do. Set inside the scene effect; a no-op until the board is up. */
  const castRef = useRef<(characterId: string, ability: string, kind: string) => void>(() => {})
  /**
   * An NPC's attack reaches the scene through here.
   *
   * The monsters take their own turns on the server, and until now nothing
   * on the board moved for it: the flinch and the dodge hang off a cast the
   * player made, and a goblin's swing was never a cast. Its target neither
   * flinched nor got out of the way; the only evidence anything had happened
   * was a number over a head half a second later.
   *
   * The npc-turn response now reports the blow in the same vocabulary the
   * cast verb uses, and this hands it to the same performCast — so a
   * goblin's near miss is turned aside exactly the way a rogue's is. Set
   * inside the scene effect; a no-op until the board is up.
   */
  const swingRef = useRef<(swing: SwingEvent) => void>(() => {})
  // THE ARMED SPELL. Sam: a press should "allow me to target some which
  // starts up the ramp up animation, and when I click on the target, executes
  // the animation and sounds involved." So a press no longer fires — it ARMS.
  // The windup loops, the legal targets light, and the click is the throw.
  const [armedSpell, setArmedSpell] = useState<
    {
      characterId: string
      tokenId: string
      name: string
      kind: string
      entry: SpellEntry
      /**
       * What the next click MEANS.
       *
       * "creature" — click a body; the rings say which ones are legal.
       * "point"    — click the floor; a template follows the cursor.
       *
       * Carried on the armed spell rather than re-derived from the entry at
       * each use, so the rings, the click handler, the hover read-out and the
       * banner can never disagree about what the player is being asked for.
       */
      mode: "creature" | "point"
    } | null
  >(null)
  const armedRef = useRef<typeof armedSpell>(null)
  useEffect(() => { armedRef.current = armedSpell }, [armedSpell])
  const windupRef = useRef<PlayHandle | null>(null)
  const releaseAtRef = useRef<(tokenId: string) => void>(() => {})
  // The RAMP-UP. Sam asked for the windup animation to be wired, not just the
  // windup sound: holding a spell should look like holding a spell.
  const chargeRef = useRef<{ start: (tokenId: string) => void; stop: () => void }>({ start: () => {}, stop: () => {} })
  // Which token the board resolved for the armed spell, so the release cannot
  // re-resolve to somebody else.
  const armedTokenRef = useRef<string | null>(null)
  // Whose next hit-point change was a CRITICAL, per the server's own word.
  //
  // The board cannot tell a crit from an ordinary hit by watching hit points:
  // 14 damage looks identical either way. The server already says so in its
  // cast response, so that answer is parked here and spent by the number that
  // rises a moment later. If the realtime row beats the response the number
  // simply is not gold — a missed flourish, never a wrong figure.
  const critRef = useRef<Set<string>>(new Set())
  /**
   * WHAT the damage was, in the server's own words — "piercing", "fire",
   * "necrotic". Parked here for exactly the same reason as the crit flag, and
   * spent by the death that follows a moment later.
   *
   * A REF and not a local, because the two ends live in different scopes: the
   * cast response is read out here in a callback, and the death is drawn deep
   * inside the scene effect. A ref is the only thing both can see.
   */
  const lastHitWithRef = useRef<Map<string, string>>(new Map())
  /** Token ids currently sneaking. Set by Hide; see the note where it is used. */
  const sneakingRef = useRef<Set<string>>(new Set())
  const targetsRef = useRef<{ show: (t: string, r: number, h: boolean) => void; clear: () => void }>({ show: () => {}, clear: () => {} })
  // The blast outline, and the click that commits it. Point spells get their
  // own pair because they answer a different question from creature spells,
  // and sharing one path is what made Mage Hand demand a body to land on.
  const templateRef = useRef<{
    show: (casterTokenId: string, entry: SpellEntry, gx: number, gy: number) => void
    clear: () => void
  }>({ show: () => {}, clear: () => {} })
  const releaseAtPointRef = useRef<(gx: number, gy: number) => void>(() => {})
  /**
   * The live "this is who you are about to hit" mark, driven by the cursor.
   * Separate from targetsRef: that one answers who is eligible, this one
   * answers who is caught right now.
   */
  const affectedRef = useRef<{ show: (ids: string[], helpful: boolean, cross?: boolean) => void; clear: () => void }>({
    show: () => {},
    clear: () => {},
  })
  // Answers with who was standing in the shape and what each of them rolled,
  // because — like the creature cast since #333 — the effect now waits on the
  // server's answer instead of going off ahead of it.
  const castPointVerbRef = useRef<
    (caster: string, gx: number, gy: number, ability: string) => Promise<CastAnswer>
  >(async () => ({ ok: false }))

  // ---- the hover read-out --------------------------------------------
  // BG3 answers "what happens if I click here" before you click. While a
  // spell is armed, the creature under the cursor reports what it would take:
  // a chance to hit for an attack roll, the DC and which save otherwise.
  /** Screen position and text of the read-out, or null when nothing is under it. */
  const [hoverRead, setHoverRead] = useState<
    { x: number; y: number; label: string; line: string; ok: boolean } | null
  >(null)
  /** token id → AC. Only for the read-out; the server still rolls the dice. */
  const acRef = useRef<Map<string, number>>(new Map())
  /**
   * character id → the caster's own numbers, read straight off the sheet.
   *
   * `sheet_spellcasting` already carries `attack_bonus` and `save_dc`, both
   * recorded with an SRD citation. Deriving them here from class and ability
   * scores would be re-deriving something already verified, and this campaign
   * has a history of invented mechanics reaching the table that way.
   */
  const casterRef = useRef<Map<string, { atk: number | null; dc: number | null }>>(new Map())
  // Returns whether the server RESOLVED it, because the animation now waits
  // on that answer instead of running ahead of it.
  const castVerbRef = useRef<
    (caster: string, target: string, ability: string, crossSide?: boolean) => Promise<CastAnswer>
  >(async () => ({ ok: false }))
  /**
   * Put the server's verdict on the body at once: hit points if they moved,
   * and the word SAVED or MISS when they did not.
   *
   * A zero is an outcome. Leaving it silent is what made a correct save
   * indistinguishable from a broken spell.
   */
  const applyCastOutcomeRef = useRef<
    (tokenId: string, r: { amount: number; hit: boolean; heals: boolean; word?: "saved" | "miss" | null }) => void
  >(() => {})

  useEffect(() => {
    setDm(Boolean(getDmKey()))
    return onDmKeyChange(() => setDm(Boolean(getDmKey())))
  }, [])
  useEffect(() => {
    try {
      setMyCharacterId(window.localStorage.getItem("aop_character_id"))
    } catch {
      // Private mode or blocked storage: no banner rather than a broken board.
    }
  }, [])
  useEffect(() => { dmRef.current = dm }, [dm])

  // Sounds another seat earned. The board is its own route, so it needs its own
  // subscription - a player watching /battle should hear the natural 20 rolled
  // on the dashboard, and the turn chime the DM advanced from theirs.
  useEffect(() => subscribeSfxCues(), [])
  // The other seats' swings. The DM's seat animates its own from the response
  // and relays; everyone else gets them here. Whichever seat this is, the
  // handler is the same, so every screen draws the blow from the same dice.
  useEffect(() => subscribeSwings((s) => swingRef.current(s)), [])
  useEffect(() => { selectedRef.current = selected }, [selected])
  useEffect(() => { dmMoveRef.current = dmMove }, [dmMove])
  useEffect(() => { myCharRef.current = myCharacterId }, [myCharacterId])
  // Combat state feeds the reach overlay: turn passes, movement spent,
  // fight ends — each repaints (or clears) the yellow squares.
  useEffect(() => {
    combatRef.current = combat
    refreshReachRef.current()
  }, [combat])
  useEffect(() => { darknessRef.current?.(darknessOn) }, [darknessOn])
  useEffect(() => { classicRef.current?.(classicCam) }, [classicCam])

  const say = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 2600)
  }, [])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const supabase = createClient()
    let disposed = false

    // ---- renderer / scene / camera: the viewer's setup, current API ----
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x020204)
    scene.fog = new THREE.Fog(0x020204, 30, 90)

    // TWO CAMERAS. Diablo II's look is not a perspective camera at a clever
    // angle - the original is a 2:1 axonometric projection, and matching it
    // needs an ORTHOGRAPHIC camera at the fixed dimetric elevation (~30 deg,
    // where the vertical axis forecloses by half). CLASSIC is that: locked
    // angle, drag pans, wheel zooms, no orbit - the projection IS the look.
    // FREE keeps the perspective orbit for the DM working the board.
    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.1, 500)
    const orthoCam = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 500)
    const CLASSIC_EL = Math.PI / 6          // 30 deg: the 2:1 foreshortening
    const CLASSIC_AZ = Math.PI * 0.75
    let classic = DEFAULT_CLASSIC_CAM
    let orthoZoom = 1
    const activeCam = () => (classic ? orthoCam : camera)
    const sizeOrtho = () => {
      const aspect = mount.clientWidth / Math.max(1, mount.clientHeight)
      const half = 9 / orthoZoom            // world units of visible half-height
      orthoCam.left = -half * aspect
      orthoCam.right = half * aspect
      orthoCam.top = half
      orthoCam.bottom = -half
      orthoCam.updateProjectionMatrix()
    }
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    mount.appendChild(renderer.domElement)

    // Image-based fill for the FIGURES ONLY, never the pre-lit artwork.
    // A PBR material with no environment has nothing to shape its surface
    // against; outside a torch radius it renders as a mud silhouette —
    // which is every NPC, since only party tokens carry lights. A neutral
    // room environment at half strength gives each model soft, directional
    // definition everywhere on the board for the cost of one baked texture,
    // where per-token fill lights would triple the light count.
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    // Textures default to anisotropy 1 and smear at this camera's grazing
    // angle — "not very well defined" is exactly what that looks like.
    const maxAniso = renderer.capabilities.getMaxAnisotropy()

    // The tile art is pre-lit by the artist; lighting stays gentle so the
    // board reads as the drawn map, not a blown-out relight.
    // r128's light intensities do not translate: r155+ made lights physical,
    // so the viewer's numbers render near-black here — which is exactly what
    // Sam saw. The board's real light source is the ARTWORK: it is pre-lit by
    // the artist, so the floor and rock glow with their own texture (emissive,
    // below) and the lamps only add depth on the 3D pieces.
    // D2:R's own approach (per the GDC talk): strip the constant ambient
    // room light and let dynamic point lights carry the scene. Ambient here
    // is a floor, not a source - the carried torches, door lamps and the
    // self-lit artwork do the actual illuminating.
    const ambient = new THREE.AmbientLight(0x8a8078, 1.5)
    scene.add(ambient)
    const hemi = new THREE.HemisphereLight(0x6a7090, 0x2e2418, 0.8)
    scene.add(hemi)
    const moon = new THREE.DirectionalLight(0x6a7a9c, 0.7)
    moon.position.set(-20, 30, -10)
    scene.add(moon)
    const torch = new THREE.PointLight(0xff9a3c, 40, 90, 1.4)
    torch.castShadow = true
    torch.shadow.mapSize.set(1024, 1024)
    scene.add(torch)
    const torch2 = new THREE.PointLight(0xff7722, 18, 50, 1.8)
    scene.add(torch2)

    // ---- orbit camera, as the viewer had it -------------------------
    const target = new THREE.Vector3()
    // Diablo II's camera: low, close, committed. Orbit still works, but the
    // default is the dimetric stare and the elevation clamp keeps you from
    // floating up into map-editor territory where the dread evaporates.
    let az = Math.PI * 0.75
    let el = 0.55
    let dist = 22
    const applyCamera = () => {
      camera.position.set(
        target.x + dist * Math.cos(el) * Math.cos(az),
        target.y + dist * Math.sin(el),
        target.z + dist * Math.cos(el) * Math.sin(az),
      )
      camera.lookAt(target)
      // The ortho camera holds the classic angle whatever the orbit does.
      orthoCam.position.set(
        target.x + 60 * Math.cos(CLASSIC_EL) * Math.cos(CLASSIC_AZ),
        target.y + 60 * Math.sin(CLASSIC_EL),
        target.z + 60 * Math.cos(CLASSIC_EL) * Math.sin(CLASSIC_AZ),
      )
      orthoCam.lookAt(target)
      sizeOrtho()
    }

    let drag: { x: number; y: number; btn: number; shift: boolean; moved: boolean } | null = null
    const onDown = (e: MouseEvent) => { drag = { x: e.clientX, y: e.clientY, btn: e.button, shift: e.shiftKey, moved: false } }
    const onUp = () => setTimeout(() => { drag = null }, 0)
    const onMove = (e: MouseEvent) => {
      if (!drag) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      drag.x = e.clientX
      drag.y = e.clientY
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
      if (classic || drag.btn === 2 || drag.shift) {
        const right = new THREE.Vector3().subVectors(camera.position, target).cross(camera.up).normalize()
        const fwd = new THREE.Vector3().crossVectors(camera.up, right)
        target.addScaledVector(right, dx * dist * 0.0015)
        target.addScaledVector(fwd, dy * dist * 0.0015)
      } else {
        az += dx * 0.005
        el = Math.min(1.05, Math.max(0.3, el + dy * 0.005))
      }
      applyCamera()
    }
    const onWheel = (e: WheelEvent) => {
      if (classic) {
        orthoZoom = Math.min(3.2, Math.max(0.45, orthoZoom * (e.deltaY > 0 ? 0.92 : 1.09)))
      } else {
        dist = Math.min(80, Math.max(6, dist * (e.deltaY > 0 ? 1.1 : 0.9)))
      }
      applyCamera()
    }
    renderer.domElement.addEventListener("mousedown", onDown)
    window.addEventListener("mouseup", onUp)
    window.addEventListener("mousemove", onMove)
    renderer.domElement.addEventListener("wheel", onWheel, { passive: true })
    renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault())

    // ---- keyboard pan: arrows (or WASD) glide the view ---------------
    // Held keys accumulate in a set and the render loop integrates them,
    // so the glide is frame-smooth instead of stuttering on key repeat.
    // Direction convention: an arrow moves the VIEW that way — ArrowRight
    // shows you what lies to the right, mirroring every map tool going.
    // Keys are ignored while anything typeable has focus, so the chat box
    // never fights the camera for the letter A.
    const heldPanKeys = new Set<string>()
    const PAN_KEYS = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"]
    const typingNow = () => {
      const el = document.activeElement as HTMLElement | null
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)
    }
    const onPanKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if (!PAN_KEYS.includes(k) || typingNow() || e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault() // arrows must not scroll the page under the board
      heldPanKeys.add(k)
    }
    const onPanKeyUp = (e: KeyboardEvent) => { heldPanKeys.delete(e.key.toLowerCase()) }
    const onPanBlur = () => heldPanKeys.clear() // alt-tab with a key held must not leave the camera drifting
    window.addEventListener("keydown", onPanKeyDown)
    window.addEventListener("keyup", onPanKeyUp)
    window.addEventListener("blur", onPanBlur)
    const panFromKeys = (dt: number) => {
      if (!heldPanKeys.size) return
      // Same basis vectors the mouse drag uses, so both inputs agree on
      // what "up the map" means at any orbit angle.
      let x = 0
      let y = 0
      if (heldPanKeys.has("arrowleft") || heldPanKeys.has("a")) x += 1
      if (heldPanKeys.has("arrowright") || heldPanKeys.has("d")) x -= 1
      if (heldPanKeys.has("arrowup") || heldPanKeys.has("w")) y += 1
      if (heldPanKeys.has("arrowdown") || heldPanKeys.has("s")) y -= 1
      if (!x && !y) return
      const right = new THREE.Vector3().subVectors(camera.position, target).cross(camera.up).normalize()
      const fwd = new THREE.Vector3().crossVectors(camera.up, right)
      // Speed scales with zoom the way the drag does: close in you pan
      // gently, zoomed out you cross the cavern in a second.
      const step = dist * 0.75 * dt
      target.addScaledVector(right, x * step)
      target.addScaledVector(fwd, y * step)
      applyCamera()
    }

    // ---- texture plumbing -------------------------------------------
    const loader = new THREE.TextureLoader()
    const texCache = new Map<string, THREE.Texture>()
    const tex = (url: string, repeat = 1) => {
      const key = url + "@" + repeat
      const hit = texCache.get(key)
      if (hit) return hit
      const t = loader.load(url)
      t.colorSpace = THREE.SRGBColorSpace
      t.wrapS = t.wrapT = THREE.RepeatWrapping
      t.repeat.set(repeat, repeat)
      texCache.set(key, t)
      return t
    }

    // ---- normals from the painting: the D2:R sprite-relighting trick ----
    // The art is 2D, but its LUMINANCE is a usable heightmap: run a Sobel
    // filter over it and you get surface normals - N = normalize(-dH/dx,
    // -dH/dy, 1) - so a torch raking across the tile catches the painted
    // stones and grout as if they had depth. This is exactly how D2:R lets
    // modern point lights land on classic sprite art.
    const sobelNormalMap = async (url: string): Promise<THREE.Texture | null> => {
      try {
        const blob = await fetch(url, { mode: "cors" }).then((r) => (r.ok ? r.blob() : null))
        if (!blob) return null
        const bmp = await createImageBitmap(blob)
        const N = 512 // plenty for lighting; full-res normals just cost memory
        const cnv = document.createElement("canvas")
        cnv.width = cnv.height = N
        const cx = cnv.getContext("2d", { willReadFrequently: true })!
        cx.drawImage(bmp, 0, 0, N, N)
        const px = cx.getImageData(0, 0, N, N).data
        const H = new Float32Array(N * N)
        for (let i = 0; i < N * N; i++) {
          H[i] = (px[i * 4] * 0.299 + px[i * 4 + 1] * 0.587 + px[i * 4 + 2] * 0.114) / 255
        }
        const out = cx.createImageData(N, N)
        const at = (x: number, y: number) => H[Math.min(N - 1, Math.max(0, y)) * N + Math.min(N - 1, Math.max(0, x))]
        const STRENGTH = 2.2
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            // Sobel kernels for dH/dx and dH/dy
            const gx =
              -at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1) +
               at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)
            const gy =
              -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) +
               at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)
            const nx = -gx * STRENGTH
            const ny = -gy * STRENGTH
            const nz = 1
            const inv = 1 / Math.hypot(nx, ny, nz)
            const o = (y * N + x) * 4
            out.data[o] = ((nx * inv) * 0.5 + 0.5) * 255
            out.data[o + 1] = ((ny * inv) * 0.5 + 0.5) * 255
            out.data[o + 2] = ((nz * inv) * 0.5 + 0.5) * 255
            out.data[o + 3] = 255
          }
        }
        cx.putImageData(out, 0, 0)
        const t = new THREE.CanvasTexture(cnv)
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
        return t
      } catch (e) {
        console.warn("[board] normal map generation failed - flat lighting stands:", e)
        return null
      }
    }

    // ---- picking: tokens for selection, the floor for movement ------
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    let floorPlane: THREE.Mesh | null = null
    const doorLeaves: THREE.Mesh[] = []
    interface DoorRec {
      cell: string
      data: NonNullable<CellsJson["cells"]["doors"]>[number]
      hinge: THREE.Group
      leaf: THREE.Mesh
      open: boolean
      locked: boolean
      t: number
      targetT: number
      shake: number
    }
    const doorRecs: DoorRec[] = []

    const applyDoor = (rec: DoorRec, t: number) => { rec.hinge.rotation.y = -t * Math.PI * 0.58 }

    const onClick = (ev: MouseEvent) => {
      if (drag && drag.moved) return
      const r = renderer.domElement.getBoundingClientRect()
      pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1
      pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(pointer, activeCam())

      // 1. A token?
      const tokenObjs: THREE.Object3D[] = []
      tokensRef.current.forEach((t) => tokenObjs.push(t.obj))
      const tokenHit = raycaster.intersectObjects(tokenObjs, true)[0]

      /**
       * WHICH SQUARE IS UNDER THE CURSOR, whatever the cursor is over.
       *
       * A miniature is a TALL object standing on a ONE-SQUARE base, and the
       * board is drawn at an angle. So a model's body is painted across the
       * squares in front of it — and the raycast tests token meshes before
       * the floor, which means clicking the square in front of a character
       * hits that character instead of the ground.
       *
       * Reported exactly that way: "Samson won't move to the block in front
       * of the bard." Not any square — the one the bard's body covers.
       */
      const floorCellUnderCursor = (): string | null => {
        if (!floorPlane) return null
        const hit = raycaster.intersectObject(floorPlane, false)[0]
        if (!hit) return null
        const fx = Math.floor(hit.point.x / SQ)
        const fy = Math.floor(hit.point.z / SQ)
        const mm = mapRef.current
        if (!mm || fx < 0 || fy < 0 || fx >= mm.grid_width || fy >= mm.grid_height) return null
        return fx + "," + fy
      }

      // A MOVE BEATS A SELECTION when the ground under the cursor is legally
      // walkable. Safe by construction: a token's OWN square is never in the
      // reach set (you may pass through a friend but never end on one), so
      // this can only ever fire where a model OVERHANGS a different square —
      // which is the bug, not a case anyone wants selection for.
      //
      // Deliberately below the armed check and above plain selection: aiming
      // a spell still belongs to the creature, and inspecting a body still
      // works everywhere the ground is not walkable.
      if (tokenHit && !armedRef.current) {
        const reachNow = reachRef.current
        const k = floorCellUnderCursor()
        let o: THREE.Object3D | null = tokenHit.object
        while (o && !o.userData.tokenId) o = o.parent
        const hitId = o?.userData.tokenId as string | undefined
        const c = combatRef.current
        const activeTokenId = c?.turn_order?.[c.active_index]?.token_id
        // The active miniature keeps its click — that is how movement opens
        // and closes — so only OTHER bodies give way to the floor beneath.
        if (k && reachNow?.cells.has(k) && hitId !== activeTokenId) {
          const cell = reachNow.cells.get(k)!
          const [cgx, cgy] = k.split(",").map(Number)
          const feet = cell.cost * FEET_PER_SQUARE
          if (cell.tier === "dash") {
            setPendingDash({
              feet,
              commit: () => {
                sendWalkPath(reachNow.tokenId, pathCells(k), true)
                playerMoveRef.current(reachNow.tokenId, cgx, cgy, feet, true)
                clearReach()
              },
            })
            return
          }
          sendWalkPath(reachNow.tokenId, pathCells(k))
          playerMoveRef.current(reachNow.tokenId, cgx, cgy, feet)
          clearReach()
          return
        }
      }

      if (tokenHit) {
        let o: THREE.Object3D | null = tokenHit.object
        while (o && !o.userData.tokenId) o = o.parent
        const id = o?.userData.tokenId as string | undefined
        if (id) {
          const entry = tokensRef.current.get(id)
          if (entry) {
            // A spell is armed: this click is the throw, not a selection.
            if (armedRef.current) {
              releaseAtRef.current(id)
              return
            }
            // CLICKING YOUR OWN MINIATURE OPENS ITS MOVEMENT.
            //
            // Only for the combatant whose turn it actually is, and only for
            // a browser that may drive them — the same gate computeReach
            // uses, asked here so a click that cannot open anything falls
            // through to plain selection instead of silently doing nothing.
            const c = combatRef.current
            const activeTokenId = c?.turn_order?.[c.active_index]?.token_id
            if (c && id === activeTokenId) {
              // Second click closes it again. A player who opened their reach
              // to look, and then decided to cast instead, needs the gold off
              // the floor without having to end their turn to clear it.
              const why = toggleReachRef.current()
              setSelected(entry.row)
              if (why === "no-claim") {
                say("This browser is not driving that character — claim them, or unlock as DM.")
              }
              return
            }
            setSelected((cur) => (cur?.id === id ? null : entry.row))
            return
          }
        }
      }

      // 2. Something on the floor? Below the creatures (a body in front of
      //    a pile is still a body) and above the doors and the walk, so a
      //    click on the shard is a reach for it, not a step onto its square.
      //    Not while a spell is armed: aiming is aiming.
      if (groundItems && !armedRef.current) {
        const propHit = raycaster.intersectObjects(groundItems.objects(), true)[0]
        const pile = groundItems.rowFor(propHit?.object)
        if (pile) {
          void pickUp(pile)
          return
        }
      }

      // 3. A door?
      const doorHit = raycaster.intersectObjects(doorLeaves, false)[0]
      if (doorHit) {
        const rec = doorHit.object.userData.door as DoorRec
        if (rec.locked) {
          rec.shake = 1
          const d = rec.data
          say(d.lock_note ? `LOCKED — ${d.lock_note}` : `The ${d.type ?? "iron"} door is locked.${d.lock_dc ? ` DC ${d.lock_dc}.` : ""}`)
        } else {
          rec.open = !rec.open
          rec.targetT = rec.open ? 1 : 0
          say(rec.open ? `The ${rec.data.type ?? "iron"} door swings open.` : `The ${rec.data.type ?? "iron"} door closes.`)
          // A door changing state redraws the world you can walk through.
          refreshReachRef.current()
        }
        return
      }

      // 3. The floor.
      //
      // While a spell is armed the ground is NOT a move order. Found in a
      // live rehearsal: aiming Guiding Bolt and clicking near a drow walked
      // Samson ten feet instead, spent his movement, and left the spell still
      // armed. Targeting and walking are different intentions and the same
      // click cannot mean both — so an armed caster clicking open floor is
      // told to pick a target or press Escape, and stays put.
      // MOVE on a summon card: this click is where the hand goes. The server
      // holds the rule (30 ft a time, 30 ft from its caster); the board
      // only names the square.
      if (summonMoveRef.current) {
        if (!floorPlane) return
        const aimHit = raycaster.intersectObject(floorPlane, false)[0]
        if (!aimHit) return
        const id = summonMoveRef.current
        setSummonMove(null)
        summonMoveRef.current = null
        void summonVerbRef.current({ op: "move", token_id: id, gx: Math.floor(aimHit.point.x / SQ), gy: Math.floor(aimHit.point.z / SQ) })
        return
      }
      if (armedRef.current) {
        // ...unless the spell was aimed at the GROUND in the first place.
        // Mage Hand, Fog Cloud, Fireball: the floor is not a consolation
        // target for these, it is the only legal one. Refusing it here is
        // what made nine spells in the book uncastable — the rack offered
        // them, the windup played, and the click was always turned away.
        if (armedRef.current.mode === "point") {
          if (!floorPlane) return
          const aimHit = raycaster.intersectObject(floorPlane, false)[0]
          if (!aimHit) return
          releaseAtPointRef.current(Math.floor(aimHit.point.x / SQ), Math.floor(aimHit.point.z / SQ))
          return
        }
        say(`${armedRef.current.name} — click a creature, or press Escape.`)
        return
      }
      if (!floorPlane) return
      const floorHit = raycaster.intersectObject(floorPlane, false)[0]
      if (!floorHit) return
      const gx = Math.floor(floorHit.point.x / SQ)
      const gy = Math.floor(floorHit.point.z / SQ)
      const m = mapRef.current
      if (!m || gx < 0 || gy < 0 || gx >= m.grid_width || gy >= m.grid_height) return
      // A player's walk: their turn, a yellow square → one click commits.
      // The walk animation is the glide the realtime echo already plays.
      const reach = reachRef.current
      const cellKey = gx + "," + gy
      if (reach && reach.cells.has(cellKey)) {
        const cell = reach.cells.get(cellKey)!
        const feet = cell.cost * FEET_PER_SQUARE
        // An azure square costs the Dash. ASK before spending it — a player
        // should never learn they burned their action by reading a toast.
        // Gold squares are free movement and commit on the single click, as
        // they always have.
        if (cell.tier === "dash") {
          // Capture the commit HERE, where sendWalkPath, pathCells and
          // clearReach are in scope. The dialog lives out in the JSX and has
          // no reach into this effect's closure, so it gets a function rather
          // than coordinates to reassemble.
          const key = cellKey
          setPendingDash({
            feet,
            commit: () => {
              sendWalkPath(reach.tokenId, pathCells(key), true)
              playerMoveRef.current(reach.tokenId, gx, gy, feet, true)
              clearReach()
            },
          })
          return
        }
        // Ship the route first, so every board (this one included) walks
        // the real path when the move lands.
        sendWalkPath(reach.tokenId, pathCells(cellKey))
        playerMoveRef.current(reach.tokenId, gx, gy, feet)
        clearReach() // repainted with the new budget when the server echoes
        return
      }
      // The DM's hand — only with the move toggle deliberately on, so a
      // stray click while narrating never teleports a miniature.
      const sel = selectedRef.current
      if (!dmRef.current || !dmMoveRef.current || !sel) return
      moveTokenRef.current(sel.id, gx, gy)
    }
    renderer.domElement.addEventListener("click", onClick)

    /** Which token is under this pointer event, if any. */
    const tokenUnder = (ev: MouseEvent): string | null => {
      const r = renderer.domElement.getBoundingClientRect()
      pointer.x = ((ev.clientX - r.left) / r.width) * 2 - 1
      pointer.y = -((ev.clientY - r.top) / r.height) * 2 + 1
      raycaster.setFromCamera(pointer, activeCam())
      const objs: THREE.Object3D[] = []
      tokensRef.current.forEach((t) => objs.push(t.obj))
      const hit = raycaster.intersectObjects(objs, true)[0]
      if (!hit) return null
      let o: THREE.Object3D | null = hit.object
      while (o && !o.userData.tokenId) o = o.parent
      return (o?.userData.tokenId as string | undefined) ?? null
    }

    /**
     * The read-out under the cursor while a spell is armed.
     *
     * Only runs when something is armed, so ordinary panning costs nothing.
     */
    const onHover = (ev: MouseEvent) => {
      const armed = armedRef.current
      // A point spell has no creature to interrogate — the template IS the
      // read-out. Leaving this running would price a save against whichever
      // body the cursor happened to pass over on the way to the floor.
      if (armed?.mode === "point") {
        setHoverRead(null)
        return
      }
      if (!armed) {
        setHoverRead((cur) => (cur ? null : cur))
        return
      }
      const id = tokenUnder(ev)
      const shooter = tokensRef.current.get(armed.tokenId)
      const victim = id ? tokensRef.current.get(id) : null
      if (!id || !victim || !shooter || victim.row.id === shooter.row.id) {
        setHoverRead((cur) => (cur ? null : cur))
        return
      }

      const status = targetStatus(shooter, victim, armed.entry.rangeFt, Boolean(armed.entry.helpful))
      let line: string
      if (!status.ok) {
        line =
          status.reason === "sight" ? "no clear line"
          : status.reason === "self" ? "not on yourself"
          : status.reason === "downed" ? "already down"
          : `${status.squares * 5} ft — out of range`
      } else if (status.confirm) {
        // Violet ring: a legal target, but the click will ask first.
        line = status.confirm === "foe" ? "not one of yours — will ask first" : "on your side — will ask first"
      } else if ((victim.row.hp_current ?? 1) <= 0) {
        // Only a HELPFUL spell reaches here now — a harmful one was refused
        // above. So this read is no longer a warning that you are about to
        // finish somebody off; it is the reason to cast.
        line = "down — this brings them back"
      } else {
        const e = armed.entry
        const ac = acRef.current.get(victim.row.id)
        const me = casterRef.current.get(armed.characterId)
        if (e.resolve === "attack" && ac !== undefined && me?.atk != null) {
          // d20 + bonus vs AC. A natural 1 always misses and a natural 20
          // always hits, so the honest range is 5%..95% — never 0 or 100.
          const need = ac - me.atk
          const pct = Math.max(5, Math.min(95, Math.round(((21 - need) / 20) * 100)))
          line = `${pct}% to hit  ·  AC ${ac}`
        } else if (e.resolve === "save" && e.save && me?.dc != null) {
          line = `${e.save} save vs DC ${me.dc}`
        } else if (e.heals) {
          line = "healing"
        } else {
          line = ac !== undefined ? `AC ${ac}` : "in range"
        }
      }

      const r = renderer.domElement.getBoundingClientRect()
      setHoverRead({
        x: ev.clientX - r.left,
        y: ev.clientY - r.top,
        label: victim.row.label,
        line,
        ok: status.ok,
      })
    }
    renderer.domElement.addEventListener("mousemove", onHover)

    // ---- token meshes -----------------------------------------------
    // ================= THE DARKNESS =================
    // Diablo II's world exists only inside light radii; everything else is
    // black. The floor art is self-lit (it has to be, or tone mapping eats
    // it), so darkness is painted ON TOP: a canvas lightmap multiplied over
    // the board, opaque dark everywhere except radial holes burned at each
    // party token. Enemies do not carry light - walking toward them means
    // walking toward shapes at the edge of your own torch.
    const LIGHT_TEX = 1024
    const lightCanvas = document.createElement("canvas")
    lightCanvas.width = lightCanvas.height = LIGHT_TEX
    const lightCtx = lightCanvas.getContext("2d")!
    const lightTexture = new THREE.CanvasTexture(lightCanvas)
    let darknessPlane: THREE.Mesh | null = null
    let lightRadiusSquares = 4.5 // ~22 ft of clear sight, dusk beyond

    const redrawDarkness = () => {
      const m = mapRef.current
      if (!m) return
      const W = m.grid_width
      const H = m.grid_height
      lightCtx.globalCompositeOperation = "source-over"
      // Not pure black: a hair of visibility so the DM's grid stays usable
      // and the room reads as darkness rather than a rendering failure.
      lightCtx.fillStyle = "rgba(2,2,6,0.93)"
      lightCtx.clearRect(0, 0, LIGHT_TEX, LIGHT_TEX)
      lightCtx.fillRect(0, 0, LIGHT_TEX, LIGHT_TEX)
      lightCtx.globalCompositeOperation = "destination-out"
      tokensRef.current.forEach(({ row }) => {
        if (!row.character_id || !row.is_visible) return // only the party carries light
        const cx = ((row.grid_x + 0.5) / W) * LIGHT_TEX
        const cy = ((row.grid_y + 0.5) / H) * LIGHT_TEX
        const r = (lightRadiusSquares / W) * LIGHT_TEX
        const g = lightCtx.createRadialGradient(cx, cy, r * 0.25, cx, cy, r)
        g.addColorStop(0, "rgba(0,0,0,1)")      // full clear at the flame
        g.addColorStop(0.55, "rgba(0,0,0,0.75)")
        g.addColorStop(1, "rgba(0,0,0,0)")      // darkness wins at the edge
        lightCtx.fillStyle = g
        lightCtx.beginPath()
        lightCtx.arc(cx, cy, r, 0, Math.PI * 2)
        lightCtx.fill()
      })
      lightTexture.needsUpdate = true
    }

    // ---- embers: the air of the place ----
    const EMBERS = 90
    const emberGeo = new THREE.BufferGeometry()
    const emberPos = new Float32Array(EMBERS * 3)
    const emberVel = new Float32Array(EMBERS)
    const emberSeed = new Float32Array(EMBERS)
    const emberMat = new THREE.PointsMaterial({
      color: 0xff8a3c, size: 0.055, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
    const embers = new THREE.Points(emberGeo, emberMat)

    // THE DECODER IS NOT OPTIONAL. Every token GLB in this project is
    // meshopt-compressed (it is how a 45 MB export became 608 KB), and a
    // GLTFLoader without setMeshoptDecoder REJECTS those files. This board
    // shipped without it while the /map 3D page had it — and because the
    // load call also had no error callback, the rejection was silent: rings
    // and name labels appeared instantly, the figures never did, and three
    // rounds of lighting and scaling fixes were spent on models that had
    // never loaded at all. If a loader in this repo loads project GLBs, it
    // sets this decoder. No exceptions.
    const gltfLoader = new GLTFLoader()
    gltfLoader.setMeshoptDecoder(MeshoptDecoder)
    const boardGroup = new THREE.Group()
    scene.add(boardGroup)
    const tokenGroup = new THREE.Group()
    scene.add(tokenGroup)

    const hpColor = (frac: number) => (frac > 0.5 ? 0x51c76a : frac > 0.25 ? 0xd9a53c : 0xd05555)

    /** The ring + HP arc every token carries, GLB or disc alike. */
    const buildBase = (row: TokenRow) => {
      const g = new THREE.Group()
      const r = radiusFor(row.token_size)
      const isParty = Boolean(row.character_id)
      const tint = row.tint_color ? new THREE.Color(row.tint_color) : new THREE.Color(isParty ? 0x38bdf8 : 0xef4444)

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.98, r * 1.18, 40),
        new THREE.MeshBasicMaterial({ color: tint, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
      )
      ring.rotation.x = -Math.PI / 2
      ring.position.y = 0.06
      // Held on the group so the animate loop can show it for the combatant
      // whose turn it is and hide it for everyone else.
      //
      // Sam: "the only ring highlighted on the base should be the active
      // character." Ringing all eleven tokens at once made the board a field
      // of lit discs with a green glow somewhere in it — the ONE fact that
      // changes what you can do, competing with ten that do not.
      //
      // The HP arc below is deliberately NOT hidden. It is information the
      // table reads at a glance, not a highlight, and losing it would mean
      // clicking each body to find out who is hurt.
      ring.userData.isBaseRing = true
      g.userData.baseRing = ring
      g.add(ring)

      if (row.hp_max && row.hp_max > 0) {
        const frac = Math.max(0, Math.min(1, (row.hp_current ?? row.hp_max) / row.hp_max))
        const arc = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.22, r * 1.38, 40, 1, Math.PI / 2, -frac * Math.PI * 2),
          new THREE.MeshBasicMaterial({ color: hpColor(frac), transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
        )
        arc.rotation.x = -Math.PI / 2
        arc.position.y = 0.065
        // Hidden with the ring for everyone but the active combatant.
        //
        // An earlier pass kept these on the grounds that health is
        // information rather than decoration. On the board that reasoning did
        // not survive contact: eleven green arcs ARE eleven circles, and Sam
        // asked for one. The health of the party is on the character plates
        // down the left, in numbers, permanently — so nothing is lost here
        // that is not better said over there.
        arc.userData.isHpArc = true
        g.userData.hpArc = arc
        g.add(arc)
      }
      return g
    }

    /** Everything needed to drive one skinned model's clips. */
    interface TokenAnim {
      mixer: THREE.AnimationMixer
      clips: THREE.AnimationClip[]
      names: string[]
      current: THREE.AnimationAction | null
      state: TokenState
    }

    /**
     * Cross-fade a token into a state. One-shots (attack, hurt) play once and
     * hand back to idle; everything else loops. A model missing the clip for
     * a state simply keeps what it is doing rather than snapping to a T-pose.
     *
     * `explicit` overrides the state's usual clip, which is how a cast picks
     * between a flick of the wrist and a two-handed overhead discharge —
     * both are the "cast" state, but they are different clips.
     *
     * Returns the clip that actually played, so the caller can look up when
     * the spell leaves the hand.
     */
    const playState = (
      anim: TokenAnim,
      state: TokenState,
      force = false,
      explicit?: string | null,
    ): THREE.AnimationClip | null => {
      if (!force && anim.state === state) return null
      const name = explicit ?? clipFor(state, anim.names)
      if (!name) return null
      const clip = anim.clips.find((c) => c.name === name)
      if (!clip) return null
      const next = anim.mixer.clipAction(clip)
      const returns = ONE_SHOT.includes(state)
      const hold = HOLD_LAST.includes(state)
      const once = returns || hold
      next.reset()
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
      next.clampWhenFinished = once
      next.fadeIn(0.18).play()
      if (anim.current && anim.current !== next) anim.current.fadeOut(0.18)
      anim.current = next
      anim.state = state
      if (returns) {
        // Back to the stance when the swing finishes — the mixer tells us.
        const onFinish = (e: { action: THREE.AnimationAction }) => {
          if (e.action !== next) return
          anim.mixer.removeEventListener("finished", onFinish as never)
          playState(anim, "idle", true)
        }
        anim.mixer.addEventListener("finished", onFinish as never)
      }
      return clip
    }

    /** At 0 HP. Null hp_current means "not tracked", which is not dead. */
    const isDowned = (row: TokenRow) =>
      row.hp_current !== null && row.hp_current !== undefined && row.hp_current <= 0

    /**
     * What last hit each creature, remembered so its death can look like it.
     *
     * The damage type is known when the effect LANDS, but the death is known
     * later, when the server's HP write comes back down the wire. These are
     * two separate moments, so the type has to be carried between them.
     */
    const lastHitBy = new Map<string, DamageType>()

    /**
     * The SAME question, in the server's vocabulary rather than the sprite
     * kit's — and this is the one the death reads.
     *
     * `lastHitBy` holds the kit's 13 types, which is what a sprite sheet needs
     * and all it needs. But the kit has ONE word for every weapon, "physical",
     * and an arrow through the chest is not the same corpse as a mace. The
     * server has always known the difference — it parses "1d6+1 Piercing" at
     * /api/combat and puts the word on the wire — and the board has always
     * thrown it away.
     *
     * So both maps are kept. The sheet reads one, the body reads the other.
     */
    const lastHitWith = lastHitWithRef.current

    /**
     * Who is currently sneaking, by token id.
     *
     * Set by pressing Hide, and it is the only thing that makes `Hide` more
     * than a noise: a sneaking miniature's footsteps use the quiet loop that
     * has been sitting in the bucket unplayed since the pack was recorded.
     *
     * CLIENT-SIDE ONLY, deliberately. Nothing in the schema records stealth -
     * there is no `hidden` column on vtt_tokens and no condition for it - so
     * this is one browser's memory of what it just watched, not a fact about
     * the world. It is honest at that scope: the seat that pressed Hide hears
     * the difference. Making it a fact for the whole table means a column, a
     * server rule for what breaks it, and a Stealth check to set it, which is
     * a bigger change than a sound.
     */
    const sneaking = sneakingRef.current

    /**
     * Conditions off a token row, lower-cased, as a plain array.
     *
     * vtt_tokens has no conditions column; the row can still carry them when
     * the board was handed a joined shape. Written defensively rather than
     * optimistically because the ONE thing this feeds — "did it die of sleep"
     * — is asked at the exact moment a creature has just hit zero, and an
     * exception there loses the whole death.
     */
    const normaliseConditions = (row: TokenRow): string[] => {
      const raw = (row as unknown as { conditions?: unknown }).conditions
      if (Array.isArray(raw)) {
        return raw.map((c) => (typeof c === "string" ? c : String((c as { name?: string })?.name ?? ""))).filter(Boolean)
      }
      return []
    }

    // ── CASTING ────────────────────────────────────────────────────────────
    // Live effects, advanced by the same clock as everything else. A cast
    // that is still in the air when the board unmounts is disposed with it.
    const vfx: VfxHandle[] = []
    /** Casts waiting for their release frame — the spell has not left the
     *  hand yet, because the hand has not got there yet. */
    interface PendingCast {
      wait: number
      obj: THREE.Object3D
      hand: CastHand
      spell: string
      target: THREE.Vector3 | null
      /** Who it was thrown at, so the effect can make them flinch when it lands. */
      victimId: string | null
      /**
       * What the target does about it when the effect lands.
       *
       * "hurt" is the flinch. "dodge", "parry" and "block" are the server's
       * verdict turned into a motion by defenceFor: a save or a near miss no
       * longer doubles the target over as though it had connected — which
       * was reported as "she acted like she was hit as opposed to resisting
       * it" — and a miss by nine is a step out of the way, not a parry of a
       * blade that passed a foot wide. null means the body does not answer
       * at all: a heal, a fumble, a verdict this model has no clip for.
       */
      reaction: TokenState | null
      /**
       * A weapon swing rather than a spell. Nothing is thrown and no light is
       * spawned; the entry exists so the CONTACT frame can make the target
       * react and the blade make its noise — instead of both happening the
       * moment the server answered, which since the board started asking
       * first was half a second before the arm had moved.
       */
      swing?: boolean
      /**
       * An area cast's bodies, resolved to what each one does when the shape
       * lands. The effect flies to a SQUARE, not a creature, so `victimId`
       * is null for these and this list is how the impact reaches the people
       * standing in it — until now nobody in a Fireball reacted at all,
       * because the impact handler only ever knew about one victim.
       */
      victims?: { id: string; reaction: TokenState | null; amount: number; heals: boolean; word: "saved" | "miss" | null }[]
      /** Played on the frame the effect arrives — the impact sound. */
      onLand?: () => void
      /**
       * The squares the shape covered, already clipped to the map.
       *
       * Carried from the release rather than recomputed here, so the mark the
       * blast leaves is the SAME cell list the template outlined and the
       * server charged — recomputing would be a third opinion about the shape
       * and eventually a disagreeing one.
       */
      cells?: Cell[]
      /** Where the bloom radiates from: the aimed square, or the caster's for a cone. */
      centre?: Cell
      /** Whose concentration holds a lingering mark, so it can be ended. */
      casterTokenId?: string
    }
    const pending: PendingCast[] = []

    /**
     * Ground marks that outlive their cast, keyed by the caster holding them.
     *
     * A Fireball's scorch fades on its own and never lands here. A Web does
     * not: it is terrain, and it stays until the concentration that made it
     * stops. Keyed by caster because that is the thing that ends it — and
     * because one caster can hold only one concentration, so arming a second
     * area spell is itself the signal to drop the first.
     */
    const areaDecals = new Map<string, AreaDecalHandle>()
    // Blood on the tiles. Laid by the route into vtt_maps.meta.marks; this
    // only paints what the row says, at load and again on every change.
    let blood: BloodDecalHandle | null = null
    // Things lying on the floor (vtt_ground_items). Same arrangement as the
    // blood: the route owns the rows, Realtime carries them, this only draws
    // — and, unlike the blood, they can be clicked.
    let groundItems: GroundItemHandle | null = null

    /**
     * PICKING SOMETHING UP. Sam: "a way to be able to pick up items (to put
     * in inventory, throw, interact with) on our player UI."
     *
     * A click on a pile is a reach for it by the character this browser
     * drives. The cheap refusals are answered here without a round trip —
     * no claimed character, too far away — and everything that costs
     * something (whose turn it is, the free interaction, the action) is
     * decided by /api/ground-items, which is the only thing that writes.
     * The pile vanishes from every board through Realtime, and the pack
     * updates the rack through the inventory channel below.
     */
    const pickUp = async (row: GroundItemRow) => {
      const me = myCharRef.current
      if (!me) {
        say(dmRef.current ? "Claim a character to pick that up — the DM has no hands on the board." : "Claim a character to pick that up.")
        return
      }
      const mine = Array.from(tokensRef.current.values()).find((t) => t.row.character_id === me)
      if (!mine) {
        say("Your character is not on this board.")
        return
      }
      if (!withinReach({ x: mine.row.grid_x ?? 0, y: mine.row.grid_y ?? 0 }, { x: row.grid_x, y: row.grid_y })) {
        say(`The ${row.name} is out of reach — move next to it first.`)
        return
      }
      try {
        const res = await fetch("/api/ground-items", {
          method: "POST",
          headers: { "content-type": "application/json", ...dmHeaders() },
          body: JSON.stringify({ action: "pickup", character_id: me, ground_item_id: row.id, sandbox }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          say(data?.error ?? "It slips out of your hand.")
          return
        }
        if (data?.line) say(data.line as string)
      } catch {
        say("The board could not reach the server.")
      }
    }

    /**
     * What the target does about a cast, given what the server said.
     *
     * No answer at all means no ruling reached this path — an NPC turn, a DM
     * flourish — and those keep the old behaviour of flinching on arrival.
     * A full verdict goes through defenceFor, which also gets told whether
     * this target carries a shield. An answer with no verdict is an older
     * server: hit points are all there is, so flinch or stand, never guess.
     */
    const reactionFor = (answer: CastAnswer | null | undefined, victim: TokenRow | null): TokenState | null => {
      if (!answer) return "hurt"
      if (answer.verdict) {
        const hasShield = Boolean(victim?.character_id && shieldRef.current.has(victim.character_id))
        return defenceFor(answer.verdict.outcome, answer.verdict.margin, { hasShield })
      }
      return answer.hurt ? "hurt" : null
    }

    /**
     * Everyone the server found in an area cast, each turned into a reaction
     * the way a single target is — through reactionFor, so a shield-bearer
     * braces and the model's own clips decide what a dodge looks like. A zero
     * carries the word that explains it (SAVED, or MISS for the odd area
     * spell that rolls to hit); real damage carries no word, the number says
     * enough.
     */
    const areaVictims = (answer: CastAnswer | null | undefined) => {
      if (!answer?.victims?.length) return undefined
      return answer.victims.map((v) => {
        const row = tokensRef.current.get(v.id)?.row ?? null
        const verdict = isAttackOutcome(v.outcome) ? { outcome: v.outcome, margin: v.margin } : null
        return {
          id: v.id,
          amount: v.amount,
          heals: v.heals,
          word: v.amount > 0 ? null : v.outcome === "saved" ? ("saved" as const) : ("miss" as const),
          reaction: reactionFor({ ok: true, hurt: v.amount > 0 && !v.heals, verdict }, row),
        }
      })
    }

    /**
     * The HUD pressed an ability. Play the matching clip on that character's
     * miniature and, at the clip's release frame, throw the spell from the
     * hand that throws it.
     */
    const performCast = (
      characterId: string,
      ability: string,
      kind: string,
      explicitToken?: { row: TokenRow; obj: THREE.Object3D; anim?: TokenAnim },
      /** The creature that was actually clicked. See "Where it is thrown". */
      explicitTarget?: TokenRow | null,
      /**
       * A SQUARE that was clicked, for spells thrown at the ground.
       *
       * An area spell has no victim to fly at, but it still has somewhere to
       * go — and a Fireball that discharges in the caster's hand because no
       * token was passed is worse than one that does not animate at all.
       */
      explicitPoint?: { x: number; z: number } | null,
      /**
       * The server's answer, when there is one. Absent means no ruling
       * reached this path and the target flinches on arrival as it always
       * did; see reactionFor for how a real verdict is turned into a motion.
       */
      outcome?: CastAnswer | null,
      /**
       * The ground an area cast covers, for the mark it leaves behind.
       * Absent for everything thrown at a creature.
       */
      shape?: { cells: Cell[]; centre: Cell; casterTokenId: string } | null,
    ) => {
      // HIDE, WHICH USED TO BE NOTHING AT ALL.
      //
      // `castPlanFor` mutes it - correctly, since slipping into shadow is not
      // a swing and the board has no clip for it - and the early return below
      // meant the button did nothing whatsoever. No animation, no sound, no
      // state. A player pressed it and the game did not acknowledge it.
      //
      // So it is answered here, ABOVE the mute, with the two things it can
      // honestly have: a sound, and the fact of being hidden. The fact is what
      // makes the sound worth anything - it changes how this character's next
      // move sounds, which is the whole point of sneaking.
      if (kind === "action" && ability.trim().toLowerCase() === "hide") {
        const mine = Array.from(tokensRef.current.values())
          .find((t) => t.row.character_id === characterId)
        if (mine) {
          sneakingRef.current.add(mine.row.id)
          // Any footsteps already running belong to a walk that was not
          // sneaking. Cut them so the next step starts quiet.
          stopFootsteps(mine.row.id)
        }
        playSfx("combat/hide", { volume: 0.7, rate: variedRate(0.05) })
        return
      }

      // AND ANYTHING ELSE BREAKS IT.
      //
      // PHB: attacking gives away your position. This is the loose version of
      // that - any ability other than Hide ends the sneaking, because a rogue
      // who stays quiet through casting Fireball is a bug the player would
      // hear immediately. Dash and Disengage break it too, which is stricter
      // than the book and is the safe direction for a guess: the cost of
      // wrongly going loud is one ordinary footstep, and the cost of wrongly
      // staying quiet is the feature lying.
      {
        const mine = Array.from(tokensRef.current.values())
          .find((t) => t.row.character_id === characterId)
        if (mine) sneaking.delete(mine.row.id)
      }

      const plan = castPlanFor(ability, kind)
      if (!plan) return // Dash and friends animate nothing
      // A swing's noise belongs to the contact frame, and that frame is
      // scheduled further down. Every early return before it is a miniature
      // that cannot swing — a disc pawn, a corpse, a model with no clip — and
      // the blow still happened, so the sound plays now rather than never.
      const w = outcome?.weapon ?? null
      // WHAT IT SOUNDS LIKE DEPENDS ON WHAT IT HIT.
      //
      // This was one clip for every landed blow and one for every miss, so a
      // whole evening of fighting had two sounds in it. `meleeHit` now picks
      // from the five that were already in the bucket and never played, and
      // it needs three facts to do it: whether the weapon is ranged, what
      // damage it deals, and what the target is wearing.
      //
      // The armour is read off the target's AC, because nothing in the schema
      // records armour. It is a proxy and it is stated as one in sfx.ts.
      const ranged = /bow|sling|dart|javelin/.test(ability.toLowerCase())
      const targetAc = w?.targetAc ?? null
      const dmgWord = lastHitWithRef.current.get(explicitTarget?.id ?? "") ?? null
      const swingSound = w
        ? () => playSfx(
            w.hit || ranged
              ? meleeHit(w.crit, { ranged, damageType: dmgWord, targetAc, hit: w.hit })
              : "combat/melee_miss",
            // A touch of detune on every blow, so six attacks in a round are
            // six sounds rather than one sound six times.
            { volume: 0.9, rate: variedRate() },
          )
        : null
      let found = explicitToken
      if (!found) {
        for (const e of Array.from(tokensRef.current.values())) {
          if (e.row.character_id === characterId) { found = e; break }
        }
      }
      if (!found) { swingSound?.(); return }
      // Say out loud which figure is about to move. When the wrong one does,
      // this line names it instead of leaving us to guess.
      console.log(`[cast] ${ability} → token "${found.row.label}" (character ${characterId.slice(0, 8)}…, model ${String(found.row.model_url ?? "none").split("/").pop()})`)
      const anim = found.anim
      if (!anim) { swingSound?.(); return } // a disc pawn has nothing to animate
      if (isDowned(found.row)) { swingSound?.(); return } // a corpse casts nothing

      // The spell's name picks its motion, so two cantrips off the same
      // caster no longer play the identical clip — and the same spell always
      // plays the same one, which is what makes it recognisable.
      const explicit = plan.state === "cast" ? castClipFor(plan.weight, anim.names, ability) : null
      const clip = playState(anim, plan.state, true, explicit)
      if (!clip) { swingSound?.(); return }
      if (plan.state === "hurt") return // Dodge is a flinch, not a spell

      // Only magic throws light. "Attack" resolves to a cast clip for a
      // caster — Kenta's attack IS an Eldritch Blast — but for a martial it
      // resolves to a sword swing, and a swing must not emit arcane sparks.
      const isSpell = plan.state === "cast" || /spell|cast|soell/i.test(clip.name)
      if (!isSpell) {
        // A SWING THROWS NOTHING, BUT IT STILL LANDS.
        //
        // Weapons never reached the impact handler: the flinch hangs off the
        // spell effect's arrival, and a sword spawns no effect. So a hit
        // rogue and a missed rogue looked identical, and both looked like
        // nothing. This entry gives the swing a contact frame of its own —
        // the same release point the cast table uses, which for an attack
        // clip is the 45% mark where the arm is furthest forward — and on
        // that frame the blade makes its noise and the target answers.
        //
        // The victim is the creature that was clicked, or nobody. A swing
        // that began somewhere other than a click (an NPC turn drawn by the
        // DM's browser) has no one to make react, and reacts no one.
        const swingVictim = explicitTarget ? tokensRef.current.get(explicitTarget.id) : undefined
        if (swingVictim) {
          const dx = swingVictim.obj.position.x - found.obj.position.x
          const dz = swingVictim.obj.position.z - found.obj.position.z
          if (dx * dx + dz * dz > 1e-4) found.obj.rotation.y = Math.atan2(dx, dz)
        }
        pending.push({
          wait: castEventFor(clip.name, clip.duration).release,
          obj: found.obj,
          hand: "RightHand",
          spell: ability,
          target: null,
          victimId: swingVictim?.row.id ?? null,
          reaction: reactionFor(outcome, explicitTarget ?? null),
          swing: true,
          onLand: swingSound ?? undefined,
        })
        return
      }

      // Where it is thrown.
      //
      // The victim is passed in when the caller already knows it — which the
      // two-phase cast always does, because you clicked the creature. It must
      // NOT be re-derived from selection here: releaseAt calls setSelected()
      // and then this, in the same tick, and React has not updated the ref by
      // then. That read returned the PREVIOUS selection — usually nothing, so
      // target came back null and the spell discharged on the caster instead
      // of flying at the creature under the cursor.
      //
      // This is the same bug the explicitToken parameter above was added to
      // fix for the shooter, left unfixed for the target. Selection stays as
      // the fallback for casts that begin somewhere other than a click.
      let target: THREE.Vector3 | null = null
      // A point cast must NOT fall back to the selection. The fallback exists
      // for casts that begin somewhere other than a click; an area spell has
      // already said where it is going, and letting a stale selection answer
      // instead would fly a Fireball at whichever token was last clicked
      // rather than at the square the player aimed it at.
      const victimRow = explicitTarget ?? (explicitPoint ? null : (() => {
        const sel = selectedRef.current
        return sel && sel.id !== found!.row.id ? sel : null
      })())
      if (victimRow) {
        const t = tokensRef.current.get(victimRow.id)
        if (t) target = new THREE.Vector3(t.obj.position.x, 1.1, t.obj.position.z)
      } else if (explicitPoint) {
        // Lower than a creature's chest, because it lands ON the floor.
        target = new THREE.Vector3(explicitPoint.x, 0.35, explicitPoint.z)
      }

      // Turn to face what you are throwing it at. A caster who discharges a
      // bolt over their own shoulder reads as a bug even when the bolt flies
      // true, and the rune disc is drawn along the cast direction, so the
      // facing has to be right BEFORE the clip starts rather than after.
      if (target) {
        const dx = target.x - found.obj.position.x
        const dz = target.z - found.obj.position.z
        if (dx * dx + dz * dz > 1e-4) found.obj.rotation.y = Math.atan2(dx, dz)
      }

      const { release, hand } = castEventFor(clip.name, clip.duration)
      const cast: PendingCast = {
        wait: release,
        obj: found.obj,
        hand,
        spell: ability,
        target,
        reaction: reactionFor(outcome, victimRow),
        victims: areaVictims(outcome),
        victimId: victimRow?.id ?? null,
        cells: shape?.cells,
        centre: shape?.centre,
        casterTokenId: shape?.casterTokenId,
      }
      pending.push(cast)
      // Pull this type's sheets during the windup, so the first cast of a
      // spell looks like every later one rather than arriving half-loaded.
      const warm = kitVfxTypeFor(ability)
      if (warm) prewarmKit(warm)

      // SOUND. The school gives the spell its voice; the damage type decides
      // what the target hears when it lands. Both come off the spellbook, so
      // a new spell is one row of data rather than a code change.
      // Every one of these carries a detune. The same six clips play all
      // evening, and a sample repeated at exactly the same pitch is the thing
      // the ear picks out as "a game noise" rather than as a fight.
      if (kind === "weapon") {
        // The swing itself. Whether it CONNECTS is the server's word, and the
        // hit or the miss lands when that answer comes back.
        playSfx(weaponSounds(ability).release, { volume: 0.9, rate: variedRate() })
        return
      }
      const sEntry = spellEntry(ability)
      // THE SPELL'S OWN VOICE, WHERE IT HAS ONE.
      //
      // The school chain answers every spell in the book and always has —
      // "arcane, released" is a fine sound for most of them. Pack 01 gives
      // nine cues to particular spells, so a Misty Step sounds like a
      // teleport rather than like a generic discharge.
      //
      // It replaces the RELEASE only. The windup still ramps by school while
      // you are choosing a target, and the tail still decays by school, so a
      // packed spell still belongs to its family — only the moment it leaves
      // the hand is its own.
      //
      // No rate variation on a pack cue, deliberately. The school sounds are
      // detuned a few percent per cast so a repeated cantrip does not read as
      // one file playing twice; these are longer and more characterful, and
      // pitching a recorded teleport around is audible as a wobble.
      const pack = packSoundFor(ability)
      if (pack) {
        playSfx(packKey(pack), { volume: pack.volume })
      } else {
        playSfx(releaseFor(sEntry.school), { volume: 0.85, rate: variedRate(0.04) })
      }
      window.setTimeout(() => playSfx(tailFor(sEntry.school), { volume: 0.5, rate: variedRate(0.04) }), 260)
      if (sEntry.damage && target) {
        // The bang belongs on the flash, not ahead of it — and the flash is
        // no longer a mote at a fixed 26 units/sec. Each effect has its own
        // charge and flight time, so the sound is handed to the effect and
        // played on the frame it actually lands, alongside the target's
        // flinch. Estimating the delay here is what let bang and flash drift.
        //
        // Magic gets a NARROWER spread than steel. A mistuned sword still
        // sounds like a sword; a mistuned chord sounds wrong, and these clips
        // are tonal.
        const dmg = sEntry.damage
        cast.onLand = () => playSfx(impactFor(dmg), { volume: 0.9, rate: variedRate(0.04) })
      }
    }
    castRef.current = performCast
    swingRef.current = (s) => {
      // The sandbox and the live board share a relay channel. A goblin
      // swinging on the practice board must not make a live miniature duck.
      if (s.sandbox !== sandbox) return
      const caster = tokensRef.current.get(s.caster_token)
      if (!caster) return
      const victim = tokensRef.current.get(s.target_token)
      // Gild the number that will rise off the target when the HP row lands,
      // the same way a player's crit is parked for glideToken to spend.
      if (s.crit && s.amount > 0) critRef.current.add(s.target_token)
      // And WHAT it was, off the stat block, for the same reason and the same
      // way. A player felled by a hand crossbow should be pinned, not simply
      // knocked over — which is the difference between "piercing" and the
      // "physical" every NPC attack used to collapse into.
      if (s.damageType && s.amount > 0) lastHitWithRef.current.set(s.target_token, s.damageType)
      const answer: CastAnswer = {
        ok: true,
        hurt: s.amount > 0,
        verdict: isAttackOutcome(s.outcome) ? { outcome: s.outcome, margin: s.margin } : null,
        // The NPC's swing was measured against the player's AC. SwingEvent
        // has carried `dc` since it was written; this is the first thing to
        // ask it what that number was for.
        weapon: { hit: s.hit, crit: s.crit, targetAc: s.dc || null },
      }
      const strike = () =>
        performCast(caster.row.id, s.weapon, "weapon", caster, victim?.row ?? null, null, answer)
      if (!s.to) { strike(); return }

      // IT MOVED FIRST. The server wrote the new square before it answered,
      // but on this seat the miniature reaches that square by realtime row
      // and then by glide, on their own schedules. A swing that starts while
      // the body is still crossing the floor is a swing from the wrong
      // square. So wait for the row to say it has arrived AND for the glide
      // to finish — with a deadline, because a seat that never gets the row
      // should still see the blow rather than nothing at all.
      const to = s.to
      const deadline = performance.now() + 2500
      const arrived = () =>
        caster.row.grid_x === to.x && caster.row.grid_y === to.y && !caster.obj.userData.glide
      const wait = () => {
        if (arrived() || performance.now() > deadline) { strike(); return }
        requestAnimationFrame(wait)
      }
      wait()
    }

    /**
     * Hold the cast pose while the player picks a target.
     *
     * The cast clip is played at a crawl and LOOPED rather than fired once:
     * a spell being charged is a held gesture, and running the clip at full
     * speed then freezing looks like a dropped frame. 0.28x reads as effort.
     *
     * If a model has no cast clip at all this does nothing and says nothing —
     * a martial holding a dagger has no arcane pose to strike, and inventing
     * one would look worse than stillness.
     */
    const startCharge = (tokenId: string) => {
      const e = tokensRef.current.get(tokenId)
      if (!e?.anim) return
      const name = castClipFor("heavy", e.anim.names) ?? clipFor("cast", e.anim.names)
      if (!name) return
      const clip = e.anim.clips.find((c) => c.name === name)
      if (!clip) return
      const action = e.anim.mixer.clipAction(clip)
      e.anim.current?.fadeOut(0.15)
      action.reset()
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.timeScale = 0.28
      action.fadeIn(0.2).play()
      e.anim.current = action
      e.anim.state = "cast"
      e.obj.userData.charging = true
    }

    const stopCharge = () => {
      tokensRef.current.forEach((e) => {
        if (!e.obj.userData.charging || !e.anim) return
        e.obj.userData.charging = false
        if (e.anim.current) e.anim.current.timeScale = 1
        // Force the way back. Setting state to "idle" by hand would make
        // playState believe it had already arrived and return without
        // touching the mixer, leaving the figure looping its cast pose
        // forever — which is a worse bug than the one being fixed.
        playState(e.anim, "idle", true)
      })
    }

    chargeRef.current = { start: startCharge, stop: stopCharge }

    /** The second half of the two-phase cast: the click that throws it. */
    const releaseAt = (tokenId: string) => {
      const armed = armedRef.current
      if (!armed) return
      // The token was resolved when the spell was ARMED. Looking it up again
      // here by character_id is what let the wrong miniature answer: two
      // lookups of the same question can disagree, and this one is asked
      // after the board may have changed underneath it.
      const shooter = tokensRef.current.get(armed.tokenId)
      const victim = tokensRef.current.get(tokenId)
      if (!shooter || !victim) return
      // A refusal always says why. A button that was pressed and produced
      // silence is indistinguishable from a broken one — and this asks the
      // same question the rings asked, through the same function, so a grey
      // ring and a refused click can never disagree.
      const status = targetStatus(shooter, victim, armed.entry.rangeFt, Boolean(armed.entry.helpful))
      if (!status.ok) {
        say(
          status.reason === "sight"
            ? `${victim.row.label} is behind cover — ${armed.name} needs a clear line.`
            : status.reason === "self"
              ? `${armed.name} is not for turning on yourself.`
              : status.reason === "downed"
                ? `${victim.row.label} is already down.`
                : `${armed.name} reaches ${armed.entry.rangeFt} ft — ${victim.row.label} is ${status.squares * 5} ft away.`,
        )
        return
      }
      // THE THROW, as one closure over the three things it needs. `armed`,
      // `shooter` and `victim` are the locals resolved above — values, not
      // refs — so a confirm dialog can hold this for as long as it likes and
      // still throw the spell that was armed AT the creature that was
      // clicked, whatever armedRef says by then.
      const commit = (crossSide: boolean) => {
        // The click that locks a target on. Sam asked for it to feel like an
        // iPhone keypad — instant, dry, and unmistakably a CHOICE having been
        // made, which is exactly the beat that used to pass in silence while
        // the server was consulted.
        uiTick("firm")
        windupRef.current?.stop(0.08)
        windupRef.current = null
        stopCharge()
        clearTargets()
        affectedRef.current.clear()
        setSelected(victim.row)
        setArmedSpell(null)

        // ASK FIRST. ANIMATE SECOND.
        //
        // This used to animate immediately and tell the server afterwards, on
        // the reasoning that the dice are rolled where they cannot be argued
        // with. The dice were — but the PICTURE was a lie whenever the server
        // said no.
        //
        // Reported as "Samson was able to continue casting cantrips despite
        // only having a bonus action... I could spam this." He could not: the
        // handler refused every one of them, and the log proves it — two casts
        // resolved in six hours while the board played a spell animation on
        // every click. The refusal was a small toast against a full cast
        // effect, so the eye believed the effect.
        //
        // Now nothing moves until the server has answered. A refused cast is
        // silent and still, which is what a thing that did not happen should
        // look like.
        void (async () => {
          const res = await castVerbRef.current(shooter.row.id, victim.row.id, armed.name, crossSide)
          if (!res?.ok) return   // castVerb has already said why
          // The whole answer travels with the animation: a target who saved
          // does not double over, a near miss is turned aside, a wide one is
          // stepped out of, and a swing makes its noise when the arm arrives.
          performCast(
            shooter.row.character_id as string, armed.name, armed.kind,
            shooter, victim.row, null, res,
          )
        })()
      }
      // CROSSING SIDES IS A DECISION, NOT AN ACCIDENT — and not a refusal.
      // A heal on a hostile, a harm on your own: the board asks, and CANCEL
      // leaves the spell armed and the turn untouched.
      if (status.confirm) {
        setPendingCross({
          kind: status.confirm,
          spell: armed.name,
          target: victim.row.label,
          // The button says what the button DOES. It read CAST for everything,
          // so confirming a punch asked you to confirm a spell — reported as
          // "asking me to confirm cast when it is not a cast". A weapon
          // strikes; only a spell is cast.
          verb: armed.kind === "weapon" ? "STRIKE" : "CAST",
          commit: () => commit(true),
        })
        return
      }
      commit(false)
    }
    releaseAtRef.current = releaseAt

    /**
     * The other throw: a SQUARE, not a creature.
     *
     * Mage Hand does not want a body and Fireball does not want one either —
     * it wants a spot with four drow standing round it. This is the whole
     * reason nine spells in the book were uncastable: the board had exactly
     * one release path and it demanded a token.
     */
    const releaseAtPoint = (gx: number, gy: number) => {
      const armed = armedRef.current
      if (!armed || armed.mode !== "point") return
      const shooter = tokensRef.current.get(armed.tokenId)
      if (!shooter) return
      const m = mapRef.current
      if (!m || gx < 0 || gy < 0 || gx >= m.grid_width || gy >= m.grid_height) return

      const area = armed.entry.area
      const origin = { x: shooter.row.grid_x ?? 0, y: shooter.row.grid_y ?? 0 }
      const aim = { x: gx, y: gy }

      // Range, refused out loud. A click that produces silence is
      // indistinguishable from a broken button — the same rule releaseAt
      // follows, asked through the same function the server uses.
      const inRange = area
        ? aimInRange(area, armed.entry.rangeFt, origin, aim)
        : armed.entry.rangeFt <= 0 ||
          Math.max(Math.abs(origin.x - gx), Math.abs(origin.y - gy)) * FEET_PER_SQUARE <= armed.entry.rangeFt
      if (!inRange) {
        say(`${armed.name} reaches ${armed.entry.rangeFt} ft — that square is further than that.`)
        return
      }

      // FRIENDLY FIRE IS A DECISION, NOT AN ACCIDENT.
      //
      // An area covers ground, and the party is standing on ground. 5E does
      // not spare them and neither does this — but it does not let a misjudged
      // radius quietly cost the cleric half her hit points either. Naming who
      // is in the blast, before it goes off, is the difference between a
      // choice the player made and a thing that happened to them.
      // The shape, computed ONCE. It answers two questions that must not be
      // allowed to disagree: who is standing in the blast, and which squares
      // the mark covers afterwards. Clipped to the map here, the same way the
      // template clips, so the mark and the outline cover identical ground.
      const shapeCells = (area ? areaCells(area, origin, aim) : [{ x: gx, y: gy }])
        .filter((c) => c.x >= 0 && c.y >= 0 && c.x < m.grid_width && c.y < m.grid_height)

      let caught: string[] = []
      let mine = false
      if (area && !area.sparesAllies) {
        const covered = new Set(shapeCells.map((c) => `${c.x},${c.y}`))
        const own = Array.from(tokensRef.current.values()).filter(
          (t) =>
            t.row.is_visible &&
            covered.has(`${t.row.grid_x},${t.row.grid_y}`) &&
            (t.row.id === shooter.row.id || friendly(t.row)),
        )
        caught = own.map((t) => t.row.label)
        mine = own.some((t) => t.row.id === shooter.row.id)
      }

      // THE THROW, as one closure over the things it needs. `armed`,
      // `shooter`, `gx` and `gy` are the locals resolved above — values, not
      // refs — so the dialog can hold this open for as long as it likes and
      // still throw the spell that was armed AT the square that was clicked,
      // whatever armedRef says by then.
      const commit = () => {
        uiTick("firm")
        windupRef.current?.stop(0.08)
        windupRef.current = null
        stopCharge()
        clearTargets()
        templateRef.current.clear()
        affectedRef.current.clear()

        const p = sqCentre(gx, gy)
        setArmedSpell(null)
        // ASK FIRST, ANIMATE SECOND — the same order the creature cast has
        // kept since #333, and for the same reason: a refused Fireball must
        // not go off on screen. It also means the answer is in hand before
        // the effect flies, so everyone the server found standing in the
        // shape can react on the frame it lands rather than not at all.
        void (async () => {
          const res = await castPointVerbRef.current(shooter.row.id, gx, gy, armed.name)
          if (!res?.ok) return   // the verb has already said why
          performCast(
            shooter.row.character_id as string, armed.name, armed.kind,
            shooter, null, { x: p.x, z: p.z }, res,
            {
              cells: shapeCells,
              // A cone or a Thunderwave opens FROM the caster, so its bloom
              // radiates from the caster's square. Averaging the cells would
              // start the wave out in the middle of the spray.
              centre: area?.origin === "self" ? origin : aim,
              casterTokenId: shooter.row.id,
            },
          )
        })()
      }

      // THE FLOOR ASKS FIRST — EVERY TIME.
      //
      // This used to ask only when the blast caught your own side, through a
      // native window.confirm. An empty square went off on the click. But an
      // empty square is exactly where a player clicks to WALK, and with a
      // point spell armed that click was the throw: Kenta lost his action to
      // Minor Illusion on the floor he was trying to reach. A creature spell
      // already asks before it crosses sides; the floor is the one target you
      // can hit by accident, so it asks before it does anything. The names of
      // anyone caught travel with the same question rather than a second one.
      setPendingPoint({
        spell: armed.name,
        feet: Math.max(Math.abs(origin.x - gx), Math.abs(origin.y - gy)) * FEET_PER_SQUARE,
        caught,
        mine,
        commit,
      })
    }
    releaseAtPointRef.current = releaseAtPoint

    /**
     * The server has spoken: show it on the body, this frame.
     *
     * Real damage or healing is applied to the token LOCALLY and pushed
     * through glideToken, which is the one path that already knows how to
     * diff hit points and raise a coloured number. When the realtime row
     * arrives a moment later carrying the same value, that same diff sees no
     * change and draws nothing — so the number appears once, immediately,
     * rather than once, late.
     *
     * A zero raises a WORD instead. It is still an outcome.
     */
    applyCastOutcomeRef.current = (tokenId, r) => {
      const t = tokensRef.current.get(tokenId)
      if (!t) return

      if (r.amount > 0) {
        const cur = t.row.hp_current
        const max = t.row.hp_max
        // Untracked hit points stay untracked: a null is "not tracked", never
        // zero, and inventing a number here would start tracking a creature
        // the DM deliberately left alone.
        if (cur == null || max == null) return
        const next = r.heals
          ? Math.min(max, cur + r.amount)
          : Math.max(0, cur - r.amount)
        if (next !== cur) glideToken({ ...t.row, hp_current: next })
        return
      }

      // Nothing moved. Say which kind of nothing.
      vfx.push(
        outcomeWordVfx({
          parent: scene,
          position: new THREE.Vector3(t.obj.position.x, 0, t.obj.position.z),
          // The verdict's own word when the caller has one. Reconstructing
          // it from `hit` was wrong for exactly the case the word exists
          // for: the single-target save path reports hit = amount > 0, so a
          // clean save arrived here as hit:false and was painted MISS.
          outcome: r.word ?? (r.hit ? "saved" : "miss"),
          scale: radiusFor(t.row.token_size) / 0.75,
        }),
      )
    }

    /**
     * The one implementation behind all three ways of asking to move.
     *
     * `characterId` is passed when the ask came from a character PLATE, so a
     * click on someone else's card cannot open the active character's reach
     * by accident. Omitted (board click, M key) means "whoever is up".
     */
    toggleReachRef.current = (characterId) => {
      const c = combatRef.current
      const entry = c?.turn_order?.[c.active_index]
      if (!c || !entry) return "no-combat"
      const tok = tokensRef.current.get(entry.token_id)
      if (!tok?.row.character_id) return "no-combat"
      // Asked for a specific character who is not the one up: not a refusal
      // the player needs shouting about, just not their turn.
      if (characterId && tok.row.character_id !== characterId) return "not-your-turn"
      if (tok.row.character_id !== myCharRef.current && !dmRef.current) return "no-claim"
      reachOpenRef.current = reachOpenRef.current === tok.row.id ? null : tok.row.id
      refreshReachRef.current()
      return "ok"
    }

    /**
     * M for move.
     *
     * Ignored while a text field has focus, so typing "m" into the DM's
     * console does not light up the floor behind it.
     */
    const onMoveKey = (ev: KeyboardEvent) => {
      if (ev.key !== "m" && ev.key !== "M") return
      const t = ev.target as HTMLElement | null
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (armedRef.current) return   // a spell is being aimed; M is not the question
      const why = toggleReachRef.current()
      if (why === "no-claim") {
        say("This browser is not driving that character — claim them, or unlock as DM.")
      } else if (why === "no-combat") {
        say("Nobody is up yet.")
      }
    }
    window.addEventListener("keydown", onMoveKey)

    const spawnToken = (row: TokenRow) => {
      const existing = tokensRef.current.get(row.id)
      if (existing) tokenGroup.remove(existing.obj)
      if (!row.is_visible) { tokensRef.current.delete(row.id); return }

      const g = buildBase(row)
      g.userData.tokenId = row.id
      const r = radiusFor(row.token_size)

      const buildPawn = () => {
        const isParty = Boolean(row.character_id)
        const body = new THREE.Mesh(
          new THREE.CylinderGeometry(r * 0.85, r * 0.95, 0.5, 28),
          new THREE.MeshStandardMaterial({
            color: row.tint_color ? new THREE.Color(row.tint_color) : isParty ? 0x1c4a66 : 0x5c1d1d,
            roughness: 0.7,
            metalness: 0.15,
          }),
        )
        body.position.y = 0.31
        body.castShadow = true
        g.add(body)
      }

      // A SPECTRAL SPRITE, NOT A MODEL. A model_url that ends in .png or
      // .webp is a cutout - the Mage Hand - drawn as a billboard that always
      // faces the camera, semi-transparent, floating above its square and
      // bobbing in the animation loop (userData.float). It has no bones and
      // no clips, so nothing below that asks for a rig ever sees it.
      const spriteUrl = row.model_url && /\.(png|webp)(\?|$)/i.test(row.model_url) ? row.model_url : null
      if (spriteUrl) {
        const mat = new THREE.SpriteMaterial({ map: tex(spriteUrl), transparent: true, opacity: 0.78, depthWrite: false })
        const sp = new THREE.Sprite(mat)
        const w = r * 2.4
        sp.scale.set(w, w * 0.664, 1)
        sp.position.y = 0.62
        g.add(sp)
        g.userData.float = { phase: Math.random() * Math.PI * 2 }
      } else if (row.model_url) {
        // The creature's own model. Measured after load, scaled to size,
        // feet on the floor — Meshy exports arrive in arbitrary units.
        gltfLoader.load(row.model_url, (gltf) => {
          if (disposed) return
          const obj = gltf.scene
          obj.updateWorldMatrix(true, true)

          // MEASURING A SKINNED MODEL BY ITS MESH IS A TRAP, and it is the
          // trap that made every player model invisible. Meshopt stores
          // vertices quantised to ±32767; for a rigid mesh the dequantise
          // scale sits on the node, so Box3.setFromObject reads true size —
          // but for a SKINNED mesh the skeleton drives the vertices and the
          // node matrix is bypassed, so the box reads ~65,534 units. My old
          // guard called that "reasonable" and scaled by 1/65,534: the model
          // rendered at a ten-thousandth of intended size. Rings and name
          // sprites (plain meshes) drew fine, which is exactly the screenshot
          // Sam sent — labelled rings with nobody standing in them.
          //
          // BONES live in real, dequantised space. For skinned models the
          // skeleton's world-position spread IS the honest height.
          const bones: THREE.Bone[] = []
          obj.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone) })
          const v = new THREE.Vector3()
          let size = new THREE.Vector3()
          if (bones.length) {
            const bb = new THREE.Box3()
            for (const b of bones) bb.expandByPoint(b.getWorldPosition(v))
            bb.getSize(size)
            // Bones stop at the last joint — skull and soles sit a little
            // beyond them. A body is ~12% taller than its skeleton spread.
            size.multiplyScalar(1.12)
          } else {
            size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3())
          }
          const feet = r >= 1.2 ? 15 : r >= 0.8 ? 10 : 6
          const want = (feet / 5) * (row.model_scale ?? 1)
          const usable = Number.isFinite(size.y) && size.y > 1e-4 && size.y < 1e4
          const s = usable ? want / size.y : want
          if (!usable) {
            console.warn(`[board] ${row.label}: measured ${size.y} (${bones.length} bones) — fallback scale`, row.model_url)
          }
          obj.scale.setScalar(s)
          obj.updateWorldMatrix(true, true)
          let box2: THREE.Box3
          if (bones.length) {
            box2 = new THREE.Box3()
            for (const b of bones) box2.expandByPoint(b.getWorldPosition(v))
          } else {
            box2 = new THREE.Box3().setFromObject(obj)
          }
          obj.position.set(-(box2.min.x + box2.max.x) / 2, -box2.min.y + (row.model_y_offset ?? 0), -(box2.min.z + box2.max.z) / 2)
          if (row.rotation_y) obj.rotation.y = (row.rotation_y * Math.PI) / 180
          // Pre-lit tile leaves models unlit black columns; they carry
          // their own glow, same trick as the local viewer.
          // HIDDEN READS AS TRANSLUCENT, NOT ABSENT.
          //
          // The tempting move is to stop drawing her. It is wrong twice: her
          // own player could not then move her, and this is a shared board
          // where the DM needs to see the piece he is adjudicating. A
          // half-there body says "the drow cannot see this" while the table
          // still can, which is what a miniature pushed slightly off the
          // felt has always meant.
          //
          // Applied per-mesh below rather than as a group opacity, because
          // Three.js has no group opacity — a fact that costs an hour to
          // rediscover every time.
          const ghost = row.is_hidden === true
          obj.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh && mesh.material) {
              mesh.castShadow = mesh.receiveShadow = !ghost
              const m = mesh.material as THREE.MeshStandardMaterial
              if (m.map) {
                // COLOUR SPACE FIRST. A base-colour texture read as linear
                // renders washed and muddy — this is the single biggest
                // cause of "the colours are off" on imported models, and it
                // costs nothing to assert rather than assume the loader
                // guessed right.
                m.map.colorSpace = THREE.SRGBColorSpace
                if (ghost) {
                  // Cast the material first: it is shared across every token
                  // that uses this GLB, so tinting it in place turns every
                  // drow in the room translucent. Same lesson death-vfx
                  // learned about cloned materials.
                  const solo = m.clone()
                  solo.transparent = true
                  solo.opacity = 0.28
                  solo.depthWrite = false
                  mesh.material = solo
                }

                // The emissive copy of the base texture is GONE. It was a
                // crutch from when the board had no real lights, and it does
                // real damage: adding a grey-scaled copy of the albedo over
                // itself flattens saturation and lifts blacks, which is
                // exactly the washed-out look Sam is seeing. Torches, door
                // lamps and the fill now light these models properly, so the
                // crutch is worse than nothing.
                m.emissive = new THREE.Color(0x000000)
                m.emissiveMap = null
                m.emissiveIntensity = 0
              }
              // Meshy sometimes ships metalness 1 with no environment map,
              // which under ACES renders as a mirror of nothing. Clamp it —
              // but not so hard that leather and steel stop reading
              // differently: 0.35 keeps some sheen, and the roughness floor
              // is 0.35 rather than 0.45 so highlights survive.
              if (typeof m.metalness === "number") m.metalness = Math.min(m.metalness, 0.35)
              if (typeof m.roughness === "number") m.roughness = Math.max(m.roughness, 0.35)
              // Sharp at grazing angles: the D2 camera looks across the
              // board, not down at it, and without anisotropic filtering
              // every texture mips into soup a few squares out.
              for (const t of [m.map, m.normalMap, m.roughnessMap, m.metalnessMap]) {
                if (t) t.anisotropy = maxAniso
              }
              m.envMap = envTex
              m.envMapIntensity = 0.55
              // Meshy flags some materials BLEND at full opacity; three
              // then draws them in the transparent pass where rings and
              // glow planes show through the body — the ghost figure.
              // A surface with no actual alpha is opaque. Say so.
              if (m.transparent && (m.opacity ?? 1) >= 0.98 && !m.alphaMap && !(m.alphaTest > 0)) {
                m.transparent = false
                m.depthWrite = true
              }
              // Tone mapping desaturates; a touch of extra saturation in the
              // material colour puts the artist's palette back.
              if (m.color) m.color.offsetHSL(0, 0.08, 0.02)
              m.needsUpdate = true
            }
          })
          g.add(obj)

          // WHAT THEY ARE HOLDING.
          //
          // The weapon is parented to the RightHand BONE, not to the token
          // group — which is why it swings with the arm through every clip
          // without this file knowing anything about animation. Every model
          // in this cast came through the same Meshy humanoid rig, so the
          // bone name is identical on all of them and this needs no per
          // character special-casing.
          //
          // The weapon comes from the same sheet_attacks the ability rack
          // reads, so the miniature agrees with the buttons: if Samson's rack
          // offers a Mace, Samson is holding a mace.
          const primary = (row.character_id && sheetAttacksRef.current[row.character_id]?.[0]) || null
          if (primary?.name) {
            const held = equipOnRig(obj, {
              name: primary.name,
              itemType: "weapon",
              rarity: primary.rarity ?? "common",
              slot: "main_hand",
            })
            if (held) console.log(`[equip] ${row.label} holds ${primary.name}`)
          }
          // The other hand, from the same inventory pass. A model that loads
          // before the sheets do is handed its shield by the equip pass in
          // the sheets loader instead, so whichever wins the race the arm
          // ends up carrying it.
          const shield = row.character_id ? shieldRef.current.get(row.character_id) : null
          if (shield) {
            equipOnRig(obj, { name: shield.name, itemType: shield.itemType, rarity: shield.rarity, slot: "off_hand" })
          }

          // ANIMATION. Meshy ships these with a dozen-plus clips whose names
          // come from whatever source animation was used, so the state is
          // resolved by lib/token-animation rather than by exact name.
          if (gltf.animations?.length) {
            const mixer = new THREE.AnimationMixer(obj)
            const anim: TokenAnim = {
              mixer,
              clips: gltf.animations,
              names: gltf.animations.map((c) => c.name),
              current: null,
              state: "idle",
            }
            const entry = tokensRef.current.get(row.id)
            if (entry) entry.anim = anim
            // A token at 0 HP comes up already down. An HP change rebuilds the
            // token (see glideToken), so this is also the path a creature
            // takes the moment it drops.
            const laid = playState(anim, isDowned(row) ? "dead" : "idle", true)
            // ...UNLESS THE MODEL HAS NO "dead" CLIP.
            //
            // playState returns null when the state has no clip, and does
            // nothing — so a creature whose GLB never got a death animation
            // stood upright at 0 hit points, on its feet, rolling death saves.
            // Reported against Kenta, who was both standing AND being offered
            // as a target.
            //
            // deathSceneVfx already knows how to lay an unposed body down, so
            // this settles one to its FINAL frame rather than writing a second
            // opinion about what a corpse looks like: update() once with the
            // whole lifetime, which paints the end pose and leaves it. Its
            // particles are at zero opacity by then — right, because this body
            // did not die just now. It was already dead when we arrived, and a
            // corpse must not re-explode every time the board reloads.
            if (isDowned(row) && !laid) {
              deathSceneVfx({
                parent: scene,
                position: new THREE.Vector3(entry?.obj.position.x ?? 0, 0.05, entry?.obj.position.z ?? 0),
                // "collapse" for everyone here, deliberately. What killed it is
                // not knowable at mount — lastHitWith is empty on a fresh board
                // — and inventing a cause to make a nicer corpse would be the
                // board asserting something it does not know.
                kind: "collapse",
                scale: radiusFor(row.token_size) / 0.75,
                posed: false,
                resolve: () => tokensRef.current.get(row.id)?.obj ?? null,
              }).update(999)
            }
            console.log(
            `[board] ${row.label}: ${gltf.animations.length} clips, ` +
            `height ${(size.y * s).toFixed(2)}u (${(size.y * s * 5).toFixed(1)} ft) —`,
            anim.names.join(", "),
          )
          }
        }, undefined, (err) => {
          // A model that fails to load says so OUT LOUD and falls back to the
          // pawn. The silent version of this failure cost three debugging
          // rounds; it does not get to be silent again.
          console.error(`[board] ${row.label}: model failed to load — pawn fallback`, row.model_url, err)
          if (!disposed) buildPawn()
        })
      } else {
        // No model wired: the honest disc pawn.
        buildPawn()
      }

      // D2's light is WARM. Each party token carries a torch whose light
      // moves with them, so walls and bars catch fire-colour as they pass.
      //
      // THE TORCH IS HELD ABOVE THE HEAD, and that is a bug fix, not
      // flavour. It used to sit at y=1.1 — chest height, which is INSIDE a
      // model 1.2 units tall. A point light with inverse-square falloff,
      // two tenths of a unit from the surfaces around it, multiplies to
      // roughly 170x: every model rendered as a featureless white blob.
      // Sam's report was exactly "just a bright light".
      //
      // Above the head it lights the floor, the bars and the faces of
      // whoever stands nearby — which is what it was always meant to do —
      // and the bearer is lit rather than incinerated.
      if (row.character_id) {
        const carry = new THREE.PointLight(0xff9a3c, 7, 7.5, 1.5)
        carry.position.y = 2.45
        // Real shadows off the bars and door frames as the bearer walks -
        // the D2:R trick that makes light feel physical. 512 keeps four of
        // these affordable.
        carry.castShadow = true
        carry.shadow.mapSize.set(512, 512)
        g.add(carry)
        // A soft fill from the front so faces are not pure silhouette. Weak
        // and far enough out that it cannot blow the mesh the way the torch did.
        const fill = new THREE.PointLight(0xffd2a0, 2.6, 5, 1.4)
        fill.position.set(0.9, 1.5, 0.9)
        g.add(fill)
        // A cool back-rim opposite the torch. Two-source lighting is what
        // separates a figure from the floor it stands on; one warm source
        // alone leaves the far side of every model in flat shadow.
        const rim = new THREE.PointLight(0x9db4d8, 1.6, 4.5, 1.5)
        rim.position.set(-0.8, 1.7, -0.8)
        g.add(rim)

        const glowCanvas = document.createElement("canvas")
        glowCanvas.width = glowCanvas.height = 128
        const gc = glowCanvas.getContext("2d")!
        const gg = gc.createRadialGradient(64, 64, 4, 64, 64, 62)
        gg.addColorStop(0, "rgba(255,166,74,0.30)")
        gg.addColorStop(0.5, "rgba(255,120,40,0.12)")
        gg.addColorStop(1, "rgba(255,100,30,0)")
        gc.fillStyle = gg
        gc.fillRect(0, 0, 128, 128)
        const glowTex = new THREE.CanvasTexture(glowCanvas)
        const glow = new THREE.Mesh(
          new THREE.PlaneGeometry(2.4, 2.4),
          new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        )
        glow.rotation.x = -Math.PI / 2
        glow.position.y = 0.1
        glow.renderOrder = 6 // above the darkness plane
        g.add(glow)
      }

      // No floating name sprites: the board reads like a game, not a debug
      // view. Identity lives in the cards and the initiative rail; the
      // selected token's name shows in the bottom bar.
      const c = sqCentre(row.grid_x, row.grid_y)
      g.position.set(c.x, 0, c.z)
      tokenGroup.add(g)
      tokensRef.current.set(row.id, { row, obj: g })
      redrawDarkness()
    }

    const glideToken = (row: TokenRow) => {
      const entry = tokensRef.current.get(row.id)
      if (!entry) { spawnToken(row); return }
      // HP or identity changed → rebuild; position change → glide.
      const before = entry.row
      entry.row = row

      // THE NUMBER OVER THE HEAD.
      //
      // Hung off the HIT-POINT DIFF rather than off the cast, deliberately.
      // That way it covers everything that can hurt a creature — a player's
      // spell, an NPC's attack resolved on the DM's browser, a trap, and
      // Malachar reaching into the table mid-fight — instead of only the one
      // path this client happened to animate. Every browser watching the same
      // realtime row shows the same number, which is the whole point: the
      // table should not have to ask "how much was that?"
      //
      // A null hp_current means "not tracked", which is not zero. A token
      // going from untracked to 40/40 has not been healed for 40; it has just
      // been brought into the fight, and announcing that as a heal would be a
      // lie told in bright green.
      const hpWas = before.hp_current
      const hpNow = row.hp_current
      if (hpWas != null && hpNow != null && hpWas !== hpNow) {
        const delta = hpNow - hpWas
        const healed = delta > 0
        // Read the crit flag and spend it in the same breath, so a stale
        // answer can never gild a later, ordinary blow.
        const wasCrit = critRef.current.delete(row.id)
        vfx.push(damageNumberVfx({
          parent: scene,
          position: new THREE.Vector3(entry.obj.position.x, 0, entry.obj.position.z),
          amount: delta,
          // What last landed on this body decides the colour; a weapon leaves
          // no damage type at all, and bone-white is the honest answer for it.
          type: lastHitBy.get(row.id) ?? "physical",
          heals: healed,
          crit: wasCrit && !healed,
          scale: radiusFor(row.token_size) / 0.75,
        }))
      }

      // THE KILLING BLOW.
      //
      // SRD 5.1, Combat: "Most GMs have a monster die the instant it drops to
      // 0 hit points, rather than having it fall unconscious and make death
      // saving throws." So a monster crossing to 0 is a death, and it should
      // look like whatever killed it — burn, dissolve, shatter.
      //
      // Player characters get a DIFFERENT one: they fall unconscious and roll
      // death saves, which must not be dressed up as a funeral. They collapse,
      // keep their colour, and go on breathing.
      //
      // The body stays. spawnToken below rebuilds it into its death pose
      // (HOLD_LAST), so the square remains occupied and the battlefield still
      // reads — and the body treatment re-attaches itself to the rebuilt mesh
      // rather than being lost with the old one.
      const wasUp = (before.hp_current ?? 1) > 0
      if (wasUp && isDowned(row)) {
        const scale = radiusFor(row.token_size) / 0.75
        const at = new THREE.Vector3(entry.obj.position.x, 0.05, entry.obj.position.z)

        // A PLAYER always collapses, whatever hit them. They are unconscious
        // and rolling death saves, and the whole point of the collapse
        // treatment is that it keeps their colour: a downed friend must not
        // be dressed as a corpse. A MONSTER dies the way it was killed.
        const kind: DeathKind = row.character_id
          ? "collapse"
          : deathKindFor(lastHitWith.get(row.id) ?? null, normaliseConditions(row))

        // The BODY. Asks tokensRef for the mesh every frame rather than
        // holding this one, because spawnToken three lines below is about to
        // throw it away and reload the GLB.
        //
        // `posed` is the deference. A creature whose GLB carries its own
        // "dead" clip already falls the way an animator drew it, and the board
        // freezes that on its last frame (HOLD_LAST). Laying it down AGAIN
        // with a rotation is a body that falls twice. So for those, only the
        // colour, the dissolve and the particles run — which is the half the
        // clip cannot do, and the half that says what killed it.
        const posed = Boolean(entry.anim?.names.includes("dead"))
        vfx.push(deathSceneVfx({
          parent: scene,
          position: at,
          kind,
          scale,
          posed,
          resolve: () => tokensRef.current.get(row.id)?.obj ?? null,
        }))

        // The AIR. The older sheet-based effect still plays over the top for
        // monsters, because a sprite of the thing that killed it is a better
        // impact than any number of particles - but it is no longer the whole
        // death, and it no longer decides whether there IS one.
        if (!row.character_id) {
          const type = lastHitBy.get(row.id)
          if (type) {
            vfx.push(deathVfx({ parent: scene, position: at, type, camera, scale }))
          }
        }
        lastHitBy.delete(row.id)
        lastHitWith.delete(row.id)
      }
      if (before.hp_current !== row.hp_current || before.hp_max !== row.hp_max || before.is_visible !== row.is_visible || before.is_hidden !== row.is_hidden || before.tint_color !== row.tint_color) {
        spawnToken(row)
        return
      }
      const c = sqCentre(row.grid_x, row.grid_y)
      // Walk the broadcast route when one arrived for this move; otherwise a
      // straight line. Either way the model WALKS it at ground level, at a
      // constant pace — distance decides duration, not a fixed timer.
      const stash = walkPaths.get(row.id)
      walkPaths.delete(row.id)
      // Read before the stash is discarded below; the footstep loop is started
      // further down, after the glide is built.
      const walkedFast = Boolean(stash?.dash)
      let pts: THREE.Vector3[] = []
      if (stash && Date.now() - stash.at < 4000) {
        pts = stash.cells.map(([x, y]) => {
          const p = sqCentre(x, y)
          return new THREE.Vector3(p.x, 0, p.z)
        })
        // Trust the route only if it truly ends where the row says.
        const last = pts[pts.length - 1]
        if (!last || Math.abs(last.x - c.x) > 0.01 || Math.abs(last.z - c.z) > 0.01) pts = []
      }
      if (pts.length < 2) {
        pts = [entry.obj.position.clone().setY(0), new THREE.Vector3(c.x, 0, c.z)]
      } else {
        pts[0] = entry.obj.position.clone().setY(0) // start where the model stands
      }
      const seg: number[] = [0]
      for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + pts[i - 1].distanceTo(pts[i]))
      entry.obj.userData.glide = { pts, seg, total: seg[seg.length - 1], s: 0 }
      // A second move order landing mid-walk replaces the first: stop before
      // starting, or the old loop is orphaned and plays until the page closes.
      stopFootsteps(row.id)
      try {
        const creeping = sneaking.has(row.id)
        footsteps.set(row.id, playSfx(
          surfaceLoop(row.grid_x, row.grid_y, walkedFast, creeping),
          // Quieter still when sneaking. The clip is already the softest in
          // the pack; this is the difference between "a quiet walk" and
          // "someone trying not to be heard".
          { loop: true, volume: creeping ? 0.26 : 0.4, fadeIn: creeping ? 0.15 : 0.08 },
        ))
      } catch {
        /* a missing clip is not a reason to stop the miniature walking */
      }
      redrawDarkness() // the torch travels with its bearer
    }

    // ---- the DM's move order ----------------------------------------
    moveTokenRef.current = (id, gx, gy) => {
      const entry = tokensRef.current.get(id)
      if (!entry) return
      // No stacking. A square already held by another visible token rejects
      // the move rather than burying one miniature inside another — which is
      // exactly how Kenta ended up invisible on top of Prince Derendil.
      // tokensRef holds only visible tokens (a hidden one is deleted), so
      // membership at (gx,gy) is enough. The database enforces the same rule
      // for every OTHER writer — the NPC AI, a manual edit — so two tokens can
      // never share a cell from any direction, not just the DM's own click.
      let taken = false
      tokensRef.current.forEach((t) => {
        if (t.row.id !== id && t.row.grid_x === gx && t.row.grid_y === gy) taken = true
      })
      if (taken) { say("That square is taken."); return }
      // Optimistic: glide now, persist behind it. Realtime echoes to others.
      glideToken({ ...entry.row, grid_x: gx, grid_y: gy })
      void supabase
        .from("vtt_tokens")
        .update({ grid_x: gx, grid_y: gy, updated_by: "dm-board", updated_at: new Date().toISOString() })
        .eq("id", id)
        .then(({ error }) => {
          if (error) say("The move did not take: " + error.message)
        })
    }

    // ---- movement reach: the BG3 grammar ----------------------------
    // On your turn your reachable squares tint yellow, the cursor drags a
    // path ribbon home with its cost in feet, and one click walks you there.
    // Reach paints ONLY on the browser that owns the active character —
    // everyone else watches the walk arrive by realtime.
    const reachGroup = new THREE.Group()
    scene.add(reachGroup)
    const reachGeo = new THREE.PlaneGeometry(SQ * 0.94, SQ * 0.94)
    // LEGAL TARGETS. While a spell is armed, every creature wears a ring, and
    // the ring says what it is: red for a spell that harms, green for one that
    // helps, violet for a creature on the WRONG side of the spell, amber for a
    // body already down, and a dim grey for a creature the spell cannot reach.
    //
    // Showing the unreachable ones GREY rather than hiding them is the whole
    // point. A creature with no ring is indistinguishable from a creature the
    // board forgot about; a grey ring says "I see it, you can't hit it", and
    // the click still explains why.
    //
    // VIOLET MEANS "A DIALOG IS COMING". A heal on a hostile or a harm on your
    // own is legal — Sam's ruling — but the click asks first, and the ring has
    // to say so before the click does. It outranks amber: a downed enemy you
    // are about to heal is a question before it is a death save.
    const targetGroup = new THREE.Group()
    scene.add(targetGroup)
    const targetRingGeo = new THREE.RingGeometry(0.62, 0.86, 44)

    // ---- WHO THIS WILL ACTUALLY HIT, RIGHT NOW -------------------------
    //
    // The target rings below say who is ELIGIBLE. They cannot say who is
    // about to be caught, because that changes with every pixel the mouse
    // moves — and for an area spell it is a whole group rather than one body.
    //
    // Sam: "we need a high speed targeting system to pick target so when we
    // hover the glow in red indicated they will be effect. Area of effect
    // spells that effect multiple people negatively will show the area
    // negatively targeted."
    //
    // So this is a SECOND, brighter mark that follows the cursor: a thick
    // ring on everyone the release would touch this instant. Red for harm,
    // green for help — the colour answers "what happens to them", not "may I
    // click them", which is what the thinner eligibility ring already says.
    //
    // Rebuilt on pointer move rather than per frame. Eleven tokens is a dozen
    // ring meshes; rebuilding that on mousemove costs nothing and keeps the
    // marks exact rather than interpolated.
    const affectGroup = new THREE.Group()
    scene.add(affectGroup)
    const affectRingGeo = new THREE.RingGeometry(0.90, 1.20, 44)
    const affectHarmMat = new THREE.MeshBasicMaterial({ color: 0xff2f1c, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    const affectHelpMat = new THREE.MeshBasicMaterial({ color: 0x46ff86, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    // ACROSS THE LINE, THE MARK STAYS VIOLET.
    //
    // The eligibility ring under a cross-side target is violet (crossMat,
    // below), and violet has one meaning on this board: "the click will ask
    // you first". Painting the hover mark red over it — because a harm is a
    // harm — let the loudest ring answer the wrong question. Red says "this
    // will hurt them"; what the player needs to know first is "this will
    // stop and ask". So the mark BRIGHTENS the violet rather than replacing
    // it: same hue as crossMat, lifted, at the mark's own opacity.
    const affectCrossMat = new THREE.MeshBasicMaterial({ color: 0xd3b3ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    const clearAffected = () => {
      while (affectGroup.children.length) affectGroup.remove(affectGroup.children[0])
    }
    /**
     * Mark exactly these tokens as about to be hit.
     *
     * `cross` is true when the release would cross sides and a dialog will
     * come first. Only the creature path ever sets it: an area does not
     * choose sides, so nobody in a blast is "across the line".
     */
    const showAffected = (ids: string[], helpful: boolean, cross = false) => {
      clearAffected()
      const mat = cross ? affectCrossMat : helpful ? affectHelpMat : affectHarmMat
      for (const id of ids) {
        const t = tokensRef.current.get(id)
        if (!t) continue
        const ring = new THREE.Mesh(affectRingGeo, mat)
        ring.rotation.x = -Math.PI / 2
        // Above the eligibility ring at 0.09, so the two read as layers
        // rather than fighting for the same pixels.
        ring.position.set(t.obj.position.x, 0.105, t.obj.position.z)
        ring.scale.setScalar(radiusFor(t.row.token_size) / 0.75)
        affectGroup.add(ring)
      }
    }
    affectedRef.current = { show: showAffected, clear: clearAffected }
    const hostileMat = new THREE.MeshBasicMaterial({ color: 0xff5a44, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    const helpfulMat = new THREE.MeshBasicMaterial({ color: 0x53e07a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    /** Down but not gone: still a legal target, and worth finishing or saving. */
    const downedMat = new THREE.MeshBasicMaterial({ color: 0xffab3d, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    /** Out of range, or nothing but wall between you and it. */
    const deniedMat = new THREE.MeshBasicMaterial({ color: 0x6c6f7a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    /** Across the line: a legal target the click will ask about first. */
    const crossMat = new THREE.MeshBasicMaterial({ color: 0xb47dff, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })

    /**
     * Can this square see that one?
     *
     * Walks the cells between the two centres and asks whether each is part of
     * the passable world — floor, or a door standing open. A wall cell, or a
     * closed door, breaks the line. This is grid line-of-sight rather than a
     * mesh raycast on purpose: the board already keeps the grid, the answer is
     * stable as the camera moves, and it agrees with what movement does.
     *
     * The endpoints are exempt — a creature does not block sight to itself,
     * and standing in a doorway is not standing in a wall.
     */
    const hasLineOfSight = (ax: number, ay: number, bx: number, by: number) => {
      const dx = Math.abs(bx - ax)
      const dy = Math.abs(by - ay)
      const sx = ax < bx ? 1 : -1
      const sy = ay < by ? 1 : -1
      let err = dx - dy
      let x = ax
      let y = ay
      let guard = dx + dy + 2 // a line can never be longer than this
      while (guard-- > 0) {
        if (x === bx && y === by) return true
        const e2 = 2 * err
        if (e2 > -dy) { err -= dy; x += sx }
        if (e2 < dx) { err += dx; y += sy }
        if (x === bx && y === by) return true
        const k = x + "," + y
        if (walkableRef.current.has(k)) continue
        // Not floor. A door standing open is still a way through; a closed
        // one is a wall, which is what makes shutting a door mean something.
        const door = doorRecs.find((r) => r.cell === k)
        if (!door || !door.open) return false
      }
      return true
    }

    const clearTargets = () => {
      while (targetGroup.children.length) targetGroup.remove(targetGroup.children[0])
    }

    /**
     * Why a given creature can or cannot be hit by the armed spell.
     * Shared by the rings and by the click, so what you see and what the
     * board allows can never disagree.
     */
    /**
     * Is this token on the caster's side?
     *
     * 'party' and 'ally' are one side; 'hostile' the other. 'neutral' is
     * neither, so it can be attacked but not healed — a bystander is not a
     * friend. A null allegiance is treated as hostile: a wrongly-hostile
     * token merely cannot be healed, while a wrongly-friendly one cannot be
     * attacked, and the second failure is worse at the table.
     */
    const friendly = (row: TokenRow) => row.allegiance === "party" || row.allegiance === "ally"

    /**
     * TARGET LEGALITY — range, sight, AND side.
     *
     * `helpful` used to be a paint colour. showTargets ringed every visible
     * token in range and only chose helpfulMat over hostileMat, so Healing
     * Word offered Samson the whole board, drow included; the click sent that
     * token id and the server healed the enemy. That is the bug Sam hit, and
     * it applied to every spell in the book, not just this one.
     *
     * Now `helpful` is a rule. A heal reaches your own side; a harmful spell
     * reaches the other. The server enforces the same rule independently —
     * the dash band taught us twice that a client-only fence is not a fence.
     *
     * CROSSING THE LINE IS A QUESTION, NOT A REFUSAL. Sam: "Sometimes you
     * want to heal an enemy; that's ok. We just need confirmation." So a side
     * violation comes back `ok` with `confirm` set — 'foe' for a heal aimed
     * at a hostile, 'friend' for a harm aimed at your own — and the click
     * raises a dialog instead of casting. Range and sight stay hard refusals:
     * there is no consenting your way through a wall.
     *
     * The one exception is a harmful spell aimed at YOURSELF. That is the
     * single cross-side act with no tactical reading, so it stays refused,
     * as `self`.
     */
    const targetStatus = (
      me: { row: TokenRow },
      t: { row: TokenRow },
      rangeFt: number,
      helpful?: boolean,
    ): { ok: boolean; reason?: string; confirm?: "foe" | "friend"; squares: number } => {
      const squares = Math.max(
        Math.abs((me.row.grid_x ?? 0) - (t.row.grid_x ?? 0)),
        Math.abs((me.row.grid_y ?? 0) - (t.row.grid_y ?? 0)),
      )
      if (rangeFt > 0 && squares * 5 > rangeFt) {
        return { ok: false, reason: "range", squares }
      }
      if (!hasLineOfSight(me.row.grid_x ?? 0, me.row.grid_y ?? 0, t.row.grid_x ?? 0, t.row.grid_y ?? 0)) {
        return { ok: false, reason: "sight", squares }
      }
      // A BODY ON THE FLOOR IS NOT A TARGET — unless you are trying to help it.
      //
      // Kenta was offered as a legal target for an Unarmed Strike while lying
      // at 0 hit points, rolling death saves. Nothing stopped it: downed was a
      // thing the board DREW (the dead pose, the dimmed plate) and never a
      // thing it CHECKED.
      //
      // Helpful is deliberately still allowed, and this is the whole reason
      // the check is not simply "skip the downed": a Cure Wounds or a Healing
      // Word on an unconscious friend is the most important spell in the game
      // at that moment. Refusing it to keep a rogue from kicking a corpse
      // would be a far worse bug than the one being fixed.
      if (isDowned(t.row) && !helpful) {
        return { ok: false, reason: "downed", squares }
      }
      // Self is always a legal target for a helpful spell and never for a
      // harmful one. 5e lets a cleric Healing Word himself; the old code
      // skipped the caster outright, so Samson could not.
      if (helpful !== undefined) {
        const isSelf = t.row.id === me.row.id
        if (!helpful && isSelf) return { ok: false, reason: "self", squares }
        if (helpful && !(isSelf || friendly(t.row))) return { ok: true, confirm: "foe", squares }
        if (!helpful && friendly(t.row)) return { ok: true, confirm: "friend", squares }
      }
      return { ok: true, squares }
    }

    /**
     * Ring every creature, and colour the ring by what it is.
     *
     * A body at 0 HP keeps its ring. It is still a legal target — SRD has
     * attacks against an unconscious creature at advantage, a hit from within
     * 5 ft is a critical, and damage at 0 HP costs a death save (two on a
     * crit). Hiding it made a dying ally impossible to finish OR to reach
     * with a heal, which is the opposite of what the rules do.
     */
    const showTargets = (casterTokenId: string, rangeFt: number, helpful: boolean) => {
      clearTargets()
      const me = tokensRef.current.get(casterTokenId)
      if (!me) return
      tokensRef.current.forEach((t) => {
        // The caster is NOT skipped any more — a helpful spell may land on
        // yourself, and targetStatus decides that rather than this loop.
        if (!t.row.is_visible) return
        if (t.row.id === casterTokenId && !helpful) return
        const { ok, confirm } = targetStatus(me, t, rangeFt, helpful)
        const down = (t.row.hp_current ?? 1) <= 0
        // Violet before amber: "the click will ask" is what the player needs
        // to know first, and the dialog names the body either way.
        const mat = !ok ? deniedMat : confirm ? crossMat : down ? downedMat : helpful ? helpfulMat : hostileMat
        const ring = new THREE.Mesh(targetRingGeo, mat)
        ring.rotation.x = -Math.PI / 2
        ring.position.set(t.obj.position.x, 0.09, t.obj.position.z)
        ring.scale.setScalar(radiusFor(t.row.token_size) / 0.75)
        // Denied rings sit still; a pulsing grey ring reads as available.
        ring.userData.pulse = ok ? Math.random() * Math.PI * 2 : null
        targetGroup.add(ring)
      })
    }
    targetsRef.current = { show: showTargets, clear: clearTargets }

    // GRADIENT, NOT A FLAT WASH. One material per opacity step, built once and
    // shared, rather than a clone per square: a 12x12 board can light 140 cells
    // and per-cell materials would churn the GPU every time the party moves.
    //
    // Gold throughout. Cyan is the party token ring and red is the hostile ring
    // (see buildBase) — neither is available to this overlay, and the dash band
    // is distinguished by its dashed perimeter rather than by a fifth hue.
    const RAMP = 6

    /**
     * THE GLOW RING. One baked texture, reused by every tile.
     *
     * NOT a fill. Sam's note: "boxes should be highlighted and glowing, not
     * filled in." A filled square hides the floor art underneath it — the rock,
     * the blood, the node backdrop we spent the effort to get on screen — and a
     * board carrying three filled bands reads as a heat map rather than as a
     * dungeon. So the interior stays open and the EDGE carries the signal.
     *
     * The glow is built by stroking the same rounded rect many times under
     * `lighter` compositing: wide and faint first, narrow and bright last, so
     * the alpha accumulates into a soft falloff either side of a crisp core.
     * That is cheaper and more portable than a canvas blur filter, and it
     * bakes once for the life of the board.
     */
    const glowTexture = () => {
      const S = 128
      const cv = document.createElement("canvas")
      cv.width = cv.height = S
      const g = cv.getContext("2d")!
      const R = S * 0.16
      const pad = S * 0.085
      const w = S - pad * 2
      const round = () => {
        g.beginPath()
        g.moveTo(pad + R, pad)
        g.arcTo(pad + w, pad, pad + w, pad + w, R)
        g.arcTo(pad + w, pad + w, pad, pad + w, R)
        g.arcTo(pad, pad + w, pad, pad, R)
        g.arcTo(pad, pad, pad + w, pad, R)
        g.closePath()
      }
      // A whisper of interior, so the square still reads as a REGION you may
      // stand in rather than as four unrelated edges. Low enough that the
      // floor beneath stays legible.
      g.fillStyle = "rgba(255,255,255,0.09)"
      round()
      g.fill()
      // The halo.
      g.globalCompositeOperation = "lighter"
      g.lineJoin = "round"
      for (let lw = 22; lw >= 2; lw -= 2) {
        const t = (22 - lw) / 20
        g.lineWidth = lw
        g.strokeStyle = `rgba(255,255,255,${(0.030 + t * t * 0.22).toFixed(3)})`
        round()
        g.stroke()
      }
      const t2 = new THREE.CanvasTexture(cv)
      t2.minFilter = THREE.LinearFilter
      return t2
    }
    const PLATE = glowTexture()

    // ADDITIVE. A glow adds light to the floor rather than painting over it,
    // which is what makes it read as emission instead of as a decal. It also
    // means the band never darkens the map art it sits on.
    const rampMats = (color: number, peak: number, floorOpacity: number) =>
      Array.from({ length: RAMP }, (_, i) =>
        new THREE.MeshBasicMaterial({
          map: PLATE,
          color,
          transparent: true,
          opacity: peak - ((peak - floorOpacity) * i) / (RAMP - 1),
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      )

    // THREE BANDS, THREE COLOURS.
    //
    // Gold is the free walk. Azure is the Dash — a second-choice option that
    // costs your action, so it runs cooler and quieter and never shouts as
    // loud as the walk. Oxblood is the frontier: the wall of your turn.
    //
    // The dash blue is DELIBERATELY not 0x38bdf8. That value is already the
    // party token ring (see buildBase), and a sky-blue floor tile under a
    // sky-blue-ringed ally reads as one object. 0x2f7fd6 is darker and sits
    // flat, so the additive rings still float clear of it.
    const MOVE_COLOR = 0xf3c94b
    const DASH_COLOR = 0x2f7fd6
    const DENY_COLOR = 0xa33b30

    // Within remaining movement: solid, strongest under the token's feet.
    const moveMats = rampMats(MOVE_COLOR, 0.95, 0.44)
    // Beyond it but inside a Dash: azure, carried further and fainter.
    const dashMats = rampMats(DASH_COLOR, 0.88, 0.42)
    // The square under the cursor. Additive, so it lifts whatever it lands on
    // without inventing a fourth colour.
    const overMat = new THREE.MeshBasicMaterial({ map: PLATE, color: 0xffffff, transparent: true, opacity: 0.30, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    // THE DENIAL FRONTIER. One square deep, immediately outside Dash reach.
    //
    // NOT every unreachable square: on a 12x12 board that is most of the board,
    // and a board mostly red reads as an error state rather than as
    // information. The frontier is the only unreachable fact that changes a
    // decision — it says where the turn ends.
    const denyMat = new THREE.MeshBasicMaterial({ map: PLATE, color: DENY_COLOR, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })

    // ---- THE BLAST TEMPLATE -------------------------------------------
    //
    // The shape of an area spell, lit on the floor and following the cursor.
    //
    // A FOURTH colour, and it has to be. Gold is the walk, azure the dash,
    // oxblood the frontier — all three are answers to "where can I go", and a
    // template answers "what will this cover". Ember reads as heat rather than
    // as permission, and it is the only band on the board that appears solely
    // while something is armed, so it never has to compete with the other
    // three for meaning.
    //
    // Same PLATE glow as everything else: edges, not fills. Sam's rule — a
    // filled square hides the floor art, and the floor art is what the blast
    // is landing on.
    const AOE_COLOR = 0xe07038
    const aoeMat = new THREE.MeshBasicMaterial({ map: PLATE, color: AOE_COLOR, transparent: true, opacity: 0.66, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    // Out of reach: the shape still draws, in the frontier's oxblood and
    // dimmer. Hiding it would leave the player waving an invisible template
    // around wondering why nothing happens; showing it greyed says "this is
    // the spell, and it does not get there from here".
    const aoeDenyMat = new THREE.MeshBasicMaterial({ map: PLATE, color: DENY_COLOR, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const aoeGeo = new THREE.PlaneGeometry(SQ, SQ)
    const templateGroup = new THREE.Group()
    scene.add(templateGroup)

    const clearTemplate = () => {
      while (templateGroup.children.length) templateGroup.remove(templateGroup.children[0])
    }

    /**
     * Light every square the shape covers, from the caster toward the cursor.
     *
     * areaCells() is imported rather than written here — it is the same
     * function the cast handler uses to decide who takes damage. That is the
     * point: this outline is not an illustration OF the rule, it is drawn BY
     * the rule.
     */
    const showTemplate = (casterTokenId: string, entry: SpellEntry, gx: number, gy: number) => {
      clearTemplate()
      const me = tokensRef.current.get(casterTokenId)
      const area = entry.area
      if (!me) return
      const origin = { x: me.row.grid_x ?? 0, y: me.row.grid_y ?? 0 }
      const aim = { x: gx, y: gy }
      const m = mapRef.current
      const onMap = (x: number, y: number) =>
        !m || (x >= 0 && y >= 0 && x < m.grid_width && y < m.grid_height)

      // A point spell with no shape — Mage Hand, Misty Step — still needs to
      // show WHERE. One square is the honest template for it.
      const cells = area ? areaCells(area, origin, aim) : [{ x: gx, y: gy }]
      const ok = area
        ? aimInRange(area, entry.rangeFt, origin, aim)
        : entry.rangeFt <= 0 ||
          Math.max(Math.abs(origin.x - gx), Math.abs(origin.y - gy)) * FEET_PER_SQUARE <= entry.rangeFt

      for (const c of cells) {
        if (!onMap(c.x, c.y)) continue
        const p = sqCentre(c.x, c.y)
        const tile = new THREE.Mesh(aoeGeo, ok ? aoeMat : aoeDenyMat)
        tile.rotation.x = -Math.PI / 2
        // Under the target rings (0.09) and above the reach bands, so an area
        // aimed over a creature does not swallow that creature's ring.
        tile.position.set(p.x, 0.082, p.z)
        templateGroup.add(tile)
      }
    }
    templateRef.current = { show: showTemplate, clear: clearTemplate }
    // Contours. Solid for the walk, dashed for the dash, and corner ticks on
    // the frontier. A contour is what turns a wash of tinted squares into a
    // shape readable at a glance from across the room.
    const contourMoveMat = new THREE.LineBasicMaterial({ color: MOVE_COLOR, transparent: true, opacity: 0.9 })
    const contourDashMat = new THREE.LineBasicMaterial({ color: DASH_COLOR, transparent: true, opacity: 0.75 })
    const denyEdgeMat = new THREE.LineBasicMaterial({ color: DENY_COLOR, transparent: true, opacity: 0.7 })
    // The hovered destination marker. The gold path ribbon that used to be
    // drawn here is gone — the tiers say where you may go, so a line saying
    // how you would get there was a second answer to a question already
    // answered. pathCells() below survives it: the route is still computed,
    // still broadcast, and tokens still WALK it rather than gliding through
    // rock. Only the drawing was removed.
    const hoverGroup = new THREE.Group()
    hoverGroup.visible = false
    scene.add(hoverGroup)
    let reachParents = new Map<string, string>()
    /** Walkable squares one step outside reach — the wall of the turn. */
    const frontier = new Set<string>()

    /** The cell chain start→destination, from the BFS parents. */
    const pathCells = (k: string): [number, number][] => {
      const out: [number, number][] = []
      let cur: string | undefined = k
      while (cur) {
        const [x, y] = cur.split(",").map(Number)
        out.push([x, y])
        cur = reachParents.get(cur)
      }
      return out.reverse()
    }

    const clearReach = () => {
      reachGroup.clear()
      frontier.clear()
      hoverGroup.clear()
      hoverGroup.visible = false
      reachRef.current = null
      reachParents = new Map()
      setMoveHint(null)
    }

    // A committed walk carries its BFS path to every browser by broadcast,
    // so tokens WALK the route — around rock, through the door — instead of
    // cutting the corner straight-line when the row lands. The stash is
    // consumed by glideToken when the realtime echo arrives; a stale one
    // (no echo inside 4s) is ignored and the straight glide covers it.
    const walkPaths = new Map<string, { cells: [number, number][]; at: number; dash?: boolean }>()
    // One footstep loop per token in motion, stopped when its glide ends.
    //
    // LOCAL, and deliberately not broadcast. Every browser runs glideToken for
    // every token off the same realtime row, so each seat starts and stops its
    // own loop and the table hears the walk without a single cue crossing the
    // wire. This is the Layer 3 split: turn RESULTS are cued from the server,
    // interface motion sounds for itself.
    const footsteps = new Map<string, PlayHandle>()

    /**
     * What this square sounds like underfoot.
     *
     * Surface outranks pace. A bridge and water say WHERE the miniature is,
     * which is the more useful fact; running only replaces the ordinary stone.
     */
    const surfaceLoop = (gx: number, gy: number, dash?: boolean, sneak?: boolean): SfxName => {
      const k = gx + "," + gy
      if (bridgeRef.current.has(k)) return "movement/rope_bridge" as SfxName
      if (waterRef.current.has(k)) return "movement/footsteps_water" as SfxName
      // SNEAKING OUTRANKS PACE, and loses to surface.
      //
      // A rogue creeping over a rope bridge still makes the bridge creak -
      // that is the bridge's noise, not hers, and she cannot sneak it away.
      // But on ordinary floor, a character who has taken the Hide action
      // moves quietly, and `movement/footsteps_sneak` is what that sounds
      // like. The clip has existed since the pack was recorded and nothing
      // had ever returned it, so nobody has heard it.
      //
      // Placed above `dash` because the two are mutually exclusive in the
      // fiction anyway: you do not sprint quietly.
      if (sneak) return "movement/footsteps_sneak" as SfxName
      if (dash) return "movement/footsteps_run" as SfxName
      // Velkynvelve is a wet stone pen. There is no gravel anywhere in the cell
      // geometry to distinguish, so this is the floor of the whole node set
      // rather than a default standing in for something unknown.
      return "movement/footsteps_wet_stone" as SfxName
    }

    /** Silence a token's walk, whether it arrived or was interrupted. */
    const stopFootsteps = (id: string) => {
      const h = footsteps.get(id)
      if (!h) return
      footsteps.delete(id)
      try {
        h.stop(0.12)
      } catch {
        /* a stuck loop must never take the frame loop down */
      }
    }
    let sendWalkPath: (tokenId: string, cells: [number, number][], dash?: boolean) => void = (tokenId, cells) => {
      walkPaths.set(tokenId, { cells, at: Date.now() })
    }

    const computeReach = () => {
      clearReach()
      // A move is out and unanswered: every number this would paint from is
      // one move out of date. Better a blank floor for a beat than a gold
      // band promising movement the server has already spent.
      if (moveInFlightRef.current) return
      const c = combatRef.current
      const m = mapRef.current
      if (!c || !m) return
      const entry = c.turn_order?.[c.active_index]
      if (!entry) return
      const tok = tokensRef.current.get(entry.token_id)
      if (!tok) return
      // A PC's reach paints for the browser that claimed them — and for the
      // DM, who may walk the active character on a player's behalf (same
      // budget, same rules; the free hand stays behind the DM-move toggle).
      // NPCs never paint reach here: theirs is the AI's to spend.
      if (!tok.row.character_id) return
      if (tok.row.character_id !== myCharRef.current && !dmRef.current) return
      // ...and only once the player has actually asked for it by clicking
      // their miniature. clearReach() has already run at the top, so a closed
      // token simply shows nothing rather than keeping a stale band.
      if (reachOpenRef.current !== tok.row.id) return
      // Budget is what is LEFT this turn, not full speed: a token that has
      // walked 15 of 30 shows 15 ft. Dash doubles the turn's total allowance,
      // so what remains of it is speed*2 minus what is already spent.
      //
      // BUT A DASH HAS TO BE AFFORDABLE. Dash costs your action, and the
      // server refuses one when the action is already gone (see the move
      // handler). The client did not mirror that check, so a character who
      // had cast a spell still saw a full speed*2 azure band — 10 ft of real
      // movement and 40 ft of promises. Clicking one raised the confirm,
      // accepting it hit the server guard, and the token simply did not move.
      // Painting reach the server will refuse is the same bug the azure band
      // shipped with; this is the other half of it.
      //
      // Already dashed this turn? Then it is bought and the doubled ceiling
      // stands regardless of the spent action.
      const usedFt = Number(c.turn_state?.moved_ft ?? 0)
      const dashed = c.turn_state?.dashed === true
      const canAffordDash = dashed || c.turn_state?.action !== true
      const moveBudget = Math.floor((speedFtRef.current - usedFt) / FEET_PER_SQUARE)
      const ceilingFt = canAffordDash ? speedFtRef.current * 2 : speedFtRef.current
      const dashBudget = Math.floor((ceilingFt - usedFt) / FEET_PER_SQUARE)
      if (dashBudget <= 0) return
      // Open doors are floor; closed ones are wall. The V5 cells put door
      // squares in neither set, so they join the walkable world only here.
      const openDoors = new Set(doorRecs.filter((r) => r.open).map((r) => r.cell))
      const passable = (k: string) => walkableRef.current.has(k) || openDoors.has(k)
      // Other bodies: a foe's square stops the path dead (SRD: you can't
      // willingly enter a hostile creature's space); a friend's square you
      // may pass through but never end on. Nobody stands on anybody.
      const blockStop = new Set<string>()
      const blockPass = new Set<string>()
      tokensRef.current.forEach(({ row }) => {
        if (row.id === tok.row.id || !row.is_visible) return
        const k = row.grid_x + "," + row.grid_y
        blockStop.add(k)
        if (!row.character_id) blockPass.add(k)
      })
      // 8-way BFS, one square = 5 ft, diagonals flat (PHB 5-5-5 — the same
      // arithmetic the server's Chebyshev floor assumes).
      const start = tok.row.grid_x + "," + tok.row.grid_y
      const dist = new Map<string, number>([[start, 0]])
      reachParents = new Map()
      const queue: string[] = [start]
      while (queue.length) {
        const cur = queue.shift()!
        const d = dist.get(cur)!
        if (d >= dashBudget) continue
        const [cx, cy] = cur.split(",").map(Number)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const nx = cx + dx
            const ny = cy + dy
            if (nx < 0 || ny < 0 || nx >= m.grid_width || ny >= m.grid_height) continue
            const nk = nx + "," + ny
            if (dist.has(nk) || !passable(nk) || blockPass.has(nk)) continue
            dist.set(nk, d + 1)
            reachParents.set(nk, cur)
            queue.push(nk)
          }
        }
      }
      const cells = new Map<string, { cost: number; tier: "move" | "dash" }>()
      dist.forEach((d, k) => {
        if (d === 0 || blockStop.has(k)) return
        const tier: "move" | "dash" = d <= moveBudget ? "move" : "dash"
        cells.set(k, { cost: d, tier })
        const [x, y] = k.split(",").map(Number)
        const cpos = sqCentre(x, y)
        // Falloff runs across each band separately, so the dash band reads as
        // its own gradient rather than the tail of the first one.
        const span = tier === "move" ? moveBudget : Math.max(1, dashBudget - moveBudget)
        const step = tier === "move" ? d - 1 : d - moveBudget - 1
        const idx = Math.max(0, Math.min(RAMP - 1, Math.floor((step / Math.max(1, span)) * RAMP)))
        const p = new THREE.Mesh(reachGeo, (tier === "move" ? moveMats : dashMats)[idx])
        p.rotation.x = -Math.PI / 2
        p.position.set(cpos.x, 0.035, cpos.z)
        reachGroup.add(p)
      })

      /**
       * Trace the outer boundary of a region and draw it as line segments.
       * Solid for the walk band; dashed for the dash band, so the two edges
       * stay distinguishable even for a colour-blind viewer.
       */
      const addContour = (inSet: (k: string) => boolean, mat: THREE.Material, y: number, dashed: boolean) => {
        const pts: number[] = []
        // dx, dy, and the two corners of the shared edge, in cell units.
        const SIDES: [number, number, [number, number], [number, number]][] = [
          [0, -1, [0, 0], [1, 0]],
          [0, 1, [0, 1], [1, 1]],
          [-1, 0, [0, 0], [0, 1]],
          [1, 0, [1, 0], [1, 1]],
        ]
        cells.forEach((_c, k) => {
          if (!inSet(k)) return
          const [x, y0] = k.split(",").map(Number)
          for (const [dx, dy, a, b] of SIDES) {
            if (inSet(x + dx + "," + (y0 + dy))) continue
            const ax = (x + a[0]) * SQ
            const az = (y0 + a[1]) * SQ
            const bx = (x + b[0]) * SQ
            const bz = (y0 + b[1]) * SQ
            if (!dashed) {
              pts.push(ax, y, az, bx, y, bz)
            } else {
              const N = 3
              for (let i = 0; i < N; i++) {
                const t0 = (i + 0.18) / N
                const t1 = (i + 0.82) / N
                pts.push(ax + (bx - ax) * t0, y, az + (bz - az) * t0)
                pts.push(ax + (bx - ax) * t1, y, az + (bz - az) * t1)
              }
            }
          }
        })
        if (!pts.length) return
        const g = new THREE.BufferGeometry()
        g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
        reachGroup.add(new THREE.LineSegments(g, mat))
      }

      addContour((k) => cells.get(k)?.tier === "move", contourMoveMat, 0.052, false)
      // Only when a dash band actually exists — with no action left to spend,
      // the outer edge is simply the edge of your walk.
      if (dashBudget > moveBudget) addContour((k) => cells.has(k), contourDashMat, 0.048, true)

      // THE FRONTIER. Walkable squares one step outside the whole reach set.
      // Rock is skipped: it already looks like rock, and painting it red would
      // say "you may not walk into this wall", which nobody needed telling.
      frontier.clear()
      cells.forEach((_c, k) => {
        const [x, y] = k.split(",").map(Number)
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= m.grid_width || ny >= m.grid_height) continue
            const nk = nx + "," + ny
            if (cells.has(nk) || nk === start) continue
            // Rock is INCLUDED, deliberately. It was excluded before on the
            // reasoning that a wall already looks like a wall — but on a 12x12
            // V5 tile a 30 ft Dash spans 12 squares and reaches corner to
            // corner, so with rock excluded the frontier was almost always
            // EMPTY and the red never drew. The boundary of a turn is the
            // boundary whether stone or open floor stops you, and an unbroken
            // ring around your reach is what Sam asked to see.
            frontier.add(nk)
          }
        }
      })
      frontier.forEach((k) => {
        const [x, y] = k.split(",").map(Number)
        const cpos = sqCentre(x, y)
        const p = new THREE.Mesh(reachGeo, denyMat)
        p.rotation.x = -Math.PI / 2
        // Above a rock tile's own top face, so a frontier square that happens
        // to be stone still shows its ring rather than z-fighting inside it.
        p.position.set(cpos.x, passable(k) ? 0.022 : 0.026, cpos.z)
        reachGroup.add(p)
        // Corner ticks: four short marks pulled in from the corners. Reads as
        // "closed off" rather than as a fourth fill colour competing with the
        // hostile token ring, which is the other red on this board.
        const pts: number[] = []
        const L = 0.20 * SQ
        const o = 0.06 * SQ
        const yy = 0.044
        const x0 = x * SQ + o
        const x1 = (x + 1) * SQ - o
        const z0 = y * SQ + o
        const z1 = (y + 1) * SQ - o
        const corners: [number, number, number, number][] = [
          [x0, z0, 1, 1], [x1, z0, -1, 1], [x0, z1, 1, -1], [x1, z1, -1, -1],
        ]
        for (const [cx, cz, sx, sz] of corners) {
          pts.push(cx, yy, cz, cx + L * sx, yy, cz)
          pts.push(cx, yy, cz, cx, yy, cz + L * sz)
        }
        const g = new THREE.BufferGeometry()
        g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3))
        reachGroup.add(new THREE.LineSegments(g, denyEdgeMat))
      })
      // Clamped: a token that has somehow spent more than its speed would give
      // a negative budget, and the label would then report a larger overspend
      // than is real. Zero left is zero left.
      if (cells.size)
        reachRef.current = {
          tokenId: tok.row.id,
          cells,
          moveFt: Math.max(0, moveBudget) * FEET_PER_SQUARE,
          dashFt: Math.max(0, dashBudget) * FEET_PER_SQUARE,
        }
    }
    refreshReachRef.current = computeReach

    /**
     * Mark the square under the cursor when standing there would cost a Dash.
     *
     * Within the walk this draws nothing: the move band already says the
     * square is free, and a second mark on top of it is noise. Red appears
     * here and nowhere else on the overlay.
     */
    const showHover = (k: string) => {
      hoverGroup.clear()
      const [x, y] = k.split(",").map(Number)
      const cpos = sqCentre(x, y)
      const mark = new THREE.Mesh(reachGeo, overMat)
      mark.rotation.x = -Math.PI / 2
      mark.position.set(cpos.x, 0.05, cpos.z)
      hoverGroup.add(mark)
      hoverGroup.visible = true
    }

    let lastHoverCell = ""
    const onHoverMove = (e: MouseEvent) => {
      // The armed check runs BEFORE the reach guard, deliberately. Aiming a
      // spell does not require a reach overlay to exist — and it usually does
      // not, because you have already moved. Guarding on reachRef first is
      // what would leave the template frozen for the rest of the turn.
      if (armedRef.current) {
        // While a spell is armed the cursor is asking a different question, and
        // the targeting read-out answers it. Movement cost alongside it is a
        // second answer to a question nobody asked - and the floor raycast still
        // hits a reach square underneath the token being aimed at, so without
        // this the board would price a walk the player is not taking.
        hoverGroup.visible = false
        lastHoverCell = ""
        setMoveHint(null)
        // A POINT spell's template follows the cursor. This is the only moving
        // part of aiming an area, so it tracks every mouse event rather than
        // being throttled to cell changes: a cone SWEEPS as you turn, and its
        // shape changes on sub-cell movement even when the aimed square does not.
        const armedNow = armedRef.current
        const helpfulNow = Boolean(armedNow.entry.helpful)

        if (armedNow.mode === "point" && floorPlane) {
          const r2 = renderer.domElement.getBoundingClientRect()
          pointer.set(((e.clientX - r2.left) / r2.width) * 2 - 1, -((e.clientY - r2.top) / r2.height) * 2 + 1)
          raycaster.setFromCamera(pointer, activeCam())
          const fh = raycaster.intersectObject(floorPlane, false)[0]
          if (fh) {
            const agx = Math.floor(fh.point.x / SQ)
            const agy = Math.floor(fh.point.z / SQ)
            templateRef.current.show(armedNow.tokenId, armedNow.entry, agx, agy)

            // EVERYONE STANDING IN THE SHAPE, marked as it sweeps.
            //
            // The template says where the blast lands; it does not say who is
            // in it, and at a glance a body half-overlapping an ember square
            // is ambiguous. This resolves that with the SAME areaCells the
            // server damages from, so the marked set and the damaged set are
            // the same set — including the caster's own side, which is the
            // whole reason a player needs to see it before committing.
            const area = armedNow.entry.area
            const shooter = tokensRef.current.get(armedNow.tokenId)
            if (area && shooter) {
              const origin = { x: shooter.row.grid_x ?? 0, y: shooter.row.grid_y ?? 0 }
              const covered = new Set(
                areaCells(area, origin, { x: agx, y: agy }).map((c) => `${c.x},${c.y}`),
              )
              const caught: string[] = []
              tokensRef.current.forEach((t) => {
                if (!t.row.is_visible) return
                if (!covered.has(`${t.row.grid_x},${t.row.grid_y}`)) return
                // Spirit Guardians and its kin spare their own; the mark has
                // to agree with the spell or it is worse than no mark.
                if (area.sparesAllies && (t.row.id === shooter.row.id || friendly(t.row))) return
                caught.push(t.row.id)
              })
              affectedRef.current.show(caught, helpfulNow)
            } else {
              affectedRef.current.clear()
            }
          }
        } else {
          // CREATURE MODE: mark whoever is under the cursor, if the release
          // would actually reach them. A red ring on a body the spell cannot
          // touch would be a promise the click then breaks.
          const overId = tokenUnder(e)
          const shooter = tokensRef.current.get(armedNow.tokenId)
          const over = overId ? tokensRef.current.get(overId) : null
          if (over && shooter && over.row.is_visible) {
            const st = targetStatus(shooter, over, armedNow.entry.rangeFt, armedNow.entry.helpful)
            // A cross-side body keeps its violet under the cursor: the mark
            // must say "this will ask first" louder, not say "red" instead.
            affectedRef.current.show(st.ok ? [over.row.id] : [], helpfulNow, Boolean(st.confirm))
          } else {
            affectedRef.current.clear()
          }
        }
        return
      }
      // Nothing armed: no marks.
      affectedRef.current.clear()
      if (!reachRef.current || !floorPlane) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, activeCam())
      const hit = raycaster.intersectObject(floorPlane, false)[0]
      if (!hit) { hoverGroup.visible = false; return }
      const gx = Math.floor(hit.point.x / SQ)
      const gy = Math.floor(hit.point.z / SQ)
      const k = gx + "," + gy
      if (k === lastHoverCell) return
      lastHoverCell = k
      const cell = reachRef.current.cells.get(k)
      if (!cell) {
        // Outside reach. The frontier squares say so out loud; everything
        // beyond them is simply not part of this turn's question.
        if (frontier.has(k)) {
          showHover(k)
          setMoveHint(`OUT OF REACH · BEYOND ${reachRef.current.dashFt} FT`)
        } else {
          hoverGroup.visible = false
          setMoveHint(null)
        }
        return
      }
      showHover(k)
      // Feet come from the BFS, which walked AROUND the rock. gridDistanceFeet
      // is straight-line and would under-report a route that bends - and the
      // server rejects a client understating path cost. One number, measured
      // the same way on both sides.
      const ft = cell.cost * FEET_PER_SQUARE
      const over = ft - reachRef.current.moveFt
      // Name the band. "45 FT · 15 FT OVER" prices the move but never says
      // what spending it costs you, and Dash costs your action.
      setMoveHint(
        over > 0
          ? `DASH · ${ft} FT · SPENDS YOUR ACTION`
          : `WALK · ${ft} FT · ${reachRef.current.moveFt - ft} FT LEFT`,
      )
    }
    renderer.domElement.addEventListener("mousemove", onHoverMove)

    // ---- whose turn it is, on the board itself ----------------------
    // THE ACTIVE RING — white-hot platinum, and used for nothing else.
    //
    // It was green, matching the status lamp on the card. But green had to
    // fight ten allegiance rings for attention, and once those were hidden the
    // remaining problem was that the board and the character plate announced
    // the same fact in two different colours: green under the miniature, gold
    // around the card.
    //
    // Platinum is now BOTH (see the card's `rim`), and it is the only place
    // this hue appears. Gold is the walk band, azure the dash, oxblood the
    // frontier, ember the blast template — every other colour on this board is
    // already spoken for, and a highlight that shares a hue with a floor
    // overlay under the same character is not a highlight.
    const ACTIVE_HUE = 0xfff2d0
    const activeGlow = new THREE.Mesh(
      new THREE.RingGeometry(1.08, 1.5, 48),
      new THREE.MeshBasicMaterial({
        color: ACTIVE_HUE, transparent: true, opacity: 0.3,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    )
    activeGlow.rotation.x = -Math.PI / 2
    activeGlow.position.y = 0.052
    activeGlow.renderOrder = 7 // above the darkness plane, like the torch glow
    activeGlow.visible = false
    scene.add(activeGlow)

    // ---- build the board from the database --------------------------
    const build = async () => {
      // The sandbox is a real board with real tokens — the mechanics under
      // test are the mechanics, not mocks. It is simply never `is_active`,
      // so the table can never find itself fighting in the rehearsal room.
      const { data: mapRow, error: mapErr } = await supabase
        .from("vtt_maps")
        .select("id,name,grid_width,grid_height,cell_size,meta")
        .eq(sandbox ? "is_sandbox" : "is_active", true)
        .limit(1)
        .maybeSingle()
      if (mapErr || !mapRow) { setStatus(mapErr ? mapErr.message : "No active battle map."); return }
      const map = mapRow as MapRow
      mapRef.current = map
      setMapName(map.name)

      const W = map.grid_width
      const H = map.grid_height
      const meta = map.meta ?? {}

      // Until (unless) the node declares its cells, every square is floor —
      // the reach overlay on a plain board is bounded by the walls alone.
      const allCells = new Set<string>()
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) allCells.add(x + "," + y)
      walkableRef.current = allCells

      // The painted tile, one uncut plane.
      const floorMat = meta.art_url
        ? (() => {
            const art = tex(meta.art_url!)
            // The painting lights itself. Without this the drawn map is at
            // the mercy of scene lights and tone mapping, and it arrived on
            // production nearly black.
            return new THREE.MeshStandardMaterial({
              map: art, emissiveMap: art, emissive: 0xffffff, emissiveIntensity: 0.62,
              roughness: 0.95, metalness: 0.04,
            })
          })()
        : new THREE.MeshStandardMaterial({ color: 0x4a4234, roughness: 0.95 })
      if (floorMat.map) {
        floorMat.map.wrapS = floorMat.map.wrapT = THREE.ClampToEdgeWrapping
        floorMat.map.repeat.set(1, 1)
      }
      floorPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * SQ, H * SQ), floorMat)
      floorPlane.rotation.x = -Math.PI / 2
      floorPlane.position.set((W * SQ) / 2, 0, (H * SQ) / 2)
      floorPlane.receiveShadow = true
      boardGroup.add(floorPlane)
      // What has already been spilled here. Persisted on the map row, so a
      // reload does not mop the floor.
      blood = layBloodDecals({ parent: boardGroup, cellToWorld: (x, y) => sqCentre(x, y), squareSize: SQ })
      blood.sync(meta.marks)
      // What is lying about. Read once here; kept live by the channel below.
      groundItems = layGroundItems({ parent: boardGroup, cellToWorld: (x, y) => sqCentre(x, y), squareSize: SQ })
      void supabase
        .from("vtt_ground_items")
        .select("id,map_id,item_id,name,quantity,grid_x,grid_y,dropped_by,picked_up_at")
        .eq("map_id", map.id)
        .is("picked_up_at", null)
        .then(({ data }: { data: unknown }) => { if (!disposed) groundItems?.sync(data) })
      if (meta.art_url) {
        void sobelNormalMap(meta.art_url).then((nm) => {
          if (nm && !disposed) {
            floorMat.normalMap = nm
            floorMat.normalScale = new THREE.Vector2(0.65, 0.65)
            floorMat.needsUpdate = true
          }
        })
      }

      // The void beyond the tile.
      const ground = new THREE.Mesh(
        new THREE.PlaneGeometry(W * SQ + 400, H * SQ + 400),
        new THREE.MeshBasicMaterial({ color: 0x010102 }),
      )
      ground.rotation.x = -Math.PI / 2
      ground.position.set((W * SQ) / 2, -0.03, (H * SQ) / 2)
      boardGroup.add(ground)

      // Grid lines — DM information, faint.
      const gpts: THREE.Vector3[] = []
      for (let i = 0; i <= W; i++) gpts.push(new THREE.Vector3(i * SQ, 0.07, 0), new THREE.Vector3(i * SQ, 0.07, H * SQ))
      for (let j = 0; j <= H; j++) gpts.push(new THREE.Vector3(0, 0.07, j * SQ), new THREE.Vector3(W * SQ, 0.07, j * SQ))
      boardGroup.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(gpts),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.13 }),
      ))

      // Cell geometry: rock, cage, doors — when the node declares them.
      if (meta.cells_url) {
        try {
          const cells = (await fetch(meta.cells_url).then((r) => r.json())) as CellsJson
          const R = cells.render ?? {}
          const walk = new Set<string>()
          const islandSet = new Set<string>()
          for (const c of [...cells.cells.floor, ...(cells.cells.water ?? [])]) {
            const k = c.sq.join(",")
            if (c.island) islandSet.add(k)
            else walk.add(k)
          }
          // Water is its own cell list, not a flag on the floor cells - the V5
          // exporter writes cells.water and leaves floor[].water unset, which
          // is why this reads the array rather than the flag.
          waterRef.current = new Set((cells.cells.water ?? []).map((c) => c.sq.join(",")))
          // A walkway exit is the rope bridge between two nodes. The type has
          // been declared on this shape all along; nothing read it until now.
          bridgeRef.current = new Set(
            (cells.exits ?? [])
              .filter((e) => (e.type ?? "").toLowerCase() === "walkway")
              .flatMap((e) => (e.cells ?? []).map((sq) => sq.join(","))),
          )
          const doorCells = new Set((cells.cells.doors ?? []).map((d) => d.sq.join(",")))
          // The real walkable world for movement: floor and islands. Rock
          // is absent, doors join at reach-time only while they stand open.
          walkableRef.current = new Set([...walk, ...islandSet])

          const rockTex = tex(storageTex("tiles/floor_cave.png"))
          const plainSide = new THREE.MeshStandardMaterial({ map: rockTex, color: 0x39332c, roughness: 1, metalness: 0 })
          const ironMat = new THREE.MeshStandardMaterial({ map: rockTex, color: 0x2e2a26, roughness: 0.9, metalness: 0.25 })
          const wallH = 1.35

          if (R.cage) {
            // The pen's bars, floor-outward — one panel per open face, so
            // edge squares are sealed too (the old inward sweep left gaps).
            const barTexture = tex(storageTex(R.cage_texture || "tiles/jail_bars.png"))
            const barMat = new THREE.MeshStandardMaterial({
              map: barTexture, emissiveMap: barTexture, emissive: 0x6a6258, emissiveIntensity: 0.5,
              transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
              roughness: 0.85, metalness: 0.15, color: 0xb9a98c,
            })
            const bh = R.cage_height || 2.5
            for (const k of walk) {
              const [x, y] = k.split(",").map(Number)
              if (doorCells.has(k)) continue
              for (const [nx, ny] of sq4(x, y)) {
                const nk = nx + "," + ny
                if (walk.has(nk) || doorCells.has(nk)) continue
                const c = sqCentre(x, y)
                const panel = new THREE.Mesh(new THREE.PlaneGeometry(SQ, bh), barMat)
                panel.position.set(c.x + (nx - x) * SQ * 0.5, bh / 2, c.z + (ny - y) * SQ * 0.5)
                if (nx !== x) panel.rotation.y = Math.PI / 2
                panel.castShadow = true
                boardGroup.add(panel)
                const sill = new THREE.Mesh(
                  new THREE.BoxGeometry(nx !== x ? 0.18 : SQ, 0.18, nx !== x ? SQ : 0.18), ironMat)
                sill.position.copy(panel.position)
                sill.position.y = 0.09
                boardGroup.add(sill)
              }
            }
          } else {
            // Rock: boxes whose top face keeps its own patch of the art.
            for (let y = 0; y < H; y++) {
              for (let x = 0; x < W; x++) {
                const k = x + "," + y
                if (walk.has(k) || islandSet.has(k)) continue
                let top: THREE.Material = plainSide
                let side: THREE.Material = plainSide
                if (floorMat.map) {
                  const t = floorMat.map.clone()
                  t.needsUpdate = true
                  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
                  t.repeat.set(1 / W, 1 / H)
                  t.offset.set(x / W, 1 - (y + 1) / H)
                  top = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.62, roughness: 0.98, metalness: 0 })
                  const ts = t.clone()
                  ts.needsUpdate = true
                  side = new THREE.MeshStandardMaterial({ map: ts, emissiveMap: ts, emissive: 0x8a8a92, emissiveIntensity: 0.4, roughness: 1, metalness: 0, color: 0x6a6a72 })
                }
                const box = new THREE.Mesh(new THREE.BoxGeometry(SQ, wallH, SQ), [side, side, top, plainSide, side, side])
                const c = sqCentre(x, y)
                box.position.set(c.x, wallH / 2, c.z)
                box.castShadow = box.receiveShadow = true
                boardGroup.add(box)
              }
            }
          }

          // Doors — framed, hinged, clickable, honouring the lock.
          for (const d of cells.cells.doors ?? []) {
            const c = sqCentre(d.sq[0], d.sq[1])
            const across = d.dir ? d.dir[0] !== 0 : false
            const h = 2.1
            const door = new THREE.Group()
            door.position.set(c.x, 0, c.z)
            door.rotation.y = across ? Math.PI / 2 : 0
            for (const s of [-1, 1]) {
              const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, h * 1.04, 0.22), ironMat)
              post.position.set(s * SQ * 0.46, h * 0.52, 0)
              post.castShadow = true
              door.add(post)
            }
            const lintel = new THREE.Mesh(new THREE.BoxGeometry(SQ * 1.06, 0.18, 0.24), ironMat)
            lintel.position.set(0, h * 1.04, 0)
            door.add(lintel)
            const texPath = d.texture || R.door_texture || "tiles/jail_gate.png"
            const solid = /iron_door|wood_door|drow_door/.test(texPath)
            const leafTexture = tex(storageTex(texPath))
            const leafMat = new THREE.MeshStandardMaterial({
              map: leafTexture, emissiveMap: leafTexture, emissive: 0x7a7268, emissiveIntensity: 0.45,
              transparent: !solid, alphaTest: solid ? 0 : 0.3, side: THREE.DoubleSide,
              roughness: solid ? 0.62 : 0.8, metalness: solid ? 0.55 : 0.2,
              color: solid ? 0xbfb6a6 : 0xa9997e,
            })
            const hinge = new THREE.Group()
            hinge.position.set(-SQ * 0.46, 0, 0)
            const leaf = new THREE.Mesh(new THREE.BoxGeometry(SQ * 0.92, h, 0.12), leafMat)
            leaf.position.set(SQ * 0.46, h / 2, 0)
            leaf.castShadow = true
            hinge.add(leaf)
            door.add(hinge)
            boardGroup.add(door)
            // A lamp above every doorway - the drow light their gates, and it
            // gives the darkness fixed warm anchors the way D2 rooms hang
            // braziers at their thresholds.
            const lamp = new THREE.PointLight(0xff8a30, 6, 5.5, 1.8)
            lamp.position.set(c.x, 2.35, c.z)
            boardGroup.add(lamp)
            const rec: DoorRec = {
              cell: d.sq.join(","), data: d, hinge, leaf,
              open: Boolean(d.initially_open),
              locked: d.locked !== undefined && d.locked !== null ? Boolean(d.locked) : true,
              t: d.initially_open ? 1 : 0, targetT: d.initially_open ? 1 : 0, shake: 0,
            }
            leaf.userData.door = rec
            doorRecs.push(rec)
            doorLeaves.push(leaf)
            if (rec.open) applyDoor(rec, 1)
          }
        } catch (e) {
          // The board without its geometry is still a board. Say so, carry on.
          console.error("[board] cell geometry failed to load:", e)
        }
      }

      // The darkness, floating just above everything flat. Tokens and walls
      // rise through it and stay readable - Diablo lit its actors too.
      const darkMat = new THREE.MeshBasicMaterial({
        map: lightTexture, transparent: true, depthWrite: false,
      })
      darknessPlane = new THREE.Mesh(new THREE.PlaneGeometry(W * SQ + 400, H * SQ + 400), darkMat)
      darknessPlane.rotation.x = -Math.PI / 2
      darknessPlane.position.set((W * SQ) / 2, 0.085, (H * SQ) / 2)
      darknessPlane.renderOrder = 5
      // Built visible-by-default; the baseline says otherwise. The React
      // state effect ran before this ref existed, so apply it here too.
      darknessPlane.visible = DEFAULT_DARKNESS_ON
      // The oversized plane must be dark OUTSIDE the tile too: the canvas
      // maps to the whole plane, so scale the UVs to keep the lit region
      // aligned with the tile itself.
      const over = (W * SQ + 400) / (W * SQ)
      lightTexture.repeat.set(over, over)
      lightTexture.offset.set(-(over - 1) / 2, -(over - 1) / 2)
      boardGroup.add(darknessPlane)
      darknessRef.current = (on) => { if (darknessPlane) darknessPlane.visible = on }
      classicRef.current = (on) => { classic = on; applyCamera() }

      // Embers drifting through the torchlight.
      for (let i = 0; i < EMBERS; i++) {
        emberPos[i * 3] = Math.random() * W * SQ
        emberPos[i * 3 + 1] = Math.random() * 2.4
        emberPos[i * 3 + 2] = Math.random() * H * SQ
        emberVel[i] = 0.12 + Math.random() * 0.25
        emberSeed[i] = Math.random() * Math.PI * 2
      }
      emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3))
      boardGroup.add(embers)

      // Frame the whole tile.
      target.set((W * SQ) / 2, 0, (H * SQ) / 2)
      dist = Math.max(W, H) * SQ * 1.5 + 4
      if (scene.fog instanceof THREE.Fog) {
        scene.fog.near = dist * 0.9
        scene.fog.far = dist * 2.6
      }
      torch.position.set(target.x, 9, target.z)
      torch2.position.set(target.x + 5, 7, target.z - 4)
      applyCamera()

      // LIGHTING BUDGET. A model rendered as a white blob is almost always
      // a light too close or too strong, and that is invisible in a
      // screenshot. Print the budget once so it can be read instead of
      // guessed at — the torch-inside-the-mesh bug cost a round trip.
      let lightCount = 0
      let brightest = 0
      scene.traverse((o) => {
        const l = o as THREE.PointLight
        if ((l as THREE.Light).isLight) {
          lightCount++
          if (typeof l.intensity === "number") brightest = Math.max(brightest, l.intensity)
        }
      })
      console.log(
        `[board] lighting: ${lightCount} lights, strongest ${brightest.toFixed(1)}, ` +
        `exposure ${renderer.toneMappingExposure}. Party torches sit at y=2.45 — ` +
        `ABOVE head height, never inside the mesh.`,
      )

      // The combatants.
      const { data: tokenRows } = await supabase
        .from("vtt_tokens")
        .select("id,map_id,character_id,bestiary_id,label,model_url,model_scale,model_y_offset,grid_x,grid_y,rotation_y,token_size,tint_color,is_visible,is_hidden,hp_current,hp_max,allegiance,summon")
        .eq("map_id", map.id)

      // A model belongs to the SPECIES. A token that names a bestiary entry
      // and carries no model of its own inherits that entry's art, so placing
      // the second giant spider needs no URL and no SQL — the bestiary row
      // already knows what a giant spider looks like. The token's own
      // model_url still wins when set, which is how a named boss wears
      // different art from its kin.
      //
      // The same row also carries the creature's AC, which the hover read-out
      // wants. Two features, one bestiary row, one round trip — they were
      // written as separate queries on separate branches and there is no
      // reason to keep them apart now they have met.
      const speciesIds = [...new Set(((tokenRows ?? []) as TokenRow[])
        .map((r: TokenRow) => r.bestiary_id)
        .filter((id: string | null): id is string => Boolean(id)))]
      const speciesModel = new Map<string, { url: string | null; scale: number | null; y: number | null }>()
      const acByBeast = new Map<string, number>()
      if (speciesIds.length) {
        const { data: species } = await supabase
          .from("bestiary")
          .select("id,ac,model_url,model_scale,model_y_offset")
          .in("id", speciesIds)
        for (const b of (species ?? []) as Array<{ id: string; ac: number | null; model_url: string | null; model_scale: number | null; model_y_offset: number | null }>) {
          speciesModel.set(b.id, { url: b.model_url, scale: b.model_scale, y: b.model_y_offset })
          if (typeof b.ac === "number") acByBeast.set(b.id, b.ac)
        }
      }

      for (const row of (tokenRows ?? []) as TokenRow[]) {
        const fallback = row.bestiary_id ? speciesModel.get(row.bestiary_id) : undefined
        spawnToken(fallback?.url && !row.model_url
          ? { ...row,
              model_url: fallback.url,
              model_scale: row.model_scale ?? fallback.scale,
              model_y_offset: row.model_y_offset ?? fallback.y }
          : row)
        // Monsters can have their AC already: it came back with the art.
        const beastAc = row.bestiary_id ? acByBeast.get(row.bestiary_id) : undefined
        if (typeof beastAc === "number") acRef.current.set(row.id, beastAc)
        syncSummons()
      }

      // ---- the rest of the hover read-out ----------------------------
      // The party's own numbers. Nothing here decides anything: the server
      // still rolls, and this is only what the cursor reports. A token whose
      // AC cannot be found simply shows no number rather than a guessed one.
      void (async () => {
        const rows = (tokenRows ?? []) as TokenRow[]
        const charIds = Array.from(new Set(rows.map((r) => r.character_id).filter(Boolean))) as string[]
        if (!charIds.length) return
        const { data } = await supabase
          .from("characters")
          .select("id,ac,sheet_spellcasting")
          .in("id", charIds)
        const acByChar = new Map<string, number>()
        for (const c of data ?? []) {
          if (typeof c.ac === "number") acByChar.set(c.id as string, c.ac)
          // attack_bonus and save_dc are already on the sheet, each with an
          // SRD citation. Read them; do not re-derive them from class.
          const sc = (c.sheet_spellcasting ?? {}) as { attack_bonus?: number; save_dc?: number }
          casterRef.current.set(c.id as string, {
            atk: typeof sc.attack_bonus === "number" ? sc.attack_bonus : null,
            dc: typeof sc.save_dc === "number" ? sc.save_dc : null,
          })
        }
        for (const r of rows) {
          const ac = r.character_id ? acByChar.get(r.character_id) : undefined
          if (typeof ac === "number") acRef.current.set(r.id, ac)
        }
      })()

      // First paint of the reach overlay — combat may already be mid-turn
      // when this browser arrives (a refresh during a fight).
      computeReach()
      const partyTokens = ((tokenRows ?? []) as TokenRow[]).filter((r) => r.character_id && r.is_visible)
      setTokenToCharacter(Object.fromEntries(
        ((tokenRows ?? []) as TokenRow[]).filter((r) => r.character_id).map((r) => [r.id, r.character_id as string]),
      ))

      // The plates read the SHEETS, not the tokens: AC, level, speed and
      // spell slots live on the character, and a HUD that guessed them would
      // be lying about the sheet.
      const charIds = partyTokens.map((r) => r.character_id as string)
      const loadSheets = async () => {
        if (!charIds.length) return
        const { data: rows } = await supabase
          .from("characters")
          // sheet_attacks is DELIBERATELY not selected any more. It was a
          // second, hand-kept copy of what a character carries, and it had
          // already drifted from the first: the drow confiscated the party's
          // gear, the inventories emptied correctly, and the sheets went on
          // listing a spear locked in a store room down the hall. The rack is
          // now derived from the inventory below, so there is one answer.
          .select("id,name,class,level,ac,hp_current,hp_max,speed,proficiency_bonus,portrait_image_url,face_image_url,dex_modifier,sheet_spellcasting,sheet_features,conditions,str_score,dex_score,con_score,int_score,wis_score,cha_score,avatar_image_url,initiative,xp,xp_to_next,sheet_species,sheet_background,sheet_save_proficiencies,sheet_skill_proficiencies,sheet_heroic_inspiration,hero_image_url,death_saves")
          .in("id", charIds)
          // Without this the order is whatever Postgres feels like, which
          // makes the default focus — and the fallback above — a coin flip
          // that changes between reloads.
          .order("name")

        // WHAT THEY ACTUALLY CARRY.
        //
        // One join, through the FK that already exists: the row says the
        // character owns a thing, and the catalog says what that thing does.
        // Pick up a rapier and it is on the rack next reload; have it taken
        // and it is gone. Nobody edits a sheet.
        // Named rather than inferred: the select string is past the point
        // where the generated types can follow it, so without this every
        // callback below lands as an implicit `any`.
        type InvRow = {
          character_id?: string | null
          name?: string | null
          item_type?: string | null
          items?: { item_type?: string | null; properties?: Record<string, unknown> | null; rarity?: string | null } | null
        }
        const { data: invRows } = await supabase
          .from("inventory_items")
          .select("character_id,name,item_type,items(item_type,properties,rarity)")
          .in("character_id", charIds)

        const carried = new Map<string, InvRow[]>()
        for (const r of (invRows ?? []) as unknown as InvRow[]) {
          const k = r.character_id
          if (!k) continue
          const bucket = carried.get(k) ?? []
          bucket.push(r)
          carried.set(k, bucket)
        }

        type SheetRow = {
          id: string
          str_score?: number | null
          dex_score?: number | null
          proficiency_bonus?: number | null
        }
        const list = ((rows ?? []) as unknown as SheetRow[]).map((c) => {
          const row = c
          return {
            ...c,
            // The rack's weapons, computed from the inventory and this
            // character's own arithmetic. Unarmed Strike is appended by
            // attacksFromInventory — a fist is not inventory and should never
            // have been stored as data, which is how Scott ended up unable to
            // punch while everyone else could.
            sheet_attacks: attacksFromInventory(carried.get(row.id), {
              strScore: row.str_score,
              dexScore: row.dex_score,
              proficiencyBonus: row.proficiency_bonus,
            }),
          }
        }) as unknown as HudCharacter[]

        sheetAttacksRef.current = Object.fromEntries(
          list.map((c) => [c.id, ((c as unknown as { sheet_attacks?: { name?: string }[] }).sheet_attacks ?? [])]),
        )
        // What goes IN THE HAND, which is a different question from what is on
        // the rack. A fist is a rack entry and not a prop, so equipping the
        // first attack blindly would hand every model an "Unarmed Strike".
        const heldWeapon = new Map<string, { name: string; rarity: string }>()
        for (const [cid, items] of carried) {
          const w = items.find(
            (r: InvRow) => String(r.items?.item_type ?? r.item_type ?? "").toLowerCase() === "weapon",
          )
          if (!w?.name) continue
          heldWeapon.set(cid, { name: w.name, rarity: w.items?.rarity ?? "common" })
        }
        // WHAT THEY HOLD IN THE OTHER HAND.
        //
        // Detected by name against what the inventory says they carry — the
        // same /shield/ test lib/armor-class.ts uses to award the +2 — so
        // the +2 on the plate and the shield on the arm never disagree. This
        // is what lets a near miss be BLOCKED rather than parried, and it is
        // the one fact about the target the server's verdict cannot supply.
        const shieldHeld = new Map<string, { name: string; rarity: string; itemType: string | null }>()
        for (const [cid, items] of carried) {
          const s = items.find((r: InvRow) => /shield|buckler/i.test(String(r.name ?? "")))
          if (!s?.name) continue
          shieldHeld.set(cid, {
            name: s.name,
            rarity: s.items?.rarity ?? "common",
            itemType: s.items?.item_type ?? s.item_type ?? null,
          })
        }
        shieldRef.current = shieldHeld
        // The models load asynchronously and the sheets arrive on their own
        // schedule, so whichever wins the race, this pass makes sure everyone
        // ends up armed. equipOnRig removes what is in the hand first, so
        // running it twice is a no-op rather than a second sword.
        tokensRef.current.forEach((t) => {
          // A ternary rather than `&&`: character_id is nullable, and `&&`
          // would widen this to `"" | undefined` — falsy at runtime, but a
          // union that no longer has .name or .rarity on it.
          //
          // Read from the CARRIED WEAPONS map, not from the rack. The rack's
          // first entry is now whatever the character can attack with, and for
          // a disarmed prisoner that is their fist — which is not a prop and
          // has no model. A hand holding an "Unarmed Strike" is the failure
          // this map exists to avoid.
          const held = t.row.character_id ? heldWeapon.get(t.row.character_id) : null
          const shield = t.row.character_id ? shieldHeld.get(t.row.character_id) : null
          const model = t.obj.children.find((c) => c.getObjectByName("RightHand"))
          if (!model) return
          // The off hand: a shield if the inventory says so, and EMPTY if it
          // no longer does. The drow confiscated the party's gear once
          // already; a shield that lingers on the arm after the row is gone
          // is the same lie the rack was cured of.
          if (shield) {
            equipOnRig(model, { name: shield.name, itemType: shield.itemType, rarity: shield.rarity, slot: "off_hand" })
          } else {
            unequipSlot(model, "off_hand")
          }
          if (!held?.name) return
          // Rarity travels with the re-equip. equipOnRig clears the hand
          // first, so omitting it here would let this pass quietly strip the
          // tint that the load-time equip had already applied.
          if (model) equipOnRig(model, {
            name: held.name,
            itemType: "weapon",
            rarity: held.rarity ?? "common",
            slot: "main_hand",
          })
        })
        setSheets(list)
        // Focus THIS browser's own character by default, not merely the first
        // plate. Otherwise a player opens the board driving someone else, and
        // pressing a spell casts as the wrong character. Read localStorage
        // fresh so effect-ordering can't hand us a stale value; the DM has no
        // claimed character and correctly falls through to the first plate.
        const mine = typeof window !== "undefined" ? window.localStorage.getItem("aop_character_id") : null
        setFocusId((cur) => cur ?? (mine && list.some((c) => c.id === mine) ? mine : list[0]?.id) ?? null)
      }
      await loadSheets()

      // NPC medallions. The prisoners have commissioned portraits in
      // npc_encounters; without this the initiative rail falls back to the
      // first letter of their name, which is what Sam was looking at.
      // Matched on LABEL because a token may carry a bestiary_id (a species)
      // rather than a link to the specific NPC row.
      const npcLabels = ((tokenRows ?? []) as TokenRow[])
        .filter((t) => !t.character_id && t.is_visible)
        .map((t) => t.label)
      const loadNpcs = async () => {
        if (!npcLabels.length) return
        const { data: npcs } = await supabase
          .from("npc_encounters")
          .select("name,portrait_url,face_url,conditions")
          .in("name", npcLabels)
        type NpcRow = { name: string; portrait_url: string | null; face_url: string | null; conditions: unknown }
        const byName = new Map<string, NpcRow>(
          ((npcs ?? []) as NpcRow[]).map((n) => [n.name, n] as [string, NpcRow]),
        )
        const map: Record<string, string> = {}
        const conds: Record<string, unknown> = {}
        for (const t of (tokenRows ?? []) as TokenRow[]) {
          const npc = byName.get(t.label)
          if (!npc) continue
          const url = npc.face_url ?? npc.portrait_url
          if (url) map[t.id] = url
          if (npc.conditions) conds[t.id] = npc.conditions
        }
        setTokenPortrait(map)
        setTokenConditions(conds)
      }
      await loadNpcs()

      // The log is the real transcript — what Malachar actually narrated —
      // rather than invented mechanical chatter.
      const loadLog = async () => {
        const { data } = await supabase
          .from("dialogue")
          .select("id,speaker,text")
          .eq("channel", "dm")
          .order("created_at", { ascending: false })
          // 12 was a panel's worth. The log is now a scrollable window and the
          // rolls live in it — who saved against what DC, what a hit was for —
          // so it needs enough history to be worth scrolling back through.
          .limit(80)
        // NO TRUNCATION. The 90-character cut fell in the middle of exactly
        // the lines that matter: "Samson casts Toll the Dead — Scott rolls
        // 19+1 = 20 vs DC 13: saves." is the whole point of the entry, and
        // clipping it left the reader with the spell and none of the result.
        // The panel wraps; let it wrap.
        setLog(((data ?? []) as HudLogLine[]).reverse())
      }
      void loadLog()
      const logChannel = supabase
        .channel("combat-log-board")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "dialogue" }, () => void loadLog())
        .subscribe()
      setStatus("")

      // Initiative: current state, then live by realtime — the turn passing
      // is the event every screen at the table is waiting for.
      const loadCombat = async () => {
        try {
          const res = await fetch(`/api/combat${sandbox ? "?sandbox=1" : ""}`, { cache: "no-store" })
          const data = res.ok ? await res.json() : null
          setCombat(data?.combat && data.combat.status !== "ended" ? data.combat : null)
        } catch { /* the board without a turn strip is still a board */ }
      }
      void loadCombat()
      const combatChannel = supabase
        .channel("combat-state-board")
        .on("postgres_changes", { event: "*", schema: "public", table: "combat_state", filter: `map_id=eq.${map.id}` }, () => void loadCombat())
        .subscribe()

      // Live sheets. Until now `sheets` was fetched once on mount and never
      // again — so a condition Malachar applied mid-fight, or damage he wrote
      // to the sheet, showed on nobody's plate until they reloaded the page.
      // A HUD that lies about the sheet is worse than no HUD; a HUD that shows
      // a five-minute-old sheet lies more quietly, which is worse still.
      const charIdSet = new Set(charIds)
      const sheetsChannel = supabase
        .channel("characters-board")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "characters" }, (payload: { new?: unknown }) => {
          // No server-side filter: realtime takes one `eq` at a time and the
          // party is four rows. Cheaper to check the id here than to open four
          // channels.
          const id = (payload.new as { id?: string })?.id
          if (id && charIdSet.has(id)) void loadSheets()
        })
        .subscribe()

      // NPC conditions travel the same way — Malachar writes them to
      // npc_encounters by name, and the rail should mark them at once.
      const npcChannel = supabase
        .channel("npc-conditions-board")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "npc_encounters" }, () => void loadNpcs())
        .subscribe()

      // The committed route travels ahead of the row change, so every board
      // walks the same corners. Local set + broadcast (broadcast does not
      // echo to its sender, hence the local set in sendWalkPath).
      const walkChannel = supabase
        .channel("board-walk")
        .on("broadcast", { event: "walk" }, ({ payload }) => {
          const p = payload as { token_id?: string; cells?: [number, number][]; dash?: boolean }
          if (p?.token_id && Array.isArray(p.cells)) walkPaths.set(p.token_id, { cells: p.cells, at: Date.now(), dash: p.dash })
        })
        .subscribe()
      sendWalkPath = (token_id, cells, dash) => {
        walkPaths.set(token_id, { cells, at: Date.now(), dash })
        // The dash rides WITH the route. It is known only to the seat that gave
        // the order, and every other board animates this walk from the realtime
        // row - which carries no such flag. Without this the mover would hear a
        // run and the rest of the table a walk, for the same miniature.
        void walkChannel.send({ type: "broadcast", event: "walk", payload: { token_id, cells, dash } })
      }

      // Blood laid by the route lands on every board the moment the map row
      // changes. Nothing else on the row moves mid-fight, so this is cheap.
      const marksChannel = supabase
        .channel("vtt-marks-board")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "vtt_maps", filter: `id=eq.${map.id}` }, (payload: { new?: unknown }) => {
          const next = (payload.new as { meta?: { marks?: unknown } } | undefined)?.meta?.marks
          blood?.sync(next)
        })
        .subscribe()

      // A pile picked up on one browser leaves every board; a drop lands on
      // every board. The table is small, so each change is answered with one
      // re-read rather than patching the list by hand.
      const groundRows = new Map<string, GroundItemRow>()
      const groundChannel = supabase
        .channel("vtt-ground-board")
        .on("postgres_changes", { event: "*", schema: "public", table: "vtt_ground_items", filter: `map_id=eq.${map.id}` }, (payload: { eventType: string; new?: unknown; old?: unknown }) => {
          const id = ((payload.new ?? payload.old) as { id?: string })?.id
          if (!id) return
          if (payload.eventType === "DELETE") groundRows.delete(id)
          else groundRows.set(id, payload.new as GroundItemRow)
          groundItems?.sync(Array.from(groundRows.values()))
        })
        .subscribe()
      // Seed the live map from the same read the props were drawn from, so
      // the first change does not wipe what was already on the floor.
      void supabase
        .from("vtt_ground_items")
        .select("id,map_id,item_id,name,quantity,grid_x,grid_y,dropped_by,picked_up_at")
        .eq("map_id", map.id)
        .is("picked_up_at", null)
        .then(({ data }: { data: unknown }) => { for (const r of ((data ?? []) as GroundItemRow[])) groundRows.set(r.id, r) })

      // The pack changed hands — a pickup, a drop, an award from Malachar —
      // so the rack is re-derived. The sheets channel above answers the
      // character row; this answers the inventory row, which the rack is
      // actually built from.
      const inventoryChannel = supabase
        .channel("vtt-inventory-board")
        .on("postgres_changes", { event: "*", schema: "public", table: "inventory_items" }, (payload: { new?: unknown; old?: unknown }) => {
          const cid = ((payload.new ?? payload.old) as { character_id?: string })?.character_id
          if (cid && charIdSet.has(cid)) void loadSheets()
        })
        .subscribe()

      // Live: any token change, from any hand, lands on every board.
      const channel = supabase
        .channel("vtt-tokens-board")
        .on("postgres_changes", { event: "*", schema: "public", table: "vtt_tokens", filter: `map_id=eq.${map.id}` }, (payload) => {
          if (payload.eventType === "DELETE") {
            const gone = tokensRef.current.get((payload.old as { id: string }).id)
            if (gone) {
              tokenGroup.remove(gone.obj)
              tokensRef.current.delete((payload.old as { id: string }).id)
            }
            syncSummons()
            return
          }
          glideToken(payload.new as TokenRow)
          syncSummons()
          // Bodies moved: the reachable world changed shape for whoever's
          // turn it is — and the mover's own board repaints its new budget.
          refreshReachRef.current()
        })
        .subscribe()
      return () => {
        void supabase.removeChannel(channel)
        void supabase.removeChannel(walkChannel)
        void supabase.removeChannel(combatChannel)
        void supabase.removeChannel(logChannel)
        void supabase.removeChannel(sheetsChannel)
        void supabase.removeChannel(npcChannel)
        void supabase.removeChannel(marksChannel)
        void supabase.removeChannel(groundChannel)
        void supabase.removeChannel(inventoryChannel)
      }
    }

    let cleanupRealtime: (() => void) | undefined
    void build().then((fn) => { cleanupRealtime = fn ?? undefined })

    // ---- animation loop ---------------------------------------------
    const clock = new THREE.Clock()
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(clock.getDelta(), 0.1)
      // The rings under the floor items breathe, so a dark shard on dark
      // stone can be found by eye.
      groundItems?.tick(clock.elapsedTime)
      // Keyboard pan first, so everything below renders from this frame's view.
      panFromKeys(dt)
      // The active combatant's base breathes. Following per-frame keeps the
      // glow under the token through glides without touching the glide code.
      const combatNow = combatRef.current
      const activeTok = combatNow
        ? tokensRef.current.get(combatNow.turn_order?.[combatNow.active_index]?.token_id ?? "")
        : undefined
      // ONE ring means ONE ring, including on the active character.
      //
      // The pass before this showed the base ring and HP arc for whoever was
      // up — which stacked THREE concentric circles under that one miniature:
      // cyan allegiance, green health, platinum active. "Only the active
      // character is ringed" was satisfied and the board still looked wrong,
      // because the count that mattered was rings per character, not
      // characters wearing rings.
      //
      // In combat, nobody wears a base ring. The platinum glow below is the
      // whole vocabulary. Out of combat the rings come back, because then
      // they are how you tell friend from foe at a glance and no turn order
      // exists to say it instead.
      tokensRef.current.forEach((t) => {
        const r = t.obj.userData.baseRing as THREE.Mesh | undefined
        if (r) r.visible = !combatNow
        const a = t.obj.userData.hpArc as THREE.Mesh | undefined
        if (a) a.visible = !combatNow
      })
      if (activeTok && activeTok.row.is_visible) {
        activeGlow.visible = true
        activeGlow.position.x = activeTok.obj.position.x
        activeGlow.position.z = activeTok.obj.position.z
        activeGlow.scale.setScalar(radiusFor(activeTok.row.token_size))
        ;(activeGlow.material as THREE.MeshBasicMaterial).opacity = 0.26 + 0.14 * Math.sin(clock.elapsedTime * 2.4)
      // Target rings breathe so they read as an invitation rather than decor.
      targetGroup.children.forEach((r) => {
        const m = r as THREE.Mesh
        const phase = m.userData.pulse as number | null
        // A denied ring (pulse null) holds a flat dim so it reads as "no",
        // rather than breathing like the ones you can actually click.
        if (phase === null) return
        m.scale.setScalar((m.scale.x || 1) > 0 ? m.scale.x : 1)
        ;(m.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.3 * Math.sin(clock.elapsedTime * 3 + phase)
      })
      } else {
        activeGlow.visible = false
      }
      // Door swings + locked rattles.
      for (const rec of doorRecs) {
        if (rec.t !== rec.targetT) {
          rec.t += Math.sign(rec.targetT - rec.t) * dt * 2.2
          rec.t = Math.max(0, Math.min(1, rec.t))
          applyDoor(rec, rec.t)
        }
        if (rec.shake > 0) {
          rec.shake = Math.max(0, rec.shake - dt * 3)
          rec.hinge.rotation.y = Math.sin(rec.shake * 40) * 0.02 * rec.shake
        }
      }
      // Token glides.
      // Advance every skinned model's clock.
      tokensRef.current.forEach((entry) => entry.anim?.mixer.update(dt))

      // A cast in its windup: when the hand reaches the release frame, the
      // spell leaves it. The bone is looked up now rather than at press time
      // because the model may only just have finished loading.
      for (let i = pending.length - 1; i >= 0; i--) {
        const p = pending[i]
        p.wait -= dt
        if (p.wait > 0) continue
        pending.splice(i, 1)
        const bone = p.obj.getObjectByName(p.hand) ?? p.obj
        // The flipbook kit when it is switched on and knows this damage type;
        // the original sparks otherwise. Both satisfy VfxHandle, so the loop
        // below does not care which one it got.
        const kitType = kitVfxTypeFor(p.spell)
        /**
         * It landed: make the body answer for it.
         *
         * Hung off the effect's own impact rather than a timer, because only
         * the effect knows when it arrives — a dart lands sooner than a
         * Fireball, and a beam sooner than either.
         *
         * A creature already at 0 HP does not flinch. "hurt" is a ONE_SHOT
         * that hands the model back to its stance when it finishes, so
         * flinching a corpse would stand it up — the same trap the death
         * clip's HOLD_LAST exists to avoid.
         */
        /** One body answering for the impact: the flinch, or the defence. */
        const answerFor = (victimId: string, reaction: TokenState | null) => {
          // Remember what hit it, so if this is the blow that kills it, the
          // death can be made of the same stuff. Falls back to the spellbook
          // for types the kit does not draw (lightning), and to physical for
          // anything with no damage type at all — a weapon.
          lastHitBy.set(
            victimId,
            kitType ?? ((spellEntry(p.spell).damage as DamageType | undefined) ?? "physical"),
          )
          const victim = tokensRef.current.get(victimId)
          if (!victim?.anim || isDowned(victim.row)) return
          // WHAT THE TARGET DOES ABOUT IT.
          //
          // This used to be an unconditional flinch. The verdict now arrives
          // already turned into a motion this model can perform (see
          // reactionFor), and null is an honest answer: a heal, a fumble the
          // attacker earned on their own, or a model rigged with no dodge —
          // which stands still rather than borrowing the flinch, because a
          // miniature that recoils on a miss is lying to the table.
          if (!reaction) return
          // Steel turned aside and a shield taking a blow are their own
          // noises, on top of whatever the effect made arriving. A dodge is
          // not: the sound of not being there is the whiff already playing.
          if (reaction === "parry") playSfx("combat/parry_blade", { volume: 0.8 })
          else if (reaction === "block") playSfx("combat/block_shield", { volume: 0.8 })
          // THE RIG FIRST, THE BODY SECOND.
          //
          // playState returns null when the model has no clip for this state,
          // and until now that was the end of it: the target stood perfectly
          // still while a blade went past. Five of the six models on this
          // board have no dodge clip and two have no hit clip, so "stood
          // still" was the common case, not the edge.
          //
          // Falling back to the flinch would be worse - a miniature that
          // recoils on a miss is lying - so the fallback moves the BODY
          // instead: a short scripted lean and step, the same trick death-vfx
          // uses on a model with no death clip. It is replaced for free the
          // day a real clip exists, because this only runs when there is not
          // one.
          const played = playState(victim.anim, reaction, true)
          if (!played) {
            const m = defenceMotion({
              body: victim.obj,
              state: reaction,
              // Oriented away from whoever swung, so a dodge goes the right
              // way rather than an arbitrary one.
              from: p.obj?.position ?? null,
            })
            if (m) vfx.push(m)
          }
        }
        const flinch = () => {
          p.onLand?.()          // the bang, on the same frame as the flash
          if (p.victimId) answerFor(p.victimId, p.reaction)
          // EVERYONE IN THE SHAPE. An area effect lands on a square and the
          // impact handler used to stop there; the bodies standing on it were
          // nobody's business. Each one now takes its hit points (or its
          // SAVED) and its reaction on this frame, from the server's own
          // per-victim verdict. When the realtime row for the same damage
          // arrives a moment later, glideToken sees no change and draws no
          // second number.
          for (const v of p.victims ?? []) {
            applyCastOutcomeRef.current(v.id, { amount: v.amount, hit: v.amount > 0, heals: v.heals, word: v.word })
            answerFor(v.id, v.reaction)
          }
          // THE MARK IT LEAVES, on the same frame the shape resolves.
          //
          // Not on release, and not when the realtime rows land: on impact.
          // Painted at release, the scorch would appear while the bolt was
          // still in the air; painted later, the blast would clear and the
          // floor would light up a beat afterwards for no visible reason.
          // This is the frame the effect arrives and everyone in it answers,
          // so it is the frame the ground changes too.
          const visual = p.cells?.length ? areaVisualFor(p.spell) : null
          if (visual && p.cells && p.centre) {
            const mark = layAreaDecal({
              parent: scene,
              cells: p.cells,
              centre: p.centre,
              visual,
              cellToWorld: (x, y) => sqCentre(x, y),
              squareSize: SQ,
            })
            if (visual.lingers && p.casterTokenId) {
              // One concentration, one mark. Starting a new one ends the old,
              // which is the rule 5E already enforces on the caster.
              areaDecals.get(p.casterTokenId)?.end()
              areaDecals.set(p.casterTokenId, mark)
            }
            vfx.push(mark)
          }
        }
        // A swing spawns no effect: the contact frame IS the impact.
        if (p.swing) { flinch(); continue }
        vfx.push(
          kitType
            ? castSpellKitVfx({
                parent: scene,
                anchor: bone,
                type: kitType,
                target: p.target,
                camera,
                spell: p.spell,   // an attack-roll spell flies, whatever its type
                onImpact: flinch,
              })
            : castSpellVfx({
                parent: scene,
                anchor: bone,
                palette: paletteForSpell(p.spell),
                target: p.target,
                onImpact: flinch,   // lightning and weapons land too
              }),
        )
      }
      // A LINGERING MARK OUTLIVES ITS CASTER'S CONCENTRATION, NOT THEIR BODY.
      //
      // There is no concentration tracker in this codebase yet — only a sound
      // cue named for it — so the mark cannot be told directly that the spell
      // ended. What the board DOES know is when the caster goes down, and
      // that is how concentration most often breaks at the table: the wizard
      // holding the Web is knocked out and the web should go with them.
      //
      // Checked here rather than on the realtime row so it also covers a
      // token being removed outright. The map is empty on almost every frame.
      if (areaDecals.size) {
        for (const [casterId, mark] of areaDecals) {
          const caster = tokensRef.current.get(casterId)
          if (caster && !isDowned(caster.row)) continue
          mark.end()
          areaDecals.delete(casterId)
        }
      }
      for (let i = vfx.length - 1; i >= 0; i--) {
        if (vfx[i].update(dt)) continue
        // DISPOSE, not just drop.
        //
        // This spliced the handle out and left it at that, which leaks every
        // geometry, material and cloned texture a finished effect allocated —
        // silently, because a leak looks like nothing until an hour into a
        // session. Cheap to miss with a spark burst; not cheap with a
        // twenty-square blast mark, which owns up to six merged geometries
        // and six texture clones of its own and is what made this visible.
        vfx[i].dispose()
        vfx.splice(i, 1)
      }

      tokensRef.current.forEach((entry) => {
        // A floating thing floats: a slow bob and a lazy turn, from its own
        // phase so two hands do not move in lockstep.
        const fl = entry.obj.userData.float as { phase: number } | undefined
        if (fl) {
          const tt = clock.elapsedTime
          entry.obj.position.y = 0.05 + 0.07 * Math.sin(tt * 2.1 + fl.phase)
          entry.obj.rotation.y = 0.18 * Math.sin(tt * 0.9 + fl.phase)
        }
        const gl = entry.obj.userData.glide as { pts: THREE.Vector3[]; seg: number[]; total: number; s: number } | undefined
        // The dead stay dead: a body dragged across the board must not
        // stand up to walk, and must not be handed back to its stance.
        const down = isDowned(entry.row)
        if (!gl) {
          // Standing still: stance, unless mid-swing.
          if (!down && entry.anim && entry.anim.state === "walk") playState(entry.anim, "idle")
          return
        }
        if (entry.anim && !down) playState(entry.anim, "walk")
        // Constant pace along the whole route: a long walk takes longer,
        // which is what makes it a walk. ~2.2 squares/s ≈ a brisk 11 ft/s.
        gl.s = Math.min(gl.total, gl.s + dt * 2.2)
        let segIdx = 1
        while (segIdx < gl.seg.length - 1 && gl.seg[segIdx] < gl.s) segIdx++
        const a = gl.pts[segIdx - 1]
        const b = gl.pts[segIdx]
        const segLen = gl.seg[segIdx] - gl.seg[segIdx - 1]
        const f = segLen > 1e-6 ? (gl.s - gl.seg[segIdx - 1]) / segLen : 1
        entry.obj.position.lerpVectors(a, b, f)
        // Models WALK, feet on the floor. Only the plain pawn discs keep a
        // little hop, so their slide still reads as motion.
        entry.obj.position.y = entry.anim ? 0 : Math.sin(f * Math.PI) * 0.18
        // Face the way they are travelling — smoothly, leg by leg.
        const dir = new THREE.Vector3().subVectors(b, a)
        if (dir.lengthSq() > 1e-4) {
          const want = Math.atan2(dir.x, dir.z)
          let dyaw = want - entry.obj.rotation.y
          while (dyaw > Math.PI) dyaw -= Math.PI * 2
          while (dyaw < -Math.PI) dyaw += Math.PI * 2
          entry.obj.rotation.y += dyaw * Math.min(1, dt * 10)
        }
        if (gl.s >= gl.total) {
          delete entry.obj.userData.glide
          stopFootsteps(entry.row.id)
          entry.obj.position.y = 0
          if (entry.anim && !down) playState(entry.anim, "idle")
        }
      })
      // Embers rise, wander, and are reborn at the floor.
      //
      // GUARDED, and the guard is the fix for a dead /battle page: this loop
      // starts on mount, but the ember attribute exists only after build()
      // returns from Supabase. Every frame in that window touched
      // attributes.position.needsUpdate on an attribute that was not there —
      // a race the fast machine that wrote it never lost, and production did.
      const t = clock.elapsedTime
      if (!emberGeo.attributes.position) {
        renderer.render(scene, activeCam())
        return
      }
      for (let i = 0; i < EMBERS; i++) {
        emberPos[i * 3 + 1] += emberVel[i] * dt
        emberPos[i * 3] += Math.sin(t * 0.8 + emberSeed[i]) * dt * 0.12
        if (emberPos[i * 3 + 1] > 2.6) emberPos[i * 3 + 1] = 0.05
      }
      emberGeo.attributes.position.needsUpdate = true
      emberMat.opacity = 0.55 + Math.sin(t * 2.1) * 0.18   // firelight breathes
      torch.intensity = 38 + Math.sin(t * 7.3) * 4 + Math.sin(t * 13.1) * 2

      renderer.render(scene, activeCam())
    }
    tick()

    const onResize = () => {
      if (!mount) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      sizeOrtho()
      renderer.setSize(mount.clientWidth, mount.clientHeight)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(mount)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      cleanupRealtime?.()
      renderer.domElement.removeEventListener("mousedown", onDown)
      window.removeEventListener("mouseup", onUp)
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("keydown", onPanKeyDown)
      window.removeEventListener("keyup", onPanKeyUp)
      window.removeEventListener("blur", onPanBlur)
      renderer.domElement.removeEventListener("mousemove", onHoverMove)
      renderer.domElement.removeEventListener("mousemove", onHover)
      renderer.domElement.removeEventListener("click", onClick)
      refreshReachRef.current = () => {}
      // Any walk still in motion when the board goes away. Without this an
      // unmount mid-stride leaves a footstep loop running with nothing on
      // screen to explain it.
      for (const id of [...footsteps.keys()]) stopFootsteps(id)
      // Effects still running when the board goes away. Lingering ground
      // marks are the ones that matter: a Web holds its handle until the
      // concentration ends, which may be long after this component does.
      for (const v of vfx) v.dispose()
      vfx.length = 0
      areaDecals.clear()
      reachGeo.dispose()
      for (const m of [...moveMats, ...dashMats, overMat, denyMat, contourMoveMat, contourDashMat, denyEdgeMat]) m.dispose()
      PLATE.dispose()
      activeGlow.geometry.dispose()
      blood?.dispose()
      groundItems?.dispose()
      pmrem.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      tokensRef.current.clear()
      // A spell still in the air when the board goes away takes its
      // geometry and materials with it.
      vfx.forEach((v) => v.dispose())
      vfx.length = 0
      window.removeEventListener("keydown", onMoveKey)
      clearTargets()
      clearAffected()
      affectRingGeo.dispose()
      affectHarmMat.dispose()
      affectHelpMat.dispose()
      clearTemplate()
      aoeGeo.dispose()
      aoeMat.dispose()
      aoeDenyMat.dispose()
      targetRingGeo.dispose()
      pending.length = 0
      castRef.current = () => {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const combatAction = async (action: "start" | "next" | "end" | "npc-turn") => {
    if (combatBusy) return
    setCombatBusy(true)
    try {
      const res = await fetch("/api/combat", {
        method: "POST",
        headers: { "content-type": "application/json", ...dmHeaders() },
        body: JSON.stringify({ action, sandbox }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        say(data?.error ?? "The order would not hold.")
      } else {
        // Party-scoped cues relay themselves to the other seats (lib/sfx-cues),
        // so the whole table hears initiative roll and the turn pass, not only
        // whoever pressed the button. Total: a failure here cannot stop the
        // order going through.
        playCues(data?.sfxCues)
        // THE MONSTER'S SWING. Only this seat has the response; animate it
        // here and hand it to the other seats, which play it locally and
        // never relay (lib/combat-relay), so it cannot echo.
        if (action === "npc-turn") {
          const swing = parseSwing(data?.swing)
          if (swing) {
            swingRef.current(swing)
            relaySwing(swing)
          }
        }
      }
      return res.ok
    } catch {
      say("The order would not hold — the network blinked.")
      return false
    } finally {
      setCombatBusy(false)
    }
  }

  // ─── THE MONSTERS TAKE THEIR OWN TURNS ──────────────────────────────────
  //
  // Sam's ruling: "NPC action is not picked by the players or DM. It is
  // automatic." So when the order lands on something that is not a player
  // character, the DM's browser asks the server to decide and act, then
  // passes the turn on by itself.
  //
  // Only the DM's browser fires it. Every screen at the table is watching the
  // same combat_state over realtime, and four browsers racing to resolve one
  // goblin's attack would deal its damage four times. The DM's is the one
  // that holds the key, so the DM's is the one that acts.
  //
  // The beat before it moves is deliberate: an NPC turn that resolves in the
  // same frame the banner announces it reads as a glitch, not a monster.
  const npcTurnRef = useRef<string>("")
  useEffect(() => {
    if (!combat || combatBusy) return
    if (!getDmKey()) return
    const entry = combat.turn_order[combat.active_index]
    if (!entry || entry.kind !== "npc") return
    // One resolution per (fight, round, position) — realtime re-renders and
    // React strict-mode double-invocation must not double-swing.
    const stamp = `${combat.id}:${combat.round}:${combat.active_index}`
    if (npcTurnRef.current === stamp) return
    npcTurnRef.current = stamp
    const timer = window.setTimeout(async () => {
      const ok = await combatAction("npc-turn")
      if (ok !== false) await combatAction("next")
    }, 900)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat?.id, combat?.round, combat?.active_index, combatBusy])

  // While a spell is armed the school's windup loops. It stops the instant the
  // spell is thrown, cancelled, or the component unmounts — a windup still
  // humming after the fight ended is the kind of bug people remember longer
  // than the feature.
  useEffect(() => {
    if (!armedSpell) return
    // Steel has no windup to hum. A weapon arms silently and simply waits for
    // a target; only magic gets the rising note.
    const h = armedSpell.kind === "weapon"
      ? null
      : playSfx(windupFor(armedSpell.entry.school), { loop: true, volume: 0.55, fadeIn: 0.25 })
    windupRef.current = h
    // The visible half of the ramp: the caster holds the pose while choosing,
    // and everyone they could throw it at is ringed.
    // A SWORD DOES NOT HOLD ITS SWING WHILE YOU CHOOSE.
    //
    // The charge pose plays the cast clip on a loop, which for a weapon IS
    // the attack animation — so arming a melee attack made the character
    // visibly swing before a target had been picked or a die rolled.
    // Reported exactly that way: "when I hit attack/melee the animation for
    // attack starts. It should NOT start until AFTER I select and rolls are
    // made."
    //
    // Magic keeps it. A spell being charged is a held gesture that reads as
    // gathering rather than as striking, and it is what Sam asked for when
    // the two-phase cast was built. Steel simply waits.
    if (armedSpell.kind !== "weapon") chargeRef.current.start(armedSpell.tokenId)
    // Creature spells ring the bodies. Point spells draw a shape instead —
    // ringing every legal creature for a Fireball would say "pick one", which
    // is the opposite of what a Fireball asks.
    if (armedSpell.mode === "point") {
      // Drawn once at the caster's own feet so the shape is on screen before
      // the mouse moves. An area spell that shows nothing until you jiggle the
      // cursor reads as not having armed at all.
      const me = tokensRef.current.get(armedSpell.tokenId)
      if (me) {
        templateRef.current.show(
          armedSpell.tokenId, armedSpell.entry, me.row.grid_x ?? 0, me.row.grid_y ?? 0,
        )
      }
    } else {
      targetsRef.current.show(armedSpell.tokenId, armedSpell.entry.rangeFt, Boolean(armedSpell.entry.helpful))
    }
    const e = armedSpell.entry
    if (armedSpell.kind !== "weapon") {
      const packWarm = packSoundFor(armedSpell.name)
      preloadSfx([
        ...(packWarm ? [packKey(packWarm)] : [releaseFor(e.school)]),
        tailFor(e.school),
        ...(e.damage ? [impactFor(e.damage)] : []),
      ])
    }
    const onKey = (ev: KeyboardEvent) => {
      // Escape puts it away. Opening the wrong spell must not cost a turn.
      if (ev.key === "Escape") setArmedSpell(null)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      h?.stop(0.18)
      if (windupRef.current === h) windupRef.current = null
      // Cancelled, thrown, or unmounted — the pose must not be left held,
      // the rings must not outlive the choice, and the read-out must not be
      // left hanging over a board with nothing armed.
      chargeRef.current.stop()
      targetsRef.current.clear()
      templateRef.current.clear()
      affectedRef.current.clear()
      setHoverRead(null)
      // A disarmed spell cannot be thrown from a dialog that outlived it.
      // Escape puts the spell away; the floor's question goes with it.
      setPendingPoint(null)
      window.removeEventListener("keydown", onKey)
    }
  }, [armedSpell])

  // Ask the server to resolve a spell that has just been thrown.
  useEffect(() => {
    castVerbRef.current = async (caster_token, target_token, ability, crossSide) => {
      try {
        // `allow_cross_side` is the record of the player's consent. It is sent
        // as a strict boolean and only ever true off the confirm dialog, so a
        // stray or replayed POST without it still meets the server's fence.
        const res = await fetch("/api/combat", {
          method: "POST",
          headers: { "content-type": "application/json", ...dmHeaders() },
          body: JSON.stringify({ action: "cast", caster_token, target_token, ability, sandbox, allow_cross_side: crossSide === true }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          say(data?.error ?? "The strike would not resolve.")
          return { ok: false }
        }
        if (data?.resolved) {
          say(data.line as string)
          // The server is the only witness to the d20. Park its verdict so the
          // number that rises off the body a moment later can wear it.
          if (data.crit) critRef.current.add(target_token)
          // And its verdict on WHAT the damage was. The server has computed
          // this since the day weapons started carrying their type in the
          // damage string; the board simply never read the field. Without it
          // every arrow and every mace produced the same corpse, because the
          // sprite kit calls all of them "physical".
          if (typeof data.damageType === "string") {
            lastHitWithRef.current.set(target_token, data.damageType)
          }
          // THE ROGUE'S MOMENT. `combat/sneak_attack` was recorded with the
          // rest of the pack and had never once played, because until now
          // nothing on the wire could say a sneak attack had happened.
          //
          // Slightly behind the swing rather than on top of it: the blow
          // lands, and THEN you hear what it cost them. Played over the blow
          // it is one muddy noise.
          if (data.sneak === true) {
            window.setTimeout(() => playSfx(SNEAK_ATTACK, { volume: 0.95, rate: variedRate(0.03) }), 150)
          }
          // A weapon's impact is decided by the dice, not by the spell school:
          // the crunch only plays if it actually connected, and a miss gets
          // the whiff it earned. It is no longer played HERE, though — since
          // the board started asking before it animates, "here" is before
          // the arm has moved. The verdict is handed to performCast below and
          // the noise waits for the contact frame.
          // THE OUTCOME, ON THE BODY, NOW.
          //
          // Two reasons this cannot wait for the realtime echo:
          //
          // 1. Hit points must move the moment the server says they moved.
          //    Waiting for Postgres to broadcast leaves the plate reading a
          //    number the log has already contradicted.
          // 2. A zero is an OUTCOME, not an absence. "No damage was dealt"
          //    was reported as a bug when the truth was a save — Scott rolled
          //    20 against DC 13 and took nothing, correctly. Nothing on screen
          //    said so, and a correct save looked identical to a broken spell.
          //
          // A save or a miss now floats the word over the target, and real
          // damage lands on the token immediately. When the realtime row
          // arrives carrying the same hit points, glideToken sees no change
          // and draws no second number.
          applyCastOutcomeRef.current(target_token, {
            amount: Number(data.amount ?? 0),
            hit: data.hit !== false,
            heals: Boolean(data.heals),
            // The verdict's own word. The server reports hit = amount > 0 on
            // a save, so without this a clean save read as MISS.
            word: data.outcome === "saved" ? "saved"
              : data.outcome === "miss" || data.outcome === "fumble" ? "miss"
              : null,
          })
          // Real damage means the body answers for it. A save, a miss, or a
          // pure utility spell leaves the target standing — or, with the rest
          // of the verdict below, gets out of the way.
          const hurt = Number(data.amount ?? 0) > 0 && !data.heals
          // `outcome` and `margin` come from the widened cast response. An
          // older server omits them, and the target then has only `hurt` to
          // go on — flinch or stand — rather than a guessed dodge.
          const verdict = isAttackOutcome(data.outcome)
            ? { outcome: data.outcome, margin: typeof data.margin === "number" ? data.margin : 0 }
            : null
          return {
            ok: true,
            hurt,
            verdict,
            weapon: data.weapon
              ? {
                  hit: data.hit !== false,
                  crit: Boolean(data.crit),
                  // For a weapon attack the server's `dc` is the target's AC.
                  targetAc: typeof data.dc === "number" && data.dc > 0 ? data.dc : null,
                }
              : null,
          }
        }
        return { ok: true, hurt: false }
      } catch {
        say("The spell did not reach the server — nothing was spent.")
        return { ok: false }
      }
    }

    /**
     * The area cast, resolved server-side against everyone in the shape.
     *
     * Separate from castVerbRef because the answer has a different shape: not
     * "did it hit", but "who was standing in it, and what did each of them
     * roll". The log line the server builds names every one of them, which is
     * the whole readout an area spell owes the table.
     */
    castPointVerbRef.current = async (caster_token, gx, gy, ability) => {
      try {
        const res = await fetch("/api/combat", {
          method: "POST",
          headers: { "content-type": "application/json", ...dmHeaders() },
          body: JSON.stringify({ action: "cast", caster_token, target_x: gx, target_y: gy, ability, sandbox }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          say(data?.error ?? "The spell would not resolve.")
          return { ok: false }
        }
        // EVERY creature standing in the blast, tagged with what the blast
        // was made of — so five drow caught by one Fireball all burn, rather
        // than five identical generic corpses appearing on the flagstones.
        //
        // A single-target spell parks one word; an area spell parks one word
        // per victim. Same map, same spend, and glideToken clears each entry
        // as it draws that creature's death.
        if (typeof data?.damageType === "string" && Array.isArray(data.victims)) {
          for (const v of data.victims as Array<{ id?: string }>) {
            if (v?.id) lastHitWithRef.current.set(v.id, data.damageType)
          }
        }
        if (data?.line) {
          say(data.line as string)
        } else if (data?.area && Array.isArray(data.victims) && data.victims.length === 0) {
          say(`${ability} catches no one.`)
        }
        // Who was standing in it, with what each of them rolled. Empty for a
        // blast that caught nobody and for a utility area (Fog Cloud), both
        // of which still animate — the spell happened, it just hurt no one.
        return { ok: true, victims: parseVictims(data?.victims) }
      } catch {
        say("The spell did not reach the server — nothing was spent.")
        return { ok: false }
      }
    }
  }, [sandbox])

  /**
   * A summon's verb - move, use, dismiss - on its caster's action. Answers
   * are read, because a refusal ("the hand moves on its caster's turn") is
   * worth saying out loud where a silent no is a broken button.
   */
  const summonVerb = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/combat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "summon", ...body, sandbox }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) say(data?.error ?? "The hand did not answer.")
    } catch {
      say("That did not reach the table — check the connection.")
    }
  }
  summonVerbRef.current = summonVerb

  const playerVerb = async (body: Record<string, unknown>) => {
    try {
      await fetch("/api/combat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, sandbox }),
      })
    } catch {
      say("That did not reach the table — check the connection.")
    }
  }

  // Whose turn is it, and is it mine? The active entry names a TOKEN; the
  // token maps to a character; the character is mine if this browser claimed
  // them. Any missing link means no banner, which is the safe direction.
  const activeEntry = combat?.turn_order?.[combat.active_index] ?? null
  const activeCharacterId = activeEntry ? tokenToCharacter[activeEntry.token_id] : undefined
  const isMyTurn = Boolean(myCharacterId && activeCharacterId && myCharacterId === activeCharacterId)

  /**
   * THE RACK FOLLOWS THE TURN.
   *
   * `focusId` was set once, on the first sheet load, with `cur ?? …` — and
   * never again. So the action rack kept showing whoever was focused when the
   * board opened: Kenta's turn would come up, his plate would light green, his
   * initiative pip would advance, and the rack would still be offering Fifi's
   * spells. Pressing one armed a cast as the wrong character. Since PR #303 the
   * server refuses those, so the visible symptom is now an error toast rather
   * than a wrong result — better, but still the wrong rack.
   *
   * Follow the turn only for a browser that can actually ACT for the incoming
   * character: the DM, who may drive anyone, or the player who claimed them.
   * This is the same gate the reach overlay already uses. A spectating player
   * keeps their own sheet in front of them rather than being handed a rack of
   * spells the server would reject — and clicking a plate to inspect someone
   * still works, it simply does not survive the next turn change.
   */
  useEffect(() => {
    if (!activeCharacterId) return
    if (!dm && activeCharacterId !== myCharacterId) return
    setFocusId(activeCharacterId)
  }, [activeCharacterId, dm, myCharacterId])

  // A NEW TURN STARTS CLOSED.
  //
  // Movement is opened by clicking your miniature, so it has to shut again
  // when the turn moves on — otherwise the next combatant inherits an open
  // overlay they never asked for, and the one after that inherits the gold
  // band of somebody who has already walked.
  useEffect(() => {
    reachOpenRef.current = null
    refreshReachRef.current()
    // Combat ending makes active_index undefined, which fires this too — so
    // there is no separate status to watch, and the board's combat type does
    // not carry one anyway.
  }, [combat?.active_index, combat?.round])
  const activeSheet = sheets.find((c) => c.id === activeCharacterId)
  // "30 ft. (Walking)" -> 30. A sheet with prose speed still yields a budget.
  const speedFt = Number.parseInt(String(activeSheet?.speed ?? "30").replace(/[^0-9]/g, ""), 10) || 30
  // The scene's reach overlay reads speed through a ref; repaint when the
  // active character (and so their speed) changes.
  useEffect(() => {
    speedFtRef.current = speedFt
    refreshReachRef.current()
  }, [speedFt])

  // The player's walk, server-checked: the API verifies whose turn it is
  // and the budget, moves the token, and returns the spent economy. The
  // glide (and the walking animation) arrives by the vtt_tokens realtime
  // echo, same as every other move on this board.
  playerMoveRef.current = (tokenId, gx, gy, feet, dash) => {
    // Shut the overlay's mouth until the server has answered. See
    // moveInFlightRef — the realtime token row and this reply race, and the
    // row carries no economy, so a repaint triggered by it paints the budget
    // this move has already spent.
    moveInFlightRef.current = true
    void (async () => {
      try {
        const res = await fetch("/api/combat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "move", token_id: tokenId, gx, gy, feet, dash, sandbox }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          say(data?.error ?? "The move did not take.")
          moveInFlightRef.current = false
          refreshReachRef.current() // repaint what is still true
          // The server already worked out whether a Dash would have covered
          // it, and says so. Offering the confirm turns a dead end into the
          // choice it actually is, rather than leaving the player to guess
          // that the square was reachable for the price of their action.
          if (data?.dash_would_reach) {
            setPendingDash({ feet, commit: () => playerMoveRef.current(tokenId, gx, gy, feet, true) })
          }
          return
        }
        // The reply is the authority on what is left. Clear the flag FIRST,
        // then hand over the new turn_state, so the repaint that follows reads
        // the budget after this move rather than before it.
        moveInFlightRef.current = false
        if (data?.turn_state) {
          setCombat((c) => (c ? { ...c, turn_state: data.turn_state } : c))
        } else {
          // No economy came back — repaint anyway rather than leaving the
          // floor dark, since setCombat is what would otherwise have done it.
          refreshReachRef.current()
        }
      } catch {
        say("That did not reach the table — check the connection.")
        moveInFlightRef.current = false
        refreshReachRef.current()
      }
    })()
  }

  // The initiative rail should list only combatants ACTUALLY on this map.
  // turn_order is authoritative for ORDER, but a combatant whose token has
  // been hidden or removed must not keep a slot — the rail would show a ghost
  // the board no longer draws, and Sam asked that an absent/unseated character
  // carry neither a plate nor an initiative pip. tokensRef holds exactly the
  // visible tokens (a non-visible one is deleted before it ever registers),
  // so membership there IS presence. Preserve the active highlight by TOKEN
  // id rather than index, so filtering can never desync whose turn it is.
  // Guard the first frame, before any token has spawned: show the raw order
  // rather than an empty rail.
  const rawTurnOrder = combat?.turn_order ?? []
  const rawActiveIndex = combat?.active_index ?? 0
  const activeTokenId = rawTurnOrder[rawActiveIndex]?.token_id
  const presentTokens = tokensRef.current
  const shownTurnOrder = presentTokens.size
    ? rawTurnOrder.filter((e) => presentTokens.has(e.token_id))
    : rawTurnOrder
  const shownActiveIndex = Math.max(0, shownTurnOrder.findIndex((e) => e.token_id === activeTokenId))

  return (
    // ABSOLUTE, not h-full. The stage container already holds a full-height
    // scene <img>; a static child after it lays out BELOW that image and is
    // clipped by the container's overflow-hidden. The board rendered fine on
    // its first deploy — one viewport-height of blackness under the fold,
    // where nobody could see it. Position over the stage like MapPanel does.
    <div className="absolute inset-0 z-10 overflow-hidden bg-[#020204]">
      <div ref={mountRef} className="absolute inset-0" />

      {/* Diablo's frame: the screen itself darkens toward its corners. */}
      <div
        className="pointer-events-none absolute inset-0 z-[5]"
        style={{ background: "radial-gradient(ellipse at center, transparent 52%, rgba(2,2,6,0.55) 82%, rgba(2,2,6,0.85) 100%)" }}
      />

      {/* HUD, in the game's own dress rather than the dev viewer's */}
      {/* Board controls. They used to sit at left-3 top-3 - the SAME corner as
          the character plates - so the hint text and the darkness button
          rendered straight through Scott's card. That was the clutter. The
          board's own chrome belongs out of the plates' column entirely. */}
      <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[260px] rounded border border-[#3a3345] bg-black/70 px-2.5 py-1.5">
        {status && <div className="font-mono text-[10px] text-[#8a8678]">{status}</div>}
        <div className="text-[9px] leading-relaxed text-[#7a7568]">
          drag or arrows · wheel zoom · click a door
          {dm && dmMove && <span className="text-[#9a7fc0]"> · token then square to move</span>}
          {/* The hint has to name the FIRST step now. "Click a yellow square"
              was true only once the squares existed, and they no longer paint
              themselves — so for a player whose turn had just begun it named
              something that was not on screen yet. */}
          {isMyTurn && (
            <span className="text-[#f3c94b]">
              {" · your turn — press M, or click your miniature or plate, to move"}
            </span>
          )}
        </div>
        {/* The buttons that used to sit here have moved into the board's
            control bar, top right. Three clusters of chrome in three corners
            was the clutter Sam asked to clear; this corner keeps only the
            hint text, which is prose about what you are doing rather than a
            control you go looking for. */}
      </div>

      {selected && (
        <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded border border-[#5a4a6a] bg-black/80 px-4 py-2 text-center">
          <div className="font-serif text-[13px] text-[#e0d0f0]">{selected.label}</div>
          {selected.hp_max ? (
            <div className="font-mono text-[10px] text-[#9ab0d0]">
              {selected.hp_current ?? selected.hp_max} / {selected.hp_max} HP
            </div>
          ) : null}
          <div className="mt-0.5 text-[9px] text-[#8a8678]">
            {dm ? (dmMove ? "click a square to move · click again to deselect" : "DM move is off — toggle it to reposition") : "on your turn, yellow squares are yours to walk"}
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute bottom-14 left-1/2 z-10 -translate-x-1/2 rounded border border-[#c9a227] bg-black/85 px-4 py-1.5 text-[12px] text-[#e8e2d0]">
          {toast}
        </div>
      )}

      {/* What the hovered square costs. Bottom-centre, clear of the cursor
          read-out, which owns the same moment when a spell is armed. */}
      {moveHint && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded border border-[#8a6d2f] bg-black/75 px-2.5 py-0.5 font-mono text-[10px] text-[#ffe28a]">
          {moveHint}
        </div>
      )}

      {/* Location name, D2 style: gold gothic caps, top right, unadorned. */}
      {/* z-30: this block must sit ABOVE the HUD (z-20) — the combat log
          used to render on top of the SCENE button, burying the only exit. */}
      <div className="pointer-events-none absolute right-3 top-3 z-30 text-right">
        <div className="max-w-[220px] truncate font-serif text-[12px] font-semibold uppercase tracking-[0.24em] text-[#d8b25a] [text-shadow:0_1px_3px_#000,0_0_14px_#00000088]">
          {(mapName || "").replace(/\s*[—(].*$/, "").trim() || "The Underdark"}
        </div>
        {/* THE CONTROL BAR.
            One row, one corner. The board's chrome used to be spread across
            three: the camera and darkness toggles bottom-left inside the hint
            box, the combat log nailed down the right edge covering a third of
            the dungeon, and the exit up here on its own. Every one of them is
            a thing you reach for occasionally and look at never, so they now
            live together and the board keeps its floor.

            Short labels rather than icons: a gothic glyph set would need art,
            and four letters read correctly the first time without one. */}
        <div className="pointer-events-auto mt-1.5 flex justify-end gap-1">
          <BoardBtn on={showLog} onClick={() => setShowLog((v) => !v)} title="Combat log">LOG</BoardBtn>
          <BoardBtn on={classicCam} onClick={() => setClassicCam((v) => !v)} title={classicCam ? "Classic camera — click for free look" : "Free camera — click for classic"}>
            {classicCam ? "CLSC" : "FREE"}
          </BoardBtn>
          {dm && (
            <BoardBtn on={darknessOn} onClick={() => setDarknessOn((v) => !v)} title={darknessOn ? "Darkness on — click to lift" : "Darkness lifted — click to lower"}>
              DARK
            </BoardBtn>
          )}
          {dm && (
            <BoardBtn on={dmMove} onClick={() => setDmMove((v) => !v)} title="DM free move: click a token, then a square">
              MOVE
            </BoardBtn>
          )}
          {onBack && (
            <BoardBtn onClick={onBack} title="Back to the scene">← SCENE</BoardBtn>
          )}
        </div>
      </div>

      {/* THE DASH CONFIRM.
          An azure square is reachable only by spending your action, and that
          is a real cost — a Dash you did not mean to take is a turn you cannot
          get back. So the board asks, naming the price plainly, before it
          sends anything. Escape or CANCEL leaves the turn untouched. */}
      {pendingDash && (
        <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-[290px] border border-[#2f7fd6] bg-[#0b0d12]/95 p-4 font-mono shadow-[0_0_28px_#2f7fd655]">
            <div className="text-[10px] tracking-[0.2em] text-[#7ab8ff]">DASH</div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#d8e4f2]">
              That square is {pendingDash.feet} ft away — past your walk. Reaching it spends your{" "}
              <span className="text-[#f3c94b]">action</span> for the turn.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const p = pendingDash
                  setPendingDash(null)
                  p.commit()
                }}
                className="flex-1 border border-[#2f7fd6] bg-[#12314f] px-3 py-1.5 text-[10px] tracking-wider text-[#cfe4ff] hover:bg-[#194570]"
              >
                DASH
              </button>
              <button
                onClick={() => setPendingDash(null)}
                className="flex-1 border border-[#4a4034] bg-black/60 px-3 py-1.5 text-[10px] tracking-wider text-[#b6a888] hover:border-[#6b5123]"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THE CROSS-SIDE CONFIRM.
          A violet ring said the click would ask, and this is the asking. A
          heal on a hostile or a harm on your own is allowed — Sam's ruling —
          but it is a decision, so the board names the body and the spell and
          waits. CANCEL leaves the spell armed and the turn untouched; the
          rings are still lit and the next click is still the throw. */}
      {pendingCross && (
        <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-[290px] border border-[#b47dff] bg-[#0b0d12]/95 p-4 font-mono shadow-[0_0_28px_#b47dff55]">
            <div className="text-[10px] tracking-[0.2em] text-[#d3b3ff]">ACROSS THE LINE</div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#d8e4f2]">
              {pendingCross.kind === "foe" ? (
                <>
                  <span className="text-[#f3c94b]">{pendingCross.target}</span> is not one of yours.{" "}
                  {pendingCross.spell} will help them anyway.
                </>
              ) : (
                <>
                  <span className="text-[#f3c94b]">{pendingCross.target}</span> is on your side.{" "}
                  {pendingCross.spell} will hurt them anyway.
                </>
              )}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const p = pendingCross
                  setPendingCross(null)
                  p.commit()
                }}
                className="flex-1 border border-[#b47dff] bg-[#2a1a4a] px-3 py-1.5 text-[10px] tracking-wider text-[#ecdcff] hover:bg-[#3a2566]"
              >
                {pendingCross.verb}
              </button>
              <button
                onClick={() => setPendingCross(null)}
                className="flex-1 border border-[#4a4034] bg-black/60 px-3 py-1.5 text-[10px] tracking-wider text-[#b6a888] hover:border-[#6b5123]"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* THE FLOOR CONFIRM.
          A square, not a body. A floor click is also how you walk, so with a
          point spell armed the board asks before it throws anything — naming
          the spell, the distance, and anyone of your own standing in the
          blast. Ember, the template's own colour: this is the outline asking.
          CANCEL leaves the spell armed and the turn untouched; the template
          still follows the cursor and the next click is still the throw. */}
      {pendingPoint && (
        <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-black/55 backdrop-blur-[2px]">
          <div className="w-[290px] border border-[#e07038] bg-[#0b0d12]/95 p-4 font-mono shadow-[0_0_28px_#e0703855]">
            <div className="text-[10px] tracking-[0.2em] text-[#ffb27a]">AT THE FLOOR</div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#d8e4f2]">
              {pendingPoint.spell} at that square, {pendingPoint.feet} ft away.
              {pendingPoint.caught.length > 0 && (
                <>
                  {" "}It will also catch{" "}
                  <span className="text-[#f3c94b]">{pendingPoint.caught.join(", ")}</span>
                  {pendingPoint.mine ? " — including you" : ""}.
                </>
              )}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  const p = pendingPoint
                  setPendingPoint(null)
                  p.commit()
                }}
                className="flex-1 border border-[#e07038] bg-[#4a2412] px-3 py-1.5 text-[10px] tracking-wider text-[#ffe0c8] hover:bg-[#66311a]"
              >
                THROW
              </button>
              <button
                onClick={() => setPendingPoint(null)}
                className="flex-1 border border-[#4a4034] bg-black/60 px-3 py-1.5 text-[10px] tracking-wider text-[#b6a888] hover:border-[#6b5123]"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      <TurnBanner
        active={Boolean(combat)}
        isMine={isMyTurn}
        dm={dm}
        characterName={activeSheet?.name ?? activeEntry?.label ?? ""}
        economy={combat?.turn_state ?? {}}
        speedFt={speedFt}
        onAcknowledge={() => void playerVerb({ action: "ack" })}
        onSpend={(kind) => void playerVerb({ action: "spend", kind })}
      />

      {/* The full HUD: plates, initiative rail, log, globes, ability rack. */}
      <CombatHud
        characters={sheets}
        summons={summons}
        summonMove={summonMove}
        onSummon={(op: "move" | "use" | "dismiss", tokenId: string, what?: HandUse) => {
          if (op === "move") {
            setSummonMove(tokenId)
            say("Click a square within 30 ft of the hand — Escape to cancel.")
            return
          }
          void summonVerb(op === "use" ? { op, token_id: tokenId, what } : { op, token_id: tokenId })
        }}
        tokenToCharacter={tokenToCharacter}
        tokenPortrait={tokenPortrait}
        tokenConditions={tokenConditions}
        turnOrder={shownTurnOrder}
        activeIndex={shownActiveIndex}
        round={combat?.round ?? 1}
        log={log}
        dm={dm}
        onEndTurn={() => void combatAction("next")}
        focusId={focusId}
        // Clicking a plate still focuses it — that is how you read someone
        // else's slots. It ALSO opens movement when the plate you clicked
        // belongs to the character whose turn it is, which is the third door
        // into the same room (board click and M are the other two).
        onFocus={(id) => {
          setFocusId(id)
          const why = toggleReachRef.current(id)
          if (why === "no-claim") {
            say("This browser is not driving that character — claim them, or unlock as DM.")
          }
        }}
        // The rack tells us who cast it. Deriving it here from focusId is how
        // the wrong miniature ended up animating.
        // A press ARMS the spell. Only things with nobody to point at go off
        // at once — making a player click themselves to Dodge would be
        // theatre without meaning.
        onCast={(characterId, ability, kind, rackEntry) => {
          // HIDE IS A VERB, NOT A SPELL. It resolves entirely on the server —
          // a Stealth roll against every onlooker's passive Perception — and
          // has nothing to arm and nothing to throw, so it leaves before any
          // of the targeting machinery below sees it.
          if (kind === "action" && ability.trim().toLowerCase() === "hide") {
            const mine = Array.from(tokensRef.current.values()).find((t) => t.row.character_id === characterId)
            if (!mine) { say("That character has no miniature on this board."); return }
            void (async () => {
              const res = await fetch("/api/combat", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "hide", token_id: mine.row.id, sandbox }),
              })
              const data = await res.json().catch(() => null)
              if (!res.ok) { say(data?.error ?? "The hide did not take."); return }
              // The server already wrote the line into the log; this is the
              // toast, which is the half the player is looking at.
              say(data?.line ?? (data?.hidden ? "Gone." : "Seen."))
              playCues(data?.sfxCues)
            })()
            return
          }
          // THE RACK'S ENTRY WINS.
          //
          // spellEntry() is the right answer for a spell and the wrong one for
          // a weapon: no weapon is in the spellbook, so every one of them fell
          // through to DEFAULT_ENTRY — target "creature", range SIXTY FEET.
          // Reported as a punch that offered a downed ally on the far side of
          // the room as a legal target, and it would have done the same for a
          // mace. The rack parsed the weapon's real reach when it built the
          // button; this just stops throwing that away.
          const e = rackEntry ?? spellEntry(ability)
          if (kind === "action" || e.target === "self" || e.target === "none") {
            castRef.current(characterId, ability, kind)
            return
          }
          // Resolve the caster's token HERE, once, while we know exactly whose
          // rack was pressed — and carry it. The release then moves that
          // figure and no other.
          const mine = Array.from(tokensRef.current.values()).find((t) => t.row.character_id === characterId)
          if (!mine) {
            say("That character has no miniature on this board.")
            return
          }
          // A weapon always wants a body. Everything else asks the spellbook:
          // `point` spells are aimed at the FLOOR, and treating them as
          // creature spells is what made Mage Hand impossible to cast.
          const mode: "creature" | "point" =
            kind !== "weapon" && e.target === "point" ? "point" : "creature"
          setArmedSpell({ characterId, tokenId: mine.row.id, name: ability, kind, entry: e, mode })
          say(
            mode === "point"
              ? `${ability} — choose a spot${e.rangeFt ? ` within ${e.rangeFt} ft` : ""}.`
              : `${ability} — choose a target${e.rangeFt ? ` within ${e.rangeFt} ft` : ""}.`,
          )
        }}
        showLog={showLog}
        armedSpell={armedSpell ? { name: armedSpell.name, rangeFt: armedSpell.entry.rangeFt, mode: armedSpell.mode } : null}
        onCancelArm={() => setArmedSpell(null)}
      />

      {/* Before the dice: the one button that starts a fight. Sits under the
          initiative rail's place so it never overlaps the rail once rolled. */}
      {!combat && dm && (
        <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2">
          <button
            disabled={combatBusy}
            onClick={() => void combatAction("start")}
            className="rounded-sm border-2 border-[#6b5123] bg-gradient-to-b from-[#2a1f10] to-[#120c06] px-5 py-2 font-serif text-[11px] uppercase tracking-[0.2em] text-[#f0cd7a] shadow-[0_2px_0_#000] hover:border-[#c99a49] hover:text-[#fff3cf] disabled:opacity-40"
          >
            ⚔ Roll Initiative
          </button>
        </div>
      )}
      {combat && dm && (
        <div className="absolute bottom-3 right-3 z-30">
          <button
            disabled={combatBusy}
            onClick={async () => {
              // Ending the fight is also leaving it: once the end sticks, the
              // table's next scene is the dashboard, so take the DM there.
              // (The fight being over means the live-fight redirect stays
              // quiet — no bounce back.)
              if (await combatAction("end")) onBack?.()
            }}
            className="rounded-sm border border-[#4a3a2a] bg-black/70 px-3 py-1 text-[9px] uppercase tracking-wider text-[#a89468] hover:border-[#8b6427] disabled:opacity-40"
          >
            End Combat
          </button>
        </div>
      )}

      {/* THE READ-OUT. What this click would actually do, before you make it:
          the chance to hit, or the save and its DC, or why it cannot be done.
          Follows the cursor and never eats the click. */}
      {hoverRead && (
        <div
          className="pointer-events-none absolute z-40"
          style={{ left: hoverRead.x + 16, top: hoverRead.y + 14 }}
        >
          <div
            className={
              "rounded-sm border bg-black/85 px-2.5 py-1.5 shadow-[0_2px_8px_#000] " +
              (hoverRead.ok ? "border-[#6b5123]" : "border-[#4a3a2a]")
            }
          >
            <div className="font-serif text-[11px] uppercase tracking-[0.16em] text-[#e8d9ae]">
              {hoverRead.label}
            </div>
            <div
              className={
                "mt-0.5 font-mono text-[11px] " +
                (hoverRead.ok ? "text-[#f0cd7a]" : "text-[#8a7f6a]")
              }
            >
              {hoverRead.line}
            </div>
          </div>
        </div>
      )}

      {/* A selected ENEMY gets the red gothic nameplate, top centre. */}
      {selected && !selected.character_id && (
        <div className={"pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 text-center " + (combat ? "top-24" : "top-16")}>
          <div className="font-serif text-[15px] font-bold uppercase tracking-[0.2em] text-[#c23b2e] [text-shadow:0_1px_3px_#000]">
            {selected.label}
          </div>
          {selected.hp_max ? (
            <div className="mx-auto mt-1 h-1.5 w-44 overflow-hidden rounded-sm border border-[#4a1512] bg-[#160705]">
              <div
                className="h-full bg-gradient-to-r from-[#7a1410] to-[#c23b2e]"
                style={{ width: `${Math.max(0, Math.min(100, ((selected.hp_current ?? selected.hp_max) / selected.hp_max) * 100))}%` }}
              />
            </div>
          ) : null}
        </div>
      )}

    </div>
  )
}
