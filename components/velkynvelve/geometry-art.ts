/**
 * DRAWING A GEOMETRY NODE — octagon platforms, woven rope bridges at any
 * angle, cage bars and locked gates.
 *
 * Platforms and bridges are painted pixel by pixel into canvases rather
 * than stroked as paths: a path at 45° is anti-aliased into mush, while a
 * per-pixel rule keeps every edge a hard pixel edge like the rest of the
 * art. Bars and gates are separate objects so they sort by their feet with
 * the figures (someone standing inside the pen is in front of the far bars
 * and behind the near ones).
 */
import type { LoadedNode } from "@/lib/velkynvelve/node"
import { insideOctagon, octagonCorners, type RopeBridge } from "@/lib/velkynvelve/geometry"

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GeometryArtOptions {
  /** Source px per square. */
  S: number
  /** Texture key of a single iron bar (origin bottom-centre). */
  barKey: string
  barHeight: number
  /** The stone tile the platforms are paved with. */
  stone: CanvasImageSource | null
}

type RGBA = [number, number, number, number]

function hex(h: string, a = 255): RGBA {
  const n = parseInt(h.replace("#", ""), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]
}

/** Deterministic noise from a pixel position — the same every load. */
function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = (h ^ (h >>> 13)) * 1274126177
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

/* ---------------------------------------------------------------- floors */

const UNDERSIDE = 10 // px of rock visible below a platform's rim

