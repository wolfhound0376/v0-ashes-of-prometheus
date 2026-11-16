// GATHER THE PARTY — the headless test (Sam, 2026-11-15: "should not permit battles or movement of plates until all
// players are in sync"). Two screens at one table:
//   1. both in step: the party's move goes at once, no voyage card.
//   2. the other screen goes quiet (a refresh, a closed lid): the move waits on the voyage card, the world on this
//      screen stands still, and it goes the moment the other screen is back in step.
//   3. a fight asked for while the other screen is away waits the same way.
//   4. after 20 s the waiting screen may go without them.
//   npm i --no-save playwright@1.48.2 && npx playwright install chromium     (once)
//   node scripts/one-world/gather-test.mjs        (first two heroes seated in the live run; STAGE_JSON=<file> offline)
import http from "node:http"
import { readFileSync, existsSync, statSync } from "node:fs"
import { join, extname, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { runInNewContext } from "node:vm"
import { chromium } from "playwright"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public")
const ctx = {}; runInNewContext(readFileSync(join(ROOT, "js/aop-one-world.js"), "utf8") + "\nthis.W = AopOneWorld;", ctx)
const OWL = ctx.W
const STAGE = process.env.STAGE_JSON ? JSON.parse(readFileSync(process.env.STAGE_JSON, "utf8")) : await fetch("https://ashes.playacartagena.com/api/map-stage").then((r) => r.json())
if (!STAGE.seated || STAGE.seated.length < 2) { console.log("two heroes must be seated in the live run; or pass STAGE_JSON"); process.exit(2) }
const [ONE, TWO] = STAGE.seated.slice(0, 2).map((s) => s.id)
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".css": "text/css" }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {})

async function world(port) {
  const SEATED = STAGE.seated.filter((s) => s.id === ONE || s.id === TWO), SEATNO = { [ONE]: 1, [TWO]: 2 }
  let w = { campaign_run_id: "00000000-0000-0000-0000-000000000015", version: 0, plate: null, state: {}, heroes: {}, travel: null, seats: {} }
  const pages = [], away = new Set()   // a window in the background: its seat stops being refreshed (the browser throttles its heartbeat) while realtime still brings it the world
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
    if (p === "/api/map-stage") return send({ run: 15, seated: SEATED, present: [], gone: [], npcLanguages: {}, watch: { state: "unattended", since: "2026-01-01T00:00:00.000Z" } })
    if (p === "/api/world-flags") return send({ flags: [] })
    if (p === "/api/walk-fight") return send({ error: 'relation "public.walk_fights" does not exist' }, 503)
    if (p === "/api/walk-world") {
      if (req.method === "GET") return send(answer(w, { world: w, realtime: null }))
      const who = j.characterId || "dm"
      if (j.op === "beat") {
        if (away.has(who)) { const x = JSON.parse(JSON.stringify(w)); return send(answer(x, { world: x })) }
        const x = apply({ seats: { [who]: { at: Date.now(), slug: j.slug, cid: who === "dm" ? null : who, dm: who === "dm", seat: SEATNO[who] ?? null, digest: j.digest, version: j.version, status: j.status } } }, who)
        return send(answer(x, (j.version < x.version || j.full) ? { world: x } : {}))
      }
      const c = OWL.cleanPatch(j.patch, who)
      if (c.error) return send({ error: c.error }, 400)
      const refused = []
      if (c.patch.heroes) for (const [s, h] of Object.entries(c.patch.heroes)) if (!OWL.mayWriteHero(h, who, who === "dm", w.seats, Date.now())) { refused.push(s); delete c.patch.heroes[s] }
      return send(answer(apply(c.patch, who), refused.length ? { refused } : {}))
    }
    if (p.startsWith("/api/")) return send({})
    let f = join(ROOT, p === "/" ? "velkynvelve-walk/index.html" : p)
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, "index.html")
    if (!existsSync(f)) { res.writeHead(404); return res.end() }
    res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" }); res.end(readFileSync(f))
  })
  await new Promise((r) => server.listen(port, r))
  async function screen(cid, name) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 760 } })
    await c.addInitScript(([id]) => { localStorage.setItem("aop_character_id", id); localStorage.setItem("aop_claim_token", "tok"); localStorage.setItem("vk-music", "off") }, [cid])
    const pg = await c.newPage(); pg.who = name; pages.push(c)
    pg.on("pageerror", (e) => console.log(`[${name} pageerror]`, String(e.stack || e).slice(0, 500)))
    await c.route(/supabase\.co|jsdelivr|fonts\.g/, (r) => r.abort())
    await pg.goto(`http://localhost:${port}/velkynvelve-walk/index.html?oneworld=1`)
    await pg.waitForFunction(() => typeof mode !== "undefined" && mode === "explore" && typeof OW !== "undefined" && OW.on, null, { timeout: 60000 })
    await pg.evaluate(() => { for (const n of npcs) n.talk = false })
    return pg
  }
  return { screen, world: () => w, away: (cid, on) => { on ? away.add(cid) : away.delete(cid) }, apply: (patch) => apply(OWL.cleanPatch(patch, "dm").patch, "dm"),
    close: async () => { for (const c of pages) await c.close().catch(() => {}); await new Promise((r) => server.close(r)) } }
}

