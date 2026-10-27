// lib/labor-walk.mjs — Hard Labor on the Underwalk: where a work detail walks, what the escort says, and the steps a
// detail goes through. Pure; no DOM, no fetch. Pasted whole (minus `export`) into the walk page by build_walk.py at
// /*__LABOR__*/, and read by app/api/labor and lib/labor-walk.test.ts — one copy of the rules.
//
// Design of record: project doc claude/Hard_Labor_Module_2026-10-26.md. Scheduler: lib/labor.ts (PR #919).
// Sources: [BOOK] OotA Encounters ch.1 p.12 · [EXP] OotA Expanded / the Guide (community) · [SAM] Sam's rulings ·
// [HOUSE] Claude's — Sam's call.

// ─── Where each task is worked on the painted map ─────────────────────────────────────────────────────────────
// The book's area is in lib/labor.ts; this is the PLATE the crew actually stands on. Three are not the book area:
//   pots, laundry → 9 (Waterfall): the pool (14) can only be reached by dropping through the falls and has no way back
//                 up. [EXP] the Expanded has the pots "dumped into the waterfall"; the Guide has laundry "held under
//                 the waterfall at area 9".
//   rocks, rope   → 10b (the guard tower's lower chamber, Sam's plate); supplies → 10c (the armory, Sam's plate).
//   kitchen, dishes → 3k (the kitchen, Sam's plate, PR #920); lift-trouble → 5c (the cliff below the lift, PR #920).
export const WORK_PLATE = {
  water: "9", lift: "5", clean: "2", pots: "9", kitchen: "3k", dishes: "3k", laundry: "9",
  rocks: "10b", rope: "10b", supplies: "10c", "lift-trouble": "5c", "quaggoth-hair": "12",
}

export const PEN_PLATE = "11"

// ─── Routing ──────────────────────────────────────────────────────────────────────────────────────────────────
// Breadth-first over the plates' exits. An escort walks: it never drops through the falls (kind "water"), never takes
// the lift basket or any other way off the map (kind "leave"), and never takes a hidden passage (label starting "(Hidden)").
const escortWalks = (z) => z && z.kind !== "water" && z.kind !== "leave" && !/^\(hidden\)/i.test(String(z.label || ""))

function edgesFrom(spec, p, reverse) {
  const out = []
  for (const z of spec[p].zones || []) if (escortWalks(z)) for (const t of z.to || []) if (spec[String(t)]) out.push([String(t), 1])
  if (reverse) {
    // a door that only exists on the far side (plate 5 leads to 2, but nothing on 2 leads back to 5): walked as a cut,
    // and a cut costs more than a door so the march only takes one when there is no other way
    for (const [k, v] of Object.entries(spec)) {
      if (k.startsWith("_") || !v || !Array.isArray(v.zones)) continue
      if (v.zones.some((z) => escortWalks(z) && (z.to || []).map(String).includes(p)) && !out.some(([t]) => t === k)) out.push([k, CUT_COST])
    }
  }
  return out
}
const CUT_COST = 5

/**
 * The cheapest plates from `from` to `to`, both included, or null when no route exists. A door costs 1. With `reverse`,
 * a one-way door may be walked backwards at CUT_COST (the walk plays it as a fade-cut: there is no exit on that side).
 */
export function routeBetween(spec, from, to, opts = {}) {
  const a = String(from), b = String(to)
  if (!spec[a] || !spec[b]) return null
  if (a === b) return [a]
  const dist = new Map([[a, 0]]), prev = new Map([[a, null]]), done = new Set()
  for (;;) {
    let p = null
    for (const [k, d] of dist) if (!done.has(k) && (p === null || d < dist.get(p))) p = k
    if (p === null) return null
    if (p === b) break
    done.add(p)
    for (const [k, w] of edgesFrom(spec, p, !!opts.reverse)) {
      const nd = dist.get(p) + w
      if (!dist.has(k) || nd < dist.get(k)) { dist.set(k, nd); prev.set(k, p) }
    }
  }
  const path = [b]
  for (let c = prev.get(b); c != null; c = prev.get(c)) path.unshift(c)
  return path
}

