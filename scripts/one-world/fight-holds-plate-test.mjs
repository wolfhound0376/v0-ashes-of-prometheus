// A LIVE FIGHT HOLDS ITS PLATE — the headless test (Sam, 2026-11-11, on the fight at the pen gate: "characters
// inadvertently went back through the door causing it to pan to another screen").
//
// Serves the real built map with the same stand-in game server as one-fight-test.mjs (One World merged as
// walk_world_apply does; the fight lane in memory, or answering 503 as the live game does until its tables exist; the
// combat flag as /api/world-flags + /api/walk-spotted keep it) and plays, in headless Chromium, every way a screen was
// found to leave its plate because of a fight. Each scenario gets a fresh world and fresh screens:
//   1  the pen: a hero steps onto the foot of the rope bridge in her turn; the fight is won; nobody crosses on their own
//   2  the Guard Tower: a hero backs into the doorway she came in by; the fight is won; the party stays; the exit still works
//   3  two cards up at once in a fight used to leave the screen "walking" mid-fight, and the doorway then took the party
//   4  a door asked for mid-fight is refused; a drow who retreats off the plate still goes, and moves nobody's view
//   5  fights not shared (503): the other screen's copy of the fight ends, this one is cut off; this screen stays put
//   6  one fight shared: the mirror's own hero stands in the doorway when it ends; the mirror stays put
//   7  the party's move reaches a screen mid-fight with a card up: it waits, and is taken once the fight is over
//   8  ... or dropped, if the party has come back by then
//   9  no fight at all: the party walks out of the open gate and over the bridge, Follow on (together) and off (alone)
// What is shortened, and how: a hero is set down near the doorway instead of spending three turns walking there (the
// last steps are her own Move command); a fight is ended the way one-fight-test ends it (the last foe drops); heroes
// are given hit points to spare so a lucky crossbow bolt cannot end the scenario early. Another screen's party move
// (7, 8) is written to the stand-in server the way that screen's own page would write it.
//
// RUN IT BEFORE MERGING ANY CHANGE TO HOW THE WALK MAP LEAVES A PLATE OR ENDS A FIGHT:
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once; or CHROME=/usr/bin/google-chrome)
//   node scripts/one-world/fight-holds-plate-test.mjs          (STAGE_JSON=<file> offline; ONLY=2,5 for some; SHOTS=<dir>)
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
if (STAGE.seated.filter((s) => s.id === FIFI || s.id === KENTA).length < 2) { console.log("Fifi and Kenta must both be seated in the live run for the sheets; or pass STAGE_JSON"); process.exit(2) }
const PORT0 = +(process.env.PORT || 4110), ONLY = process.env.ONLY ? process.env.ONLY.split(",").map(Number) : null, SHOTS = process.env.SHOTS || ""
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css" }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})

// One fresh world: its own server, its own screens. `lane: false` is the live game today (/api/walk-fight answers 503).
// `watchAway`: the story has the pen's posts unattended ([WATCH: unattended]), so nobody is there to see anyone leave.
async function world({ port, lane = true, seats = [FIFI, KENTA], watchAway = false }) {
  const SEATED = STAGE.seated.filter((s) => seats.includes(s.id)), SEATNO = { [FIFI]: 1, [KENTA]: 2 }
  let w = { campaign_run_id: "00000000-0000-0000-0000-000000000014", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
  const fights = [], msgs = [], pages = []; let fightSeq = 0, msgSeq = 0, flag = null
  const pub = (f) => ({ id: f.id, plate: f.plate, auth_key: f.auth, auth_seen: new Date(f.seen).toISOString(), ended_at: f.ended_at })
  function apply(patch, by) {
    if (patch.state) w.state = { ...w.state, ...patch.state }
    if (patch.heroes) for (const [k, v] of Object.entries(patch.heroes)) if ((v.seq || 0) > ((w.heroes[k] && w.heroes[k].seq) ?? -1)) w.heroes[k] = v
    if (patch.seats) w.seats = { ...w.seats, ...patch.seats }
    if ("plate" in patch) w.plate = patch.plate
    if (patch.travel) w.travel = patch.travel
    if (Object.keys(patch).some((k) => k !== "seats")) { w.version++; w.updated_by = by }
    return JSON.parse(JSON.stringify(w))
  }
  const answer = (x, extra = {}) => ({ version: x.version, digest: OWL.worldDigest(x.plate, x.state), now: Date.now(), seats: x.seats, ...extra })
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x"), p = url.pathname
    let body = ""; for await (const c of req) body += c
    const j = body ? (() => { try { return JSON.parse(body) } catch { return {} } })() : {}
    const send = (o, code = 200) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(o)) }
    if (p === "/api/verify-claim") return send({ valid: true, character: SEATED.find((s) => s.id === j.characterId) })
    if (p === "/api/map-stage") return send({ run: 14, seated: SEATED, present: [], gone: [], npcLanguages: {}, ...(watchAway ? { watch: { state: "unattended", since: "2026-01-01T00:00:00.000Z" } } : {}) })
    // the shared combat flag: a screen whose guard spots a hero raises it, every screen opens the fight it finds there,
    // and the screen whose fight ends takes it down (app/api/walk-spotted, app/api/world-flags)
    if (p === "/api/world-flags") return send({ flags: flag ? [{ key: "combat", value: flag }] : [] })
    if (p === "/api/walk-spotted") {
      if (j.action === "over") { const hit = !!flag && flag.startedAt === j.startedAt; if (hit) flag = null; return send({ ok: true, cleared: hit }) }
      if (flag) return send({ ok: true, already: true, flag })
      flag = { status: "active", startedAt: new Date().toISOString(), label: j.label, foes: (j.foes || []).map((f) => ({ name: f.name, slug: (f.aliases || [])[0], aliases: f.aliases || [], hp: f.hp, hpMax: f.hpMax })) }
      return send({ ok: true, flag })
    }
    if (p === "/api/walk-world") {
      if (req.method === "GET") return send(answer(w, { world: w, realtime: null }))
      const who = j.characterId || "dm"
      if (j.op === "beat") {
        const x = apply({ seats: { [who]: { at: Date.now(), slug: j.slug, cid: who === "dm" ? null : who, dm: who === "dm", seat: SEATNO[who] ?? null, digest: j.digest, version: j.version, status: j.status } } }, who)
        return send(answer(x, (j.version < x.version || j.full) ? { world: x } : {}))
      }
      const c = OWL.cleanPatch(j.patch, who)
      if (c.error) return send({ error: c.error }, 400)
      const refused = []
      if (c.patch.heroes) for (const [s, h] of Object.entries(c.patch.heroes)) if (!OWL.mayWriteHero(h, who, who === "dm", w.seats, Date.now())) { refused.push(s); delete c.patch.heroes[s] }
      return send(answer(apply(c.patch, who), refused.length ? { refused } : {}))
    }
    if (p === "/api/walk-fight") {
      if (!lane) return send({ error: 'relation "public.walk_fights" does not exist' }, 503)
      if (req.method === "GET") {
        const id = url.searchParams.get("fight")
        if (!id) { const f = fights.find((f) => !f.ended_at && Date.now() - f.seen < 60000); return send({ fight: f ? pub(f) : null, now: Date.now() }) }
        const f = fights.find((f) => f.id === id), since = +url.searchParams.get("since") || 0, kind = url.searchParams.get("kind") === "in" ? ["in"] : ["tick", "end"]
        return send({ fight: f ? pub(f) : null, msgs: msgs.filter((m) => m.fight === id && m.id > since && kind.includes(m.kind)).slice(0, 200).map((m) => ({ id: m.id, kind: m.kind, by_key: m.by, body: m.body })), now: Date.now() })
      }
      const who = j.characterId || "dm"
      if (j.op === "open") {
        const live = fights.find((f) => !f.ended_at)
        if (live && Date.now() - live.seen < 60000) return send({ auth: live.auth === who, fight: pub(live) })
        if (live) live.ended_at = new Date().toISOString()
        const f = { id: "f" + (++fightSeq), plate: String(j.plate), auth: who, seen: Date.now(), ended_at: null }; fights.push(f)
        return send({ auth: true, fight: pub(f) })
      }
      const f = fights.find((f) => f.id === j.fight)
      if (!f || f.ended_at) return send({ error: "no such live fight", ended: true }, 409)
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
  await new Promise((r) => server.listen(port, r))
  // a screen: a seated player's (cid) or the DM's (cid null). Every plate change it makes is written down with the
  // state it was made in (window.__moves), so "the view left the plate while a fight was live" is a fact, not a guess.
  async function screen(cid, name) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
    await c.addInitScript(([id]) => {
      if (id) { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok") } else { localStorage.setItem("aop_access_role", "dm"); localStorage.setItem("aop_forge_key", "x") }
      localStorage.setItem("vk-music", "off")
    }, [cid])
    const pg = await c.newPage(); pg.who = name; pages.push(c)
    pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, String(e.stack || e).slice(0, 500)))
    pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|tts|404/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)) })
    await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
    await pg.goto(`http://localhost:${port}/velkynvelve-walk/index.html?oneworld=1`)
    await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
    await pg.evaluate(() => {
      window.__moves = []
      const _enter = enterNode
      enterNode = function (n) { __moves.push({ from: String(cur), to: String(n), fightLive: !!cbt, mode, mirror: !!FIGHT.mirror }); return _enter.apply(this, arguments) }
      for (const n of npcs) n.talk = false            // nobody stops the hero for "a word?" while the scenario plays
    })
    return pg
  }
  return {
    screen, server: { apply: (patch, by = "dm") => { const c = OWL.cleanPatch(patch, by); if (c.error) throw new Error(c.error); return apply(c.patch, by) }, world: () => w, flag: () => flag },
    close: async () => { for (const c of pages) await c.close().catch(() => {}); await new Promise((r) => server.close(r)) },
  }
}

