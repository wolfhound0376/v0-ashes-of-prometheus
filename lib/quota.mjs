// lib/quota.mjs — THE QUOTA: the work-detail minigame (Sam, 2026-11-15/16). Pure; no DOM, no fetch. Pasted whole
// (minus `export`) into the walk page by build_walk.py at /*__QUOTA__*/, and read by app/api/labor (the server rolls
// every die, so every screen sees the same shift) and lib/quota.test.ts — one copy of the rules.
//
// Prototype Sam played and ruled on: https://claude.ai/artifact/2LeCYK257hwrWZVmTD2qu5
// Design of record: project docs claude/Work_Detail_Rework_2026-11-15.md §8-9, claude/Quota_Followup_2026-11-16.md.
// Slay the Spire's shown *intent* + The Escapists' countable *quota*, on real 5E checks.
//
// Tags: [BOOK] OotA ch.1 · [SRD] SRD 5.2.1 · [SAM] Sam's ruling · [HOUSE] Claude's numbers, Sam's call.
//
// A shift: three inspections. Each opens with the drow's intent (who he watches, or what he is doing). Then each hero,
// in turn, keeps working or takes their one risky move (by class). When all have chosen, everything is revealed and
// rolled together. Fill the crew's quota or pull a double shift; get caught and Suspicion rises (out of 4).

export const QUOTA_ROUNDS = 3
export const SUSP_MAX = 4                 // [SAM] 2026-11-16: "Suspicion is only allowed to go to 4 not 8"
export const QUAG_PASSIVE = 11            // the quaggoth's passive Perception [BOOK stat block]
export const DROW_PERCEPTION = 2          // the drow's Perception bonus, rolled when he is watching [BOOK stat block]
export const DROW_INSIGHT = 0             // [HOUSE] the drow stat block lists no Insight: WIS +0
export const TURN_MS = 45000              // [HOUSE] a seated player who does not choose in 45 s keeps working
export const STEP_MS = 2000               // [SAM] "Slow reveal about 2 seconds per roll"

// ─── The yard's d100 (Sam, 2026-11-16: his list of 28 items, scattered over 1-100, seed 20261116) ────────────
// Every other number is nothing, and the looking costs the thief the round. Each numbered item can be taken once per
// run; roll a taken number again and it is simply nothing [SAM]. Catalogue slugs; tier, difficulty (`mod`) and the
// "why" lines are [HOUSE]. The rope is the 5-ft scavenged strand (`silk-rope-strand`, PR #1420).
export const LOOT = {
  rope: { slug: "silk-rope-strand", name: "A 5-ft strand of silk rope", tier: "useful", mod: 2, why: "Five feet of drow silk. Loop it through the bars round a guard's throat, or knot strands together." },
  wire: { slug: "bent-wire", name: "A bent metal wire", tier: "useful", mod: 1, why: "Pick the manacles with it." },
  cards: { slug: "gaming-set-cards", name: "A box of playing cards", tier: "later", mod: 1, why: "Jimjar will bet on anything. So will a bored drow." },
  spider: { slug: "small-spider", name: "A living spider", tier: "later", mod: 0, why: "Tarantula-sized. Set it down and it fights beside you." },
  oil: { slug: "lamp-oil", name: "A small flask of oil", tier: "useful", mod: 1, why: "Splash it and set it alight, or grease a lock." },
  key: { slug: "slave-pen-key", name: "A slave pen key", tier: "useful", mod: 8, key: true, why: "Opens the pen gate and the manacles. It hangs on a drow's belt." },
  bolt: { slug: "hand-crossbow-bolt-drow-poison", name: "A poisoned bolt", tier: "useful", mod: 1, why: "A hand crossbow bolt coated in drow poison." },
  gold: { slug: "gold-coin", name: "A gold coin", tier: "worthless", mod: 0, why: "One gold coin. Down here, worth nothing to a prisoner." },
  copper: { slug: "copper-coin", name: "A copper coin", tier: "worthless", mod: 0, why: "One copper. Worth even less." },
  caltrops: { slug: "bag-of-caltrops", name: "A bag of caltrops", tier: "useful", mod: 3, why: "Scatter them behind you and the pursuit slows down." },
  brandy: { slug: "almond-brandy", name: "A small bottle of brandy", tier: "later", mod: 1, why: "A bribe, a painkiller, or something that burns." },
  mush: { slug: "edible-mushrooms", name: "Edible mushrooms", tier: "later", mod: 0, why: "A day's food." },
  tools: { slug: "thieves-tools", name: "A set of thieves' tools", tier: "useful", mod: 4, why: "Pick the pen gate or the manacles." },
}
export const D100 = ["copper","mush",null,null,"cards",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"oil",null,"spider","bolt",null,null,null,"wire","caltrops",null,null,null,null,null,null,null,null,"spider",null,"mush",null,"key","tools",null,null,null,null,"rope",null,null,null,"brandy",null,null,null,null,null,null,null,null,"wire",null,"caltrops",null,null,null,null,"bolt","mush","oil",null,null,"key",null,null,null,"gold","mush","mush",null,null,"wire","wire",null,null,"brandy",null,"rope",null,null,"rope",null,null,null,null,null]
export const TIER_TEXT = { worthless: "Nearly worthless", later: "Maybe helpful later", useful: "Helpful" }
export const difficultyOf = (it) => it.mod >= 8 ? "very hard to take" : it.mod >= 5 ? "hard to take" : it.mod >= 2 ? "tricky to take" : "easy to take"

