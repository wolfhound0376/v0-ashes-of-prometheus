/**
 * NODE GEOMETRY — platforms and bridges as shapes, not painted tiles.
 *
 * The tavern is a painted Wang deck, which can only step in whole squares.
 * The slave pen is an octagon with rope bridges leaving it at 45°, and a
 * square-stepped deck cannot draw that. So a node may instead describe its
 * floor as geometry, in squares:
 *
 *   - platforms: regular octagons (centre + apothem, the distance from the
 *     centre to the middle of a face), stone, optionally caged in bars;
 *   - bridges: straight rope bridges from `a` to `b`, `width` squares wide;
 *   - gates: a locked gate across the `a` end of a bridge.
 *
 * The scene draws the shapes; this file turns them into the same walkable
 * rows the rest of the code already reads ('o' platform, 'b' bridge,
 * 'g' gate), so movement always matches the picture. Pure — no Phaser.
 */

export interface OctagonPlatform {
  id: string
  cx: number
  cy: number
  /** Centre to the middle of a face, in squares. */
  apothem: number
  /** Iron cage bars round the rim (the pen). */
  bars?: boolean
}

export interface RopeBridge {
  id: string
  a: [number, number]
  b: [number, number]
  width: number
}

export interface BridgeGate {
  /** The bridge whose `a` end the gate closes. */
  bridge: string
  leadsTo: string
  /** From the book (true) or the table's own addition (false). */
  canon: boolean
  locked: boolean
  lockDc?: number
  lockNote?: string
}

export interface NodeGeometry {
  platforms: OctagonPlatform[]
  bridges: RopeBridge[]
  gates: BridgeGate[]
}

/** How deep a gate is, measured along its bridge from the platform face (squares). */
export const GATE_DEPTH = 1

/** The eight corners of a regular octagon with flat faces N, E, S, W. */
export function octagonCorners(p: OctagonPlatform): Array<[number, number]> {
  // Circumradius from apothem: R = a / cos(22.5°).
  const R = p.apothem / Math.cos(Math.PI / 8)
  const pts: Array<[number, number]> = []
  for (let i = 0; i < 8; i++) {
    const t = Math.PI / 8 + (i * Math.PI) / 4
    pts.push([p.cx + R * Math.cos(t), p.cy + R * Math.sin(t)])
  }
  return pts
}

/** Is a point inside the octagon, shrunk by `inset` squares? */
export function insideOctagon(p: OctagonPlatform, x: number, y: number, inset = 0): boolean {
  const dx = Math.abs(x - p.cx)
  const dy = Math.abs(y - p.cy)
  const a = p.apothem - inset
  return dx <= a && dy <= a && (dx + dy) / Math.SQRT2 <= a
}

/** Distance from a point to a bridge's centre line, and how far along it (0..1). */
export function alongBridge(br: RopeBridge, x: number, y: number): { dist: number; t: number; len: number } {
  const [ax, ay] = br.a
  const [bx, by] = br.b
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy)
  const t = ((x - ax) * dx + (y - ay) * dy) / (len * len)
  const px = ax + dx * t
  const py = ay + dy * t
  return { dist: Math.hypot(x - px, y - py), t, len }
}

/**
 * Walkable rows for a node described by geometry. A square counts as
 * platform when its centre is inside an octagon, bridge when its centre
 * lies within half the bridge's width of the centre line, and gate when
 * it is bridge within GATE_DEPTH of a gated bridge's platform end.
 */
export function walkableFromGeometry(g: NodeGeometry, squares: number): string[] {
  const gated = new Set(g.gates.map((gt) => gt.bridge))
  const rows: string[] = []
  for (let y = 0; y < squares; y++) {
    let row = ""
    for (let x = 0; x < squares; x++) {
      const cx = x + 0.5
      const cy = y + 0.5
      let c = "."
      for (const br of g.bridges) {
        const { dist, t, len } = alongBridge(br, cx, cy)
        if (dist <= br.width / 2 && t >= 0 && t <= 1) {
          c = gated.has(br.id) && t * len <= GATE_DEPTH ? "g" : c === "g" ? "g" : "b"
        }
      }
      for (const p of g.platforms) if (insideOctagon(p, cx, cy, 0.25)) c = "o"
      row += c
    }
    rows.push(row)
  }
  return rows
}
