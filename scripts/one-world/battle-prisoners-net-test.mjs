// THE PRISONERS WHO CAME ARE STANDING THERE — played on the real built map (Sam, 2026-11-25: "why is no one joining us
// after we left the pen"; Kenta: "people disappear when a fight starts"; then "go" on the safety net).
//
// What the live game showed (walk_world, walk_fight_msgs, walk_log, 2026-11-25 15:54): "Flee, with everyone", a battle
// record listing eight prisoners, "... come with you out of the pen" logged on both screens, and a fight whose order was
// the two guards and the two heroes: no allies, no bystanders. Why the prisoners were not on the plate is not known
// (two-screen replays did not reproduce it), so this test makes the plate lose them the blunt way and checks the net:
//   1  CONTROL  "Flee, with everyone" as it normally goes: the prisoners arrive, the net does nothing and logs nothing
//   2  the prisoners are taken off the plate just before initiative: the net stands them back, the ones who fight are
//      in the order, the rest are bystanders, each of them once, and the sync log says who was missing and how
//   3  one of them only hidden (off stage) is brought back, not doubled
//   4  someone the story has dead is not stood back up
//
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once; or CHROME=/path/to/chrome)
//   python scripts/velkynvelve-walk/build_walk.py && node scripts/one-world/battle-prisoners-net-test.mjs
//   (ASSETS=https://ashes.playacartagena.com serves any file missing from public/ from the live site: a partial checkout)
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const ASSETS = process.env.ASSETS || ""
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css" }
const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname, f = join(ROOT, p)
  if (p.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(p === "/api/walk-loot" ? '{"rows":[]}' : "{}") }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); return res.end(readFileSync(f)) }
  if (ASSETS && req.method === "GET") {
    try { const r = await fetch(ASSETS + p); if (r.ok) { res.writeHead(200, { "content-type": r.headers.get("content-type") || TYPES[extname(p)] || "application/octet-stream" }); return res.end(Buffer.from(await r.arrayBuffer())) } } catch (e) {}
  }
  res.writeHead(404); res.end()
}).listen(4185)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox", "--mute-audio"] } : { args: ["--mute-audio"] })
let ok = true
const check = (name, v, extra = "") => { console.log((v ? "ok   " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!v) ok = false }
const errs = []

/** A fresh pen, the gate open, "Flee, with everyone" into the watch. `breakIt` runs on the battle plate just before initiative. */
async function flee(breakIt) {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  pg.on("pageerror", (e) => errs.push("PAGEERROR " + e.message + " @ " + String(e.stack).split("\n").slice(1, 4).join(" < ")))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 300)) })
  await pg.goto("http://localhost:4185/velkynvelve-walk/index.html")
  try { await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && npcs.some(n => n.id === "jimjar"), null, { timeout: 90000 }) }
  catch (e) { console.log("never reached explore:", errs.slice(0, 5)); await browser.close(); server.close(); process.exit(2) }
  await pg.evaluate((how) => {
    window.__sync = []; const rl = reviewLog; reviewLog = (kind, text) => { if (kind === "sync") window.__sync.push(String(text)); return rl(kind, text) }
    const open = battleOpen
    battleOpen = (B) => {
      if (how === "gone") { npcs = npcs.filter(n => !n.company); actors = [...party, ...npcs, ...foes] }
      if (how === "hidden") { const e = npcs.find(n => n.id === "eldeth"); if (e) { e.offStage = true; e.alpha = 0 } }
      if (how === "dead") { npcs = npcs.filter(n => n.id !== "derendil"); actors = [...party, ...npcs, ...foes]; state.slain = [...(state.slain || []), "derendil"] }
      return open(B)
    }
    $("obj").hidden = true; mode = "explore"; state.gateOpen = true; state.doorShut = false; gateFlee(true, false)
  }, breakIt)
  try { await pg.waitForFunction(() => !!cbt && mode === "combat", null, { timeout: 30000 }) } catch (e) {}
  await wait(600)
  const st = await pg.evaluate(() => ({
    cur: String(cur), mode, order: cbt ? cbt.order.map(a => a.id) : [], allies: cbt ? cbt.allies.map(a => a.id) : [], by: cbt ? cbt.bystanders.map(a => a.id) : [],
    came: (state.battle && state.battle.allies) || [], here: npcs.filter(n => !n.body && !n.offStage && actors.includes(n)).map(n => n.id), sync: window.__sync.filter(t => /safety net/i.test(t)), foes: foes.map(f => f.id) }))
  await pg.close()
  return st
}
const once = (list) => new Set(list).size === list.length
const fighters = ["ront", "eldeth", "derendil", "sarith"]

// 1 — control
let s = await flee("")
check("1 the fight opens on the landing with the watch", s.cur === "battle-pen-gate" && s.mode === "combat" && s.foes.length >= 1, JSON.stringify({ cur: s.cur, mode: s.mode, foes: s.foes }))
check("1 CONTROL everyone who came is in it", s.came.length >= 8 && s.came.every(id => s.allies.includes(id) || s.by.includes(id)), JSON.stringify({ came: s.came, allies: s.allies, by: s.by }))
check("1 CONTROL the net does nothing and logs nothing", s.sync.length === 0 && once(s.here), JSON.stringify(s.sync))

// 2 — the plate has lost them
s = await flee("gone")
check("2 lost before initiative: everyone who came is stood back", s.came.length >= 8 && s.came.every(id => s.here.includes(id)), JSON.stringify({ came: s.came, here: s.here }))
check("2 the ones who fight are in the order", fighters.filter(id => s.came.includes(id)).every(id => s.order.includes(id) && s.allies.includes(id)), JSON.stringify(s.order))
check("2 the rest are bystanders", s.came.filter(id => !fighters.includes(id)).every(id => s.by.includes(id)), JSON.stringify(s.by))
check("2 each of them once", once(s.here), JSON.stringify(s.here))
check("2 the sync log says who was missing", s.sync.length === 1 && /not on the plate/.test(s.sync[0]) && /eldeth/.test(s.sync[0]), JSON.stringify(s.sync).slice(0, 500))

// 3 — only hidden
s = await flee("hidden")
check("3 a hidden one is brought back, not doubled", s.allies.includes("eldeth") && s.here.filter(id => id === "eldeth").length === 1 && s.sync.length === 1 && /eldeth: off stage/.test(s.sync[0]), JSON.stringify({ allies: s.allies, sync: s.sync }).slice(0, 500))

// 4 — the dead stay dead
s = await flee("dead")
check("4 someone the story has dead is not stood back up", !s.here.includes("derendil") && !s.order.includes("derendil") && s.sync.length === 0, JSON.stringify({ here: s.here, sync: s.sync }).slice(0, 400))

check("no page errors", errs.length === 0, errs.slice(0, 6).join(" | "))
await browser.close(); server.close()
process.exit(ok ? 0 : 1)