// What a boasting drow lets slip [BOOK p.12, the facts the drow know].
export const FACTS = [
  "\"Menzoberranzan is a month's walk. You'll walk every step of it.\"",
  "\"The Darklake? Close enough to smell. Go swim in it.\"",
  "\"The patrol from the city is late again. More work for us.\"",
]

// ─── Each hero's one risky move, by class [HOUSE; the prototype's four heroes, generalised] ───────────────────
export const RISKS = {
  scheme: { label: "Pocket it", icon: "risk-pocket", roll: "Sleight of Hand vs the quaggoth's eyes, and the drow's if he's watching" },
  distract: { label: "Put on a show", icon: "risk-show", roll: "Performance vs the drow's Insight" },
  help: { label: "Cover for a friend", icon: "risk-cover", roll: "no roll: the Help action [SRD]" },
  charm: { label: "Sweet-talk the drow", icon: "risk-charm", roll: "Persuasion vs the drow's Insight" },
}
export function riskFor(cls) {
  const c = String(cls || "").toLowerCase()
  if (/rogue/.test(c)) return "scheme"
  if (/bard/.test(c)) return "distract"
  if (/cleric|paladin|druid|ranger|monk/.test(c)) return "help"
  return "charm"
}

// The work check by task: lib/labor.ts TASKS where it has one [BOOK]; the others [HOUSE]: hauling chores Athletics
// DC 10, kneeling chores Dexterity DC 10 (the same split as WORK_POSE's carry/scrub).
const TASK_CHECK = { water: ["Athletics", 10], lift: ["Athletics", 12], "lift-trouble": ["Athletics", 12], pots: ["Dexterity", 10], kitchen: ["Survival", 12] }
const HAULED = ["rocks", "rope", "supplies", "lift"]
export function workCheck(task) {
  const t = TASK_CHECK[task]
  if (t) return { skill: t[0], dc: t[1] }
  return HAULED.includes(task) ? { skill: "Athletics", dc: 10 } : { skill: "Dexterity", dc: 10 }
}
const UNITS = { water: "barrels", kitchen: "dishes", dishes: "dishes", rocks: "stacks", rope: "coils", supplies: "crates", laundry: "loads", pots: "pots", clean: "bunks", lift: "loads", "lift-trouble": "sacks", "quaggoth-hair": "braids" }
export const unitOf = (task) => UNITS[task] || "loads"
// the pointless tasks, where the drow may kick it all over [BOOK p.12: "stack rocks, coil rope... only to undo it"]
export const CRUEL = ["rocks", "rope", "supplies", "quaggoth-hair"]

/** Quota for a crew [HOUSE]: the prototype's 7 for four heroes, about 1.75 a head. */
export const quotaFor = (n) => Math.max(3, Math.round(n * 1.75))

// ─── dice and odds ──────────────────────────────────────────────────────────────────────────────────────────
const d = (rng, n) => 1 + Math.floor(rng() * n)
export function pRoll(mod, target, adv, dis) {
  let p = 0
  for (let r = 1; r <= 20; r++) if (r + mod >= target) p++
  p /= 20
  if (adv && !dis) return 1 - (1 - p) ** 2
  if (dis && !adv) return p * p
  return p
}
export function pContest(mod, opp, adv, dis) {
  let w = 0, n = 0
  for (let a = 1; a <= 20; a++) for (let b = 1; b <= 20; b++) {
    const r = adv && !dis ? Math.max(a, b) : dis && !adv ? Math.min(a, b) : a
    for (let o = 1; o <= 20; o++) { n++; if (r + mod > o + opp) w++ }
  }
  return w / n
}

