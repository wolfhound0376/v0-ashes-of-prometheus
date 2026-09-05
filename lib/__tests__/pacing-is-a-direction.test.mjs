// A PACING NUDGE MUST NEVER BECOME A CHARACTER'S LINE.
//
// On 5 Sep 2026 the dialogue log carried four rows like this:
//
//   Fifi of Copperas Cove: [PACING] The party is still silent. Malachar leans
//   in and needles them directly...
//
// Sam: "WHY ARE OUR CHARACTERS FIFI & KENTA DOING THE PACING? IT SHOULD HAPPEN
// IN THE BACKGROUND."
//
// The cause was structural rather than arithmetic - the nudge travelled down
// the ordinary player-message pipe - so there is no function to unit test.
// What CAN be tested, and what actually protects the fix, is that the four
// places which treat an incoming message as words a person said all remain
// guarded. Each of these was a separate way for a stage direction to leak into
// the fiction, and each is asserted by name here so that removing one is a
// failing test rather than a regression discovered on a recording night.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const route = readFileSync("app/api/chat/route.ts", "utf8")
const page = readFileSync("app/page.tsx", "utf8")
const hook = readFileSync("lib/hooks/use-lich.ts", "utf8")

// ── 1. The flag exists, and is read strictly ────────────────────────────────
// `director === true` and nothing looser: a malformed body must not be able to
// silence a real player's line by sending director: "no".
assert.match(
  route,
  /const director = directorRaw === true/,
  "the route must read the flag with a strict === true",
)

// ── 2. The nudge is SENT as a direction ─────────────────────────────────────
const nudgeCall = page.match(/sendToLich\(nudgePrompt\(kind\)[^\n]*/)
assert.ok(nudgeCall, "app/page.tsx must still send the nudge through sendToLich")
assert.match(
  nudgeCall[0],
  /director:\s*true/,
  "the pacing nudge must be sent with { director: true } or it is logged as a player line",
)

// And the hook must actually put it on the wire; a flag the fetch drops is
// worse than no flag, because the call site looks right.
assert.match(
  hook,
  /body: JSON\.stringify\(\{[^}]*director:[^}]*\}\)/,
  "use-lich must forward `director` in the POST body",
)

// ── 3. A direction is NOT written to `dialogue` ─────────────────────────────
// The insert must sit inside a guard. Checked by locating the insert and
// looking backwards for the branch, rather than matching one exact spelling.
const insertAt = route.indexOf('speaker_type: "player"')
assert.ok(insertAt > 0, "the player dialogue insert must still exist")
const before = route.slice(Math.max(0, insertAt - 700), insertAt)
assert.match(
  before,
  /if \(director\)/,
  "the player-dialogue insert must be behind an `if (director)` branch",
)

// ── 4. The model is told it is a direction ──────────────────────────────────
// Without this the model replies TO the note - "you are right to stay quiet,
// Fifi" - which is the same bug one layer further in.
assert.match(route, /STAGE DIRECTION/, "the model message must announce itself as a direction")
assert.match(
  route,
  /content: director\s*\n?\s*\?/,
  "the live model message must branch on `director`",
)

// ── 5. Everything that reads `message` as SPEECH uses spokenMessage ─────────
// spokenMessage is "" for a direction. These three were each a live path for
// "Malachar leans in and needles them" to be read as the player naming
// Malachar, and to activate or ventriloquise him on the strength of it.
assert.match(
  route,
  /const spokenMessage = director \? "" : message/,
  "spokenMessage must be the empty string for a direction",
)
for (const [what, pattern] of [
  ["quote attribution (addressedNpc)", /addressedNpc\(String\(spokenMessage/],
  ["NPC engagement activation", /typeof spokenMessage === "string" && spokenMessage\.trim\(\)/],
  ["the speech-segmenter's context block", /\$\{spokenMessage \?/],
]) {
  assert.match(route, pattern, `${what} must read spokenMessage, not message`)
}

// And none of those three may still be reading the raw message: a leftover
// call is exactly how this would come back.
assert.equal(
  (route.match(/addressedNpc\(String\(message/g) || []).length,
  0,
  "addressedNpc must not be called with the raw message",
)

console.log("pacing-is-a-direction: ok")
