// THE WARNINGS COME THROUGH THE DOOR — the two-screen test (Sam, 2026-11-22, the pen door rules: "Staying close to the
// gate will still trigger warnings and you'll just get the cinematic and arrow will eventually just begin shooting
// through the door to whomever. We don't need to pan to the guards.")
//   1. a hero at the bars of the shut gate, the watch posted: the warning card, the warning film ("guard-volley", the
//      catalogue's own warning-bolt moment), a warning bolt that misses, loosed from the doorway; no camera move;
//   2. "Stay where you are": the bolts that follow all come in through the doorway, still no camera move, and the film
//      is not played again for them;
//   npm i --no-save playwright && npx playwright install chromium     (once)
//   node scripts/one-world/gate-warnings-test.mjs     (Fifi and Kenta seated in the live run; STAGE_JSON=<file> offline)
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
const STAGE = process.env.STAGE_JSON ? JSON.parse(readFileSync(process.env.STAGE_JSON, "utf8")) : await fetch("https://ashes.playacartagena.com/api/map-stage").then((r) => r.json())
const SEATED = STAGE.seated.filter((s) => s.id === FIFI || s.id === KENTA)
if (SEATED.length < 2) { console.log("Fifi and Kenta must both be seated in the live run for the sheets; or pass STAGE_JSON"); process.exit(2) }
const SEATNO = { [FIFI]: 1, [KENTA]: 2 }
let world = { campaign_run_id: "00000000-0000-0000-0000-000000000014", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
const log = []
let SG = null, hpLeft = 30; const surgeonLog = []
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
    if (j.op !== "in" && f.auth !== who) return send({ error: "not yours" }, 403)
    const m = { id: ++msgSeq, fight: f.id, kind: j.op, by: who, body: j.body || {} }; msgs.push(m); bytes += JSON.stringify(m.body).length
    if (j.op === "tick") f.seen = Date.now()
    if (j.op === "end") f.ended_at = new Date().toISOString()
    return send({ ok: true, id: m.id })
  }
  // THE DROW SURGEON's dice, as /api/drow-surgeon answers them (lib/drow-surgeon.mjs): nobody is picked to die here, every bolt hits for 2
  if (p === "/api/drow-surgeon") {
    if (req.method === "GET") return send({ state: SG, elvish: [] })
    surgeonLog.push(j.action)
    if (j.action === "begin" || j.action === "again") { SG = { stage: "shooting", victim: null, target: { id: j.targetId }, volleys: 0 }; return send({ ok: true, state: SG }) }
    if (j.action === "volley") { SG.volleys++; hpLeft = Math.max(1, hpLeft - 2 * (j.guards || 1)); return send({ ok: true, state: SG, volley: { bolts: Array.from({ length: j.guards || 1 }, () => ({ hit: true, dmg: 2 })), down: false }, hp: hpLeft, hpMax: 30 }) }
    return send({ ok: true, state: SG })
  }
  if (p.startsWith("/api/")) return send({})
  let f = join(ROOT, p === "/" ? "velkynvelve-walk/index.html" : p)
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html")
  if (!existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f))
})
await new Promise((r) => server.listen(4135, r))


