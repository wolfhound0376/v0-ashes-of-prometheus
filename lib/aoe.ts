// ============================================================================
// AREA OF EFFECT — which squares a shape actually covers.
//
// ONE definition, imported by BOTH the board and the cast handler.
//
// That is the whole point of this file. The board draws a template and the
// server decides who was standing in it, and if those are two pieces of code
// they will disagree — not in theory, but on the night, when a player watches
// a drow glow inside the Fireball outline and then take nothing. This codebase
// has already learned that lesson twice (the dash band, the healing-word side
// check), and both times the fix was to make one function answer the question
// for everyone.
//
// So: no Three.js in here, no Supabase, no React. Grid squares in, grid
// squares out. It runs identically in the browser and in the route handler.
// ============================================================================

import type { AreaSpec } from "./spellbook"

export interface Cell {
  x: number
  y: number
}

/** One definition of a square, shared with the movement code and the server. */
export const FEET_PER_SQUARE = 5

const key = (c: Cell) => `${c.x},${c.y}`

/**
 * Which squares the shape covers.
 *
 * `origin` is the caster's square. `aim` is the square the player is pointing
 * at — the CENTRE for a point-origin shape, and merely a DIRECTION for a
 * self-origin one (a cone opens from the caster toward the cursor; where
 * exactly the cursor sits along that line does not change the shape).
 *
 * Returns squares in no particular order, deduplicated. Bounds are the
 * caller's business: the board clips to the map and the server ignores
 * squares nothing is standing in, so clipping here would only duplicate work
 * that both sides already do.
 */
export function areaCells(area: AreaSpec, origin: Cell, aim: Cell): Cell[] {
  const out = new Map<string, Cell>()
  const push = (x: number, y: number) => {
    const c = { x, y }
    out.set(key(c), c)
  }

  // Radius/edge/length in SQUARES. Kept fractional deliberately — Flaming
  // Sphere's 2.5 ft radius is half a square, and rounding it up to a full one
  // would double the spell.
  const size = area.sizeFt / FEET_PER_SQUARE

  // Where the shape is anchored, and which way it faces.
  const anchor: Cell = area.origin === "self" ? origin : aim
  const dx = aim.x - origin.x
  const dy = aim.y - origin.y
  const len = Math.hypot(dx, dy)
  // A cursor sitting exactly on the caster gives no direction at all. Default
  // to "north" rather than returning nothing: a template that vanishes when
  // the mouse crosses your own token reads as a bug.
  const ux = len > 0.0001 ? dx / len : 0
  const uy = len > 0.0001 ? dy / len : -1

  switch (area.shape) {
    // A sphere and a cylinder cover the same squares. The difference is
    // height, and this board has one floor.
    case "sphere":
    case "cylinder": {
      const r = Math.ceil(size)
      for (let x = anchor.x - r; x <= anchor.x + r; x++) {
        for (let y = anchor.y - r; y <= anchor.y + r; y++) {
          // Centre-to-centre. A square counts when its middle is inside the
          // circle, which is the common VTT reading and the one that makes a
          // 20 ft radius cover the 4-square span players expect.
          if (Math.hypot(x - anchor.x, y - anchor.y) <= size) push(x, y)
        }
      }
      break
    }

    case "cube": {
      const edge = Math.max(1, Math.round(size))
      if (area.origin === "self") {
        // Thunderwave: the cube's near face is ON the caster, and it extends
        // away in the direction being aimed. Snapped to an axis, because a
        // cube is axis-aligned by definition and a diagonal one is not a cube.
        const horiz = Math.abs(ux) >= Math.abs(uy)
        const sx = horiz ? Math.sign(ux) || 1 : 0
        const sy = horiz ? 0 : Math.sign(uy) || 1
        for (let i = 0; i < edge; i++) {
          for (let j = -Math.floor((edge - 1) / 2); j <= Math.floor(edge / 2); j++) {
            push(
              origin.x + sx * (i + 1) + (horiz ? 0 : j),
              origin.y + sy * (i + 1) + (horiz ? j : 0),
            )
          }
        }
      } else {
        // Centred on the clicked square. An even-edged cube cannot be
        // perfectly centred on one square; it leans toward the origin corner,
        // which is what a player dragging a template expects.
        const lo = -Math.floor((edge - 1) / 2)
        const hi = Math.floor(edge / 2)
        for (let x = anchor.x + lo; x <= anchor.x + hi; x++) {
          for (let y = anchor.y + lo; y <= anchor.y + hi; y++) push(x, y)
        }
      }
      break
    }

    case "cone": {
      // Measured ALONG the axis and OFF it, not radially.
      //
      // The obvious build tests the angle and cuts at a radial distance, and
      // it is wrong at the wide end: the cells out at the corners of the mouth
      // sit further than `size` from the origin as the crow flies, so a radial
      // cutoff deletes exactly the squares that make a cone a cone. Burning
      // Hands came out covering five squares instead of seven — a thin spike
      // rather than a spray, caught by drawing it on a grid and counting.
      //
      // SRD 5.1 states the rule directly: "A cone's width at a given point
      // along its length is equal to that point's distance from the point of
      // origin." So: depth along the axis, half-width equal to half that depth.
      const r = Math.ceil(size)
      for (let x = origin.x - r; x <= origin.x + r; x++) {
        for (let y = origin.y - r; y <= origin.y + r; y++) {
          const vx = x - origin.x
          const vy = y - origin.y
          if (vx === 0 && vy === 0) continue   // the caster's own square is not in it
          const along = vx * ux + vy * uy
          if (along <= 0 || along > size) continue
          const off = Math.abs(vx * uy - vy * ux)
          if (off <= along / 2) push(x, y)
        }
      }
      break
    }

    case "line": {
      const halfW = Math.max(0.5, (area.widthFt ?? FEET_PER_SQUARE) / FEET_PER_SQUARE / 2)
      const r = Math.ceil(size)
      for (let x = origin.x - r; x <= origin.x + r; x++) {
        for (let y = origin.y - r; y <= origin.y + r; y++) {
          const vx = x - origin.x
          const vy = y - origin.y
          if (vx === 0 && vy === 0) continue
          // How far ALONG the line, and how far OFF it.
          const along = vx * ux + vy * uy
          if (along <= 0 || along > size) continue
          const off = Math.abs(vx * uy - vy * ux)
          if (off <= halfW) push(x, y)
        }
      }
      break
    }
  }

  return Array.from(out.values())
}

/**
 * Is the aimed square within the spell's reach?
 *
 * Chebyshev, matching targetStatus on the board and the move code's notion of
 * a square. A self-origin shape has no range to check — its reach IS its
 * shape — so it always passes.
 */
export function aimInRange(area: AreaSpec, rangeFt: number, origin: Cell, aim: Cell): boolean {
  if (area.origin === "self" || rangeFt <= 0) return true
  const squares = Math.max(Math.abs(origin.x - aim.x), Math.abs(origin.y - aim.y))
  return squares * FEET_PER_SQUARE <= rangeFt
}

/** Fast membership for callers holding a cell list. */
export function cellSet(cells: Cell[]): Set<string> {
  return new Set(cells.map(key))
}

export const cellKey = key
