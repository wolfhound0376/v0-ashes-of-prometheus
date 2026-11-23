// THE ESCORT HOLDS THE PEN — the two-screen test (Sam, 2026-11-22, the pen door rules: "When guards or people are
// escorted out the door automatically closes. When guards are coming in everyone is frozen and only people being
// escorted, automatically disappear through the door or appear from the door.")
// The case from his playtest of 2026-11-22: a prisoner had unlocked the gate when the work detail was called; the party
// came back from the kitchen to a pen whose gate still let them walk out onto the landing.
//   1. the gate unlocked by a prisoner (shut); the work detail is called; while the escort is in, nobody walks (heroes,
//      prisoners), on both screens;
//   2. the detail is marched out: the gate is shut AND locked behind them (in the world's state);
//   3. the detail comes home: they appear in the doorway and walk in, the gate locked; the doorway takes nobody out;
//      after a moment they walk freely again;
//   4. another crew taken (prisoners only, the heroes stay): held while the escort is in, the crew walks out through
//      the door, the door locked behind them even though a prisoner had unlocked it again.
//   npm i --no-save playwright && npx playwright install chromium     (once)
//   node scripts/one-world/escort-holds-pen-test.mjs     (Fifi and Kenta seated in the live run; STAGE_JSON=<file> offline)
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
let D = null; const laborLog = []
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
  // THE WORK DETAIL, as /api/labor answers it (lib/labor.ts): one detail for the run, moved on by the table's posts
  if (p === "/api/surgeon") return send({ error: "not in this test" }, 409)   // the gate's own warning scene is not this test's
  if (p === "/api/labor") {
    if (req.method === "GET") return send({ detail: D, due: false, crewsNow: [], day: 1, shift: 1 })
    const who = j.characterId || "dm"
    if (!D || j.id !== D.id) return send({ error: "no such detail" }, 404)
    laborLog.push({ action: j.action, by: who, status: D.status })
    if (j.action === "choice") { D.events.push({ kind: "choice", slug: j.slug, choice: j.choice, at: new Date().toISOString() }); return send({ detail: D }) }
    if (j.action === "march") { if (D.status !== "called") return send({ detail: D, error: "already marched" }, 409); D.status = "escorting"; D.marchedBy = who; return send({ detail: D }) }
    if (j.action === "arrive") { if (D.status === "escorting") D.status = "working"; return send({ detail: D }) }
    if (j.action === "return") { if (D.status !== "working") return send({ detail: D }, 409); D.status = "returning"; return send({ detail: D }) }
    if (j.action === "done") { D.status = "done"; return send({ detail: D }) }
    return send({ detail: D })
  }
  if (p.startsWith("/api/")) return send({})
  let f = join(ROOT, p === "/" ? "velkynvelve-walk/index.html" : p)
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html")
  if (!existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f))
})
await new Promise((r) => server.listen(4134, r))


const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off"); localStorage.setItem("aop_settings_v1", JSON.stringify({cinematics: false})) }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)); if (/one-fight/.test(m.text())) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4134/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
let fails = 0
const check = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
const press = (pg, label) => pg.evaluate((label) => { const b = [...$("objBtns").querySelectorAll("button")].find(x => x.textContent.trim().startsWith(label)); if (b) b.click(); return !!b }, label)
const look = (pg) => pg.evaluate(() => ({ cur: String(cur), mode, held: escortHolds(), unlocked: !!state.gateOpen, shut: !!state.doorShut, leaf: door.target, open: doorOpenNow(), passable: gatePassable(),
  me: (() => { const h = ownLeader(); return h ? { id: h.id, x: Math.round(h.x), y: Math.round(h.y), path: h.path.length, alpha: +h.alpha.toFixed(2), out: outsidePen(h) } : null })(), escort: laborEscort().filter(a => !a.offStage).length }))