/** The exit on plate `from` that walks to plate `to` (the pen's gate when leaving the pen), or null for a cut. */
export function exitTo(spec, from, to) {
  const zones = (spec[String(from)] || {}).zones || []
  const ok = zones.filter((z) => escortWalks(z) && (z.to || []).map(String).includes(String(to)))
  return ok.find((z) => z.kind === "gate") || ok[0] || null
}

/** The hops of a route that have no door to walk through (played as a cut). */
export const cutsIn = (spec, route) => (route || []).slice(1).map((p, i) => [route[i], p]).filter(([f, t]) => !exitTo(spec, f, t))

/**
 * Where a task is worked, and the way there and back: by the doors when there is a way, else allowing a one-way door
 * backwards; home is the same way reversed when every step of it has a door, else the shortest way back.
 */
export function detailRoute(spec, task) {
  const plate = WORK_PLATE[task] || "9"
  const out = routeBetween(spec, PEN_PLATE, plate) || routeBetween(spec, PEN_PLATE, plate, { reverse: true })
  if (!out) return { plate, out: null, back: null }
  const rev = [...out].reverse()
  const back = cutsIn(spec, rev).length === 0 ? rev
    : routeBetween(spec, plate, PEN_PLATE) || routeBetween(spec, plate, PEN_PLATE, { reverse: true })
  return { plate, out, back }
}

// ─── The steps of a detail ────────────────────────────────────────────────────────────────────────────────────
//   scheduled → called (the escort is at the gate) → escorting (the march) → working → returning → done
//   any step but done → aborted (the DM calls it off, or the day ends before it was called)
export const STEPS = ["scheduled", "called", "escorting", "working", "returning", "done", "aborted"]
export const NEXT = { call: ["scheduled", "called"], march: ["called", "escorting"], arrive: ["escorting", "working"], return: ["working", "returning"], done: ["returning", "done"] }

/** The status after `action`, or null when the action does not apply to `status` now. */
export function advance(status, action) {
  if (action === "abort") return status === "done" || status === "aborted" ? null : "aborted"
  const n = NEXT[action]
  return n && n[0] === status ? n[1] : null
}

/** True while a detail has the party out of the pen or about to leave it. */
export const isLive = (status) => status === "called" || status === "escorting" || status === "working" || status === "returning"

// ─── The march out: one cut ───────────────────────────────────────────────────────────────────────────────────
// Sam, 2026-10-26: the escort opens the gate, the party steps through it behind them, and the detail just shows up on
// the work plate — no walk onto the next plate on the way. The walk page plays that as a walk out through the pen's
// exit and ONE fade-cut; this is the plate the party appears to have come in from, so they stand at its door.
/** The last plate before `to` on the way from `from` (the door they arrive by after a cut), else `from`. */
export function arrivalFrom(spec, from, to) {
  const r = routeBetween(spec, from, to) || routeBetween(spec, from, to, { reverse: true })
  return r && r.length > 1 ? r[r.length - 2] : String(from)
}

// ─── The shift timeout ────────────────────────────────────────────────────────────────────────────────────────
// 2026-10-26: a laundry detail sat at 'working' for two hours because nobody pressed "Finish the shift", and the escort
// stood on every plate the party walked onto. Sam approved ONE GAME HOUR: a detail working for more than an hour of
// game_clock after it reached 'working' ends itself — or, the backstop (Sam, 2026-10-27: "add the 15 minute backstop"),
// more than 15 REAL minutes after it reached 'working', whichever comes first. /api/labor applies it on the maps' poll
// (every map asks every 6 s), so it does not depend on any one browser:
//   1. past either limit, the server marks the detail overdue (an `overdue` event) and tells the maps;
//   2. the map that may press "Finish the shift" (the DM's, or the one that marched them) walks them home the normal
//      way (`return` → `done`);
//   3. if no map has started the way home OVERDUE_GRACE_MS after the mark, the server calls the detail off (`aborted`).
// The game clock moves only on Malachar's turns (5 minutes an exchange, [TIME:…] tags), not while the party walks or
// works on the map: a quiet table ages a shift not at all (measured 2026-10-27 from time_log) — hence the real-time
// backstop, which runs whether or not anyone talks to Malachar.
export const SHIFT_GAME_MINUTES = 60
export const SHIFT_REAL_MS = 15 * 60 * 1000
export const OVERDUE_GRACE_MS = 60000

