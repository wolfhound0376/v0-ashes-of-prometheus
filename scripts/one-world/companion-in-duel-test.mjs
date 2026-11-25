// A COMPANION IS PART OF ITS OWNER — played on the real built map (Sam, 2026-11-25: "why is my spider not helping me
// in this fight with Jimjar", then "go").
//
// What the live game showed (walk_world, 2026-11-25): Fifi's spider loose on the pen plate (companions["pet-spider"]:
// owner freia, perched false, alive, bond 0) when her lift from Jimjar failed and his one on one opened. The one on one
// shuts every ally out, and her own spider went out with them. This opens the pen in headless Chromium and checks:
//   1  the thief's own spider, loose on the plate, is in the order, right after the thief, on the thief's initiative,
//      as an ally (not a bystander that runs); the mark is still the only foe and the rest of the party still stands aside
//   2  it takes a turn of its own and the page throws nothing
//   3  a spider that belongs to ANOTHER hero stays out of the thief's one on one
//   4  a spider riding in its owner's sleeve stays out (letting it loose is still the owner's action)
//
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once; or CHROME=/path/to/chrome)
//   python scripts/velkynvelve-walk/build_walk.py && node scripts/one-world/companion-in-duel-test.mjs
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
  const p = new URL(req.url, "http://x").pathname
  const f = join(ROOT, p)
  if (p.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(p === "/api/walk-loot" ? JSON.stringify({ rows: [] }) : "{}") }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); return res.end(readFileSync(f)) }
  if (ASSETS && req.method === "GET") {
    try { const r = await fetch(ASSETS + p); if (r.ok) { res.writeHead(200, { "content-type": r.headers.get("content-type") || TYPES[extname(p)] || "application/octet-stream" }); return res.end(Buffer.from(await r.arrayBuffer())) } } catch (e) {}
  }
  res.writeHead(404); res.end()
}).listen(4179)
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox", "--mute-audio"] } : { args: ["--mute-audio"] })
let ok = true
const check = (name, v, extra = "") => { console.log((v ? "ok   " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!v) ok = false }
const errs = []

/** A fresh pen, a spider set up as `setup` says, then the caught thief's fight. Returns the page and what the fight looks like. */
async function duel(setup) {
  const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  pg.on("pageerror", (e) => errs.push("PAGEERROR " + e.message + " @ " + String(e.stack).split("\n").slice(1, 4).join(" < ")))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 300)) })
  await pg.goto("http://localhost:4179/velkynvelve-walk/index.html")
  try {
    await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof npcs !== "undefined" && npcs.some(n => n.id === "jimjar"), null, { timeout: 90000 })
  } catch (e) { console.log("never reached explore:", errs.slice(0, 5)); await browser.close(); server.close(); process.exit(2) }
  const loose = await pg.evaluate(async (s) => {
    $("obj").hidden = true; mode = "explore"
    const other = party.find(p => p !== leader)
    state.companions = { "pet-spider": { owner: leader.id, name: "Kenta Jr", bond: 0, fedDay: null, perched: true, alive: true, variant: "phase" } }
    await petReady()
    let out = null
    if (s !== "sleeve") out = await petLoose(leader)
    if (s === "other") petSave({ owner: other.id })
    return { out, here: !!petHere(), other: other && other.id }
  }, setup)
  await pg.evaluate(() => { const n = npcs.find(n => n.id === "jimjar"); theftDuel(n, leader, { name: "Bent wire" }) })
  await wait(1200)
  const st = await pg.evaluate(() => ({
    mode, leader: leader.id, order: (cbt?.order || []).map(a => a.id), foes: foes.map(f => f.id), allies: (cbt?.allies || []).map(a => a.id),
    bystanders: (cbt?.bystanders || []).map(b => b.id), party: party.map(p => p.id),
    init: Object.fromEntries((cbt?.order || []).map(a => [a.id, a.c.init])), petAlly: !!(petHere() && petHere().ally), petBystander: !!(petHere() && petHere().bystander) }))
  return { pg, st, loose }
}

// 1 — her own spider, loose: thief, spider, mark
let { pg, st, loose } = await duel("own")
check("1 the spider is loose on the plate before the fight", loose.out === true && loose.here, JSON.stringify(loose))
check("1 the fight opens as the one on one", st.mode === "combat" && st.foes.length === 1 && st.foes[0] === "jimjar", JSON.stringify(st.foes))
const iL = st.order.indexOf(st.leader), iS = st.order.indexOf("pet-spider")
check("1 the thief's spider is in the order", st.order.length === 3 && iS >= 0 && st.order.includes("jimjar"), JSON.stringify(st.order))
check("1 it acts right after its owner", iL >= 0 && iS === iL + 1, JSON.stringify(st.order))
check("1 on its owner's initiative", st.init["pet-spider"] === st.init[st.leader], JSON.stringify(st.init))
check("1 it fights as an ally, it does not run as a bystander", st.petAlly && !st.petBystander && !st.bystanders.includes("pet-spider") && st.allies.includes("pet-spider"), JSON.stringify({ allies: st.allies, bystanders: st.bystanders }))
check("1 the rest of the party still stands aside", st.party.filter(id => id !== st.leader).every(id => !st.order.includes(id)), JSON.stringify(st.order))
// 2 — it takes a turn (bond 0: on its own instincts), and nothing throws
await pg.evaluate(() => {
  window.__petTurns = 0; const j = foes[0]; if (j && j.c) { j.c.hp = j.c.hpMax = 40 }   // the mark must outlast a bite or two
  window.__auto = setInterval(() => { try { if (!cbt) return; const a = activeActor(); if (a && a.id === "pet-spider" && a !== window.__seen) { window.__seen = a; window.__petTurns++; setTimeout(() => { window.__seen = null }, 4000) }
    if (a && a.kind === "pc" && a !== window.__passed && cbt.phase !== "busy") { window.__passed = a; passTurn(a); setTimeout(() => { window.__passed = null }, 900) } } catch (e) { window.__autoErr = String(e) } }, 500) })
let turns = 0
for (let i = 0; i < 60 && turns < 1; i++) { await wait(1000); turns = await pg.evaluate(() => window.__petTurns) }
const after = await pg.evaluate(() => { clearInterval(window.__auto); return { autoErr: window.__autoErr || null, cbt: !!cbt, log: [...document.querySelectorAll("#log div, #cbtLog div, .logline")].slice(-12).map(d => d.textContent.slice(0, 120)) } })
check("2 the spider takes a turn of its own", turns >= 1 && !after.autoErr, JSON.stringify(after).slice(0, 600))
await pg.close()

// 3 — somebody else's spider stays out
;({ pg, st, loose } = await duel("other"))
check("3 another hero's spider is not in the thief's one on one", st.mode === "combat" && st.order.length === 2 && !st.order.includes("pet-spider"), JSON.stringify(st.order) + " owner " + loose.other)
await pg.close()

// 4 — a spider in the sleeve stays there
;({ pg, st, loose } = await duel("sleeve"))
check("4 a spider riding in the sleeve is not put into the fight", st.mode === "combat" && st.order.length === 2 && !st.order.includes("pet-spider") && !loose.here, JSON.stringify(st.order))
await pg.close()

check("no page errors", errs.length === 0, errs.slice(0, 6).join(" | "))
await browser.close(); server.close()
process.exit(ok ? 0 : 1)
