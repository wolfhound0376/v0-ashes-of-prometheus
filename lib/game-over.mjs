// GAME OVER — the rules, pure, in one copy.
//
// Sam, 2026-10-29: "When all the active players are dead we need a GAME OVER in large letters like the 1980s games.
// Malachar says something. Cue darkness and this will take us back to main page unless this is a sandbox. In sandbox
// conditions it just resets the scenario."
//
// Plain JavaScript for the same reason as lib/surrender.mjs: build_walk.py pastes this file into the painted map (the
// Underwalk) at its GAME_OVER placeholder (minus `export`), so the map and lib/game-over.test.ts read the SAME rule and
// the same lines. Every name here starts with GAME_OVER_ or gameOver so the paste cannot collide with the page's names.
//
// SOURCES
//   [SAM 2026-10-29] the four facts: all active players dead; big 1980s GAME OVER; Malachar speaks; darkness, then the
//             main page — or, in a sandbox (rehearsal), the scenario resets.
//   [SAM 2026-10-30] the beat before all that: "When your last character dies you get the RIP tombstone with a mound in
//             front of it. Then you cut to the Game Over screen." Every hero who dies raises a stone where they fell,
//             so the last one lands on a graveyard; the camera pushes in on it for graveMs, then the lights go.
//   [SOURCED] "dead" is the 5e word, not "down": a hero at 0 HP is dying or stable and can still be saved. Dead is three
//             failed death saves, or damage at 0 HP / past 0 equal to the hit point maximum (SRD 5.1, "Death Saving
//             Throws" and "Instant Death") — the map's dieNow(), the one place a hero dies.
//   [CLAUDE]  "active players" = the heroes SEATED at the table this session (the map's PARTY: the roster lock). NPC
//             companions (Ront, Eldeth, the prisoners) do not keep the game alive — the players do.
//   [CLAUDE]  "main page" = the title screen, /intro (the front door, PR #851).
//   [CLAUDE]  the timings, the 8-bit sting and Malachar's three lines (original words; his voice is the lich voice the
//             dashboard already uses, /api/tts "onyx").

export const GAME_OVER_RULES = {
  title: "/intro",       // where the table goes in the real game
  holdMs: 1400,          // after the last death: the body falls and the "dead" mark shows before the lights go
  graveMs: 2200,         // then the last stone goes up where they fell and the camera pushes in on it (Sam, 2026-10-30)
  darkMs: 1800,          // the fade to black
  lettersMs: 900,        // GAME OVER on, before Malachar speaks
  leaveMs: 14000,        // from GAME OVER to leaving on its own (title, or the rehearsal's reset); the button goes now
  replayMs: 60000,       // a game over older than this (a page reloaded after it) shows at once: no fade, no voice, no sting
}

// Malachar's last word. Claude's lines (flagged above) — Sam to keep, cut or rewrite.
export const GAME_OVER_LINES = [
  "And that's everyone. Honestly, I've seen mushrooms put up more of a fight. And the mushrooms down here can at least talk.",
  "Well. All of you, dead. I'd say I'm disappointed, but that would mean I expected something.",
  "Don't cry. The drow will put your bones to better use than you ever did.",
]

/** Is the game over? Every seated hero is among the fallen. An empty table is never a game over. */
export function gameOverActive(seated, fallen) {
  const s = (Array.isArray(seated) ? seated : []).filter(Boolean)
  if (!s.length) return false
  const f = new Set(Array.isArray(fallen) ? fallen : [])
  return s.every((slug) => f.has(slug))
}

/** The fallen list with one more hero on it (no repeats, no blanks). Returns a new array. */
export function gameOverNoteDeath(fallen, slug) {
  const f = Array.isArray(fallen) ? fallen.filter(Boolean) : []
  if (!slug || f.includes(slug)) return f
  return [...f, slug]
}

/** Which line Malachar says: the same one on every screen at the table, from the shared record's seq. */
export function gameOverLine(seed) {
  const s = String(seed ?? "")
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return GAME_OVER_LINES[h % GAME_OVER_LINES.length]
}

/**
 * What happens after the letters. A sandbox (rehearsal, ?sandbox=1) or the stand-alone preview resets the scenario;
 * the real game goes to the title screen. The DM's screen never leaves on its own — he reads the table first.
 */
export function gameOverAfter({ sandbox = false, app = true, dm = false } = {}) {
  const kind = sandbox || !app ? "reset" : "title"
  return { kind, auto: !dm || kind === "reset" }
}

/** A replay: the page was loaded (or reloaded) after the game ended, so it shows the card at once, silently. */
export function gameOverIsReplay(at, nowMs) {
  return !(typeof at === "number" && nowMs - at < GAME_OVER_RULES.replayMs)
}
