// BUPPIDO RISES — the rules, pure, in one copy.
//
// Sam, 2026-10-30: "If Buppido dies (since he's evil) in the pen by being shot and RIP grave shows up (just for him)
// his body doesn't get dragged away like the rest. After a little bit one zombie comes out from the ground (the mound)
// using our animation prebuilt and starts attacking. The guards watch idly surprised. Cue horror music during the
// duration of this sequence. Combat begins in the pen."
//
// Plain JavaScript for the same reason as lib/game-over.mjs and lib/surrender.mjs: build_walk.py pastes this file into
// the painted map (the Underwalk) at its BUPPIDO_RISES placeholder (minus `export`), so the map and
// lib/buppido-rises.test.ts read the SAME rule and the same lines. Every name here starts with BUPPIDO_RISES_ or
// buppidoRises so the paste cannot collide with the page's names.
//
// SOURCES
//   [SAM 2026-10-30] the beat: Buppido dies in the pen; his body is NOT dragged out; he alone gets a stone; a zombie
//             climbs out of the mound; the guards watch, idle and surprised; horror music over the whole thing;
//             the fight starts in the pen.
//   [SAM 2026-10-30] it fires on ANY death of Buppido in the pen, not only the gate volley's d8.
//   [SAM 2026-10-30] the guards watch and enjoy it — they never join the fight on either side.
//   [SAM 2026-11-23] (revises the line above for one case) "whenever buppido dies the cinematic of him dying and
//             turning into a zombie with him crawling from the ground and attacking whomever he is closest to: NPC,
//             character, or drow." Then: "Of course they fight back if they get struck. They even get annoyed.
//             Create a grave mound then." So: a stone and its mound go up wherever he fell, not in the pen alone, and
//             he crawls out of it; the zombie goes for the NEAREST creature it can get at, on any side; a drow it
//             strikes fights it, annoyed, until it is down, then goes back to watching.
//   [SAM 2026-10-30] the zombie keeps Undead Fortitude. Asked directly whether to soften it for a pen full of
//             level-1 prisoners with no weapons, Sam kept the canon rule.
//   [SAM 2026-10-30] the kill drops ONE thing: the Scarab of Protection, very rare, attunement, 12 charges.
//   [SOURCED] the zombie is the SRD 5.1 Zombie. The emerge animation is the one already in the repo:
//             public/sprites/zombie-rotting/emerge.png, 21 frames at 12 fps, whose sprite.json `arrive` hook already
//             names the `undead-breach` sting. Nothing new was drawn for the rise.
//   [CLAUDE]  the timings, and Malachar's three lines (original words; his voice is the lich voice the dashboard
//             already uses, /api/tts "onyx").
//
// WHY BUPPIDO. He is a derro who believes he is a god and cannot die (OotA). Sam's "since he's evil" is the reason he
// gets the stone and nobody else does — and the joke writes itself: the one prisoner certain of his own divinity is the
// one who comes back, and comes back as meat.

export const BUPPIDO_RISES_RULES = {
  npc: "buppido",        // the only prisoner this happens to
  plate: 11,             // the slave pen: the only plate with its film and its watching guards. The rise itself is anywhere
  foe: "zombie-rotting", // the sprite set with the prebuilt emerge animation
  loot: "scarab-of-protection",
  bodyMs: 2600,          // he lies where he fell while the others are dragged out and the guards get bored
  stoneMs: 1100,         // the stone pushes up (the grave sheet is 6 frames at 150 ms, plus a beat to read it)
  stirMs: 1500,          // the mound trembles. Nothing has come out yet, and this is the longest second in the session
  emergeMs: 1750,        // 21 frames at 12 fps: the zombie climbs out
  surpriseMs: 900,       // the guards react before initiative — they are entertained, not alarmed
}

// What a drow says when the thing bites him (Sam, 2026-11-23: "They even get annoyed"). Claude's words.
export const BUPPIDO_RISES_VEXED = [
  "Get off me, you rotting filth!",
  "It bit me. The dead thing BIT me.",
  "Enough. Somebody put this back in the ground.",
  "Lolth's teeth! That was my good arm.",
]

/** A drow, for "attacking whomever he is closest to: NPC, character, or drow" and "they fight back". */
export function buppidoRisesIsDrow(id) {
  return /^drow-|^(jorlan|shoor|asha|ilvara|liana)(-|$)/.test(String(id || ""))
}

/**
 * Who the zombie goes for: the nearest creature still standing, whatever side it is on (Sam, 2026-11-23). The map
 * hands in only what it can actually get at (seen, not behind the pen's locked bars); this picks the closest.
 * @param {{ x: number, y: number }} z
 * @param {Array<{ x: number, y: number, down?: boolean }>} pool
 */
export function buppidoRisesNearest(z, pool = []) {
  if (!z) return null
  let best = null, bd = Infinity
  for (const t of pool) {
    if (!t || t.down || t === z) continue
    const d = Math.hypot(t.x - z.x, t.y - z.y)
    if (d < bd) { bd = d; best = t }
  }
  return best
}

// Malachar's lines over the rise. Claude's words (flagged above) — Sam to keep, cut or rewrite.
export const BUPPIDO_RISES_LINES = [
  "He did keep saying he couldn't die. I want it on the record that he was technically correct, and that this is worse.",
  "A god returns to his faithful. Look at him. Look what the office has done to him.",
  "Oh, he's back. He's just not bringing the personality this time.",
]