// ─── state ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * A new shift. `heroes`: [{id, name, cls, mods: {work, soh, perf, pers, con}, hp, hpMax, exh}] in turn order.
 * `carry`: what the run carried out of the last shift ({shift, susp, quotaUp, taken, facts, lockdown}).
 * `bots`: hero ids nobody at the table plays; they choose by themselves.
 */
/** @param {{task: string, heroes: any[], carry?: any, bots?: string[]}} o @param {() => number} rng @param {number} [nowMs] @returns {any} */
export function newShift(o, rng, nowMs = 0) {
  const { task, heroes, carry = {}, bots = [] } = o
  const hs = {}
  for (const h of heroes) hs[h.id] = { id: h.id, name: h.name, short: String(h.name || "Hero").split(/\s+/)[0], cls: h.cls, risk: riskFor(h.cls), mods: { ...h.mods }, hp: Math.max(0, h.hp ?? h.hpMax ?? 1), hpMax: Math.max(1, h.hpMax ?? h.hp ?? 1), exh: h.exh || 0 }
  const st = {
    v: 1, task, check: workCheck(task), unit: unitOf(task), shift: (carry.shift || 0) + 1,
    order: heroes.map((h) => h.id), heroes: hs, bots: [...bots],
    quota: quotaFor(heroes.length) + (carry.quotaUp ? 1 : 0), filled: 0, round: 1, turn: 0, turnAt: nowMs,
    susp: Math.min(SUSP_MAX, carry.susp || 0), lockdown: !!carry.lockdown, taken: { ...(carry.taken || {}) }, facts: [...(carry.facts || [])],
    charmed: false, intent: null, picks: {}, offers: {}, marked: {}, prone: {}, out: {}, caught: {}, best: {}, noRation: {},
    stolen: [], results: [], seq: 0, done: false, end: null,
  }
  for (const id of st.order) if (hs[id].hp <= 0) st.out[id] = true
  rollIntent(st, rng)
  advance(st, rng, nowMs)
  return st
}
export const heroOf = (st, id) => st.heroes[id]
const live = (st) => st.order.filter((id) => !st.out[id])
export const exhPen = (st, id) => -2 * (st.heroes[id].exh || 0)
export function rollIntent(st, rng) {
  const r = rng(), cruel = CRUEL.includes(st.task), who = live(st)
  if (r < 0.38 && who.length) st.intent = { kind: "watch", target: who[Math.floor(rng() * who.length) % who.length] }
  else if (r < 0.58 || (r < 0.72 && !cruel)) st.intent = { kind: "inspect" }
  else if (r < 0.72) st.intent = { kind: "kick" }
  else if (r < 0.86) st.intent = { kind: "boast" }
  else st.intent = { kind: "bored" }
}
/** Whose eyes are on a hero this round: marked thieves always; one watched hero; the whole crew while he inspects. */
export function watched(st, id) {
  if (st.marked[id]) return true
  const k = st.intent && st.intent.kind
  if (k === "watch") return st.intent.target === id
  return k === "inspect" || k === "kick"
}
const RISKY = ["scheme", "distract", "charm"]
/** Who a "Cover for a friend" covers: the first crewmate taking a risk, else the first crewmate. */
export function helpTarget(st, helper) {
  const others = live(st).filter((id) => id !== helper)
  return others.find((id) => RISKY.includes(st.picks[id])) || others[0] || null
}
export const helped = (st, id) => live(st).some((h) => h !== id && st.picks[h] === "help" && helpTarget(st, h) === id)
export function current(st) { return st.done || st.turn >= st.order.length ? null : st.order[st.turn] }
export const offerOf = (st, id) => { const o = st.offers[id]; return o && o.round === st.round && o.item ? LOOT[o.item] : null }