let passed = 0, failed = 0, scenario = ""
const check = (name, ok, detail) => { ok ? passed++ : failed++; console.log(`${ok ? "PASS" : "FAIL"}  [${scenario}] ${name}${detail ? "  — " + (typeof detail === "string" ? detail : JSON.stringify(detail)) : ""}`) }
const see = (pg) => pg.evaluate(() => ({ plate: String(cur), mode, fightLive: !!cbt, mirror: !!FIGHT.mirror, leader: leader && leader.id, at: leader && [Math.round(leader.x), Math.round(leader.y)],
  inDoorway: (() => { const z = leader && zoneAt(leader.x, leader.y); return z ? node.zones.indexOf(z) : null })(), answered: ackZone ? node.zones.indexOf(ackZone) : null, party: party.map((p) => p.id), moves: __moves.slice() }))
const shot = async (pg, name) => { if (SHOTS) await pg.screenshot({ path: join(SHOTS, name + ".png") }) }
const until = async (pg, fn, ms = 30000, arg) => { try { await pg.waitForFunction(fn, arg, { timeout: ms }); return true } catch { return false } }
// the watch does not stand talking, and the pen's ward does not matter here
const openGate = (pg) => pg.evaluate(() => { state.wardBroken = true; unlockGate(); for (const n of npcs) n.talk = false })
const sturdy = (pg) => pg.evaluate(() => { for (const p of party) if (p.c) { p.c.hp = p.c.hpMax = 99 } })
const itsTurn = async (pg, id, ms = 90000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await pg.evaluate(() => ({ mode, who: cbt && activeActor() && activeActor().id, phase: cbt && cbt.phase, busy: combatBusy })); if (s.mode === "combat" && s.who === id && s.phase === "menu" && !s.busy) return true; if (!["combat", "dialog"].includes(s.mode)) return false; await wait(300) } return false }
// her own Move command, then a click where she is to walk (the way a player does it)
async function moveTo(pg, x, y) {
  await pg.evaluate(() => { const a = activeActor(); a.c.move = Math.max(a.c.move, 30); [...$("cbtMenu").querySelectorAll("button")].find((b) => /^Move/.test((b.querySelector("span") || b).textContent.trim())).click() })
  await wait(400); await pg.evaluate(([x, y]) => click({ x, y }), [x, y])
  await until(pg, () => !combatBusy && cbt && cbt.phase !== "busy" && !activeActor().path.length, 15000); await wait(300)
}
const setDown = (pg, id, x, y) => pg.evaluate(([id, x, y]) => { const a = party.find((p) => p.id === id), q = nearestWalkable(x, y); a.x = q.x; a.y = q.y; a.path = [] }, [id, x, y])
const lastFoeDrops = (pg) => pg.evaluate(() => { for (const f of foes) { f.c.hp = 0; f.down = true } endCombat(true) })
const BRIDGE_FOOT = [34, 428]                       // inside the pen plate's "rope bridge -> Guard Tower" doorway (spec.json, plate 11, zone 1)
async function penFight(pg) {                       // the gate stands open and the watch on the landing fights
  await openGate(pg); await wait(1500)
  await pg.evaluate(() => startCombat(gateGuards(), "the breakout at the pen gate", { noAllies: true }))
  await until(pg, () => mode === "combat" && cbt && cbt.order.length > 0, 15000); await sturdy(pg)
}

// THE DOOR CARD (Sam, 2026-11-12: "an option box pops up and asks if you and the other character go through together,
// take the group, or leave the door closed (but unlocked)"). A prisoner's hand opens the gate the way the gate card does.
const prisonerOpens = async (pg, by) => {
  await pg.evaluate((by) => { state.wardBroken = true; window.__handoffs = []; const h0 = handOff; handOff = (t, ...x) => { __handoffs.push(String(t)); try { return h0(t, ...x) } catch (e) {} }
    for (const n of npcs) n.talk = false; breakoutBy = by; unlockGate(by === "force" ? 1 : undefined) }, by)
  return until(pg, () => !$("obj").hidden && /lock is off|torn open/.test($("objWho").textContent), 15000)
}
const card = (pg) => pg.evaluate(() => ({ who: $("objWho").textContent, rows: [...$("objBtns").querySelectorAll("button")].map((b) => b.textContent.trim()) }))
const pick = (pg, re) => pg.evaluate((src) => { const b = [...$("objBtns").querySelectorAll("button")].find((b) => new RegExp(src).test(b.textContent)); if (b) b.click(); return !!b }, re.source)
const fightNow = (pg) => pg.evaluate(() => ({ plate: String(cur), mode, closeUp: OV.on, fade: $("fade").classList.contains("on"), moves: __moves.length,
  heroesOut: party.filter((p) => actors.includes(p)).map((p) => outsidePen(p)), allies: ((cbt && cbt.allies) || []).map((a) => [a.id, outsidePen(a)]),
  alliesInPen: npcs.filter((n) => ALLY_SHEETS[n.id] && actors.includes(n) && !n.offStage).map((n) => [n.id, outsidePen(n)]),
  foes: foes.map((f) => [f.id, !!(f.c && (f.c.surprised || f.c.conds.has("surprised")))]), order: cbt ? cbt.order.length : 0 }))

