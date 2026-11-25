// STAB BEFORE YOU THROW — played on the real built map (Sam, 2026-11-24: "in Underwalk fights everyone throws daggers
// instead of stabbing").
//
// What the live game recorded (walk_fight_msgs 12264-12272, the breakout at the pen gate): Derendil and Eldeth each stood
// about 20 ft from a drow guard with 30 ft of movement unspent and threw the same dagger twice. attackWith took the
// THROWN range as the reach of any thrown weapon more than 5 ft from its target, so nobody walked in.
//
// Serves public/, opens the pen in headless Chromium, starts a real fight and checks:
//   1  an ally with a dagger, 15 ft away with 30 ft of movement, WALKS IN AND STABS: no thrown shot, the dagger stays;
//   2  the same ally with no movement left THROWS: one thrown shot, the dagger leaves the hand and lies on the floor;
//   3  the words match: a thrown hit and a thrown miss say "thrown", a stab says "drives the dagger into";
//   4  Derendil uses his own Claw while he can reach, and throws a handed dagger only when he cannot;
//   5  a hero's plain Dagger attack closes and stabs; the Throw button still throws from the same spot;
//   6  no page errors.
//
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once; or CHROME=/path/to/chrome)
//   python scripts/velkynvelve-walk/build_walk.py && node scripts/one-world/stab-before-throw-test.mjs
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css" }
const PORT = 4191
const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname
  const f = join(ROOT, p)
  if (p.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}") }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); return res.end(readFileSync(f)) }
  res.writeHead(404); res.end()
}).listen(PORT)
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox", "--mute-audio"] } : { args: ["--mute-audio"] })
const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errs = []
pg.on("pageerror", (e) => errs.push("PAGEERROR " + e.message + " @ " + String(e.stack).split("\n").slice(1, 4).join(" < ")))
pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 300)) })
await pg.goto(`http://localhost:${PORT}/velkynvelve-walk/index.html`)
let ok = true
const check = (name, v, extra = "") => { console.log((v ? "ok   " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!v) ok = false }
const wait = (ms) => new Promise(r => setTimeout(r, ms))
const bail = async (why) => { console.log("SETUP FAILED: " + why, errs.slice(0, 5)); await browser.close(); server.close(); process.exit(2) }
try {
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof npcs !== "undefined" && npcs.length > 0 && leader, null, { timeout: 60000 })
} catch (e) { await bail("never reached explore") }

// a real fight in the pen, the allies in it
await wait(4000)                                    // the plate's own opening lines
await pg.evaluate(async () => { await loadSpriteManifest("drow-guard-male"); state.wardBroken = true; guardsAlarm = null
  talkGivesWay(); if (typeof closeDialog === "function") closeDialog(); if (mode !== "explore") mode = "explore"
  for (const n of [...npcs]) if (n.hostile){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n) }
  startCombat(["drow-guard-male"], "stab before throw", {noAllies: false}) })
// the fight is real, but its turns are ours: nobody takes a turn of their own while a case is staged
await pg.evaluate(() => { nextTurn = () => {}; passTurn = () => {} })
await wait(8000)                                    // the opening (initiative, the first call) plays out and stops
const up = await pg.evaluate(() => JSON.stringify({cbt: !!cbt, mode, foes: foes.filter(f => !f.down && f.c).length, allies: actors.filter(a => a.ally && a.c).map(a => a.id), hero: !!(leader && leader.c)}))
if (!/"cbt":true/.test(up) || !/"foes":[1-9]/.test(up) || !/"hero":true/.test(up)) await bail("the fight did not stand up: " + up)