await wait(4000)
const crew = [{ kind: "pc", id: FIFI, name: "Fifi" }, { kind: "pc", id: KENTA, name: "Kenta" }]
D = { id: "det-1", task: "kitchen", status: "scheduled", crew, escort: [{ bestiary: "drow" }, { bestiary: "quaggoth" }], events: [], party: true }
// the gate watch off the posts: this test is the escort, not the volleys
await Promise.all([A, B].map(pg => pg.evaluate(() => { guardsAlarm = null; for (const n of [...npcs]) if (n.hostile && /^drow/.test(n.id)){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n) } })))

// 1. unlocked by a prisoner, then the call
await A.evaluate(() => { state.penKey = true; breakoutBy = "key"; unlockGate() }); await wait(2500)
await Promise.all([A, B].map(pg => pg.evaluate(() => { if (!$("obj").hidden){ $("obj").hidden = true; mode = "explore" } })))
let a = await look(A), b = await look(B)
check("a prisoner unlocked the gate: unlocked and shut, on both screens", a.unlocked && a.shut && b.unlocked && b.shut, { a, b })
D.status = "called"
// each screen hears of the call on its own poll (every 6 s), as at the table: wait for both
for (const pg of [A, B]) await pg.waitForFunction(() => laborEscort().length > 0 && escortHolds(), null, { timeout: 30000 }).catch(() => {})
await wait(2000)
a = await look(A); b = await look(B)
check("the call: the escort is in the pen and the pen is held, on both screens", a.held && b.held && a.escort > 0 && b.escort > 0, { a, b })
// try to walk: to the gate, by the walk the player's click makes, and by a path laid straight onto the doorway
const before = a.me
await A.evaluate(() => { const g = gateCenter(); walkTo(nearestWalkable(g.x, g.y + 40)); const h = ownLeader(); h.path = [{ x: balcony().threshold[0], y: balcony().threshold[1] }] }); await wait(1500)
a = await look(A)
check("held: the hero does not move, toward the gate or anywhere", Math.hypot(a.me.x - before.x, a.me.y - before.y) < 6 && a.me.path === 0 && a.cur === "11", { before, now: a.me })
const pris = await A.evaluate(() => { const n = npcs.find(n => PEN_NPCS.some(d => d.id === n.id) && !n.offStage && !n.company && actors.includes(n)); if (!n) return null; const was = { id: n.id, x: n.x, y: n.y }; n.path = [{ x: n.x + 200, y: n.y }]; return was })
await wait(1200)
const pnow = pris && await A.evaluate((id) => { const n = npcs.find(n => n.id === id); return { x: n.x, y: n.y, path: n.path.length } }, pris.id)
check("held: the prisoners stand still too", !!pris && Math.hypot(pnow.x - pris.x, pnow.y - pris.y) < 6 && pnow.path === 0, { pris, pnow })

// 2. the card, the march out, the door locked behind them
for (let i = 0; i < 40; i++) { await press(A, "Go quietly"); await press(B, "Go quietly"); if (D.status !== "called") break; await wait(1000) }
await A.waitForFunction(() => String(cur) === "3k", null, { timeout: 40000 }).catch(() => {})
await B.waitForFunction(() => String(cur) === "3k", null, { timeout: 20000 }).catch(() => {})
await wait(3000)
a = await look(A); b = await look(B)
check("the detail is marched out to the kitchen, both heroes", a.cur === "3k" && b.cur === "3k", { a: a.cur, b: b.cur, status: D.status })
check("the gate is shut AND locked behind them (the world's state, both screens)", !a.unlocked && !a.shut && !b.unlocked && !b.shut && !world.state.gateOpen, { a, b, world: { gateOpen: world.state.gateOpen, doorShut: world.state.doorShut } })

