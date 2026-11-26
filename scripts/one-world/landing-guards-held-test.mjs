// THE LANDING'S GUARDS ARE HELD IN THE WORLD — the two-screen test (Sam, 2026-11-22, the pen door rules: "Crossing into
// the next plate will auto populate the correct number of guards that should be there. Refreshing shouldn't change that.
// If you kill everyone, refreshing doesn't create guards or cause them to disappear.")
//   PART=1 (default)  the landing: the watch at the pen's posts is the watch on the landing (same number); a refresh in
//                     the middle of the fight keeps the same guards and their wounds; won, the bodies lie where they
//                     fell on BOTH screens, once each, and are still there (same places, same loot keys) after either
//                     screen refreshes, twice, and after the party walks back into the pen and out again; no guard is
//                     ever added.
//   PART=2            the alarm: a wave that has walked in is written in the world, so a refresh does not bring it in
//                     again (before: it did, as a new fight); a clock that ran on with the game closed brings ONE wave,
//                     not all of them at once (before: 2 + 3 + 4 = 9 drow together); the beaten wave's bodies stay.
//   npm i --no-save playwright && npx playwright install chromium     (once)
//   node scripts/one-world/landing-guards-held-test.mjs     (first two heroes seated in the live run; STAGE_JSON=<file> offline)
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { chromium } from "playwright"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const ctx = {}; runInNewContext(readFileSync(join(ROOT, "js/aop-one-world.js"), "utf8") + "\nthis.W = AopOneWorld;", ctx)
const OWL = ctx.W
const STAGE = process.env.STAGE_JSON ? JSON.parse(readFileSync(process.env.STAGE_JSON, "utf8")) : await fetch("https://ashes.playacartagena.com/api/map-stage").then((r) => r.json())
if (!STAGE.seated || STAGE.seated.length < 2) { console.log("two heroes must be seated in the live run; or pass STAGE_JSON"); process.exit(2) }
const SEATED = STAGE.seated.slice(0, 2), [ONE, TWO] = SEATED.map((s) => s.id)
const SEATNO = { [ONE]: 1, [TWO]: 2 }
let world = { campaign_run_id: "00000000-0000-0000-0000-000000000014", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
const log = []
const fights = [], msgs = [], fightLog = []; let fightSeq = 0, msgSeq = 0, bytes = 0
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
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname
  let body = ""; for await (const c of req) body += c
  const j = body ? (() => { try { return JSON.parse(body) } catch { return {} } })() : {}
  const send = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
  if (p === "/api/verify-claim") return send({ valid: true, character: SEATED.find((s) => s.id === j.characterId) })
  if (p === "/api/map-stage") return send({ run: 14, seated: SEATED, present: [], gone: [], npcLanguages: {} })
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
    if (req.method === "GET") {
      const id = url.searchParams.get("fight")
      if (!id) { const f = fights.find(f => !f.ended_at && Date.now() - f.seen < 60000); return send({ fight: f ? pub(f) : null, now: Date.now() }) }
      const f = fights.find(f => f.id === id); const since = +url.searchParams.get("since") || 0; const kind = url.searchParams.get("kind") === "in" ? ["in"] : ["tick", "end"]
      return send({ fight: f ? pub(f) : null, msgs: msgs.filter(m => m.fight === id && m.id > since && kind.includes(m.kind)).slice(0, 200).map(m => ({ id: m.id, kind: m.kind, by_key: m.by, body: m.body })), now: Date.now() })
    }
    const who = j.characterId || "dm"
    if (j.op === "open") {
      const live = fights.find(f => !f.ended_at)
      if (live && Date.now() - live.seen < 60000) return send({ auth: live.auth === who, fight: pub(live) })
      if (live) live.ended_at = new Date().toISOString()
      const f = { id: "f" + (++fightSeq), plate: String(j.plate), auth: who, seen: Date.now(), ended_at: null }; fights.push(f); fightLog.push({ open: f.id, by: who })
      return send({ auth: true, fight: pub(f) })
    }
    const f = fights.find(f => f.id === j.fight)
    if (!f || f.ended_at) return send({ error: "no such live fight", ended: true }, 409)
    // A FIGHT OUTLIVES A REFRESH: the claim and the release, as /api/walk-fight does them (CLAIM_QUIET_MS 8 s)
    const lastIn = () => Math.max(0, ...msgs.filter((m) => m.fight === f.id && m.kind === "in").map((m) => m.id))
    if (j.op === "release"){ if (f.auth === who){ f.seen = Date.now() - 9000; fightLog.push({ release: f.id, by: who }) } return send({ ok: true, released: f.auth === who }) }
    if (j.op === "claim"){
      if (f.auth === who) return send({ auth: true, fight: pub(f), lastIn: lastIn() })
      if (Date.now() - f.seen < 8000) return send({ auth: false, fight: pub(f) })
      f.auth = who; f.seen = Date.now(); fightLog.push({ claim: f.id, by: who }); return send({ auth: true, fight: pub(f), lastIn: lastIn() })
    }
    if (j.op !== "in" && f.auth !== who) return send({ error: "not yours" }, 403)
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
await new Promise((r) => server.listen(4133, r))



const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4133/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const check = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
const PART = process.env.PART || "1", LAND = "battle-pen-gate"
const press = (pg, label) => pg.evaluate((label) => { const b = [...$("objBtns").querySelectorAll("button")].find(x => x.textContent.trim().startsWith(label)); if (b) b.click(); return !!b }, label)
const snap = (pg) => pg.evaluate(() => ({ cur: String(cur), mode, auth: FIGHT.auth, mirror: FIGHT.mirror,
  foes: foes.map(f => [f.id, f.c ? f.c.hp : null]),
  living: npcs.filter(n => /^drow/.test(n.id) && !n.body && !n.down && !n.offStage).map(n => n.id),
  bodies: npcs.filter(n => n.body && /^drow/.test(n.id)).map(n => [n.id, Math.round(n.x), Math.round(n.y), n.lootKey]).sort((a, b) => a[1] - b[1] || a[2] - b[2]),
  battle: (state.battle && state.battle.foes) || [], dead: (state.dead && state.dead[String(cur)]) || [], waves: state.alarm ? (state.alarm.waves || 0) : null, banner: (document.getElementById("alarmBanner") || {}).textContent || "" }))
const ready = (pg) => pg.waitForFunction(() => typeof mode !== "undefined" && mode !== "load" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
const reload = async (pg, ms = 12000) => { await pg.reload(); await ready(pg); await wait(ms) }
const authOf = async (...pgs) => { for (const pg of pgs) if (await pg.evaluate(() => FIGHT.auth && mode === "combat")) return pg; return null }
const win = async (...pgs) => { const pg = await authOf(...pgs); if (!pg) return false; await pg.evaluate(() => { for (const f of foes){ if (f.c) f.c.hp = 0; f.down = true } endCombat(true) }); return true }
const near = (a, b) => a.length === b.length && a.every((x, i) => x[0] === b[i][0] && Math.hypot(x[1] - b[i][1], x[2] - b[i][2]) < 40)
const opens = () => fightLog.filter((e) => e.open).length

const A = await screen(ONE, "A"), B = await screen(TWO, "B")
await wait(5000)

if (PART === "1") {
  const s0 = await snap(A), N = s0.living.filter(id => /^drow-guard/.test(id)).length
  check("the pen starts with its gate watch at the posts", s0.cur === "11" && N >= 1, { watch: s0.living })
  await A.evaluate(() => { state.penKey = true; breakoutBy = "key"; unlockGate() }); await wait(2500)
  // held still for the test: a guard may run for help or be cut down in the seconds this takes, which is the game and not the refresh
  const hold = async () => { const pg = await authOf(A, B); if (pg) await pg.evaluate(() => { for (const f of foes) if (f.c){ f.c.conds.add("paralyzed"); f.task = null } }) }
  await press(A, "Open it"); await wait(4500); await press(A, "Flee, with the party")
  await A.waitForFunction(() => mode === "combat" && String(cur) === "battle-pen-gate" && foes.length > 0, null, { timeout: 30000 }); await hold(); await wait(6000)
  let a = await snap(A), b = await snap(B)
  const ids = (l) => l.map(f => f[0]).sort().join()
  check("crossing: the landing's fight is opened with exactly the watch that stood at the posts", a.cur === LAND && a.mode === "combat" && a.battle.slice().sort().join() === s0.living.filter(id => /^drow-guard/.test(id)).sort().join(), { watch: s0.living, battle: a.battle })
  check("crossing: they are all in it, on the screen that runs it", a.foes.length === N, { N, foes: a.foes })
  check("crossing: the other screen is on the landing with the same guards", b.cur === LAND && b.mode === "combat" && ids(b.foes) === ids(a.foes), { foes: b.foes, mode: b.mode, cur: b.cur })
  // wound one, so a reset would show
  const au = await authOf(A, B)
  await au.evaluate(() => { const f = foes[0]; f.c.hp = Math.max(1, f.c.hp - 5) }); await wait(3000)
  const hurt = (await snap(au)).foes
  await reload(A, 16000); await hold(); await wait(3000)
  a = await snap(A); b = await snap(B)
  check("a refresh in the middle of the fight: the same guards, nobody added, nobody gone", a.cur === LAND && a.mode === "combat" && ids(a.foes) === ids(hurt) && ids(b.foes) === ids(hurt), { before: hurt, a: a.foes, b: b.foes })
  check("...and the fight is still being run by one screen", !!(await authOf(A, B)) && opens() === 1, { opens: opens() })
  check("...with the wound it had (hit points never go back up)", a.foes.length === hurt.length && a.foes.every((f) => f[1] <= (hurt.find(h => h[0] === f[0]) || [0, 0])[1]), { before: hurt, after: a.foes })
  check("the fight is won", await win(A, B)); await wait(8000)
  a = await snap(A); b = await snap(B)
  check("won: the dead lie on the landing on the screen that ran it", a.mode !== "combat" && a.bodies.length === N && a.living.length === 0, { bodies: a.bodies, living: a.living })
  check("won: and on the screen that showed it, once each (not doubled)", b.mode !== "combat" && b.bodies.length === N && near(a.bodies, b.bodies), { bodies: b.bodies })
  check("won: they are written in the world's state, on both screens", a.dead.length === N && b.dead.length === N, { a: a.dead, b: b.dead })
  const fell = a.bodies
  await reload(A)
  a = await snap(A)
  check("refresh after the win: the bodies are still there, in the same places", a.cur === LAND && near(a.bodies, fell), { now: a.bodies, fell })
  check("refresh after the win: with the same loot keys (searching them is unchanged)", a.bodies.every((x, i) => x[3] === fell[i][3]), { now: a.bodies.map(x => x[3]), fell: fell.map(x => x[3]) })
  check("refresh after the win: no guard was created, and no fight began", a.living.length === 0 && a.mode !== "combat" && opens() === 1, { living: a.living, mode: a.mode, opens: opens() })
  await reload(A)
  a = await snap(A)
  check("a second refresh: the same again", near(a.bodies, fell) && a.living.length === 0 && a.mode !== "combat", { bodies: a.bodies, living: a.living })
  await reload(B)
  b = await snap(B)
  check("the other screen refreshes: the same bodies, nobody new", b.cur === LAND && near(b.bodies, fell) && b.living.length === 0 && b.mode !== "combat", { bodies: b.bodies, living: b.living })
  // back into the pen, a refresh there, and out again
  await A.evaluate(() => enterNode(PEN, { from: "battle-pen-gate" })); await wait(6000)
  a = await snap(A)
  check("back in the pen: the gate watch is not at its posts (they are dead on the landing)", a.cur === "11" && a.living.filter(id => /^drow-guard/.test(id)).length === 0, { living: a.living })
  await reload(A)
  a = await snap(A)
  check("a refresh in the pen: still no watch at the posts", a.cur === "11" && a.living.filter(id => /^drow-guard/.test(id)).length === 0 && a.mode !== "combat", { living: a.living, mode: a.mode })
  await A.evaluate(() => enterNode("battle-pen-gate", { from: PEN })); await wait(6000)
  a = await snap(A)
  check("out onto the landing again: the same bodies, nobody new, no fight", a.cur === LAND && near(a.bodies, fell) && a.living.length === 0 && a.mode !== "combat" && opens() === 1, { bodies: a.bodies, living: a.living, opens: opens() })
}

if (PART === "2") {
  // the gate watch out of it: this part is the alarm's waves alone
  for (const pg of [A, B]) await pg.evaluate(() => { for (const n of [...npcs]) if (/^drow/.test(n.id)){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n) } })
  await A.evaluate(() => { state.gateWatchDown = { rot: 99, at: Date.now() }; state.alarm = { plate: "11", at: owNow() - 305000, by: "test", name: "warning horn" } }); await wait(10000)
  let a = await snap(A), b = await snap(B)
  check("wave 1 walks in: two drow, one fight, on both screens", a.mode === "combat" && b.mode === "combat" && a.foes.length === 2 && b.foes.length === 2 && opens() === 1, { a: a.foes, b: b.foes, opens: opens() })
  check("wave 1 is written in the world (both screens read it)", a.waves === 1 && b.waves === 1, { a: a.waves, b: b.waves })
  check("wave 1 is beaten", await win(A, B)); await wait(8000)
  a = await snap(A); b = await snap(B)
  check("the beaten wave lies on the pen, once each, on both screens", a.bodies.length === 2 && b.bodies.length === 2 && a.dead.length === 2, { a: a.bodies, b: b.bodies })
  check("...under the same loot keys on both screens (a body is searched once, whoever searches it)", a.bodies.map(x => x[3]).sort().join() === b.bodies.map(x => x[3]).sort().join(), { a: a.bodies.map(x => x[3]), b: b.bodies.map(x => x[3]) })
  const fell = a.bodies
  await reload(A, 14000)
  a = await snap(A); b = await snap(B)
  check("a refresh does NOT bring wave 1 in again (before: it did, as a new fight)", a.mode !== "combat" && b.mode !== "combat" && opens() === 1 && a.living.length === 0, { mode: a.mode, opens: opens(), living: a.living })
  check("...and the beaten wave's bodies are still there", near(a.bodies, fell), { now: a.bodies, fell })
  check("...and the banner counts down to wave 2, not wave 1", /wave 2 of 3/.test(a.banner), a.banner)
  // the clock ran on with the game closed: twenty-five minutes since the horn, one wave come so far
  await A.evaluate(() => { state.alarm = { ...state.alarm, at: owNow() - 1500000, waves: 1, last: owNow() - 1200000 } }); await wait(10000)
  a = await snap(A); b = await snap(B)
  check("the clock ran on: ONE wave comes (wave 2: three drow), not two waves together (seven)", a.mode === "combat" && a.foes.length === 3 && b.foes.length === 3 && a.waves === 2, { a: a.foes, waves: a.waves })
  check("wave 2 is beaten", await win(A, B)); await wait(9000)
  a = await snap(A)
  check("wave 3 does not follow at once: it is five minutes after wave 2 came", a.mode !== "combat" && a.waves === 2 && /wave 3 of 3 in 4:/.test(a.banner), { mode: a.mode, banner: a.banner })
  await reload(A, 12000)
  a = await snap(A)
  check("a refresh then: still no new wave, and five bodies on the pen", a.mode !== "combat" && a.waves === 2 && a.bodies.length === 5 && opens() === 2, { mode: a.mode, bodies: a.bodies.length, opens: opens() })
}

console.log(fails ? `\n${fails} FAILED` : "\nall passed")
await browser.close(); server.close()
process.exit(fails ? 1 : 0)
