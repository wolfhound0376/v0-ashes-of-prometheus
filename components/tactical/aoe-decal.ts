// ============================================================================
// AOE GROUND DECAL — the mark an area spell leaves on the floor.
//
// The board already draws an area spell twice: an ember template while you
// aim, and an impact bloom at the centre point when it lands. Neither of them
// survives the cast. So the twenty squares that actually took 8d6 go unmarked
// the instant the sprite finishes, and a Web — which is not a moment but a
// piece of terrain for the next ten rounds — leaves nothing on the floor at
// all.
//
// This draws the third thing: the squares themselves, exactly the ones
// areaCells() returned, blooming outward from the centre and then either
// fading or staying.
//
// EXACTLY THE CELLS, NOT A CIRCLE
//
// The temptation is one big sprite scaled to the radius. It looks better in a
// screenshot and it lies: a scaled circle does not agree with the grid, so
// the drow standing in the corner square appears to be outside a blast that
// the server just charged him for. The template the player aimed with was
// drawn BY areaCells; the mark it leaves has to be drawn by the same list or
// the board contradicts itself at the one moment players are watching most
// closely.
//
// SIX DRAW CALLS, NOT SIXTY-NINE
//
// A 20 ft radius sphere is 69 squares. A quad and a cloned texture each would
// be 69 materials churning per frame, and this board's standing rule is that
// it stays smooth on a mid-range laptop.
//
// So cells are bucketed by how far they sit from the centre, and each bucket
// is ONE merged geometry sharing ONE material. All the quads in a bucket show
// the same frame at the same opacity — which is not a compromise, it is the
// effect: the buckets are what make the mark bloom outward in a ring rather
// than switching on all at once.
//
// Honours the VfxHandle contract from spell-vfx.ts — update(dt) until false,
// then dispose() — so the board's existing effect loop drives this with no
// special case, and adds `end()` for the lingering ones.
// ============================================================================

import * as THREE from "three"
import type { VfxHandle } from "./spell-vfx"
import { loadSheet } from "./spell-vfx-kit"
import type { Cell } from "@/lib/aoe"
import { type AreaVisual, decalSheet } from "@/lib/aoe-visual"

/**
 * How many distance rings the bloom is quantised into.
 *
 * Six reads as a wave travelling outward at any size we actually cast. Three
 * is a visible pop; twelve costs draw calls to animate a difference no one
 * sees, because past about six the delay between neighbouring rings is under
 * a frame anyway.
 */
const BUCKETS = 6

/**
 * Seconds between one ring lighting and the next.
 *
 * The whole outward wave is therefore ~0.19s at the widest, which is under
 * the shortest bloom in aoe-visual. That ordering matters: the wave must
 * finish before the burn-in does, or the outer ring is still arriving while
 * the centre has already started to settle and the mark reads as ragged.
 */
const RING_DELAY = 0.038

/** Seconds a finished mark takes to fade once it is over. */
const FADE_OUT = 0.55

/**
 * Sits low in the board's y-stack: above the floor art at 0, below the
 * movement bands at 0.035.
 *
 * Deliberate. A blast mark is history — it must never obscure the reach
 * tiles, which are the live answer to "where can I go". Painting the
 * aftermath over the decision would trade a nice-looking floor for a worse
 * turn.
 */
const DECAL_Y = 0.025

/**
 * How tall a gas cloud stands, in squares.
 *
 * Roughly ten feet — head height and then some, so a cloud reads as something
 * you are INSIDE rather than something you are looking over. Shorter than
 * this and it becomes a knee-high mist, which is a different spell.
 */
const CLOUD_HEIGHT = 1.9

/** How far the cloud sinks below the floor line, hiding its bottom edge. */
const CLOUD_SINK = 0.15

export interface AreaDecalHandle extends VfxHandle {
  /**
   * End a lingering mark — concentration broke, the duration ran out, the
   * caster went down.
   *
   * Starts a fade; update() keeps returning true until it finishes, so the
   * caller drops the handle the same way it drops every other effect. Safe to
   * call twice, and safe to call on a non-lingering mark that is already on
   * its way out.
   */
  end(): void
}

interface Bucket {
  mesh: THREE.Mesh
  mat: THREE.MeshBasicMaterial
  geo: THREE.BufferGeometry
  tex: THREE.Texture
  /** When this ring starts, in seconds after the cast. */
  delay: number
}

/**
 * One flat quad per cell, merged into a single geometry.
 *
 * Every quad carries the full 0..1 UV square, so windowing the material's
 * texture to one sheet frame animates all of them together — which is what
 * makes a bucket one draw call instead of a dozen.
 */
