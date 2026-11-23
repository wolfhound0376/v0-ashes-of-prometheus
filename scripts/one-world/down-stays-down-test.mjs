// DOWN STAYS DOWN — the two-screen test (Sam's playtest, 2026-11-22: "After the fight, fifi was down. There wasn't a good
// way to pick her up and so she joined us to the next plate where a fight began and now she was up", and "When we both
// were downed, it should have just been game over unless we were successful at savings throws and someone around us
// (NPCs) picked us up"). Three endings, on two screens:
//   1. every hero down, an ally who fights still up: the fight goes on; won, the ally hauls them to their feet.
//   2. one hero asleep from drow poison when the fight is won: she stays on the floor on BOTH screens, the party cannot
//      leave the plate, and her friend's "Shake awake" gets her up on both.
//   3. every hero down and nobody of ours standing: GAME OVER, on both screens.
//   npm i --no-save playwright && npx playwright install chromium     (once)
//   node scripts/one-world/down-stays-down-test.mjs     (Fifi and Kenta seated in the live run; STAGE_JSON=<file> offline)
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
await new Promise((r) => server.listen(4117, r))


const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)); if (/one-fight/.test(m.text())) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4117/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const check = (name, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`)
const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
await wait(4000)
check("both screens on one plate with both heroes", (await A.evaluate("cur")) === (await B.evaluate("cur")) && (await A.evaluate("party.map(p=>p.id).sort().join()")) === (await B.evaluate("party.map(p=>p.id).sort().join()")), await A.evaluate("party.map(p=>p.id).join()"))
let fails = 0; const must = (name, ok, detail) => { if (!ok) fails++; check(name, ok, detail) }
const open = (pg, label) => pg.evaluate(async (label) => { await loadSpriteManifest("drow-guard-male"); state.wardBroken = true; state.cleared = {}; guardsAlarm = null;
  for (const n of [...npcs]) if (n.hostile){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n); }
  startCombat(["drow-guard-male"], label) }, label)
const lay = () => A.evaluate(() => { for (const p of party){ p.c.hp = 0; p.down = true; p.c.ds = {s: 3, f: 0, stable: true}; } })
const win = () => A.evaluate(() => { for (const f of foes){ if (f.c) f.c.hp = 0; f.down = true; } endCombat(true) })
const seen = (pg) => pg.evaluate(() => ({mode, fell: state.fell || null, over: state.gameOver ? state.gameOver.why || "dead" : null,
  heroes: Object.fromEntries(party.map(p => [p.id, {down: !!p.down, ko: !!p.ko, hp: p.c ? p.c.hp : null}]))}))

// 1. EVERY HERO DOWN, AN ALLY STILL UP
await open(A, "down: an ally stands"); await wait(6000)
must("the fight is on, run by Fifi's screen", await A.evaluate(() => mode === "combat" && FIGHT.auth))
await lay()
const r1 = await A.evaluate(() => { const n = npcs.find(x => x.id === "ront") || npcs.find(x => !x.hostile && !x.body); cbt.allies = [n]; n.ally = true; if (!actors.includes(n)) actors.push(n);
  const ended = checkEnd(); return {ally: n && n.id, ended, over: !!state.gameOver, mode} })
must("with an ally on their feet the fight goes on, no game over", r1.ended === false && !r1.over && r1.mode === "combat", r1)
await win(); await wait(5000)
const a1 = await seen(A), b1 = await seen(B)
must("won by the ally: he hauls the heroes up at 1 HP, nobody left on the floor", Object.values(a1.heroes).every(h => !h.down && !h.ko && h.hp === 1) && !(a1.fell && Object.keys(a1.fell).length) && !a1.over, a1)
must("and the other screen stands them up too", Object.values(b1.heroes).every(h => !h.down && !h.ko) && !b1.over, b1)

// 2. ASLEEP FROM THE POISON WHEN THE FIGHT IS WON
await wait(2000); await open(A, "down: poisoned asleep"); await wait(6000)
await A.evaluate(() => { const f = party.find(p => p.id === "freia"); f.c.hp = 3; addCond(f, "asleep"); f.c.drugged = true; })
await win(); await wait(6000)
const a2 = await seen(A), b2 = await seen(B)
must("Fifi stays on the floor on the screen that ran the fight", a2.heroes.freia.down && a2.heroes.freia.ko && a2.fell && a2.fell.freia && a2.fell.freia.why === "poison" && !a2.heroes.kenta.down, a2)
must("and on Kenta's screen", b2.heroes.freia.down && b2.heroes.freia.ko && b2.fell && !!b2.fell.freia && !b2.heroes.kenta.ko, b2)
const hold = await B.evaluate(() => { const k = party.find(p => p.id === "kenta"), f = party.find(p => p.id === "freia"); const far = fellFriend(k) ? "near" : "far";
  k.x = f.x + 20; k.y = f.y + 10; return {holds: !!fellHolds(), far, friend: (fellFriend(k) || {}).id || null, own: canControl(k)} })
must("the party cannot leave her there; beside her, Kenta is offered the shake", hold.holds && hold.friend === "freia", hold)
const walked = await A.evaluate(() => { const f = party.find(p => p.id === "freia"), x0 = f.x; leader = f; walkTo({x: f.x + 60, y: f.y}); return {moved: f.path.length > 0 || f.x !== x0} })
must("her own screen cannot walk her off", !walked.moved, walked)
await B.evaluate(() => { const k = party.find(p => p.id === "kenta"), f = party.find(p => p.id === "freia"); fellHelp(k, f) }); await wait(6000)
const a3 = await seen(A), b3 = await seen(B)
must("shaken awake: up on both screens, at the hit points she had", !a3.heroes.freia.down && !a3.heroes.freia.ko && !b3.heroes.freia.down && !b3.heroes.freia.ko && a3.heroes.freia.hp === 3 && !(a3.fell && a3.fell.freia), {a3, b3})

// 3. EVERY HERO DOWN, NOBODY OF OURS STANDING
await wait(2000); await open(A, "down: nobody left"); await wait(6000)
await lay()
const r3 = await A.evaluate(() => { cbt.allies = []; const ended = checkEnd(); return {ended, over: state.gameOver && state.gameOver.why, line: state.gameOver && state.gameOver.line} })
must("nobody left to pick them up: GAME OVER on the fight's screen", r3.ended === true && r3.over === "fell" && !!r3.line, r3)
await wait(5000)
const b4 = await seen(B)
must("and on the other screen", b4.over === "fell", b4)
console.log(fails ? `${fails} FAILED` : "ALL PASS")
await browser.close(); server.close(); process.exit(fails ? 1 : 0)
