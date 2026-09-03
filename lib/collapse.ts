/**
 * A BODY FALLS LIKE A BODY, NOT LIKE A CHESS PIECE.
 *
 * Sam: "when Kenta got knocked down he just fell like a chess piece. ALL
 * FALLS, DOWNS, need to have a dramatic life like collapse and fall with them
 * slightly moving."
 *
 * He is describing a missing asset, precisely. Measured off the GLBs:
 *
 *   hero-fifi, hero-samson, hero-scott   have a "Dead" clip
 *   foe-quaggoth, foe-hook-horror        have a "dead" clip
 *   hero-warlock (KENTA)                 9 clips, NOT ONE OF THEM A DEATH
 *   foe-drow-elite, foe-giant-spider     zero clips at all
 *
 * So Kenta had nothing to play. The board fell back to laying an unposed body
 * flat — a rigid rotation about one axis, which is exactly a chess piece
 * tipping over. Three models on that board can never die properly.
 *
 * This generates the fall instead. It is not a substitute for a real death
 * animation — a rigged collapse moves limbs and this moves a whole body — but
 * a body that buckles, topples with weight, lands, and then settles reads as
 * something dying, where a stiff 90-degree rotation reads as furniture.
 *
 * FOUR BEATS, because that is what a falling body does:
 *
 *   BUCKLE   the legs go first. A drop, barely any rotation. This is the beat
 *            that sells it — a chess piece has no knees, and skipping straight
 *            to the topple is what makes the old fall read as an object.
 *   TOPPLE   over it goes, accelerating. Eased IN, not smoothed: gravity does
 *            not ease out, and a fall that decelerates looks like it is being
 *            lowered by a stagehand.
 *   LAND     the impact. A short bounce — the body arrives, gives, and stops.
 *   SETTLE   "them slightly moving": a small decaying shudder that dies to
 *            absolutely nothing within a couple of seconds. Nothing loops
 *            here. A corpse that keeps twitching forever is a bug.
 */

export interface CollapsePose {
  /** Rotation about the fall axis, radians. Ends near a right angle. */
  pitch: number
  /** Vertical offset in world units — negative is down. */
  drop: number
  /** Which way the body goes over, radians about the vertical. */
  heading: number
  /** True once the body has stopped moving for good. */
  settled: boolean
}

/** Seconds. The whole fall, beat by beat. */
export const BUCKLE_END = 0.22
export const TOPPLE_END = 0.78
export const LAND_END = 0.95
export const SETTLE_END = 2.6

/** How far over it goes. Slightly past square, so it reads as dead weight. */
const FINAL_PITCH = Math.PI / 2 + 0.06
/** How far the hips drop as the legs give. */
const BUCKLE_DROP = 0.09
/** The bounce on landing, and the shudder after it. */
const BOUNCE = 0.035
const SHUDDER = 0.012

function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}

/**
 * Which way this body goes over.
 *
 * AWAY FROM WHATEVER HIT IT when that is known — a crossbow bolt from the
 * north puts the body down to the south, and a table reads that instantly
 * without being told. Only when nothing is known does it fall to a stable
 * per-body angle, so the same corpse lands the same way on every screen and
 * after every reload.
 */
export function headingFor(id: string, from?: { x: number; y: number } | null, at?: { x: number; y: number } | null): number {
  if (from && at) {
    const dx = at.x - from.x
    const dy = at.y - from.y
    if (dx !== 0 || dy !== 0) return Math.atan2(dx, dy)
  }
  return hash(id) * Math.PI * 2
}

const easeIn = (t: number) => t * t

/** Where the body is, `t` seconds after it was struck down. */
export function collapseAt(t: number, id: string, heading: number): CollapsePose {
  const done = { pitch: FINAL_PITCH, drop: -BUCKLE_DROP, heading, settled: true }
  if (!Number.isFinite(t) || t < 0) return { pitch: 0, drop: 0, heading, settled: false }
  if (t >= SETTLE_END) return done

  if (t < BUCKLE_END) {
    // The legs give. Almost no rotation yet — this is the beat a chess piece
    // does not have, and the reason the old fall read as an object.
    const k = t / BUCKLE_END
    return { pitch: FINAL_PITCH * 0.06 * k, drop: -BUCKLE_DROP * k, heading, settled: false }
  }

  if (t < TOPPLE_END) {
    // Over it goes, accelerating. Gravity does not ease out.
    const k = (t - BUCKLE_END) / (TOPPLE_END - BUCKLE_END)
    return {
      pitch: FINAL_PITCH * (0.06 + 0.94 * easeIn(k)),
      drop: -BUCKLE_DROP,
      heading,
      settled: false,
    }
  }

  if (t < LAND_END) {
    // It arrives, and gives. One short bounce, not a rubber ball.
    const k = (t - TOPPLE_END) / (LAND_END - TOPPLE_END)
    return {
      pitch: FINAL_PITCH + Math.sin(k * Math.PI) * BOUNCE,
      drop: -BUCKLE_DROP,
      heading,
      settled: false,
    }
  }

  // And then it is only just moving, and then it is not moving at all.
  const k = (t - LAND_END) / (SETTLE_END - LAND_END)
  const fade = (1 - k) ** 3
  return {
    pitch: FINAL_PITCH + Math.sin(t * 9.3 + hash(id) * 10) * SHUDDER * fade,
    drop: -BUCKLE_DROP,
    heading,
    settled: false,
  }
}
