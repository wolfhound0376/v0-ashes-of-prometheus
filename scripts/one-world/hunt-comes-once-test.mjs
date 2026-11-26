// THE HUNT COMES ONCE: the two-screen replay of the pool (Sam's playtest, 2026-11-24: "what is derrendil and eldith
// doing; why are also these people still on us"). The live game, run 504f, 17:36-17:38 UTC: the party dropped to the
// Pool while hunted; the gray ooze's fight was run by Kenta's screen and shown on Fifi's; the moment it was won the hunt
// opened a NEW fight from Fifi's screen (Jorlan and two guards) with no ally in its initiative, that fight started the
// hunt's clock a second time, and three more drow walked in four rounds later. Kenta died; the party fell.
//   npm i --no-save playwright && npx playwright install chromium     (once; or CHROME=/path/to/chrome)
//   python scripts/velkynvelve-walk/build_walk.py && STAGE_JSON=<file> node scripts/one-world/hunt-comes-once-test.mjs
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
let world = { campaign_run_id: "00000000-0000-0000-0000-000000000015", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
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
await new Promise((r) => server.listen(4119, r))
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--mute-audio"] } : { args: ["--mute-audio"] })
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4119/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let fails = 0
const must = (name, ok, detail) => { if (!ok) fails++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
await wait(4000)
const FOUR = ["eldeth", "derendil", "sarith", "ront"]
// what a screen holds: the fight, who is in it, the hunt on its queue, and each of the four as this screen has them
const seen = (pg) => pg.evaluate((FOUR) => ({ plate: String(cur), mode, auth: !!FIGHT.auth, mirror: !!FIGHT.mirror,
  order: cbt ? (cbt.order || []).map(a => a.id) : null, round: cbt ? cbt.round : null,
  foes: foes.filter(f => !f.down).map(f => f.id), hunts: pendingHelp.filter(h => h.hunt).length,
  four: Object.fromEntries(FOUR.map(id => { const n = npcs.find(x => x.id === id); return [id, n ? [n.ally ? "ally" : "", n.bystander ? "bystander" : "", n.offStage ? "offStage" : "", n.down ? "down" : "", n.hostile ? "hostile" : "", n.backdrop ? "backdrop" : "", actors.includes(n) ? "" : "NOT-IN-ACTORS", (n.alpha ?? 1) < .5 ? "faded" : ""].filter(Boolean).join("+") || "ok" : "ABSENT"] })),
  alliesHere: alliesHere().map(n => n.id) }), FOUR)
const line = (s) => `${s.mode}${s.auth ? " AUTH" : ""}${s.mirror ? " mirror" : ""} order=${s.order ? s.order.join(",") : "-"} r${s.round ?? "-"} foes=${s.foes.join(",") || "-"} hunts=${s.hunts} alliesHere=${s.alliesHere.join(",") || "-"} four=${JSON.stringify(s.four)}`

// THE STAGE: hunted, the four prisoners who fight in the party's company, everyone at the Pool, the ambush held back
apply({ state: { ambushOff: true, escape: { phase: "hunted", since: Date.now(), why: "the test: the alarm is up" }, company: FOUR, companyAt: Object.fromEntries(FOUR.map(id => [id, "14"])) } }, "dm")
await wait(2500)
await A.evaluate(() => { enterNode(14, { from: cur }) })
await A.waitForFunction(() => String(cur) === "14" && mode === "explore", null, { timeout: 30000 })
await B.waitForFunction(() => String(cur) === "14" && mode === "explore", null, { timeout: 30000 })
await wait(4000)
let a = await seen(A), b = await seen(B)
console.log("at the pool   Fifi :", line(a)); console.log("at the pool   Kenta:", line(b))
must("both screens stand at the Pool with the four beside them", a.plate === "14" && b.plate === "14" && a.alliesHere.length === 4 && b.alliesHere.length === 4, { a: a.alliesHere, b: b.alliesHere })

// THE OOZE: the ambush springs on both screens at once, as it did; one screen runs it and the other shows it
const spring = (pg) => pg.evaluate(() => { state.ambushOff = false; const hz = node.hazard; startCombat([...hz.foes], hz.label, { ambush: true }) })
await Promise.all([spring(B), wait(150).then(() => spring(A))])
await wait(12000)
a = await seen(A); b = await seen(B)
console.log("ooze fight    Fifi :", line(a)); console.log("ooze fight    Kenta:", line(b))
const RUN = a.auth ? A : B
must("one screen runs the ooze fight and the other shows it", (a.auth && b.mirror) || (b.auth && a.mirror), { fifi: { auth: a.auth, mirror: a.mirror }, kenta: { auth: b.auth, mirror: b.mirror } })
must("the four are in the ooze fight", FOUR.every(id => ((a.auth ? a : b).order || []).includes(id)), (a.auth ? a : b).order)

// WON: the screen that runs it drops the ooze; then both are watched
await RUN.evaluate(() => { for (const f of foes){ if (f.c) f.c.hp = 0; f.down = true; } endCombat(true) })
const T0 = Date.now(); const last = { A: "", B: "" }; let huntFight = null, waves = 0
while (Date.now() - T0 < 75000) {
  a = await seen(A); b = await seen(B)
  for (const [k, s, nm] of [["A", a, "Fifi "], ["B", b, "Kenta"]]) { const l = line(s); if (l !== last[k]) { last[k] = l; console.log(`+${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}s ${nm}: ${l}`) } }
  const run = a.auth ? a : b.auth ? b : null
  if (run && run.mode === "combat" && run.foes.some(f => /jorlan|drow/.test(f))) {
    if (!huntFight) huntFight = { at: Date.now() - T0, by: a.auth ? "Fifi" : "Kenta", order: (run.order || []).slice(), foes: run.foes.slice() }
    waves = Math.max(waves, run.foes.filter(f => /jorlan|drow/.test(f)).length)
    if (run.round >= 7) break
    // hurry the hunt's fight along: every turn passes, so the rounds turn over and a second wave (if any) comes due
    await (a.auth ? A : B).evaluate(() => { try { const x = activeActor(); if (cbt && x && cbt.phase !== "busy" && !combatBusy) passTurn(x) } catch (e) {} })
  }
  await wait(700)
}
must("the hunt reaches the pool after the ooze is dead", !!huntFight, huntFight)
if (huntFight) {
  must("the party gets a breather: the hunt does not open its fight within 20 s of the win", huntFight.at >= 20000, `opened ${(huntFight.at / 1000).toFixed(1)} s after the win, by ${huntFight.by}'s screen`)
  must("the four stand with the party when the hunt arrives", FOUR.every(id => huntFight.order.includes(id)), huntFight.order)
  must("the hunt comes once: three drow, never six", waves <= 3, `${waves} drow in the hunt's fight`)
  must("and no screen has the hunt queued again once its fight is open", a.hunts === 0 && b.hunts === 0, { fifi: a.hunts, kenta: b.hunts })
}
console.log(fails ? `${fails} FAILED` : "ALL PASS")
await browser.close(); server.close(); process.exit(fails ? 1 : 0)
