// WHY CINEMATICS PLAYED "ALL THE TIME", AS ARITHMETIC.
//
// The request log, grouped by trigger and kind:
//
//   dm_override + action   20 requests · 4 distinct clips · 0 ever suppressed
//   event_driven + action  10 requests · 4 distinct clips · 1 suppressed
//
// `kind=action` is only ever sent for a cue Malachar emitted; `dm_override`
// was only ever sent with DM Mode on. So those twenty rows are automatic cues
// that took the DM's manual-replay door, which the route deliberately exempts
// from the once-per-character rule.
//
// Two rules protect it now, and both are here rather than in a component so
// they can be checked without a browser.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const out = mkdtempSync(join(tmpdir(), "cine-"))
const bundle = join(out, "c.mjs")
execFileSync(process.env.ESBUILD || "esbuild",
  ["lib/cinematic-replay.ts", "--bundle", "--format=esm", "--platform=neutral", "--outfile=" + bundle],
  { stdio: "inherit" })
const { triggerFor, shouldPlay } = await import(pathToFileURL(bundle).href)

// ── THE DOOR ────────────────────────────────────────────────────────────────
// The bug, stated as the one case that used to be wrong.
assert.equal(
  triggerFor({ dmMode: true, fromCue: true }),
  "event_driven",
  "a cue is NEVER an override, however the DM Mode toggle is set — this is the bug",
)
// And the three that were always right.
assert.equal(triggerFor({ dmMode: false, fromCue: true }), "event_driven")
assert.equal(triggerFor({ dmMode: true, fromCue: false }), "dm_override", "a deliberate press may replay")
assert.equal(triggerFor({ dmMode: false, fromCue: false }), "player_initiated")

// Stated the other way round, because this is the property that matters:
// DM Mode may only ever change the answer for a deliberate press.
for (const fromCue of [true, false]) {
  const off = triggerFor({ dmMode: false, fromCue })
  const on = triggerFor({ dmMode: true, fromCue })
  if (fromCue) assert.equal(on, off, "DM Mode must not change how a cue is sent")
  else assert.notEqual(on, off, "DM Mode must still escalate a deliberate press")
}

// ── THE UNSEATED WINDOW ─────────────────────────────────────────────────────
const seen = new Set(["clip-a"])

// No seat, already played here: silence. This is the DM's own window, which
// the server cannot remember because there is no character to key it on.
assert.equal(
  shouldPlay({ clipId: "clip-a", characterId: null, trigger: "event_driven", playedHere: seen }),
  false,
  "an unseated window must not replay a clip it already played",
)
// No seat, not played: plays, and only once.
assert.equal(
  shouldPlay({ clipId: "clip-b", characterId: null, trigger: "event_driven", playedHere: seen }),
  true,
)
// WITH a seat the server has already applied the real rule and would have
// returned nothing at all. Never second-guess it — that would suppress a clip
// this character genuinely has not seen just because another seat in the same
// browser had.
assert.equal(
  shouldPlay({ clipId: "clip-a", characterId: "kenta", trigger: "event_driven", playedHere: seen }),
  true,
  "a seated request is the server's call, not this list's",
)
// A deliberate override replays regardless. That is what the toggle is for,
// and it matches the exemption the route already makes.
assert.equal(
  shouldPlay({ clipId: "clip-a", characterId: null, trigger: "dm_override", playedHere: seen }),
  true,
)
assert.equal(
  shouldPlay({ clipId: "clip-a", characterId: "kenta", trigger: "dm_override", playedHere: seen }),
  true,
)

// ── THE WIRING ──────────────────────────────────────────────────────────────
// A rule the dashboard does not call is decoration. Both call sites asserted
// by name, and the old expression asserted gone.
const dash = readFileSync("components/dashboard/v4-dashboard.tsx", "utf8")
assert.match(
  dash,
  /trigger_type: triggerFor\(\{ dmMode: asDm, fromCue: Boolean\(cue\) \}\)/,
  "the request must build its trigger through triggerFor",
)
assert.match(dash, /shouldPlay\(\{/, "the dashboard must ask shouldPlay before playing")
assert.equal(
  /asDm \? "dm_override" : cue \? "event_driven"/.test(dash),
  false,
  "the old expression let DM Mode swallow the cue case — it must not come back",
)

// The route's exemption is the reason all of this matters. If it ever stops
// exempting dm_override, this whole file is arguing about nothing and should
// be revisited rather than left passing quietly.
const route = readFileSync("app/api/cinematics/route.ts", "utf8")
assert.match(
  route,
  /triggerType !== "dm_override" && \(await alreadySeen/,
  "the route still exempts dm_override from the seen-check; that is what makes the client rule load-bearing",
)

console.log("cinematic-replay: ok")
