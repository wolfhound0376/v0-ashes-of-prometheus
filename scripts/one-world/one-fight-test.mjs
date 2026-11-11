// ONE FIGHT — the two-screen fight test (Sam, 2026-11-10: "fight MUST be synced and wait for other players actions, and
// have complete parity. Make sure of this.").
//
// Serves the real built map with a stand-in game server (One World merged as walk_world_apply does; the fight lane kept
// in memory as /api/walk-fight keeps it in walk_fights/walk_fight_msgs), opens Fifi's screen and Kenta's screen in
// headless Chromium, and checks they are ONE fight: one screen runs it and the other shows it; the same foes, order,
// hit points, round and turn on both; the fight waits for Kenta; his command list, his attack, his bag and his End turn
// are pressed on HIS screen and played on the fight's; his reaction card goes to his screen; the log reaches both; the
// end lays the dead down on both; two screens opening the same fight at once end up with exactly one fight.
//
// RUN IT BEFORE MERGING ANY CHANGE TO THE WALK MAP'S FIGHTS:
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once)
//   node scripts/one-world/one-fight-test.mjs                                (STAGE_JSON=<file> to run offline)
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
await new Promise((r) => server.listen(4100, r))


const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)); if (/one-fight/.test(m.text())) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4100/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const check = (name, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`)
const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
await wait(4000)
check("both screens on one plate with both heroes", (await A.evaluate("cur")) === (await B.evaluate("cur")) && (await A.evaluate("party.map(p=>p.id).sort().join()")) === (await B.evaluate("party.map(p=>p.id).sort().join()")), await A.evaluate("party.map(p=>p.id).join()"))
// put both heroes inside the pen floor, near each other, and start a fight on Fifi's screen against two drow who walk in
await A.evaluate(async () => { for (const id of ["drow-guard-male"]) await loadSpriteManifest(id); state.wardBroken = true; guardsAlarm = null; for (const n of [...npcs]) if (n.hostile){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n); } startCombat(["drow-guard-male", "drow-guard-male"], "two-screen fight", {noAllies: true}) })
await wait(6000)
const fa = await A.evaluate(() => ({auth: FIGHT.auth, mirror: FIGHT.mirror, id: FIGHT.id, mode, foes: foes.map(akey), order: cbt && cbt.order.map(akey)}))
const fb = await B.evaluate(() => ({auth: FIGHT.auth, mirror: FIGHT.mirror, id: FIGHT.id, mode, foes: foes.map(akey), order: cbt && cbt.order.map(akey)}))
check("Fifi's screen runs the fight", fa.auth && !fa.mirror && fa.mode === "combat", fa)
check("Kenta's screen shows it (mirror) within seconds", fb.mirror && fb.mode === "combat" && fb.id === fa.id, fb)
check("same foes, same initiative order", JSON.stringify(fa.order) === JSON.stringify(fb.order) && JSON.stringify(fa.foes.sort()) === JSON.stringify(fb.foes.sort()), {a: fa.order, b: fb.order})
const hpOf = (pg) => pg.evaluate(() => Object.fromEntries([...foes, ...party].map(a => [akey(a), a.c && a.c.hp])))
// play until it is Kenta's turn (foes and Fifi's turns run on Fifi's screen; Fifi's own turn: end it)
let sawKenta = false
for (let i = 0; i < 40 && !sawKenta; i++){
  await wait(1000)
  const st = await A.evaluate(() => { const a = activeActor(); return {who: a && a.id, phase: cbt && cbt.phase, busy: combatBusy, mode} })
  if (st.mode !== "combat") break
  if (st.who === "freia" && st.phase === "menu" && !st.busy) await A.evaluate(() => nextTurn())
  if (st.who === "kenta") sawKenta = true
}
check("the fight reaches Kenta's turn", sawKenta)
await wait(1500)
const wA = await A.evaluate(() => ({menuHidden: $("cbtMenu").hidden, wait: ($("fightWait")||{}).textContent, waitHidden: ($("fightWait")||{hidden: true}).hidden}))
const wB = await B.evaluate(() => ({menuHidden: $("cbtMenu").hidden, rows: [...$("cbtMenu").querySelectorAll("button")].map(b => b.querySelector("span").textContent)}))
check("Fifi's screen waits for Kenta (no menu, a waiting line)", wA.menuHidden && !wA.waitHidden && /Kenta/.test(wA.wait), wA)
check("Kenta's screen shows his command list", !wB.menuHidden && wB.rows.length > 3, wB.rows)
// a few seconds: nothing happens without him
await wait(4000)
check("the fight waits for him", (await A.evaluate(() => activeActor().id)) === "kenta")
// Kenta presses Attack, then his weapon, then clicks the nearest drow — on his own screen
await B.evaluate(() => { const b = [...$("cbtMenu").querySelectorAll("button")].find(b => /^Attack/.test(b.querySelector("span").textContent)); b.click() })
await wait(1500)
const sub = await B.evaluate(() => ({hidden: $("cbtMenu").hidden, rows: [...$("cbtMenu").querySelectorAll("button")].map(b => b.querySelector("span").textContent), phase: FIGHT.menu && FIGHT.menu.phase, hint: $("cbtHint").textContent}))
console.log("after Attack:", JSON.stringify(sub))
if (!sub.hidden && sub.rows.length){ await B.evaluate(() => { const b = [...$("cbtMenu").querySelectorAll("button")].find(b => !b.disabled && !/Back/.test(b.textContent)); b.click() }); await wait(1500) }
// aim at the nearest foe — on Kenta's screen, by clicking where he sees it
const before = await hpOf(A)
// make sure the target is within reach of a ranged/any attack: put a drow next to Kenta on the authority
await A.evaluate(() => { const k = party.find(p => p.id === "kenta"), f = standing(foes)[0]; const q = nearestWalkable(k.x + 40 * node.scale, k.y); f.x = q.x; f.y = q.y; })
await wait(1200)
const aimAt = await B.evaluate(() => { const k = party.find(p => p.id === "kenta"); const f = foes.filter(f => !f.down).sort((a, b) => Math.hypot(a.x-k.x,a.y-k.y)-Math.hypot(b.x-k.x,b.y-k.y))[0]; click({x: f.x, y: f.y - 30}); return akey(f) })
await wait(6000)
const after = await hpOf(A), afterB = await hpOf(B)
const logsA = await A.evaluate(() => (log.recent || []).slice(-6)), logsB = await B.evaluate(() => (log.recent || []).slice(-6))
console.log("A log:", JSON.stringify(logsA)); console.log("B log:", JSON.stringify(logsB))
check("Kenta's attack was played on the fight's screen", logsA.some(l => /^Kenta/.test(l)) || JSON.stringify(after) !== JSON.stringify(before), {aimAt, before: before[aimAt], after: after[aimAt]})
check("every hit point agrees on both screens", JSON.stringify(after) === JSON.stringify(afterB), {after, afterB})
check("the log line reached Kenta's screen too", logsB.some(l => /Kenta/.test(l)))
// Kenta drinks a potion from his own bag, in his turn, on his own screen
await A.evaluate(() => { const k = party.find(p => p.id === "kenta"); k.c.hp = 3; GEAR.kenta = {carried: [{name: "Potion of Healing", item_key: "potion-of-healing-t", properties: {heal: "2d4+2"}}], doll: [], main: null}; })
await B.evaluate(() => { GEAR.kenta = {carried: [{name: "Potion of Healing", item_key: "potion-of-healing-t", properties: {heal: "2d4+2"}}], doll: [], main: null}; })
await wait(1200)
const canBag = await B.evaluate(() => bagCan(party.find(p => p.id === "kenta")))
await B.evaluate(() => { const k = party.find(p => p.id === "kenta"); drinkItem(k, GEAR.kenta.carried[0], k); })
await wait(3000)
const potA = await A.evaluate(() => { const k = party.find(p => p.id === "kenta"); return {hp: k.c.hp, bonus: k.c.bonus}; }), potB = await B.evaluate(() => { const k = party.find(p => p.id === "kenta"); return {hp: k.c.hp, bonus: k.c.bonus}; })
check("his bag works in his turn on his screen; the potion is drunk on the fight's screen", canBag && potA.hp > 3 && potA.bonus === false && potB.hp === potA.hp, {canBag, potA, potB})
// Kenta ends his turn with Enter on his screen
await B.evaluate(() => { if (FIGHT.menu && FIGHT.menu.phase === "menu"){ const b = [...$("cbtMenu").querySelectorAll("button")].find(b => /End turn/.test(b.textContent)); if (b) b.click(); } })
await wait(4000)
check("his End turn moved the fight on", (await A.evaluate(() => activeActor() && activeActor().id)) !== "kenta")
// a reaction card for Kenta goes to Kenta's screen
await A.evaluate(() => { window.__answered = null; const k = party.find(p => p.id === "kenta"); if (askable(k)) showDialog({title: "Test card", body: "for Kenta", buttons: [{label: "Yes", fn: () => { window.__answered = "yes" }}, {label: "No", fn: () => { window.__answered = "no" }}]}) })
await wait(2500)
const dB = await B.evaluate(() => ({shown: !$("dialog").hidden, title: $("dlgTitle").textContent}))
check("the reaction card shows on Kenta's screen, not Fifi's", dB.shown && dB.title === "Test card" && (await A.evaluate(() => $("dialog").hidden)), dB)
await B.evaluate(() => { [...$("dlgBtns").querySelectorAll("button")][1].click() })
await wait(2000)
check("his answer is played on the fight's screen", (await A.evaluate("window.__answered")) === "no", await A.evaluate("window.__answered"))
// parity over a few foe turns
await wait(8000)
const hA = await hpOf(A), hB = await hpOf(B)
check("after more turns, still one fight: hit points agree", JSON.stringify(hA) === JSON.stringify(hB), {hA, hB})
const oA = await A.evaluate(() => cbt && {round: cbt.round, idx: cbt.idx}), oB = await B.evaluate(() => cbt && {round: cbt.round, idx: cbt.idx})
check("round and turn agree", JSON.stringify(oA) === JSON.stringify(oB), {oA, oB})
// the end
await A.evaluate(() => { for (const f of foes){ f.c.hp = 0; f.down = true; } endCombat(true) })
await wait(4000)
const eA = await A.evaluate(() => ({mode, bodies: npcs.filter(n => n.body).length, fight: FIGHT.id})), eB = await B.evaluate(() => ({mode, bodies: npcs.filter(n => n.body).length, fight: FIGHT.id, mirror: FIGHT.mirror}))
check("the fight ends on both screens, the dead lie on both", eA.mode === "explore" && eB.mode === "explore" && eA.bodies === eB.bodies && eB.bodies >= 2 && !eB.mirror, {eA, eB})
// THE RACE: both screens open the same fight at once (Malachar's flag reaches every screen together)
await wait(3000)
await Promise.all([A, B].map(pg => pg.evaluate(async () => { await loadSpriteManifest("drow-guard-female"); state.cleared = {}; if (mode === "explore") startCombat(["drow-guard-female"], "the race") })))
await wait(7000)
const rA = await A.evaluate(() => ({auth: FIGHT.auth, mirror: FIGHT.mirror, id: FIGHT.id, mode, foes: foes.map(akey).sort(), dup: actors.filter(a => a.kind === "foe").length})), rB = await B.evaluate(() => ({auth: FIGHT.auth, mirror: FIGHT.mirror, id: FIGHT.id, mode, foes: foes.map(akey).sort(), dup: actors.filter(a => a.kind === "foe").length}))
check("two screens opening at once: exactly one runs it, the other shows it", (rA.auth !== rB.auth) && (rA.mirror !== rB.mirror) && rA.id === rB.id && rA.id, {rA, rB})
check("no doubled drow on the screen that lost the race", JSON.stringify(rA.foes) === JSON.stringify(rB.foes) && rA.dup === rB.dup, {rA, rB})
const authPg = rA.auth ? A : B
await authPg.evaluate(() => endCombat(false)); await wait(4000)
check("and it ends on both", (await A.evaluate("mode")) === "explore" && (await B.evaluate("mode")) === "explore")
console.log("ticks+inputs stored:", msgs.length, "bytes:", bytes)
await browser.close(); server.close(); process.exit(0)
