// THE CAT AND THE TIPPING BOARD — played on the real built map (Sam, 2026-11-23: "During combat hits some of the
// creatures made a sound like a crying cat. Find it and lets replace it. Also, some of the dodge effects look like the
// art just gets rotated 30 degrees. This is garbage; lets make better.").
//
// Serves public/, opens the pen in headless Chromium and checks:
//   1  no creature is left on the old pack cries (hurt_beast / hurt_spider / hurt_quaggoth / hurt_hook_horror);
//   2  every family a creature can land in has its takes on disk, and they load;
//   3  people (bandits, duergar, deep gnomes, townsfolk) get the human grunts, not a creature cry;
//   4  a dodge never rotates the body: the pose has no `rot`, the lean is a small shear about the feet, the feet stay
//      on the floor line, and the dodge carries real movement;
//   5  a body with a drawn dodge plays its art for the sidestep and the sway, and the code adds no lean on top;
//   6  a dodge leaves afterimages;
//   8  a falling body, the mimic, Buppido's mound and the weapon crit have their own sounds; no page errors.
//
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once; or CHROME=/path/to/chrome)
//   python scripts/velkynvelve-walk/build_walk.py && node scripts/one-world/dodge-and-pain-test.mjs
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
  if (p.startsWith("/api/")) { res.writeHead(200, { "content-type": "application/json" }); return res.end("{}") }
  if (existsSync(f) && statSync(f).isFile()) { res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); return res.end(readFileSync(f)) }
  res.writeHead(404); res.end()
}).listen(4178)
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME, args: ["--no-sandbox", "--mute-audio"] } : { args: ["--mute-audio"] })
const pg = await browser.newPage({ viewport: { width: 1400, height: 900 } })
const errs = []
pg.on("pageerror", (e) => errs.push("PAGEERROR " + e.message + " @ " + String(e.stack).split("\n").slice(1, 4).join(" < ")))
pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errs.push("CONSOLE " + m.text().slice(0, 300)) })
await pg.goto("http://localhost:4178/velkynvelve-walk/index.html")
let ok = true
const check = (name, v, extra = "") => { console.log((v ? "ok   " : "FAIL ") + name + (extra ? "  " + extra : "")); if (!v) ok = false }
const wait = (ms) => new Promise(r => setTimeout(r, ms))
try {
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof npcs !== "undefined" && npcs.length > 0 && leader, null, { timeout: 60000 })
} catch (e) { console.log("never reached explore:", errs.slice(0, 5)); await browser.close(); server.close(); process.exit(2) }

// 1 — the old cries are gone from every path a creature's blow takes
const sounds = await pg.evaluate(() => {
  const ids = ["goblin", "kuo-toa", "giant-rat", "giant-bat", "giant-fire-beetle", "zombie", "skeleton-swordsman", "gray-ooze", "myconid-adult",
    "hook-horror", "quaggoth", "giant-spider", "giant-wolf-spider", "deep-rothe", "bugbear", "ghost-female", "umber-hulk", "swarm-of-rats"]
  const out = {}
  for (const id of ids){ const cs = CREATURE_SFX[id]; out[id] = cs && cs.hurt ? cs.hurt : painFor({id, kind: "foe"}) }
  return out
})
check("1 no creature left on a pack cry", !Object.values(sounds).some(s => /hurt_(beast|spider|quaggoth|hook_horror)/.test(s)), JSON.stringify(sounds))
check("1 the spider is chitin, the ooze squelches, the kuo-toa croaks", /pain-chitin/.test(sounds["giant-spider"]) && /pain-ooze/.test(sounds["gray-ooze"]) && /pain-croak/.test(sounds["kuo-toa"]), JSON.stringify(sounds))
check("1 bones rattle, rats squeal, the hook horror bellows", /pain-bones/.test(sounds["skeleton-swordsman"]) && /pain-vermin/.test(sounds["giant-rat"]) && /pain-monster/.test(sounds["hook-horror"]))
check("1 a ghost has no body to hurt", sounds["ghost-female"] === "magic/necrotic_tail", sounds["ghost-female"])
check("1 the same take never twice running", await pg.evaluate(() => { let last = null; for (let i = 0; i < 40; i++){ const s = painFor({id: "goblin"}); if (s === last) return false; last = s } return true }))

