// A FRIEND'S IRONS — the two-screen test (Sam's playtest, 2026-11-22: "Fifi got out of her manacles but there wasn't a
// good way to get Kenta out"). Fifi out of irons with thieves' tools, Kenta still manacled:
//   1. away from him: no "Pick Kenta's manacles" on her bar; beside him: the row is there (and none for herself);
//   2. a failed pick: Kenta stays in irons, and the row is gone for her (one try on that lock until a long rest);
//   3. a fresh run, a good pick: Kenta is out of irons on both screens, and his own bar no longer offers to pick his;
//   4. without the tools the row is never offered.
//   npm i --no-save playwright && npx playwright install chromium     (once)
//   node scripts/one-world/friend-irons-test.mjs     (Fifi and Kenta seated in the live run; STAGE_JSON=<file> offline)
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
  if (p.startsWith("/api/")) return send({})
  let f = join(ROOT, p === "/" ? "velkynvelve-walk/index.html" : p)
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html")
  if (!existsSync(f)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f))
})
await new Promise((r) => server.listen(4137, r))


const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)); if (/one-fight/.test(m.text())) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4137/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
let fails = 0
const check = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
await wait(4000)
for (const pg of [A, B]) await pg.evaluate(() => { window.openTalk = openTalk = function () {} })
// Fifi free and holding the tools; Kenta in irons
await A.evaluate(() => {
  state.manacled = true; state.unshackled = { freia: true }; state.ironsTried = {}; saveWalk()
  const g = GEAR.freia = GEAR.freia || { carried: [] }; g.carried = (g.carried || []).filter(c => !/thieves/i.test(c.name)); g.carried.push({ name: "Thieves' Tools" })
})
await wait(2500)
const place = (pg, near) => pg.evaluate((near) => { const f = party.find(p => p.id === "freia"), k = party.find(p => p.id === "kenta"); const q = nearestWalkable(centroid.x, centroid.y); k.x = q.x; k.y = q.y; k.path = []; const r = nearestWalkable(q.x + (near ? 30 : 420), q.y); f.x = r.x; f.y = r.y; f.path = []; return Math.round(feetBetween(f, k)) }, near)
let ft = await place(A, false); await wait(1200)
let rows = await A.evaluate(() => friendsInIrons(leader).map(p => p.id))
check("far from Kenta: no friend's pick offered", rows.length === 0, { ft, rows })
ft = await place(A, true); await wait(1200)
rows = await A.evaluate(() => friendsInIrons(leader).map(p => p.id))
const selfRow = await A.evaluate(() => ironsCan(leader, "pick"))
check("beside him: 'Pick Kenta's manacles' is offered to Fifi", rows.includes("kenta"), { ft, rows })
check("and not her own (she is out of irons)", !selfRow)
// 2. a failed pick
await A.evaluate(() => { window.__roll = rollOnDashboard; window.rollOnDashboard = rollOnDashboard = () => Promise.resolve({ ok: true, success: false, total: 7 }) })
await A.evaluate(() => ironsFreeFriend(party.find(p => p.id === "kenta"))); await wait(2500)
let st = await B.evaluate(() => ({ manacled: manacled(party.find(p => p.id === "kenta")), un: state.unshackled }))
rows = await A.evaluate(() => friendsInIrons(leader).map(p => p.id))
check("a failed pick: Kenta is still in irons (on his own screen)", st.manacled, st)
check("and Fifi cannot try that lock again until a long rest", !rows.includes("kenta"), rows)
// 3. a good pick (a fresh try)
await A.evaluate(() => { state.ironsTried = {}; saveWalk(); window.rollOnDashboard = rollOnDashboard = () => Promise.resolve({ ok: true, success: true, total: 18 }) })
await wait(1500)
await A.evaluate(() => ironsFreeFriend(party.find(p => p.id === "kenta"))); await wait(3500)
st = await B.evaluate(() => ({ manacled: manacled(party.find(p => p.id === "kenta")), un: state.unshackled, pick: ironsCan(ownLeader(), "pick"), brk: ironsCan(ownLeader(), "break") }))
const stA = await A.evaluate(() => ({ manacled: manacled(party.find(p => p.id === "kenta")) }))
check("a good pick: Kenta is out of irons on his own screen", !st.manacled && st.un && st.un.kenta, st)
check("and on Fifi's", !stA.manacled, stA)
check("Kenta's own bar no longer offers to pick or break his irons", !st.pick && !st.brk, st)
// 4. no tools, no row
await A.evaluate(() => { state.unshackled = { freia: true }; state.ironsTried = {}; saveWalk(); GEAR.freia.carried = GEAR.freia.carried.filter(c => !/thieves/i.test(c.name)) })
await wait(1500)
rows = await A.evaluate(() => friendsInIrons(leader).map(p => p.id))
check("without thieves' tools the row is never offered", rows.length === 0, rows)
console.log(fails ? `\n${fails} FAILED` : "\nall passed")
await browser.close(); server.close()
process.exit(fails ? 1 : 0)