/** Minutes since the start of day 1 for a game_clock reading {day, minutes}, or null. */
export const gameMinute = (c) => (c && Number.isFinite(Number(c.minutes)) ? (Math.max(1, Number(c.day) || 1) - 1) * 1440 + Number(c.minutes) : null)

/** The step event that put the detail to work (its `at` is real time; its `clock` the game time, when stamped). */
export const arrivalStep = (events) => [...(events || [])].reverse().find((e) => e && e.kind === "step" && e.to === "working") || null

/**
 * Which limit a working detail is past: "game-hour", "real-time" (the 15-minute backstop), or null for neither.
 * `arrived` is the game clock when it reached 'working'; the real time comes from that step's own `at`.
 */
export function shiftOver(detail, clock, nowMs, arrived = arrivalStep(detail && detail.events)?.clock) {
  if (!detail || detail.status !== "working") return null
  const a = gameMinute(arrived), n = gameMinute(clock)
  if (a !== null && n !== null && n - a > SHIFT_GAME_MINUTES) return "game-hour"
  const step = arrivalStep(detail.events), t0 = step ? Date.parse(step.at) : NaN
  if (Number.isFinite(t0) && nowMs - t0 > SHIFT_REAL_MS) return "real-time"
  return null
}

/**
 * What the server does about a detail now: "ok" (nothing), "flag" (first past a limit: mark it overdue and tell the
 * maps), "overdue" (marked, waiting on a map to walk them home), "abort" (marked and nobody did: call it off).
 */
export function shiftTimeout(detail, clock, nowMs, arrived = arrivalStep(detail && detail.events)?.clock) {
  if (!shiftOver(detail, clock, nowMs, arrived)) return "ok"
  const mark = (detail.events || []).find((e) => e && e.kind === "overdue")
  if (!mark) return "flag"
  const at = Date.parse(mark.at)
  return !Number.isFinite(at) || nowMs - at >= OVERDUE_GRACE_MS ? "abort" : "overdue"
}

// ─── The call: a hero's answer ────────────────────────────────────────────────────────────────────────────────
// [SAM] refusing is disobedience: the first time is always the warning (slapped or thrown back), and the quaggoth
// hauls them out anyway. A second offence on the same detail is lib/labor.ts disobey() — the roll, PR 3.
export const CHOICES = ["go", "drag", "refuse"]
export const CALL_TIMEOUT_MS = 25000     // [HOUSE] an unanswered hero is taken to have gone quietly

export function choiceEffect(choice) {
  if (choice === "drag") return { slow: true, warning: false, line: "drag" }
  if (choice === "refuse") return { slow: false, warning: true, line: "refuse" }
  return { slow: false, warning: false, line: "go" }
}

// ─── What they say ────────────────────────────────────────────────────────────────────────────────────────────
// Original lines (doc §6), not book text. Drow lines are spoken in Elvish/Undercommon: a hero without the tongue hears
// it as the walk's gibberish. No hero's name until the guard has learned it (Sam's NPC address rule).
export const LINES = {
  malachar: [
    "Dawn, or what passes for it down here. The drow have decided you are furniture that can walk.",
    "Ah, labor. The one thing in this hole more degrading than captivity is usefulness.",
    "Out of the pen they go. Watch which of the others go with them. The drow chose. They always choose for a reason, even when the reason is boredom.",
  ],
  call: [
    "Up. Work detail. The rest of you may continue rotting.",
    "You — the ones who still look hopeful. Out. We'll fix that.",
    "Work detail. Walk where the quaggoth walks. Stop where it stops. Breathe if you're permitted.",
  ],
  drag: "Slower, surfacer. I have a bolt that's been bored all day.",
  quaggoth: ["Walk. Meat walks.", "Soft thing. Break easy."],
  refuse: "(the quaggoth's open hand cracks across the prisoner's face and throws them to the floor)",
  overheard: [
    "Shoor wants the pots done before the Mistress wakes. Shoor wants a great many things.",
    "The patrol from the city is late again. — Then they're dead, or drunk. Either way, more work for us.",
  ],
  task: {
    water: "Fill it to the brand. Not over. Not under. The brand.",
    lift: "Turn it until your arms remember who owns them.",
    clean: "Every bunk, every boot. The Mistress inspects with her fingertips.",
    pots: "Every chamber, every pot. Spill one and you'll learn what the floor tastes like.",
    kitchen: "Menzoberranzan is a month's walk. You'll walk every step of it, and be grateful for the scenery.",
    dishes: "The Darklake? Close enough to smell. Go swim in it. It's hungry too.",
    laundry: "If the Mistress's silks come back grey, so do you.",
    rocks: "Stack them.",
    rope: "Sunwise. No — the other sunwise.",
    supplies: "Touch the spell case and I'll know. I always know.",
    "lift-trouble": "The goods went over the rail. You will bring them back up. The rope is old. So are you.",
    "quaggoth-hair": "Braid it. Gently. It remembers who pulled.",
  },
  back: "Back in your hole. Same time tomorrow, if you live.",
}

