// ============================================================================
// CUES — what the server says happened, turned into sound.
//
// This is a LAYER over lib/sfx.ts, not a second player. There is exactly one
// AudioContext in this app and it lives in that module; everything here comes
// back out through playSfx(). A second player would mean two contexts, two
// volume settings and two gesture unlocks, and the import site would look
// correct either way.
//
// WHY THE SERVER DERIVES CUES RATHER THAN MALACHAR EMITTING THEM
//
// The obvious design is to let the DM name its own sounds, the way it names a
// cinematic with [CINEMATIC: ...]. That tag has a recorded history in this
// codebase: "Malachar has never once emitted this tag in production — not
// before the prompt rules were widened and not after — while the film for
// moments like sleeping sat unwatched." A whole fallback path exists because
// of it.
//
// Sound would fail the same way and fail SILENTLY, because an unknown or
// absent cue is deliberately ignored (see below) — 34 clips would simply never
// play and nothing would report it. So cues are derived from state the server
// already owns and can prove: the faces on a committed die roll, an HP delta,
// an inventory write. Facts, not model output.
//
// TOLERANCE IS THE POINT. A missing key, an empty array, a slug with no file
// behind it, a browser that refuses to decode — none of it may throw and none
// of it may interrupt what the player is actually doing. A sound effect can
// never take the dashboard down. Every entry point here is total.
// ============================================================================

import { playSfx, impactFor, meleeHit, type SfxName } from "@/lib/sfx"
import type { DamageType } from "@/lib/spellbook"

/**
 * A sound named outright.
 *
 * `key` is the FULL bucket path — "ui/nat20", not "nat20". The category is
 * part of the name rather than something this module reconstructs from a
 * lookup table, so there is no mapping to drift out of step with the bucket,
 * and SfxName already admits `ui/${string}` and its siblings unchanged.
 */
export type RawCue = { type: "raw"; key: string }

/** A spell landing. Family and damage type resolve through lib/sfx's helpers. */
export type SpellCue = { type: "spell"; damage?: string | null }

/** A weapon connecting. */
export type AttackCue = { type: "attack"; crit?: boolean }

export type SfxCue = RawCue | SpellCue | AttackCue

/** Whatever the server sent, played. Never throws. */
export function playCues(cues: unknown): void {
  try {
    if (!Array.isArray(cues)) return
    for (const cue of cues) playCue(cue)
  } catch (err) {
    // Reaching here means a bug in this module rather than a missing file.
    // Say so once in the console and let the turn carry on regardless.
    console.warn("[sfx] cue batch failed, ignored:", err)
  }
}

function playCue(cue: unknown): void {
  try {
    if (!cue || typeof cue !== "object") return
    // Deliberately NOT Partial<RawCue & SpellCue & AttackCue>: intersecting
    // the three collapses `type` to "raw" & "spell" & "attack", which is
    // never, and every field read off it fails to compile. This is untrusted
    // input off the wire anyway, so it is validated field by field.
    const c = cue as { type?: unknown; key?: unknown; damage?: unknown; crit?: unknown }
    switch (c.type) {
      case "raw":
        // An unknown slug is not an error. Cues are deliberately allowed to be
        // wired ahead of the audio existing, so the extractor can name a sound
        // that has not been recorded yet and simply stay quiet until it is.
        if (typeof c.key === "string" && c.key) playSfx(c.key as SfxName)
        return
      case "spell":
        if (c.damage) playSfx(impactFor(c.damage as DamageType), { volume: 0.9 })
        return
      case "attack":
        playSfx(meleeHit(Boolean(c.crit)))
        return
      default:
        return
    }
  } catch (err) {
    console.warn("[sfx] cue ignored:", cue, err)
  }
}
