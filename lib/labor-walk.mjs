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
export const WORK_ROLL = { water: "labor:water", lift: "labor:lift", pots: "labor:pots", kitchen: "labor:kitchen", "lift-trouble": "labor:lift-trouble" }
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