/**
 * Which of the four right-angle turns this square's texture is laid at.
 *
 * WITHOUT THIS THE MARK IS A GRID OF IDENTICAL STAMPS.
 *
 * Every quad in a bucket shares one material, which is what makes the bucket
 * one draw call — and it means every quad also shows the same pixels. Twenty
 * squares of the same scorch, edge to edge, does not read as one burnt floor;
 * it reads as wallpaper, and the eye finds the repeat immediately.
 *
 * Rotating each square's UV square by a quarter turn costs nothing at all —
 * it is baked into the geometry once, at build time — and four orientations
 * is enough to break the tiling, because the repeat the eye catches is the
 * one along a straight edge and no two neighbours now share one.
 *
 * Derived from the cell's own coordinates rather than Math.random, so the
 * same square looks the same every time it is drawn. A mark that reshuffles
 * itself when a lingering Web re-renders would be worse than the tiling.
 */
function turnFor(c: Cell): number {
  // An avalanche mix, NOT just two big primes XORed.
  //
  // The first version of this was `(x * 73856093) ^ (y * 19349663)` — the
  // standard spatial-hash pair — and taking it modulo 4 threw away everything
  // that made it a hash. Only the bottom two bits survive %4, and the bottom
  // bits of an odd multiply are just the bottom bits of the input, so the
  // "hash" reduced to (x ^ 3y) mod 4: a perfectly regular pinwheel lattice
  // repeating every four squares. Neighbours never matched, which looks
  // healthy and is the tell — a real hash matches its neighbour a quarter of
  // the time. Trading a grid of identical stamps for a grid of identical
  // pinwheels is not a fix.
  //
  // So the bits are mixed downward first, xorshift-multiply style, and only
  // then reduced. Verified in lib/__tests__/aoe-visual.test.mjs, which asserts
  // the neighbour match rate sits near chance rather than at zero.
  //
  // The final `>>> 0` is load-bearing, not decoration. `^` in JavaScript
  // yields a SIGNED 32-bit int, so once the top bit is set the result is
  // negative — and (-1 % 4) is -1, which indexes UV_TURNS out of bounds and
  // hands undefined to the geometry builder. The test caught it as a skewed
  // turn distribution (25/12/12/12 instead of four even quarters) before it
  // could reach a board.
  let h = (Math.imul(c.x, 0x27d4eb2d) ^ Math.imul(c.y, 0x165667b1)) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0
  return ((h ^ (h >>> 15)) >>> 0) % 4
}

/** The 0..1 UV corners of a quad, turned a quarter at a time. */
const UV_TURNS: [number, number][][] = [
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  [[0, 1], [0, 0], [1, 0], [1, 1]],
  [[1, 1], [0, 1], [0, 0], [1, 0]],
  [[1, 0], [1, 1], [0, 1], [0, 0]],
]

/**
 * A cloud gets MIRRORED, never turned.
 *
 * A quarter turn is fine on a floor mark, which has no up. A standing cloud
 * has a very definite up — it was painted with heavy vapour sinking at the
 * bottom and plumes rising off the top — and rotating it ninety degrees lays
 * the gas on its side. Mirroring left-to-right breaks the repeat without
 * arguing with gravity.
 */
const UV_FLIPS: [number, number][][] = [
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  [[1, 0], [0, 0], [0, 1], [1, 1]],
]

const TRI = [0, 1, 2, 0, 2, 3]

/**
 * One flat quad per cell, merged into a single geometry.
 *
 * Every quad carries a full 0..1 UV square — turned, per turnFor above — so
 * windowing the material's texture to one sheet frame animates all of them
 * together, which is what makes a bucket one draw call instead of a dozen.
 */
