// THE SCREEN THAT CAME BACK STEPS DOWN — the two-screen test (Sam's playtest, 2026-11-15: "We got out of sync a few
// times"). In that game the screen running the pen-gate fight went quiet for four minutes (a tab in the background
// draws nothing, so it sends nothing). Since then a quiet fight is carried on by a screen that was showing it
// (fight-refresh-test.mjs). This test is the other half: the screen that went quiet COMES BACK, still holding its own
// copy of the fight. Before: the server turned its ticks away and nothing listened, so the table had two fights.
// Now it drops its copy and shows the one being run.
//   npm i --no-save playwright && npx playwright install chromium     (once)
//   node scripts/one-world/fight-comes-back-test.mjs     (first two heroes seated in the live run; STAGE_JSON=<file> offline)
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
await new Promise((r) => server.listen(4121, r))



const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4121/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const check = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
const A = await screen(ONE, "A"), B = await screen(TWO, "B")
await wait(6000)
await A.evaluate(async () => { for (const id of ["drow-guard-male"]) await loadSpriteManifest(id); state.wardBroken = true; guardsAlarm = null; for (const n of [...npcs]) if (n.hostile){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n); } startCombat(["drow-guard-male", "drow-guard-male"], "refresh test fight", {noAllies: true}) })
await wait(7000)
const fightOf = (pg) => pg.evaluate(() => ({ auth: FIGHT.auth, mirror: FIGHT.mirror, id: FIGHT.id, mode, round: cbt && cbt.round, who: (activeActor() || {}).id, foes: Object.fromEntries(foes.map((f) => [akey(f), f.c && f.c.hp])) }))
const fa = await fightOf(A), fb = await fightOf(B)
check("A runs the fight, B shows it", fa.auth && fb.mirror && fa.id === fb.id && fb.mode === "combat", { fa, fb })
// keep the fight from ending while we watch: the foes stand fast at full health
const id0 = fa.id
// A GOES QUIET: nothing it sends about the fight reaches the server (what a hidden tab amounts to), while it keeps its copy
let quiet = true
const ctxA = A.context()
await ctxA.route("**/api/walk-fight", (r) => { if (quiet && r.request().method() === "POST") return r.abort(); return r.continue() })
let took = null
for (let i = 0; i < 25 && !took; i++){ await wait(1000); const b = await fightOf(B); if (b.auth) took = b }
check("B carries the fight on once A has been quiet", !!took && took.id === id0, took || (await fightOf(B)))
// A COMES BACK
quiet = false
let a3 = null
for (let i = 0; i < 15; i++){ await wait(1000); a3 = await fightOf(A); if (a3.mirror) break }
const b3 = await fightOf(B)
check("A, back, steps down and shows B's fight (one screen runs it)", !!a3 && a3.mirror && !a3.auth && a3.id === id0 && b3.auth && a3.mode === "combat", { a3, b3 })
check("no second fight was opened", fights.length === 1, fights.map((f) => f.id))
const refused = msgs.filter((m) => m.by === ONE && m.kind === "tick").length
await wait(4000)
check("A sends no more ticks once it has stepped down", msgs.filter((m) => m.by === ONE && m.kind === "tick").length === refused, refused)
const r1 = await fightOf(B), o1 = await fightOf(A)
check("both screens agree on whose turn it is and the foes' hit points", r1.who === o1.who && JSON.stringify(r1.foes) === JSON.stringify(o1.foes), { runner: r1, other: o1 })
const logA = await A.evaluate(() => RLOG.lines.filter((l) => l.kind === "sync").map((l) => l.text))
console.log("A sync log:", JSON.stringify(logA.slice(-3))); console.log("server:", JSON.stringify(fightLog))
await browser.close(); server.close()
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0)