export function odds(st, id) {
  const h = st.heroes[id], ex = exhPen(st, id), adv = helped(st, id)
  const work = pRoll(h.mods.work + ex, st.check.dc, adv, false)
  let risk = null, note = ""
  if (h.risk === "scheme") {
    const it = offerOf(st, id)
    if (st.lockdown) note = "Lockdown: no stealing this shift."
    else if (it) {
      risk = pRoll(h.mods.soh + ex, QUAG_PASSIVE + it.mod, adv, false)
      if (watched(st, id) || it.key) risk *= pContest(h.mods.soh + ex, DROW_PERCEPTION + it.mod, adv, false)
      note = `${difficultyOf(it)[0].toUpperCase()}${difficultyOf(it).slice(1)}.${watched(st, id) ? " He's watching you." : ""}${adv ? " A friend covers you." : ""}`
    }
  } else if (h.risk === "distract") {
    risk = pContest(h.mods.perf + ex, DROW_INSIGHT, adv, false)
    note = st.intent.kind === "boast" ? "He's boasting: a good show flatters a fact out of him." : "Every eye turns to you."
  } else if (h.risk === "help") {
    const t = helpTarget(st, id)
    risk = t ? 1 : null
    note = t ? `${st.heroes[t].short} rolls with advantage, whatever they do.` : "Nobody to cover."
  } else {
    if (st.charmed && st.intent.kind !== "boast") note = "You already charmed him this shift."
    else risk = pContest(h.mods.pers + ex, DROW_INSIGHT, adv, false)
    if (risk != null) note = st.intent.kind === "boast" ? "He's in a talking mood: charm a fact out of him." : "Talk him into letting one load slide (quota −1)."
  }
  return { work, risk, note }
}
/** What a bot (a hero nobody at the table plays) chooses [HOUSE, the prototype's bots]. */
export function botChoice(st, id, rng) {
  const h = st.heroes[id], o = odds(st, id)
  if (o.risk == null) return "work"
  const someoneSchemes = live(st).some((x) => st.picks[x] === "scheme")
  if (h.risk === "scheme") { const it = offerOf(st, id), want = it.tier === "useful" ? 0.55 : it.tier === "later" ? 0.7 : 0.95; return o.risk >= want && rng() < 0.75 ? "scheme" : "work" }
  if (h.risk === "distract") return (st.intent.kind === "boast" || someoneSchemes) && rng() < 0.75 ? "distract" : "work"
  if (h.risk === "help") return (someoneSchemes && rng() < 0.6) || rng() < 0.1 ? "help" : "work"
  return (st.intent.kind === "boast" && rng() < 0.6) || (!st.charmed && rng() < 0.15) ? "charm" : "work"
}

/**
 * Move the turn on: skip the heroes who are out or knocked down, roll the thief's d100 when their turn comes (nothing
 * in reach costs them the round [SAM]), let the bots choose, and resolve the round once everyone has.
 */
export function advance(st, rng, nowMs = 0) {
  while (!st.done && st.turn < st.order.length) {
    const id = st.order[st.turn], h = st.heroes[id]
    if (st.out[id]) { st.picks[id] = "none"; st.turn++; continue }
    if (st.prone[id]) { st.picks[id] = "prone"; st.prone[id] = false; st.turn++; continue }
    if (h.risk === "scheme" && !st.lockdown && !(st.offers[id] && st.offers[id].round === st.round)) {
      const roll = d(rng, 100), key = D100[roll - 1], item = key && !st.taken[roll] ? key : null
      st.offers[id] = { round: st.round, roll, item }
      if (!item) { st.picks[id] = "nothing"; st.turn++; continue }
    }
    if (st.bots.includes(id)) { st.picks[id] = botChoice(st, id, rng); st.turn++; continue }
    st.turnAt = nowMs
    return st
  }
  if (!st.done) resolveRound(st, rng)
  return st
}
/** A hero's choice. Returns an error string, or null. */
export function choose(st, id, choice, rng, nowMs = 0) {
  if (current(st) !== id) return "not your turn"
  const h = st.heroes[id]
  if (choice !== "work" && choice !== h.risk) return "not a move this hero has"
  if (choice !== "work" && odds(st, id).risk == null) return "not possible now"
  st.picks[id] = choice; st.turn++
  advance(st, rng, nowMs)
  return null
}
/** A seated player who has not chosen in TURN_MS keeps working. */
export function nudge(st, rng, nowMs) {
  const id = current(st)
  if (!id || nowMs - (st.turnAt || 0) < TURN_MS) return false
  st.picks[id] = "work"; st.turn++
  advance(st, rng, nowMs)
  return true
}