// the page's own functions, driven directly: one attack, its words, and what flew
// the Dagger is the catalogue's own row (scripts/velkynvelve-walk/items.json), not a made-up one
const DAGGER = readFileSync(join(ROOT, "..", "scripts", "velkynvelve-walk", "items.json"), "utf8").split(/\r?\n/).map(l => { try { return JSON.parse(l.replace(/,\s*$/, "")) } catch (e) { return null } }).find(r => r && r.slug === "dagger")
if (!DAGGER) await bail("no dagger row in items.json")
await pg.evaluate((DAGGER) => {
  window.T = {
    dagger(){ return {...DAGGER, qty: 1, pixel: DAGGER.pixel_icon_url} },
    arm(a){ const g = GEAR[a.id] || (GEAR[a.id] = {carried: [], doll: []}); g.carried = (g.carried || []).filter(c => c.name !== "Dagger").concat([T.dagger()]); refreshAttacks(a.id) },
    has(a){ return ((GEAR[a.id] || {}).carried || []).some(c => c.name === "Dagger") },
    foe(){ return foes.find(f => !f.down) },
    // stand `a` about `ft` feet from the foe, on the floor, with a clear line
    place(a, ft){ const f = T.foe(); let best = null
      for (let k = 0; k < 72 && !best; k++){ const an = k * Math.PI / 36, px = ft * ftPx(f), q = nearestWalkable(f.x + Math.cos(an) * px, f.y + Math.sin(an) * px * .6)
        const save = {x: a.x, y: a.y}; a.x = q.x; a.y = q.y; a.path = []; a.kx = a.ky = 0
        const d = feetBetween(a, f), clear = !coverOf(a, f).total && !coverOf(a, f).ac && findPath(a, {x: f.x, y: f.y}).length > 0
        if (d >= 9 && d <= 19 && clear) best = d; else { a.x = save.x; a.y = save.y } }
      return best },
    async swing(a, atk, roll){ const f = T.foe(); f.c.hp = f.c.hpMax = 999; a.c.reactionUsed = false; f.c.reactionUsed = true
      const said = [], n0 = narrate, d0 = d20, shots0 = shots.length, floor0 = floor.length, flown = []
      const push0 = shots.push.bind(shots); shots.push = (...s) => { flown.push(...s.map(x => x.kind)); return push0(...s) }
      narrate = (who, t) => { said.push(String(t)); return n0(who, t) }; d20 = () => roll
      combatBusy = false; cbt.phase = "menu"
      await new Promise(res => { const t = setTimeout(res, 9000); attackWith(a, f, atk, () => { clearTimeout(t); res() }) })
      await new Promise(r => setTimeout(r, 300))
      narrate = n0; d20 = d0; delete shots.push; combatBusy = false; cbt.phase = "menu"
      return {said, flown, piles: floor.length - floor0, ft: feetBetween(a, f), has: T.has(a), name: atk.name} },
  }
}, DAGGER)

const ally = async (id, move, roll) => pg.evaluate(async ([id, move, roll]) => {
  const a = actors.find(x => x.id === id && x.c); if (!a) return {missing: id}
  T.arm(a); const at = T.place(a, 15); if (!at) return {noSpot: true}
  a.c.move = move; a.c.conds.clear && a.c.conds.clear()
  const pick = allyAttackPick(a, T.foe())
  return {at, how: pick.how, picked: pick.atk.name, ...(await T.swing(a, pick.atk, roll))}
}, [id, move, roll])

// 1 — Eldeth, a dagger, 15 ft, 30 ft of movement: she walks in and stabs
const e1 = await ally("eldeth", 30, 19)
if (e1.missing || e1.noSpot) await bail("could not stage Eldeth: " + JSON.stringify(e1))
check("1 in reach this turn: the picker closes", e1.how === "close" && e1.picked === "Dagger", JSON.stringify({how: e1.how, picked: e1.picked, from: e1.at.toFixed(1)}))
check("1 nothing was thrown", e1.flown.length === 0 && e1.piles === 0, JSON.stringify(e1.flown))
check("1 she walked into arm's reach", e1.ft <= 8, e1.ft.toFixed(1) + " ft")
check("1 the dagger is still in her hand", e1.has === true)
check("3 a stab reads as a stab", e1.said.some(s => /drives the dagger into/.test(s)) && !e1.said.some(s => /thrown|shot goes wide/.test(s)), JSON.stringify(e1.said))

