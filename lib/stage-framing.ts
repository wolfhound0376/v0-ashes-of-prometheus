import type { CSSProperties } from "react"

// Per-subject framing for the two windows that show a character's own art.
//
// Loops arrive framed however the render happened to frame them: Fifi's is a
// waist-up crop flush to its frame, Samson's is a full body inside a tall frame
// with ~9% empty space under his feet, an NPC's might be a face close-up or a
// whole goblin standing in a cavern. Sizing off the source frame alone makes a
// subject's apparent size an accident of framing — which is how Samson ended up
// a fairy hovering in mid-air beside Fifi.
//
// Two numbers per subject fix it without re-cutting art. They live on
// `characters` and on `npc_encounters` under the same names, and both default to
// 1 / 0 so anything untuned renders exactly as it did before.

export const STAGE_SCALE_MIN = 0.2
export const STAGE_SCALE_MAX = 3
export const STAGE_OFFSET_MIN = -50
export const STAGE_OFFSET_MAX = 50

/** The two stored numbers, as they come back from Supabase. */
export interface StageFramingRow {
  stage_scale?: number | string | null
  stage_offset_y?: number | string | null
}

/**
 * Postgres `numeric` arrives over PostgREST as a STRING, so every read has to
 * coerce before clamping. A missing or unparseable value falls back to the
 * no-op default rather than collapsing the figure to zero.
 */
export function clampFraming(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function readFraming(row: StageFramingRow | null | undefined): { scale: number; offsetY: number } {
  return {
    scale: clampFraming(row?.stage_scale, STAGE_SCALE_MIN, STAGE_SCALE_MAX, 1),
    offsetY: clampFraming(row?.stage_offset_y, STAGE_OFFSET_MIN, STAGE_OFFSET_MAX, 0),
  }
}

/**
 * The POV character standing on the scene stage.
 *
 * Base figure is `height: 88%` of the panel with `max-width: 48%`, bottom-left
 * anchored and pulled back by half its width. The scale multiplies BOTH so it
 * behaves the same for a height-limited tall frame and a width-limited wide one
 * — scaling only the height does nothing to a clip already pinned by max-width.
 * The offset pushes the figure DOWN, burying transparent padding below the
 * bottom of the panel so the feet land on the ground line.
 */
export function characterStageStyle(row: StageFramingRow | null | undefined): CSSProperties {
  const { scale, offsetY } = readFraming(row)
  return {
    height: `${88 * scale}%`,
    maxWidth: `${48 * scale}%`,
    transform: `translate(-50%, ${offsetY}%)`,
  }
}

/**
 * The NPC head window beside the DM's narration.
 *
 * That box is filled edge to edge (`inset-0 object-contain object-top`), so
 * there is no height to multiply — the knob has to be a transform. Scaling
 * about TOP CENTRE means a full-body NPC loop zooms into the face and pushes the
 * body out through the bottom of the frame, which is the shot that window wants.
 * The offset then nudges vertically; negative lifts the subject.
 */
export function npcWindowStyle(row: StageFramingRow | null | undefined): CSSProperties {
  const { scale, offsetY } = readFraming(row)
  if (scale === 1 && offsetY === 0) return {}
  return {
    transformOrigin: "50% 0%",
    transform: `translateY(${offsetY}%) scale(${scale})`,
  }
}