export const pickLine = (list, rng) => list[Math.floor(rng() * list.length) % list.length]

// ─── Who is who ───────────────────────────────────────────────────────────────────────────────────────────────
/** The walk's sprite slug for a prisoner NPC's row name ("Prince Derendil" → derendil, "Shuushar the Awakened" → shuushar). */
export function prisonerSlug(name) {
  const n = String(name || "").toLowerCase().replace(/^prince\s+/, "")
  return n.split(/\s+/)[0].replace(/[^a-z-]/g, "")
}

/** The ten prisoners of the pen, OotA Encounters ch.1 (their npc_encounters row names). */
export const PRISONERS = ["Ront", "Eldeth Feldrun", "Prince Derendil", "Sarith Kzekarit", "Buppido", "Jimjar", "Topsy", "Turvy", "Shuushar the Awakened", "Stool"]

/** The escort's sprite on the map: its own id (so the stage director never mistakes it for a gate guard). */
export const ESCORT_SPRITE = { drow: "drow-guard-male", "jorlan-duskryn": "jorlan", quaggoth: "quaggoth", "drow-elite-warrior": "drow-elite-warrior" }

// ─── The stations: the work itself (PR 3) ─────────────────────────────────────────────────────────────────────
// Each check is rolled on the dashboard's dice (lib/walk-roll.ts WALK_ACTIONS, Sam's 2026-10-25 ruling). A task with
// no check is a matter of time. [HOUSE] two passes finish a task.
export const WORK_ROLL = { water: "labor:water", lift: "labor:lift", pots: "labor:pots", kitchen: "labor:kitchen" }   // Lift Trouble: the cliff's own rappels are the work (feat/cliff-rappels)
export const WORK_NEEDED = 2
// [BOOK] the pointless work is "redone" whenever it misses the drow's arbitrary standards — here, always once.
export const CRUELTY = ["rocks", "rope", "supplies", "quaggoth-hair"]

/**
 * One go at the work. `success` is the dashboard's verdict (true for a task with no check). Returns the new progress,
 * whether the drow make them do it again, whether the task is finished, and which line the escort says.
 *   - a failed check: redo (the escort's "again")
 *   - a cruelty task the first time it is finished: redo, always [BOOK: arbitrary standards]
 */
export function workStep(task, progress, success, redoneAlready) {
  if (!success) return { progress, redo: true, done: false, line: "fail" }
  const next = progress + 1
  if (next < WORK_NEEDED) return { progress: next, redo: false, done: false, line: "progress" }
  if (CRUELTY.includes(task) && !redoneAlready) return { progress: 0, redo: true, done: false, line: "whim" }
  return { progress: next, redo: false, done: true, line: "done" }
}

export const WORK_LINES = {
  fail: ["Again.", "Is that the brand? I see no brand. Again.", "Slower hands than that and you'll lose them. Again."],
  whim: { rocks: "Now unstack them. Now stack them prettier.", rope: "Wrong. All of it. Again.", supplies: "No. By colour. Again.", "quaggoth-hair": "Crooked. Undo it." },
  progress: ["Keep going.", "Faster."],
  done: "That will do. Barely.",
}

