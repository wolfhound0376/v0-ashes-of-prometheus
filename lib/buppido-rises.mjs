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
  plate: 11,             // the slave pen. Nowhere else: on the road there is no pen and no audience
  foe: "zombie-rotting", // the sprite set with the prebuilt emerge animation
  loot: "scarab-of-protection",
  bodyMs: 2600,          // he lies where he fell while the others are dragged out and the guards get bored
  stoneMs: 1100,         // the stone pushes up (the grave sheet is 6 frames at 150 ms, plus a beat to read it)
  stirMs: 1500,          // the mound trembles. Nothing has come out yet, and this is the longest second in the session
  emergeMs: 1750,        // 21 frames at 12 fps: the zombie climbs out
  surpriseMs: 900,       // the guards react before initiative — they are entertained, not alarmed
}

// Malachar's lines over the rise. Claude's words (flagged above) — Sam to keep, cut or rewrite.
export const BUPPIDO_RISES_LINES = [
  "He did keep saying he couldn't die. I want it on the record that he was technically correct, and that this is worse.",
  "A god returns to his faithful. Look at him. Look what the office has done to him.",
  "Oh, he's back. He's just not bringing the personality this time.",
]

/** Does the rise fire? Buppido, dead, in the pen, and only once per campaign. */
export function buppidoRisesActive({ deadId, plate, fired = false } = {}) {
  if (fired) return false
  return String(deadId || "") === BUPPIDO_RISES_RULES.npc && Number(plate) === BUPPIDO_RISES_RULES.plate
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
