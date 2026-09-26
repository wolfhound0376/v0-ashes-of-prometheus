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
import { findPath, type Point } from "@/lib/velkynvelve/pathfinding"

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
/** Pointer travel (screen px) that turns a tap into a drag. */
const DRAG_SLOP = 6

const LIGHT_KEY = "vv-light"
const GLINT_KEY = "vv-glint"
const BAR_KEY = "vv-bar"
const BRIDGE_KEY = "vv-bridges"
const WATER_KEY = "vv-water"
/** Waterfall fall speed, source px per millisecond. */
const WATER_SPEED = 0.22
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
    down: { x: number; y: number; sx: number; sy: number; dragging: boolean } | null = null

    constructor() {
      super({ key: "velkynvelve" })
    }

    preload() {
      this.load.image("vv-deck", node.baseUrl + node.deck)
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

      // 2. The drop beneath the planks.
      for (const [ox, oy, a] of [
        [7, 17, 0.28],
        [3, 8, 0.45],
      ] as const) {
        this.add
          .image(ox, oy, "vv-deck")
          .setOrigin(0, 0)
          .setTint(0x000000)
          .setTintMode(Phaser.TintModes.FILL)
          .setAlpha(a)
          .setDepth(-50)
      }
      // 3. The deck, and any rope bridges leading off it.
      this.add.image(0, 0, "vv-deck").setOrigin(0, 0).setDepth(-40)
      this.buildBridges()

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

      // 4a'. Cage bars along the rim, when the node has them.
      if (node.edge === "bars") this.buildBars()

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
      this.darkTex = this.textures.createCanvas("vv-dark", worldW + MARGIN * 2, worldH + MARGIN * 2)
      this.add
        .image(-MARGIN, -MARGIN, "vv-dark")
        .setOrigin(0, 0)
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
      cam.centerOn(keep(deckCx, lead?.x, viewW), keep(deckCy, lead?.y, viewH))
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
     * Bars stand on every edge where a standable square meets the drop.
     * Each bar is its own image sorted by its foot, so a figure standing
     * inside the pen is drawn in front of the far bars and behind the near
     * ones. Where the pen meets a gate square the bars become the gate,
     * flush with the rest of the wall; props block movement, not the view,
     * so they get no bars.
     */
    buildBars() {
      const open = (x: number, y: number) => node.walkable[y]?.[x] === "o"
      const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < node.squares && y < node.squares
      const rail = this.add.graphics().setDepth(-1)
      const put = (x: number, y: number) => {
        this.add.image(x, y, BAR_KEY).setOrigin(0.5, 1).setDepth(y)
      }
      for (let sy = 0; sy < node.squares; sy++) {
        for (let sx = 0; sx < node.squares; sx++) {
          if (!open(sx, sy)) continue
          const x0 = sx * S
          const y0 = sy * S
          const sides: Array<[number, number, "h" | "v", number]> = [
            [sx, sy - 1, "h", y0 + 2],
            [sx, sy + 1, "h", y0 + S - 1],
            [sx - 1, sy, "v", x0 + 2],
            [sx + 1, sy, "v", x0 + S - 2],
          ]
          for (const [nx, ny, dir, at] of sides) {
            const next = inGrid(nx, ny) ? node.walkable[ny][nx] : "."
            if (next === "o" || next === "b") continue
            if (next === "g") {
              this.buildGate(dir, at, x0, y0)
              continue
            }
            if (dir === "h") {
              for (let x = x0 + 2; x < x0 + S; x += BAR_GAP) put(x, at)
              rail.lineStyle(2, 0x2a2631, 1).lineBetween(x0, at - BAR_HEIGHT + 1, x0 + S, at - BAR_HEIGHT + 1)
            } else {
              // Seen end-on from above, a run of bars would collapse into a
              // one-pixel line. Draw it as the strip the eye expects: a
              // shadowed band with the bars' tops ticked across it.
              this.buildSideBars(at, y0, 5, BAR_GAP, 0.4)
            }
          }
        }
      }
    }

    /** A side wall of bars (or a gate, when heavier), as a ticked strip from bar top to foot. */
    buildSideBars(at: number, y0: number, width: number, gap: number, shade: number, tick = 0x6a6275) {
      const g = this.add.graphics().setDepth(y0 + S)
      const top = y0 - BAR_HEIGHT
      g.fillStyle(0x0c0a10, shade).fillRect(at - width / 2, top, width, S + BAR_HEIGHT)
      for (let y = top; y <= y0 + S; y += gap) {
        g.fillStyle(0x15131a, 1).fillRect(at - width / 2, y, width, 2)
        g.fillStyle(tick, 1).fillRect(at - width / 2, y, width, 1)
      }
      g.fillStyle(0x2a2631, 1).fillRect(at - width / 2 - 1, top, 1, S)
      g.fillStyle(0x2a2631, 1).fillRect(at + width / 2, top + BAR_HEIGHT, 1, S)
      return g
    }

    /** A locked gate in the line of the bars: closer bars, two crossbars and a lock plate. */
    buildGate(dir: "h" | "v", at: number, x0: number, y0: number) {
      const g = this.add.graphics()
      const iron = 0x1b1820
      const lit = 0x7a7285
      if (dir === "h") {
        g.setDepth(at)
        for (let x = x0 + 1; x < x0 + S; x += 3) {
          g.fillStyle(iron, 1).fillRect(x, at - BAR_HEIGHT - 2, 2, BAR_HEIGHT + 2)
          g.fillStyle(lit, 1).fillRect(x, at - BAR_HEIGHT - 1, 1, BAR_HEIGHT)
        }
        for (const h of [8, 24, BAR_HEIGHT]) g.fillStyle(iron, 1).fillRect(x0, at - h - 1, S, 3)
        g.fillStyle(0x3a3440, 1).fillRect(x0 + S / 2 - 4, at - 22, 8, 9)
        g.fillStyle(0xb09a5a, 1).fillRect(x0 + S / 2 - 1, at - 19, 2, 3)
      } else {
        // Heavier than the wall beside it: wider, denser, crossbars, a lock.
        g.destroy()
        const side = this.buildSideBars(at, y0, 9, 3, 0.6, 0x9a92a8)
        for (const dx of [-4, 4]) side.fillStyle(iron, 1).fillRect(at + dx - 1, y0 - BAR_HEIGHT, 2, S + BAR_HEIGHT)
        side.fillStyle(0x3a3440, 1).fillRect(at - 7, y0 + S / 2 - 26, 14, 16)
        side.fillStyle(0xc9a95c, 1).fillRect(at - 6, y0 + S / 2 - 25, 12, 1)
        side.fillStyle(0xc9a95c, 1).fillRect(at - 1, y0 + S / 2 - 21, 3, 6)
      }
    }

    /**
     * Rope bridges: planks laid across the direction of travel, rope rails
     * and posts wherever a side faces the drop, drawn once into one texture
     * that casts the same shadow as the deck. A square with bridge on all
     * four sides is a junction and gets a boxed platform. Off the map counts
     * as more bridge — the walkway carries on to the next node.
     */
    buildBridges() {
      const at = (x: number, y: number) =>
        x < 0 || y < 0 || x >= node.squares || y >= node.squares ? "edge" : node.walkable[y][x]
      const joins = (c: string) => c === "b" || c === "g" || c === "o" || c === "edge"
      const cells: Array<[number, number]> = []
      node.walkable.forEach((row, y) => [...row].forEach((c, x) => (c === "b" || c === "g") && cells.push([x, y])))
      if (cells.length === 0) return

      const tex = this.textures.createCanvas(BRIDGE_KEY, worldW, worldH)
      const ctx: CanvasRenderingContext2D = tex.getContext()
      let seed = 99
      const rnd = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      const woods = ["#5a4330", "#4d3a2a", "#634a35", "#57422f", "#4a3727"]
      const plank = (x: number, y: number, w: number, h: number) => {
        ctx.fillStyle = woods[Math.floor(rnd() * woods.length)]
        ctx.fillRect(x, y, w, h)
        ctx.fillStyle = "rgba(255,230,190,0.18)"
        if (w > h) ctx.fillRect(x, y, w, 1)
        else ctx.fillRect(x, y, 1, h)
        ctx.fillStyle = "#231a13"
        if (w > h) {
          ctx.fillRect(x + 2, y + Math.floor(h / 2), 1, 1)
          ctx.fillRect(x + w - 3, y + Math.floor(h / 2), 1, 1)
        } else {
          ctx.fillRect(x + Math.floor(w / 2), y + 2, 1, 1)
          ctx.fillRect(x + Math.floor(w / 2), y + h - 3, 1, 1)
        }
      }
      const runOf = (x: number, y: number) => {
        const up = joins(at(x, y - 1))
        const down = joins(at(x, y + 1))
        const left = joins(at(x - 1, y))
        const right = joins(at(x + 1, y))
        return { vertical: (up && down) || (!(left && right) && (up || down)), horizontal: left && right }
      }
      const isJunction = (x: number, y: number) => {
        const c = at(x, y)
        if (c !== "b") return false
        const r = runOf(x, y)
        return r.vertical && r.horizontal
      }
      for (const [x, y] of cells) {
        const x0 = x * S
        const y0 = y * S
        const { vertical, horizontal } = runOf(x, y)
        // The gaps between planks are left empty: the abyss shows through,
        // which is most of what makes a rope bridge look like one.
        const c = node.walkable[y][x]
        const skip = () => c === "b" && rnd() < 0.06
        if (vertical && horizontal) {
          // Junction: a solid lashed platform with a heavy frame.
          ctx.fillStyle = "#1c140e"
          ctx.fillRect(x0, y0, S, S)
          for (let py = y0 + 1; py < y0 + S; py += 5) plank(x0 + 1, py, S - 2, 4)
          // Frame the platform where it meets plain bridge.
          ctx.fillStyle = "#2a1f16"
          if (!isJunction(x, y - 1)) ctx.fillRect(x0, y0, S, 3)
          if (!isJunction(x, y + 1)) ctx.fillRect(x0, y0 + S - 3, S, 3)
          if (!isJunction(x - 1, y)) ctx.fillRect(x0, y0, 3, S)
          if (!isJunction(x + 1, y)) ctx.fillRect(x0 + S - 3, y0, 3, S)
        } else if (vertical) {
          for (let py = y0; py < y0 + S; py += 6) if (!skip()) plank(x0 + 3 + Math.round(rnd() * 2 - 1), py, S - 6, 4)
        } else {
          for (let px = x0; px < x0 + S; px += 6) if (!skip()) plank(px, y0 + 3 + Math.round(rnd() * 2 - 1), 4, S - 6)
        }
        // Rope rails and posts on every side that faces the drop.
        // Two side ropes: the plank lashing and, a little outside it, the
        // hand line, twisted (alternating light and dark pixels).
        const rope = (x1: number, y1: number, x2: number, y2: number) => {
          const horiz = y1 === y2
          const len = horiz ? Math.abs(x2 - x1) : Math.abs(y2 - y1)
          for (let i = 0; i < len; i++) {
            const px = horiz ? Math.min(x1, x2) + i : x1
            const py = horiz ? y1 : Math.min(y1, y2) + i
            ctx.fillStyle = "#24180d"
            ctx.fillRect(px + (horiz ? 0 : 1), py + (horiz ? 1 : 0), horiz ? 1 : 2, horiz ? 2 : 1)
            ctx.fillStyle = i % 3 === 0 ? "#6e5431" : "#b8925a"
            ctx.fillRect(px, py, horiz ? 1 : 2, horiz ? 2 : 1)
          }
        }
        const post = (px: number, py: number) => {
          ctx.fillStyle = "#1a120c"
          ctx.fillRect(px - 3, py - 3, 7, 7)
          ctx.fillStyle = "#6b5238"
          ctx.fillRect(px - 2, py - 2, 4, 4)
          ctx.fillStyle = "#8c6c48"
          ctx.fillRect(px - 2, py - 2, 4, 1)
        }
        if (at(x, y - 1) === ".") {
          rope(x0, y0 + 1, x0 + S, y0 + 1)
          if (x % 2 === 0) post(x0 + 1, y0 + 2)
        }
        if (at(x, y + 1) === ".") {
          rope(x0, y0 + S - 3, x0 + S, y0 + S - 3)
          if (x % 2 === 0) post(x0 + 1, y0 + S - 2)
        }
        if (at(x - 1, y) === ".") {
          rope(x0 + 1, y0, x0 + 1, y0 + S)
          if (y % 2 === 0) post(x0 + 2, y0 + 1)
        }
        if (at(x + 1, y) === ".") {
          rope(x0 + S - 3, y0, x0 + S - 3, y0 + S)
          if (y % 2 === 0) post(x0 + S - 2, y0 + 1)
        }
      }
      tex.refresh()
      for (const [ox, oy, a] of [
        [7, 17, 0.28],
        [3, 8, 0.45],
      ] as const) {
        this.add.image(ox, oy, BRIDGE_KEY).setOrigin(0, 0).setTint(0x000000).setTintMode(Phaser.TintModes.FILL).setAlpha(a).setDepth(-50)
      }
      this.add.image(0, 0, BRIDGE_KEY).setOrigin(0, 0).setDepth(-39)
    }

    /**
     * A waterfall pouring through the abyss: a sheet of falling streaks,
     * scrolled every frame, under the mist so it sits deep in the dark,
     * with a cold glow of its own.
     */
    buildWaterfall() {
      const wf = node.waterfall
      if (!wf) return
      const tw = wf.width * S
      const th = 96
      const t = this.textures.createCanvas(WATER_KEY, tw, th)
      const c: CanvasRenderingContext2D = t.getContext()
      c.fillStyle = "rgba(50,85,130,0.7)"
      c.fillRect(0, 0, tw, th)
      let seed = 4242
      const rnd = () => {
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
      }
      for (let i = 0; i < 35 * wf.width; i++) {
        const x = Math.floor(rnd() * tw)
        const y = Math.floor(rnd() * th)
        const len = 6 + Math.floor(rnd() * 22)
        const light = rnd() > 0.35
        c.fillStyle = light ? `rgba(215,235,255,${0.45 + rnd() * 0.5})` : "rgba(30,55,90,0.7)"
        // Draw twice so the streaks wrap and the texture tiles vertically.
        c.fillRect(x, y, 1, len)
        c.fillRect(x, y - th, 1, len)
      }
      // Feather the sides so it reads as falling water, not a painted slab.
      c.globalCompositeOperation = "destination-in"
      const edge = c.createLinearGradient(0, 0, tw, 0)
      edge.addColorStop(0, "rgba(0,0,0,0)")
      edge.addColorStop(0.18, "rgba(0,0,0,1)")
      edge.addColorStop(0.82, "rgba(0,0,0,1)")
      edge.addColorStop(1, "rgba(0,0,0,0)")
      c.fillStyle = edge
      c.fillRect(0, 0, tw, th)
      c.globalCompositeOperation = "source-over"
      t.refresh()
      const x = wf.x * S
      const w = wf.width * S
      this.water = this.add.tileSprite(x, -MARGIN, w, worldH + MARGIN * 2, WATER_KEY).setOrigin(0, 0).setDepth(-95)
      // Foam where it breaks in over the top of the map.
      this.add
        .image(x + w / 2, -MARGIN / 3, LIGHT_KEY)
        .setScale((w * 2.2) / 128, 1.2)
        .setAlpha(0.7)
        .setDepth(-94)
    }

    addFigure(f: SceneFigure) {
      const [cw, ch] = f.manifest.cell
      const [px, py] = f.manifest.pivot
      const idle = f.manifest.animations.idle ? "idle" : Object.keys(f.manifest.animations)[0]
      const src = this.textures.get(sheetKey(f, idle)).getSourceImage()
      // Scale by the pixels actually drawn, not by the manifest's ppu: two
      // PixelLab characters can fill their cells very differently.
      const scale = (FIGURE_SQUARES * S) / visibleHeight(src, cw, ch)

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
      const rt: FigureRuntime = { def: f, sprite, shadow, glow, facing: f.facing, state: "idle", path: [] }
      this.figs.push(rt)
      this.play(rt, "idle")
    }

    play(f: FigureRuntime, state: SpriteState) {
      const has = f.def.manifest.animations[state]
      const s = has ? state : "idle"
      f.state = s
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
      if (!path || path.length === 0) return
      f.path = path
    }

    announce() {
      const f = this.figs[this.active]
      if (f) callbacks.onActiveChange?.(f.def.id, f.def.manifest.name)
    }

    update(time: number, delta: number) {
      const dt = delta / 1000

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

      // Mist drifts on its own as well as with the camera.
      if (this.mist) {
        this.mist.tilePositionX = time * 0.006
        this.mist.tilePositionY = time * 0.002
      }

      // Darkness with light pools.
      const ctx: CanvasRenderingContext2D = this.darkTex.getContext()
      const w = this.darkTex.width
      const h = this.darkTex.height
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
        const wx = (node.waterfall.x + node.waterfall.width / 2) * S
        for (let y = 0; y <= worldH; y += 64) pool(wx, y, 46 * node.waterfall.width, 0.75)
      }
      ctx.globalCompositeOperation = "source-over"
      this.darkTex.refresh()
    }
  }
}