// ─── Look around: what a sharp eye takes in on each plate while working ──────────────────────────────────────
// Book facts the room shows, not inventions. On the waterfall plate the look is the same notice Sam ruled unlocks the
// jump into the falls (2026-10-24): the webs below that break a fall.
export const LOOK_SEEDS = {
  "9": { text: "Below the bridge the drow keep webs stretched across the drop, and the falls pour into a pool. A fall would land soft.", source: "OotA p.14, p.18", falls: true },
  "5": { text: "The basket runs on a crank; it goes all the way down to the cavern floor by the pool. Turning it takes a strong back.", source: "OotA p.17–18" },
  "2": { text: "The footlockers each hold a flask of drow poison for the bolts, and spare clothes.", source: "OotA area 2" },
  "3k": { text: "The cooks leave their knives where they lie, and the drow at cards never count them.", source: "the Guide p.6 (community)" },
  "10b": { text: "The chamber above is the armory: crossbows, bolts, shortswords, silk rope.", source: "OotA area 10" },
  "10c": { text: "Six hand crossbows, cases of bolts, chain shirts, shortswords, daggers, coils of silk rope, caltrops.", source: "OotA area 10" },
  "12": { text: "The quaggoths all come back to this den to sleep. Shut them in here and they are out of the fight.", source: "OotA Expanded p.44 (community)" },
  "5c": { text: "A hundred feet below, a web net spans the chasm — and something large is waiting on it.", source: "OotA Expanded p.45 (community)" },
}

// ─── Pocketing ────────────────────────────────────────────────────────────────────────────────────────────────
/** The roll a pocket attempt needs: against the sharpest eyes in the escort (Jorlan 14, else a drow 12). */
export function pocketRoll(escortBestiaries) {
  return (escortBestiaries || []).includes("jorlan-duskryn") ? "labor:pocket-jorlan" : "labor:pocket"
}
/** A pocket that clears the DC by this much or less leaves the drow uneasy (lib/labor.ts SUSPICION_MARGIN). */
export const POCKET_CLOSE = 2
export const CAUGHT_LINE = "Open your hand. Slowly. Your fingers are mine — I'm only lending them back."

// ─── Caught, searched, defying (PR 4) ─────────────────────────────────────────────────────────────────────────
// Sam's rulings (2026-10-26): no routine pat-down — the drow search only on suspicion; disobedience is a warning first
// (slapped or thrown back), then on a roll either a fellow prisoner defuses it by taking the thing and offering it to
// the guard, or volleys bring the hero down (the surgeon comes unless she already has this run). The prisoner who
// defused it brings it up later. Rules for the roll and the triggers are lib/labor.ts (disobey, suspicionReasons).

/** The roll to keep something hidden when searched: the searcher's passive Perception as the DC [HOUSE, after p.19]. */
export function hideRoll(escortBestiaries) {
  return (escortBestiaries || []).includes("jorlan-duskryn") ? "labor:hide-jorlan" : "labor:hide"
}

/**
 * [HOUSE, Sam's suspicion list] An item too big to hide in rags: any weapon but a dagger, knife, dart or shard, or
 * anything over 2 lb. Coins, keys, vials, a strand of rope pass.
 */
export function tooBigToHide(item) {
  if (!item) return false
  const name = String(item.name || item.slug || "").toLowerCase()
  if (/dagger|knife|dart|shard|needle|key|vial|coin|ring|gem/.test(name)) return false
  if (/weapon/i.test(String(item.item_type || ""))) return true
  return Number(item.weight) > 2
}

export const SEARCH_LINES = {
  start: "Stop. Arms out. You've been too quiet.",
  clean: "Nothing. Pity. Move.",
  found: "Open your hand. Slowly. Your fingers are mine — I'm only lending them back.",
}

/** What the prisoner who defused it says as they take it off the hero and hold it out to the guard. */
export const DEFUSE_HANDOVER = {
  eldeth: "Here. It's yours. They're new — they don't know better yet.",
  ront: "Ront has it. Here. Stupid human. No more.",
  jimjar: "Ha! Found it, see? Must've dropped it. All yours, all yours.",
  shuushar: "Take it. The current does not need to break anyone today.",
  sarith: "Take it. Shoot them on your own time.",
  derendil: "I return what is yours. On my honour, it will not happen again.",
  topsy: "Here, here — Turvy says sorry. Turvy says a lot of things.",
  turvy: "(mutters something, and holds out the thing in two hands)",
  buppido: "Oh, such a fuss over so small a thing. Here you are, friend.",
  stool: "(the sprout pushes the thing toward the drow with both little hands)",
  _: "Here. Take it. They didn't mean it.",
}