// THE DOOR, SNEAKING (Sam, 2026-11-12: "leaving through door prompts you if you are sneaking: 1. Attack the guards (ambush)
// 2. Sneak past them (to the Quaggoth den) 3. Change your mind 4. Grab dagger/key/etc (if left by someone) and close the
// door"). The hero is hidden first (as ropeScene hides her), then a prisoner's hand opens the gate. `left`: a dagger lies
// on the floor just inside the bars, where lib/stage-roster.ts puts Jorlan's. The dice answer as told (setDice).
const sneakOpens = async (pg, by, o = {}) => {
  await pg.evaluate(([by, o]) => { state.wardBroken = true; window.__handoffs = []; handOff = (t) => { __handoffs.push(String(t)); return "x" }
    for (const n of npcs) n.talk = false
    sneak = { scout: false, cur, rolls: [{ p: leader, k: { total: 25 } }], seenBy: new Set(), line: "25" }
    if (o.left) { loadGear = async () => {}     // the stand-in server keeps no inventories: the pickup stays as the page made it
      const B = balcony(); floor.push({ id: "local-dagger", node: cur, x: B.inside[0], y: B.inside[1], name: "Dagger", pixel: null }) }
    breakoutBy = by; unlockGate() }, [by, o])
  return until(pg, () => !$("obj").hidden && $("objWho").textContent === "The pen gate, unseen", 15000)
}
const setDice = (pg, face) => pg.evaluate((face) => { d20 = () => face }, face)
const cardIs = (pg, re) => until(pg, (src) => !$("obj").hidden && new RegExp(src).test($("objWho").textContent), 15000, re.source)

// a guard leaning at the bars, the hero beside him and hidden, first empty-handed (`without`), then with the rope. The dice answer as
// told: the hero's holds from `rolls`, every die the watch throws shows `watch`. The strangle starts in the same breath, so
// the game's own clocks (the lean's, the world's beat) cannot move the pieces between the set-up and the act.
const ropeScene = (pg, o) => pg.evaluate((o) => {
  state.wardBroken = true; for (const n of npcs) n.talk = false
  window.__asked = []; window.__handoffs = []; let i = 0
  rollOnDashboard = (action, mod, q = {}) => { __asked.push([action, !!q.advantage]); const ok = o.rolls[i++]; return Promise.resolve({ ok: true, success: !!ok, total: ok ? 25 : 2 }) }
  d20 = () => o.watch
  handOff = (t) => { __handoffs.push(String(t)) }
  fetchLoot = async () => ({ rows: [{ name: PEN_KEY }] }); takeLoot = async (a, id, row) => { if (row.name === PEN_KEY) state.penKey = true; return true }; offerEquip = () => {}
  const B = balcony(), S = LEAN.spot
  let g = npcs.find((m) => m.lean)
  if (!g) { g = gateGuards()[0]; leanStart(g) }
  if (g.lean.phase !== "leaning") { g.path = []; g.x = S.x; g.y = S.y; g.big = S.s; g.alpha = 1; g.fading = false; const cb = g.onArrive; g.onArrive = null; cb && cb() }
  const L = leader, q = nearestWalkable(B.inside[0], B.inside[1]); L.x = q.x; L.y = q.y; L.path = []
  sneak = { scout: false, cur, rolls: [{ p: L, k: { total: o.stealth } }], seenBy: new Set(), line: String(o.stealth) }
  gateWarn = null; exploreKey = ""
  const G = GEAR[L.id] || (GEAR[L.id] = { carried: [] }); G.carried = (G.carried || []).filter((c) => c.name !== "Silk rope")
  const bare = pickpocketMark(L), without = !!(bare && strangleMark(L, bare))                    // empty-handed first
  G.carried.push({ name: "Silk rope", qty: 1 })
  const mark = pickpocketMark(L), offered = !!(mark && strangleMark(L, mark))
  if (offered) strangleGuard(mark)
  return { offered, without, mark: mark && mark.id, lean: g.lean && g.lean.phase, d: Math.round(Math.hypot(g.x - L.x, g.y - L.y)), rope: carries(L, "Silk rope") }
}, o)

