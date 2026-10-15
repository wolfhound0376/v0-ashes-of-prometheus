// ============================================================================
// WHAT SANCTUARY LOOKS LIKE — the numbers, kept out of THREE so they can be
// tested.
//
// Sam, 2026-10-15, sending his own art: a ring of gold light on the floor,
// white wisps rising up both sides, a halo closing over the top. Sixteen
// frames: eight of it ARRIVING, eight of it HOLDING (baked by
// scripts/vfx/bake_ward_sheet.py as sanctuaryRise + sanctuaryHold).
//
// Two looks use it:
//
//   THE CAST   ward-vfx.ts. The rise at full strength, a short stretch of the
//              hold, then it fades — the moment the spell lands.
//   THE WARD   status-vfx.ts. The hold, looping quietly for as long as
//              vtt_tokens.ward says Sanctuary is up, gone the moment it is
//              broken or runs out. Sam asked for "a condition that the NPCs
//              and monsters respect until violated"; the rules have done that
//              since the ward landed, and nothing on the board ever SHOWED
//              it — a warded cleric looked exactly like an unwarded one.
//
// Both are one camera-facing quad. The dome is drawn from the board's own
// viewpoint, its floor ring already an ellipse and nothing in it turning, so
// unlike a target sigil it is never laid flat and never spun.
// ============================================================================

/**
 * Measured off the source by the bake (640 x 640, held frames 8-15), as
 * fractions of the square cell.
 */
export const SANCTUARY_ART = {
  /** Where the floor ring's centre sits, from the TOP of the cell. */
  floor: 0.706,
  /** The floor ring's drawn width. 450 px of 640. */
  ring: 0.703,
  /** Floor ring centre up to the crown halo. Rows 452 -> 60 of 640. */
  crown: 0.6125,
} as const

/**
 * How much taller than wide the quad is drawn.
 *
 * The source's floor ring is drawn about 6:1 — a much lower camera than the
 * board's 2:1 dimetric view — and its crown sits at chest height on anything
 * standing in a ring that fits its square. Stretching the cell 1.6x upright
 * fixes both at once: the ring moves toward the board's own foreshortening
 * (about 4:1) and the halo lands just over the head, which is where Sam drew
 * it. The wisps are vertical, so they take the stretch without looking it.
 */
export const SANCTUARY_STRETCH = 1.6

/** The halo clears the head by this much of the body's height. */
const HEADROOM = 1.08
/** The floor ring is never narrower than this much of the token's footprint. */
const MIN_RING = 2.8

export interface WardQuad { w: number; h: number }

/**
 * The quad's size in board units.
 *
 * `screenHeight` is how tall the body LOOKS — its world height times the
 * camera's up-vector y, because a billboard's height is measured along the
 * camera's up and a standing body is foreshortened by the pitch. `radius` is
 * the token's base radius, so a large creature's ring still clears its feet.
 */
export function sanctuaryQuad(screenHeight: number, radius: number): WardQuad {
  const byHead = (Math.max(0.4, screenHeight) * HEADROOM) / SANCTUARY_ART.crown
  const byRing = (Math.max(0.1, radius) * MIN_RING * SANCTUARY_STRETCH) / SANCTUARY_ART.ring
  const h = Math.max(byHead, byRing)
  return { w: h / SANCTUARY_STRETCH, h }
}

export type Vec3 = { x: number; y: number; z: number }

/**
 * Where the quad's centre goes so that the drawn floor ring stands on `foot`.
 *
 * `up` is the camera's up vector and `toward` the unit vector from the scene
 * toward the camera, both in world space. Centred naively, the lower part of
 * the quad — the near half of the floor ring and the sparks below it — would
 * hang below the floor, and the floor would hide it. So the quad slides
 * along `toward` until its bottom edge is above the floor. A quad facing the
 * camera moved along the view direction lands on exactly the same pixels in
 * an orthographic view (and very nearly in the perspective one), so the ring
 * stays on the feet and simply stops being buried.
 */
export function sanctuaryCentre(
  foot: Vec3, up: Vec3, toward: Vec3, quad: WardQuad,
  /** The FLOOR, not the feet: a flying creature's dome may hang below its feet and still be clear of the stone. */
  floorY = 0,
  lift = 0.02,
): Vec3 {
  const rise = (SANCTUARY_ART.floor - 0.5) * quad.h
  const c = { x: foot.x + up.x * rise, y: foot.y + up.y * rise, z: foot.z + up.z * rise }
  const bottom = c.y - (quad.h / 2) * up.y
  const need = floorY + lift - bottom
  // A camera looking level (or from below) has nothing to slide toward; the
  // board never does that, but the answer must not divide by zero.
  if (need > 0 && toward.y > 0.05) {
    const s = need / toward.y
    c.x += toward.x * s
    c.y += toward.y * s
    c.z += toward.z * s
  }
  return c
}

// ── timing ─────────────────────────────────────────────────────────────────

/** The rise: eight frames at the source's 10 fps. */
export const RISE_SECONDS = 0.8
/** How long the cast holds at full strength once risen. */
export const CAST_HOLD_SECONDS = 1.6
/** And how long it takes to let go. */
export const CAST_FADE_SECONDS = 0.6

export const CAST_SECONDS = RISE_SECONDS + CAST_HOLD_SECONDS + CAST_FADE_SECONDS

/**
 * The cast's strength at `t` seconds: full through the rise and the hold,
 * then easing to nothing. The rise sheet carries its own build-up in the
 * art, so there is no fade-in here.
 */
export function sanctuaryCastOpacity(t: number): number {
  if (t < 0) return 0
  const end = RISE_SECONDS + CAST_HOLD_SECONDS
  if (t <= end) return 1
  const p = (t - end) / CAST_FADE_SECONDS
  return p >= 1 ? 0 : 1 - p * p
}

/**
 * How strong the standing ward is while it lasts.
 *
 * QUIET ON PURPOSE. It is on screen for up to ten rounds, beside everything
 * else the board is drawing; at full strength a warded creature would be the
 * brightest thing in every frame of the fight. 0.38 keeps the ring, the
 * halo and the sparks legible and lets the wisps go to a shimmer.
 */
export const HOLD_OPACITY = 0.38
/**
 * It waits for the cast to finish before it shows, so the two hand over
 * instead of stacking — the cast fades as this arrives.
 */
export const HOLD_DELAY = RISE_SECONDS + CAST_HOLD_SECONDS
export const HOLD_FADE_IN = 0.8

export function sanctuaryHoldOpacity(t: number): number {
  const p = (t - HOLD_DELAY) / HOLD_FADE_IN
  if (p <= 0) return 0
  return HOLD_OPACITY * Math.min(1, p)
}