/** That night, in the pen: why they did it (Sam: "Better to live another day", "Not worth it"). */
export const DEFUSE_TALK = {
  eldeth: "Better to live another day than die on a bad one. Next time, let go.",
  ront: "Not worth it. Ront see you dead, Ront sad. Little sad.",
  shuushar: "The current takes what it takes. You were holding on to a pebble.",
  sarith: "I didn't do it for you. Bolts miss.",
  jimjar: "I bet on you living. Don't make me pay out.",
  derendil: "A prince knows when a battle is not worth the blood. That was not worth yours.",
  topsy: "Turvy says you'd have been a stain on the floor. Turvy's usually right about stains.",
  turvy: "(Turvy mutters for a long time. Topsy listens, then: \"He says not to do that again.\")",
  buppido: "Oh, I couldn't let them have you. Not like that. Not when there are so many better ways.",
  stool: "(…not worth… you… friend… alive…)",
  _: "Better to live another day. It wasn't worth it.",
}
export const lineFor = (table, slug) => table[slug] || table._

// ─── What it looks and sounds like (assets, Sam 2026-10-26: "Start on props, poses, speech, and music") ────────
// How a hero works each task. `carry`: the hero heaves a sack onto the shoulder (sheet `heave`, once) and trudges
// with it (`carry`, the walk while loaded) to the drop and back. `scrub`: the hero kneels and works with the hands
// (`scrub`, looping). Sheets: scripts/sprites/add-labor-poses.py, the five main players only (Sam: "we may need to
// reuse pixel art for some other people"); a stand-in hero wears the sheets of the hero it stands in for, and a
// sprite with none of them works in its idle.
export const WORK_POSE = {
  water: "carry", lift: "carry", rocks: "carry", rope: "carry", supplies: "carry", "lift-trouble": "carry",
  clean: "scrub", pots: "scrub", kitchen: "scrub", dishes: "scrub", laundry: "scrub", "quaggoth-hair": "scrub",
}
/** How long a hero holds the scrub, and how far the carry walks to its drop (painted-map px). */
export const SCRUB_MS = 4200
export const CARRY_PX = 150

// What stands at each station while the party works it: PixelLab props (public/sprites/labor-*), set beside the
// spot the escort stands the party at. [HOUSE] which prop goes with which chore. Quaggoth hair needs none: the
// quaggoth is the station.
export const STATION_PROPS = {
  water: ["labor-water-barrel"],
  lift: ["labor-rope-coil"],
  "lift-trouble": ["labor-rope-coil"],
  clean: ["labor-wash-tub"],
  pots: ["labor-chamber-pot"],
  kitchen: ["labor-dish-stack"],
  dishes: ["labor-dish-stack", "labor-wash-tub"],
  laundry: ["labor-wash-tub", "labor-laundry-line"],
  rocks: ["labor-rock-heap", "labor-rock-stack"],
  rope: ["labor-rope-coil"],
  supplies: ["labor-water-barrel", "labor-rope-coil"],
  "quaggoth-hair": [],
}
/** Where props stand around the work spot, in order (offset from the spot, painted-map px). */
export const PROP_OFFSETS = [[120, -30], [-130, -10], [10, -110]]

// The quaggoth's voice: Sam picked both takes of "Bloodgrin" (ElevenLabs library voice, 2026-10-26: "Q1 and 2"), cut
// into one clip per line (public/audio/labor/). The two takes alternate so it never says a line the same way twice
// in a row. Its lines are Undercommon: a hero who does not speak it hears the growl and snarl, not the words.
export const QUAGGOTH_CLIPS = {
  "Walk. Meat walks.": ["quaggoth-walk-1", "quaggoth-walk-2"],
  "Soft thing. Break easy.": ["quaggoth-soft-1", "quaggoth-soft-2"],
}
/** The clip for a line, alternating takes by how many times the quaggoth has spoken. */
export const quaggothClip = (line, n) => {
  const takes = QUAGGOTH_CLIPS[line]
  return takes ? takes[Math.abs(n) % takes.length] : null
}

// The work song (M1, ElevenLabs Music v2.5, levelled to -16 LUFS like the explore tracks): plays while the party is
// out on a detail — marched, working, marched back — and gives way to the explore pool once they are locked in again.
export const WORK_SONG = "work-song"
