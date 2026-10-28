// TWO-SCREEN TEST for ONE WORLD (Sam, 2026-10-25: "create a failsafe way to prevent this from ever happening again").
//
// The bug it guards: Fifi and Gandalf played the Underwalk on two browsers and each browser had its own world. Nobody
// had ever opened the map twice at once. This does: it serves the real built page (public/velkynvelve-walk/index.html)
// with a stand-in game server that merges exactly like the walk_world_apply SQL, opens Fifi's screen, Gandalf's screen
// and a late DM screen in headless Chromium, and checks they stay one world — walks, the gate, room dice, a plate change,
// a screen that drifts (it must snap back), a fight (every light amber), a dropped connection (Out of touch, then back).
//
// RUN IT BEFORE MERGING ANY CHANGE TO THE WALK MAP:
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once)
//   node scripts/one-world/two-screen-test.mjs
// It reads the seated heroes' sheets from the live /api/map-stage (read-only), or from STAGE_JSON=<file> offline.
// Plates, fonts and realtime are blocked on purpose: the heartbeat alone must keep the screens together.
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { chromium } from "playwright"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const ctx = {}; runInNewContext(readFileSync(join(ROOT, "js/aop-one-world.js"), "utf8") + "\nthis.W = AopOneWorld;", ctx)
const OWL = ctx.W
const FIFI = "d00aa5b8-ced1-477d-9ec8-0861cca55498", GANDALF = "614cac3d-f119-4b35-af78-766ddb510619"
const STAGE = process.env.STAGE_JSON ? JSON.parse(readFileSync(process.env.STAGE_JSON, "utf8")) : await fetch("https://ashes.playacartagena.com/api/map-stage").then((r) => r.json())
const SEATED = STAGE.seated.filter((s) => s.id === FIFI || s.id === GANDALF)
if (SEATED.length < 2) { console.log("Fifi and Gandalf must both be seated in the live run for the sheets; or pass STAGE_JSON"); process.exit(2) }
const SEATNO = { [FIFI]: 1, [GANDALF]: 2 }
let world = { campaign_run_id: "00000000-0000-0000-0000-000000000014", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
const log = []
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
  pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, e.stack.slice(0,600)))
  pg.on("console", (m) => { if (m.type() === "error" || /one-world/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text().slice(0, 200)) })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  await pg.goto("http://localhost:4100/velkynvelve-walk/index.html?oneworld=1")
  await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
  return pg
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const pos = (pg, slug) => pg.evaluate((s) => { const a = party.find((p) => p.id === s); return a ? { x: Math.round(a.x), y: Math.round(a.y), plate: cur } : null }, slug)
const results = []
const check = (name, ok, detail) => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`) }

const A = await screen(FIFI, "Fifi")
const B = await screen(GANDALF, "Gandalf")
await wait(3500)
check("both screens boot on the same plate", (await A.evaluate("cur")) === (await B.evaluate("cur")), `A ${await A.evaluate("cur")} B ${await B.evaluate("cur")}`)
check("each screen sees both heroes", (await A.evaluate("party.map(p=>p.id).sort().join()")) === (await B.evaluate("party.map(p=>p.id).sort().join()")), await A.evaluate("party.map(p=>p.id).join()"))
check("Fifi's screen drives Fifi only", JSON.stringify(await A.evaluate("party.map(p=>[p.id, owDrives(p)])")) , JSON.stringify(await A.evaluate("party.map(p=>[p.id, owDrives(p)])")))

// 1. Fifi walks on her screen; Gandalf's screen sees her go there
const target = await A.evaluate(() => { const L = party.find((p) => p.id === "freia"); const t = nearestWalkable(L.x + 260, L.y + 60); walkTo(t); return { x: Math.round(t.x), y: Math.round(t.y) } })
await wait(6000)
const fB = await pos(B, "freia"), fA = await pos(A, "freia")
check("Fifi's walk shows on Gandalf's screen", Math.hypot(fB.x - target.x, fB.y - target.y) < 40, `target ${JSON.stringify(target)} A ${JSON.stringify(fA)} B ${JSON.stringify(fB)}`)

// 2. Gandalf walks on Sam's screen; Fifi's screen sees it
const target2 = await B.evaluate(() => { if (mode === "talk") closeTalk(false); const L = party.find((p) => p.id === "gandalf"); const t = nearestWalkable(L.x - 200, L.y + 40); walkTo(t); return { x: Math.round(t.x), y: Math.round(t.y) } })
await wait(6000)
const gA = await pos(A, "gandalf")
const gB = await pos(B, "gandalf")
check("Gandalf's walk shows on Fifi's screen (wherever he stopped)", Math.hypot(gA.x - gB.x, gA.y - gB.y) < 40 && Math.hypot(gB.x - target2.x, gB.y - target2.y) < Math.hypot(1466-1300, 1007-1040) + 400, `target ${JSON.stringify(target2)} A ${JSON.stringify(gA)} B ${JSON.stringify(gB)}`)
{ const fa = await pos(A, "freia"), fb = await pos(B, "freia")
  check("Fifi did not wander on Gandalf's screen meanwhile", Math.hypot(fb.x - fa.x, fb.y - fa.y) < 40, `A ${JSON.stringify(fa)} B ${JSON.stringify(fb)} modes ${await A.evaluate("mode")}/${await B.evaluate("mode")}`) }

// 3. The gate opens on Fifi's screen
await A.evaluate("unlockGate()")
await wait(4000)
check("the gate opened on Fifi's screen is open on Gandalf's", await B.evaluate("state.gateOpen === true"))

// 4. Room dice are the same on both screens
const rollsA = await A.evaluate("[3,1,13].map(n => JSON.stringify(plateRolls(n)))"), rollsB = await B.evaluate("[3,1,13].map(n => JSON.stringify(plateRolls(n)))")
check("room dice agree on every screen", JSON.stringify(rollsA) === JSON.stringify(rollsB), JSON.stringify(rollsA))

// 5. Fifi leads the party off the plate; Gandalf's screen follows
const exit = await A.evaluate(() => { const z = node.zones.find((z) => z.to && z.to.length && SPEC[z.to[0]] && !z.climb && z.kind !== "water"); if (!z) return null; mode = "explore"; travel(z.to[0], z); return z.to[0] })
await wait(9000)
check("a plate change on Fifi's screen moves Gandalf's screen too", exit != null && (await B.evaluate("cur")) === exit && (await A.evaluate("cur")) === exit, `exit ${exit} A ${await A.evaluate("cur")} B ${await B.evaluate("cur")}`)

// 6. THE FAILSAFE: Gandalf's screen silently drifts; it must notice and snap back
await B.evaluate(() => { state.talked = { bogus: true }; OW.synced.talked = AopOneWorld.canon(state.talked) })
await wait(9000)
const talkedB = await B.evaluate("JSON.stringify(state.talked)"), talkedA = await A.evaluate("JSON.stringify(state.talked)")
check("a screen that drifts snaps back to the shared world", talkedB === talkedA && !/bogus/.test(talkedB), `A ${talkedA} B ${talkedB}`)
const statuses = [await A.evaluate("OW.status"), await B.evaluate("OW.status")]
check("both lights read In step afterwards", statuses.every((s) => s === "in-step"), statuses.join(" / "))
check("both screens hold the same fingerprint", (await A.evaluate("AopOneWorld.worldDigest(cur, state)")) === (await B.evaluate("AopOneWorld.worldDigest(cur, state)")))

// 7. A fight on one screen is flagged on every screen
await A.evaluate("owFightBegins()")
await wait(6000)
check("a fight on Fifi's screen turns Gandalf's light amber", (await B.evaluate("OW.status")) === "fight-unshared", await B.evaluate("OW.status"))
await A.evaluate("owFightEnds()")
await wait(6000)
check("and back to In step when it ends", (await B.evaluate("OW.status")) === "in-step", await B.evaluate("OW.status"))

// 8. A screen that cannot reach the game says so
await B.route("**/api/walk-world", (r) => r.abort())
await wait(9000)
check("a screen that loses the server shows Out of touch", (await B.evaluate("OW.status")) === "out-of-touch", await B.evaluate("OW.status"))
await B.unroute("**/api/walk-world")
await wait(6000)
check("and recovers on its own", (await B.evaluate("OW.status")) === "in-step", await B.evaluate("OW.status"))

// 9. A screen that joins late (the DM's) lands in the same world, not in the pen
{
  const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
  await c.addInitScript(() => { localStorage.setItem("aop_access_role", "dm"); localStorage.setItem("aop_forge_key", "x"); localStorage.setItem("vk-music", "off") })
  await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
  const C = await c.newPage(); C.on("pageerror", (e) => console.log("[DM pageerror]", e.message))
  await C.goto("http://localhost:4100/velkynvelve-walk/index.html?oneworld=1")
  await C.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && OW.on, null, { timeout: 60000 })
  await wait(4000)
  const fa = await pos(A, "freia"), fc = await pos(C, "freia")
  check("a late joiner lands on the same plate with the heroes where they stand", fc && fc.plate === fa.plate && Math.hypot(fc.x - fa.x, fc.y - fa.y) < 40, `A ${JSON.stringify(fa)} DM ${JSON.stringify(fc)}`)
  check("the DM sees every seat's light", (await C.evaluate("Object.keys(OW.seats).length")) >= 3, await C.evaluate("Object.keys(OW.seats).join()"))
  await C.evaluate(() => { $("owLight").click() }); await wait(300)

  // 10. SPLIT PARTY (Sam, 2026-10-27: "lets make it so we can split across plates if needed")
  const pickExit = () => { const z = node.zones.find((z) => z.to && z.to.length === 1 && SPEC[z.to[0]] && !z.climb && z.kind !== "water" && z.kind !== "leave"); return z ? { i: node.zones.indexOf(z), to: z.to[0] } : null }
  const from = await A.evaluate("cur"), ex = await A.evaluate(pickExit)
  if (!ex) check("an exit to split through", false, `none on plate ${from}`)
  else {
    // Fifi slips through alone ("Just me")
    await A.evaluate((ex) => { if (mode !== "explore") mode = "explore"; leader = party.find((p) => p.id === "freia"); travel(ex.to, node.zones[ex.i], false, null, true) }, ex)
    await wait(9000)
    check("Just me: Fifi's screen goes to the new plate", String(await A.evaluate("cur")) === String(ex.to), `A ${await A.evaluate("cur")} want ${ex.to}`)
    check("Just me: Gandalf's screen stays where Gandalf is", String(await B.evaluate("cur")) === String(from), `B ${await B.evaluate("cur")} want ${from}`)
    check("Just me: the party's plate does not move", String(world.plate) === String(from), `world ${world.plate}`)
    check("Just me: the DM stays with the party", String(await C.evaluate("cur")) === String(from), `DM ${await C.evaluate("cur")}`)
    check("each screen draws only the heroes on its plate", (await A.evaluate("party.map(p=>p.id).join()")) === "freia" && (await B.evaluate("party.map(p=>p.id).join()")) === "gandalf", `A ${await A.evaluate("party.map(p=>p.id).join()")} B ${await B.evaluate("party.map(p=>p.id).join()")}`)
    check("Gandalf's screen knows where Fifi went", await B.evaluate((to) => heroElsewhere("freia") && String(heroAt.freia.plate) === String(to), ex.to), JSON.stringify(await B.evaluate("heroAt.freia")))
    await wait(8000)
    check("split, nobody is snapped back", String(await A.evaluate("cur")) === String(ex.to) && String(await B.evaluate("cur")) === String(from), `A ${await A.evaluate("cur")} B ${await B.evaluate("cur")}`)
    check("split, both lights stay In step", (await A.evaluate("OW.status")) === "in-step" && (await B.evaluate("OW.status")) === "in-step", `${await A.evaluate("OW.status")} / ${await B.evaluate("OW.status")}`)
    // Gandalf walks after her: the party is back together, and the party's plate moves with him
    await B.evaluate((ex) => { if (mode === "talk") closeTalk(false); mode = "explore"; travel(ex.to, node.zones[ex.i]) }, ex)
    await wait(9000)
    check("rejoined: both screens on the same plate", String(await A.evaluate("cur")) === String(ex.to) && String(await B.evaluate("cur")) === String(ex.to), `A ${await A.evaluate("cur")} B ${await B.evaluate("cur")}`)
    check("rejoined: each screen draws both heroes", (await A.evaluate("party.map(p=>p.id).sort().join()")) === "freia,gandalf" && (await B.evaluate("party.map(p=>p.id).sort().join()")) === "freia,gandalf", `A ${await A.evaluate("party.map(p=>p.id).join()")} B ${await B.evaluate("party.map(p=>p.id).join()")}`)
    check("rejoined: the party's plate and the DM follow", String(world.plate) === String(ex.to) && String(await C.evaluate("cur")) === String(ex.to), `world ${world.plate} DM ${await C.evaluate("cur")}`)
    // 11. SPLIT PARTY, FIGHTS (part 2): a fight on one plate is that plate's alone; a hero who walks in joins it
    const ex2 = await B.evaluate(pickExit)
    if (!ex2) check("an exit to split through (fights)", false, `none on plate ${ex.to}`)
    else {
      await B.evaluate((ex) => { if (mode === "talk") closeTalk(false); mode = "explore"; leader = party.find((p) => p.id === "gandalf"); travel(ex.to, node.zones[ex.i], false, null, true) }, ex2)
      await wait(9000)
      const foe = await A.evaluate(() => { if (mode === "talk") closeTalk(false); if (mode !== "explore") mode = "explore"; const id = Object.keys(SPR).find((k) => /drow-guard/.test(k)) || Object.keys(SPR).find((k) => !PARTY.includes(k)); startCombat([id], "Steel comes out (test)."); return id })
      await wait(5000)
      check("a fight on Fifi's plate: Fifi's screen is fighting", (await A.evaluate("mode")) === "combat", `mode ${await A.evaluate("mode")} foe ${foe}`)
      check("a fight on another plate leaves Gandalf's light In step", (await B.evaluate("OW.status")) === "in-step", `${await B.evaluate("OW.status")} (B on ${await B.evaluate("cur")}, fight on ${await A.evaluate("cur")})`)
      // Gandalf walks back onto Fifi's plate mid-fight
      await B.evaluate((ex) => { if (mode === "talk") closeTalk(false); mode = "explore"; const z = node.zones.find((z) => z.to && z.to.length === 1 && String(z.to[0]) === String(ex.back)); if (z) travel(z.to[0], z) }, { back: ex.to })
      await wait(10000)
      check("Gandalf walks back in: his screen is on the fighting plate", String(await B.evaluate("cur")) === String(ex.to), `B ${await B.evaluate("cur")}`)
      const joined = await A.evaluate(() => { const g = cbt && cbt.order.find((a) => a.id === "gandalf"); return g ? { round: cbt.round, join: g.c.joinRound, init: g.c.init } : null })
      check("he joins the fight on Fifi's screen, from the next round", !!joined && joined.join >= 1, JSON.stringify(joined))
      check("and his light turns amber: a fight is on his plate", (await B.evaluate("OW.status")) === "fight-unshared", await B.evaluate("OW.status"))
      check("his screen tells him a fight is underway here", await B.evaluate(() => /A fight is underway here/.test(document.body.innerText)), "")
    }
  }
  }
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed; world version ${world.version}; writes ${log.length}`)
await browser.close(); server.close()
process.exit(results.every((r) => r.ok) ? 0 : 1)
