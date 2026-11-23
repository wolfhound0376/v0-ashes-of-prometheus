// THE PEN DOOR — the two-screen test (Sam, 2026-11-22; design of record: project doc claude/Pen_Door_Rules_2026-11-22.md).
// "Unlocking the door, doesn't necessarily open it. Someone has to open it and then it has a threshold. Once the door of
// an unlocked gate opens, it automatically sends a dialogue box with three options. 1. Flee, with the party. 2. Flee,
// with everyone. 3. Close the gate. ... NPCs can will not go back through the door to the pen." And no panning.
//   1. a prisoner's key unlocks the gate and leaves it shut; the card comes back with "Open it";
//   2. opened, the three-row card comes up by itself, and the camera has not moved;
//   3. "Close the gate" shuts it, still unlocked, on both screens;
//   4. "Flee, with the party": both screens are on the landing plate, no prisoner with them;
//   5. back in the pen, "Flee, with everyone": the prisoners are out; going back in, none of them follows;
//   6. in a fight in the pen with the gate open, the threshold is a Flee exit, and a hero who walks onto it is out.
//   npm i --no-save playwright && npx playwright install chromium     (once)
//   node scripts/one-world/pen-door-test.mjs     (Fifi and Kenta seated in the live run; STAGE_JSON=<file> offline)
//   WATCH=1 node scripts/one-world/pen-door-test.mjs     (the gate watch posted: the card's flee lands in the fight)
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
await new Promise((r) => server.listen(4118, r))


