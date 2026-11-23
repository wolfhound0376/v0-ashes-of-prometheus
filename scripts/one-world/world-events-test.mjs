// WORLD EVENTS, phase 1 — the two-screen scene test (Sam, 2026-11-20: "all events should be world events").
//
// Serves the real built map with a stand-in game server (the same one one-fight-test.mjs uses, taught that a fight
// outranks a scene as lib/walk-fight.ts openDecision does), opens Fifi's screen and Kenta's screen in headless
// Chromium, puts Fifi at the pen gate, and checks the pen gate's scene is ONE scene:
//   - Fifi's screen (the one whose hero is at the bars) runs it; Kenta's shows it, without being stopped for it
//   - the warning, the bolt that kills a prisoner, the volleys, the drop, the drag to the corner, Liana, her potion and
//     her leaving are all seen on Kenta's screen, and the "guard-volley" and "drow-surgeon" film cues reach it
//   - only Fifi's screen rolls dice or calls the game for the scene; Liana's one question is asked only there
//   - Liana's voice: asked for on Fifi's screen (the hero she tends), not on Kenta's, who reads her bubble (2026-10-26)
//   - a film cue with no scene open still reaches the other screen, and a fight that opens ends a scene and is shared
//
// RUN IT BEFORE MERGING ANY CHANGE TO THE WALK MAP'S SCENES OR ITS FIGHT RELAY:
//   node scripts/one-world/world-events-test.mjs                             (STAGE_JSON=<file> to run offline)
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
const PORT = 4101
let world = { campaign_run_id: "00000000-0000-0000-0000-000000000014", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
const fights = [], msgs = []; let fightSeq = 0, msgSeq = 0
const surgeonCalls = [], ttsCalls = []
const isScene = (pl) => String(pl).startsWith("scene:")
const pub = (f) => ({ id: f.id, plate: f.plate, auth_key: f.auth, auth_seen: new Date(f.seen).toISOString(), started_at: new Date(f.started).toISOString(), ended_at: f.ended_at })
function apply(patch, by) {
  const w = world
  if (patch.state) w.state = { ...w.state, ...patch.state }
  if (patch.heroes) for (const [k, v] of Object.entries(patch.heroes)) if ((v.seq || 0) > ((w.heroes[k] && w.heroes[k].seq) ?? -1)) w.heroes[k] = v
  if (patch.seats) w.seats = { ...w.seats, ...patch.seats }
  if ("plate" in patch) w.plate = patch.plate
  if (patch.travel) w.travel = patch.travel
  const rest = Object.keys(patch).filter((k) => k !== "seats")
  if (rest.length) { w.version++; w.updated_by = by }
  return JSON.parse(JSON.stringify(w))
}
const answer = (w, extra = {}) => ({ version: w.version, digest: OWL.worldDigest(w.plate, w.state), now: Date.now(), seats: w.seats, ...extra })
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css", ".mp4": "video/mp4" }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), p = url.pathname
  let body = ""; for await (const c of req) body += c
  const j = body ? (() => { try { return JSON.parse(body) } catch { return {} } })() : {}
  const send = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
  if (p === "/api/verify-claim") return send({ valid: true, character: SEATED.find((s) => s.id === j.characterId) })
  if (p === "/api/map-stage") return send({ run: 14, seated: SEATED, present: [], gone: [], npcLanguages: {} })
  if (p === "/api/drow-surgeon") { if (req.method === "POST") { surgeonCalls.push({ by: j.claimId, action: j.action }); return send({ error: "the test's screens roll their own" }, 500) } return send({ state: null, elvish: [KENTA] }) }
  if (p === "/api/npc-tts") { ttsCalls.push({ npc: j.npcName, page: req.headers["x-test-page"] || "?" }); return send({ error: "no voice in the test" }, 500) }
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
      // lib/walk-fight.ts openDecision: join what is held, unless a fight opens over a scene (a fight outranks a scene)
      if (live && Date.now() - live.seen < 60000 && !(isScene(live.plate) && !isScene(j.plate))) return send({ auth: live.auth === who, fight: pub(live) })
      if (live) live.ended_at = new Date().toISOString()
      const f = { id: "f" + (++fightSeq), plate: String(j.plate), auth: who, seen: Date.now(), started: Date.now(), ended_at: null }; fights.push(f)
      return send({ auth: true, fight: pub(f) })
    }
    const f = fights.find(f => f.id === j.fight)
    if (!f || f.ended_at) return send({ error: "no such live fight", ended: true }, 409)
    if (j.op === "claim") { if (f.auth === who || Date.now() - f.seen > 8000) { f.auth = who; f.seen = Date.now(); return send({ auth: true, fight: pub(f), lastIn: 0 }) } return send({ auth: false, fight: pub(f) }) }
    if (j.op !== "in" && f.auth !== who) return send({ error: "not yours" }, 403)
    const m = { id: ++msgSeq, fight: f.id, kind: j.op, by: who, body: j.body || {} }; msgs.push(m)
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
await new Promise((r) => server.listen(PORT, r))

