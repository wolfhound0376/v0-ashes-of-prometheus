// lib/travel/stingers.ts — the short cue heard on arriving at a road node.
//
// Sam (2026-10-14): "a short song like what we have at the plate entrances with
// a passive roll" — the five kinds plus the two perception sounds. The cue is
// for the KIND of node, never the node: the place themes already answer the
// plate entrances, and fifty markers must not need fifty songs.
//
// Files live in public/sfx/travel/<cue>.mp3 and go in only after Sam has
// approved each take on the audition page (art rule: nothing enters the game
// unsupervised). Until a file lands the player simply skips it — a missing
// cue is silence, never an error.

export type ArrivalCue = "quiet" | "discovery" | "hazard" | "nightfall" | "great-place"
export type PerceptionCue = "noticed" | "missed"
export type StingerCue = ArrivalCue | PerceptionCue

export const ARRIVAL_CUES: readonly ArrivalCue[] = ["quiet", "discovery", "hazard", "nightfall", "great-place"]
export const PERCEPTION_CUES: readonly PerceptionCue[] = ["noticed", "missed"]

export const STINGER_LABEL: Record<StingerCue, string> = {
  quiet: "A quiet marker",
  discovery: "Something comes into view",
  hazard: "Something is wrong",
  nightfall: "Nightfall — make camp",
  "great-place": "A great place",
  noticed: "Passive Perception — noticed",
  missed: "Passive Perception — missed",
}

/** Where the approved file is served from. */
export function stingerUrl(cue: StingerCue): string {
  return `/sfx/travel/${cue}.mp3`
}

/** Relative level against the music bed (0.45 in the map): stings sit above it, the perception blips under it. */
export const STINGER_GAIN: Record<StingerCue, number> = {
  quiet: 0.5,
  discovery: 0.65,
  hazard: 0.8,
  nightfall: 0.6,
  "great-place": 0.85,
  noticed: 0.4,
  missed: 0.3,
}

/**
 * Which arrival cue a node earns. Order matters: a fight is a fight even at
 * the gates of a city; nightfall is told before wonder; a great place beats
 * a discovery; a reveal beats silence.
 */
export function arrivalCue(input: {
  /** The halt kind the server answered with ("encounter" | "challenge" | "cinematic" | "camp" | "forced_march" | "none"). */
  haltKind: string
  /** travel_nodes.node_type of the node arrived at. */
  nodeType: string
  /** First time the party has stood here. */
  firstVisit: boolean
  /** The passive roll revealed something. */
  revealed: boolean
}): ArrivalCue {
  const k = input.haltKind
  if (k === "encounter" || k === "challenge" || k === "forced_march") return "hazard"
  if (k === "camp") return "nightfall"
  if (input.nodeType === "location" && input.firstVisit) return "great-place"
  if (input.revealed || (input.firstVisit && input.nodeType !== "waypoint")) return "discovery"
  return "quiet"
}
