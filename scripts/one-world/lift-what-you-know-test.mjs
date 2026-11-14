// LIFT ONLY WHAT YOU KNOW ABOUT, AND CAUGHT MEANS A FIGHT — played on the real built map (Sam, 2026-11-13: lifting an
// item "shouldn't be an option unless you know he has these"; "failing any check leads to combat (1:1) unless you pass
// a persuasion ... / intimidation check").
//
// Serves public/ with a stand-in loot server (Jimjar's pocket as the live game has it: a bent wire and a rusted iron
// bar), opens the pen in headless Chromium with scripted dice, and checks: an unknown pocket lists nothing; Size them
// up is one look per hero; the wire Jimjar showed is offered and the iron bar is not until someone has seen it; a
// failed lift opens the three-way card; talked down = forgiven once; cowed = the item changes hands; caught again =
// straight to a fight with ONLY the thief and the mark in the order; the thief is knocked out and the mark stands down.
//
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once; or CHROME=/path/to/chrome)
//   python scripts/velkynvelve-walk/build_walk.py && node scripts/one-world/lift-what-you-know-test.mjs
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css" }
const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname
  const f = join(ROOT, p)
  if (p === "/api/walk-loot" && req.method === "GET") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ rows: [
    { kind: "book", slug: "bent-wire", name: "Bent wire", qty: 1, note: "a bent length of wire he found", missing: false, slot: null },
    { kind: "book", slug: "rusted-iron-bar", name: "Rusted iron bar", qty: 1, note: "", missing: false, slot: null } ] })) }
  if (p.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}") }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); return res.end(readFileSync(f)) }
  res.writeHead(404); res.end()
}).listen(4177)
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox", "--mute-audio"] } : { args: ["--mute-audio"] })
const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errs = []
pg.on("pageerror", (e) => errs.push("PAGEERROR " + e.message + " @ " + String(e.stack).split("\n").slice(1,4).join(" < ")))
pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 300)) })
await pg.goto("http://localhost:4177/velkynvelve-walk/index.html")
let ok = true
const check = (name, v, extra = "") => { console.log((v ? "ok   " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!v) ok = false }
try {
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof npcs !== "undefined" && npcs.some(n => n.id === "jimjar"), null, { timeout: 60000 })
} catch (e) { console.log("never reached explore:", await pg.evaluate(() => ({ mode: typeof mode !== "undefined" ? mode : null, cur: typeof cur !== "undefined" ? cur : null, npcs: typeof npcs !== "undefined" ? npcs.map(n => n.id) : null })).catch(x => String(x)), errs.slice(0, 5)); await browser.close(); server.close(); process.exit(2) }
const btns = () => pg.evaluate(() => [...document.querySelectorAll("#objBtns button")].map(b => b.textContent.trim()))
const text = () => pg.evaluate(() => document.getElementById("objText").textContent)
const press = (label) => pg.evaluate((l) => { const b = [...document.querySelectorAll("#objBtns button")].find(b => b.textContent.trim().startsWith(l)); if (!b) throw new Error("no button " + l); b.click() }, label)
const wait = (ms) => new Promise(r => setTimeout(r, ms))
// rolls: scripted
await pg.evaluate(() => { window.__next = []; window.__asked = []; const real = rollOnDashboard; rollOnDashboard = (action, mod, opts) => { window.__asked.push(action); const v = window.__next.shift(); return v === undefined ? real(action, mod, opts) : Promise.resolve({ ok: true, success: v, total: v ? 25 : 2, natural: v ? 19 : 2 }) } })
const shown = () => pg.waitForFunction(() => !document.getElementById("obj").hidden && document.querySelectorAll("#objBtns button").length > 0, null, { timeout: 15000 })
const open = async () => { await pg.evaluate(() => { $("obj").hidden = true; mode = "explore"; openPockets(npcs.find(n => n.id === "jimjar")) }); await wait(700); await shown() }

