// UNDER ESCORT, THE WATCH DOES NOT CHALLENGE — played on the real built map (Sam, 2026-11-25: "Why did they attack us
// in the work detail?", then "go").
//
// What the live game showed (dialogue + work_details, 2026-11-25): the dishes detail reached the Main Hall kitchen at
// 21:12:29 and at 21:12:39 "The party surrendered to the guards in Main Hall kitchen", with the quota met and nothing
// suspected; afterwards the detail's row was still "working", so the pen read "Work detail: under escort".
// This opens the kitchen in headless Chromium with a stand-in /api/labor and checks:
//   1  CONTROL  no detail: a guard on watch with the party in plain sight challenges them (the card, "Slaves, out of the pen?")
//   2  on a work detail the same guard, same spot, does not: no card, no fight
//   3  a detail called off by a surrender ends quietly on a screen that only hears of it: no bar, no "called off" line,
//      no escort's "Not today. Sit."
//   4  a detail the DM calls off still ends the old way (the line is still narrated)
//
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once; or CHROME=/path/to/chrome)
//   python scripts/velkynvelve-walk/build_walk.py && node scripts/one-world/escort-no-challenge-test.mjs
//   (ASSETS=https://ashes.playacartagena.com serves any file missing from public/ from the live site: a partial checkout)
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const ASSETS = process.env.ASSETS || ""
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css" }
let D = null   // the party's detail, as /api/labor answers it
const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname
  const f = join(ROOT, p)
  const send = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
  if (p === "/api/labor") return send({ detail: D, due: false, crewsNow: [], day: 1, shift: 1 })
  if (p === "/api/walk-loot") return send({ rows: [] })
  if (p.startsWith("/api/")) return send({})
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); return res.end(readFileSync(f)) }
  if (ASSETS && req.method === "GET") {
    try { const r = await fetch(ASSETS + p); if (r.ok) { res.writeHead(200, { "content-type": r.headers.get("content-type") || TYPES[extname(p)] || "application/octet-stream" }); return res.end(Buffer.from(await r.arrayBuffer())) } } catch (e) {}
  }
  res.writeHead(404); res.end()
}).listen(4181)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox", "--mute-audio"] } : { args: ["--mute-audio"] })
let ok = true
const check = (name, v, extra = "") => { console.log((v ? "ok   " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!v) ok = false }
const errs = []
const detail = (status, events = []) => ({ id: "d-test", status, task: "dishes", area_no: 3, party: true, day: 1, shift: 1, crew: [], events })

async function kitchen() {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  pg.on("pageerror", (e) => errs.push("PAGEERROR " + e.message + " @ " + String(e.stack).split("\n").slice(1, 4).join(" < ")))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 300)) })
  await pg.goto("http://localhost:4181/velkynvelve-walk/index.html")
  try { await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof npcs !== "undefined" && npcs.length > 0, null, { timeout: 90000 }) }
  catch (e) { console.log("never reached explore:", errs.slice(0, 5)); await browser.close(); server.close(); process.exit(2) }
  await pg.evaluate(async () => { await pollLabor(); $("obj").hidden = true; mode = "explore"; state.cleared = {}; await enterNode("3k", {}) })
  try { await pg.waitForFunction(() => String(cur) === "3k" && (mode === "explore" || mode === "dialog"), null, { timeout: 30000 }) }
  catch (e) { console.log("never reached the kitchen:", await pg.evaluate(() => ({ mode, cur: String(cur) })), errs.slice(0, 5)); await browser.close(); server.close(); process.exit(2) }
  await wait(800)
  return pg
}
/** A guard of this plate, on watch and in plain sight of the leader, close. Returns what the page did about it. */
const seen = (pg) => pg.evaluate(async () => {
  const g = npcs.find(n => /^drow-guard/.test(n.id) && !n.escort && !n.down && !n.body)
  if (!g) return { guard: null, ids: npcs.map(n => n.id) }
  g.offStage = false; g.alpha = 1; g.hostile = true; g.backdrop = false
  const q = nearestWalkable(g.x + 150 * node.scale, g.y + 10, [{ x: g.x, y: g.y }])
  leader.x = q.x; leader.y = q.y; leader.path = []; leader.walkIn = false; guardsAlarm = null
  await new Promise(r => setTimeout(r, 1600))
  return { guard: g.id, mode, card: !$("obj").hidden, text: $("objText").textContent.slice(0, 160), cbt: !!cbt, live: laborLive(), cover: !!coverOf(g, leader).total, px: Math.round(Math.hypot(g.x - leader.x, g.y - leader.y)), reach: Math.round(520 * node.scale) }
})

// 1 — control: no detail, the watch challenges
D = null
let pg = await kitchen(), r = await seen(pg)
check("1 the kitchen has a drow guard on watch", !!r.guard, JSON.stringify(r).slice(0, 300))
check("1 CONTROL no detail: the guard challenges the party", r.mode === "dialog" && r.card && /out of the pen/.test(r.text) && !r.live, JSON.stringify(r))
await pg.close()

// 2 — on a work detail: nothing
D = detail("working")
pg = await kitchen(); r = await seen(pg)
check("2 the page knows the detail is live", r.live === true, JSON.stringify(r))
check("2 under escort: no challenge card", r.mode === "explore" && !r.card, JSON.stringify(r))
check("2 under escort: no fight", !r.cbt, JSON.stringify(r))

// 3 — the surrender calls it off (as /api/surrender now writes the row): this screen hears of it and ends it quietly
const narrated = () => pg.evaluate(() => [...document.querySelectorAll("#log *, #cbtLog *, #narr *, .narr")].map(d => d.childElementCount ? "" : d.textContent).filter(Boolean).join(" | "))
D = detail("aborted", [{ at: new Date().toISOString(), kind: "step", action: "abort", from: "working", to: "aborted", by: "surrender" }])
await pg.evaluate(async () => { window.__said = []; const real = narrate; narrate = (who, text, ...rest) => { window.__said.push(String(text)); return real(who, text, ...rest) }; await pollLabor() })
await wait(3200)
let st = await pg.evaluate(() => ({ live: laborLive(), labor: labor ? labor.status : null, bar: $("laborBar") ? !$("laborBar").hidden : false, said: window.__said, escort: npcs.filter(n => n.escort).map(n => ({ id: n.id, leaving: !!(n.path && n.path.length) })) }))
check("3 the detail is over on this screen", !st.live && !st.bar, JSON.stringify(st))
check("3 it ends quietly: no 'called off' line", !st.said.some(s => /called off/.test(s)) && !/called off/.test(await narrated()), JSON.stringify(st.said))
await pg.close()

// 4 — the DM's own abort is unchanged
D = detail("working")
pg = await kitchen()
D = detail("aborted", [{ at: new Date().toISOString(), kind: "step", action: "abort", from: "working", to: "aborted", by: "dm" }])
await pg.evaluate(async () => { window.__said = []; const real = narrate; narrate = (who, text, ...rest) => { window.__said.push(String(text)); return real(who, text, ...rest) }; await pollLabor() })
await wait(3200)
st = await pg.evaluate(() => ({ live: laborLive(), bar: $("laborBar") ? !$("laborBar").hidden : false, said: window.__said }))
check("4 a detail the DM calls off still says so", !st.live && !st.bar && st.said.some(s => /called off/.test(s)), JSON.stringify(st))
await pg.close()

check("no page errors", errs.length === 0, errs.slice(0, 6).join(" | "))
await browser.close(); server.close()
process.exit(ok ? 0 : 1)