// ─── the reveal: everything rolled at once ─────────────────────────────────────────────────────────────────
function roll(rng, adv, dis) { const a = d(rng, 20), b = d(rng, 20); return adv && !dis ? Math.max(a, b) : dis && !adv ? Math.min(a, b) : a }
const bump = (st, n) => { st.susp = Math.min(SUSP_MAX, st.susp + n) }
const unseen = (st) => FACTS.find((f) => !st.facts.includes(f)) || null
export function resolveRound(st, rng) {
  const R = [], it = st.intent, order = live(st)
  let gaze = null, distracted = false
  for (const id of st.order) if (st.picks[id] === "nothing") R.push({ who: id, kind: "nothing", roll: st.offers[id] && st.offers[id].roll })
  for (const id of st.order) if (st.picks[id] === "prone") R.push({ who: id, kind: "prone" })
  for (const id of order) if (st.picks[id] === "help") { const t = helpTarget(st, id); if (t) R.push({ who: id, kind: "help", target: t }) }
  for (const id of order) {
    if (st.picks[id] !== "distract") continue
    const h = st.heroes[id], n = roll(rng, helped(st, id), false), total = n + h.mods.perf + exhPen(st, id), opp = d(rng, 20) + DROW_INSIGHT
    if (total > opp) {
      distracted = true; if (it.kind !== "boast" && it.kind !== "bored") gaze = id
      let fact = null; if (it.kind === "boast") { fact = unseen(st); if (fact) st.facts.push(fact) }
      R.push({ who: id, kind: "distract", ok: true, n, total, vs: opp, fact })
    } else { bump(st, 1); R.push({ who: id, kind: "distract", ok: false, n, total, vs: opp, susp: 1 }) }
  }
  for (const id of order) {
    if (st.picks[id] !== "charm") continue
    const h = st.heroes[id], n = roll(rng, helped(st, id), false), total = n + h.mods.pers + exhPen(st, id), opp = d(rng, 20) + DROW_INSIGHT
    if (total > opp) {
      let fact = null, quotaDown = false
      if (it.kind === "boast") { fact = unseen(st); if (fact) st.facts.push(fact) }
      else if (!st.charmed) { st.charmed = true; st.quota = Math.max(1, st.quota - 1); quotaDown = true }
      R.push({ who: id, kind: "charm", ok: true, n, total, vs: opp, fact, quotaDown })
    } else { bump(st, 1); R.push({ who: id, kind: "charm", ok: false, n, total, vs: opp, susp: 1 }) }
  }
  const isWatched = (id) => gaze !== null ? gaze === id : watched(st, id)
  for (const id of order) {
    if (st.picks[id] !== "work") continue
    const h = st.heroes[id], adv = helped(st, id), n = roll(rng, adv, false), total = n + h.mods.work + exhPen(st, id), dc = st.check.dc
    let gain = n === 20 || total >= dc + 5 ? 2 : total >= dc ? 1 : 0, susp = 0, why = null
    if (st.task === "water" && total <= dc - 5) { gain = -1; why = "spill" }      // the barrel skids off the plank into the chasm
    if (n === 1) { susp = 1; why = why || "crash" }
    else if (gain <= 0 && it.kind === "inspect") { susp = 1; why = why || "seen" }
    if (it.kind === "kick" && gain > 0) { gain = 0; why = "kicked" }
    bump(st, susp)
    st.best[id] = Math.max(st.best[id] ?? -99, total - dc); st.filled = Math.max(0, st.filled + gain)
    R.push({ who: id, kind: "work", n, total, dc, adv, gain, susp, why })
  }
  for (const id of order) {
    if (st.picks[id] !== "scheme") continue
    const h = st.heroes[id], key = st.offers[id].item, item = LOOT[key], adv = helped(st, id)
    const n = roll(rng, adv, false), total = n + h.mods.soh + exhPen(st, id)
    const qp = (distracted && gaze !== id ? QUAG_PASSIVE - 5 : QUAG_PASSIVE) + item.mod
    let ok = total >= qp, drow = null
    if (ok && (isWatched(id) || item.key)) { drow = d(rng, 20) + DROW_PERCEPTION + item.mod; ok = total > drow }
    if (ok) {
      st.taken[st.offers[id].roll] = true; st.stolen.push({ who: id, item: key, slug: item.slug, round: st.round })
      R.push({ who: id, kind: "steal", ok: true, n, total, vs: qp, drow, item: key })
    } else R.push(caught(st, id, key, n, total, qp, drow, rng))
  }
  st.results = R; st.seq++
  st.round++; st.picks = {}; st.turn = 0
  if (st.round > QUOTA_ROUNDS) endShift(st, rng)
  else { rollIntent(st, rng); advance(st, rng, st.turnAt) }
  return st
}
// Caught (Sam: "serious ones"; numbers [HOUSE], scaled to Suspicion out of 4): the item is taken, the quaggoth grabs
// and throws the thief (1d6), +1 Suspicion, and the drow marks them for the rest of the shift. Caught again, or going
// for the key: 2d6, knocked down (they lose their next turn), no ration tonight (a level of exhaustion), +2 Suspicion,
// and the crew's quota goes up by 1. At 0 HP: dragged back to the pen, stable [SAM pen ruling], out for the shift.
function caught(st, id, key, n, total, qp, drow, rng) {
  const h = st.heroes[id], harsh = (st.caught[id] || 0) >= 1 || !!LOOT[key].key
  st.caught[id] = (st.caught[id] || 0) + 1; st.marked[id] = true
  let dmg
  if (!harsh) { dmg = d(rng, 6); bump(st, 1) }
  else { dmg = d(rng, 6) + d(rng, 6); bump(st, 2); st.prone[id] = true; st.quota += 1; st.noRation[id] = true }
  h.hp = Math.max(0, h.hp - dmg)
  const down = h.hp <= 0; if (down) st.out[id] = true
  return { who: id, kind: "caught", ok: false, n, total, vs: qp, drow, item: key, harsh, dmg, hp: h.hp, down, susp: harsh ? 2 : 1 }
}

