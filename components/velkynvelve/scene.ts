/**
 * THE VELKYNVELVE SCENE — one node drawn top-down in pixel art.
 *
 * Phaser arrives as a global from the CDN (see velkynvelve-game.tsx), so it is
 * passed in rather than imported and typed loosely here. Layers, back to front:
 *
 *   1. the abyss: faint violet glints drifting on a slow parallax (0.35) and a
 *      mist sheet on a faster one (0.7), so the platform reads as hung over
 *      nothing rather than printed on black;
 *   2. the platform's shadow: the deck image filled black, twice, offset down
 *      and right — the drop beneath the planks;
 *   3. the deck;
 *   4. props and figures, each sorted by the y of its feet so whoever stands
 *      lower on screen is drawn in front;
 *   5. darkness: a canvas over everything with light pools cut out of it
 *      (destination-out) for each brazier (flickering) and each figure;
 *   6. glow: additive colour where the lights are.
 *
 * Sprite sheets use the row order of lib/sprite-token.ts: south, south-east,
 * east, north-east, north, north-west, west, south-west.
 */
import type { SpriteManifest, SpriteState } from "@/lib/sprite-token"
import type { Facing, LoadedNode } from "@/lib/velkynvelve/node"
import { standableGrid } from "@/lib/velkynvelve/node"
import { findPath, lineClear, type Point } from "@/lib/velkynvelve/pathfinding"
import { buildCage, paintBridges, paintPlatforms } from "./geometry-art"

/* eslint-disable @typescript-eslint/no-explicit-any */
type PhaserNS = any

export const DIRECTIONS: Facing[] = [
  "south",
  "south-east",
  "east",
  "north-east",
  "north",
  "north-west",
  "west",
  "south-west",
]

export interface SceneFigure {
  id: string
  manifest: SpriteManifest
  /** Folder the manifest's sheets resolve against. */
  baseUrl: string
  x: number
  y: number
  facing: Facing
}

export interface SceneCallbacks {
  onActiveChange?: (figureId: string, name: string) => void
}

/** A Medium figure stands this many squares tall on screen. */
const FIGURE_SQUARES = 1.2
/** Walking speed, source px per second (~ 30 ft over two seconds). */
const WALK_SPEED = 64
/** How dark the unlit deck is. */
const DARKNESS = 0.62
/** The light each figure carries, so nobody is lost in the gloom. */
const FIGURE_LIGHT_RADIUS = 72
/** Margin of abyss around the platform the camera may wander into. */
const MARGIN = 160
/**
 * Keys that walk the active figure, by physical key (event.code), so the
 * numpad works with Num Lock on or off. 8 forward (up the screen), 2 back,
 * 4 left, 6 right; 7 9 1 3 are the diagonals. Arrow keys do the same for
 * keyboards without a numpad.
 */
const MOVE_KEYS: Record<string, [number, number]> = {
  Numpad8: [0, -1],
  Numpad2: [0, 1],
  Numpad4: [-1, 0],
  Numpad6: [1, 0],
  Numpad7: [-1, -1],
  Numpad9: [1, -1],
  Numpad1: [-1, 1],
  Numpad3: [1, 1],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}
/** The pixel gauntlet pointer; the hotspot is its fingertip. */
const CURSOR = "url(/velkynvelve/cursor-gauntlet.png) 6 0, pointer"
/** How long the ripple marking a clicked spot lasts, ms. */
const MARKER_MS = 520
/**
 * The darkness layer is redrawn every frame; it is all soft gradients, so it
 * is kept at 1/DARK_SCALE resolution and stretched — a quarter of the work
 * at 2, and the eye cannot tell.
 */
const DARK_SCALE = 2
/** Longest step a single frame may take, s — a stalled tab must not teleport anyone. */
const MAX_STEP = 0.1
/** Pointer travel (screen px) that turns a tap into a drag. */
const DRAG_SLOP = 6

const LIGHT_KEY = "vv-light"
const GLINT_KEY = "vv-glint"
const BAR_KEY = "vv-bar"
const FLOOR_KEY = "vv-floor"
const STONE_KEY = "vv-stone"
const WATER_KEY = "vv-water"
const FOAM_KEY = "vv-foam"
/** Waterfall fall speeds, source px per millisecond: the sheet, and the fast streaks on it. */
const WATER_SPEED = 0.16
const STREAK_SPEED = 0.42
/** Cage bars: height above the floor (source px, ~7 ft) and spacing. */
const BAR_HEIGHT = 40
const BAR_GAP = 5
const MIST_KEY = "vv-mist"

