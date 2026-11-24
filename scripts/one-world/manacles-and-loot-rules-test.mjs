// Sam, 2026-11-23: manacle picks may be retried but a failed pick breaks the kit (house rule); one 5E looting rule in a
// fight (SRD 5.1 object interactions). Offline: STAGE_JSON=<file> node scripts/one-world/manacles-and-loot-rules-test.mjs
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
const LOOT = [{ rowId: "r1", slug: "dagger", name: "Dagger", qty: 1 }, { rowId: "r2", slug: "rope-silk", name: "Silk rope", qty: 1 }, { rowId: "r3", slug: "torch", name: "Torch", qty: 1 }]
const takes = [], itemCalls = []
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
  if (p === "/api/walk-items" && req.method === "POST") { itemCalls.push(j); return send({ ok: true }) }
  if (p === "/api/walk-loot") {
    if (req.method === "GET") return send({ rows: LOOT.filter(r => !r.taken).map(({ taken, ...r }) => r) })
    takes.push(j); const r = LOOT.find(r => r.rowId === j.rowId); if (r) r.taken = true
    return send({ ok: true })
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
// ---- MANACLES: retry while a kit is held; a failed pick breaks the kit ----
const giveKits = (n) => A.evaluate((n) => { const f = party.find(p => p.id === "freia"); setLeader(f); state.manacled = true; state.unshackled = {}; state.ironsTried = {};
  GEAR.freia = GEAR.freia || {carried: [], main: null}; GEAR.freia.carried = GEAR.freia.carried.filter(c => c.name !== "Thieves' Tools"); if (n) GEAR.freia.carried.push({name: "Thieves' Tools", qty: n, item_key: "tt-1"}); exploreKey = "" }, n)
const offered = () => A.evaluate(() => typeof ironsCan === "function" && ironsCan(leader, "pick"))
await giveKits(2)
check("Fifi in irons with thieves' tools is offered the pick", await offered())
await A.evaluate(() => { window.rollOnDashboard = async () => ({ok: true, success: false, total: 7}) })
await A.evaluate(() => ironsTry("pick")); await wait(800)
const after1 = await A.evaluate(() => ({kits: ((GEAR.freia.carried.find(c => c.name === "Thieves' Tools") || {}).qty) || 0, free: !!(state.unshackled || {}).freia}))
check("a failed pick breaks one kit (2 -> 1) and she stays in irons", after1.kits === 1 && !after1.free, after1)
check("the broken kit leaves her real inventory (consume posted)", itemCalls.some(c => c.action === "consume" && c.itemName === "Thieves' Tools" && c.verb === "break"), itemCalls)
check("with a kit left she may try again", await offered())
await A.evaluate(() => { window.rollOnDashboard = async () => ({ok: true, success: true, total: 18}) })
await A.evaluate(() => ironsTry("pick")); await wait(800)
const after2 = await A.evaluate(() => ({kits: ((GEAR.freia.carried.find(c => c.name === "Thieves' Tools") || {}).qty) || 0, free: !!(state.unshackled || {}).freia}))
check("a success frees her and keeps the kit", after2.free && after2.kits === 1, after2)
await giveKits(1); await A.evaluate(() => { window.rollOnDashboard = async () => ({ok: true, success: false, total: 5}) })
await A.evaluate(() => ironsTry("pick")); await wait(800)
check("her last kit broken: the pick is no longer offered", !(await offered()))
// ---- ONE LOOTING RULE: a body is the Search action, then one take with the free interaction; no Take all ----
await A.evaluate(async () => { await loadSpriteManifest("drow-guard-male"); state.manacled = false; state.wardBroken = true; guardsAlarm = null; for (const n of [...npcs]) if (n.hostile){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n); } startCombat(["drow-guard-male", "drow-guard-male"], "loot rule fight", {noAllies: true}) })
await wait(6000)
let mine = false
for (let i = 0; i < 40 && !mine; i++){ await wait(800); const st = await A.evaluate(() => { const a = activeActor(); return {who: a && a.id, mode} }); if (st.mode !== "combat") break
  if (st.who === "kenta") await A.evaluate(() => nextTurn()); if (st.who === "freia") mine = true }
check("Fifi's turn comes", mine)
const rows = await A.evaluate(() => { const f = party.find(p => p.id === "freia"), d = standing(foes)[0]; d.c.hp = 0; d.down = true; const q = nearestWalkable(f.x + 30 * node.scale, f.y); d.x = q.x; d.y = q.y; f.c.action = true; f.c.objFree = true; openMenu(f);
  return [...$("cbtMenu").querySelectorAll("button")].map(b => ({t: b.querySelector("span").textContent, h: (b.querySelector("small") || {}).textContent || "", off: b.disabled})) })
const sr = rows.find(r => /^Search: .*body/.test(r.t))
check("a body beside her: Search costs the action", sr && /your action \(Search\)/.test(sr.h), rows)
await A.evaluate(() => { const b = [...$("cbtMenu").querySelectorAll("button")].find(b => /^Search: .*body/.test(b.querySelector("span").textContent)); b.click() }); await wait(4000)
const card = await A.evaluate(() => ({open: !$("obj").hidden, rows: [...$("objBtns").querySelectorAll("button")].map(b => ({t: b.textContent.trim().slice(0, 40), off: b.disabled})), action: party.find(p => p.id === "freia").c.action}))
check("the card is up and her action is spent", card.open && card.action === false, card)
check("no Take all in a fight", !card.rows.some(r => /^Take all/.test(r.t)), card.rows)
const takeable = card.rows.filter(r => /^Take:/.test(r.t) && !r.off).length
check("takes are offered with her free interaction", takeable >= 1, card.rows)
await A.evaluate(() => { const b = [...$("objBtns").querySelectorAll("button")].find(b => /^Take:/.test(b.textContent.trim()) && !b.disabled); b.click() }); await wait(4000)
const card2 = await A.evaluate(() => ({open: !$("obj").hidden, rows: [...$("objBtns").querySelectorAll("button")].map(b => ({t: b.textContent.trim().slice(0, 40), off: b.disabled})), obj: party.find(p => p.id === "freia").c.objFree}))
check("after one take nothing more can be taken this turn", card2.obj === false && !card2.rows.some(r => /^Take:/.test(r.t) && !r.off), card2)
await browser.close(); server.close(); process.exit(0)