// 3. home: they appear in the doorway and walk in, the gate locked; the doorway takes nobody out
const driver = (await A.evaluate(() => laborDriving)) ? A : B
await driver.evaluate(() => laborFinish({ urgent: true }))
await A.waitForFunction(() => String(cur) === "11" && escortHolds(), null, { timeout: 30000 }).catch(() => {})
await wait(400)
const entering = await A.evaluate(() => { const h = ownLeader(), T = balcony().threshold; return { escorted: !!h.escorted, fromDoor: Math.hypot(h.x - T[0], h.y - T[1]) < 260, alpha: h.alpha } })
check("home: the hero appears in the doorway (fading in, walking in)", entering.escorted && entering.fromDoor, entering)
await wait(4000)
await B.waitForFunction(() => String(cur) === "11" && !escortHolds() && door.target === 0, null, { timeout: 20000 }).catch(() => {})
await A.waitForFunction(() => !escortHolds() && door.target === 0, null, { timeout: 10000 }).catch(() => {})
a = await look(A); b = await look(B)
await wait(1500)
const spots = await A.evaluate(() => party.filter(p => actors.includes(p)).map(p => [p.id, Math.round(p.x), Math.round(p.y)]))
check("home: each hero on a spot of their own (not stood on one another)", spots.length === 2 && Math.hypot(spots[0][1] - spots[1][1], spots[0][2] - spots[1][2]) > 30, spots)
check("home: both heroes are inside the pen, not out on the landing", a.cur === "11" && b.cur === "11" && !a.me.out && !b.me.out && a.me.alpha === 1, { a: a.me, b: b.me })
check("home: the gate is locked (not merely shut) on both screens, and the door drawn shut", !a.unlocked && !b.unlocked && !a.open && !a.passable && a.leaf === 0 && b.leaf === 0, { a, b })
check("home: the hold is over, nobody is held", !a.held && !b.held, { a: a.held, b: b.held })
await A.evaluate(() => { const T = balcony().threshold, h = ownLeader(); h.path = [{ x: T[0], y: T[1] }] }); await wait(3500)
a = await look(A)
check("the doorway takes nobody out: the hero is still in the pen", a.cur === "11" && !a.me.out, a.me)
const free = await A.evaluate(() => { const h = ownLeader(), was = { x: h.x, y: h.y }; walkTo(nearestWalkable(h.x + 160, h.y + 40)); return was })
await wait(2000)
a = await look(A)
check("and the hero walks freely again", Math.hypot(a.me.x - free.x, a.me.y - free.y) > 20, { free, now: a.me })

// 4. another crew: prisoners only; the heroes stay and are held; the crew goes out by the door; locked behind them
await A.evaluate(() => { state.penKey = true; breakoutBy = "key"; unlockGate() }); await wait(2500)
await Promise.all([A, B].map(pg => pg.evaluate(() => { if (!$("obj").hidden){ $("obj").hidden = true; mode = "explore" } })))
const goingIds = await A.evaluate(() => npcs.filter(n => PEN_NPCS.some(d => d.id === n.id) && !n.offStage && !n.company && !n.body && actors.includes(n)).slice(0, 2).map(n => n.id))
await Promise.all([A, B].map(pg => pg.evaluate((ids) => { crewTakenOut(ids.map(penNpc).filter(Boolean), [{ escort: [{ bestiary: "drow" }, { bestiary: "quaggoth" }] }]) }, goingIds)))
await wait(7000)
a = await look(A); b = await look(B)
check("another crew: the escort comes in and the pen is held on both screens", a.held && b.held, { a: a.held, b: b.held })
await A.waitForFunction(() => !crewMoving, null, { timeout: 40000 }).catch(() => {})
await B.waitForFunction(() => !crewMoving, null, { timeout: 20000 }).catch(() => {})
await wait(1500)
const gone = await A.evaluate((ids) => ids.map(id => { const n = npcs.find(n => n.id === id); return { id, off: !!(n && n.offStage), alpha: n ? +n.alpha.toFixed(2) : null } }), goingIds)
a = await look(A); b = await look(B)
check("the crew went out of the pen (through the door)", goingIds.length > 0 && gone.every(g => g.off), gone)
check("and the gate is locked behind them though a prisoner had unlocked it", !a.unlocked && !b.unlocked && !world.state.gateOpen && a.leaf === 0, { a, b })
check("the hold is over", !a.held && !b.held)

console.log(fails ? `\n${fails} FAILED` : "\nall passed")
await browser.close(); server.close()
process.exit(fails ? 1 : 0)