function hexToNumber(hex: string): number {
  return parseInt(hex.replace("#", ""), 16)
}

/** Screen-space vector → the drawn direction whose row the sheet uses. */
export function facingFor(dx: number, dy: number): Facing {
  // Octant 0 = east, counting clockwise (y points down): 1 SE, 2 S, 3 SW ...
  const o = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8
  const rowByOctant: Facing[] = [
    "east",
    "south-east",
    "south",
    "south-west",
    "west",
    "north-west",
    "north",
    "north-east",
  ]
  return rowByOctant[o]
}

/** Rows of opaque pixels in the south-facing first idle frame — the figure's real height. */
function visibleHeight(source: CanvasImageSource, cellW: number, cellH: number): number {
  const c = document.createElement("canvas")
  c.width = cellW
  c.height = cellH
  const ctx = c.getContext("2d")
  if (!ctx) return cellH
  ctx.drawImage(source, 0, 0, cellW, cellH, 0, 0, cellW, cellH)
  const data = ctx.getImageData(0, 0, cellW, cellH).data
  let top = -1
  let bottom = -1
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) {
      if (data[(y * cellW + x) * 4 + 3] > 16) {
        if (top < 0) top = y
        bottom = y
        break
      }
    }
  }
  return top < 0 ? cellH : bottom - top + 1
}

interface FigureRuntime {
  def: SceneFigure
  sprite: any
  shadow: any
  glow: any
  facing: Facing
  state: SpriteState
  path: Point[]
  /** Draw scale per animation, so every animation stands the same height. */
  scales: Partial<Record<SpriteState, number>>
}