// 1 — nothing known: no Lift rows, Size them up offered
await open()
let b = await btns()
check("1 unknown pocket lists no Lift rows", !b.some(x => x.startsWith("Lift:")), JSON.stringify(b))
check("1 Size them up is offered", b.includes("Size them up"))
check("1 card says you do not know", /do not know what they carry/.test(await text()), await text())
// 2 — a failed look: still nothing, and no second look for this hero
await pg.evaluate(() => { window.__next = [false] }); await press("Size them up"); await wait(900); await shown(); await wait(500)
b = await btns()
check("2 failed look reveals nothing", !b.some(x => x.startsWith("Lift:")), JSON.stringify(b))
check("2 one look per hero", !b.includes("Size them up"))
check("2 asked the size-up check", (await pg.evaluate(() => window.__asked)).includes("pocket:size-up"))
check("2 a failed look is not a fight", (await pg.evaluate(() => mode)) === "dialog")
// 3 — Jimjar showed the wire: it is known
await pg.evaluate(() => { state.wireAsk = { at: Date.now(), done: false } }); await open()
b = await btns()
check("3 the wire he showed is offered", b.some(x => x.startsWith("Lift: Bent wire")), JSON.stringify(b))
check("3 the iron bar nobody has seen is NOT offered", !b.some(x => /iron bar/i.test(x)), JSON.stringify(b))
// 3b — a look that lands (another hero's) shows the rest
await pg.evaluate(() => { state.pocketLooked = {} }); await open(); await pg.evaluate(() => { window.__next = [true] }); await press("Size them up"); await wait(900); await shown(); await wait(500)
b = await btns()
check("3b sized up: the iron bar is offered now", b.some(x => /Lift: Rusted iron bar/.test(x)) && !b.includes("Size them up"), JSON.stringify(b))
// 4 — lift fails: the caught card, three ways
await pg.evaluate(() => { window.__next = [false] }); await press("Lift: Bent wire"); await wait(900)
b = await btns()
check("4 caught card has exactly the three ways", JSON.stringify(b) === JSON.stringify(["Talk them down", "Make them hand it over", "Fight"]), JSON.stringify(b))
check("4 still no fight", (await pg.evaluate(() => mode)) === "dialog")
// 5 — talked down: forgiven once, no fight, no item
await pg.evaluate(() => { window.__next = [true] }); await press("Talk them down"); await wait(900)
let st = await pg.evaluate(() => ({ mode, forgiven: !!state.theftForgiven.jimjar, cbt: !!cbt, hostile: !!npcs.find(n => n.id === "jimjar")?.hostile }))
check("5 persuaded: forgiven, no fight", st.forgiven && st.mode === "explore" && !st.cbt && !st.hostile, JSON.stringify(st))
// 5b — (not yet forgiven) caught and cowed: the item changes hands, no fight
await pg.evaluate(() => { state.theftForgiven = {} }); await open(); await pg.evaluate(() => { window.__next = [false] }); await press("Lift: Rusted iron bar"); await wait(900); await shown()
await pg.evaluate(() => { window.__next = [true] }); await press("Make them hand it over"); await wait(1500)
st = await pg.evaluate(() => ({ mode, cbt: !!cbt, has: ((GEAR[leader.id] || {}).carried || []).some(c => c.name === "Rusted iron bar") || (((GEAR[leader.id] || {}).main || {}).name === "Rusted iron bar"), forgiven: !!state.theftForgiven.jimjar, card: !document.getElementById("obj").hidden ? [...document.querySelectorAll("#objBtns button")].map(b => b.textContent.trim()) : null }))
check("5b intimidated: the thief has the item and there is no fight", st.has && !st.cbt, JSON.stringify(st))
await pg.evaluate(() => { $("obj").hidden = true; cardClose && 0; mode = "explore"; state.theftForgiven = { jimjar: true } })
// 6 — caught again: straight to the one-on-one
await open(); await pg.evaluate(() => { window.__next = [false] }); await press("Lift: Bent wire"); await wait(2500)
st = await pg.evaluate(() => ({ mode, grudge: !!(cbt && cbt.grudge), att: cbt?.grudge?.att?.id, tgt: cbt?.grudge?.tgt?.id, leader: leader.id, order: (cbt?.order || []).map(a => a.id), party: party.map(p => p.id), cls: cbt?.grudge?.att?.c?.sheet?.cls, hp: cbt?.grudge?.att?.c?.hp, foes: foes.map(f => f.id), bystanders: (cbt?.bystanders || []).length }))
check("6 second catch is a fight with no card", st.mode === "combat" && st.grudge && st.att === "jimjar" && st.tgt === st.leader, JSON.stringify(st))
check("6 one on one: only the thief and the mark are in the order", st.order.length === 2 && st.order.includes("jimjar") && st.order.includes(st.leader), JSON.stringify(st.order) + " party " + JSON.stringify(st.party))
check("6 the mark fights as the Commoner stand-in", /Commoner/.test(st.cls || "") && st.hp === 4, `${st.cls} hp ${st.hp}`)
check("6 he is the only foe", st.foes.length === 1 && st.foes[0] === "jimjar", JSON.stringify(st.foes))
// 7 — let it run: the thief goes down to a knockout and the mark stands down
await pg.evaluate(() => { const L = cbt.grudge.tgt; L.c.hp = 1; window.__auto = setInterval(() => { try { if (!cbt) return; const a = cbt.order[cbt.turn]; if (a && a.kind === "pc" && a !== window.__passed) { window.__passed = a; passTurn(a); setTimeout(() => { window.__passed = null }, 600) } } catch (e) { window.__autoErr = String(e) } }, 700) })
let end = null
for (let i = 0; i < 90; i++) { await wait(1000); end = await pg.evaluate(() => ({ mode, cbt: !!cbt, ko: !!leader.ko, down: !!leader.down, jim: (() => { const j = [...npcs, ...foes].find(n => n.id === "jimjar"); return j ? { kind: j.kind, hostile: !!j.hostile, down: !!j.down, inNpcs: npcs.includes(j) } : null })(), autoErr: window.__autoErr || null })); if (!end.cbt && end.mode === "explore") break }
await pg.evaluate(() => clearInterval(window.__auto))
check("7 the fight ends", end && !end.cbt && end.mode === "explore", JSON.stringify(end))
check("7 the thief is knocked out, not dead", end && end.ko, JSON.stringify(end))
check("7 the mark stands down, a person on the plate again", end && end.jim && end.jim.kind === "npc" && !end.jim.hostile && end.jim.inNpcs, JSON.stringify(end?.jim))
check("no page errors", errs.length === 0, errs.slice(0, 6).join(" | "))
await browser.close(); server.close()
process.exit(ok ? 0 : 1)