export function paintPlatforms(ctx: CanvasRenderingContext2D, node: LoadedNode, o: GeometryArtOptions) {
  const g = node.geometry!
  const { S } = o
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data

  let stone: Uint8ClampedArray | null = null
  let tw = 0
  let th = 0
  if (o.stone) {
    const c = document.createElement("canvas")
    tw = (o.stone as HTMLImageElement).width
    th = (o.stone as HTMLImageElement).height
    c.width = tw
    c.height = th
    const cc = c.getContext("2d")!
    cc.drawImage(o.stone, 0, 0)
    stone = cc.getImageData(0, 0, tw, th).data
  }
  const rimDark = hex("#15121b")
  const rimLit = hex("#8f86a3")
  const groove = hex("#2a2533")
  const under = hex("#221d29")
  const underDeep = hex("#110e15")

  for (const p of g.platforms) {
    const R = p.apothem / Math.cos(Math.PI / 8)
    const x0 = Math.max(0, Math.floor((p.cx - R) * S) - 2)
    const x1 = Math.min(W, Math.ceil((p.cx + R) * S) + 2)
    const y0 = Math.max(0, Math.floor((p.cy - R) * S) - 2)
    const y1 = Math.min(H, Math.ceil((p.cy + R) * S) + UNDERSIDE + 2)
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const sx = (x + 0.5) / S
        const sy = (y + 0.5) / S
        const i = (y * W + x) * 4
        let c: RGBA | null = null
        if (insideOctagon(p, sx, sy)) {
          if (!insideOctagon(p, sx, sy, 2 / S)) c = rimDark
          else if (!insideOctagon(p, sx, sy, 3 / S)) c = rimLit
          else if (insideOctagon(p, sx, sy, 0.62) && !insideOctagon(p, sx, sy, 0.62 + 2 / S)) c = groove
          else if (stone) {
            const j = ((y % th) * tw + (x % tw)) * 4
            // Darken toward the rim, so the platform reads as a disc of stone.
            const edge = Math.min(1, (p.apothem - Math.max(Math.abs(sx - p.cx), Math.abs(sy - p.cy))) / 2)
            const k = 0.72 + 0.28 * edge
            c = [stone[j] * k, stone[j + 1] * k, stone[j + 2] * k, 255]
          } else c = hex("#5a5566")
        } else if (insideOctagon(p, sx, sy - UNDERSIDE / S)) {
          // The rock the platform is cut from, hanging below the rim.
          const depth = (sy * S - (p.cy * S)) / (p.apothem * S + UNDERSIDE)
          const n = hash(x, y) * 0.25
          c = depth > 0.9 || n > 0.22 ? underDeep : under
        }
        if (c) {
          d[i] = c[0]
          d[i + 1] = c[1]
          d[i + 2] = c[2]
          d[i + 3] = c[3]
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

/* --------------------------------------------------------------- bridges */

const HEMP = hex("#a8844f")
const HEMP_LIT = hex("#d2b07a")
const HEMP_DARK = hex("#5b4226")
const HEMP_SHADE = hex("#2e2012")
const WEB = hex("#c9cfd8", 120)

/** Which part of a bridge a pixel belongs to: the walkway, or the sides. */
type RopePart = "deck" | "side"

/**
 * One rope bridge in the bridge's own frame: u runs along it (px from a),
 * v across it (px from the centre line). Returns a colour and the part it
 * belongs to, or null (a gap — the abyss shows through).
 */
function ropeAt(u: number, v: number, half: number, len: number): { c: RGBA; part: RopePart } | null {
  const av = Math.abs(v)
  if (u < 0 || u > len || av > half) return null
  // Hand ropes along both sides, twisted, with a knot every 16 px.
  if (av > half - 3 && av <= half) {
    const knot = u % 16 < 3
    if (av > half - 1) return { c: knot ? HEMP_SHADE : HEMP_DARK, part: "side" }
    return { c: (Math.floor(u) + Math.floor(av)) % 3 === 0 ? HEMP_LIT : knot ? HEMP_DARK : HEMP, part: "side" }
  }
  // Ties from the hand rope down to the deck.
  if (av > half - 6 && av <= half - 3) return u % 16 < 1.5 ? { c: HEMP_DARK, part: "side" } : null
  // The deck: ropes laid along the bridge every 5 px, woven through by
  // cross ropes every 7 px. Everything between them is open air.
  const lane = (v + half) % 5
  const cross = u % 7
  if (cross < 1.2) return { c: (Math.floor(v) & 1) === 0 ? HEMP_DARK : HEMP, part: "deck" }
  if (lane < 1.2) return { c: Math.floor(u) % 3 === 0 ? HEMP_LIT : HEMP, part: "deck" }
  if (lane < 2.2) return { c: HEMP_SHADE, part: "deck" }
  return null
}

/** Cobweb strands off a bridge's side: a few fans at hashed places. */
function webAt(u: number, v: number, half: number, seed: number): RGBA | null {
  const av = Math.abs(v)
  if (av <= half || av > half + 14) return null
  const spot = Math.floor(u / 70)
  if (hash(spot, seed) > 0.55) return null
  const cu = spot * 70 + 35
  const du = u - cu
  const out = av - half
  for (const k of [-1.1, -0.4, 0.4, 1.1]) if (Math.abs(du - k * out) < 0.6) return WEB
  if (Math.abs(out - 6) < 0.5 && Math.abs(du) < 8) return WEB
  if (Math.abs(out - 11) < 0.5 && Math.abs(du) < 12) return WEB
  return null
}

export function paintBridges(ctx: CanvasRenderingContext2D, node: LoadedNode, o: GeometryArtOptions) {
  const g = node.geometry!
  const { S } = o
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const img = ctx.getImageData(0, 0, W, H)
  const d = img.data
  // Every bridge in its own frame, so each pixel can ask "is this also on
  // another bridge's walkway?" Where two bridges meet, neither may draw its
  // hand ropes, ties or cobwebs across the other's deck, or the join is
  // fenced shut; and only one deck is drawn in the overlap — the bridge
  // listed first owns the crossing, so a branch runs cleanly into the
  // bridge it leaves from instead of weaving a second pattern over it.
  const frames = g.bridges.map((br) => {
    const ax = br.a[0] * S
    const ay = br.a[1] * S
    const bx = br.b[0] * S
    const by = br.b[1] * S
    const len = Math.hypot(bx - ax, by - ay)
    return { ax, ay, bx, by, len, ux: (bx - ax) / len, uy: (by - ay) / len, half: (br.width * S) / 2 - 3 }
  })
  /** The first other bridge whose walkway covers this pixel, or -1. */
  const otherDeck = (x: number, y: number, self: number) =>
    frames.findIndex((f, j) => {
      if (j === self) return false
      const px = x - f.ax
      const py = y - f.ay
      const u = px * f.ux + py * f.uy
      const v = -px * f.uy + py * f.ux
      return u >= 0 && u <= f.len && Math.abs(v) <= f.half
    })
  g.bridges.forEach((br: RopeBridge, bi) => {
    const { ax, ay, bx, by, len, ux, uy, half } = frames[bi]
    const pad = half + 16
    const minX = Math.max(0, Math.floor(Math.min(ax, bx) - pad))
    const maxX = Math.min(W, Math.ceil(Math.max(ax, bx) + pad))
    const minY = Math.max(0, Math.floor(Math.min(ay, by) - pad))
    const maxY = Math.min(H, Math.ceil(Math.max(ay, by) + pad))
    for (let y = minY; y < maxY; y++) {
      for (let x = minX; x < maxX; x++) {
        const px = x + 0.5 - ax
        const py = y + 0.5 - ay
        const u = px * ux + py * uy
        const v = -px * uy + py * ux
        const i = (y * W + x) * 4
        if (d[i + 3] === 255) continue // a platform (or an earlier bridge) is already here
        const rope = ropeAt(u, v, half, len)
        const other = otherDeck(x + 0.5, y + 0.5, bi)
        if (other !== -1 && other < bi) continue // the earlier bridge owns this crossing
        const shared = other !== -1
        let c: RGBA | null = null
        if (rope) c = rope.part === "side" && shared ? null : rope.c
        else if (!shared) c = webAt(u, v, half, bi + 1)
        if (!c) continue
        d[i] = c[0]
        d[i + 1] = c[1]
        d[i + 2] = c[2]
        d[i + 3] = c[3]
      }
    }
  })
  ctx.putImageData(img, 0, 0)
}

/* ---------------------------------------------------------- bars & gates */

/**
 * Bars round every caged platform's rim, except where a gated bridge
 * leaves it — there the gate stands instead, flush in the same line.
 */
export function buildCage(scene: any, node: LoadedNode, o: GeometryArtOptions) {
  const g = node.geometry!
  const { S, barKey, barHeight } = o
  for (const p of g.platforms) {
    if (!p.bars) continue
    const corners = octagonCorners(p)
    // Bridges leaving this platform through a gate: keep their mouths clear.
    const mouths = g.gates
      .map((gt) => g.bridges.find((b) => b.id === gt.bridge))
      .filter((b): b is RopeBridge => !!b && insideOctagon(p, b.a[0], b.a[1], -0.5))
    const inMouth = (x: number, y: number) =>
      mouths.some((b) => Math.hypot(x - b.a[0], y - b.a[1]) < b.width / 2 + 0.15)
    for (let i = 0; i < 8; i++) {
      const [x1, y1] = corners[i]
      const [x2, y2] = corners[(i + 1) % 8]
      const steep = Math.abs(y2 - y1) > Math.abs(x2 - x1) * 1.5
      const len = Math.hypot(x2 - x1, y2 - y1) * S
      const step = steep ? 3 : 5
      for (let s = 0; s <= len; s += step) {
        const t = s / len
        const sx = x1 + (x2 - x1) * t
        const sy = y1 + (y2 - y1) * t
        if (inMouth(sx, sy)) continue
        // Pull the bars a hair inside the rim so they stand on the stone.
        const ix = sx + (p.cx - sx) * (3 / S / p.apothem)
        const iy = sy + (p.cy - sy) * (3 / S / p.apothem)
        const bar = scene.add.image(ix * S, iy * S, barKey).setOrigin(0.5, 1).setDepth(iy * S)
        if (steep) bar.setAlpha(0.85)
      }
      // Top rail.
      const rail = scene.add.graphics().setDepth(Math.max(y1, y2) * S - 1)
      rail.lineStyle(2, 0x2a2631, 1)
      rail.lineBetween(x1 * S, y1 * S - barHeight + 1, x2 * S, y2 * S - barHeight + 1)
    }
  }
  for (const gt of g.gates) {
    const b = g.bridges.find((br) => br.id === gt.bridge)
    if (b) buildGate(scene, b, o)
  }
}

/**
 * A locked gate across a bridge's platform end, made to be seen from across
 * the room: two stone gateposts taller than the bars, heavy bars between
 * them, a chain crossed over the leaves and a brass padlock on the chain.
 */
function buildGate(scene: any, b: RopeBridge, o: GeometryArtOptions) {
  const { S, barHeight } = o
  const len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1])
  const ux = (b.b[0] - b.a[0]) / len
  const uy = (b.b[1] - b.a[1]) / len
  // Across the bridge, along the face.
  const nx = -uy
  const ny = ux
  const half = b.width / 2
  const cx = b.a[0] * S
  const cy = b.a[1] * S
  const ends: Array<[number, number]> = [
    [cx - nx * half * S, cy - ny * half * S],
    [cx + nx * half * S, cy + ny * half * S],
  ]
  const H = barHeight + 8
  const baseY = Math.max(ends[0][1], ends[1][1])

  // Leaves: close heavy bars between the posts.
  const leaves = scene.add.graphics().setDepth(baseY - 0.5)
  const steps = Math.max(6, Math.round((half * 2 * S) / 3))
  for (let k = 1; k < steps; k++) {
    const t = k / steps
    const x = ends[0][0] + (ends[1][0] - ends[0][0]) * t
    const y = ends[0][1] + (ends[1][1] - ends[0][1]) * t
    leaves.fillStyle(0x17141c, 1).fillRect(x - 1, y - H + 4, 3, H - 4)
    leaves.fillStyle(0x8d859c, 1).fillRect(x, y - H + 5, 1, H - 6)
  }
  for (const h of [6, 22, H - 4]) {
    leaves.lineStyle(3, 0x17141c, 1).lineBetween(ends[0][0], ends[0][1] - h, ends[1][0], ends[1][1] - h)
  }
  // Chain crossed over the leaves.
  leaves.lineStyle(2, 0x9aa0a8, 1)
  leaves.lineBetween(ends[0][0], ends[0][1] - H + 8, ends[1][0], ends[1][1] - 8)
  leaves.lineBetween(ends[1][0], ends[1][1] - H + 8, ends[0][0], ends[0][1] - 8)

  // Gateposts, one at each end, drawn after the leaves so they frame them.
  for (const [ex, ey] of ends) {
    const post = scene.add.graphics().setDepth(ey + 0.5)
    post.fillStyle(0x0d0b10, 0.5).fillEllipse(ex, ey + 1, 14, 5)
    post.fillStyle(0x3b3545, 1).fillRect(ex - 5, ey - H - 6, 10, H + 6)
    post.fillStyle(0x5d5669, 1).fillRect(ex - 5, ey - H - 6, 10, 3)
    post.fillStyle(0x24202b, 1).fillRect(ex + 3, ey - H - 3, 2, H + 3)
    post.fillStyle(0x6f6780, 1).fillRect(ex - 6, ey - H - 9, 12, 3)
  }

  // The padlock, big and bright, where the chains cross.
  const mx = (ends[0][0] + ends[1][0]) / 2
  const my = (ends[0][1] + ends[1][1]) / 2 - H / 2
  const lock = scene.add.graphics().setDepth(baseY + 1)
  lock.lineStyle(2, 0x6b5a2e, 1).strokeCircle(mx, my - 4, 4)
  lock.fillStyle(0x3a2e14, 1).fillRect(mx - 6, my - 2, 12, 10)
  lock.fillStyle(0xd9b45a, 1).fillRect(mx - 5, my - 1, 10, 8)
  lock.fillStyle(0xf3dc92, 1).fillRect(mx - 5, my - 1, 10, 1)
  lock.fillStyle(0x2a2010, 1).fillRect(mx - 1, my + 2, 2, 3)
}