// 1b — and the last sound it makes (Sam, 2026-11-23: "yes" to the same for deaths): no creature dies on the pack's one growl
const deaths = await pg.evaluate(() => {
  const ids = ["goblin", "kuo-toa", "giant-rat", "giant-fire-beetle", "zombie", "skeleton-swordsman", "gray-ooze", "myconid-adult", "hook-horror", "deep-rothe", "ghost-female"]
  const out = {}; for (const id of ids){ const cs = CREATURE_SFX[id]; out[id] = cs && cs.death ? cs.death : deathFor({id, kind: "foe"}) } return out
})
check("1b no creature dies on the pack's growl", !Object.values(deaths).some(s => /death_beast/.test(s)), JSON.stringify(deaths))
check("1b bones clatter down, the ooze collapses, the kuo-toa croaks out", /death-bones/.test(deaths["skeleton-swordsman"]) && /death-ooze/.test(deaths["gray-ooze"]) && /death-croak/.test(deaths["kuo-toa"]) && deaths["ghost-female"] === "magic/necrotic_release", JSON.stringify(deaths))

// 2 — every take is on disk and decodes
const takes = await pg.evaluate(() => [...Object.entries(PAIN_TAKES).flatMap(([f, n]) => Array.from({length: n}, (_, i) => `pain-${f}${i + 1}`)),
  ...Object.entries(DEATH_TAKES).flatMap(([f, n]) => Array.from({length: n}, (_, i) => `death-${f}${i + 1}`))])
const loaded = await pg.evaluate(async (names) => { const bad = []; for (const n of names){ const b = await loadSfx("walk:" + n), max = n.startsWith("death-") ? 2.4 : 1; if (!b || b.duration < .1 || b.duration > max) bad.push(n + ":" + (b ? b.duration.toFixed(2) : "missing")) } return bad }, takes)
check(`2 all ${takes.length} pain and death takes load (hurts 0.1-1 s, deaths up to 2.4 s)`, loaded.length === 0, loaded.join(" "))

// 3 — people grunt like people
const people = await pg.evaluate(() => ["bandit", "thug", "duergar", "deep-gnome", "elf-townswoman", "cultist", "mage"].map(id => [id, voxFor({id, kind: "foe"}, "hit")]))
check("3 bandits, duergar, deep gnomes and townsfolk use the human grunts", people.every(([, v]) => /walk:vox-hit-[mf]/.test(v || "")), JSON.stringify(people))
check("3 a townswoman's is a woman's", /vox-hit-f/.test(people.find(([i]) => i === "elf-townswoman")[1]))

// 4 — a dodge is movement, not rotation (a hero has no drawn dodge, so this is the code's own pose)
const pose = await pg.evaluate(async () => {
  // a body with no drawn dodge, so this measures the code's own pose (the heroes have drawn ones now)
  const tgt = [...npcs, ...party].find(a => SPR[a.id] && !(SPR[a.id].img && SPR[a.id].img.dodge) && !a.down) || leader
  const att = [...npcs, ...party].find(a => a !== tgt && !a.down)
  const samples = [], styles = []; let ghosts = 0
  for (let k = 0; k < 3; k++){
    tgt.spar = null; att.spar = null
    styles.push(sparMiss(att, tgt, -9, {kind: "slash"}, {miss: "combat/melee_miss"}) + ":" + tgt.spar.style)
    const t0 = performance.now()
    while (performance.now() - t0 < 470){ await new Promise(r => requestAnimationFrame(r)); const sp = sparPose(tgt); if (sp) samples.push({style: tgt.spar && tgt.spar.style, ...sp}); ghosts = Math.max(ghosts, crimGhosts.filter(g => g.col).length) }
  }
  return {styles, samples, ghosts}
})
const maxSk = Math.max(...pose.samples.map(s => Math.abs(s.sk))), hasRot = pose.samples.some(s => "rot" in s)
const moved = Math.max(...pose.samples.map(s => Math.hypot(s.ox, s.oy)))
check("4 all three dodges were played", ["sidestep", "duck", "sway"].every(st => pose.styles.some(s => s.endsWith(st))), JSON.stringify(pose.styles))
check("4 no rotation anywhere in the pose", !hasRot)
check("4 the lean is a small shear (under ~9 degrees' worth)", maxSk > 0 && maxSk <= .16, maxSk.toFixed(3))
check("4 the body really moves off the line", moved > 12, moved.toFixed(1) + " px")
check("4 a crouch keeps its volume (widens as it drops)", pose.samples.filter(s => s.style === "duck" && s.sy < .95).every(s => s.sx > 1), "")
check("6 a dodge leaves afterimages", pose.ghosts > 0, String(pose.ghosts))

