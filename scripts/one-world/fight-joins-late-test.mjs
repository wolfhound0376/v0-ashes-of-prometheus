// THE LATE HERO — a hero seated after a fight began joins that fight (Sam, 2026-11-12: "We need to find a solution to
// the late joiner").
//
// Same stand-in game server as one-fight-test.mjs. Fifi's and Kenta's screens open and Fifi's starts a fight. THEN a
// third hero is seated and their screen opens. Checks: the screen running the fight takes them in (initiative, acting
// from the next round); every screen draws them and shows the same order; nobody else's hit points or place in the
// order changed; the fight will wait for the late hero's own player on their turn.
//
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once)
//   STAGE_JSON=<a stage with Fifi, Kenta and one more seated hero> node scripts/one-world/fight-joins-late-test.mjs
//   (CHROME=<path> to use an installed Chrome; PUBLIC_DIR=<dir> to test another build; PORT, default 4104)
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { chromium } from "playwright"
const PORT = Number(process.env.PORT) || 4104

const ROOT = process.env.PUBLIC_DIR || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const ctx = {}; runInNewContext(readFileSync(join(ROOT, "js/aop-one-world.js"), "utf8") + "\nthis.W = AopOneWorld;", ctx)
const OWL = ctx.W
const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498", KENTA = "51e4202d-b4d5-4658-a9c1-6102713e77f1"
const STAGE = process.env.STAGE_JSON ? JSON.parse(readFileSync(process.env.STAGE_JSON, "utf8")) : await fetch("https://ashes.playacartagena.com/api/map-stage").then((r) => r.json())
const LATE = STAGE.seated.find((s) => s.id !== FIFI && s.id !== KENTA)
let SEATED = STAGE.seated.filter((s) => s.id === FIFI || s.id === KENTA)
if (SEATED.length < 2 || !LATE) { console.log("Fifi and Kenta must both be seated in the live run for the sheets; or pass STAGE_JSON"); process.exit(2) }
const SEATNO = { [FIFI]: 1, [KENTA]: 2, [LATE.id]: 3 }
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
await new Promise((r) => server.listen(PORT, r))


const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)); if (/one-fight/.test(m.text())) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto(`http://localhost:${PORT}/velkynvelve-walk/index.html?oneworld=1`)
  await pg.waitForFunction(() => typeof mode !== "undefined" && (mode === "explore" || mode === "combat") && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const check = (name, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`)

let fails = 0
const ck = (name, ok, detail) => { if (!ok) fails++; check(name, ok, detail) }
const snap = (pg) => pg.evaluate(() => ({ auth: FIGHT.auth, mirror: FIGHT.mirror, id: FIGHT.id, mode, round: cbt && cbt.round, party: party.map((p) => p.id).sort(), order: cbt && cbt.order.map(akey), hp: Object.fromEntries([...foes, ...party].map((a) => [akey(a), a.c && a.c.hp])) }))
const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
await wait(4000)
await A.evaluate(async () => { await loadSpriteManifest("drow-guard-male"); state.wardBroken = true; guardsAlarm = null; for (const n of [...npcs]) if (n.hostile){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n); } startCombat(["drow-guard-male", "drow-guard-male"], "late hero fight", {noAllies: true}) })
await wait(6000)
const a0 = await snap(A), b0 = await snap(B)
ck("Fifi's screen runs the fight, Kenta's shows it", a0.auth && b0.mirror && a0.id === b0.id, { a: a0.mode, b: b0.mode })
ck("two heroes in the fight before the late one is seated", a0.party.length === 2 && a0.order.filter((k) => a0.party.includes(k)).length === 2, a0.party)
// the third hero is seated and opens their screen, mid-fight
SEATED = [...SEATED, LATE]
const C = await screen(LATE.id, "Late")
const slug = await C.evaluate("mySlug")
let a1, b1, c1
for (let i = 0; i < 30; i++) { await wait(1000); a1 = await snap(A); if (a1.order && a1.order.includes(slug)) break }
await wait(3000); a1 = await snap(A); b1 = await snap(B); c1 = await snap(C)
ck("the screen running the fight took the late hero in", a1.party.includes(slug) && a1.order.includes(slug), { slug, party: a1.party, order: a1.order })
const jr = await A.evaluate((s) => { const a = party.find((p) => p.id === s); return a && a.c ? { join: a.c.joinRound, init: a.c.init, hp: a.c.hp } : null }, slug)
ck("they rolled initiative and act from a later round", !!jr && typeof jr.init === "number" && jr.join > a0.round && jr.hp > 0, jr)
ck("Kenta's screen draws the late hero", b1.party.includes(slug), b1.party)
ck("the late hero's own screen is showing the same fight", c1.mirror && c1.id === a1.id && c1.party.includes(slug), { mode: c1.mode, mirror: c1.mirror })
a1 = await snap(A); b1 = await snap(B); c1 = await snap(C)
ck("same order on all three screens", JSON.stringify(a1.order) === JSON.stringify(b1.order) && JSON.stringify(a1.order) === JSON.stringify(c1.order), { a: a1.order, b: b1.order, c: c1.order })
ck("nobody left the order when they joined", a0.order.every((k) => a1.order.includes(k)) && a1.order.length === a0.order.length + 1, { before: a0.order, after: a1.order })
ck("the late hero's hit points agree on every screen", a1.hp[slug] === b1.hp[slug] && a1.hp[slug] === c1.hp[slug], { a: a1.hp[slug], b: b1.hp[slug], c: c1.hp[slug] })
const waits = await A.evaluate((s) => { const a = party.find((p) => p.id === s); return { waits: oneFightWaitsFor(a), driver: owDriver(a), me: OW.key } }, slug)
ck("on their turn the fight will wait for the late hero's own player", waits.waits === true && waits.driver === LATE.id, waits)
console.log(fails ? `\n${fails} check(s) FAILED` : "\nall checks passed")
await browser.close(); server.close(); process.exit(fails ? 1 : 0)