// 2 — the same, with no movement left: she throws it, and it is gone from her hand
const e2 = await ally("eldeth", 0, 19)
check("2 out of reach this turn: the picker throws", e2.how === "throw" && e2.picked === "Dagger", JSON.stringify({how: e2.how, picked: e2.picked, from: e2.at && e2.at.toFixed(1)}))
check("2 one dagger flew", e2.flown.length === 1 && e2.flown[0] === "thrown", JSON.stringify(e2.flown))
check("2 she did not walk", Math.abs(e2.ft - e2.at) < 2, `${e2.at.toFixed(1)} -> ${e2.ft.toFixed(1)} ft`)
check("2 the dagger left her hand and lies on the floor", e2.has === false && e2.piles === 1, JSON.stringify({has: e2.has, piles: e2.piles}))
check("3 a thrown hit says thrown", e2.said.some(s => /thrown dagger buries itself in/.test(s)) && !e2.said.some(s => /drives the dagger into/.test(s)), JSON.stringify(e2.said))
const e3 = await ally("eldeth", 0, 2)
check("3 a thrown miss says thrown, not \"shot\"", e3.said.some(s => /thrown dagger flies wide of/.test(s)) && !e3.said.some(s => /shot goes wide/.test(s)), JSON.stringify(e3.said))

// 4 — Derendil: his own claws while he can reach; the handed dagger only when he cannot
const d1 = await ally("derendil", 30, 19)
if (d1.missing || d1.noSpot) check("4 Derendil is in the fight", false, JSON.stringify(d1))
else {
  check("4 Derendil closes with his Claw, dagger in his pack or not", d1.how === "close" && d1.picked === "Claw" && d1.flown.length === 0 && d1.has === true, JSON.stringify({how: d1.how, picked: d1.picked, flown: d1.flown}))
  check("4 and rakes, not stabs", d1.said.some(s => /rakes/.test(s)), JSON.stringify(d1.said))
  const d2 = await ally("derendil", 0, 19)
  check("4 out of reach, he throws what he was handed", d2.how === "throw" && d2.picked === "Dagger" && d2.flown[0] === "thrown" && d2.has === false, JSON.stringify({how: d2.how, picked: d2.picked, flown: d2.flown, has: d2.has}))
}

// 5 — a hero: the plain attack closes and stabs; the Throw button's attack throws from the same spot
const hero = async (throwing) => pg.evaluate(async (throwing) => {
  const h = leader, at = T.place(h, 15); if (!at) return {noSpot: true}
  h.c.move = 30; h.c.action = true
  const atk = attackFromItem(h.c.sheet, T.dagger())
  return {at, ...(await T.swing(h, throwing ? {...atk, throwing: true} : atk, 19))}
}, throwing)
const h1 = await hero(false)
if (h1.noSpot) await bail("could not stage the hero")
check("5 a hero's plain Dagger attack walks in and stabs", h1.flown.length === 0 && h1.ft <= 8 && h1.said.some(s => /drives the dagger into/.test(s)), JSON.stringify({flown: h1.flown, ft: h1.ft.toFixed(1), said: h1.said}))
const h2 = await hero(true)
check("5 Throw still throws, from where the hero stands", h2.flown[0] === "thrown" && Math.abs(h2.ft - h2.at) < 2 && h2.piles === 1 && h2.said.some(s => /thrown dagger buries itself in/.test(s)), JSON.stringify({flown: h2.flown, at: h2.at.toFixed(1), ft: h2.ft.toFixed(1), piles: h2.piles, said: h2.said}))

check("6 no page errors", errs.length === 0, errs.slice(0, 3).join(" | "))
await browser.close(); server.close()
console.log(ok ? "\nALL PASS" : "\nFAILED")
process.exit(ok ? 0 : 1)