// 5 — a body with drawn dodge art: the art leans, the code does not
const drawn = await pg.evaluate(async () => {
  const tgt = [...npcs, ...(typeof foes !== "undefined" ? foes : [])].find(a => SPR[a.id] && SPR[a.id].img && SPR[a.id].img.dodge && !a.down)
  if (!tgt) return {none: true}
  const id = tgt.id
  const att = leader; tgt.sparDodge = 1   // next style: sway
  sparMiss(att, tgt, -9, {kind: "slash"}, {miss: "combat/melee_miss"})
  const style = tgt.spar.style, anim = tgt.anim; let maxSk = 0
  const t0 = performance.now(); while (performance.now() - t0 < 300){ await new Promise(r => requestAnimationFrame(r)); const sp = sparPose(tgt); if (sp) maxSk = Math.max(maxSk, Math.abs(sp.sk)) }
  return {id, style, anim, maxSk}
})
if (drawn.none) console.log("skip 5 no body with a drawn dodge on this plate " + (drawn.id || ""))
else {
  check("5 the drawn dodge plays for the sway too", drawn.style === "sway" && drawn.anim === "dodge", JSON.stringify(drawn))
  check("5 under drawn art the code adds no lean", drawn.maxSk === 0, JSON.stringify(drawn))
}
// 7 — the heroes have drawn dodges now (Sam, 2026-11-23: "yes" to drawn dodges): every main hero's sheet is loaded,
// and the leader plays it on a sidestep with no code lean on top
const heroes = await pg.evaluate(async () => {
  const ids = ["kenta", "samson", "scott", "freia", "lynkes", "gandalf"].filter(id => SPR[id])
  const missing = ids.filter(id => !(SPR[id].img && SPR[id].img.dodge))
  const tgt = leader, att = npcs.find(n => !n.down) || npcs[0]; tgt.spar = null; tgt.sparDodge = 2   // next style: sidestep
  sparMiss(att, tgt, -9, {kind: "slash"}, {miss: "combat/melee_miss"})
  const anim = tgt.anim, style = tgt.spar.style; let maxSk = 0
  const t0 = performance.now(); while (performance.now() - t0 < 300){ await new Promise(r => requestAnimationFrame(r)); const sp = sparPose(tgt); if (sp) maxSk = Math.max(maxSk, Math.abs(sp.sk)) }
  return {ids, missing, leader: tgt.id, anim, style, maxSk}
})
check("7 every main hero has a drawn dodge loaded", heroes.ids.length >= 4 && heroes.missing.length === 0, JSON.stringify(heroes))
check("7 the leader plays it on a sidestep, no code lean", heroes.style === "sidestep" && heroes.anim === "dodge" && heroes.maxSk === 0, JSON.stringify(heroes))
// 8 — the leftovers: a falling body, the mimic, Buppido's mound and the weapon crit (Sam, 2026-11-23: "body thud and
// crit sound") have their own takes; no live call is left on the pack growl or the old crit
const left = await pg.evaluate(async () => { const bad = []; for (const n of ["body-thud1", "body-thud2", "mimic-stir", "mound-stir", "weapon-crit"]){ const b = await loadSfx("walk:" + n); if (!b || b.duration < .1 || b.duration > 1.5) bad.push(n + ":" + (b ? b.duration.toFixed(2) : "missing")) } return bad })
check("8 body thud, mimic stir, mound stir and weapon crit load", left.length === 0, left.join(" "))
const src = readFileSync(join(ROOT, "velkynvelve-walk", "index.html"), "utf8")
check("8 nothing plays the pack growl or the old crit any more", !/bank\("creature\/death_beast"/.test(src) && !/"combat\/crit_hit"/.test(src) && /crit \? "walk:weapon-crit"/.test(src))
await wait(300)
check("no page errors", errs.length === 0, errs.slice(0, 6).join(" | "))
await browser.close(); server.close()
process.exit(ok ? 0 : 1)