/**
 * Does the rise fire? Buppido, dead, anywhere, and only once per campaign.
 * Sam, 2026-11-15 ("when he dies he becomes a zombie"): no longer the pen alone. In the pen it is the stone and the
 * mound and the watching guards (buppidoRisesInPen); anywhere else he gets up where he fell.
 * @param {{ deadId?: string, plate?: string | number, fired?: boolean }} [o]
 */
export function buppidoRisesActive({ deadId, plate, fired = false } = {}) {
  if (fired) return false
  return String(deadId || "") === BUPPIDO_RISES_RULES.npc
}

/** The pen's own version of the rise: its film and its watching guards. The stone and the mound go up anywhere now. */
export function buppidoRisesInPen(plate) {
  return Number(plate) === BUPPIDO_RISES_RULES.plate
}

// ---------------------------------------------------------------------------------------------------------------------
// THE LEDGE (Sam, 2026-11-15: "Build buppido ledge shove").
//   [SOURCED] our OotA guide, Chapter 2, p.10, "Assassination Attempt": "The group travels on a ledge. On one side, it
//             drops off into a void. Buppido becomes sweaty. If he can get a PC away from the group, he will try to
//             shove them over the side and claim it was an accident." And p.5: after the group escapes, he wants to
//             kill the heroes one by one.
//   [SOURCED] Buppido's block (bestiary `buppido`, a derro): STR 9 (-1), Stealth +4.
//   [SOURCED] SRD 5.1 Shoving a Creature: the shover's Strength (Athletics) against the target's Strength (Athletics)
//             or Dexterity (Acrobatics), the target's choice; a tie changes nothing.
//   [SAM 2026-11-15] the edge: pushed toward a drop, a DC 15 Dexterity save catches it (the map's LEDGE_SAVE_DC).
//   [CLAUDE] what "a PC away from the group" means on the map (no one else within 30 ft); that he tries once per visit
//             to a ledge; that his creeping up is his Stealth against the hero's passive Perception, and that a hero
//             who did not see him coming is caught off guard (he shoves with advantage). His lines are drafts.
export const BUPPIDO_RISES_LEDGE = {
  plates: ["road-rope-bridge", "5c"],   // the rope bridge over the chasm on the road, the cliff ledges below the lift
  aloneFt: 30,
  stealth: 4,
  athletics: -1,
  sweaty: ["Buppido wipes his brow and smiles at the drop. \"Long way down. Isn't it.\"",
           "Buppido is sweating, though it is cold here. He keeps glancing at the edge."],
  spotted: ["\"Careful, friend! Slippery here. I was only steadying you.\"", "\"Ah! You startled me. I was coming to help.\""],
  failed: ["\"Whoops! I tripped! So clumsy. Forgive me, forgive me.\"", "\"Oh! My foot slipped. You are all right? Good. Good.\""],
  shoved: ["\"Oh no! Oh no! The edge, it just… gave way! Terrible. Terrible.\"", "\"I tried to catch them! You all saw. I tried!\""],
}

/** Is this plate a ledge Buppido will try his luck on? */
export function buppidoRisesLedgePlate(plate) {
  return BUPPIDO_RISES_LEDGE.plates.includes(String(plate))
}

/**
 * The hero he goes for: on their feet, and with nobody else (hero or companion, Buppido aside) within `aloneFt`.
 * The nearest such hero to him. `pxPerFt` converts the map's distance to feet.
 * @param {{ heroes?: Array<{ id?: string, x: number, y: number, down?: boolean }>, others?: Array<{ x: number, y: number, down?: boolean }>, buppido?: { x: number, y: number }, pxPerFt?: number }} [o]
 */
export function buppidoRisesLedgeTarget({ heroes = [], others = [], buppido, pxPerFt = 1 } = {}) {
  if (!buppido) return null
  const reach = BUPPIDO_RISES_LEDGE.aloneFt * pxPerFt
  const alone = heroes.filter((h) => h && !h.down && !others.concat(heroes).some((o) => o !== h && !o.down && Math.hypot(o.x - h.x, o.y - h.y) <= reach))
  alone.sort((a, b) => Math.hypot(a.x - buppido.x, a.y - buppido.y) - Math.hypot(b.x - buppido.x, b.y - buppido.y))
  return alone[0] || null
}

/** He is seen coming when the hero's passive Perception meets his Stealth roll. */
export function buppidoRisesLedgeSpotted(passive, stealthTotal) {
  return Number(passive) >= Number(stealthTotal)
}

/** SRD shove: his total must beat theirs; a tie changes nothing. */
export function buppidoRisesShoveWins(his, theirs) {
  return Number(his) > Number(theirs)
}

/** Which line Malachar says: the same one on every screen at the table, from the shared record's seq. */
export function buppidoRisesLine(seed) {
  const s = String(seed ?? "")
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return BUPPIDO_RISES_LINES[h % BUPPIDO_RISES_LINES.length]
}

/** How long from the death to initiative, so a screen joining late can tell where in the beat it is. */
export function buppidoRisesTotalMs() {
  const R = BUPPIDO_RISES_RULES
  return R.bodyMs + R.stoneMs + R.stirMs + R.emergeMs + R.surpriseMs
}

/**
 * Is this creature a spectator in this fight rather than a combatant?
 *
 * Sam, 2026-10-30, asked what the drow do once it starts: "watch and enjoy it." So the guards are present, visible and
 * hostile in every other sense, and they do not roll initiative, do not act, and are not pulled in by the rule that a
 * fight on a plate takes every hostile standing on it. They are an audience. If the party wins, the drow have been
 * entertained; if the party loses, the drow have still been entertained.
 */
export function buppidoRisesSpectator(n) {
  return !!(n && n.spectator)
}