const W = await world(4311)
const A = await W.screen(ONE, "A"), B = await W.screen(TWO, "B")
await wait(9000)   // both screens beat and settle in step
const st = (pg) => pg.evaluate(() => ({ status: OW.status, cur: String(cur), mode, gathering: GATHER.hold, voyage: !$("voyage").hidden, waitFor: gatherWaitingFor().map((w) => w.name + ":" + w.why), dots: [...document.querySelectorAll("#owLight .ow-dots i")].map((i) => i.dataset.s) }))
let fails = 0; const check = (ok, what) => { console.log((ok ? "PASS " : "FAIL ") + what); if (!ok) fails++ }
console.log("A", JSON.stringify(await st(A))); console.log("B", JSON.stringify(await st(B)))
check((await st(A)).dots.length === 1, "A shows one dot for the other screen")

// 1. in step: the move goes at once
const exitOf = (pg) => pg.evaluate(() => { const z = node.zones.find((z) => z.to && z.to.length && SPEC[z.to[0]] && !z.climb && z.kind !== "water"); return z ? { to: String(z.to[0]) } : null })
const ex = await exitOf(A)
check(!!ex, "plate 11 has an exit to walk through")
await A.evaluate(() => { const z = node.zones.find((z) => z.to && z.to.length && SPEC[z.to[0]] && !z.climb && z.kind !== "water"); travel(z.to[0], z) })
await wait(400)
const s1 = await st(A)
check(!s1.voyage && (s1.mode === "travel" || s1.cur === ex.to), `in step: the move went at once (mode ${s1.mode}, plate ${s1.cur})`)
await wait(6000)
check((await st(A)).cur === ex.to && (await st(B)).cur === ex.to, `both screens followed to ${ex.to}`)

// 2. B goes quiet: the move back waits
W.away(TWO, true); await wait(14000)
const s2pre = await st(A); console.log("A while B away", JSON.stringify(s2pre))
await A.evaluate(() => { const z = node.zones.find((z) => z.to && z.to.length && SPEC[z.to[0]] && !z.climb && z.kind !== "water"); travel(z.to[0], z) })
await wait(800)
const s2 = await st(A)
check(s2.voyage && s2.gathering && s2.cur === ex.to, `B away: A waits on the voyage card (${s2.waitFor.join(", ")})`)
const sub = await A.evaluate(() => $("voySub").textContent); console.log("   card says:", sub)
await A.screenshot({ path: "/tmp/gather-wait.png" })
const x0 = await A.evaluate(() => [leader.x, leader.y]); await A.keyboard.down("ArrowLeft"); await wait(700); await A.keyboard.up("ArrowLeft")
const x1 = await A.evaluate(() => [leader.x, leader.y]); check(x0[0] === x1[0] && x0[1] === x1[1], "while gathering, the world on A stands still")
W.away(TWO, false); await wait(11000)
const s3 = await st(A)
check(!s3.gathering && s3.cur !== ex.to, `B back in step: the move went (A now on ${s3.cur})`)

// 3. a fight while B is away waits too (a fresh table, in the pen, where the guards are)
await W.close()
const W2 = await world(4313)
const A2 = await W2.screen(ONE, "A2"), B2 = await W2.screen(TWO, "B2")
await wait(9000); W2.away(TWO, true); await wait(14000)
await A2.evaluate(() => { startCombat([npcs.find((n) => /drow-guard|jorlan/.test(n.id)) || npcs[0]], "Test fight") })
await wait(1200)
const s4 = await st(A2); check(s4.gathering && s4.mode === "explore" && s4.voyage, "B away: the fight waits on the voyage card")
await A2.screenshot({ path: "/tmp/gather-fight.png" })
// 4. after 20 s the waiting screen may go without them
check(await A2.evaluate(() => $("voyGo").hidden), "no Go-without-them button before 20 s")
await wait(20500)
check(!(await A2.evaluate(() => $("voyGo").hidden)), "Go-without-them shows after 20 s")
await A2.click("#voyGo"); await wait(1500)
await wait(4000)
const s5 = await st(A2); check(!s5.gathering && (s5.mode === "combat" || /^battle/.test(s5.cur)), `going without them opens the fight (mode ${s5.mode}, plate ${s5.cur}: the pen's fights cut to the battle screen)`)
const log = await A2.evaluate(() => RLOG.lines.filter((l) => l.kind === "sync").map((l) => l.text)); console.log("sync log:", JSON.stringify(log.slice(-6)))
await W2.close(); await browser.close()
console.log(fails ? `${fails} FAILED` : "ALL PASS"); process.exit(fails ? 1 : 0)
