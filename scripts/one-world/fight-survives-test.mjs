// A FIGHT SURVIVES ITS SCREEN — the hand-over test (review of #1272, 2026-11-11: "Reload or close the screen that runs
// the fight. The others stayed frozen in combat ... The reloaded screen walks free with no fight.")
//
// The same stand-in game server as one-fight-test.mjs, with the hand-over rules of lib/walk-fight.ts (take, lost). It
// opens real screens in headless Chrome and checks, scenario by scenario:
//   close    the screen running a three-screen fight is closed: the others say so, exactly one of them takes the fight
//            over within seconds (the lowest seat), nobody leaves combat, hit points / conditions / initiative order /
//            round / whose turn are what they were, a player's press still reaches the fight, and it can be finished on
//            every screen. Before that: a healthy fight can be neither taken nor ended by another screen.
//   reload   the screen running a fight reloads: it comes back INTO the same fight (never a second one), the other screen
//            carries it on, one authority.
//   solo     one screen, alone, reloads mid-fight: it picks its own fight back up where it stood.
//   away     the screen running a fight loses the network for a while and comes back: the fight was handed on, and the
//            returning screen shows it instead of running a second copy.
//   paused   the DM's stopped time freezes the fight's clock on the screen running it: that is not silence, nobody takes it.
//   lost     no screen can carry the fight: it is ended on every screen, the log says so, nobody is left in combat.
//   missing  the tables are not there (PGRST205): the page stops asking after the first answer.
//
//   npm i --no-save playwright@1.48.2            (once; CHROME=/usr/bin/google-chrome to use an installed Chrome)
//   STAGE_JSON=<file> node scripts/one-world/fight-survives-test.mjs      (ONLY=close,reload  PORT=4130  SHOTS=<dir>)
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { chromium } from "playwright"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const ctx = {}; runInNewContext(readFileSync(join(ROOT, "js/aop-one-world.js"), "utf8") + "\nthis.W = AopOneWorld;", ctx)
const OWL = ctx.W
const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498", KENTA = "51e4202d-b4d5-4658-a9c1-6102713e77f1"
const PORT = +(process.env.PORT || 4130), ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null, SHOTS = process.env.SHOTS || ""
// the rules of lib/walk-fight.ts, as the route applies them
const HANDOVER_MS = 8000, STEP_MS = 2000, LOST_MS = 30000
const STAGE = process.env.STAGE_JSON ? JSON.parse(readFileSync(process.env.STAGE_JSON, "utf8")) : await fetch("https://ashes.playacartagena.com/api/map-stage").then((r) => r.json())
const THIRD = (STAGE.seated.find((s) => s.id !== FIFI && s.id !== KENTA) || {}).id
const SEATED = STAGE.seated.filter((s) => s.id === FIFI || s.id === KENTA || s.id === THIRD)
if (SEATED.length < 3) { console.log("Fifi and Kenta must both be seated in the live run for the sheets; or pass STAGE_JSON"); process.exit(2) }
const SEATNO = { [FIFI]: 1, [KENTA]: 2, [THIRD]: 3 }
const newWorld = () => ({ campaign_run_id: "00000000-0000-0000-0000-000000000014", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} })
let world = newWorld(), missing = false
const log = []
let fights = [], msgs = [], fightLog = [], reqs = []; let fightSeq = 0, msgSeq = 0, bytes = 0
const reset = () => { world = newWorld(); fights = []; msgs = []; fightLog = []; reqs = []; missing = false }
// lib/walk-fight.ts handoverOrder + takeDecision
function handoverOrder(seats, authKey, now) { const left = { ...seats }, order = []; for (let k = OWL.driverOf(null, left, now); k != null && order.length < 64; k = OWL.driverOf(null, left, now)) { order.push(k); delete left[k] } return order.includes(authKey) ? [...order.filter((k) => k !== authKey), authKey] : order }
function takeDecision(f, who, seats, now) { const quiet = now - f.seen; if (quiet < HANDOVER_MS) return { ok: false, why: "held" }; const o = handoverOrder(seats, f.auth, now), place = o.includes(who) ? o.indexOf(who) : o.length; return quiet >= HANDOVER_MS + place * STEP_MS ? { ok: true } : { ok: false, why: "wait" } }
const pub = (f) => ({ id: f.id, plate: f.plate, auth_key: f.auth, auth_seen: new Date(f.seen).toISOString(), ended_at: f.ended_at })
function apply(patch, by) {
  const w = world
  if (patch.state) w.state = { ...w.state, ...patch.state }
  if (patch.heroes) for (const [k, v] of Object.entries(patch.heroes)) if ((v.seq || 0) > ((w.heroes[k] && w.heroes[k].seq) ?? -1)) w.heroes[k] = v
  if (patch.seats) w.seats = { ...w.seats, ...patch.seats }
  if ("plate" in patch) w.plate = patch.plate
  if (process.env.OW_DEBUG && ("plate" in patch || patch.travel)) console.log("[server]", by, "plate", patch.plate, "travel", JSON.stringify(patch.travel || null))
  if (patch.travel) w.travel = patch.travel
  const rest = Object.keys(patch).filter((k) => k !== "seats")
  if (rest.length) { w.version++; w.updated_by = by; log.push({ by, keys: rest, v: w.version }) }
  return JSON.parse(JSON.stringify(w))
}
const answer = (w, extra = {}) => ({ version: w.version, digest: OWL.worldDigest(w.plate, w.state), now: Date.now(), seats: w.seats, ...extra })
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css" }
let seatedNow = [FIFI, KENTA, THIRD]
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname
  let body = ""; for await (const c of req) body += c
  const j = body ? (() => { try { return JSON.parse(body) } catch { return {} } })() : {}
  const send = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
  if (p === "/api/verify-claim") return send({ valid: true, character: SEATED.find((s) => s.id === j.characterId) })
  if (p === "/api/map-stage") return send({ run: 14, seated: SEATED.filter((s) => seatedNow.includes(s.id)), present: [], gone: [], npcLanguages: {} })
  if (p === "/api/walk-world") {
    if (req.method === "GET") return send(answer(world, { world, realtime: null }))
    const who = j.characterId || "dm"
    if (j.op === "beat") {
      const w = apply({ seats: { [who]: { at: Date.now(), slug: j.slug, cid: who === "dm" ? null : who, dm: who === "dm", seat: SEATNO[who] ?? null, digest: j.digest, version: j.version, status: j.status } } }, who)
      return send(answer(w, (j.version < w.version || j.full) ? { world: w } : {}))
    }
    const c = OWL.cleanPatch(j.patch, who)
    if (c.error) return send({ error: c.error }, 400)
    const refused = []
    if (c.patch.heroes) for (const [s, h] of Object.entries(c.patch.heroes)) if (!OWL.mayWriteHero(h, who, who === "dm", world.seats, Date.now())) { refused.push(s); delete c.patch.heroes[s] }
    return send(answer(apply(c.patch, who), refused.length ? { refused } : {}))
  }
  if (p === "/api/walk-fight") {
    reqs.push({ t: Date.now(), s: req.headers["x-screen"] || "?", m: req.method, op: j.op || "get" })
    // the tables are not there: what the route answers when PostgREST says PGRST205 (the message as #1272 passes it on)
    if (missing) return send({ error: "Could not find the table 'public.walk_fights' in the schema cache" }, 503)
    if (req.method === "GET") {
      const id = url.searchParams.get("fight")
      if (!id) { const f = fights.find(f => !f.ended_at && Date.now() - f.seen < 60000); return send({ fight: f ? pub(f) : null, now: Date.now() }) }
      const f = fights.find(f => f.id === id); const since = +url.searchParams.get("since") || 0; const kind = url.searchParams.get("kind") === "in" ? ["in"] : ["tick", "end"]
      return send({ fight: f ? pub(f) : null, msgs: msgs.filter(m => m.fight === id && m.id > since && kind.includes(m.kind)).slice(0, 200).map(m => ({ id: m.id, kind: m.kind, by_key: m.by, body: m.body })), now: Date.now() })
    }
    const who = j.characterId || "dm"
    if (j.op === "open") {
      const live = fights.find(f => !f.ended_at)
      if (live && Date.now() - live.seen < 60000) return send({ auth: live.auth === who, joined: true, fight: pub(live) })
      if (live) live.ended_at = new Date().toISOString()
      const f = { id: "f" + (++fightSeq), plate: String(j.plate), auth: who, seen: Date.now(), ended_at: null }; fights.push(f); fightLog.push({ open: f.id, by: who })
      return send({ auth: true, fight: pub(f) })
    }
    const f = fights.find(f => f.id === j.fight)
    if (j.op === "lost" && (!f || f.ended_at)) return send({ ok: true, ended: true })
    if (!f || f.ended_at) return send({ error: "no such live fight", ended: true }, 409)
    if (j.op === "take") {
      const d = takeDecision(f, who, world.seats, Date.now()); fightLog.push({ take: f.id, by: who, ok: d.ok, why: d.why, quiet: Date.now() - f.seen })
      if (!d.ok) return send({ auth: false, why: d.why, fight: pub(f), now: Date.now() })
      const from = f.auth; f.auth = who; f.seen = Date.now()
      return send({ auth: true, from, fight: pub(f), now: Date.now() })
    }
    if (j.op === "lost") {
      const ok = Date.now() - f.seen >= LOST_MS; fightLog.push({ lost: f.id, by: who, ok })
      if (!ok) return send({ ok: false, error: "the fight is still held" }, 409)
      f.ended_at = new Date().toISOString(); msgs.push({ id: ++msgSeq, fight: f.id, kind: "end", by: who, body: { lost: true } })
      return send({ ok: true })
    }
    if (j.op !== "in" && f.auth !== who) return send({ error: "not yours", moved: true, fight: pub(f) }, 403)
    const m = { id: ++msgSeq, fight: f.id, kind: j.op, by: who, body: j.body || {} }; msgs.push(m); bytes += JSON.stringify(m.body).length
    if (j.op === "tick") f.seen = Date.now()
    if (j.op === "end") f.ended_at = new Date().toISOString()
    return send({ ok: true, id: m.id })
  }
  if (p.startsWith("/api/")) return send({})
  let f = join(ROOT, p === "/" ? "velkynvelve-walk/index.html" : p)
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html")
  if (!existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f))
})
await new Promise((r) => server.listen(PORT, r))


