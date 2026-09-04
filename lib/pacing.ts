/**
 * THE SCENE KEEPS MOVING.
 *
 * Sam: "there needs to be a timer of sorts that helps move the game along in
 * the dialogue portion to prevent it from getting too slow."
 *
 * Combat already has a clock — the board drives NPC turns on its own. The
 * ROLEPLAY has none, so a quiet room stays quiet until somebody types, and on
 * a session that is being recorded for a weekly video, dead air is the thing
 * that ruins the take. A real DM does not sit in silence; they have somebody
 * cough, or lean on the party, or make the world do something.
 *
 * TWO CLOCKS, because Sam asked for both:
 *
 *   SILENCE — nobody has said anything for a while. The obvious one.
 *   SCENE LENGTH — people ARE talking, at length, in one room, and the story
 *     has not moved. That is a different failure and a slower clock will never
 *     catch it, so once a scene runs long the silence thresholds tighten and
 *     the room gets prodded sooner.
 *
 * AND IT ESCALATES, softest first:
 *
 *   npc    someone in the room fills the gap. In character, cheap, and often
 *          enough on its own — a bark from Jimjar restarts a conversation.
 *   lich   Malachar leans in and names somebody. Harder to ignore.
 *   world  a guard passes, something moves in the tunnel. Pressure that is
 *          not addressed to anyone and cannot be answered with silence.
 *
 * Each rung fires ONCE. A player speaking resets the whole ladder, because
 * the point is to restart the scene, not to nag a room that is already going.
 */

export type NudgeKind = "npc" | "lich" | "world"

/** The ladder, in order. Index === tier. */
export const LADDER: NudgeKind[] = ["npc", "lich", "world"]

/** How long the room may stay quiet before each rung, in ms. */
export const SILENCE_MS = [25_000, 55_000, 95_000]

/** Never two nudges closer together than this, whatever the clocks say. */
export const COOLDOWN_MS = 18_000

/**
 * Exchanges in one scene before it counts as dragging. Past this the silence
 * thresholds are halved: the room is talking, but it is circling.
 */
export const LONG_SCENE_BEATS = 14

/**
 * The most nudges one scene may ever fire. A hard stop, because every nudge
 * is a model call that costs money, and a page left open overnight must not
 * quietly spend all night prodding an empty room.
 */
export const MAX_PER_SCENE = 8

export interface PacingState {
  /** When a PLAYER last said something. 0 means "not yet". */
  lastPlayerAt: number
  /** When we last nudged. 0 means "not yet". */
  lastNudgeAt: number
  /** Rungs already climbed since the last player message. */
  tier: number
  /** Player exchanges so far in this scene. */
  beats: number
  /** Nudges fired in this scene. */
  firedThisScene: number
}

export const freshScene = (now = 0): PacingState => ({
  lastPlayerAt: now, lastNudgeAt: 0, tier: 0, beats: 0, firedThisScene: 0,
})

/**
 * What the scene needs right now, or null for "leave it alone".
 *
 * `inCombat` is an absolute veto. The board is already driving turns on a 320ms
 * beat; a second clock reaching in to make a guard walk past mid-initiative
 * would be two directors on one stage.
 */
export function nextNudge(s: PacingState, now: number, inCombat = false): NudgeKind | null {
  if (inCombat) return null
  if (!s || !Number.isFinite(now)) return null
  // Nothing has happened yet at all — wait for the scene to start rather than
  // opening it by prodding an empty room.
  if (!s.lastPlayerAt) return null
  if (s.tier >= LADDER.length) return null
  if (s.firedThisScene >= MAX_PER_SCENE) return null
  if (s.lastNudgeAt && now - s.lastNudgeAt < COOLDOWN_MS) return null

  const dragging = s.beats >= LONG_SCENE_BEATS
  const wait = SILENCE_MS[s.tier] * (dragging ? 0.5 : 1)
  return now - s.lastPlayerAt >= wait ? LADDER[s.tier] : null
}

/** A player spoke: the ladder resets and the scene gains a beat. */
export function onPlayerMessage(s: PacingState, now: number): PacingState {
  return { ...s, lastPlayerAt: now, tier: 0, beats: s.beats + 1 }
}

/** We nudged: climb one rung and start the cooldown. */
export function onNudged(s: PacingState, now: number): PacingState {
  return { ...s, lastNudgeAt: now, tier: s.tier + 1, firedThisScene: s.firedThisScene + 1 }
}

/**
 * The party moved, or the story turned. Everything resets — a new room has
 * earned its own patience, and its own budget.
 */
export function onSceneChange(s: PacingState, now: number): PacingState {
  return freshScene(now)
}

/**
 * What to actually ask for. Kept here beside the rules so the instruction and
 * the ladder can never drift apart.
 *
 * Written as a stage direction rather than dialogue: it tells Malachar what
 * the moment needs, and lets him find the words. Handing him a line to say
 * would flatten him into a teleprompter.
 */
export function nudgePrompt(kind: NudgeKind): string {
  switch (kind) {
    case "npc":
      return "[PACING] The room has gone quiet. Have ONE npc present say something short and in character — a question, a complaint, an offer, an opinion about what was just discussed. Do not advance the plot and do not address the party as a group. Two sentences at most."
    case "lich":
      return "[PACING] The party is still silent. Malachar leans in and needles them directly: name one character, ask what they are actually doing, and make the hesitation itself the joke. Stay cruel and funny. Do not resolve anything for them. Three sentences at most."
    case "world":
      return "[PACING] Nobody has moved. Something happens TO them instead: a patrol passes, a sound in the tunnel, a light changes, a guard looks over. No one addresses the party. Make it raise the stakes slightly and demand a response. Three sentences at most."
  }
}