const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off"); localStorage.setItem("aop_settings_v1", JSON.stringify({cinematics: false})) }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)); if (/one-fight/.test(m.text())) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4135/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
let fails = 0
const check = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
const press = (pg, label) => pg.evaluate((label) => { const b = [...$("objBtns").querySelectorAll("button")].find(x => x.textContent.trim().startsWith(label)); if (b) b.click(); return !!b }, label)
const card = (pg) => pg.evaluate(() => ({ hidden: $("obj").hidden, who: $("objWho").textContent, rows: [...$("objBtns").querySelectorAll("button")].map(b => b.textContent.trim()) }))
await wait(4000)
// watch what the page does: bolts (where they leave from), films asked for, camera moves
await A.evaluate(() => {
  window.__shots = []; window.__films = []; window.__cams = 0
  window.openTalk = openTalk = function () {}             // the prisoners' "a word" openers are not this test's (they took the hero mid-test)
  for (const n of [...npcs]) if (n.id === "jorlan"){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n) }   // Jorlan at the bars speaks first (his own talk, not the warning): not this test's
  const fs = fireShot; window.fireShot = fireShot = function (att, tgt, kind, hit, land, atk) { const r = fs.apply(this, arguments); const s = shots[shots.length - 1]; if (s) __shots.push({ who: att.id, x: Math.round(s.from.x), y: Math.round(s.from.y), hit: !!hit }); return r }
  const mf = mapFilm; window.mapFilm = mapFilm = function (cue) { __films.push(cue); return mf.apply(this, arguments) }
  if (typeof camTo === "function") { const ct = camTo; window.camTo = camTo = function () { __cams++; return ct.apply(this, arguments) } }
})
// the watch at its posts (a guard strolls off now and then: wait for both to be back)
const posts = () => A.waitForFunction(() => gateGuards().length > 0 && !postsEmpty(), null, { timeout: 60000 }).catch(() => {})
await posts()
const muzzle = await A.evaluate(() => { const m = gateMuzzle(); return { x: Math.round(m.x), y: Math.round(m.y) } })
const fromDoor = (s) => Math.hypot(s.x - muzzle.x, s.y - muzzle.y) < 40
const s0 = await A.evaluate(() => ({ guards: gateGuards().map(g => g.id), locked: !state.gateOpen, mode }))
check("the pen: the gate locked, the watch posted", s0.locked && s0.guards.length > 0, s0)

// 1. up to the bars
await A.evaluate(() => { const g = gateCenter(), h = ownLeader(), q = nearestWalkable(g.x, g.y + 70 * (node.scale || 1)); h.x = q.x; h.y = q.y + 60; walkTo(q) })
// (a guard on the bridge has to see them first: his scan is random, so the test lets him look their way)
await A.evaluate(() => { window.__look = setInterval(() => { if (!gateWarn) for (const g of gateGuards()) faceTo(g, ownLeader()) }, 500) })
await A.waitForFunction(() => !$("obj").hidden && /Step back/.test($("objBtns").textContent), null, { timeout: 60000 }).catch(() => {})
await A.evaluate(() => clearInterval(window.__look))
await wait(1500)
let c = await card(A), seen = await A.evaluate(() => ({ films: __films.slice(), shots: __shots.slice(), cams: __cams }))
check("at the bars: the warning card (Step back / Stay where you are)", !c.hidden && c.rows.some(r => /Step back/.test(r)) && c.rows.some(r => /Stay where you are/.test(r)), c)
check("the warning plays its film: guard-volley", seen.films.includes("guard-volley"), seen.films)
check("a warning bolt is loosed, and misses", seen.shots.length >= 1 && seen.shots.every(s => !s.hit), seen.shots)
check("it comes in through the doorway", seen.shots.length >= 1 && seen.shots.every(fromDoor), { muzzle, shots: seen.shots })
check("no camera move", seen.cams === 0, seen.cams)

// 2. not heeded: the bolts through the door
await A.evaluate(() => { __shots.length = 0; __films.length = 0 })
await press(A, "Stay where you are")
await wait(9000)
seen = await A.evaluate(() => ({ films: __films.slice(), shots: __shots.slice(), cams: __cams }))
check("not heeded: the shooting starts (the scene's dice asked for)", surgeonLog.includes("begin") && surgeonLog.includes("volley"), surgeonLog)
check("every bolt comes in through the doorway", seen.shots.length >= 1 && seen.shots.every(fromDoor), { muzzle, shots: seen.shots })
check("and they hit the one who stayed", seen.shots.some(s => s.hit), seen.shots)
check("still no camera move", seen.cams === 0, seen.cams)
check("the film is not played again for the volleys", !seen.films.includes("guard-volley"), seen.films)
// walk away: they stop
await A.evaluate(() => { const h = ownLeader(), q = nearestWalkable(centroid.x, centroid.y); h.path = []; h.x = q.x; h.y = q.y })
await wait(9000)
const after = await A.evaluate(() => ({ surgeon: !!surgeon, mode }))
check("walked away from the gate: they stop", !after.surgeon, after)

console.log(fails ? `\n${fails} FAILED` : "\nall passed")
await browser.close(); server.close()
process.exit(fails ? 1 : 0)
