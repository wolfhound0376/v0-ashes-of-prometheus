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
//   [SAM 2026-10-30] DEATH AND RESTART: "prompt the DM to allow a restart ... you start in the camp as if it were the
//             first day but a roll will be needed to determine what you start out with. Make sure it's wired right and
//             the database has been cleared appropriately and game state synced." Asked where the restarted party
//             wakes, he chose THE SLAVE PEN, DAY ONE — the campaign's own opening — and the EXISTING scavenge roll
//             (1d10 days + d20 against the book's table, lib/scavenged.ts). So the restart is the campaign restart
//             that already exists (lib/restart-campaign.ts): it opens a new run, clears every world flag (which is
//             what makes each hero roll their fortune again at /awaken) and puts the party back in the pen.
//             The card no longer sends the table to the title on a timer while they wait: it asks the DM.
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

/**
 * What the GAME OVER card offers (Sam, 2026-10-30). The DM is the only one who may start the campaign over, so a
 * player's card asks him and then waits — it must NOT march them off to the title on a countdown while he decides.
 *
 *   offer  this card can lead to a restart at all (the real game; a rehearsal resets itself instead)
 *   ask    show "Ask the DM to restart" — a player's card
 *   do     show "Restart the campaign" — the DM's card
 *   wait   say that it is now the DM's call
 *   auto   may the card leave on its own after the countdown
 */
export function gameOverRestart({ app = true, sandbox = false, dm = false } = {}) {
  if (!app || sandbox) return { offer: false, ask: false, do: false, wait: false, auto: true }
  return { offer: true, ask: !dm, do: !!dm, wait: !dm, auto: false }
}

/** The heroes who have asked for a restart, in the order they asked, named as the card shows them. */
export function gameOverAskers(asks, names = {}) {
  const rows = Object.entries(asks && typeof asks === "object" ? asks : {})
    .filter(([slug, at]) => slug && typeof at === "number")
    .sort((a, b) => a[1] - b[1])
  return rows.map(([slug]) => names[slug] || slug)
}

/** "Lynkes is asking" / "Lynkes and Gandalf are asking" / "Lynkes, Gandalf and Fifi are asking". */
export function gameOverAskLine(namesAsked) {
  const n = (namesAsked || []).filter(Boolean)
  if (!n.length) return ""
  const who = n.length === 1 ? n[0] : n.slice(0, -1).join(", ") + " and " + n[n.length - 1]
  return `${who} ${n.length === 1 ? "is" : "are"} asking to start over.`
}

/** A replay: the page was loaded (or reloaded) after the game ended, so it shows the card at once, silently. */
export function gameOverIsReplay(at, nowMs) {
  return !(typeof at === "number" && nowMs - at < GAME_OVER_RULES.replayMs)
}