function mergedQuads(
  cells: Cell[],
  cellToWorld: (x: number, y: number) => { x: number; z: number },
  size: number,
): THREE.BufferGeometry {
  const h = size / 2
  const pos = new Float32Array(cells.length * 18) // 6 verts * 3
  const uv = new Float32Array(cells.length * 12)  // 6 verts * 2
  cells.forEach((c, i) => {
    const { x, z } = cellToWorld(c.x, c.y)
    const t = UV_TURNS[turnFor(c)]
    // Two triangles over the square's four corners, wound counter-clockwise
    // seen from above. Corner order is fixed; only which UV each corner gets
    // changes with the turn.
    const xy: [number, number][] = [
      [x - h, z - h],
      [x + h, z - h],
      [x + h, z + h],
      [x - h, z + h],
    ]
    TRI.forEach((corner, k) => {
      const p = i * 18 + k * 3
      pos[p] = xy[corner][0]
      pos[p + 1] = 0
      pos[p + 2] = xy[corner][1]
      const q = i * 12 + k * 2
      uv[q] = t[corner][0]
      uv[q + 1] = t[corner][1]
    })
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  return geo
}

/**
 * Two crossed vertical quads per cell — gas standing IN the square.
 *
 * WHY CROSSED QUADS RATHER THAN CAMERA-FACING BILLBOARDS
 *
 * The instinct for smoke is a billboard that turns to face the camera. That
 * cannot be done here: the whole reason a bucket is one draw call is that its
 * cells share one merged geometry, and a shared mesh can only be rotated as a
 * block — swinging it would carry every quad off the square it belongs to.
 * Rotating them individually means one mesh per cell, and a twenty-square
 * Cloudkill becomes twenty draw calls that all overdraw each other.
 *
 * Crossing two quads at ninety degrees is the old foliage trick and it solves
 * exactly this: there is always a face roughly toward the camera at any orbit
 * angle, it costs nothing per frame, and it stays inside the merge. The board
 * orbits but does not go underneath, so the two upright faces are enough.
 *
 * They are also drawn a little wider than the square they sit in, so
 * neighbouring cells overlap into each other rather than lining up as a row
 * of separate puffs with daylight between them.
 */
function mergedCloudQuads(
  cells: Cell[],
  cellToWorld: (x: number, y: number) => { x: number; z: number },
  size: number,
): THREE.BufferGeometry {
  const w = size * 0.78          // half-width, so each cell overlaps its neighbour
  const top = size * CLOUD_HEIGHT
  const bottom = -size * CLOUD_SINK
  const quads = cells.length * 2
  const pos = new Float32Array(quads * 18)
  const uv = new Float32Array(quads * 12)
  cells.forEach((c, i) => {
    const { x, z } = cellToWorld(c.x, c.y)
    const t = UV_FLIPS[turnFor(c) % 2]
    // Quad 0 spans X, quad 1 spans Z. Corners run bottom-left, bottom-right,
    // top-right, top-left so the UV corner order matches the floor case.
    for (let q = 0; q < 2; q++) {
      const along: [number, number][] = q === 0
        ? [[x - w, z], [x + w, z], [x + w, z], [x - w, z]]
        : [[x, z - w], [x, z + w], [x, z + w], [x, z - w]]
      const ys = [bottom, bottom, top, top]
      const base = (i * 2 + q)
      TRI.forEach((corner, k) => {
        const p = base * 18 + k * 3
        pos[p] = along[corner][0]
        pos[p + 1] = ys[corner]
        pos[p + 2] = along[corner][1]
        const o = base * 12 + k * 2
        uv[o] = t[corner][0]
        uv[o + 1] = t[corner][1]
      })
    }
  })
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
  return geo
}

/**
 * Lay the mark for one cast.
 *
 * `cells` must be the list areaCells() returned, already clipped to the map by
 * the caller — the same clipping the template does, so the mark and the
 * outline cover identical ground.
 *
 * `centre` is what the bloom radiates from: the aimed square for a point
 * spell, the caster's square for a cone or a Thunderwave. Passed in rather
 * than derived, because a cone's visual origin is its point and averaging its
 * cells would put the wave's source out in the middle of the spray.
 *
 * Returns immediately with a live handle; the sheet is still loading. Until it
 * arrives the handle animates nothing and draws nothing, which is correct —
 * a mark that pops in late is better than a cast that stalls waiting for a
 * texture.
 */
export function layAreaDecal(opts: {
  parent: THREE.Object3D
  cells: Cell[]
  centre: Cell
  visual: AreaVisual
  cellToWorld: (x: number, y: number) => { x: number; z: number }
  /** Board units per grid square. The board's SQ. */
  squareSize?: number
}): AreaDecalHandle {
  const { parent, cells, centre, visual, cellToWorld } = opts
  const size = opts.squareSize ?? 1

  const cloud = visual.form === "cloud"

  const group = new THREE.Group()
  // A floor mark is pinned under the movement bands; a cloud stands on the
  // floor line itself and gets its height from its geometry.
  group.position.y = cloud ? 0 : DECAL_Y
  parent.add(group)

  let buckets: Bucket[] = []
  let frames = 1
  let fps = 20
  let t = 0
  let ending = false
  let endAt = 0
  let dead = false

  if (cells.length > 0) {
    // Bucket by Chebyshev distance from the centre — the same metric the
    // range check and the movement code use, so the rings the mark blooms in
    // are the rings the rest of the board already thinks in.
    const reach = Math.max(
      1,
      ...cells.map((c) => Math.max(Math.abs(c.x - centre.x), Math.abs(c.y - centre.y))),
    )
    const groups: Cell[][] = Array.from({ length: BUCKETS }, () => [])
    for (const c of cells) {
      const d = Math.max(Math.abs(c.x - centre.x), Math.abs(c.y - centre.y))
      const b = Math.min(BUCKETS - 1, Math.floor((d / reach) * BUCKETS))
      groups[b].push(c)
    }

    void loadSheet(decalSheet(visual.decal))
      .then((sheet) => {
        if (dead) return
        frames = sheet.frames
        fps = sheet.fps
        groups.forEach((cs, i) => {
          if (!cs.length) return
          const tex = sheet.tex.clone()
          tex.needsUpdate = true
          tex.repeat.set(1 / sheet.cols, 1 / sheet.rows)
          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            color: visual.tint,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            // NOT additive, unlike every cast effect in the kit.
            //
            // Additive can only ever brighten, and half of these marks are
            // meant to darken the floor — a scorch that glows is a fire, not
            // a burn. Normal blending lets the sheet's own art decide, which
            // is why the ground textures are baked with dark bodies and lit
            // edges rather than as pure glows.
            blending: THREE.NormalBlending,
            side: THREE.DoubleSide,
            toneMapped: false,
            // A cloud must not z-fight with the cell behind it. Floor marks
            // all share one plane and are ordered explicitly instead.
            depthTest: true,
          })
          const geo = cloud
            ? mergedCloudQuads(cs, cellToWorld, size)
            : mergedQuads(cs, cellToWorld, size)
          const mesh = new THREE.Mesh(geo, mat)
          mesh.frustumCulled = false
          // Every decal shares one plane at one height, so the depth buffer
          // has no opinion about which draws first. Order them explicitly,
          // outward, or overlapping marks flicker against each other.
          mesh.renderOrder = 2 + i
          group.add(mesh)
          buckets.push({ mesh, mat, geo, tex, delay: i * RING_DELAY })
        })
      })
      .catch(() => {
        // No sheet, no mark. The spell still resolved — the server did the
        // damage and the log said so — so a missing texture costs a visual,
        // never an outcome.
      })
  }

  const setFrame = (b: Bucket, i: number) => {
    const sheetCols = Math.round(1 / b.tex.repeat.x)
    const sheetRows = Math.round(1 / b.tex.repeat.y)
    const col = i % sheetCols
    const row = Math.floor(i / sheetCols)
    b.tex.offset.set(col / sheetCols, 1 - (row + 1) / sheetRows)
  }

  return {
    update(dt: number): boolean {
      if (dead) return false
      t += dt

      for (const b of buckets) {
        const local = t - b.delay
        if (local <= 0) {
          b.mat.opacity = 0
          continue
        }

        // Burn-in: play the sheet through once over the bloom window.
        const p = Math.min(1, local / visual.bloom)
        setFrame(b, Math.min(frames - 1, Math.floor(p * frames)))

        if (ending) {
          const fade = Math.max(0, 1 - (t - endAt) / FADE_OUT)
          b.mat.opacity = visual.restOpacity * fade
          continue
        }

        if (p < 1) {
          // Overshoot the rest opacity on the way in — the flare of the
          // moment it lands — then settle back to it. A mark that arrives at
          // its final, deliberately quiet opacity has no impact at all.
          const flare = 1 + (1 - p) * 1.4
          b.mat.opacity = Math.min(1, visual.restOpacity * flare)
        } else if (visual.lingers) {
          // Settled terrain. The sheet keeps turning over slowly so a Web
          // creeps and a fog drifts rather than sitting as a frozen stamp.
          //
          // Gas runs its loop far faster than a floor mark does. A web that
          // creeps is unsettling; a cloud that creeps is a photograph. The
          // poison sheet is cut from real volumetric motion, so playing it
          // near its native rate is what makes the cloud read as gas rather
          // than as a green shape sitting in the room.
          const rate = cloud ? 0.85 : 0.25
          const loop = ((local - visual.bloom) * fps * rate) % frames
          setFrame(b, Math.floor(loop))
          b.mat.opacity = visual.restOpacity
        } else {
          const fade = Math.max(0, 1 - (local - visual.bloom) / FADE_OUT)
          b.mat.opacity = visual.restOpacity * fade
        }
      }

      if (ending) return t - endAt < FADE_OUT
      if (visual.lingers) return true
      // A one-shot mark is done when its LAST ring has finished fading, not
      // its first — hence the full delay spread added on.
      return t < visual.bloom + FADE_OUT + BUCKETS * RING_DELAY
    },

    end() {
      if (ending) return
      ending = true
      endAt = t
    },

    dispose() {
      dead = true
      for (const b of buckets) {
        group.remove(b.mesh)
        b.geo.dispose()
        b.mat.dispose()
        b.tex.dispose()
      }
      buckets = []
      parent.remove(group)
    },
  }
}