export function createVelkynvelveScene(
  Phaser: PhaserNS,
  node: LoadedNode,
  figures: SceneFigure[],
  callbacks: SceneCallbacks = {},
): any {
  const S = node.squarePx
  const worldW = node.squares * S
  const worldH = node.squares * S
  const grid = standableGrid(node)
  const lit = node.props.filter((p) => p.light)
  // Where the platform itself is, so the camera opens on it rather than on
  // the middle of a larger map of bridges.
  // A geometry node opens on its first platform (the pen, not the hub).
  const firstPlatform = node.geometry?.platforms[0]
  const deckSquares = node.walkable.flatMap((row, y) => [...row].map((c, x) => (c === "o" ? [x, y] : null)).filter(Boolean)) as Array<[number, number]>
  const deckCx = deckSquares.length ? ((Math.min(...deckSquares.map((d) => d[0])) + Math.max(...deckSquares.map((d) => d[0])) + 1) / 2) * S : worldW / 2
  const deckCy = deckSquares.length ? ((Math.min(...deckSquares.map((d) => d[1])) + Math.max(...deckSquares.map((d) => d[1])) + 1) / 2) * S : worldH / 2

  const sheetKey = (f: SceneFigure, state: string) => `vv-${f.id}-${state}`
  const animKey = (f: SceneFigure, state: string, dir: Facing) => `vv-${f.id}-${state}-${dir}`

  return class VelkynvelveScene extends Phaser.Scene {
    figs: FigureRuntime[] = []
    active = 0
    darkTex: any
    lightImg: HTMLCanvasElement | null = null
    braziers: Array<{ x: number; y: number; glow: any; phase: number }> = []
    mist: any
    water: any
    streaks: any
    foam: any[] = []
    down: { x: number; y: number; sx: number; sy: number; dragging: boolean } | null = null
    held = new Set<string>()
    lastTime = 0
    marker: any = null
    markerBorn = 0

    constructor() {
      super({ key: "velkynvelve" })
    }

    preload() {
      if (node.deck) this.load.image("vv-deck", node.baseUrl + node.deck)
      if (node.floorTile) this.load.image(STONE_KEY, node.baseUrl + node.floorTile)
      for (const p of node.props) this.load.image(`vv-prop-${p.image}`, node.baseUrl + p.image)
      for (const f of figures) {
        for (const [state, anim] of Object.entries(f.manifest.animations)) {
          if (!anim) continue
          this.load.spritesheet(sheetKey(f, state), f.baseUrl + anim.sheet, {
            frameWidth: f.manifest.cell[0],
            frameHeight: f.manifest.cell[1],
          })
        }
      }
    }

    create() {
      this.makeTextures()
      this.cameras.main.setBackgroundColor("#05040a")

      this.buildAbyss()

      // 2-3. The floor — a painted deck, or platforms and rope bridges drawn
      // from the node's geometry — and its shadow on the drop below.
      let floorKey: string | null = node.deck ? "vv-deck" : null
      if (node.geometry) {
        const tex = this.textures.createCanvas(FLOOR_KEY, worldW, worldH)
        const opts = { S, barKey: BAR_KEY, barHeight: BAR_HEIGHT, stone: node.floorTile ? this.textures.get(STONE_KEY).getSourceImage() : null }
        paintPlatforms(tex.getContext(), node, opts)
        paintBridges(tex.getContext(), node, opts)
        tex.refresh()
        floorKey = FLOOR_KEY
      }
      if (floorKey) {
        for (const [ox, oy, a] of [
          [7, 17, 0.28],
          [3, 8, 0.45],
        ] as const) {
          this.add
            .image(ox, oy, floorKey)
            .setOrigin(0, 0)
            .setTint(0x000000)
            .setTintMode(Phaser.TintModes.FILL)
            .setAlpha(a)
            .setDepth(-50)
        }
        this.add.image(0, 0, floorKey).setOrigin(0, 0).setDepth(-40)
      }

      // 4a. Props, feet at the bottom of their footprint.
      for (const p of node.props) {
        const cx = (p.x + p.w / 2) * S
        const feet = (p.y + p.h) * S - 3
        if (p.layer === "under") {
          // Hangs beneath the walkway: over the abyss and its shadow, under the planks.
          this.add.image(cx, (p.y + p.h / 2) * S, `vv-prop-${p.image}`).setScale(p.scale ?? 1).setDepth(-45)
          continue
        }
        this.add.image(cx, feet, `vv-prop-${p.image}`).setOrigin(0.5, 1).setScale(p.scale ?? 1).setDepth(feet)
        if (p.light) {
          const ly = feet - Math.min(S * p.h, 20)
          const glow = this.add
            .image(cx, ly, LIGHT_KEY)
            .setTint(hexToNumber(p.light.color))
            .setBlendMode(Phaser.BlendModes.ADD)
            .setDepth(20001)
          this.braziers.push({ x: cx, y: ly, glow, phase: Math.random() * 10 })
        }
      }

      // 4a'. Cage bars and locked gates round caged platforms.
      if (node.geometry) buildCage(this, node, { S, barKey: BAR_KEY, barHeight: BAR_HEIGHT, stone: null })

      // 4b. Figures.
      for (const f of figures) this.addFigure(f)

      // Where each bridge goes, written over the dark.
      for (const l of node.labels ?? []) {
        this.add
          .text((l.x + 0.5) * S, (l.y + 0.5) * S, l.text, {
            fontFamily: "Georgia, serif",
            fontSize: "9px",
            color: "#e8c98a",
            stroke: "#000000",
            strokeThickness: 3,
            align: "center",
            resolution: 4,
          })
          .setOrigin(0.5)
          .setDepth(20002)
      }

      // 5. Darkness.
      this.darkTex = this.textures.createCanvas(
        "vv-dark",
        Math.ceil((worldW + MARGIN * 2) / DARK_SCALE),
        Math.ceil((worldH + MARGIN * 2) / DARK_SCALE),
      )
      this.darkTex.setFilter(Phaser.Textures.FilterMode.LINEAR)
      this.add
        .image(-MARGIN, -MARGIN, "vv-dark")
        .setOrigin(0, 0)
        .setScale(DARK_SCALE)
        .setDepth(20000)

      // Camera.
      const cam = this.cameras.main
      cam.setBounds(-MARGIN, -MARGIN, worldW + MARGIN * 2, worldH + MARGIN * 2)
      this.fitZoom()
      // Frame the platform, then slide just far enough that the active figure
      // is on screen — on a phone the whole deck does not fit.
      const viewW = this.scale.width / cam.zoom
      const viewH = this.scale.height / cam.zoom
      const lead = this.figs[this.active]?.sprite
      const keep = (c: number, f: number | undefined, view: number) => {
        if (f === undefined) return c
        const slack = view / 2 - S
        return Math.abs(f - c) > slack ? f - Math.sign(f - c) * Math.max(0, slack) : c
      }
      const openX = firstPlatform ? firstPlatform.cx * S : deckCx
      const openY = firstPlatform ? firstPlatform.cy * S : deckCy
      cam.centerOn(keep(openX, lead?.x, viewW), keep(openY, lead?.y, viewH))
      this.scale.on("resize", () => this.fitZoom())

      this.input.on("pointerdown", (p: any) => {
        this.down = { x: p.x, y: p.y, sx: cam.scrollX, sy: cam.scrollY, dragging: false }
      })
      this.input.on("pointermove", (p: any) => {
        if (!this.down || !p.isDown) return
        const dx = p.x - this.down.x
        const dy = p.y - this.down.y
        if (!this.down.dragging && Math.hypot(dx, dy) > DRAG_SLOP) this.down.dragging = true
        if (this.down.dragging) {
          cam.scrollX = this.down.sx - dx / cam.zoom
          cam.scrollY = this.down.sy - dy / cam.zoom
        }
      })
      this.input.on("pointerup", (p: any) => {
        const d = this.down
        this.down = null
        if (!d || d.dragging) return
        const w = cam.getWorldPoint(p.x, p.y)
        this.tap(w.x, w.y)
      })

      this.input.setDefaultCursor(CURSOR)
      this.input.keyboard?.on("keydown", (e: KeyboardEvent) => {
        if (!(e.code in MOVE_KEYS)) return
        e.preventDefault()
        this.held.add(e.code)
      })
      this.input.keyboard?.on("keyup", (e: KeyboardEvent) => this.held.delete(e.code))
      // Let go of everything if the window loses focus mid-stride.
      this.game.events.on("blur", () => this.held.clear())

      this.announce()
    }

    fitZoom() {
      const cam = this.cameras.main
      const w = this.scale.width
      const h = this.scale.height
      cam.setZoom(Math.max(2, Math.min(3, Math.min(w, h) / 400)))
    }

    makeTextures() {
      // A soft round light, white, for ADD-blend glows.
      const size = 128
      const l = this.textures.createCanvas(LIGHT_KEY, size, size)
      const lc: CanvasRenderingContext2D = l.getContext()
      const g = lc.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      g.addColorStop(0, "rgba(255,255,255,0.55)")
      g.addColorStop(0.35, "rgba(255,255,255,0.18)")
      g.addColorStop(1, "rgba(255,255,255,0)")
      lc.fillStyle = g
      lc.fillRect(0, 0, size, size)
      l.refresh()

      // One iron bar: dark body, a lit edge, a cap at the top.
      const bar = this.textures.createCanvas(BAR_KEY, 3, BAR_HEIGHT)
      const bc: CanvasRenderingContext2D = bar.getContext()
      bc.fillStyle = "#15131a"
      bc.fillRect(0, 0, 3, BAR_HEIGHT)
      bc.fillStyle = "#6a6275"
      bc.fillRect(1, 1, 1, BAR_HEIGHT - 2)
      bc.fillStyle = "#2c2833"
      bc.fillRect(0, 0, 3, 2)
      bar.refresh()

      // A single-pixel glint.
      const gl = this.textures.createCanvas(GLINT_KEY, 3, 3)
      const glc: CanvasRenderingContext2D = gl.getContext()
      glc.fillStyle = "rgba(185,140,255,0.35)"
      glc.fillRect(0, 1, 3, 1)
      glc.fillRect(1, 0, 1, 3)
      glc.fillStyle = "rgba(230,215,255,1)"
      glc.fillRect(1, 1, 1, 1)
      gl.refresh()

      // Mist: overlapping soft blobs on a tileable 256 square.
      const ms = 256
      const m = this.textures.createCanvas(MIST_KEY, ms, ms)
      const mc: CanvasRenderingContext2D = m.getContext()
      let seed = 7
      const rnd = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      for (let i = 0; i < 26; i++) {
        const x = rnd() * ms
        const y = rnd() * ms
        const r = 30 + rnd() * 60
        for (const ox of [-ms, 0, ms]) {
          for (const oy of [-ms, 0, ms]) {
            const bg = mc.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r)
            bg.addColorStop(0, "rgba(125,110,170,0.32)")
            bg.addColorStop(1, "rgba(120,105,160,0)")
            mc.fillStyle = bg
            mc.fillRect(x + ox - r, y + oy - r, r * 2, r * 2)
          }
        }
      }
      m.refresh()
    }

    buildAbyss() {
      let seed = 12345
      const rnd = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      const span = (worldW + MARGIN * 4) * 1.2
      for (let i = 0; i < 90; i++) {
        this.add
          .image(-MARGIN * 2 + rnd() * span, -MARGIN * 2 + rnd() * span, GLINT_KEY)
          .setScrollFactor(0.35)
          .setAlpha(0.25 + rnd() * 0.55)
          .setDepth(-100)
      }
      this.buildWaterfall()

      const ext = worldW + MARGIN * 6
      this.mist = this.add
        .tileSprite(-MARGIN * 3, -MARGIN * 3, ext, ext, MIST_KEY)
        .setOrigin(0, 0)
        .setScrollFactor(0.7)
        .setAlpha(0.95)
        .setDepth(-90)
    }

    /**
     * A waterfall pouring through the abyss, and plainly moving: a sheet of
     * water scrolling down, brighter streaks racing down it faster, white
     * foam boiling where it breaks over each ledge, and spray thrown off
     * into the dark. It sits under the mist, deep in the chasm, and lights
     * itself (see the pools in update()).
     */
    buildWaterfall() {
      const wf = node.waterfall
      if (!wf) return
      let seed = 4242
      const rnd = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      const tw = Math.round(wf.width * S)
      const th = 128
      const feather = (c: CanvasRenderingContext2D, w: number, h: number) => {
        c.globalCompositeOperation = "destination-in"
        const edge = c.createLinearGradient(0, 0, w, 0)
        edge.addColorStop(0, "rgba(0,0,0,0)")
        edge.addColorStop(0.16, "rgba(0,0,0,1)")
        edge.addColorStop(0.84, "rgba(0,0,0,1)")
        edge.addColorStop(1, "rgba(0,0,0,0)")
        c.fillStyle = edge
        c.fillRect(0, 0, w, h)
        c.globalCompositeOperation = "source-over"
      }
      // The body: deep blue, darker columns, soft vertical grain.
      const body = this.textures.createCanvas(WATER_KEY, tw, th)
      const bc: CanvasRenderingContext2D = body.getContext()
      bc.fillStyle = "rgba(44,78,122,0.82)"
      bc.fillRect(0, 0, tw, th)
      for (let i = 0; i < 26 * wf.width; i++) {
        const x = Math.floor(rnd() * tw)
        const y = Math.floor(rnd() * th)
        const len = 10 + Math.floor(rnd() * 30)
        bc.fillStyle = rnd() > 0.5 ? "rgba(90,135,185,0.7)" : "rgba(22,40,70,0.7)"
        bc.fillRect(x, y, 1, len)
        bc.fillRect(x, y - th, 1, len)
      }
      feather(bc, tw, th)
      body.refresh()
      // The streaks: sparse bright threads, moving faster than the sheet.
      const streak = this.textures.createCanvas(`${WATER_KEY}-fast`, tw, th)
      const sc: CanvasRenderingContext2D = streak.getContext()
      for (let i = 0; i < 22 * wf.width; i++) {
        const x = Math.floor(rnd() * tw)
        const y = Math.floor(rnd() * th)
        const len = 4 + Math.floor(rnd() * 16)
        sc.fillStyle = `rgba(225,242,255,${0.5 + rnd() * 0.5})`
        sc.fillRect(x, y, 1, len)
        sc.fillRect(x, y - th, 1, len)
      }
      feather(sc, tw, th)
      streak.refresh()
      // Foam: a band of white clots that tiles sideways.
      // Foam: soft round clots, densest along the lip, thinning into drips
      // below it. Tiles sideways so it can churn.
      const foam = this.textures.createCanvas(FOAM_KEY, 64, 20)
      const fc: CanvasRenderingContext2D = foam.getContext()
      for (let i = 0; i < 90; i++) {
        const x = rnd() * 64
        const y = 4 + Math.pow(rnd(), 1.8) * 13
        const r = 1 + rnd() * 2.5 * (1 - (y - 4) / 16)
        fc.fillStyle = `rgba(232,243,255,${0.35 + rnd() * 0.5})`
        for (const ox of [-64, 0, 64]) {
          fc.beginPath()
          fc.arc(x + ox, y, r, 0, Math.PI * 2)
          fc.fill()
        }
      }
      foam.refresh()

      const x = wf.x * S
      const w = tw
      this.water = this.add.tileSprite(x, -MARGIN, w, worldH + MARGIN * 2, WATER_KEY).setOrigin(0, 0).setDepth(-96)
      this.streaks = this.add
        .tileSprite(x, -MARGIN, w, worldH + MARGIN * 2, `${WATER_KEY}-fast`)
        .setOrigin(0, 0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(-95)
      // Where it breaks in over the top of the map, and over each ledge.
      const breaks = [0, ...(wf.ledges ?? [])]
      for (const ly of breaks) {
        const y = ly * S
        const band = this.add
          .tileSprite(x - 2, y - 6, w + 4, 20, FOAM_KEY)
          .setOrigin(0, 0)
          .setDepth(-94)
        this.foam.push(band)
        this.add
          .image(x + w / 2, y + 2, LIGHT_KEY)
          .setScale((w * 1.8) / 128, 0.35)
          .setAlpha(0.55)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(-94)
        this.add
          .particles(x + w / 2, y + 4, LIGHT_KEY, {
            x: { min: -w / 2, max: w / 2 },
            speedX: { min: -14, max: 14 },
            speedY: { min: -22, max: 18 },
            scale: { start: 0.04, end: 0.14 },
            alpha: { start: 0.55, end: 0 },
            lifespan: { min: 700, max: 1400 },
            frequency: 70,
            blendMode: Phaser.BlendModes.ADD,
          })
          .setDepth(-93)
      }
    }

    addFigure(f: SceneFigure) {
      const [cw, ch] = f.manifest.cell
      const [px, py] = f.manifest.pivot
      const idle = f.manifest.animations.idle ? "idle" : Object.keys(f.manifest.animations)[0]
      const src = this.textures.get(sheetKey(f, idle)).getSourceImage()
      // Scale by the pixels actually drawn, not by the manifest's ppu: two
      // PixelLab characters can fill their cells very differently.
      const scale = (FIGURE_SQUARES * S) / visibleHeight(src, cw, ch)
      // Animations made at different times can be drawn at different sizes:
      // Samson's newer walk is ~10% taller than his older idle, so he grew
      // every time he set off. Each animation's first frame is an upright
      // pose (even the death fall starts standing), so measure that and
      // scale every animation to the idle's height. Clamped, so a sheet that
      // does not start upright cannot balloon.
      const scales: Partial<Record<SpriteState, number>> = {}
      for (const state of Object.keys(f.manifest.animations) as SpriteState[]) {
        const h = visibleHeight(this.textures.get(sheetKey(f, state)).getSourceImage(), cw, ch)
        scales[state] = (FIGURE_SQUARES * S) / h
        const ratio = scales[state]! / scale
        if (ratio < 0.8 || ratio > 1.25) scales[state] = scale
      }

      for (const [state, anim] of Object.entries(f.manifest.animations)) {
        if (!anim) continue
        // Figure sheets are drawn at ~128 px a figure and shown at a third of
        // that. Nearest-pixel sampling (the game's pixelArt default) keeps only
        // every third row or so, and the row it drops can be the one-pixel
        // outline under the feet — Samson's bare soles lost their bottoms
        // (Sam, 9/26: "Samson's feet are cut off a bit"). Smooth sampling
        // blends every row in. The deck and props stay nearest: they are
        // drawn at the world's own pixel size and never shrink.
        this.textures.get(sheetKey(f, state)).setFilter(Phaser.Textures.FilterMode.LINEAR)
        DIRECTIONS.forEach((dir, row) => {
          this.anims.create({
            key: animKey(f, state, dir),
            frames: this.anims.generateFrameNumbers(sheetKey(f, state), {
              start: row * anim.frames,
              end: row * anim.frames + anim.frames - 1,
            }),
            frameRate: anim.fps,
            repeat: anim.loop ? -1 : 0,
          })
        })
      }

      const x = (f.x + 0.5) * S
      const y = (f.y + 0.5) * S
      const shadow = this.add.ellipse(x, y, S * 0.6, S * 0.22, 0x000000, 0.5).setDepth(y - 0.5)
      const sprite = this.add
        .sprite(x, y, sheetKey(f, idle), 0)
        .setOrigin(px / cw, py / ch)
        .setScale(scale)
        .setDepth(y)
      const glow = this.add
        .image(x, y - S * 0.5, LIGHT_KEY)
        .setTint(0xffe2b0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.55)
        .setScale((FIGURE_LIGHT_RADIUS * 2) / 128)
        .setDepth(20001)
      const rt: FigureRuntime = { def: f, sprite, shadow, glow, facing: f.facing, state: "idle", path: [], scales }
      this.figs.push(rt)
      this.play(rt, "idle")
    }

    play(f: FigureRuntime, state: SpriteState) {
      const has = f.def.manifest.animations[state]
      const s = has ? state : "idle"
      f.state = s
      const scale = f.scales[s]
      if (scale) f.sprite.setScale(scale)
      f.sprite.play(animKey(f.def, s, f.facing), true)
    }

    tap(wx: number, wy: number) {
      // A figure under the pointer? Switch to it.
      for (let i = this.figs.length - 1; i >= 0; i--) {
        const b = this.figs[i].sprite.getBounds()
        if (b.contains(wx, wy)) {
          this.active = i
          this.announce()
          return
        }
      }
      const f = this.figs[this.active]
      if (!f) return
      const path = findPath(grid, { x: f.sprite.x, y: f.sprite.y }, { x: wx, y: wy }, { squarePx: S })
      this.showMarker(wx, wy, !!path)
      if (!path || path.length === 0) return
      f.path = path
    }

    /**
     * A ripple on the floor where the pointer landed: gold when the figure
     * can walk there, red when it cannot (a prop, the drop, a locked gate).
     * It widens and fades in about half a second, and is swept away the
     * moment anything else moves the figure.
     */
    showMarker(x: number, y: number, ok: boolean) {
      this.clearMarker()
      const colour = ok ? 0xe8c98a : 0xd0504a
      // Above the darkness: it is a pointer mark, and must read even in the gloom.
      const g = this.add.graphics().setPosition(x, y).setDepth(20003)
      g.lineStyle(2, colour, 1).strokeEllipse(0, 0, 18, 9)
      g.lineStyle(1, colour, 0.6).strokeEllipse(0, 0, 9, 4.5)
      g.fillStyle(colour, 0.9).fillRect(-1, -1, 2, 2)
      g.setScale(0.5)
      this.marker = g
      // Animated in update() on the same real clock as walking.
      this.markerBorn = this.lastTime
    }

    clearMarker() {
      if (!this.marker) return
      this.marker.destroy()
      this.marker = null
    }

    /** Widen and fade the click ripple; gone after MARKER_MS. */
    tickMarker(time: number) {
      if (!this.marker) return
      const t = (time - this.markerBorn) / MARKER_MS
      if (t >= 1) return this.clearMarker()
      const ease = 1 - (1 - t) * (1 - t)
      this.marker.setScale(0.5 + 0.85 * ease).setAlpha(1 - ease)
    }

    /**
     * Keyboard walking: the held keys add up to a direction (8+6 walks
     * north-east), the figure steps that way at walking speed, and slides
     * along a wall rather than sticking to it. Any click-path is dropped.
     */
    keyWalk(dt: number) {
      const f = this.figs[this.active]
      if (!f) return
      let dx = 0
      let dy = 0
      for (const code of this.held) {
        const d = MOVE_KEYS[code]
        if (d) {
          dx += d[0]
          dy += d[1]
        }
      }
      const moving = dx !== 0 || dy !== 0
      if (!moving) {
        if (f.path.length === 0 && f.state === "walk") this.play(f, "idle")
        return
      }
      f.path = []
      this.clearMarker()
      const len = Math.hypot(dx, dy)
      const step = WALK_SPEED * dt
      const from = { x: f.sprite.x, y: f.sprite.y }
      const tries: Point[] = [
        { x: from.x + (dx / len) * step, y: from.y + (dy / len) * step },
        { x: from.x + Math.sign(dx) * step, y: from.y },
        { x: from.x, y: from.y + Math.sign(dy) * step },
      ]
      const to = tries.find((t) => (t.x !== from.x || t.y !== from.y) && lineClear(grid, S, from, t))
      const facing = facingFor(dx, dy)
      if (facing !== f.facing || f.state !== "walk") {
        f.facing = facing
        this.play(f, "walk")
      }
      if (to) f.sprite.setPosition(to.x, to.y)
    }

    /** Keep the figure you are moving on screen: pan once it nears an edge. */
    follow() {
      const f = this.figs[this.active]
      if (!f || this.down?.dragging) return
      const cam = this.cameras.main
      const v = cam.worldView
      const mx = v.width * 0.2
      const my = v.height * 0.2
      let tx = cam.scrollX
      let ty = cam.scrollY
      if (f.sprite.x < v.x + mx) tx -= v.x + mx - f.sprite.x
      if (f.sprite.x > v.right - mx) tx += f.sprite.x - (v.right - mx)
      if (f.sprite.y < v.y + my) ty -= v.y + my - f.sprite.y
      if (f.sprite.y > v.bottom - my) ty += f.sprite.y - (v.bottom - my)
      cam.scrollX += (tx - cam.scrollX) * 0.12
      cam.scrollY += (ty - cam.scrollY) * 0.12
    }

    announce() {
      const f = this.figs[this.active]
      if (f) callbacks.onActiveChange?.(f.def.id, f.def.manifest.name)
    }

    update(time: number) {
      // Real elapsed time, not Phaser's smoothed delta: the smoothing pins a
      // step to 1/60 s even when a slow device only manages a few frames a
      // second, and everyone would walk in slow motion.
      const dt = Math.min(MAX_STEP, this.lastTime ? (time - this.lastTime) / 1000 : 0)
      this.lastTime = time
      this.tickMarker(time)
      this.keyWalk(dt)

      // Walk.
      for (const f of this.figs) {
        if (f.path.length > 0) {
          const target = f.path[0]
          const dx = target.x - f.sprite.x
          const dy = target.y - f.sprite.y
          const dist = Math.hypot(dx, dy)
          const step = WALK_SPEED * dt
          const facing = dist > 0.01 ? facingFor(dx, dy) : f.facing
          if (facing !== f.facing || f.state !== "walk") {
            f.facing = facing
            this.play(f, "walk")
          }
          if (dist <= step) {
            f.sprite.setPosition(target.x, target.y)
            f.path.shift()
            if (f.path.length === 0) this.play(f, "idle")
          } else {
            f.sprite.setPosition(f.sprite.x + (dx / dist) * step, f.sprite.y + (dy / dist) * step)
          }
        }
        f.sprite.setDepth(f.sprite.y)
        f.shadow.setPosition(f.sprite.x, f.sprite.y).setDepth(f.sprite.y - 0.5)
        f.glow.setPosition(f.sprite.x, f.sprite.y - S * 0.5)
      }

      const lead = this.figs[this.active]
      if (lead && (lead.state === "walk" || this.held.size > 0)) this.follow()

      // Mist drifts on its own as well as with the camera.
      if (this.mist) {
        this.mist.tilePositionX = time * 0.006
        this.mist.tilePositionY = time * 0.002
      }

      // Darkness with light pools.
      const ctx: CanvasRenderingContext2D = this.darkTex.getContext()
      // Draw in world px; the transform shrinks it onto the smaller canvas.
      ctx.setTransform(1 / DARK_SCALE, 0, 0, 1 / DARK_SCALE, 0, 0)
      const w = worldW + MARGIN * 2
      const h = worldH + MARGIN * 2
      ctx.globalCompositeOperation = "source-over"
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = `rgba(0,0,0,${DARKNESS})`
      ctx.fillRect(0, 0, w, h)
      ctx.globalCompositeOperation = "destination-out"
      const pool = (x: number, y: number, r: number, strength: number) => {
        const g = ctx.createRadialGradient(x + MARGIN, y + MARGIN, 0, x + MARGIN, y + MARGIN, r)
        g.addColorStop(0, `rgba(0,0,0,${strength})`)
        g.addColorStop(0.5, `rgba(0,0,0,${strength * 0.6})`)
        g.addColorStop(1, "rgba(0,0,0,0)")
        ctx.fillStyle = g
        ctx.fillRect(x + MARGIN - r, y + MARGIN - r, r * 2, r * 2)
      }
      for (let i = 0; i < this.braziers.length; i++) {
        const b = this.braziers[i]
        const light = lit[i].light!
        const t = time / 1000 + b.phase
        const wobble = 1 + light.flicker * (0.6 * Math.sin(t * 7.3) + 0.4 * Math.sin(t * 13.1))
        const r = light.radius * wobble
        pool(b.x, b.y, r, 1)
        b.glow.setScale((r * 1.4) / 128).setAlpha(0.8 + 0.2 * Math.sin(t * 9))
      }
      for (const f of this.figs) pool(f.sprite.x, f.sprite.y - S * 0.4, FIGURE_LIGHT_RADIUS, 1)
      if (this.water && node.waterfall) {
        this.water.tilePositionY = -time * WATER_SPEED
        this.streaks.tilePositionY = -time * STREAK_SPEED
        this.foam.forEach((f, i) => {
          f.tilePositionX = time * (i % 2 ? 0.05 : -0.04)
          f.setAlpha(0.75 + 0.25 * Math.sin(time / 90 + i * 1.7))
        })
        const wx = (node.waterfall.x + node.waterfall.width / 2) * S
        for (let y = 0; y <= worldH; y += 64) pool(wx, y, 46 * node.waterfall.width, 0.75)
      }
      ctx.globalCompositeOperation = "source-over"
      this.darkTex.refresh()
    }
  }
}
