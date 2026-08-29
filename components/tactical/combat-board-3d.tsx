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
  ONE_SHOT,
  type CastHand,
  type TokenState,
} from "@/lib/token-animation"
import { castSpellVfx, paletteForSpell, type VfxHandle } from "./spell-vfx"
import { castSpellKitVfx, kitVfxTypeFor, prewarmKit } from "./spell-vfx-kit"
import { spellEntry, type SpellEntry } from "@/lib/spellbook"
import { playSfx, windupFor, releaseFor, tailFor, impactFor, preloadSfx, type PlayHandle } from "@/lib/sfx"
import { dmHeaders, getDmKey, onDmKeyChange } from "@/lib/dm-key"

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
  meta: { node?: number; art_url?: string; cells_url?: string } | null
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
  is_visible: boolean
  hp_current: number | null
  hp_max: number | null
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
  const reachRef = useRef<{ tokenId: string; cells: Map<string, { cost: number }> } | null>(null)
  const refreshReachRef = useRef<() => void>(() => {})
  const playerMoveRef = useRef<(tokenId: string, gx: number, gy: number, feet: number) => void>(() => {})
  const moveTokenRef = useRef<(id: string, x: number, y: number) => void>(() => {})
  /** The HUD's ability bar reaches the scene through here, the same way
   *  moves do. Set inside the scene effect; a no-op until the board is up. */
  const castRef = useRef<(characterId: string, ability: string, kind: string) => void>(() => {})
  // THE ARMED SPELL. Sam: a press should "allow me to target some which
  // starts up the ramp up animation, and when I click on the target, executes
  // the animation and sounds involved." So a press no longer fires — it ARMS.
  // The windup loops, the legal targets light, and the click is the throw.
  const [armedSpell, setArmedSpell] = useState<
    { characterId: string; tokenId: string; name: string; kind: string; entry: SpellEntry } | null
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
  const targetsRef = useRef<{ show: (t: string, r: number, h: boolean) => void; clear: () => void }>({ show: () => {}, clear: () => {} })
  const castVerbRef = useRef<(caster: string, target: string, ability: string) => Promise<void>>(async () => {})

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
            setSelected((cur) => (cur?.id === id ? null : entry.row))
            return
          }
        }
      }

      // 2. A door?
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

      // 3. The floor — a move order.
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
        // Ship the route first, so every board (this one included) walks
        // the real path when the move lands.
        sendWalkPath(reach.tokenId, pathCells(cellKey))
        playerMoveRef.current(reach.tokenId, gx, gy, reach.cells.get(cellKey)!.cost * 5)
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
      g.add(ring)

      if (row.hp_max && row.hp_max > 0) {
        const frac = Math.max(0, Math.min(1, (row.hp_current ?? row.hp_max) / row.hp_max))
        const arc = new THREE.Mesh(
          new THREE.RingGeometry(r * 1.22, r * 1.38, 40, 1, Math.PI / 2, -frac * Math.PI * 2),
          new THREE.MeshBasicMaterial({ color: hpColor(frac), transparent: true, opacity: 0.95, side: THREE.DoubleSide }),
        )
        arc.rotation.x = -Math.PI / 2
        arc.position.y = 0.065
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
      const once = ONE_SHOT.includes(state)
      next.reset()
      next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity)
      next.clampWhenFinished = once
      next.fadeIn(0.18).play()
      if (anim.current && anim.current !== next) anim.current.fadeOut(0.18)
      anim.current = next
      anim.state = state
      if (once) {
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

    // ── CASTING ────────────────────────────────────────────────────────────
    // Live effects, advanced by the same clock as everything else. A cast
    // that is still in the air when the board unmounts is disposed with it.
    const vfx: VfxHandle[] = []
    /** Casts waiting for their release frame — the spell has not left the
     *  hand yet, because the hand has not got there yet. */
    const pending: { wait: number; obj: THREE.Object3D; hand: CastHand; spell: string; target: THREE.Vector3 | null }[] = []

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
    ) => {
      const plan = castPlanFor(ability, kind)
      if (!plan) return // Dash and friends animate nothing
      let found = explicitToken
      if (!found) {
        for (const e of Array.from(tokensRef.current.values())) {
          if (e.row.character_id === characterId) { found = e; break }
        }
      }
      if (!found) return
      // Say out loud which figure is about to move. When the wrong one does,
      // this line names it instead of leaving us to guess.
      console.log(`[cast] ${ability} → token "${found.row.label}" (character ${characterId.slice(0, 8)}…, model ${String(found.row.model_url ?? "none").split("/").pop()})`)
      const anim = found.anim
      if (!anim) return // a disc pawn has nothing to animate

      const explicit = plan.state === "cast" ? castClipFor(plan.weight, anim.names) : null
      const clip = playState(anim, plan.state, true, explicit)
      if (!clip) return
      if (plan.state === "hurt") return // Dodge is a flinch, not a spell

      // Only magic throws light. "Attack" resolves to a cast clip for a
      // caster — Kenta's attack IS an Eldritch Blast — but for a martial it
      // resolves to a sword swing, and a swing must not emit arcane sparks.
      const isSpell = plan.state === "cast" || /spell|cast|soell/i.test(clip.name)
      if (!isSpell) return

      // Where it is thrown: the selected token if it is someone else, so a
      // bolt actually flies at the target the DM has picked. Nothing
      // selected — or the caster selected — and it is just a discharge.
      const sel = selectedRef.current
      let target: THREE.Vector3 | null = null
      if (sel && sel.id !== found.row.id) {
        const t = tokensRef.current.get(sel.id)
        if (t) target = new THREE.Vector3(t.obj.position.x, 1.1, t.obj.position.z)
      }

      const { release, hand } = castEventFor(clip.name, clip.duration)
      pending.push({ wait: release, obj: found.obj, hand, spell: ability, target })
      // Pull this type's sheets during the windup, so the first cast of a
      // spell looks like every later one rather than arriving half-loaded.
      const warm = kitVfxTypeFor(ability)
      if (warm) prewarmKit(warm)

      // SOUND. The school gives the spell its voice; the damage type decides
      // what the target hears when it lands. Both come off the spellbook, so
      // a new spell is one row of data rather than a code change.
      const sEntry = spellEntry(ability)
      playSfx(releaseFor(sEntry.school), { volume: 0.85 })
      window.setTimeout(() => playSfx(tailFor(sEntry.school), { volume: 0.5 }), 260)
      if (sEntry.damage && target) {
        // The bang belongs on the flash, not ahead of it: the VFX mote flies
        // at 26 units/sec, so the impact waits for it to arrive.
        const dist = target.distanceTo(found.obj.position)
        const dmg = sEntry.damage
        window.setTimeout(() => playSfx(impactFor(dmg), { volume: 0.9 }), Math.min(1400, (dist / 26) * 1000 + 120))
      }
    }
    castRef.current = performCast

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
      // Out of range says so. A button that was pressed and produced silence
      // is indistinguishable from a broken one.
      const squares = Math.max(
        Math.abs((shooter.row.grid_x ?? 0) - (victim.row.grid_x ?? 0)),
        Math.abs((shooter.row.grid_y ?? 0) - (victim.row.grid_y ?? 0)),
      )
      if (armed.entry.rangeFt > 0 && squares * 5 > armed.entry.rangeFt) {
        say(`${armed.name} reaches ${armed.entry.rangeFt} ft — ${victim.row.label} is ${squares * 5} ft away.`)
        return
      }
      windupRef.current?.stop(0.08)
      windupRef.current = null
      stopCharge()
      clearTargets()
      setSelected(victim.row)
      // Cast from the token we locked, not from a fresh search.
      performCast(shooter.row.character_id as string, armed.name, armed.kind, shooter)
      setArmedSpell(null)
      // And let the server say what it did. The animation is already playing;
      // the dice are rolled where they cannot be argued with, and the result
      // arrives in the same combat log everyone at the table is reading.
      void castVerbRef.current(shooter.row.id, victim.row.id, armed.name)
    }
    releaseAtRef.current = releaseAt

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

      if (row.model_url) {
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
          obj.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh && mesh.material) {
              mesh.castShadow = mesh.receiveShadow = true
              const m = mesh.material as THREE.MeshStandardMaterial
              if (m.map) {
                // COLOUR SPACE FIRST. A base-colour texture read as linear
                // renders washed and muddy — this is the single biggest
                // cause of "the colours are off" on imported models, and it
                // costs nothing to assert rather than assume the loader
                // guessed right.
                m.map.colorSpace = THREE.SRGBColorSpace

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
            playState(anim, "idle", true)
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
      if (before.hp_current !== row.hp_current || before.hp_max !== row.hp_max || before.is_visible !== row.is_visible || before.tint_color !== row.tint_color) {
        spawnToken(row)
        return
      }
      const c = sqCentre(row.grid_x, row.grid_y)
      // Walk the broadcast route when one arrived for this move; otherwise a
      // straight line. Either way the model WALKS it at ground level, at a
      // constant pace — distance decides duration, not a fixed timer.
      const stash = walkPaths.get(row.id)
      walkPaths.delete(row.id)
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
      redrawDarkness() // the torch travels with its bearer
    }

    // ---- the DM's move order ----------------------------------------
    moveTokenRef.current = (id, gx, gy) => {
      const entry = tokensRef.current.get(id)
      if (!entry) return
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
    // LEGAL TARGETS. While a spell is armed, everything it could be thrown at
    // wears a ring: red for a spell that harms, green for one that helps, so
    // a healer never has to read a tooltip to find out who they can save.
    const targetGroup = new THREE.Group()
    scene.add(targetGroup)
    const targetRingGeo = new THREE.RingGeometry(0.62, 0.86, 44)
    const hostileMat = new THREE.MeshBasicMaterial({ color: 0xff5a44, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    const helpfulMat = new THREE.MeshBasicMaterial({ color: 0x53e07a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })

    const clearTargets = () => {
      while (targetGroup.children.length) targetGroup.remove(targetGroup.children[0])
    }

    /** Ring every token this spell could legally be thrown at. */
    const showTargets = (casterTokenId: string, rangeFt: number, helpful: boolean) => {
      clearTargets()
      const me = tokensRef.current.get(casterTokenId)
      if (!me) return
      tokensRef.current.forEach((t) => {
        if (t.row.id === casterTokenId) return
        if ((t.row.hp_current ?? 1) <= 0) return
        const squares = Math.max(
          Math.abs((me.row.grid_x ?? 0) - (t.row.grid_x ?? 0)),
          Math.abs((me.row.grid_y ?? 0) - (t.row.grid_y ?? 0)),
        )
        if (rangeFt > 0 && squares * 5 > rangeFt) return
        const ring = new THREE.Mesh(targetRingGeo, helpful ? helpfulMat : hostileMat)
        ring.rotation.x = -Math.PI / 2
        ring.position.set(t.obj.position.x, 0.09, t.obj.position.z)
        ring.scale.setScalar(radiusFor(t.row.token_size) / 0.75)
        ring.userData.pulse = Math.random() * Math.PI * 2
        targetGroup.add(ring)
      })
    }
    targetsRef.current = { show: showTargets, clear: clearTargets }

    const reachMat = new THREE.MeshBasicMaterial({ color: 0xf3c94b, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide })
    // The path is a RIBBON, not a hairline — THREE.Line renders one pixel
    // whatever you ask for, so the ornate version is built from flat quads:
    // a gold band laid square-centre to square-centre, a small diamond stud
    // at each step, and a layered diamond seal on the destination.
    const pathGroup = new THREE.Group()
    pathGroup.visible = false
    scene.add(pathGroup)
    const ribbonGeo = new THREE.PlaneGeometry(1, 0.15)
    const studGeo = new THREE.PlaneGeometry(0.16, 0.16)
    const sealOuterGeo = new THREE.PlaneGeometry(0.44, 0.44)
    const sealInnerGeo = new THREE.PlaneGeometry(0.3, 0.3)
    const sealCoreGeo = new THREE.PlaneGeometry(0.16, 0.16)
    const ribbonMat = new THREE.MeshBasicMaterial({ color: 0xe8c56a, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const studMat = new THREE.MeshBasicMaterial({ color: 0xffe9ad, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const sealDarkMat = new THREE.MeshBasicMaterial({ color: 0x1a1206, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
    let reachParents = new Map<string, string>()

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
      pathGroup.clear()
      pathGroup.visible = false
      reachRef.current = null
      reachParents = new Map()
      setMoveHint(null)
    }

    // A committed walk carries its BFS path to every browser by broadcast,
    // so tokens WALK the route — around rock, through the door — instead of
    // cutting the corner straight-line when the row lands. The stash is
    // consumed by glideToken when the realtime echo arrives; a stale one
    // (no echo inside 4s) is ignored and the straight glide covers it.
    const walkPaths = new Map<string, { cells: [number, number][]; at: number }>()
    let sendWalkPath: (tokenId: string, cells: [number, number][]) => void = (tokenId, cells) => {
      walkPaths.set(tokenId, { cells, at: Date.now() })
    }

    const computeReach = () => {
      clearReach()
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
      const usedFt = Number(c.turn_state?.moved_ft ?? 0)
      const budget = Math.floor((speedFtRef.current - usedFt) / 5)
      if (budget <= 0) return
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
        if (d >= budget) continue
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
      const cells = new Map<string, { cost: number }>()
      dist.forEach((d, k) => {
        if (d === 0 || blockStop.has(k)) return
        cells.set(k, { cost: d })
        const [x, y] = k.split(",").map(Number)
        const cpos = sqCentre(x, y)
        const p = new THREE.Mesh(reachGeo, reachMat)
        p.rotation.x = -Math.PI / 2
        p.position.set(cpos.x, 0.035, cpos.z)
        reachGroup.add(p)
      })
      if (cells.size) reachRef.current = { tokenId: tok.row.id, cells }
    }
    refreshReachRef.current = computeReach

    const showPathTo = (k: string) => {
      pathGroup.clear()
      const cells = pathCells(k)
      if (cells.length < 2) { pathGroup.visible = false; return }
      const pts = cells.map(([x, y]) => {
        const cpos = sqCentre(x, y)
        return new THREE.Vector3(cpos.x, 0.055, cpos.z)
      })
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i]
        const b = pts[i + 1]
        const len = a.distanceTo(b)
        const band = new THREE.Mesh(ribbonGeo, ribbonMat)
        band.scale.x = len
        band.position.set((a.x + b.x) / 2, 0.055, (a.z + b.z) / 2)
        band.rotation.x = -Math.PI / 2
        band.rotation.z = -Math.atan2(b.z - a.z, b.x - a.x)
        pathGroup.add(band)
        // A diamond stud on every step but the last — the seal owns that.
        if (i < pts.length - 2) {
          const stud = new THREE.Mesh(studGeo, studMat)
          stud.position.set(b.x, 0.057, b.z)
          stud.rotation.x = -Math.PI / 2
          stud.rotation.z = Math.PI / 4
          pathGroup.add(stud)
        }
      }
      // The destination seal: gold diamond, dark inlay, gold core.
      const dest = pts[pts.length - 1]
      const layers: [THREE.PlaneGeometry, THREE.Material, number][] = [
        [sealOuterGeo, studMat, 0.057],
        [sealInnerGeo, sealDarkMat, 0.058],
        [sealCoreGeo, studMat, 0.059],
      ]
      for (const [geo, mat, y] of layers) {
        const seal = new THREE.Mesh(geo, mat)
        seal.position.set(dest.x, y, dest.z)
        seal.rotation.x = -Math.PI / 2
        seal.rotation.z = Math.PI / 4
        pathGroup.add(seal)
      }
      pathGroup.visible = true
    }

    let lastHoverCell = ""
    const onHoverMove = (e: MouseEvent) => {
      if (!reachRef.current || !floorPlane) return
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
      raycaster.setFromCamera(pointer, activeCam())
      const hit = raycaster.intersectObject(floorPlane, false)[0]
      if (!hit) { pathGroup.visible = false; return }
      const gx = Math.floor(hit.point.x / SQ)
      const gy = Math.floor(hit.point.z / SQ)
      const k = gx + "," + gy
      if (k === lastHoverCell) return
      lastHoverCell = k
      const cell = reachRef.current.cells.get(k)
      if (!cell) {
        pathGroup.visible = false
        setMoveHint(null)
        return
      }
      showPathTo(k)
      setMoveHint(`${cell.cost * 5} ft`)
    }
    renderer.domElement.addEventListener("mousemove", onHoverMove)

    // ---- whose turn it is, on the board itself ----------------------
    // The active combatant's base breathes green — the same green as the
    // lamp on their card, so the two indicators read as one fact. One
    // shared ring follows whoever is up; no names needed.
    const activeGlow = new THREE.Mesh(
      new THREE.RingGeometry(1.08, 1.5, 48),
      new THREE.MeshBasicMaterial({
        color: 0x35d94a, transparent: true, opacity: 0.3,
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
        .select("id,map_id,character_id,bestiary_id,label,model_url,model_scale,model_y_offset,grid_x,grid_y,rotation_y,token_size,tint_color,is_visible,hp_current,hp_max")
        .eq("map_id", map.id)
      for (const row of (tokenRows ?? []) as TokenRow[]) spawnToken(row)
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
          .select("id,name,class,level,ac,hp_current,hp_max,speed,proficiency_bonus,portrait_image_url,face_image_url,dex_modifier,sheet_spellcasting,sheet_features,conditions,str_score,dex_score,con_score,int_score,wis_score,cha_score,avatar_image_url,initiative,xp,xp_to_next,sheet_species,sheet_background,sheet_save_proficiencies,sheet_skill_proficiencies,sheet_attacks,hero_image_url")
          .in("id", charIds)
          // Without this the order is whatever Postgres feels like, which
          // makes the default focus — and the fallback above — a coin flip
          // that changes between reloads.
          .order("name")
        const list = (rows ?? []) as HudCharacter[]
        setSheets(list)
        setFocusId((cur) => cur ?? list[0]?.id ?? null)
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
          .limit(12)
        setLog(((data ?? []) as HudLogLine[]).reverse().map((l) => ({ ...l, text: l.text.length > 90 ? l.text.slice(0, 90) + "…" : l.text })))
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
          const p = payload as { token_id?: string; cells?: [number, number][] }
          if (p?.token_id && Array.isArray(p.cells)) walkPaths.set(p.token_id, { cells: p.cells, at: Date.now() })
        })
        .subscribe()
      sendWalkPath = (token_id, cells) => {
        walkPaths.set(token_id, { cells, at: Date.now() })
        void walkChannel.send({ type: "broadcast", event: "walk", payload: { token_id, cells } })
      }

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
            return
          }
          glideToken(payload.new as TokenRow)
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
      // Keyboard pan first, so everything below renders from this frame's view.
      panFromKeys(dt)
      // The active combatant's base breathes. Following per-frame keeps the
      // glow under the token through glides without touching the glide code.
      const combatNow = combatRef.current
      const activeTok = combatNow
        ? tokensRef.current.get(combatNow.turn_order?.[combatNow.active_index]?.token_id ?? "")
        : undefined
      if (activeTok && activeTok.row.is_visible) {
        activeGlow.visible = true
        activeGlow.position.x = activeTok.obj.position.x
        activeGlow.position.z = activeTok.obj.position.z
        activeGlow.scale.setScalar(radiusFor(activeTok.row.token_size))
        ;(activeGlow.material as THREE.MeshBasicMaterial).opacity = 0.26 + 0.14 * Math.sin(clock.elapsedTime * 2.4)
      // Target rings breathe so they read as an invitation rather than decor.
      targetGroup.children.forEach((r) => {
        const m = r as THREE.Mesh
        const phase = (m.userData.pulse as number) ?? 0
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
        vfx.push(
          kitType
            ? castSpellKitVfx({
                parent: scene,
                anchor: bone,
                type: kitType,
                target: p.target,
                camera,
              })
            : castSpellVfx({
                parent: scene,
                anchor: bone,
                palette: paletteForSpell(p.spell),
                target: p.target,
              }),
        )
      }
      for (let i = vfx.length - 1; i >= 0; i--) {
        if (!vfx[i].update(dt)) vfx.splice(i, 1)
      }

      tokensRef.current.forEach((entry) => {
        const gl = entry.obj.userData.glide as { pts: THREE.Vector3[]; seg: number[]; total: number; s: number } | undefined
        if (!gl) {
          // Standing still: stance, unless mid-swing.
          if (entry.anim && entry.anim.state === "walk") playState(entry.anim, "idle")
          return
        }
        if (entry.anim) playState(entry.anim, "walk")
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
          entry.obj.position.y = 0
          if (entry.anim) playState(entry.anim, "idle")
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
      refreshReachRef.current = () => {}
      reachGeo.dispose()
      ribbonGeo.dispose()
      studGeo.dispose()
      sealOuterGeo.dispose()
      sealInnerGeo.dispose()
      sealCoreGeo.dispose()
      activeGlow.geometry.dispose()
      pmrem.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
      tokensRef.current.clear()
      // A spell still in the air when the board goes away takes its
      // geometry and materials with it.
      vfx.forEach((v) => v.dispose())
      vfx.length = 0
      clearTargets()
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
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        say(data?.error ?? "The order would not hold.")
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
    const h = playSfx(windupFor(armedSpell.entry.school), { loop: true, volume: 0.55, fadeIn: 0.25 })
    windupRef.current = h
    // The visible half of the ramp: the caster holds the pose while choosing,
    // and everyone they could throw it at is ringed.
    chargeRef.current.start(armedSpell.tokenId)
    targetsRef.current.show(armedSpell.tokenId, armedSpell.entry.rangeFt, Boolean(armedSpell.entry.helpful))
    const e = armedSpell.entry
    preloadSfx([releaseFor(e.school), tailFor(e.school), ...(e.damage ? [impactFor(e.damage)] : [])])
    const onKey = (ev: KeyboardEvent) => {
      // Escape puts it away. Opening the wrong spell must not cost a turn.
      if (ev.key === "Escape") setArmedSpell(null)
    }
    window.addEventListener("keydown", onKey)
    return () => {
      h.stop(0.18)
      if (windupRef.current === h) windupRef.current = null
      // Cancelled, thrown, or unmounted — the pose must not be left held and
      // the rings must not outlive the choice.
      chargeRef.current.stop()
      targetsRef.current.clear()
      window.removeEventListener("keydown", onKey)
    }
  }, [armedSpell])

  // Ask the server to resolve a spell that has just been thrown.
  useEffect(() => {
    castVerbRef.current = async (caster_token, target_token, ability) => {
      try {
        const res = await fetch("/api/combat", {
          method: "POST",
          headers: { "content-type": "application/json", ...dmHeaders() },
          body: JSON.stringify({ action: "cast", caster_token, target_token, ability, sandbox }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) say(data?.error ?? "The spell would not resolve.")
        else if (data?.resolved) say(data.line as string)
      } catch {
        say("The spell landed, but the tally did not reach the server.")
      }
    }
  }, [sandbox])

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
  playerMoveRef.current = (tokenId, gx, gy, feet) => {
    void (async () => {
      try {
        const res = await fetch("/api/combat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "move", token_id: tokenId, gx, gy, feet, sandbox }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          say(data?.error ?? "The move did not take.")
          refreshReachRef.current() // repaint what is still true
          return
        }
        if (data?.turn_state) setCombat((c) => (c ? { ...c, turn_state: data.turn_state } : c))
      } catch {
        say("That did not reach the table — check the connection.")
        refreshReachRef.current()
      }
    })()
  }

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
          {!dm && isMyTurn && <span className="text-[#f3c94b]"> · your turn — click a yellow square to walk</span>}
        </div>
        <div className="mt-1.5 flex gap-1.5">
          <button
            onClick={() => setClassicCam((v) => !v)}
            className="pointer-events-auto rounded border border-[#6b5123] bg-[#171109] px-2 py-[3px] text-[8px] uppercase tracking-wider text-[#cdb276] hover:border-[#c99a49]"
          >
            {classicCam ? "Classic" : "Free"}
          </button>
          {dm && (
            <button
              onClick={() => setDarknessOn((v) => !v)}
              className="pointer-events-auto rounded border border-[#5a4a6a] bg-[#1a1226] px-2 py-[3px] text-[8px] uppercase tracking-wider text-[#c9b3e0] hover:border-[#b48fd8]"
            >
              {darknessOn ? "Lift dark" : "Dark on"}
            </button>
          )}
          {dm && (
            <button
              onClick={() => setDmMove((v) => !v)}
              className={`pointer-events-auto rounded border px-2 py-[3px] text-[8px] uppercase tracking-wider ${
                dmMove
                  ? "border-[#c99a49] bg-[#2a1f09] text-[#f3c94b]"
                  : "border-[#5a4a6a] bg-[#1a1226] text-[#c9b3e0] hover:border-[#b48fd8]"
              }`}
            >
              {dmMove ? "DM move: on" : "DM move: off"}
            </button>
          )}
        </div>
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

      {/* The path's price, BG3-style, while a walk is being lined up. */}
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
        {onBack && (
          <button
            onClick={onBack}
            className="pointer-events-auto mt-1.5 rounded border border-[#6b5123] bg-black/70 px-3 py-1 font-mono text-[9px] tracking-wider text-[#e1d0a8] hover:border-[#c99a49]"
          >
            ← SCENE
          </button>
        )}
      </div>

      {/* THE TURN, ANNOUNCED — the owner gets the blocking call; the table
          gets the transient centre plate and a read-only phase tray; the DM
          gets a live tray. */}
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
        tokenToCharacter={tokenToCharacter}
        tokenPortrait={tokenPortrait}
        tokenConditions={tokenConditions}
        turnOrder={combat?.turn_order ?? []}
        activeIndex={combat?.active_index ?? 0}
        round={combat?.round ?? 1}
        log={log}
        dm={dm}
        onEndTurn={() => void combatAction("next")}
        focusId={focusId}
        onFocus={setFocusId}
        // The rack tells us who cast it. Deriving it here from focusId is how
        // the wrong miniature ended up animating.
        // A press ARMS the spell. Only things with nobody to point at go off
        // at once — making a player click themselves to Dodge would be
        // theatre without meaning.
        onCast={(characterId, ability, kind) => {
          const e = spellEntry(ability)
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
          setArmedSpell({ characterId, tokenId: mine.row.id, name: ability, kind, entry: e })
          say(`${ability} — choose a target${e.rangeFt ? ` within ${e.rangeFt} ft` : ""}.`)
        }}
        armedSpell={armedSpell ? { name: armedSpell.name, rangeFt: armedSpell.entry.rangeFt } : null}
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