// ─── the end of the shift ───────────────────────────────────────────────────────────────────────────────────
// Met: "That will do." Beat it by 2+: he boasts a fact, and tomorrow's quota is 1 higher. A hero who beat the DC by 10
// or more: Heroic Inspiration [SRD]. Missed: double shift, CON DC 10 or a level of exhaustion [SRD 5.2.1]. Suspicion:
// 2 searched at the gate (one smuggled item found), 3 beaten on the way back (one found), 4 lockdown (everything found,
// no stealing next shift). It cools by 1 a shift.
export function endShift(st, rng) {
  const met = st.filled >= st.quota, exhGain = {}, saves = {}, notes = []
  let fact = null
  if (met && st.filled - st.quota >= 2) { fact = unseen(st); if (fact) st.facts.push(fact) }
  if (!met) for (const id of st.order) { const t = d(rng, 20) + (st.heroes[id].mods.con || 0) + exhPen(st, id); saves[id] = t; if (t < 10) exhGain[id] = (exhGain[id] || 0) + 1 }
  for (const id of Object.keys(st.noRation)) exhGain[id] = (exhGain[id] || 0) + 1
  const inspired = met ? st.order.filter((id) => (st.best[id] ?? -99) >= 10) : []
  let found = []
  if (st.susp >= 4) found = st.stolen.slice()
  else if (st.susp >= 2 && st.stolen.length) found = [st.stolen[st.stolen.length - 1]]
  for (const f of found) f.found = true
  st.done = true; st.turn = st.order.length
  st.end = {
    met, saves, exhGain, inspired, fact, search: st.susp >= 4 ? "lockdown" : st.susp >= 3 ? "beaten" : st.susp >= 2 ? "searched" : null,
    found: found.map((f) => ({ who: f.who, slug: f.slug, item: f.item })),
    kept: st.stolen.filter((f) => !f.found).map((f) => ({ who: f.who, slug: f.slug, item: f.item })),
    carry: { shift: st.shift, susp: Math.max(0, st.susp - 1), quotaUp: met && st.filled - st.quota >= 2, taken: st.taken, facts: st.facts, lockdown: st.susp >= 4 },
  }
  return st
}