const SCENARIOS = {
  11: ["the door card: a quiet opening, the heroes go through, the fight opens on the landing with the drow surprised", async (port) => {
    const W = await world({ port, seats: [FIFI, KENTA] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the card comes up", await prisonerOpens(A, "key"))
      const c = await card(A); await shot(A, "11-the-card")
      check("it is the unseen card: who goes, or leave it shut; nobody to surrender to", c.who === "The lock is off" && c.rows.some((r) => /^Go through — .* and the other hero/.test(r)) && c.rows.some((r) => /Leave it shut, but unlocked/.test(r)) && !c.rows.some((r) => /Surrender|Slip out/.test(r)), c)
      await pick(A, /^Go through — .* and the other hero/)
      check("the fight starts", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000))
      await wait(1200); const f = await fightNow(A); await shot(A, "11-on-the-landing")
      check("on the pen plate, with nobody having walked off it", f.plate === "11" && f.moves === 0, f)
      check("every hero is out on the landing", f.heroesOut.length === 2 && f.heroesOut.every(Boolean), f)
      check("the close-up is up and the fade is gone", f.closeUp === true && f.fade === false, f)
      check("the drow are surprised", f.foes.length > 0 && f.foes.every((x) => x[1]), f)
      check("the prisoners who fight were not taken: none is in the fight, none is outside", f.allies.length === 0 && f.alliesInPen.every((x) => !x[1]), f)
    } finally { await W.close() }
  }],
  12: ["the door card: take everyone who will fight", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the card comes up", await prisonerOpens(A, "pick"))
      const c = await card(A)
      check("alone, the first row says so; the group row is offered", c.rows.some((r) => /^Go through — .* alone$/.test(r)) && c.rows.some((r) => /take everyone who will fight/.test(r)), c)
      await pick(A, /take everyone who will fight/)
      check("the fight starts", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000))
      await wait(1200); const f = await fightNow(A); await shot(A, "12-everyone")
      check("the prisoners who fight are in it, and out on the landing", f.allies.length > 0 && f.allies.every((x) => x[1]), f)
      check("the hero is out there too, close-up up, same plate", f.heroesOut.every(Boolean) && f.closeUp && f.plate === "11" && f.moves === 0, f)
    } finally { await W.close() }
  }],
  13: ["the door card: left shut but unlocked, and the next watch finds it", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the card comes up", await prisonerOpens(A, "key"))
      await pick(A, /Leave it shut, but unlocked/); await wait(900)
      const left = await A.evaluate(() => ({ mode, open: state.gateOpen, shut: state.doorShut, marked: !!state.gateLeftUnlocked, fight: !!cbt }))
      check("the gate is shut but unlocked, nobody fights, and the game goes on", left.mode === "explore" && left.open && left.shut && left.marked && !left.fight, left)
      await A.evaluate(() => { gateLeftUnlockedTick() }); const same = await A.evaluate(() => state.gateOpen && !!state.gateLeftUnlocked)
      check("the same watch never tries it", same === true)
      await A.evaluate(() => { storyRotations += 1; gateLeftUnlockedTick() }); await wait(300)
      const found = await A.evaluate(() => ({ open: state.gateOpen, marked: !!state.gateLeftUnlocked, shakedown: !!(state.keyWatch && state.keyWatch.done), told: __handoffs.filter((t) => /UNLOCKED/.test(t)).length }))
      check("the next watch finds it: locked again, and the drow come in (the one shakedown of the run)", !found.open && !found.marked && found.shakedown && found.told === 1, found)
    } finally { await W.close() }
  }],
  14: ["the door card: a gate torn open is heard — no surprise, no shutting it, surrender on offer", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the card comes up", await prisonerOpens(A, "force"))
      const c = await card(A); await shot(A, "14-torn-open")
      check("it is the seen card: go through or surrender; a torn gate is not offered shut", c.who === "The gate is torn open" && c.rows.some((r) => /^Go through/.test(r)) && c.rows.some((r) => /Surrender/.test(r)) && !c.rows.some((r) => /Leave it shut/.test(r)), c)
      await pick(A, /^Go through — .* alone$/)
      check("the fight starts", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000))
      await wait(1200); const f = await fightNow(A)
      check("out on the landing, and the drow are NOT surprised", f.heroesOut.every(Boolean) && f.closeUp && f.foes.length > 0 && f.foes.every((x) => !x[1]), f)
    } finally { await W.close() }
  }],
  16: ["the door card on two screens: the other player's screen shows the same fight, with both heroes out on the landing", async (port) => {
    const W = await world({ port }), A = await W.screen(FIFI, "Fifi"), B = await W.screen(KENTA, "Kenta")
    try {
      await wait(2500)
      check("the card comes up on the screen that opened the gate", await prisonerOpens(A, "key"))
      await pick(A, /^Go through — .* and the other hero/)
      check("the fight starts on Fifi's screen", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000))
      check("Kenta's screen shows it", await until(B, () => mode === "combat" && !!cbt, 30000))
      await wait(5000)
      const where = (pg) => pg.evaluate(() => ({ plate: String(cur), mode, mirror: !!FIGHT.mirror, closeUp: OV.on, heroes: party.map((p) => [p.id, Math.round(p.x), Math.round(p.y), outsidePen(p)]) }))
      const a = await where(A), b = await where(B); await shot(A, "16-fifi"); await shot(B, "16-kenta")
      check("on Fifi's screen both heroes are out on the landing, apart from each other", a.heroes.length === 2 && a.heroes.every((h) => h[3]) && Math.hypot(a.heroes[0][1] - a.heroes[1][1], a.heroes[0][2] - a.heroes[1][2]) > 12, a)
      check("on Kenta's screen too, on the pen plate", b.plate === "11" && b.heroes.length === 2 && b.heroes.every((h) => h[3]), b)
    } finally { await W.close() }
  }],
  15: ["unseen, one way out: the bridge is refused while the sneak holds, the cliff stairs are not", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await openGate(A); await wait(1200)
      const r = await A.evaluate(() => {
        window.__toasts = []; const t0 = toast; toast = (m, ...x) => { __toasts.push(String(m)); return t0(m, ...x) }
        const went = []; const w0 = whoGoes; whoGoes = (z, t) => { went.push(t) }
        const bridge = node.zones.find((z) => z.landing && z.to.includes(10)), stairs = node.zones.find((z) => z.landing && z.to.includes(12))
        sneak = { scout: leader, cur, rolls: [], seenBy: new Set(), line: "15" }
        const only = unseenWayOnly(); triggerZone(bridge); const afterBridge = went.slice(); triggerZone(stairs); const afterStairs = went.slice()
        sneak.seenBy.add(gateGuards()[0]); const looked = unseenWayOnly(); triggerZone(bridge); const afterLook = went.slice()   // a guard looked their way and did not spot them
        sneak = null; const seen = unseenWayOnly(); triggerZone(bridge); const afterSeen = went.slice()                              // spotted: the sneak is over
        whoGoes = w0
        return { only, afterBridge, afterStairs, looked, afterLook, seen, afterSeen, toasts: __toasts }
      })
      check("unseen: the bridge is refused and says why", r.only === true && r.afterBridge.length === 0 && r.toasts.some((t) => /cliff stairs/.test(t)), r)
      check("unseen: the cliff stairs take the party down", r.afterStairs.length === 1 && r.afterStairs[0] === 12, r)
      check("a guard who only looked their way changes nothing: still the stairs only", r.looked === true && r.afterLook.length === 1, r)
      check("once they are spotted (the sneak is over) the bridge is a way again", r.seen === false && r.afterSeen.length === 2 && r.afterSeen[1] === 10, r)
    } finally { await W.close() }
  }],
  21: ["the door, sneaking: the four rows; an ambush that is not heard surprises the drow and its leader strikes first", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the sneaking card comes up, not the plain one", await sneakOpens(A, "key"))
      const c = await card(A); await shot(A, "21-the-sneak-card")
      check("ambush, sneak past, change your mind — and nothing to grab when nothing was left", c.rows.length === 3 && /Attack the guards/.test(c.rows[0]) && /Sneak past them — to the Quaggoth Den/.test(c.rows[1]) && /Change your mind — leave it shut, but unlocked/.test(c.rows[2]), c)
      await pick(A, /Attack the guards/)
      check("she is asked who comes", await cardIs(A, /The ambush: who comes\?/))
      const w = await card(A); check("take everyone who will fight, or leave them, or step back", /Take everyone who will fight/.test(w.rows[0]) && /Leave them — just Fifi/.test(w.rows[1]) && /Step back/.test(w.rows[2]), w)
      await setDice(A, 20); await pick(A, /Leave them — just/)
      check("the fight starts", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000))
      await wait(1200); const f = await fightNow(A), first = await A.evaluate(() => cbt.order[0].id); await shot(A, "21-the-ambush")
      check("out on the landing, close-up up, same plate", f.heroesOut.every(Boolean) && f.closeUp && f.plate === "11" && f.moves === 0, f)
      check("the drow are surprised, and the one who led it goes first", f.foes.length > 0 && f.foes.every((x) => x[1]) && first === "freia", { f, first })
      check("the prisoners were left: none is in the fight", f.allies.length === 0, f)
    } finally { await W.close() }
  }],
  22: ["the door, sneaking: an ambush that is heard — everyone who fights comes, nobody is surprised", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the card comes up", await sneakOpens(A, "pick"))
      await pick(A, /Attack the guards/); await cardIs(A, /who comes/)
      await setDice(A, 1); await pick(A, /Take everyone who will fight/)
      check("the fight starts", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000))
      await wait(1200); const f = await fightNow(A)
      check("no drow is surprised", f.foes.length > 0 && f.foes.every((x) => !x[1]), f)
      check("the prisoners who fight are in it, out on the landing", f.allies.length > 0 && f.allies.every((x) => x[1]) && f.heroesOut.every(Boolean), f)
    } finally { await W.close() }
  }],
  23: ["the door, sneaking: past the watch unheard — down the cliff stairs to the Quaggoth Den, the prisoners with her", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the card comes up", await sneakOpens(A, "key"))
      await pick(A, /Sneak past them/)
      check("she is asked who comes", await cardIs(A, /Past the watch: who comes\?/))
      await setDice(A, 20); await pick(A, /^Take everyone$/)
      check("she arrives in the Quaggoth Den", await until(A, () => String(cur) === "12" && mode === "explore", 30000))
      const s = await A.evaluate(() => ({ plate: String(cur), fight: !!cbt, company: (state.company || []).length, told: __handoffs.filter((t) => /unseen by the drow on watch/.test(t)).length }))
      check("no fight, the prisoners came, and Malachar is told once", !s.fight && s.company > 0 && s.told === 1, s)
    } finally { await W.close() }
  }],
  24: ["the door, sneaking: caught slipping past — the fight on the landing, nobody surprised, nobody leaves the plate", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the card comes up", await sneakOpens(A, "key"))
      await pick(A, /Sneak past them/); await cardIs(A, /who comes/)
      await setDice(A, 1); await pick(A, /Leave them — just/)
      check("the fight starts", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000))
      await wait(1200); const f = await fightNow(A)
      check("on the pen plate, on the landing, and no drow is surprised", f.plate === "11" && f.moves === 0 && f.heroesOut.every(Boolean) && f.foes.length > 0 && f.foes.every((x) => !x[1]), f)
    } finally { await W.close() }
  }],
  25: ["the door, sneaking: something left by the bars — grab it and close the door; the next time there are three rows", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      check("the card comes up", await sneakOpens(A, "key", { left: true }))
      const c = await card(A); await shot(A, "25-left-by-someone")
      check("a fourth row: grab the dagger and close the door", c.rows.length === 4 && /Grab the dagger and close the door/.test(c.rows[3]), c)
      await pick(A, /Grab the dagger/); await wait(1800)
      const g = await A.evaluate(() => ({ has: carries(leader, "Dagger"), onFloor: floor.some((p) => p.name === "Dagger"), open: state.gateOpen, shut: state.doorShut, marked: !!state.gateLeftUnlocked, fight: !!cbt }))
      check("she has the dagger, the gate is shut and still unlocked, nobody fights", g.has && !g.onFloor && g.open && g.shut && g.marked && !g.fight, g)
      await A.evaluate(() => { $("dialog").hidden = true; $("obj").hidden = true; mode = "explore"; openInteract(doorGate()) })
      check("trying the gate again brings the sneaking card", await cardIs(A, /The pen gate, unseen/))
      const d = await card(A)
      check("only the first three rows now", d.rows.length === 3 && !d.rows.some((r) => /Grab/.test(r)), d)
      await pick(A, /Change your mind/); await wait(600)
      const l = await A.evaluate(() => ({ mode, open: state.gateOpen, shut: state.doorShut }))
      check("changing her mind leaves it shut, unlocked, and the game goes on", l.mode === "explore" && l.open && l.shut, l)
    } finally { await W.close() }
  }],
  26: ["the door, sneaking, two screens: the other player's hero is asked, comes, and both reach the Quaggoth Den", async (port) => {
    const W = await world({ port }), A = await W.screen(FIFI, "Fifi"), B = await W.screen(KENTA, "Kenta")
    try {
      await wait(2500)
      check("the card comes up", await sneakOpens(A, "key"))
      await setDice(A, 20); await setDice(B, 20)
      await pick(A, /Sneak past them/); await cardIs(A, /who comes/)
      const w = await A.evaluate(() => $("objText").textContent); check("the card says the other hero is asked", /Kenta is asked next/.test(w), w)
      await pick(A, /Leave them — just Fifi$/)
      check("Fifi's screen waits on Kenta", await cardIs(A, /Who is coming\?/))
      check("Kenta's screen asks him", await cardIs(B, /Fifi means to slip past the watch/))
      await shot(B, "26-kenta-is-asked"); await pick(B, /Go with Fifi/)
      check("Fifi reaches the Quaggoth Den", await until(A, () => String(cur) === "12" && mode === "explore", 40000))
      check("Kenta follows her there on his own screen", await until(B, () => String(cur) === "12" && mode === "explore", 40000))
      const s = await A.evaluate(() => ({ out: state.doorCall && state.doorCall.out, goers: state.doorCall && state.doorCall.goers, fight: !!cbt }))
      check("the call is settled: the den, both heroes, no fight", s.out === "den" && s.goers.length === 2 && !s.fight, s)
    } finally { await W.close() }
  }],
  27: ["the door, sneaking, two screens: the other hero stays — the ambush goes without him", async (port) => {
    const W = await world({ port }), A = await W.screen(FIFI, "Fifi"), B = await W.screen(KENTA, "Kenta")
    try {
      await wait(2500)
      check("the card comes up", await sneakOpens(A, "key"))
      await setDice(A, 20)
      await pick(A, /Attack the guards/); await cardIs(A, /who comes/); await pick(A, /Leave them — just Fifi$/)
      check("Kenta's screen asks him", await cardIs(B, /Fifi means to ambush the guards/))
      await pick(B, /Stay in the pen/)
      check("the fight starts on Fifi's screen", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 30000))
      await wait(1200)
      const f = await A.evaluate(() => ({ fifiOut: outsidePen(party.find((p) => p.id === "freia")), kentaOut: outsidePen(party.find((p) => p.id !== "freia")), goers: state.doorCall && state.doorCall.goers, surprised: foes.every((x) => x.c && x.c.conds.has("surprised")) }))
      check("Fifi is out on the landing, Kenta is still in the pen, the drow are surprised", f.fifiOut && !f.kentaOut && f.goers.length === 1 && f.surprised, f)
    } finally { await W.close() }
  }],
  10: ["the pen gate: walking out through it mid-fight, and being told when you cannot make it", async (port) => {
    // Sam, 2026-11-12: "Can't walk through this door. Maybe we need to redesign how the door and walking through it works"
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await penFight(A)
      check("it comes to Fifi's turn", await itsTurn(A, "freia"))
      await A.evaluate(() => { window.__toasts = []; const t0 = toast; toast = (m, ...x) => { __toasts.push(String(m)); return t0(m, ...x) } })
      const inside = (ft) => A.evaluate((ft) => { const a = activeActor(), B = balcony(), q = nearestWalkable(B.inside[0], B.inside[1] + 30); a.x = q.x; a.y = q.y; a.path = []; a.c.move = ft; __toasts.length = 0; openMenu(a) }, ft)
      const arm = () => A.evaluate(() => { [...$("cbtMenu").querySelectorAll("button")].find((b) => /^Move/.test((b.querySelector("span") || b).textContent.trim())).click() })
      const go = async (pt) => { await arm(); await wait(400); await A.evaluate((pt) => click(pt === "gate" ? (() => { const P = doorGate().interact.poly; return { x: P.reduce((n, q) => n + q[0], 0) / P.length, y: P.reduce((n, q) => n + q[1], 0) / P.length } })() : (() => { const B = balcony(); return { x: B.landing[0], y: B.landing[1] } })()), pt); await until(A, () => !combatBusy && !activeActor().path.length, 15000); await wait(400) }
      const now = () => A.evaluate(() => { const a = activeActor(); return { out: outsidePen(a), move: a.c.move, at: [Math.round(a.x), Math.round(a.y)], toasts: __toasts.slice(), ring: gateInReach(a) } })
      await inside(5); const before = await now()
      await wait(600); await shot(A, "10-ring-5ft")
      check("with 5 ft left the range ring does not promise the landing", before.ring === false, before)
      await go("landing"); const short = await now()
      check("5 ft left, a click on the landing: she stays where she is", !short.out && short.move === 5 && short.at[0] === before.at[0] && short.at[1] === before.at[1], short)
      check("and she is told why", short.toasts.some((t) => /Too far this turn/.test(t)), short.toasts)
      await inside(30); const can = await now()
      check("with 30 ft the ring shows the landing", can.ring === true, can)
      await go("landing"); const through = await now()
      check("30 ft, a click on the landing: she is through the gate", through.out, through)
      check("the gate charged nothing extra: at least 15 ft of her 30 is left", through.move >= 15, through)
      await inside(30); await go("gate"); const byGate = await now()
      check("a click on the open gate walks her out through it", byGate.out, byGate)
      await shot(A, "10-through-the-gate")
    } finally { await W.close() }
  }],
  1: ["the pen: a hero on the bridge foot when the fight is won", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await penFight(A)
      check("it comes to Fifi's turn", await itsTurn(A, "freia"))
      await setDown(A, "freia", 200, 520); await moveTo(A, ...BRIDGE_FOOT)
      const mid = await see(A); await shot(A, "1-on-the-bridge-foot-mid-fight")
      check("mid-fight she stands on the bridge foot and the screen is still the pen", mid.plate === "11" && mid.inDoorway === 1 && mid.fightLive, mid)
      await lastFoeDrops(A); await wait(7000)
      const after = await see(A); await shot(A, "1-after-the-fight")
      check("the fight is over and nobody crossed the bridge on their own", after.plate === "11" && !after.fightLive && after.mode === "explore" && !after.moves.length, after)
      // the doorway is not dead: walking out to it afterwards crosses, as it always has
      await A.evaluate(([x, y]) => { for (const n of npcs) n.talk = false; state.ambushOff = true; walkTo(nearestWalkable(x, y)) }, BRIDGE_FOOT)
      check("walking out to the bridge afterwards crosses to the Guard Tower", await until(A, () => String(cur) === "10" && mode === "explore", 40000), await see(A))
    } finally { await W.close() }
  }],
  2: ["the Guard Tower: back into the doorway mid-fight", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      // over the bridge from the pen, a few steps into the tower, and the watch there sees her (the game's own path:
      // /api/walk-spotted raises the flag, the screen opens the fight it finds on it)
      await A.evaluate(() => { state.wardBroken = true; state.ambushOff = true; state.cleared[cur] = true; unlockGate(); for (const n of npcs) n.talk = false })
      await wait(1500); await A.evaluate(() => { travel(10, node.zones[1]) })   // the crossing itself, as the gate's "To Guard Tower" row makes it
      await until(A, () => String(cur) === "10" && mode === "explore" && !leader.walkIn && !leader.path.length, 40000)
      await A.evaluate(() => walkTo(nearestWalkable(2230, 850)))
      check("she walks in from the bridge, out of the doorway", await until(A, () => !leader.path.length && !zoneAt(leader.x, leader.y) && ackZone === null, 15000), await see(A))
      await A.evaluate(() => { state.ambushOff = false })
      // seen walking in openly, the watch may challenge first ("Down on your knees"): the answer is Fight
      for (let k = 0; k < 20 && !(await A.evaluate(() => mode === "combat" && !!cbt && cbt.order.length > 0)); k++) {
        await A.evaluate(() => { const b = !$("obj").hidden && [...$("objBtns").querySelectorAll("button")].find((b) => /^Fight/.test(b.textContent.trim())); if (b) b.click() }); await wait(1500) }
      if (!(await A.evaluate(() => mode === "combat"))) await A.evaluate(() => { guardsAlarm = null; guardsReact(guardsOnPlate()[0], leader, "where they should not be") })
      check("the tower's guards attack", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 15000), await see(A)); await sturdy(A)
      check("it comes to Fifi's turn", await itsTurn(A, "freia"))
      await setDown(A, "freia", 2230, 850); await moveTo(A, 2380, 840)
      const mid = await see(A); await shot(A, "2-back-in-the-doorway-mid-fight")
      check("mid-fight she is back in the doorway to the bridge and the screen is still the tower", mid.plate === "10" && mid.inDoorway === 1 && mid.fightLive, mid)
      await lastFoeDrops(A); await wait(7000)
      const after = await see(A); await shot(A, "2-after-the-fight")
      check("the fight is over and the screen did not pan back to the pen", after.plate === "10" && !after.fightLive && after.mode === "explore" && after.moves.length === 1, after)   // 1: her own arrival
      // a click on the doorway she is standing in, on a bare bit of it. A click on a body or a bystander is theirs (the
      // body's loot, a word with the prisoner), so the dead and the prisoners crowding the doorway are set aside first;
      // and the pen's posts stand empty, so nobody shoots at her as she comes back over the bridge.
      await A.evaluate(() => { storyWatch = { state: "unattended", since: "2026-01-01T00:00:00.000Z" }
        for (const n of npcs) { n.x -= 900; n.path = [] }
        const [x0, y0, x1, y1] = node.zones[1].rect
        for (let y = y0 + 8; y < y1; y += 12) for (let x = x0 + 8; x < x1; x += 12) if (!hitActor(npcs, { x, y }) && !hitActor(party, { x, y }) && !pileAt({ x, y })) { click({ x, y }); return } })
      check("clicking the doorway she stands in takes it", await until(A, () => String(cur) === "11" && mode !== "travel", 20000), await see(A))
    } finally { await W.close() }
  }],
  3: ["two cards up at once mid-fight", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await penFight(A); check("it comes to Fifi's turn", await itsTurn(A, "freia"))
      await setDown(A, "freia", 200, 520); await moveTo(A, ...BRIDGE_FOOT)
      // the page's own card, twice, the second before the first is answered; then the one on top is answered
      await A.evaluate(() => { showDialog({ title: "First card", body: "", buttons: [{ label: "Yes" }] }); showDialog({ title: "Second card", body: "", buttons: [{ label: "Yes" }] }); $("dlgBtns").querySelector("button").click() })
      await wait(6000)
      const s = await see(A); await shot(A, "3-two-cards")
      check("the fight is still the fight and the screen is still the pen", s.plate === "11" && s.fightLive && s.mode === "combat" && !s.moves.length, s)
    } finally { await W.close() }
  }],
  4: ["a door asked for mid-fight; a drow who retreats", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await penFight(A); check("it comes to Fifi's turn", await itsTurn(A, "freia"))
      await setDown(A, "freia", 200, 520); await moveTo(A, ...BRIDGE_FOOT)
      await A.evaluate(() => { whoGoes(node.zones[1], 10) })                   // what a door card left open from before the fight would call
      await wait(6000)
      const s = await see(A)
      check("the door is refused: still the pen, still the fight", s.plate === "11" && s.fightLive && s.mode === "combat" && !s.moves.length, s)
      // a foe falls back off the plate (leaveFight / fleeTo, PR #1258): it goes, the world remembers where, nobody's view moves
      const n0 = await A.evaluate(() => { const f = standing(foes)[0]; window.__gone = f; leaveFight(f, 10); return foes.length })
      await wait(2500)
      const r = await A.evaluate(() => ({ foes: foes.length, stillOn: actors.includes(__gone), refuge: Object.values(state.refuge || {}).map((x) => x.plate) }))
      const s2 = await see(A)
      check("a drow who retreats is gone to the next plate, and the view stays", r.foes === n0 - 1 && !r.stillOn && r.refuge.includes("10") && s2.plate === "11" && !s2.moves.length, { r, plate: s2.plate })
    } finally { await W.close() }
  }],
  5: ["fights not shared (503): the other screen's copy ends first", async (port) => {
    const W = await world({ port, lane: false }), A = await W.screen(FIFI, "Fifi"), B = await W.screen(KENTA, "Kenta")
    try {
      await wait(3000); await openGate(A); await wait(2500)
      for (const pg of [A, B]) await pg.evaluate(() => { for (const n of npcs) n.talk = false; if (mode === "talk") closeTalk(false) })
      await setDown(A, "freia", 430, 640)                                      // out on the landing; the watch sees her
      for (let k = 0; k < 8 && !W.server.flag(); k++) { await A.evaluate(() => { if (mode === "talk") closeTalk(false); guardsAlarm = null; guardsReact(gateGuards()[0], leader, "out of the pen") }); await wait(1500) }
      const both = (await until(A, () => mode === "combat" && cbt && cbt.fromFlag, 30000)) && (await until(B, () => mode === "combat" && cbt && cbt.fromFlag, 30000))
      check("each screen opens its own copy of the fight from the flag", both && !(await A.evaluate(() => FIGHT.mirror)) && !(await B.evaluate(() => FIGHT.mirror)), { flag: !!W.server.flag(), a: await A.evaluate(() => mode), b: await B.evaluate(() => mode) })
      await sturdy(A); await sturdy(B)
      check("it comes to Fifi's turn on her own screen", await itsTurn(A, "freia", 240000))
      await setDown(A, "freia", 200, 520); await moveTo(A, ...BRIDGE_FOOT)
      const mid = await see(A)
      check("Fifi is on the bridge foot, mid-fight, drow still standing on her screen", mid.plate === "11" && mid.inDoorway === 1 && mid.fightLive && (await A.evaluate(() => standing(foes).length)) > 0, mid)
      await lastFoeDrops(B)                                                    // Kenta's copy is won; his screen takes the flag down
      await wait(12000)
      const a = await see(A), b = await see(B); await shot(A, "5-fifi-after-the-other-copy-ended")
      check("Fifi's screen is still the pen", a.plate === "11" && !a.moves.length, a)
      check("Kenta's screen is still the pen", b.plate === "11" && !b.moves.length, b)
    } finally { await W.close() }
  }],
  6: ["one fight shared: the mirror's hero in the doorway when it ends", async (port) => {
    const W = await world({ port }), A = await W.screen(FIFI, "Fifi"), B = await W.screen(KENTA, "Kenta")
    try {
      await wait(3000); await penFight(A)
      check("Kenta's screen shows Fifi's fight", await until(B, () => FIGHT.mirror && mode === "combat", 15000))
      await setDown(A, "kenta", ...BRIDGE_FOOT)                                // where his Move would have taken him, on the screen that runs the fight
      check("his hero stands on the bridge foot on his own screen", await until(B, () => { const k = party.find((p) => p.id === "kenta"), z = k && zoneAt(k.x, k.y); return !!z && node.zones.indexOf(z) === 1 && !k.path.length }, 15000), await see(B))
      await lastFoeDrops(A); await wait(8000)
      const a = await see(A), b = await see(B); await shot(B, "6-kenta-after-the-fight")
      check("the fight is over on both screens", !a.fightLive && !b.fightLive && !b.mirror && a.mode === "explore" && b.mode === "explore", { a: a.mode, b: b.mode })
      check("Kenta's screen is still the pen", b.plate === "11" && !b.moves.length, b)
      check("Fifi's screen is still the pen", a.plate === "11" && !a.moves.length, a)
    } finally { await W.close() }
  }],
  7: ["the party's move arrives mid-fight with a card up: it waits, then is taken", (port) => partyMoves(port, false)],
  8: ["the party's move arrives mid-fight with a card up: dropped when they have come back", (port) => partyMoves(port, true)],
  9: ["no fight: out of the open gate and over the bridge, Follow on and off", async (port) => {
    for (const follow of [true, false]) {
      // both heroes are seated but only Fifi's player is at the table, so her screen walks Kenta too (One World's driverOf)
      const W = await world({ port: port + (follow ? 0 : 1), watchAway: true }), A = await W.screen(FIFI, "Fifi")
      try {
        await wait(4000)
        await A.evaluate((follow) => { state.wardBroken = true; unlockGate(); state.ambushOff = true; for (const n of npcs) n.talk = false; setFollow(follow) }, follow)
        await wait(1500)
        const n = await A.evaluate(() => party.length)
        await A.evaluate(([x, y]) => walkTo(nearestWalkable(x, y)), BRIDGE_FOOT)   // out through the open gate, round the pillar, onto the bridge
        const over = await until(A, () => String(cur) === "10" && mode === "explore", 40000); await wait(3000)
        const s = await see(A)
        check(`Follow ${follow ? "ON: the whole party crosses" : "OFF: the leader crosses alone"}`, over && n === 2 && s.plate === "10" && s.party.length === (follow ? 2 : 1) && s.moves.length === 1 && !s.moves[0].fightLive, { over, n, ...s })
      } finally { await W.close() }
    }
  }],
  // THE ROPE THROUGH THE BARS (Sam, 2026-11-12: "Rope should be an option to strangle a nearby leaning guard")
  18: ["the rope: unseen, three holds, the guard lies dead by the gate and the key comes away", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await wait(2500)
      const s = await ropeScene(A, { stealth: 40, rolls: [true, true, true], watch: 1 })
      check("without silk rope in hand the row is not offered", s.without === false && s.lean === "leaning", s)
      check("with the rope, sneaking, beside the leaning guard: the row is offered", s.offered === true, s)
      await until(A, () => !strangling && npcs.some((m) => m.strangled), 20000); await wait(1500)
      const r = await A.evaluate(() => { const n = npcs.find((m) => m.strangled); return { dead: !!(n && n.down), atBars: !!(n && n.atBars), mode, fight: !!cbt, gateOpen: !!state.gateOpen, key: !!state.penKey, sneaking: !!sneak, asked: __asked.slice(), told: __handoffs.length, stillGuard: gateGuards().some((g) => g === n) } })
      await shot(A, "18-dead-by-the-gate")
      check("three holds were rolled: the grab at advantage, then two plain", r.asked.length === 3 && r.asked[0][0] === "strangle:grab" && r.asked[0][1] === true && r.asked[1][0] === "strangle:hold" && r.asked[1][1] === false, r.asked)
      check("he is dead at the bars and no longer counts as a guard on the gate", r.dead && r.atBars && !r.stillGuard, r)
      check("nobody saw: no fight, the gate still shut, the hero still hidden", r.mode === "explore" && !r.fight && !r.gateOpen && r.sneaking, r)
      check("the key is in the strangler's hand, and Malachar is told once", r.key && r.told === 1, r)
    } finally { await W.close() }
  }],
  19: ["the rope: the watch sees it — the gate opens, the drow come in, the fight is in the pen", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await wait(2500)
      const s = await ropeScene(A, { stealth: 15, rolls: [true, true, true], watch: 20 })
      check("the fight starts", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000), s)
      const r = await A.evaluate(() => ({ plate: String(cur), gateOpen: !!state.gateOpen && !state.doorShut, asked: __asked.length, foes: foes.map((f) => [f.id, outsidePen(f), !!f.down]), heroIn: party.every((p) => !outsidePen(p)), sneaking: !!sneak }))
      await shot(A, "19-the-drow-come-in")
      check("seen on the first hold: one roll, the gate open, the sneak over", r.asked === 1 && r.gateOpen && !r.sneaking, r)
      check("every drow in the fight is inside the pen, the leaning guard alive among them, the hero too", r.plate === "11" && r.foes.length >= 2 && r.foes.every((f) => !f[1] && !f[2]) && r.heroIn, r)
    } finally { await W.close() }
  }],
  20: ["the rope: a failed hold — he tears free and it is the same fight", async (port) => {
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await wait(2500)
      const s = await ropeScene(A, { stealth: 40, rolls: [true, false], watch: 1 })
      check("the fight starts", await until(A, () => mode === "combat" && cbt && cbt.order.length > 0, 20000), s)
      const r = await A.evaluate(() => ({ asked: __asked.length, dead: npcs.some((m) => m.strangled), foes: foes.map((f) => [f.id, outsidePen(f)]), gateOpen: !!state.gateOpen }))
      check("two rolls, nobody dead, the gate open and the drow inside", r.asked === 2 && !r.dead && r.gateOpen && r.foes.length >= 2 && r.foes.every((f) => !f[1]), r)
    } finally { await W.close() }
  }],
  17: ["nobody comes through a shut gate: a prisoner on her way out when it closes stays in the pen", async (port) => {
    // Sam, 2026-11-12: "how did Eldeth jump through a closed door"
    const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
    try {
      await openGate(A); await wait(1200)
      const planned = await A.evaluate(() => { const e = npcs.find((n) => n.id === "eldeth"), B = balcony(); stopActivity(e); e.actUntil = now + 60000
        e.path = findPath(e, { x: B.landing[0], y: B.landing[1] }); return { steps: e.path.length, out: outsidePen(e) } })
      check("with the gate open she has a way out through it", planned.steps > 0 && !planned.out, planned)
      await A.evaluate(() => { state.doorShut = true; setDoor(false); buildGrid() })           // the gate is shut while she is still walking to it
      await until(A, () => { const e = npcs.find((n) => n.id === "eldeth"); return !e.path.length }, 30000); await wait(800)
      const shut = await A.evaluate(() => { const e = npcs.find((n) => n.id === "eldeth"), B = balcony(); return { out: onBalcony(e) || Math.hypot(e.x - B.landing[0], e.y - B.landing[1]) < 40, alpha: +e.alpha.toFixed(2), at: [Math.round(e.x), Math.round(e.y)] } })
      check("the gate shut on the way: she is still inside, in plain view", !shut.out && shut.alpha > .9, shut)
      await A.evaluate(() => { state.doorShut = false; setDoor(true); buildGrid(); const e = npcs.find((n) => n.id === "eldeth"), B = balcony(); e.actUntil = now + 60000; e.path = findPath(e, { x: B.landing[0], y: B.landing[1] }) })
      check("open again, she walks out through it as before", await until(A, () => { const e = npcs.find((n) => n.id === "eldeth"); return onBalcony(e) && !e.path.length }, 30000))
    } finally { await W.close() }
  }],
}
// 7 and 8: one screen, mid-fight, a reaction-style card open on it; ANOTHER screen's whole party move (pen -> Guard
// Tower by the bridge) reaches it through the shared world. It must wait for the fight. Then either the party is still
// over there when the fight ends (this screen goes after them), or it has come back (nothing to follow: stay).
async function partyMoves(port, comesBack) {
  const W = await world({ port, seats: [FIFI] }), A = await W.screen(FIFI, "Fifi")
  try {
    await penFight(A); check("it comes to Fifi's turn", await itsTurn(A, "freia"))
    await A.evaluate(() => showDialog({ title: "A card mid-fight", body: "", buttons: [{ label: "Yes" }] }))
    W.server.apply({ travel: { seq: Date.now(), from: "11", to: "10", zone: 1 }, plate: "10" }, "dm")
    await wait(8000)
    const mid = await see(A); await shot(A, `${comesBack ? 8 : 7}-card-up-party-moved`)
    check("mid-fight, card up, the party's move does not take this screen", mid.plate === "11" && mid.fightLive && !mid.moves.length, mid)
    if (comesBack) { W.server.apply({ travel: { seq: Date.now(), from: "10", to: "11", zone: 1 }, plate: "11" }, "dm"); await wait(5000) }
    await A.evaluate(() => { $("dlgBtns").querySelector("button").click() }); await wait(500)
    await lastFoeDrops(A); await wait(12000)
    const after = await see(A)
    if (comesBack) check("the party came back before the fight ended: this screen stays in the pen", after.plate === "11" && !after.moves.length, after)
    else check("the fight over, this screen goes after the party", after.plate === "10" && after.moves.length === 1 && !after.moves[0].fightLive, after)
  } finally { await W.close() }
}

let i = 0
for (const [n, [name, run]] of Object.entries(SCENARIOS)) {
  if (ONLY && !ONLY.includes(+n)) continue
  scenario = n; console.log(`\n— ${n}. ${name}`)
  try { await run(PORT0 + 2 * i++) } catch (e) { check("the scenario ran to its end", false, String(e && e.stack || e).slice(0, 400)) }
}
await browser.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