const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--mute-audio"] } : {})
let fails = 0, passes = 0
const check = (name, ok, detail) => { ok ? passes++ : fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const URL0 = `http://localhost:${PORT}/velkynvelve-walk/index.html?oneworld=1`
const ready = (pg) => pg.waitForFunction(() => typeof mode !== "undefined" && mode !== "load" && typeof OW !== "undefined" && OW.on, null, { timeout: 90000 })
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 }, extraHTTPHeaders: { "x-screen": name } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage(); pg.name = name
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (/one-fight/.test(m.text()) && process.env.VERBOSE) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto(URL0); await ready(pg)
  return pg
}
// what a screen believes the fight is
const snap = (pg) => pg.evaluate(() => { const all = [...new Set([...foes, ...party, ...((cbt && cbt.allies) || [])])].filter(a => a.c); const a = cbt && activeActor()
  return { mode, auth: FIGHT.auth, mirror: FIGHT.mirror, fid: FIGHT.id, round: cbt && cbt.round, idx: cbt && cbt.idx, active: a ? akey(a) : null, phase: cbt && cbt.phase,
    order: cbt ? cbt.order.map(akey) : null, hp: Object.fromEntries(all.map(a => [akey(a), a.c.hp])), conds: Object.fromEntries(all.map(a => [akey(a), [...(a.c.conds || [])].sort()])),
    init: Object.fromEntries(all.map(a => [akey(a), a.c.init])), foes: foes.map(akey).sort(), notice: ($("fightNotice") && !$("fightNotice").hidden) ? $("fightNotice").textContent : "" } }).catch((e) => ({ err: String(e).slice(0, 120) }))