const browser = await chromium.launch()
async function screen(cid, name) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
  const pg = await c.newPage()
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0, 500)))
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404|500/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)); if (/one-fight/.test(m.text())) console.log(`[${name}]`, m.text().slice(0, 300)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await c.route(/\/api\/npc-tts/, (r) => r.continue({ headers: { ...r.request().headers(), "x-test-page": name } }))
  await pg.goto(`http://localhost:${PORT}/velkynvelve-walk/index.html?oneworld=1`)
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let failed = 0
const check = (name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
const until = async (pg, fn, ms = 20000, arg) => { try { await pg.waitForFunction(fn, arg, { timeout: ms }); return true } catch { return false } }

const A = await screen(FIFI, "Fifi"), B = await screen(KENTA, "Kenta")
await wait(4000)
check("both screens on the pen with both heroes", (await A.evaluate("String(cur)")) === (await B.evaluate("String(cur)")) && (await A.evaluate("String(cur) === String(PEN)")) && (await A.evaluate("party.length")) === 2 && (await B.evaluate("party.length")) === 2, await A.evaluate("party.map(p=>p.id).join()"))

// nobody in the pen asks either hero for a word during the test (that is each screen's own business, and it would stop that screen)
for (const pg of [A, B]) await pg.evaluate(() => { for (const n of npcs){ state.declined[n.id] = true; n.waking = false } if (mode === "talk" || mode === "dialog"){ talkGivesWay(); $("obj").hidden = true; $("talk").hidden = true; mode = "explore" } })
await wait(500)
check("both screens are free to move before the scene", (await A.evaluate("mode")) === "explore" && (await B.evaluate("mode")) === "explore", { a: await A.evaluate("mode"), b: await B.evaluate("mode") })
// Fifi's screen: its own dice for the scene (the stand-in server has no /api/drow-surgeon), quick volleys, and Fifi at the bars
const setup = await A.evaluate(() => {
  surgeonApi = (action, extra) => surgeonLocal(action, extra || {})
  SURGEON_RULES.volleyMs = 900
  state.gateOpen = false; guardsAlarm = null
  for (const n of npcs) state.declined[n.id] = true
  const g = gateCenter(), guards = gateGuards()
  const p = nearestWalkable(g.x + (centroid.x - g.x) * .08, g.y + (centroid.y - g.y) * .08)
  leader.x = p.x; leader.y = p.y; leader.path = []
  return { leader: leader.id, guards: guards.length, g: !!g, prisoners: npcs.filter(n => PEN_NPCS.some(d => d.id === n.id)).length }
})
check("the pen has its guards on the bridge and its prisoners", setup.leader === "freia" && setup.guards > 0 && setup.prisoners > 3, setup)
// Kenta's screen records what reaches it
await B.evaluate(() => { window.__seen = { mode: new Set(), surgeon: false, films: [], bolts: 0, obj: false }
  const play0 = relayPlay; relayPlay = function (ev) { if (ev.p === "shots") window.__seen.bolts++; return play0(ev) }
  for (const n of npcs) state.declined[n.id] = true                 // nobody in the pen asks for a word during the test (that is each screen's own business)
  setInterval(() => { window.__seen.mode.add(mode); if (surgeon) window.__seen.surgeon = true; if (!$("obj").hidden) window.__seen.obj = true; if (mapFilm.last && window.__seen.films.at(-1) !== mapFilm.last) window.__seen.films.push(mapFilm.last) }, 100) })

// 1. the warning
await A.evaluate(() => { gateWarning(gateGuards(), gateCenter(), leader) })
check("the warning opens a scene run by Fifi's screen", await until(A, () => FIGHT.auth && FIGHT.scene === "gate"), await A.evaluate(() => ({ auth: FIGHT.auth, scene: FIGHT.scene, id: FIGHT.id, mode })))
check("Kenta's screen shows it within seconds", await until(B, () => FIGHT.watch && FIGHT.scene === "gate", 8000), await B.evaluate(() => ({ mirror: FIGHT.mirror, scene: FIGHT.scene, id: FIGHT.id, mode })))
await A.evaluate(() => { gateWarn = { stage: "warned", at: now, who: leader.id }; gateWarning(gateGuards(), gateCenter(), leader) })     // said again, now that Kenta's screen is listening
check("the guard's warning bubble is on Kenta's screen", await until(B, () => bubbles.some(b => /^drow-guard/.test(b.a.id) && b.until > now), 6000), await B.evaluate(() => bubbles.map(b => b.a.id + ":" + b.el.textContent.slice(0, 40))))
check("Fifi's screen has the Step back card; Kenta's has no card and is not stopped", (await A.evaluate(() => !$("obj").hidden && mode === "dialog")) && (await B.evaluate(() => $("obj").hidden && mode === "explore")), await B.evaluate(() => ({ obj: $("obj").hidden, mode })))

// 2. "Stay where you are": the bolt that kills a prisoner, then volleys
await A.evaluate(() => { [...$("objBtns").querySelectorAll("button")].find(b => /Stay where you are/.test(b.textContent)).click() })
check("the scene's script runs on Fifi's screen", await until(A, () => surgeon && surgeon.stage === "shooting", 8000), await A.evaluate(() => ({ surgeon: surgeon && surgeon.stage, mode, scene: FIGHT.scene })))
const victim = await (async () => { await until(A, () => surgeon && surgeon.victim, 10000); return A.evaluate(() => surgeon && surgeon.victim ? akey(surgeon.victim) : null) })()
check("a prisoner is shot dead on Fifi's screen", !!victim, victim)
check("the same prisoner lies dead on Kenta's screen", !!victim && await until(B, (k) => { const v = byKey(k); return v && v.down && v.slain }, 10000, victim), await B.evaluate((k) => { const v = byKey(k); return v && { down: v.down, slain: v.slain, offStage: v.offStage } }, victim))
// Kenta walks while the scene plays: nobody watching is stopped
const walk0 = await B.evaluate(() => { const me = party.find(p => p.id === "kenta"); const to = nearestWalkable(me.x + 90, me.y + 30); me.path = findPath(me, to); return { x: me.x, y: me.y, n: me.path.length, ctl: canControl(me) } })
await wait(1500)
const walk1 = await B.evaluate(() => { const me = party.find(p => p.id === "kenta"); return { x: me.x, y: me.y } })
check("Kenta can still walk his own hero while it plays", walk0.ctl && Math.hypot(walk1.x - walk0.x, walk1.y - walk0.y) > 20, { walk0, walk1 })

// 3. the drop and the drag
check("Fifi drops at the gate (Fifi's screen)", await until(A, () => surgeon && (surgeon.stage === "down" || surgeon.stage === "killed"), 60000), await A.evaluate(() => surgeon && surgeon.stage))
check("she is on the floor on Kenta's screen too", await until(B, () => { const f = party.find(p => p.id === "freia"); return f && f.down }, 8000))
const seenB1 = await B.evaluate(() => ({ bolts: window.__seen.bolts, films: window.__seen.films, log: (log.history || []).slice(-12) }))
check("the volleys' bolts flew on Kenta's screen", seenB1.bolts >= 2, seenB1.bolts)
check("the guard-volley film cue reached Kenta's screen", seenB1.films.includes("guard-volley"), seenB1.films)
check("the log of it reached Kenta's screen", seenB1.log.some(l => /guards loose|drops by the gate/.test(l)), seenB1.log.slice(-4))
const dragA0 = await A.evaluate(() => ({ x: surgeon.pc.x, y: surgeon.pc.y }))
check("Liana comes in on Fifi's screen (after the drag to the corner)", await until(A, () => surgeon && surgeon.liana, 40000), await A.evaluate(() => surgeon && { stage: surgeon.stage, next: surgeon.next }))
const dragA1 = await A.evaluate(() => ({ x: surgeon.pc.x, y: surgeon.pc.y, drag: (surgeon.draggers || []).map(d => ({ k: akey(d), x: d.x, y: d.y })) }))
await wait(800)
const dragB1 = await B.evaluate((ks) => { const f = party.find(p => p.id === "freia"); return { x: f.x, y: f.y, drag: ks.map(k => { const d = byKey(k); return d && { x: d.x, y: d.y } }), blood: bloodMarks.length } }, dragA1.drag.map(d => d.k))
check("she was dragged across the pen (Fifi's screen)", Math.hypot(dragA1.x - dragA0.x, dragA1.y - dragA0.y) > 100, { dragA0, dragA1: { x: dragA1.x, y: dragA1.y } })
check("and lies in the same corner on Kenta's screen", Math.hypot(dragB1.x - dragA1.x, dragB1.y - dragA1.y) < 30, { a: { x: dragA1.x, y: dragA1.y }, b: { x: dragB1.x, y: dragB1.y } })
check("the two who dragged her stand by her on Kenta's screen", dragA1.drag.length > 0 && dragA1.drag.every((d, i) => dragB1.drag[i] && Math.hypot(dragB1.drag[i].x - d.x, dragB1.drag[i].y - d.y) < 60), { a: dragA1.drag, b: dragB1.drag })
check("the blood on the floor is on Kenta's screen", dragB1.blood > 2, dragB1.blood)

// 4. Liana
check("Liana walks in on Kenta's screen", await until(B, () => npcs.some(n => n.id === "liana" && actors.includes(n)), 10000))
check("exactly one Liana on each screen", (await A.evaluate(() => npcs.filter(n => n.id === "liana").length)) === 1 && (await B.evaluate(() => npcs.filter(n => n.id === "liana").length)) === 1)
check("Liana speaks on Kenta's screen (a bubble)", await until(B, () => bubbles.some(b => b.a.id === "liana" && b.until > now), 20000))
const tongue = { a: await A.evaluate(() => { const b = bubbles.find(b => b.a.id === "liana"); return b && b.el.querySelector("span").className }), b: await B.evaluate(() => { const b = bubbles.find(b => b.a.id === "liana"); return b && b.el.querySelector("span").className }) }
check("each seat reads her in its own tongue (Kenta has Elvish: English; Fifi has not: Elvish)", tongue.b === "tr" && (tongue.a === "elv" || tongue.a == null), tongue)
check("Fifi is healed on Fifi's screen", await until(A, () => surgeon && surgeon.pc && !surgeon.pc.down, 20000))
check("and gets up on Kenta's screen", await until(B, () => { const f = party.find(p => p.id === "freia"); return f && !f.down }, 8000))
check("the drow-surgeon film cue reached Kenta's screen", await until(B, () => window.__seen.films.includes("drow-surgeon"), 6000), await B.evaluate(() => window.__seen.films))
check("Liana's one question is asked on Fifi's screen", await until(A, () => !$("obj").hidden && /Liana/.test($("objWho").textContent), 30000))
check("and not on Kenta's", await B.evaluate(() => $("obj").hidden && mode === "explore"), await B.evaluate(() => ({ obj: $("obj").hidden, mode })))
await A.evaluate(() => { [...$("objBtns").querySelectorAll("button")].find(b => /Let her go/.test(b.textContent)).click() })
const tOut = Date.now()
check("Liana walks out of the pen on Fifi's screen", await until(A, () => !npcs.some(n => n.id === "liana"), 90000), await A.evaluate(() => npcs.filter(n => n.id === "liana").map(a => ({ x: a.x, y: a.y, path: a.path.length, alpha: a.alpha, anim: a.anim, mode }))))
console.log(`      (she took ${Math.round((Date.now() - tOut) / 1000)} s to leave)`)
check("the scene ends on Fifi's screen", await until(A, () => !surgeon && !FIGHT.id && mode === "explore", 30000), await A.evaluate(() => ({ surgeon: !!surgeon, id: FIGHT.id, mode })))
check("and on Kenta's, with Liana gone", await until(B, () => !FIGHT.id && !FIGHT.watch && !FIGHT.mirror && !npcs.some(n => n.id === "liana"), 10000), await B.evaluate(() => ({ id: FIGHT.id, mirror: FIGHT.mirror, liana: npcs.filter(n => n.id === "liana").length })))
const bEnd = await B.evaluate(() => ({ modes: [...window.__seen.mode], surgeon: window.__seen.surgeon, obj: window.__seen.obj, local: surgeonLocalState.s, victimGone: null }))
check("Kenta's screen never ran the script, never rolled, never showed a card, was never stopped", !bEnd.surgeon && !bEnd.local && !bEnd.obj && bEnd.modes.every(m => m === "explore"), bEnd)
check("the game was asked for the scene by Fifi's screen only", surgeonCalls.every(c => c.by !== KENTA), surgeonCalls.filter(c => c.by === KENTA))
check("Liana's voice was asked for on Fifi's screen only (the hero she tends hears her; the rest read the bubble)", ttsCalls.some(c => c.npc === "Liana" && c.page === "Fifi") && !ttsCalls.some(c => c.npc === "Liana" && c.page === "Kenta"), ttsCalls)
const scenes = fights.filter(f => isScene(f.plate))
check("the guard's warning was voiced on Fifi's screen (the hero warned), not on Kenta's", ttsCalls.some(c => /Drow Guard/.test(c.npc) && c.page === "Fifi") && !ttsCalls.some(c => /Drow Guard/.test(c.npc) && c.page === "Kenta"), ttsCalls.filter(c => /Drow/.test(c.npc)))
check("it was one scene on the lane, opened by Fifi's screen, and it ended", scenes.length === 1 && scenes[0].auth === FIFI && !!scenes[0].ended_at, scenes.map(pub))

// 5. a film cue with no scene open; then a fight outranks a scene
await wait(2500)
await B.evaluate(() => { window.__seen.films = []; mapFilm.last = null })
await A.evaluate(() => { mapFilm("watch-changes") })
check("a film cue outside any scene reaches the other screen", await until(B, () => window.__seen.films.includes("watch-changes"), 8000), await B.evaluate(() => window.__seen.films))
check("and that screen is not held for it", await B.evaluate(() => mode === "explore" && !sceneWatched()))
await A.evaluate(() => { playFilm("call") })
check("a full-screen film (playFilm) opens on the other screen too", await until(B, () => !!document.querySelector("video"), 8000))
await A.evaluate(() => { const v = document.querySelector("video"); if (v) v.parentNode.click() }); await B.evaluate(() => { const v = document.querySelector("video"); if (v) v.parentNode.click() })
await wait(1200)
await A.evaluate(() => { mapFilm("watch-changes") }); await wait(700)
const live = fights.find(f => !f.ended_at)
check("(a scene holds the lane)", !!live && isScene(live.plate), live && pub(live))
await A.evaluate(async () => { await loadSpriteManifest("drow-guard-male"); state.wardBroken = true; guardsAlarm = null; for (const n of [...npcs]) if (n.hostile){ actors = actors.filter(a => a !== n); npcs = npcs.filter(a => a !== n); } startCombat(["drow-guard-male"], "a fight over a scene", { gathered: true }) })
check("a fight that opens takes the lane from the scene and is run by Fifi's screen", await until(A, () => FIGHT.auth && !FIGHT.scene && mode === "combat", 15000), await A.evaluate(() => ({ auth: FIGHT.auth, scene: FIGHT.scene, mode, id: FIGHT.id })))
check("and Kenta's screen shows the fight", await until(B, () => FIGHT.mirror && !FIGHT.scene && mode === "combat", 15000), await B.evaluate(() => ({ mirror: FIGHT.mirror, scene: FIGHT.scene, mode, id: FIGHT.id })))
check("the scene's row was ended, the fight's is live", fights.filter(f => !f.ended_at).length === 1 && !isScene(fights.find(f => !f.ended_at).plate), fights.map(f => f.plate + (f.ended_at ? " ended" : " live")))

console.log(`scene rows: ${fights.filter(f => isScene(f.plate)).length}, fight rows: ${fights.filter(f => !isScene(f.plate)).length}, messages: ${msgs.length}`)
console.log(failed ? `${failed} FAILED` : "ALL PASS")
await browser.close(); server.close()
process.exit(failed ? 1 : 0)