const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)); if (/one-fight/.test(m.text())) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4118/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const check = (name, ok, detail) => console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`)
const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
await wait(4000)
check("both screens on one plate with both heroes", (await A.evaluate("cur")) === (await B.evaluate("cur")) && (await A.evaluate("party.map(p=>p.id).sort().join()")) === (await B.evaluate("party.map(p=>p.id).sort().join()")), await A.evaluate("party.map(p=>p.id).join()"))
let fails = 0; const must = (name, ok, detail) => { if (!ok) fails++; check(name, ok, detail) }
const LAND = "battle-pen-gate"
const card = (pg) => pg.evaluate(() => ({hidden: $("obj").hidden, who: $("objWho").textContent, rows: [...$("objBtns").querySelectorAll("button")].map(b => b.textContent.trim())}))
const press = (pg, label) => pg.evaluate((label) => { const b = [...$("objBtns").querySelectorAll("button")].find(x => x.textContent.trim().startsWith(label)); if (b) b.click(); return !!b }, label)
const gate = (pg) => pg.evaluate(() => ({cur: String(cur), mode, unlocked: !!state.gateOpen, shut: !!state.doorShut, leaf: door.target, left: !!state.gateLeftUnlocked, z: view.z, tx: view.tx, ty: view.ty}))
const noWatch = () => Promise.all([A, B].map(pg => pg.evaluate(() => { guardsAlarm = null; for (const n of [...npcs]) if (n.hostile || /^drow|^jorlan|^quaggoth/.test(n.id)){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n); } return gateGuards().length })))
const prisoners = (pg) => pg.evaluate(() => { const pen = PEN_NPCS.map(d => d.id); return {company: (state.company || []).filter(id => pen.includes(id)), here: npcs.filter(n => pen.includes(n.id) && actors.includes(n) && !n.body).map(n => n.id), at: Object.fromEntries(Object.entries(state.companyAt || {}).filter(([id]) => pen.includes(id)))} })

// WATCH=1: the other ending. The gate watch is out on the landing, and "Flee, with everyone" lands in the fight there.
if (process.env.WATCH){
  const w0 = await A.evaluate(() => gateGuards().map(n => n.id))
  must("the gate watch is posted", w0.length > 0, w0)
  await A.evaluate(() => { state.penKey = true; breakoutBy = "key"; unlockGate() }); await wait(2500)
  await press(A, "Open it"); await wait(4500)
  const cw = await card(A)
  must("the same three-row card with the watch out there", cw.who === "The gate is open" && cw.rows.length === 3 && cw.rows[1].startsWith("Flee, with everyone"), cw)
  await press(A, "Flee, with everyone"); await wait(14000)
  const fa = await A.evaluate(() => ({cur: String(cur), mode, foes: foes.length, surprised: foes.filter(f => f.c && f.c.conds.has("surprised")).length, order: cbt ? cbt.order.map(a => a.id) : null}))
  const fb = await B.evaluate(() => ({cur: String(cur), mode, mirror: FIGHT.mirror}))
  const pw = await prisoners(A)
  const bw = await A.evaluate(() => ({battleFoes: state.battle && state.battle.foes, actorsFoes: actors.filter(a => a.kind === "foe").map(a => a.id), bodies: npcs.filter(n => n.body).map(n => n.id)}))
  must("they land on the landing plate, in the fight with the watch", fa.cur === LAND && fa.mode === "combat" && bw.battleFoes.length === w0.length && fa.foes + bw.bodies.length >= 1, {fa, bw})
  must("the other hero's screen is in it too", fb.cur === LAND && fb.mode === "combat", fb)
  must("every prisoner came out with them", pw.company.length >= 8, {company: pw.company.length, here: pw.here.length})
  console.log(fails ? `${fails} FAILED` : "ALL PASS")
  await browser.close(); server.close(); process.exit(fails ? 1 : 0)
}
// 1. UNLOCKED IS NOT OPEN
const g0 = await gate(A)
await noWatch()
await A.evaluate(() => { state.penKey = true; breakoutBy = "key"; unlockGate() }); await wait(2500)
const g1 = await gate(A), c1 = await card(A)
must("a prisoner's key unlocks the gate and leaves it shut", g1.unlocked && g1.shut && g1.leaf === 0 && g1.cur === "11", g1)
must("the card comes back by itself with Open it", !c1.hidden && c1.rows.some(r => r.startsWith("Open it")), c1)
must("the other screen has it unlocked and shut too", await B.evaluate(() => !!state.gateOpen && !!state.doorShut), await gate(B))

// 2. SOMEONE OPENS IT: THE CARD, AND NO PAN
await press(A, "Open it"); await wait(4200)
const g2 = await gate(A), c2 = await card(A)
must("opened: the leaf swings and the gate is open", g2.unlocked && !g2.shut && g2.leaf === 1, g2)
must("the three-row card comes up by itself", !c2.hidden && c2.who === "The gate is open" && JSON.stringify(c2.rows.map(r => r.replace(/\s+/g, " "))) === JSON.stringify(["Flee, with the party", "Flee, with everyone", "Close the gate"]), c2)
must("the camera has not moved (no pan)", g2.z === g0.z && g2.tx === g0.tx && g2.ty === g0.ty, {before: [g0.z, g0.tx, g0.ty], after: [g2.z, g2.tx, g2.ty]})

// 3. CLOSE THE GATE
await press(A, "Close the gate"); await wait(3500)
const g3 = await gate(A), g3b = await gate(B)
must("Close the gate: shut, still unlocked, and the next watch will find it", g3.unlocked && g3.shut && g3.leaf === 0 && g3.left && g3.mode === "explore", g3)
must("and on the other screen", g3b.unlocked && g3b.shut, g3b)

// 4. FLEE, WITH THE PARTY
await A.evaluate(() => gateOpened()); await wait(4200)
must("opened again: the card again", (await card(A)).who === "The gate is open", await card(A))
await press(A, "Flee, with the party"); await wait(9000)
const g4 = await gate(A), g4b = await gate(B), p4 = await prisoners(A)
must("Flee, with the party: this screen is on the landing plate", g4.cur === LAND && g4.mode !== "dialog", g4)
must("the other hero's screen is there too", g4b.cur === LAND, g4b)
must("no prisoner came", p4.company.length === 0 && p4.here.length === 0, p4)

// 5. BACK IN, THEN FLEE WITH EVERYONE; NPCs DO NOT GO BACK IN
await A.evaluate(() => enterNode(11, {})); await wait(7000)
await noWatch()
must("back in the pen, the gate still open", (await gate(A)).cur === "11" && !(await gate(A)).shut, await gate(A))
await A.evaluate(() => gateOpenCard(false)); await wait(800)
await press(A, "Flee, with everyone"); await wait(9000)
const g5 = await gate(A), p5 = await prisoners(A)
must("Flee, with everyone: on the landing, the prisoners with them", g5.cur === LAND && p5.company.length >= 5 && p5.here.length >= 5, {cur: g5.cur, company: p5.company.length, here: p5.here.length})
await A.evaluate(() => enterNode(11, {})); await wait(7000)
const p6 = await prisoners(A)
must("going back into the pen, no prisoner follows; they wait on the landing", (await gate(A)).cur === "11" && p6.here.length === 0 && p6.company.length === p5.company.length && Object.values(p6.at).every(v => v === LAND), p6)

// 6. THE THRESHOLD, IN A FIGHT IN THE PEN
await wait(2000)
await A.evaluate(async () => { await loadSpriteManifest("drow-guard-male"); state.wardBroken = true; state.cleared = {}; startCombat(["drow-guard-male"], "the drow come in") }); await wait(6000)
must("a fight in the pen, the gate open", await A.evaluate(() => mode === "combat" && FIGHT.auth && doorOpenNow()), await gate(A))
let out = null
for (let i = 0; i < 40 && !out; i++){
  await wait(1000)
  out = await A.evaluate(() => { const a = activeActor(); if (!a || a.kind !== "pc" || combatBusy) return null;
    const ex = exitFor(a), B = balcony(); a.x = B.inside[0] + 200; a.y = B.inside[1] + 120; return {who: a.id, exitTo: ex && ex.to} })
}
must("the open gate is the Flee exit, to the landing", out && out.exitTo === LAND, out)
await wait(400)
await A.evaluate((id) => { const a = party.find(p => p.id === id), B = balcony(); a.x = B.inside[0]; a.y = B.inside[1] }, out.who); await wait(2500)
const f6 = await A.evaluate((id) => { const a = party.find(p => p.id === id); return {left: !!a.left, fled: (state.fled || {})[id] || null, mode} }, out.who)
must("a hero who steps onto the threshold on their turn is out of the fight, bound for the landing", f6.left && f6.fled && f6.fled.to === LAND, f6)
console.log(fails ? `${fails} FAILED` : "ALL PASS")
await browser.close(); server.close(); process.exit(fails ? 1 : 0)