const core = (s) => JSON.stringify({ round: s.round, idx: s.idx, active: s.active, order: s.order, hp: s.hp, conds: s.conds, init: s.init, foes: s.foes })
const shot = async (pg, name) => { if (SHOTS) await pg.screenshot({ path: join(SHOTS, name + ".png") }).catch(() => {}) }
async function startFight(pg) {
  await pg.evaluate(async () => { await loadSpriteManifest("drow-guard-male"); state.wardBroken = true; guardsAlarm = null; for (const n of [...npcs]) if (n.hostile){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n); } talkGivesWay(); startCombat(["drow-guard-male", "drow-guard-male"], "the fight under test", {noAllies: true}) })
}
// play on the screen that runs the fight until the fight is waiting on a hero whose player will still be at the table
// (a stable moment to break it; `skip` is the hero of the screen about to go, whose turn is ended as its player would).
// A hero whose player has left is another rule (#1272: the lowest seat's, or their own instincts), not this test's.
async function untilHeroTurn(pg, skip = null, secs = 90) {
  for (let i = 0; i < secs; i++) {
    const s = await pg.evaluate(() => { const a = cbt && activeActor(); return { id: a && a.id, pc: !!a && a.kind === "pc" && !a.down, phase: cbt && cbt.phase, busy: combatBusy, mode } })
    if (s.mode !== "combat") return false
    if (s.pc && s.phase === "menu" && !s.busy) { if (s.id !== skip) return true; await pg.evaluate(() => nextTurn()) }
    await wait(1000)
  }
  return false
}
// make the fight unmistakable (a wounded drow, a prone one, a hurt hero), and wait until every mirror shows exactly that
async function markAndSync(auth, mirrors) {
  await auth.evaluate(() => { const fs = standing(foes); fs[0].c.hp = 7; if (fs[1]) fs[1].c.conds.add("prone"); const k = party.find(p => p.id === "kenta"); if (k && k.c) k.c.hp = Math.min(k.c.hp, 5) })
  let a
  for (let i = 0; i < 20; i++) { await wait(1000); a = await snap(auth); const ms = await Promise.all(mirrors.map(snap)); if (ms.every((m) => core(m) === core(a))) return a }
  return null
}
const seize = (pg, op, id) => pg.evaluate(async ([op, id]) => { const r = await fetch("/api/walk-fight", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, fight: id, characterId: localStorage.getItem("aop_character_id"), claimToken: "tok" }) }); return { status: r.status, ...(await r.json().catch(() => ({}))) } }, [op, id])
// watch screens through a hand-over: every sample's mode, when the notice shows, when one of them runs the fight
async function watchHandover(pages, maxS = 40) {
  const t0 = Date.now(), seen = { modes: new Set(), noticeAt: null, notice: "", authAt: null, both: false }
  while (Date.now() - t0 < maxS * 1000) {
    const ss = await Promise.all(pages.map(snap))
    for (const s of ss) { if (s.mode) seen.modes.add(s.mode); if (s.notice && seen.noticeAt == null) { seen.noticeAt = Date.now() - t0; seen.notice = s.notice; await shot(pages[ss.indexOf(s)], "notice") } }
    if (ss.filter((s) => s.auth).length > 1) seen.both = true
    if (ss.some((s) => s.auth) && seen.authAt == null) { seen.authAt = Date.now() - t0; seen.last = ss; await wait(3500); const again = await Promise.all(pages.map(snap)); if (again.filter((s) => s.auth).length > 1) seen.both = true; for (const s of again) if (s.mode) seen.modes.add(s.mode); seen.last = again; return seen }
    await wait(400)
  }
  seen.last = await Promise.all(pages.map(snap)); return seen
}
async function finish(auth, others) {
  await auth.evaluate(() => { for (const f of foes){ f.c.hp = 0; f.down = true; } endCombat(true) })
  await wait(5000)
  const all = await Promise.all([auth, ...others].map((pg) => pg.evaluate(() => ({ mode, bodies: npcs.filter(n => n.body).length, fight: FIGHT.id, mirror: FIGHT.mirror, auth: FIGHT.auth }))))
  return all
}
const closeAll = async (...pgs) => { for (const p of pgs) await p.context().close().catch(() => {}) }

