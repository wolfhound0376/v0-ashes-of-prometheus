import * as THREE from "three"
import { VISION_ARC_DEG, sightOf, type Vantage, type Sneaker } from "@/lib/sneak"

// ============================================================================
// WHO IS LOOKING AT YOU — the cones that appear when you arm Sneak.
//
// Sam: "When hide is selected reveal everyone's line of site (except the
// player selecting hide) and be reasonable."
//
// THE POINT IS THAT IT IS THE SAME FUNCTION. The floor tint under each square
// is decided by sightOf — the identical call the server makes when the button
// is pressed. Not a lookalike that agrees today: the same one. A player
// choosing a square from this picture gets exactly the ruling the picture
// promised, and the two cannot drift, because there is only one of them.
//
// This board has shipped that class of bug before — a drow glowing inside a
// Fireball outline and then taking nothing — and the fix each time was to
// stop having two implementations. So: one.
//
// EXCEPT THE SNEAKER'S OWN. Sam asked for that explicitly, and it is right:
// their cone is not information they need and it would cover the squares they
// are trying to read.
// ============================================================================

/** How the floor reads under a square. */
const SEEN = 0xd8452f      // somebody has eyes on it
const BLIND = 0x2f8f5a     // nobody does — you can stand here for free
const Y = 0.03             // above the floor, below the movement bands

export interface ConeHandle {
  /** Recompute — a token moved, or the arc changed. */
  refresh(): void
  dispose(): void
}

/**
 * Paint every square by whether anything can see it.
 *
 * A SQUARE, NOT A WEDGE. The obvious drawing is a fan of triangles per
 * observer, which looks better in a screenshot and lies in the same way a
 * scaled circle lied about a Fireball: the wedge does not agree with the grid,
 * so a rogue standing in a corner that LOOKS clear is judged by a rule that
 * says otherwise. Every square is asked the real question and tinted by the
 * real answer.
 */
export function showSightCones(opts: {
  parent: THREE.Object3D
  width: number
  height: number
  cellToWorld: (x: number, y: number) => { x: number; z: number }
  squareSize: number
  /** Everyone who might see — the sneaker is NOT among them. */
  vantages: () => Vantage[]
  sneaker: () => Sneaker
  bodies: () => { id: string; x: number; y: number; size: string | null }[]
  walkable?: Set<string>
}): ConeHandle {
  const group = new THREE.Group()
  group.position.y = Y
  opts.parent.add(group)

  const seenMat = new THREE.MeshBasicMaterial({
    color: SEEN, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const blindMat = new THREE.MeshBasicMaterial({
    color: BLIND, transparent: true, opacity: 0.2, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  const geo = new THREE.PlaneGeometry(opts.squareSize * 0.94, opts.squareSize * 0.94)
  geo.rotateX(-Math.PI / 2)

  const tiles: THREE.Mesh[] = []

  const refresh = () => {
    for (const t of tiles) group.remove(t)
    tiles.length = 0
    const vs = opts.vantages()
    const bodies = opts.bodies()
    const me = opts.sneaker()

    for (let y = 0; y < opts.height; y++) {
      for (let x = 0; x < opts.width; x++) {
        // Not floor, not painted. Tinting the inside of a wall tells the
        // player they could hide in the rock.
        if (opts.walkable && opts.walkable.size > 0 && !opts.walkable.has(`${x},${y}`)) continue
        // THE SAME QUESTION THE SERVER ASKS, about this square rather than
        // about where the sneaker is standing now — because the player is
        // deciding where to GO.
        const watched = vs.some((v) =>
          sightOf({
            vantage: v,
            sneaker: { x, y, size: me.size },
            bodies: bodies.filter((b) => !(b.x === x && b.y === y)),
            walkable: opts.walkable,
          }).sees,
        )
        const m = new THREE.Mesh(geo, watched ? seenMat : blindMat)
        const { x: wx, z: wz } = opts.cellToWorld(x, y)
        m.position.set(wx, 0, wz)
        m.frustumCulled = false
        m.renderOrder = 1
        group.add(m)
        tiles.push(m)
      }
    }
  }

  refresh()

  return {
    refresh,
    dispose() {
      for (const t of tiles) group.remove(t)
      tiles.length = 0
      geo.dispose()
      seenMat.dispose()
      blindMat.dispose()
      opts.parent.remove(group)
    },
  }
}

/** For a legend, so the colours mean something without being explained twice. */
export const CONE_LEGEND = {
  seen: `#${SEEN.toString(16).padStart(6, "0")}`,
  blind: `#${BLIND.toString(16).padStart(6, "0")}`,
  arcDegrees: VISION_ARC_DEG,
}