// ─── words: what the log and the table see (the map and the server both read these) ─────────────────────────
const W = (st, id) => st.heroes[id].short
const ITEM_LC = (k) => LOOT[k].name.toLowerCase()
export function resultLine(st, r) {
  const n = W(st, r.who)
  switch (r.kind) {
    case "nothing": return `${n} looks for something to take: nothing within reach. The looking costs ${n} the round.`
    case "prone": return `${n} is still on the ground and loses the turn.`
    case "help": return `${n} covers for ${W(st, r.target)}: ${W(st, r.target)} rolls with advantage.`
    case "distract": return r.ok
      ? `${n} puts on a show (Performance ${r.total} vs his Insight ${r.vs}). Every eye in the room turns to ${n}.${r.fact ? ` Flattered, he lets it slip: ${r.fact}` : ""}`
      : `${n} tries to put on a show (Performance ${r.total} vs ${r.vs}). A cup bounces off ${n}'s head. +1 Suspicion.`
    case "charm": return r.ok
      ? `${n} sweet-talks him (Persuasion ${r.total} vs ${r.vs}). ${r.fact ? `Pleased, he lets it slip: ${r.fact}` : r.quotaDown ? "\"Fine. One less. Don't make me regret it.\" Quota −1." : "He smirks."}`
      : `${n} tries to sweet-talk him (Persuasion ${r.total} vs ${r.vs}). "Was that meant to be charming?" +1 Suspicion.`
    case "work": {
      const what = `${n} works (${st.check.skill} ${r.total} vs DC ${r.dc}${r.adv ? ", with help" : ""})`
      const gain = r.gain > 0 ? `+${r.gain} ${st.unit}` : r.gain < 0 ? "−1" : "nothing gained"
      const why = r.why === "spill" ? " The barrel skids off the plank into the chasm." : r.why === "crash" ? " A crash. +1 Suspicion." : r.why === "seen" ? " The drow saw that. +1 Suspicion." : r.why === "kicked" ? " Then his boot sends it flying. It counts for nothing." : ""
      return `${what}: ${gain}.${why}`
    }
    case "steal": return `${n} palms ${ITEM_LC(r.item)} (Sleight of Hand ${r.total} vs ${r.vs}${r.drow != null ? `, the drow's eyes ${r.drow}` : ""}). Nobody saw a thing.`
    case "caught": return r.harsh
      ? `${n} reaches for ${ITEM_LC(r.item)} and is caught. Made an example of: thrown and kicked where ${n} lands, ${r.dmg} bludgeoning, knocked down, no ration tonight, +2 Suspicion, and the crew's quota goes up by 1.${r.down ? ` ${n} drops to 0 HP and is dragged back to the pen.` : ""}`
      : `${n} reaches for ${ITEM_LC(r.item)} and is caught. The quaggoth throws ${n} across the room: ${r.dmg} bludgeoning, +1 Suspicion, and the drow marks ${n} for the rest of the shift.${r.down ? ` ${n} drops to 0 HP and is dragged back to the pen.` : ""}`
  }
  return ""
}
/** The end of the shift, in short lines with no numbers [SAM 2026-11-16: "Just attractive font summaries"]. */
export function endLines(st) {
  const e = st.end; if (!e) return []
  const out = []
  if (!e.met) { out.push("Double shift. Every back is tested."); for (const id of st.order) out.push(e.exhGain[id] && !st.noRation[id] ? `${W(st, id)} is worn down: exhaustion.` : `${W(st, id)} holds up.`) }
  else if (e.fact) out.push(`Pleased with himself, the drow boasts: ${e.fact}`)
  if (e.carry.quotaUp) out.push("The crew worked too well. Tomorrow they'll expect more.")
  if (e.inspired.length) out.push(`${e.inspired.map((id) => W(st, id)).join(" and ")} ${e.inspired.length > 1 ? "shine" : "shines"}: Heroic Inspiration.`)
  for (const id of Object.keys(st.noRation)) out.push(`No ration for ${W(st, id)} tonight: exhaustion.`)
  if (e.search === "lockdown") out.push("Lockdown. They search everyone and find everything. No stealing next shift.")
  else if (e.search === "beaten" && e.found.length) out.push("Beaten. The escort works the crew over on the way back and finds one item.")
  else if (e.search === "searched" && e.found.length) out.push("Searched at the gate. One smuggled item is found.")
  return out
}
export const INTENT_TEXT = {
  watch: (st) => [`Watching ${W(st, st.intent.target)}`, "A risk by that hero is rolled against his Perception."],
  inspect: () => ["Inspecting the work", "Every risk is watched, and failed work is noticed."],
  kick: () => ["Finding fault with it all", "He'll kick it over: work this round fills nothing."],
  boast: () => ["Lingering to boast", "He watches nobody. Flatter him and a fact slips out."],
  bored: () => ["Bored, turned away", "Only the quaggoth is watching."],
}
export const INTENT_LINE = {
  watch: "You. I see your hands. Keep them busy.", inspect: "Let's see what passes for work here.",
  kick: "Crooked. I can see it from here.", boast: "Do you know who I am? Of course not. Let me tell you.", bored: null,
}