const SCEN = {
  async close() {
    seatedNow = [FIFI, KENTA, THIRD]
    const A = await screen(FIFI, "A"), B = await screen(KENTA, "B"), C = await screen(THIRD, "C"); await wait(4000)
    await startFight(A); await wait(7000)
    const up = await untilHeroTurn(A, "freia"), before = up && await markAndSync(A, [B, C])
    check("close: three screens, one fight, a hero's turn, all in step", !!before && before.auth, before ? { fid: before.fid, round: before.round, active: before.active, hp: before.hp } : await Promise.all([A, B, C].map(snap)))
    if (!before) return closeAll(A, B, C)
    // a healthy fight cannot be seized or ended from another screen
    const t1 = await seize(B, "take", before.fid), l1 = await seize(C, "lost", before.fid); await wait(1500)
    const still = await snap(A)
    check("close: a healthy fight cannot be taken by another screen", t1.auth === false && fights[0].auth === FIFI && still.auth && !(await snap(B)).auth, { take: { auth: t1.auth, why: t1.why }, serverAuth: fights[0].auth.slice(0, 6) })
    check("close: a healthy fight cannot be ended by another screen", l1.status === 409 && !fights[0].ended_at && still.mode === "combat", { status: l1.status })
    await shot(B, "close-B-before")
    await A.context().close(); const t0 = Date.now()
    const w = await watchHandover([B, C]); await shot(B, "close-B-after"); await shot(C, "close-C-after")
    const [b, c] = w.last
    check("close: the waiting screens say so in a notice", w.noticeAt != null && /gone quiet/.test(w.notice), { atMs: w.noticeAt, notice: w.notice })
    check("close: the fight is handed on within seconds (8 s of silence, then the order)", w.authAt != null && w.authAt < 25000, { handedAfterMs: w.authAt })
    check("close: exactly one screen runs it afterwards, the other shows it", !w.both && [b, c].filter((s) => s.auth).length === 1 && [b, c].filter((s) => s.mirror).length === 1 && b.fid === before.fid && c.fid === before.fid, { B: { auth: b.auth, mirror: b.mirror }, C: { auth: c.auth, mirror: c.mirror }, both: w.both })
    check("close: it went to the lowest seat still at the table (One World's order)", b.auth && fights[0].auth === KENTA, { serverAuth: fights[0].auth.slice(0, 6) })
    check("close: nobody was dropped out of combat on the way", [...w.modes].join() === "combat", [...w.modes])
    check("close: no second fight was opened, nothing started from scratch", fights.length === 1 && fightLog.filter((e) => e.open).length === 1, fightLog.filter((e) => e.open || (e.take && e.ok)))
    const keep = (s) => JSON.stringify({ order: s.order, hp: s.hp, conds: s.conds, init: s.init, foes: s.foes, round: s.round, idx: s.idx, active: s.active })
    check("close: hit points, conditions, initiative, order, round and turn are what they were", keep(b) === keep(before) && keep(c) === keep(before), keep(b) === keep(before) ? { round: b.round, active: b.active, hp: b.hp } : { before: JSON.parse(keep(before)), B: JSON.parse(keep(b)), C: JSON.parse(keep(c)) })
    // the fight goes on: whoever is up ends their turn from their own screen, and the fight's screen moves on
    const auth = b.auth ? B : C, mir = b.auth ? C : B
    const turnOf = await auth.evaluate(() => { const a = activeActor(); return { id: a.id, drv: owDriver(a), me: OW.key } })
    const presser = turnOf.drv === turnOf.me ? auth : mir
    await wait(1500)
    const pressed = await presser.evaluate(() => { const b = [...$("cbtMenu").querySelectorAll("button")].find(b => /End turn/.test(b.textContent)); if ($("cbtMenu").hidden || !b) return false; b.click(); return true })
    let moved = false; for (let i = 0; i < 12 && !moved; i++) { await wait(1000); moved = (await snap(auth)).active !== b.active }
    check("close: the hero whose turn it was still has their command list, and their End turn moves the fight on", pressed && moved, { turnOf: turnOf.id, pressedOn: presser.name, pressed })
    await wait(6000)
    const a2 = await snap(auth), m2 = await snap(mir)
    check("close: the two screens left are still one fight after more turns", core(a2) === core(m2) && a2.auth && m2.mirror, core(a2) === core(m2) ? { round: a2.round, active: a2.active } : { a2, m2 })
    const end = await finish(auth, [mir])
    check("close: the fight can be finished and ends on every screen", end.every((e) => e.mode !== "combat" && e.mode === end[0].mode && !e.fight && !e.mirror && !e.auth) && end[0].bodies === end[1].bodies && end[0].bodies >= 2 && !!fights[0].ended_at, end)
    await closeAll(B, C)
  },
  async reload() {
    seatedNow = [FIFI, KENTA]
    const A = await screen(FIFI, "A"), B = await screen(KENTA, "B"); await wait(4000)
    await startFight(A); await wait(7000)
    const up = await untilHeroTurn(A, "freia"), before = up && await markAndSync(A, [B])
    check("reload: two screens, one fight, a hero's turn", !!before && before.auth, before ? { fid: before.fid, active: before.active } : await Promise.all([A, B].map(snap)))
    if (!before) return closeAll(A, B)
    const t0 = Date.now(); A.reload().catch(() => {})
    const w = await watchHandover([B], 40)
    await ready(A).catch(() => {})
    let a = null; for (let i = 0; i < 40; i++) { a = await snap(A); if (a.mode === "combat" && a.fid === before.fid && core(a) === core(await snap(B))) break; await wait(1000) }
    const b = await snap(B); await shot(A, "reload-A-back"); await shot(B, "reload-B-after")
    check("reload: the other screen never leaves combat and carries the fight on", w.authAt != null && w.authAt < 25000 && b.auth && [...w.modes].join() === "combat", { handedAfterMs: w.authAt, modes: [...w.modes] })
    check("reload: the reloaded screen comes back INTO the same fight", a.mode === "combat" && a.fid === before.fid && (a.mirror || a.auth), { mode: a.mode, fid: a.fid, mirror: a.mirror, auth: a.auth, afterMs: Date.now() - t0 })
    check("reload: exactly one authority, one fight", [a, b].filter((s) => s.auth).length === 1 && fights.length === 1, { A: a.auth, B: b.auth, fights: fights.length })
    const keep = (s) => JSON.stringify({ order: s.order, hp: s.hp, conds: s.conds, init: s.init, foes: s.foes, round: s.round, idx: s.idx, active: s.active })
    check("reload: both screens hold the fight as it stood (hit points, conditions, order, round, turn)", keep(b) === keep(before) && keep(a) === keep(before), keep(b) === keep(before) && keep(a) === keep(before) ? { round: b.round, active: b.active, hp: b.hp } : { before: JSON.parse(keep(before)), A: a, B: JSON.parse(keep(b)) })
    const end = await finish(B, [A])
    check("reload: the fight can be finished and ends on both", end.every((e) => e.mode !== "combat" && e.mode === end[0].mode && !e.fight && !e.mirror && !e.auth) && end[0].bodies === end[1].bodies && end[0].bodies >= 2, end)
    await closeAll(A, B)
  },
  async solo() {
    seatedNow = [FIFI]
    const A = await screen(FIFI, "A"); await wait(3000)
    await startFight(A); await wait(7000)
    const up = await untilHeroTurn(A), before = up && await markAndSync(A, [])
    check("solo: one screen, its own fight, the hero's turn", !!before && before.auth, before ? { fid: before.fid, active: before.active } : await snap(A))
    if (!before) return closeAll(A)
    await wait(3500)                                   // the full tick that carries the marked state
    A.reload().catch(() => {}); await wait(1500); await ready(A).catch(() => {})
    let a = null; for (let i = 0; i < 45; i++) { a = await snap(A); if (a.auth) break; await wait(1000) }
    await wait(2500); a = await snap(A); await shot(A, "solo-A-back")
    const keep = (s) => JSON.stringify({ order: s.order, hp: s.hp, conds: s.conds, init: s.init, foes: s.foes, round: s.round, idx: s.idx, active: s.active })
    check("solo: the reloaded screen picks its own fight back up (same fight, running it again)", a.mode === "combat" && a.auth && a.fid === before.fid && fights.length === 1, { mode: a.mode, auth: a.auth, fid: a.fid, fights: fights.length })
    check("solo: as it stood (hit points, conditions, order, round, turn)", keep(a) === keep(before), keep(a) === keep(before) ? { round: a.round, active: a.active, hp: a.hp } : { before: JSON.parse(keep(before)), a })
    const menu = await A.evaluate(() => !$("cbtMenu").hidden && [...$("cbtMenu").querySelectorAll("button")].length)
    check("solo: the hero has the command list again", menu > 3, { rows: menu })
    const end = await finish(A, [])
    check("solo: and the fight can be finished", end[0].mode !== "combat" && !end[0].fight && end[0].bodies >= 2, end)
    await closeAll(A)
  },
  async away() {
    seatedNow = [FIFI, KENTA]
    const A = await screen(FIFI, "A"), B = await screen(KENTA, "B"); await wait(4000)
    await startFight(A); await wait(7000)
    const up = await untilHeroTurn(A, "freia"), before = up && await markAndSync(A, [B])
    check("away: two screens, one fight", !!before && before.auth, before ? { fid: before.fid } : await Promise.all([A, B].map(snap)))
    if (!before) return closeAll(A, B)
    await A.context().setOffline(true)
    const w = await watchHandover([B], 40)
    check("away: the screen running the fight drops off the network; the other carries it on", w.authAt != null && (await snap(B)).auth, { handedAfterMs: w.authAt })
    await A.context().setOffline(false)
    let a = null; for (let i = 0; i < 30; i++) { a = await snap(A); if (a.mirror && core(a) === core(await snap(B))) break; await wait(1000) }
    const b = await snap(B)
    check("away: back on the network, it shows the fight instead of running a second copy", a.mirror && !a.auth && a.mode === "combat" && a.fid === before.fid && b.auth && fights[0].auth === KENTA, { A: { mode: a.mode, auth: a.auth, mirror: a.mirror }, B: { auth: b.auth } })
    check("away: and the two agree (hit points, order, round, turn)", core(a) === core(b), core(a) === core(b) ? { round: b.round, active: b.active, hp: b.hp } : { a, b })
    const end = await finish(B, [A])
    check("away: the fight ends on both", end.every((e) => e.mode !== "combat" && e.mode === end[0].mode && !e.fight && !e.mirror && !e.auth), end)
    await closeAll(A, B)
  },
  async paused() {
    seatedNow = [FIFI, KENTA]
    const A = await screen(FIFI, "A"), B = await screen(KENTA, "B"); await wait(4000)
    await startFight(A); await wait(7000)
    const up = await untilHeroTurn(A, "freia"), before = up && await markAndSync(A, [B])
    check("paused: two screens, one fight", !!before && before.auth, before ? { fid: before.fid } : await Promise.all([A, B].map(snap)))
    if (!before) return closeAll(A, B)
    await A.evaluate(() => setTimeStopped(true))
    let noticed = false, took = false
    for (let i = 0; i < 16; i++) { await wait(1000); const b = await snap(B); if (b.notice) noticed = true; if (b.auth) took = true }
    const a = await snap(A), b = await snap(B)
    check("paused: time stopped on the screen running the fight is not silence: no notice, no hand-over", !noticed && !took && a.auth && b.mirror && fights[0].auth === FIFI && !fightLog.some((e) => e.take), { noticed, took, takes: fightLog.filter((e) => e.take).length })
    await A.evaluate(() => setTimeStopped(false))
    await closeAll(A, B)
  },
  async lost() {
    seatedNow = [FIFI, KENTA]
    const A = await screen(FIFI, "A"), B = await screen(KENTA, "B"); await wait(4000)
    await startFight(A); await wait(7000)
    const up = await untilHeroTurn(A, "freia"), before = up && await markAndSync(A, [B])
    check("lost: two screens, one fight", !!before && before.auth, before ? { fid: before.fid } : await Promise.all([A, B].map(snap)))
    if (!before) return closeAll(A, B)
    // the one screen left cannot carry it (its asks to take the fight come to nothing)
    await B.evaluate(() => { const was = fightPost; fightPost = (op, x) => op === "take" ? Promise.resolve({ auth: false }) : was(op, x) })
    await A.context().close(); const t0 = Date.now()
    let b = null, sawCombatWithNotice = false
    for (let i = 0; i < 55; i++) { b = await snap(B); if (b.mode === "combat" && b.notice) sawCombatWithNotice = true; if (b.mode !== "combat") break; await wait(1000) }
    const lines = await B.evaluate(() => (log.recent || []).slice(-4)); await shot(B, "lost-B-after")
    check("lost: no screen can carry it: the fight is ended, not left frozen", b.mode !== "combat" && !b.mirror && !b.fid && !!fights[0].ended_at && Date.now() - t0 < 50000, { mode: b.mode, afterMs: Date.now() - t0, serverEnded: !!fights[0].ended_at })
    check("lost: the screen said what was happening, and the log says why it ended", sawCombatWithNotice && lines.some((l) => /no other screen could carry it on/.test(l)), lines.map((l) => String(l).replace(/<[^>]+>/g, "").slice(0, 110)))
    await closeAll(B)
  },
  async missing() {
    seatedNow = [FIFI]; missing = true
    const A = await screen(FIFI, "A"); await wait(21000)
    const n = reqs.filter((r) => r.s === "A").length, failed = await A.evaluate(() => FIGHT.failed)
    check("missing: with the tables not there (PGRST205) the page stops asking after the first answer", n >= 1 && n <= 2 && failed, { requestsIn21s: n, failed })
    await startFight(A); await wait(6000)
    const s = await snap(A), n2 = reqs.filter((r) => r.s === "A").length
    check("missing: and a fight still runs on its own screen, as before", s.mode === "combat" && !s.auth && !s.mirror && n2 === n, { mode: s.mode, requests: n2 })
    await closeAll(A)
  },
}
for (const [name, run] of Object.entries(SCEN)) {
  if (ONLY && !ONLY.includes(name)) continue
  reset()
  try { await run() } catch (e) { check(`${name}: the scenario ran to its end`, false, String((e && e.stack) || e).slice(0, 500)) }
}
console.log(`\n${passes} passed, ${fails} failed`)
await browser.close(); server.close(); process.exit(fails ? 1 : 0)
